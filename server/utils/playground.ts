import type { H3Event } from 'h3'
import { getRequestHeader } from 'h3'
import { z } from 'zod'
import { apiError } from './api'
import { getGuideConfig } from './config'
import { requireUserSession } from './session'
import { getTrustedClientIp } from './client-ip'
import { usePricingService } from './pricing'
import { SseDecoder } from '#shared/utils/sse'

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
    stream: z.literal(true).optional(),
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

export interface GroupModelListSource {
  model_policy?: GroupModelPolicy | null
}

export interface GroupModelPolicy {
  mode: 'allowlist' | 'unrestricted' | 'unknown'
  models: string[]
}

export async function listMaskedPlaygroundKeys(event: H3Event) {
  const { accessToken } = await requireUserSession(event)
  const payload = await fetchSub2Json(event, '/keys?page=1&page_size=100', accessToken, 2 * 1024 * 1024)
  const source = await usePricingService().listSource()
  return normalizeKeyList(payload)
    .filter(item => item.status === 'active' && item.key)
    .map((item) => {
      const groupId = item.group_id ?? item.group?.id ?? null
      const platform = normalizePlatform(item.group?.platform)
      return {
        id: item.id,
        name: item.name || `Key ${item.id}`,
        status: item.status,
        masked_key: maskKey(item.key),
        group_id: groupId,
        group: item.group
          ? {
              id: item.group.id ?? groupId,
              name: item.group.name || '',
              platform,
              model_policy: resolveGroupModelPolicy(source?.groups, groupId, platform),
            }
          : null,
      }
    })
}

export function selectModelForGroup(
  configuredModel: string,
  group?: GroupModelListSource | null,
  options: { hasGroupOverride?: boolean } = {},
) {
  const fallback = String(configuredModel || '').trim()
  const policy = group?.model_policy
  if (policy?.mode !== 'allowlist') {
    const policyMode = policy?.mode || 'unknown'
    return {
      model: fallback,
      source: options.hasGroupOverride ? 'installer_group' as const : 'installer_default' as const,
      allowed_models: [],
      policy_mode: policyMode as 'unrestricted' | 'unknown',
    }
  }

  const models = normalizeGroupModelNames(policy.models)
  if (!models.length) {
    return {
      model: fallback,
      source: options.hasGroupOverride ? 'installer_group' as const : 'installer_default' as const,
      allowed_models: [],
      policy_mode: 'unknown' as const,
    }
  }
  const configured = models.find(item => item.toLowerCase() === fallback.toLowerCase())
  return {
    model: configured || models[0],
    source: 'group_allowlist' as const,
    allowed_models: models,
    policy_mode: 'allowlist' as const,
  }
}

