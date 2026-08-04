import type { H3Event } from 'h3'
import { getRequestHeader, getRequestURL } from 'h3'
import { requestComesFromTrustedProxy } from './client-ip'
import { getGuideConfig } from './config'

function firstForwardedValue(value: string | undefined) {
  return String(value || '').split(',', 1)[0]?.trim() || ''
}

function validOrigin(protocol: string, host: string) {
  if (protocol !== 'http:' && protocol !== 'https:') return ''
  try {
    const url = new URL(`${protocol}//${host}`)
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return ''
    return url.origin
  } catch {
    return ''
  }
}

export function getPublicRequestOrigin(event?: H3Event) {
  const fallback = new URL(getGuideConfig(event).siteUrl).origin
  if (!event) return fallback

  const requestUrl = getRequestURL(event)
  let protocol = requestUrl.protocol
  let host = requestUrl.host

  if (requestComesFromTrustedProxy(event)) {
    const forwardedProtocol = firstForwardedValue(getRequestHeader(event, 'x-forwarded-proto'))
    const forwardedHost = firstForwardedValue(getRequestHeader(event, 'x-forwarded-host'))
    if (forwardedProtocol === 'http' || forwardedProtocol === 'https') protocol = `${forwardedProtocol}:`
    if (forwardedHost) host = forwardedHost
  }

  return validOrigin(protocol, host) || fallback
}

export function rebasePublicUploadUrl(value: string, origin: string) {
  try {
    const url = new URL(value)
    if (!/^\/uploads\/[0-9]{14}-[a-z0-9-]{1,32}-[a-f0-9]{10}\.(png|jpg|webp|gif)$/.test(url.pathname)) return value
    return new URL(url.pathname, `${origin}/`).toString()
  } catch {
    return value
  }
}
