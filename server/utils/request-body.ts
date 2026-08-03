import type { H3Event } from 'h3'
import { getRequestHeader, readRawBody } from 'h3'
import { apiError } from './api'

export async function readLimitedJson(event: H3Event, maxBytes: number) {
  const contentLength = Number(getRequestHeader(event, 'content-length') || 0)
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    apiError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.')
  }

  const raw = await readRawBody(event, 'utf8')
  if (!raw) apiError(400, 'BODY_REQUIRED', 'A JSON request body is required.')
  if (Buffer.byteLength(raw, 'utf8') > maxBytes) {
    apiError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.')
  }

  try {
    return JSON.parse(raw)
  } catch {
    apiError(400, 'INVALID_JSON', 'Request body must be valid JSON.')
  }
}
