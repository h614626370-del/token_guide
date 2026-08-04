import { describe, expect, it } from 'vitest'
import { replaceGuideDefaults, siteProviderId } from '../shared/utils/guide-content'

const site = {
  project_name: 'Token自由',
  main_site_url: 'https://aiziyou.org',
  api_base_url: 'https://aiziyou.org/v1',
  support_wechat: 'QQ 2754632844',
  support_group_url: 'https://assets.aiziyou.org/group.png',
}

describe('guide content branding', () => {
  it('derives a stable provider id from the main-site hostname', () => {
    expect(siteProviderId('https://aiziyou.org')).toBe('aiziyou')
    expect(siteProviderId('https://api.aiziyou.org')).toBe('aiziyou')
    expect(siteProviderId('not a url')).toBe('provider')
  })

  it('rewrites machine and display provider names without touching contact ids', () => {
    const source = [
      'model_provider = "kkflow"',
      '[model_providers.kkflow]',
      'name = "KKFlow"',
      '"tokenxiangyun/gpt-5.5"',
      '添加客服微信 `kkflow520`',
    ].join('\n')
    const rendered = replaceGuideDefaults(source, site)

    expect(rendered).toContain('model_provider = "aiziyou"')
    expect(rendered).toContain('[model_providers.aiziyou]')
    expect(rendered).toContain('name = "Token自由"')
    expect(rendered).toContain('"aiziyou/gpt-5.5"')
    expect(rendered).toContain('客服 `QQ 2754632844`')
    expect(rendered).not.toMatch(/\bkkflow\b|KKFlow|tokenxiangyun/)
  })
})
