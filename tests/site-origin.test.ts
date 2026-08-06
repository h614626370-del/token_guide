import { describe, expect, it } from 'vitest'
import { deriveMainSiteOrigin, normalizeOrigin } from '../shared/utils/site-origin'

describe('site origin helpers', () => {
  it('derives the main site by removing the guide subdomain', () => {
    expect(deriveMainSiteOrigin('https://guide.aiziyou.org')).toBe('https://aiziyou.org')
    expect(deriveMainSiteOrigin('https://guide.example.com:8443')).toBe('https://example.com:8443')
  })

  it('keeps non-guide origins unchanged and rejects invalid origins', () => {
    expect(deriveMainSiteOrigin('https://home.aiziyou.org')).toBe('https://home.aiziyou.org')
    expect(normalizeOrigin('not-an-origin')).toBe('')
  })
})
