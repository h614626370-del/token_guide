import { defineEventHandler } from 'h3'
import { apiError, apiOk } from '../../utils/api'
import { getGuideConfig } from '../../utils/config'
import {
  callPlaygroundUpstream,
  resolvePlaygroundCredential,
  textPlaygroundSchema,
} from '../../utils/playground'
import { readLimitedJson } from '../../utils/request-body'

export default defineEventHandler(async (event) => {
  const parsed = textPlaygroundSchema.safeParse(await readLimitedJson(event, 128 * 1024))
  if (!parsed.success) apiError(400, 'INVALID_PLAYGROUND_REQUEST', 'Text request is invalid.', parsed.error.flatten())

  const config = getGuideConfig(event)
  const apiKey = await resolvePlaygroundCredential(event, parsed.data.credential)
  const result = await callPlaygroundUpstream(
    event,
    '/v1/responses',
    apiKey,
    parsed.data.request,
    Number(config.playgroundTextTimeoutMs || 120_000),
    8 * 1024 * 1024,
  )
  return apiOk(result.payload, { duration_ms: result.durationMs })
})
