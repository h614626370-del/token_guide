export type SupportContactType = '微信' | 'QQ'

const supportContactPrefix = /^(微信号?|wechat|wx|qq号?|qq)\s*[:：]?\s*/i

export function parseSupportContact(value: string): { type: SupportContactType, account: string } {
  const normalized = String(value || '').trim()
  const match = normalized.match(supportContactPrefix)

  if (!match) return { type: '微信', account: normalized }

  return {
    type: match[1]?.toLowerCase().startsWith('q') ? 'QQ' : '微信',
    account: normalized.slice(match[0].length).trim(),
  }
}

export function formatSupportContact(type: SupportContactType, account: string) {
  const normalizedAccount = String(account || '').trim()
  return normalizedAccount ? `${type} ${normalizedAccount}` : ''
}

export function normalizeSupportContact(value: string) {
  const { type, account } = parseSupportContact(value)
  return formatSupportContact(type, account)
}
