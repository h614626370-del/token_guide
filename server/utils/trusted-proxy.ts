import type { H3Event } from 'h3'
import { getRequestIP } from 'h3'

export function requestComesFromTrustedProxy(event: H3Event) {
  const directIp = normalizeIp(getRequestIP(event) || '')
  if (!directIp) return false

  const runtime = useRuntimeConfig(event)
  const trusted = String(runtime.trustedProxyIps || '127.0.0.1,::1')
    .split(',')
    .map(normalizeIp)
    .filter(Boolean)
  return trusted.includes(directIp)
}

export function normalizeIp(value: string) {
  const ip = String(value || '').trim()
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip
}
