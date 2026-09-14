import { describe, expect, it } from 'vitest'
import { runOpenAIAccountTests, sanitizeAccount } from '../server/domain/account-tests/service'

function streamResponse(frames: string[]) {
  const encoder = new TextEncoder()
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) controller.enqueue(encoder.encode(frame))
      controller.close()
    },
  }), { headers: { 'content-type': 'text/event-stream' } })
}

describe('account test service', () => {
  it('sanitizes account metadata without exposing credentials', () => {
    expect(sanitizeAccount({
      id: 7,
      name: 'Main OpenAI',
      status: 'active',
      type: 'oauth',
      schedulable: false,
      credentials: { access_token: 'secret' },
    })).toEqual({ id: 7, name: 'Main OpenAI', status: 'active', type: 'oauth', schedulable: false })
    expect(sanitizeAccount({ id: 'invalid' })).toBeNull()
  })

  it('runs all accounts concurrently and isolates one failed result', async () => {
    const events: Array<{ event: string, data: Record<string, unknown> }> = []
    const client = {
      async testAccountStream(id: number) {
        if (id === 2) throw new Error('upstream rejected')
        return streamResponse([
          'data: {"type":"test_start","model":"gpt-test"}\n\n',
          'data: {"type":"content","text":"hello"}\n\n',
          'data: {"type":"test_complete","success":true}\n\n',
        ])
      },
    }

    const counts = await runOpenAIAccountTests({
      client,
      accounts: [
        { id: 1, name: 'A', status: 'active', type: 'oauth', schedulable: true },
        { id: 2, name: 'B', status: 'active', type: 'oauth', schedulable: true },
      ],
      modelId: 'gpt-test',
      prompt: 'hello',
      timeoutMs: 1_000,
      emit: async event => { events.push(event) },
    })

    expect(counts).toEqual({ total: 2, succeeded: 1, failed: 1 })
    expect(events.find(item => item.event === 'account.delta' && item.data.account_id === 1)?.data.text).toBe('hello')
    expect(events.find(item => item.event === 'account.complete' && item.data.account_id === 1)?.data).toMatchObject({ success: true, answer: 'hello' })
    expect(events.find(item => item.event === 'account.complete' && item.data.account_id === 2)?.data).toMatchObject({ success: false, error: 'upstream rejected' })
  })
})
