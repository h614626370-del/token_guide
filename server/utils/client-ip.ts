import type { H3Event } from 'h3'
import { getRequestIP } from 'h3'
import { getGuideConfig } from './config'
import { normalizeIp, requestComesFromTrustedProxy as isTrustedProxy } from './trusted-proxy'

export function getTrustedClientIp(event: H3Event) {
  const directIp = normalizeIp(getRequestIP(event) || '')
  if (!directIp) return ''

  if (!isTrustedProxy(event)) return directIp
  return normalizeIp(getRequestIP(event, { xForwardedFor: true }) || directIp)
}
