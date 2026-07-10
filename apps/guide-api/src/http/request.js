import crypto from 'node:crypto'

export function getClientIp(request, trustProxy) {
  if (trustProxy) {
    const forwarded = request.headers['x-forwarded-for']
    if (forwarded) {
      return String(forwarded).split(',')[0].trim()
    }
    const realIp = request.headers['x-real-ip']
    if (realIp) return String(realIp).trim()
  }
  return request.ip || request.socket?.remoteAddress || ''
}

export function hashIp(ip, salt) {
  if (!ip) return null
  return crypto.createHash('sha256').update(`${salt}:${ip}`).digest('hex')
}

export function getUserAgent(request) {
  const value = request.headers['user-agent']
  return value ? String(value).slice(0, 512) : null
}
