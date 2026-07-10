import crypto from 'node:crypto'
import { fail } from './responses.js'

function tokenFromRequest(request) {
  const auth = request.headers.authorization
  if (auth && /^bearer\s+/i.test(auth)) {
    return auth.replace(/^bearer\s+/i, '').trim()
  }
  const headerToken = request.headers['x-admin-token']
  return headerToken ? String(headerToken).trim() : ''
}

function safeEqual(a, b) {
  const left = Buffer.from(a || '')
  const right = Buffer.from(b || '')
  if (left.length !== right.length) return false
  return crypto.timingSafeEqual(left, right)
}

export function requireAdmin(config) {
  return async function adminAuth(request, reply) {
    const token = tokenFromRequest(request)
    if (!token || !safeEqual(token, config.adminToken)) {
      return fail(reply, 401, 'UNAUTHORIZED', 'Admin token is missing or invalid.')
    }
  }
}
