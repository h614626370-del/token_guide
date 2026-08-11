import { describe, expect, it } from 'vitest'
import { SseDecoder } from '../shared/utils/sse'

describe('SSE decoder', () => {
  it('decodes events split across chunks and CRLF boundaries', () => {
    const decoder = new SseDecoder()
    const encoder = new TextEncoder()
    const events = [
      ...decoder.push(encoder.encode('event: response.output_text.delta\r')),
      ...decoder.push(encoder.encode('\ndata: {"delta":"Hel')),
      ...decoder.push(encoder.encode('lo"}\r\n\r')),
      ...decoder.push(encoder.encode('\nevent: guide.done\ndata: {"duration_ms":12}\n\n')),
      ...decoder.finish(),
    ]

    expect(events).toEqual([
      { event: 'response.output_text.delta', data: '{"delta":"Hello"}' },
      { event: 'guide.done', data: '{"duration_ms":12}' },
    ])
  })

  it('joins multiple data fields and ignores comments', () => {
    const decoder = new SseDecoder()
    const events = decoder.push(new TextEncoder().encode(': keepalive\ndata: first\ndata: second\n\n'))
    expect(events).toEqual([{ event: 'message', data: 'first\nsecond' }])
  })
})
