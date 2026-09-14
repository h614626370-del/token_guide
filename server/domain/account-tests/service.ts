import { SseDecoder } from '#shared/utils/sse'

export interface AccountTestAccount {
  id: number
  name: string
  status: string
  type: string
  schedulable: boolean
}

export interface AccountTestEvent {
  event: string
  data: Record<string, unknown>
}

interface AccountTestClient {
  testAccountStream(accountId: number, body: Record<string, string>, options?: { signal?: AbortSignal }): Promise<Response>
}

interface AccountTestRunOptions {
  client: AccountTestClient
  accounts: AccountTestAccount[]
  modelId: string
  prompt: string
  timeoutMs: number
  emit: (event: AccountTestEvent) => Promise<void>
  signal?: AbortSignal
}

const maxAccountResponseBytes = 8 * 1024 * 1024

export async function runOpenAIAccountTests(options: AccountTestRunOptions) {
  const { accounts, client, modelId, prompt, timeoutMs, emit, signal } = options
  const counts = { total: accounts.length, succeeded: 0, failed: 0 }

  await Promise.all(accounts.map(async (account) => {
    const startedAt = Date.now()
    let answer = ''
    let success = false
    let error = ''
    let controller: AbortController | undefined
    let timeout: ReturnType<typeof setTimeout> | undefined
    let abort: (() => void) | undefined

    await emit({ event: 'account.start', data: accountPayload(account) })

    try {
      if (signal?.aborted) throw new Error('测试已中止。')
      controller = new AbortController()
      abort = () => controller?.abort()
      signal?.addEventListener('abort', abort, { once: true })
      timeout = setTimeout(() => controller?.abort(), timeoutMs)

      const response = await client.testAccountStream(account.id, {
        model_id: modelId,
        prompt,
        mode: 'default',
      }, { signal: controller.signal })

      if (!response.body) throw new Error('Sub2API 返回了空响应流。')
      const reader = response.body.getReader()
      const decoder = new SseDecoder()
      let receivedBytes = 0

      const handleEvents = async (events: ReturnType<SseDecoder['push']>) => {
        for (const message of events) {
          const payload = parsePayload(message.data)
          if (!payload) continue
          const type = String(payload.type || '')
          if (type === 'content' && typeof payload.text === 'string') {
            answer += payload.text
            await emit({ event: 'account.delta', data: { account_id: account.id, text: payload.text } })
          } else if (type === 'status' && typeof payload.text === 'string') {
            await emit({ event: 'account.status', data: { account_id: account.id, text: payload.text } })
          } else if (type === 'error') {
            throw new Error(String(payload.error || '账号测试失败。'))
          } else if (type === 'test_complete') {
            success = payload.success === true
            if (!success && typeof payload.error === 'string') error = payload.error
          }
        }
      }

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          receivedBytes += value.byteLength
          if (receivedBytes > maxAccountResponseBytes) {
            await reader.cancel()
            throw new Error('账号响应超过大小限制。')
          }
          await handleEvents(decoder.push(value))
        }
        await handleEvents(decoder.finish())
      } finally {
        reader.releaseLock()
      }

      if (!success) throw new Error(error || answer || '账号测试未返回成功结果。')
    } catch (cause) {
      if (signal?.aborted) {
        error = '测试已中止。'
      } else if (controller?.signal.aborted && timeout) {
        error = '账号测试超时。'
      } else {
        error = cause instanceof Error ? cause.message : '账号测试失败。'
      }
    } finally {
      if (timeout) clearTimeout(timeout)
      if (signal && abort) signal.removeEventListener('abort', abort)
      counts[error ? 'failed' : 'succeeded'] += 1
      await emit({
        event: 'account.complete',
        data: {
          ...accountPayload(account),
          success: !error,
          answer,
          error: error || undefined,
          latency_ms: Date.now() - startedAt,
        },
      })
    }
  }))

  return counts
}

export function sanitizeAccount(value: any): AccountTestAccount | null {
  const id = Number(value?.id)
  if (!Number.isInteger(id) || id <= 0) return null
  return {
    id,
    name: String(value?.name || value?.account_name || `Account ${id}`),
    status: String(value?.status || 'active'),
    type: String(value?.type || value?.account_type || ''),
    schedulable: value?.schedulable !== false,
  }
}

function accountPayload(account: AccountTestAccount) {
  return {
    account_id: account.id,
    name: account.name,
    status: account.status,
    type: account.type,
    schedulable: account.schedulable,
  }
}

function parsePayload(value: string): Record<string, any> | null {
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}
