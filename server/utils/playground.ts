import type { H3Event } from 'h3'
import { getRequestHeader } from 'h3'
import { z } from 'zod'
import { apiError } from './api'
import { getGuideConfig } from './config'
import { requireUserSession } from './session'
import { getTrustedClientIp } from './client-ip'

const credentialSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('saved'), id: z.coerce.number().int().positive() }).strict(),
  z.object({
    type: z.literal('custom'),
    value: z.string().trim().min(8).max(512),
  }).strict(),
])

const messageSchema = z.object({
  role: z.enum(['developer', 'system', 'user', 'assistant']),
  content: z.string().min(1).max(100_000),
}).strict()

export const textPlaygroundSchema = z.object({
  credential: credentialSchema,
  request: z.object({
    model: z.string().trim().min(1).max(120),
    input: z.union([
      z.string().min(1).max(100_000),
      z.array(messageSchema).min(1).max(32),
    ]),
    temperature: z.number().min(0).max(2).optional(),
    top_p: z.number().min(0).max(1).optional(),
    max_output_tokens: z.number().int().min(16).max(32_000).optional(),
    reasoning: z.object({ effort: z.enum(['none', 'minimal', 'low', 'medium', 'high', 'xhigh']) }).strict().optional(),
    text: z.object({ verbosity: z.enum(['low', 'medium', 'high']) }).strict().optional(),
    service_tier: z.enum(['auto', 'default', 'flex', 'priority']).optional(),
  }).strict(),
}).strict()

export const imagePlaygroundSchema = z.object({
  credential: credentialSchema,
  request: z.object({
    model: z.string().trim().min(1).max(120),
    prompt: z.string().trim().min(1).max(20_000),
    size: z.enum(['1024x1024', '1536x1024', '1024x1536']),
    quality: z.enum(['auto', 'medium', 'high']).optional(),
    background: z.enum(['auto', 'opaque', 'transparent']).optional(),
    output_format: z.enum(['png', 'jpeg', 'webp']).optional(),
    output_compression: z.number().int().min(0).max(100).optional(),
    moderation: z.enum(['auto', 'low']).optional(),
    n: z.literal(1).optional(),
    user: z.string().trim().max(128).optional(),
  }).strict(),
}).strict()

interface Sub2Key {
  id: number
  key: string
  name: string
  status: string
  group_id?: number | null
  group?: {
    id?: number
    name?: string
    platform?: string
  } | null
}

export async function listMaskedPlaygroundKeys(event: H3Event) {
  const { accessToken } = await requireUserSession(event)
  const payload = await fetchSub2Json(event, '/keys?page=1&page_size=100', accessToken, 2 * 1024 * 1024)
  return normalizeKeyList(payload)
    .filter(item => item.status === 'active' && item.key)
    .map(item => ({
      id: item.id,
      name: item.name || `Key ${item.id}`,
      status: item.status,
      masked_key: maskKey(item.key),
      group_id: item.group_id ?? null,
      group: item.group
        ? {
            id: item.group.id ?? null,
            name: item.group.name || '',
            platform: item.group.platform || '',
          }
        : null,
    }))
}

export async function resolvePlaygroundCredential(
  event: H3Event,
  credential: z.infer<typeof credentialSchema>,
) {
  const { accessToken } = await requireUserSession(event)
  if (credential.type === 'custom') return credential.value

  const payload = await fetchSub2Json(event, `/keys/${credential.id}`, accessToken, 512 * 1024)
  const item = unwrapSub2(payload) as Sub2Key | null
  if (!item || Number(item.id) !== credential.id || item.status !== 'active' || !item.key) {
    apiError(404, 'PLAYGROUND_KEY_NOT_FOUND', 'The selected API key is unavailable.')
  }
  return item.key
}

