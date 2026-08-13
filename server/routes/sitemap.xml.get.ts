import { defineEventHandler, setHeader } from 'h3'
import { getPublicRequestOrigin } from '../utils/request-url'
import { getPublicSiteConfig } from '../utils/site-config'
import { listPublishedCommunityPaths } from '../domain/community/service'

const guidePaths = [
  '/',
  '/member',
  '/integration',
  '/install',
  '/playground',
  '/pricing',
  '/community',
  '/community/tools',
  '/community/skills',
  '/community/mcp',
  '/feedback',
]

export default defineEventHandler((event) => {
  const requestOrigin = getPublicRequestOrigin(event)
  const site = getPublicSiteConfig(event)
  const mainOrigin = new URL(site.main_site_url).origin
  const detailPaths = requestOrigin === mainOrigin
    ? []
    : listPublishedCommunityPaths().map(item => `/community/${item.category}/${item.slug}`)
  const paths = requestOrigin === mainOrigin ? ['/'] : [...guidePaths, ...detailPaths]
  const urls = paths.map(path => new URL(path, `${requestOrigin}/`).toString())

  setHeader(event, 'content-type', 'application/xml; charset=utf-8')
  setHeader(event, 'cache-control', 'public, max-age=600')
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map(url => `  <url><loc>${escapeXml(url)}</loc></url>`),
    '</urlset>',
    '',
  ].join('\n')
})

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}