export async function resolvePlaygroundCredential(
  event: H3Event,
  credential: z.infer<typeof credentialSchema>,
  expectedGroupId?: number | null,
) {
  const { accessToken } = await requireUserSession(event)
  if (credential.type === 'custom') return credential.value

  const payload = await fetchSub2Json(event, `/keys/${credential.id}`, accessToken, 512 * 1024)
  const item = unwrapSub2(payload) as Sub2Key | null
  if (!item || Number(item.id) !== credential.id || item.status !== 'active' || !item.key) {
    apiError(404, 'PLAYGROUND_KEY_NOT_FOUND', 'The selected API key is unavailable.')
  }
  if (expectedGroupId != null && String(item.group_id ?? '') !== String(expectedGroupId)) {
    apiError(409, 'PLAYGROUND_KEY_GROUP_CHANGED', 'The selected API key group changed. Refresh the key list and try again.')
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
      apiError(response.status, 'UPSTREAM_REQUEST_FAILED', redactSecretText(extractMessage(payload, `Upstream HTTP ${response.status}`), [apiKey]), {
        upstream_status: response.status,
        upstream: redactSecrets(payload, 0, [apiKey]),
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

export class PlaygroundStreamError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'PlaygroundStreamError'
  }
}

export async function openPlaygroundUpstreamStream(
  event: H3Event,
  apiKey: string,
  body: Record<string, unknown>,
  timeoutMs: number,
) {
  const config = getGuideConfig(event)
  const controller = new AbortController()
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const startedAt = Date.now()

  try {
    const response = await fetch(`${config.sub2apiOrigin}/v1/responses`, {
      method: 'POST',
      headers: {
        accept: 'text/event-stream',
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        ...forwardedRequestHeaders(event),
      },
      body: JSON.stringify({ ...body, stream: true }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const payload = await readLimitedResponse(response, 8 * 1024 * 1024)
      apiError(
        response.status,
        'UPSTREAM_REQUEST_FAILED',
        redactSecretText(extractMessage(payload, `Upstream HTTP ${response.status}`), [apiKey]),
        {
          upstream_status: response.status,
          upstream: redactSecrets(payload, 0, [apiKey]),
        },
      )
    }

    let closed = false
    return {
      response,
      signal: controller.signal,
      startedAt,
      timedOut: () => timedOut,
      close() {
        if (closed) return
        closed = true
        clearTimeout(timeout)
        if (!controller.signal.aborted) controller.abort()
      },
    }
  } catch (error) {
    clearTimeout(timeout)
    if (isApiError(error)) throw error
    if (timedOut) apiError(504, 'UPSTREAM_TIMEOUT', 'The model request timed out.')
    apiError(502, 'UPSTREAM_UNAVAILABLE', 'The model service is temporarily unavailable.')
  }
}

export async function relayPlaygroundUpstreamEvents(
  response: Response,
  apiKey: string,
  maxResponseBytes: number,
  emit: (event: string, data: string) => Promise<void>,
) {
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.toLowerCase().includes('text/event-stream')) {
    const payload = await readLimitedResponse(response, maxResponseBytes)
    await emit('response.completed', redactSecretText(JSON.stringify(payload), [apiKey]))
    return
  }

  if (!response.body) {
    throw new PlaygroundStreamError('UPSTREAM_INVALID_RESPONSE', 'The model service returned an empty stream.')
  }

  const reader = response.body.getReader()
  const decoder = new SseDecoder()
  let receivedBytes = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      receivedBytes += value.byteLength
      if (receivedBytes > maxResponseBytes) {
        await reader.cancel()
        throw new PlaygroundStreamError('UPSTREAM_RESPONSE_TOO_LARGE', 'The model response is too large.')
      }
      for (const message of decoder.push(value)) {
        if (message.data === '[DONE]') continue
        await emit(sanitizeEventName(message.event), redactSecretText(message.data, [apiKey]))
      }
    }

    for (const message of decoder.finish()) {
      if (message.data === '[DONE]') continue
      await emit(sanitizeEventName(message.event), redactSecretText(message.data, [apiKey]))
    }
  } finally {
    reader.releaseLock()
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
  if (!response.body) return null
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > maxBytes) {
        await reader.cancel()
        apiError(502, 'UPSTREAM_RESPONSE_TOO_LARGE', 'The model response is too large.')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const buffer = Buffer.concat(chunks.map(chunk => Buffer.from(chunk)), totalBytes)
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

function resolveGroupModelPolicy(groups: unknown, groupId: number | null, platform: string): GroupModelPolicy {
  if (groupId == null || !platform || !Array.isArray(groups)) return { mode: 'unknown', models: [] }
  const group = groups.find((item) => {
    if (!item || typeof item !== 'object') return false
    const candidate = item as { source_id?: unknown, provider?: unknown }
    return String(candidate.source_id ?? '') === String(groupId)
      && normalizePlatform(candidate.provider) === platform
  }) as { model_list_enabled?: unknown, model_names?: unknown } | undefined

  if (!group) return { mode: 'unknown', models: [] }
  const models = normalizeGroupModelNames(group.model_names)
  return group.model_list_enabled && models.length
    ? { mode: 'allowlist', models }
    : { mode: 'unrestricted', models: [] }
}

function normalizeGroupModelNames(value: unknown) {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const output: string[] = []
  for (const item of value) {
    const model = String(item || '').trim()
    const key = model.toLowerCase()
    if (!model || seen.has(key)) continue
    seen.add(key)
    output.push(model)
  }
  return output
}

function normalizePlatform(value: unknown) {
  return String(value || '').trim().toLowerCase()
}

function isApiError(error: unknown) {
  return Boolean(error && typeof error === 'object' && 'statusCode' in error)
}

function redactSecrets(value: unknown, depth = 0, secrets: string[] = []): unknown {
  if (depth > 8) return '[truncated]'
  if (value === null || value === undefined) return value
  if (typeof value === 'string') return redactSecretText(value, secrets)
  if (Array.isArray(value)) return value.slice(0, 100).map(item => redactSecrets(item, depth + 1, secrets))
  if (typeof value !== 'object') return value

  const output: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    output[key] = /authorization|api[-_]?key|access[-_]?token|secret/i.test(key)
      ? '[redacted]'
      : redactSecrets(item, depth + 1, secrets)
  }
  return output
}

function redactSecretText(value: string, secrets: string[]) {
  return secrets
    .filter(secret => secret.length >= 8)
    .reduce((text, secret) => text.split(secret).join('[redacted]'), value)
}

function sanitizeEventName(value: string) {
  return value.replace(/[^a-zA-Z0-9_.-]/g, '').slice(0, 128) || 'message'
}
