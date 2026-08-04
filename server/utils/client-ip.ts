import type { H3Event } from 'h3'
import { getRequestIP } from 'h3'
import { getGuideConfig } from './config'

export function getTrustedClientIp(event: H3Event) {
  const directIp = normalizeIp(getRequestIP(event) || '')
  if (!directIp) return ''

  if (!requestComesFromTrustedProxy(event)) return directIp
  return normalizeIp(getRequestIP(event, { xForwardedFor: true }) || directIp)
}

export function requestComesFromTrustedProxy(event: H3Event) {
  const directIp = normalizeIp(getRequestIP(event) || '')
  if (!directIp) return false
  return getGuideConfig(event).trustedProxyIps.map(normalizeIp).includes(directIp)
}

function normalizeIp(value: string) {
  const ip = String(value || '').trim()
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip
}
