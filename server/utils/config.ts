import path from 'node:path'
import type { H3Event } from 'h3'
import type { SiteSettingsInput } from '../domain/site-settings/schema'
import { deriveMainSiteOrigin } from '#shared/utils/site-origin'
import { getPublicRequestOrigin } from './request-url'

declare global {
  // eslint-disable-next-line no-var
  var __guideSiteSettings: SiteSettingsInput | undefined
}

function csv(value: unknown, fallback: string[]) {
  const items = String(value || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
  return items.length ? items : fallback
}

function apiBase(origin: string) {
  const normalized = origin.trim().replace(/\/+$/, '')
  return normalized.endsWith('/api/v1') ? normalized : `${normalized}/api/v1`
}

export function getGuideConfig(event?: H3Event) {
  const runtime = useRuntimeConfig(event)
  const pricingPlatforms = csv(runtime.pricingPlatforms, ['openai', 'anthropic'])
  const trustedProxyIps = csv(runtime.trustedProxyIps, ['127.0.0.1', '::1'])
  const databasePath = String(runtime.databasePath || 'data/guide.sqlite')
  const isProduction = process.env.NODE_ENV === 'production'

  const configured = globalThis.__guideSiteSettings
  const siteUrl = getPublicRequestOrigin(event, 'http://127.0.0.1:3000')
  const sub2apiOrigin = String(configured?.main_site_url || deriveMainSiteOrigin(siteUrl) || siteUrl).replace(/\/+$/, '')

  return {
    isProduction,
    siteUrl,
    projectName: String(configured?.project_name || 'Token向云'),
    siteName: String(configured?.site_title || 'Token向云指南'),
    sub2apiOrigin,
    sub2apiApiBase: apiBase(sub2apiOrigin),
    sub2apiAdminApiKey: String(runtime.sub2apiAdminApiKey || ''),
    adminToken: String(runtime.adminToken || ''),
    sessionPassword: String(runtime.sessionPassword || ''),
    ipHashSalt: String(runtime.ipHashSalt || ''),
    dbPath: path.resolve(databasePath),
    pricingPlatforms,
    providerDisplayOrder: [...pricingPlatforms],
    pricingCacheTtlMs: Number(runtime.pricingCacheTtlMs || 300000),
    pricingFetchTimeoutMs: Number(runtime.upstreamTimeoutMs || 8000),
    playgroundTextTimeoutMs: Number(runtime.playgroundTextTimeoutMs || 120000),
    playgroundImageTimeoutMs: Number(runtime.playgroundImageTimeoutMs || 300000),
    feedbackDailyLimit: Number(runtime.feedbackDailyLimit || 5),
    rateWindowMs: Number(runtime.rateWindowMs || 600000),
    rateMax: Number(runtime.rateMax || 5),
    communityLikeWindowMs: Number(runtime.communityLikeWindowMs || 60000),
    communityLikeMax: Number(runtime.communityLikeMax || 30),
    compensationMaxAmount: Number(runtime.compensationMaxAmount || 100000),
    trustedProxyIps,
    usdToCny: Number(runtime.usdToCny || 6.8102),
    appVersion: String(runtime.appVersion || process.env.NUXT_APP_VERSION || '2.2.27'),
    homepageDefaultsPath: path.resolve(process.cwd(), 'homeApps'),
    homepageDefaultId: 'ziyou',
    updateImageRepository: String(runtime.updateImageRepository || '614626370/sub2api-guide'),
    updateGithubRepo: String(runtime.updateGithubRepo || 'h614626370-del/token_guide'),
    updateContainerName: String(runtime.updateContainerName || 'sub2api-guide'),
    dockerSocketPath: String(runtime.dockerSocketPath || '/var/run/docker.sock'),
  }
}
