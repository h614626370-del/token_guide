import { describe, expect, it } from 'vitest'
import { formatSupportContact, normalizeSupportContact, parseSupportContact } from '../shared/utils/support-contact'

describe('support contact formatting', () => {
  it('keeps legacy account-only settings compatible', () => {
    expect(normalizeSupportContact('kkflow520')).toBe('微信 kkflow520')
  })

  it('normalizes configured WeChat and QQ prefixes', () => {
    expect(normalizeSupportContact('微信号：kkflow520')).toBe('微信 kkflow520')
    expect(normalizeSupportContact('qq 2754632844')).toBe('QQ 2754632844')
  })

  it('round-trips the administrator type and account controls', () => {
    expect(parseSupportContact('QQ: 2754632844')).toEqual({ type: 'QQ', account: '2754632844' })
    expect(formatSupportContact('QQ', ' 2754632844 ')).toBe('QQ 2754632844')
  })
})
