import type { PublicSiteConfig } from '~/types/site'
import { normalizeSupportContact } from '#shared/utils/support-contact'
import { deriveMainSiteOrigin } from '#shared/utils/site-origin'

function join(origin: string, path: string) {
  return new URL(path, `${origin.replace(/\/+$/, '')}/`).toString().replace(/\/$/, path === '/' ? '/' : '')
}

export function useSiteConfigState() {
  const siteUrl = useRequestURL().origin

  return useState<PublicSiteConfig>('public-site-config', () => {
    const siteTitle = 'Token向云指南'
    const projectName = 'Token向云'
    const mainSiteUrl = deriveMainSiteOrigin(siteUrl) || siteUrl
    const loginPath = '/login'
    const registerPath = '/register'
    const supportPath = '/support'
    const apiPath = '/v1'

    return {
      project_name: projectName,
      site_title: siteTitle,
      site_description: '会员、API 接入、模型试用与价格参考。',
      logo_path: join(siteUrl, '/logo-80.png'),
      footer_text: '清晰接入，稳定调用。',
      main_site_url: mainSiteUrl,
      login_path: loginPath,
      register_path: registerPath,
      support_path: supportPath,
      api_path: apiPath,
      support_wechat: normalizeSupportContact('微信 kkflow520'),
      support_group_url: 'https://www.kdocs.cn/l/csU8ZJybJe2V',
      site_url: siteUrl,
      login_url: join(mainSiteUrl, loginPath),
      register_url: join(mainSiteUrl, registerPath),
      support_url: join(mainSiteUrl, supportPath),
      api_base_url: join(mainSiteUrl, apiPath),
    }
  })
}
