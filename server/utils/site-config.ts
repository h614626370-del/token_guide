import type { H3Event } from 'h3'
import type { PublicSiteConfig } from '../../app/types/site'
import { createSiteSettingsRepository } from '../domain/site-settings/repository'
import { siteSettingsSchema, type SiteSettingsInput } from '../domain/site-settings/schema'
import { useGuideDatabase } from './database'

function runtimeDefaults(event?: H3Event): SiteSettingsInput & { site_url: string } {
  const runtime = useRuntimeConfig(event)
  const config = runtime.public as Record<string, unknown>
  const siteTitle = String(config.siteName || 'Token向云指南').trim()
  const projectName = String(config.projectName || siteTitle.replace(/指南(?:中心)?$/, '') || 'Token向云').trim()
  const siteUrl = String(config.siteUrl || 'https://guide.kkflow.org').trim().replace(/\/+$/, '')

  return {
    project_name: projectName,
    site_title: siteTitle,
    site_description: String(config.siteDescription || '会员、API 接入、模型试用与价格参考。').trim(),
    logo_path: absoluteUrl(siteUrl, String(config.logoPath || '/logo-80.png').trim()),
    footer_text: String(config.footerText || '清晰接入，稳定调用。').trim(),
    main_site_url: String(config.sub2apiOrigin || 'https://kkflow.org').trim().replace(/\/+$/, ''),
    login_path: String(config.loginPath || '/login').trim(),
    register_path: String(config.registerPath || '/register').trim(),
    support_path: String(config.supportPath || '/support').trim(),
    api_path: String(config.apiPath || '/v1').trim().replace(/\/+$/, ''),
    support_wechat: String(config.supportWechat || 'kkflow520').trim(),
    support_group_url: String(config.supportGroupUrl || 'https://www.kdocs.cn/l/csU8ZJybJe2V').trim(),
    site_url: siteUrl,
  }
}

function absoluteUrl(origin: string, path: string) {
  const value = String(path || '').trim()
  // 已是完整 URL 时不要再用站点 origin 重写，避免后台配置的外链 Logo 被改掉
  if (/^https?:\/\//i.test(value)) return value
  return new URL(value || '/', `${origin.replace(/\/+$/, '')}/`).toString().replace(/\/$/, value === '/' ? '/' : '')
}

function toPublic(settings: SiteSettingsInput, siteUrl: string): PublicSiteConfig {
  const mainSiteUrl = settings.main_site_url.replace(/\/+$/, '')
  return {
    ...settings,
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
  globalThis.__kkflowSiteSettings = settings
  return toPublic(settings, siteUrl)
}

export function updatePublicSiteConfig(input: SiteSettingsInput, event?: H3Event): PublicSiteConfig {
  const settings = siteSettingsSchema.parse(input)
  createSiteSettingsRepository(useGuideDatabase()).update(settings)
  globalThis.__kkflowSiteSettings = settings
  return toPublic(settings, runtimeDefaults(event).site_url)
}

export function warmSiteSettingsCache() {
  getPublicSiteConfig()
}
