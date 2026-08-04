import type { PublicSiteConfig } from '~/types/site'
import { normalizeSupportContact } from '#shared/utils/support-contact'

function join(origin: string, path: string) {
  return new URL(path, `${origin.replace(/\/+$/, '')}/`).toString().replace(/\/$/, path === '/' ? '/' : '')
}

export function useSiteConfigState() {
  const runtime = useRuntimeConfig()
  const config = runtime.public as Record<string, unknown>

  return useState<PublicSiteConfig>('public-site-config', () => {
    const siteTitle = String(config.siteName || 'Token向云指南')
    const projectName = String(config.projectName || siteTitle.replace(/指南(?:中心)?$/, '') || 'Token向云')
    const mainSiteUrl = String(config.sub2apiOrigin || 'https://kkflow.org').replace(/\/+$/, '')
    const loginPath = String(config.loginPath || '/login')
    const registerPath = String(config.registerPath || '/register')
    const supportPath = String(config.supportPath || '/support')
    const apiPath = String(config.apiPath || '/v1')
    const siteUrl = String(config.siteUrl || 'https://guide.kkflow.org').replace(/\/+$/, '')

    return {
      project_name: projectName,
      site_title: siteTitle,
      site_description: String(config.siteDescription || '会员、API 接入、模型试用与价格参考。'),
      logo_path: join(siteUrl, String(config.logoPath || '/logo-80.png')),
      footer_text: String(config.footerText || '清晰接入，稳定调用。'),
      main_site_url: mainSiteUrl,
      login_path: loginPath,
      register_path: registerPath,
      support_path: supportPath,
      api_path: apiPath,
      support_wechat: normalizeSupportContact(String(config.supportWechat || '微信 kkflow520')),
      support_group_url: String(config.supportGroupUrl || 'https://www.kdocs.cn/l/csU8ZJybJe2V'),
      site_url: siteUrl,
      login_url: join(mainSiteUrl, loginPath),
      register_url: join(mainSiteUrl, registerPath),
      support_url: join(mainSiteUrl, supportPath),
      api_base_url: join(mainSiteUrl, apiPath),
    }
  })
}
