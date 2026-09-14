import { createEventStream, defineEventHandler } from 'h3'
import { z } from 'zod'
import { apiError } from '../../../utils/api'
import { runOpenAIAccountTests, sanitizeAccount } from '../../../domain/account-tests/service'
import { usePricingService } from '../../../utils/pricing'
import { getGuideConfig } from '../../../utils/config'
import { requireAdminSession } from '../../../utils/session'
import { readLimitedJson } from '../../../utils/request-body'

const requestSchema = z.object({
  model_id: z.string().trim().min(1).max(120),
  prompt: z.string().trim().min(1).max(100_000),
}).strict()

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const parsed = requestSchema.safeParse(await readLimitedJson(event, 128 * 1024))
  if (!parsed.success) apiError(400, 'INVALID_ACCOUNT_TEST_REQUEST', '批量账号测试参数无效。', parsed.error.flatten())
  const input = parsed.data

  const client = usePricingService().getSub2apiClient()
  if (!client.configured) apiError(503, 'SUB2API_NOT_CONFIGURED', 'Sub2API 管理接口尚未配置。')

  let accounts
  try {
    accounts = (await client.listAccountsAll({ provider: 'openai', status: 'active' }))
      .map(sanitizeAccount)
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
  } catch {
    apiError(502, 'SUB2API_ACCOUNTS_UNAVAILABLE', '无法读取 Sub2API 的 OpenAI 账号列表。')
  }

  const stream = createEventStream(event)
  let closed = false
  const batchController = new AbortController()
  stream.onClosed(() => {
    closed = true
    batchController.abort()
  })

  void (async () => {
    try {
      const emit = async (item: { event: string; data: Record<string, unknown> }) => {
        if (closed) return
        await stream.push({ event: item.event, data: JSON.stringify(item.data) })
      }
      await emit({
        event: 'batch.start',
        data: {
          total: accounts.length,
          model_id: input.model_id,
        },
      })
      const counts = await runOpenAIAccountTests({
        client,
        accounts,
        modelId: input.model_id,
        prompt: input.prompt,
        timeoutMs: Number(getGuideConfig(event).playgroundTextTimeoutMs || 120_000),
        emit,
        signal: batchController.signal,
      })
      await emit({ event: 'batch.complete', data: counts })
    } catch (error) {
      if (!closed) {
        await stream.push({
          event: 'batch.error',
          data: JSON.stringify({ error: error instanceof Error ? error.message : '批量测试失败。' }),
        })
      }
    } finally {
      await stream.close()
    }
  })()

  return stream.send()
})
