interface GuideSiteConfig {
  project_name: string
  main_site_url: string
  api_base_url: string
  support_wechat: string
  support_group_url: string
}

const genericHostLabels = new Set(['www', 'api', 'app', 'platform'])

export function siteProviderId(mainSiteUrl: string) {
  try {
    const hostname = new URL(mainSiteUrl).hostname.toLowerCase()
    const labels = hostname.split('.').filter(Boolean)
    const label = labels.find(item => !genericHostLabels.has(item) && /[a-z]/.test(item)) || ''
    const normalized = label
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
    return normalized || 'provider'
  } catch {
    return 'provider'
  }
}

export function replaceGuideDefaults(value: string, site: GuideSiteConfig) {
  const normalized = value
    .replace(/添加客服微信\s+`kkflow520`/g, '添加客服 `微信 kkflow520`')
    .replace(/或加入\[客户服务群\]\(https:\/\/www\.kdocs\.cn\/l\/csU8ZJybJe2V\)/g, '或扫描下方二维码加入客户服务群')
  const replacements: Record<string, string> = {
    'https://www.kdocs.cn/l/csU8ZJybJe2V': site.support_group_url,
    'https://kkflow.org/v1': site.api_base_url,
    'https://kkflow.org': site.main_site_url,
    'Token向云': site.project_name,
    '微信 kkflow520': site.support_wechat,
    'kkflow520': site.support_wechat,
    'KKFlow': site.project_name,
    'tokenxiangyun': siteProviderId(site.main_site_url),
    'kkflow': siteProviderId(site.main_site_url),
  }

  return normalized.replace(
    /https:\/\/www\.kdocs\.cn\/l\/csU8ZJybJe2V|https:\/\/kkflow\.org\/v1|https:\/\/kkflow\.org|Token向云|微信 kkflow520|kkflow520|KKFlow|tokenxiangyun|\bkkflow\b/g,
    token => replacements[token] ?? token,
  )
}
