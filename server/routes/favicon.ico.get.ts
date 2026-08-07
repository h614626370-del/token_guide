import { defineEventHandler, sendRedirect, setHeader } from 'h3'
import { getPublicSiteConfig } from '../utils/site-config'
import { getPublicRequestOrigin } from '../utils/request-url'

export default defineEventHandler((event) => {
  setHeader(event, 'cache-control', 'no-cache, no-store, must-revalidate')
  return sendRedirect(event, sameOriginAssetUrl(getPublicSiteConfig(event).logo_path, event), 302)
})

function sameOriginAssetUrl(value: string, event: Parameters<typeof getPublicRequestOrigin>[0]) {
  try {
    const url = new URL(value)
    const requestOrigin = getPublicRequestOrigin(event)
    if (requestOrigin && url.origin === requestOrigin) {
      return `${url.pathname}${url.search}${url.hash}`
    }
    return value || '/logo-80.png'
  } catch {
    return value || '/logo-80.png'
  }
}
