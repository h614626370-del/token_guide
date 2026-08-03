import { defineEventHandler, getMethod, getRequestHeader, getRequestURL } from 'h3'
import { apiError } from '../utils/api'
import { getGuideConfig } from '../utils/config'

const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS'])

export default defineEventHandler((event) => {
  if (safeMethods.has(getMethod(event))) return
  const path = getRequestURL(event).pathname
  if (!path.startsWith('/api/')) return

  const origin = getRequestHeader(event, 'origin')
  if (!origin) return

  const allowed = new Set([getRequestURL(event).origin, new URL(getGuideConfig(event).siteUrl).origin])
  if (!allowed.has(origin)) {
    apiError(403, 'ORIGIN_NOT_ALLOWED', 'Request origin is not allowed.')
  }
})
