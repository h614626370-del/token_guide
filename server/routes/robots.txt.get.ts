import { defineEventHandler, setHeader } from 'h3'
import { getPublicRequestOrigin } from '../utils/request-url'
import { getPublicSiteConfig } from '../utils/site-config'

export default defineEventHandler((event) => {
  const requestOrigin = getPublicRequestOrigin(event)
  const site = getPublicSiteConfig(event)
  const mainOrigin = new URL(site.main_site_url).origin
  const isMainSite = requestOrigin === mainOrigin
  const disallowed = isMainSite
    ? ['/admin/', '/api/', '/auth/', '/dashboard', '/keys']
    : ['/admin/', '/api/', '/auth/', '/site-home/']

  setHeader(event, 'content-type', 'text/plain; charset=utf-8')
  setHeader(event, 'cache-control', 'public, max-age=600')
  return [
    'User-agent: *',
    'Allow: /',
    ...disallowed.map(path => `Disallow: ${path}`),
    '',
    `Sitemap: ${requestOrigin}/sitemap.xml`,
    '',
  ].join('\n')
})
