import { defineEventHandler, getRequestURL, setHeaders } from 'h3'
import { getGuideConfig } from '../utils/config'

export default defineEventHandler((event) => {
  const url = getRequestURL(event)
  const isEmbedEntry = url.pathname === '/auth/embed'
  const isTokenEntry = isEmbedEntry || ['/install', '/playground', '/pricing', '/feedback'].includes(url.pathname)
  const mainSiteOrigin = new URL(getGuideConfig(event).sub2apiOrigin).origin

  setHeaders(event, {
    'x-content-type-options': 'nosniff',
    'referrer-policy': isTokenEntry ? 'no-referrer' : 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    'cross-origin-resource-policy': 'same-site',
    'content-security-policy': [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      `frame-ancestors 'self' ${mainSiteOrigin}`,
      "form-action 'self'",
      "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "worker-src 'self' blob:",
    ].join('; '),
  })
})
