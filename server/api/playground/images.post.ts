import { defineEventHandler } from 'h3'
import { apiError, apiOk } from '../../utils/api'
import { getGuideConfig } from '../../utils/config'
import {
  callPlaygroundUpstream,
  imagePlaygroundSchema,
  resolvePlaygroundCredential,
} from '../../utils/playground'
import { readLimitedJson } from '../../utils/request-body'

export default defineEventHandler(async (event) => {
  const parsed = imagePlaygroundSchema.safeParse(await readLimitedJson(event, 64 * 1024))
  if (!parsed.success) apiError(400, 'INVALID_PLAYGROUND_REQUEST', 'Image request is invalid.', parsed.error.flatten())

  const config = getGuideConfig(event)
  const apiKey = await resolvePlaygroundCredential(event, parsed.data.credential)
  const result = await callPlaygroundUpstream(
    event,
    '/v1/images/generations',
    apiKey,
    parsed.data.request,
    Number(config.playgroundImageTimeoutMs || 300_000),
    48 * 1024 * 1024,
  )
  return apiOk(result.payload, { duration_ms: result.durationMs })
})
