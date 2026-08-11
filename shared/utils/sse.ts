export interface ServerSentEvent {
  event: string
  data: string
}

export class SseDecoder {
  private readonly decoder = new TextDecoder()
  private buffer = ''

  push(chunk: Uint8Array) {
    this.buffer += this.decoder.decode(chunk, { stream: true })
    return this.takeEvents(false)
  }

  finish() {
    this.buffer += this.decoder.decode()
    return this.takeEvents(true)
  }

  private takeEvents(final: boolean) {
    this.buffer = normalizeNewlines(this.buffer, final)
    const events: ServerSentEvent[] = []
    let boundary = this.buffer.indexOf('\n\n')

    while (boundary >= 0) {
      const frame = this.buffer.slice(0, boundary)
      this.buffer = this.buffer.slice(boundary + 2)
      const event = parseSseFrame(frame)
      if (event) events.push(event)
      boundary = this.buffer.indexOf('\n\n')
    }

    if (final && this.buffer.trim()) {
      const event = parseSseFrame(this.buffer)
      if (event) events.push(event)
      this.buffer = ''
    }

    return events
  }
}

function normalizeNewlines(value: string, final: boolean) {
  const preserveTrailingCarriageReturn = !final && value.endsWith('\r')
  const content = preserveTrailingCarriageReturn ? value.slice(0, -1) : value
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  return preserveTrailingCarriageReturn ? `${normalized}\r` : normalized
}

function parseSseFrame(frame: string): ServerSentEvent | null {
  let event = 'message'
  const data: string[] = []

  for (const rawLine of frame.replace(/^\uFEFF/, '').split('\n')) {
    if (!rawLine || rawLine.startsWith(':')) continue
    const separator = rawLine.indexOf(':')
    const field = separator < 0 ? rawLine : rawLine.slice(0, separator)
    const rawValue = separator < 0 ? '' : rawLine.slice(separator + 1)
    const value = rawValue.startsWith(' ') ? rawValue.slice(1) : rawValue
    if (field === 'event') event = value || 'message'
    if (field === 'data') data.push(value)
  }

  return data.length ? { event, data: data.join('\n') } : null
}
