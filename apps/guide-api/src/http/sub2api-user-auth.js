import { fail } from './responses.js'

export function requireGuideUser({ db, config, logger }) {
  return async function guideUserAuth(request, reply) {
    const token = bearerTokenFromRequest(request)
    if (!token) {
      return fail(reply, 401, 'LOGIN_REQUIRED', 'Please log in before using feedback.')
    }

    const apiBase = resolveSub2apiApiBase(db, config)
    if (!apiBase) {
      return fail(reply, 503, 'AUTH_SOURCE_UNCONFIGURED', 'Sub2API auth source is not configured.')
    }

    try {
      const user = await fetchCurrentUser(apiBase, token, config.pricingFetchTimeoutMs)
      if (!user?.id) {
        return fail(reply, 401, 'LOGIN_REQUIRED', 'Please log in before using feedback.')
      }
      request.guideUser = user
    } catch (error) {
      logger?.warn({ err: error }, 'failed to validate sub2api user token')
      return fail(reply, 401, 'LOGIN_REQUIRED', 'Please log in before using feedback.')
    }
  }
}

function bearerTokenFromRequest(request) {
  const auth = request.headers.authorization
  if (!auth || !/^bearer\s+/i.test(String(auth))) return ''
  return String(auth).replace(/^bearer\s+/i, '').trim()
}

function resolveSub2apiApiBase(db, config) {
  const runtimeBase = readRuntimeSub2apiBase(db)
  return normalizeSub2apiBase(runtimeBase || config.sub2apiApiBase || config.publicOrigin)
}

function readRuntimeSub2apiBase(db) {
  try {
    const row = db.prepare('SELECT value FROM pricing_runtime_settings WHERE key = ?').get('sub2api_base_url')
    return row?.value || ''
  } catch {
    return ''
  }
}

function normalizeSub2apiBase(value) {
  const raw = String(value || '').trim().replace(/\/+$/, '')
  if (!raw) return ''
  return raw.endsWith('/api/v1') ? raw : `${raw}/api/v1`
}

async function fetchCurrentUser(apiBase, token, timeoutMs) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(`${apiBase}/auth/me`, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${token}`,
      },
      signal: controller.signal,
    })
    const text = await response.text()
    const body = text ? JSON.parse(text) : null
    if (!response.ok) return null
    return normalizeUser(unwrapSub2apiResponse(body))
  } finally {
    clearTimeout(timeout)
  }
}

function unwrapSub2apiResponse(body) {
  if (body && typeof body === 'object') {
    if ('code' in body) {
      if (body.code === 0) return body.data
      return null
    }
    if (body.ok === true && 'data' in body) return body.data
  }
  return body
}

function normalizeUser(user) {
  if (!user || typeof user !== 'object') return null
  const id = user.id ?? user.user_id
  if (id == null || id === '') return null
  return {
    id: String(id),
    email: stringOrEmpty(user.email),
    username: stringOrEmpty(user.username || user.name || user.display_name),
    role: stringOrEmpty(user.role),
  }
}

function stringOrEmpty(value) {
  return value == null ? '' : String(value)
}
