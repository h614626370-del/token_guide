import type { H3Event } from 'h3'
import type { PublicSiteConfig } from '../../app/types/site'
import { normalizeSupportContact } from '#shared/utils/support-contact'
import { createSiteSettingsRepository } from '../domain/site-settings/repository'
import { siteSettingsSchema, type SiteSettingsInput } from '../domain/site-settings/schema'
import { useGuideDatabase } from './database'
import { getPublicRequestOrigin, rebasePublicUploadUrl } from './request-url'
import { deriveMainSiteOrigin } from '#shared/utils/site-origin'

function runtimeDefaults(event?: H3Event): SiteSettingsInput & { site_url: string } {
  const siteTitle = 'Token向云指南'
  const projectName = 'Token向云'
  const siteUrl = getPublicRequestOrigin(event, 'http://127.0.0.1:3000')
  const mainSiteUrl = deriveMainSiteOrigin(siteUrl) || siteUrl

  return {
    project_name: projectName,
    site_title: siteTitle,
    site_description: '会员、API 接入、模型试用与价格参考。',
    logo_path: absoluteUrl(siteUrl, '/logo-80.png'),
    footer_text: '清晰接入，稳定调用。',
    main_site_url: mainSiteUrl,
    login_path: '/login',
    register_path: '/register',
    support_path: '/support',
    api_path: '/v1',
    support_wechat: '微信 kkflow520',
    support_group_url: 'https://www.kdocs.cn/l/csU8ZJybJe2V',
    site_url: siteUrl,
  }
}

function absoluteUrl(origin: string, path: string) {
  const value = String(path || '').trim()
  // 已是完整 URL 时不要再用站点 origin 重写，避免后台配置的外链 Logo 被改掉
  if (/^https?:\/\//i.test(value)) return value
  return new URL(value || '/', `${origin.replace(/\/+$/, '')}/`).toString().replace(/\/$/, value === '/' ? '/' : '')
}

function toPublic(settings: SiteSettingsInput, siteUrl: string, event?: H3Event): PublicSiteConfig {
  const mainSiteUrl = settings.main_site_url.replace(/\/+$/, '')
  const requestOrigin = getPublicRequestOrigin(event)
  return {
    ...settings,
    logo_path: rebasePublicUploadUrl(settings.logo_path, requestOrigin),
    support_wechat: normalizeSupportContact(settings.support_wechat),
    support_group_url: rebasePublicUploadUrl(settings.support_group_url, requestOrigin),
    main_site_url: mainSiteUrl,
    site_url: siteUrl,
    login_url: absoluteUrl(mainSiteUrl, settings.login_path),
    register_url: absoluteUrl(mainSiteUrl, settings.register_path),
    support_url: absoluteUrl(mainSiteUrl, settings.support_path),
    api_base_url: absoluteUrl(mainSiteUrl, settings.api_path),
  }
}

export function getPublicSiteConfig(event?: H3Event): PublicSiteConfig {
  const defaults = runtimeDefaults(event)
  const { site_url: siteUrl, ...defaultSettings } = defaults
  const overrides = createSiteSettingsRepository(useGuideDatabase()).listOverrides()
  const merged = { ...defaultSettings, ...overrides }
  merged.logo_path = absoluteUrl(siteUrl, merged.logo_path)
  const parsed = siteSettingsSchema.safeParse(merged)
  const settings = parsed.success ? parsed.data : siteSettingsSchema.parse(defaultSettings)
  globalThis.__guideSiteSettings = settings
  return toPublic(settings, siteUrl, event)
}

export function updatePublicSiteConfig(input: SiteSettingsInput, event?: H3Event): PublicSiteConfig {
  const settings = siteSettingsSchema.parse(input)
  createSiteSettingsRepository(useGuideDatabase()).update(settings)
  globalThis.__guideSiteSettings = settings
  return toPublic(settings, runtimeDefaults(event).site_url, event)
}

export function warmSiteSettingsCache() {
  getPublicSiteConfig()
}