export async function callPlaygroundUpstream(
  event: H3Event,
  path: '/v1/responses' | '/v1/images/generations',
  apiKey: string,
  body: unknown,
  timeoutMs: number,
  maxResponseBytes: number,
) {
  const config = getGuideConfig(event)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  const startedAt = Date.now()

  try {
    const response = await fetch(`${config.sub2apiOrigin}${path}`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        ...forwardedRequestHeaders(event),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    const payload = await readLimitedResponse(response, maxResponseBytes)
    if (!response.ok) {
      apiError(response.status, 'UPSTREAM_REQUEST_FAILED', extractMessage(payload, `Upstream HTTP ${response.status}`), {
        upstream_status: response.status,
        upstream: redactSecrets(payload),
      })
    }
    return {
      payload,
      durationMs: Date.now() - startedAt,
    }
  } catch (error) {
    if (isApiError(error)) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      apiError(504, 'UPSTREAM_TIMEOUT', 'The model request timed out.')
    }
    apiError(502, 'UPSTREAM_UNAVAILABLE', 'The model service is temporarily unavailable.')
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchSub2Json(
  event: H3Event,
  path: string,
  accessToken: string,
  maxResponseBytes: number,
) {
  const config = getGuideConfig(event)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.pricingFetchTimeoutMs)
  try {
    const response = await fetch(`${config.sub2apiApiBase}${path}`, {
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${accessToken}`,
        ...forwardedRequestHeaders(event),
      },
      signal: controller.signal,
    })
    const payload = await readLimitedResponse(response, maxResponseBytes)
    if (!response.ok) {
      apiError(response.status === 401 ? 401 : 502, 'SUB2API_REQUEST_FAILED', 'Unable to read account API keys.')
    }
    const unwrapped = unwrapSub2(payload)
    if (unwrapped === null) apiError(502, 'SUB2API_INVALID_RESPONSE', 'The account service returned an invalid response.')
    return payload
  } catch (error) {
    if (isApiError(error)) throw error
    apiError(502, 'SUB2API_UNAVAILABLE', 'The account service is temporarily unavailable.')
  } finally {
    clearTimeout(timeout)
  }
}

function forwardedRequestHeaders(event: H3Event) {
  const ip = getTrustedClientIp(event)
  return {
    'user-agent': getRequestHeader(event, 'user-agent') || 'kkflow-guide',
    ...(ip ? { 'x-forwarded-for': ip, 'x-real-ip': ip } : {}),
  }
}

async function readLimitedResponse(response: Response, maxBytes: number) {
  const contentLength = Number(response.headers.get('content-length') || 0)
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    apiError(502, 'UPSTREAM_RESPONSE_TOO_LARGE', 'The model response is too large.')
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.byteLength > maxBytes) {
    apiError(502, 'UPSTREAM_RESPONSE_TOO_LARGE', 'The model response is too large.')
  }
  if (!buffer.byteLength) return null
  const text = buffer.toString('utf8')
  try {
    return JSON.parse(text)
  } catch {
    return { message: text.slice(0, 4000) }
  }
}

function unwrapSub2(payload: any) {
  if (!payload || typeof payload !== 'object') return payload ?? null
  if ('code' in payload) return payload.code === 0 ? payload.data : null
  if (payload.ok === true && 'data' in payload) return payload.data
  return payload
}

function normalizeKeyList(payload: any): Sub2Key[] {
  const value = unwrapSub2(payload)
  if (Array.isArray(value)) return value
  if (Array.isArray(value?.items)) return value.items
  if (Array.isArray(value?.data)) return value.data
  return []
}

function maskKey(value: string) {
  if (value.length <= 12) return `${value.slice(0, 4)}...`
  return `${value.slice(0, 7)}...${value.slice(-4)}`
}

function extractMessage(payload: any, fallback: string) {
  if (typeof payload?.error?.message === 'string') return payload.error.message
  if (typeof payload?.message === 'string') return payload.message
  if (typeof payload?.error === 'string') return payload.error
  return fallback
}

function isApiError(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'statusCode' in error)
}

function redactSecrets(value: unknown, depth = 0): unknown {
  if (depth > 8 || value === null || value === undefined) return value
  if (Array.isArray(value)) return value.slice(0, 100).map(item => redactSecrets(item, depth + 1))
  if (typeof value !== 'object') return value

  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    output[key] = /authorization|api[-_]?key|access[-_]?token|secret/i.test(key)
      ? '[redacted]'
      : redactSecrets(item, depth + 1)
  }
  return output
}
