import { z } from 'zod'

function isHttpUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

const httpUrl = z.string().trim().min(1).max(500).refine(isHttpUrl, '必须是有效的 HTTP(S) 地址')
const optionalHttpUrl = z.string().trim().max(500).refine(value => !value || isHttpUrl(value), '必须是有效的 HTTP(S) 地址')
const routePath = z.string().trim().min(1).max(160).regex(/^\/(?!\/)/, '必须是以 / 开头的站内路由')

export const siteSettingsSchema = z.object({
  project_name: z.string().trim().min(1).max(40),
  site_title: z.string().trim().min(1).max(80),
  site_description: z.string().trim().min(1).max(240),
  logo_path: httpUrl,
  footer_text: z.string().trim().min(1).max(120),
  main_site_url: httpUrl,
  login_path: routePath,
  register_path: routePath,
  support_path: routePath,
  api_path: routePath,
  support_wechat: z.string().trim().max(80),
  support_group_url: optionalHttpUrl,
}).strict()

export type SiteSettingsInput = z.infer<typeof siteSettingsSchema>
