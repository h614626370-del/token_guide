import { createEventStream, defineEventHandler } from 'h3'
import { apiError } from '../../utils/api'
import { getGuideConfig } from '../../utils/config'
import {
  openPlaygroundUpstreamStream,
  PlaygroundStreamError,
  relayPlaygroundUpstreamEvents,
  resolvePlaygroundCredential,
  textPlaygroundSchema,
} from '../../utils/playground'
import { readLimitedJson } from '../../utils/request-body'

export default defineEventHandler(async (event) => {
  const parsed = textPlaygroundSchema.safeParse(await readLimitedJson(event, 128 * 1024))
  if (!parsed.success) apiError(400, 'INVALID_PLAYGROUND_REQUEST', 'Text request is invalid.', parsed.error.flatten())

  const config = getGuideConfig(event)
  const apiKey = await resolvePlaygroundCredential(event, parsed.data.credential)
  const upstream = await openPlaygroundUpstreamStream(
    event,
    apiKey,
    parsed.data.request,
    Number(config.playgroundTextTimeoutMs || 120_000),
  )
  const stream = createEventStream(event)
  stream.onClosed(() => upstream.close())

  void (async () => {
    try {
      await relayPlaygroundUpstreamEvents(
        upstream.response,
        apiKey,
        8 * 1024 * 1024,
        (eventName, data) => stream.push({ event: eventName, data }),
      )
      await stream.push({
        event: 'guide.done',
        data: JSON.stringify({ duration_ms: Date.now() - upstream.startedAt }),
      })
    } catch (error) {
      if (!upstream.signal.aborted || upstream.timedOut()) {
        const code = error instanceof PlaygroundStreamError ? error.code : (upstream.timedOut() ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_STREAM_FAILED')
        const message = upstream.timedOut()
          ? 'The model request timed out.'
          : (error instanceof Error ? error.message : 'The model stream ended unexpectedly.')
        await stream.push({ event: 'guide.error', data: JSON.stringify({ code, message }) })
      }
    } finally {
      upstream.close()
      await stream.close()
    }
  })()

  return stream.send()
})
