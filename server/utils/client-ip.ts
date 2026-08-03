import type { H3Event } from 'h3'
import { getRequestIP } from 'h3'
import { getGuideConfig } from './config'

export function getTrustedClientIp(event: H3Event) {
  const directIp = normalizeIp(getRequestIP(event) || '')
  if (!directIp) return ''

  const trusted = getGuideConfig(event).trustedProxyIps.map(normalizeIp)
  if (!trusted.includes(directIp)) return directIp
  return normalizeIp(getRequestIP(event, { xForwardedFor: true }) || directIp)
}

function normalizeIp(value: string) {
  const ip = String(value || '').trim()
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip
}
