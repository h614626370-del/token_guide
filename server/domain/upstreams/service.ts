import type Database from 'better-sqlite3'
import { createUpstreamRepository, publicUpstream, type UpstreamRow } from './repository'
import { normalizeUpstreamBase, type UpstreamInput } from './schema'
import { fetchUpstreamUsage } from './usage'

interface Account {
  id: number
  name: string
  type: string
  platform: string
  status?: string
  credentials?: { base_url?: string, api_key?: string }
}

interface MainSiteClient {
  configured: boolean
  listAccountsAll(options: { provider: string, status: string }): Promise<any[]>
  getAccount(id: number): Promise<any>
  exportAccountCredentials(id: number): Promise<any>
}

export interface UpstreamAlert {
  name: string
  base_url: string
  balance: number
  unit: string
  threshold: number
  kind: 'low' | 'exhausted'
}

type PublicUpstream = ReturnType<typeof publicUpstream> & { resolved_base_url: string }

const checks = new Map<number, Promise<PublicUpstream | null>>()

export function createUpstreamService(options: {
  db: Database.Database
  getClient: () => MainSiteClient
  sendAlert: (alert: UpstreamAlert) => Promise<{ status: string }>
  timeoutMs?: number
}) {
  const repo = createUpstreamRepository(options.db)

  async function mainAccount(id: number, includeCredentials = false): Promise<Account> {
    const client = options.getClient()
    if (!client.configured) throw new Error('请先在价格配置中设置主站管理接口。')
    let account: Account
    try { account = await client.getAccount(id) } catch { throw new Error('主站账号读取失败，请检查主站管理配置及账号是否存在。') }
    if (account.type !== 'apikey') throw new Error('仅支持主站的三方 API 类型账号。')
    if (includeCredentials && !account.credentials?.api_key) {
      try {
        const exported = await client.exportAccountCredentials(id)
        const item = exported?.accounts?.[0]
        if (item?.type === 'apikey' && item?.credentials?.api_key) account = { ...account, credentials: item.credentials }
      } catch { throw new Error('主站限制读取账号密钥，请在上游设置中补充 API Key。') }
    }
    return account
  }

  async function present(row: UpstreamRow, resolvedBaseUrl?: string): Promise<PublicUpstream> {
    let baseUrl = row.base_url || resolvedBaseUrl || ''
    if (!row.base_url && resolvedBaseUrl === undefined && row.source === 'main_site') {
      try { baseUrl = (await mainAccount(row.account_id!)).credentials?.base_url || '' } catch { /* Keep the monitor visible when its account cannot be read. */ }
    }
    return { ...publicUpstream(row), resolved_base_url: safeBase(baseUrl) }
  }

  async function check(id: number) {
    const row = repo.get(id)
    if (!row) return null
    let baseUrl = row.base_url
    const currentView = () => {
      const current = repo.get(id)
      return current ? present(current, current.updated_at === row.updated_at ? baseUrl || undefined : undefined) : null
    }
    let result
    try {
      let apiKey = row.api_key
      if (row.source === 'main_site') {
        const account = await mainAccount(row.account_id!, !apiKey)
        baseUrl ||= account.credentials?.base_url || ''
        apiKey ||= account.credentials?.api_key || ''
      }
      if (!baseUrl || !apiKey) throw new Error('上游地址或 API Key 未配置，请编辑后重试。')
      result = await fetchUpstreamUsage(baseUrl, apiKey, options.timeoutMs)
    } catch (error) {
      const message = error instanceof Error ? error.message : '余额检查失败。'
      repo.recordCheck(id, { balance: row.balance, balance_unit: row.balance_unit, last_check_status: 'error', last_error: message }, row.updated_at)
      return currentView()
    }

    const saved = repo.recordCheck(id, { balance: result.balance, balance_unit: result.unit, last_check_status: result.unlimited ? 'unlimited' : 'success', last_error: null }, row.updated_at)
    if (!saved) return currentView()
    const kind = result.balance === null ? null : result.balance <= 0 && row.exhausted_enabled ? 'exhausted'
      : result.balance <= row.low_balance_threshold && row.low_balance_enabled ? 'low' : null
    if (!kind) {
      repo.recordNotification(id, null, null, row.updated_at)
    } else if (row.enabled && (row.last_alert_kind !== kind || row.notification_status !== 'sent')) {
      let status = 'failed'
      try {
        const delivery = await options.sendAlert({ name: row.name, base_url: normalizeUpstreamBase(baseUrl), balance: result.balance!, unit: result.unit, threshold: row.low_balance_threshold, kind })
        status = delivery.status
      } catch { /* Retry delivery on the next scheduled check. */ }
      repo.recordNotification(id, kind, status, row.updated_at)
    }
    return currentView()
  }

  return {
    list: () => Promise.all(repo.list().map(row => present(row))),
    async accounts(provider: string) {
      const client = options.getClient()
      if (!client.configured) throw new Error('请先在价格配置中设置主站管理接口。')
      try {
        const accounts = await client.listAccountsAll({ provider, status: '' })
        return accounts.filter(account => account.type === 'apikey').map(account => ({ id: Number(account.id), name: String(account.name || `账号 ${account.id}`), platform: String(account.platform || provider), status: String(account.status || ''), base_url: safeBase(account.credentials?.base_url) }))
      } catch { throw new Error('主站账号列表读取失败，请检查主站管理接口配置。') }
    },
    async save(input: UpstreamInput, id?: number) {
      const current = id === undefined ? undefined : repo.get(id)
      if (id !== undefined && !current) throw new Error('上游配置不存在。')
      const preserveKey = current?.source === input.source && (input.source === 'manual' || current.account_id === input.account_id)
      const apiKey = input.api_key || (preserveKey ? current?.api_key : '') || ''
      if (input.source === 'manual' && !apiKey) throw new Error('请填写上游 API Key。')
      const account = input.source === 'main_site' ? await mainAccount(input.account_id!) : undefined
      return present(repo.save({ ...input, base_url: input.base_url ? normalizeUpstreamBase(input.base_url) : '', api_key: apiKey }, id), account?.credentials?.base_url || '')
    },
    remove: repo.remove,
    check(id: number) {
      // Coalesce timer and manual requests for the same monitor to avoid duplicate alerts.
      const existing = checks.get(id)
      if (existing) return existing
      const pending = check(id).finally(() => checks.delete(id))
      checks.set(id, pending)
      return pending
    },
    async checkDue() {
      for (const row of repo.list()) {
        if (!row.enabled) continue
        if (row.last_checked_at && Date.now() - Date.parse(row.last_checked_at) < row.check_interval_minutes * 60_000) continue
        await this.check(row.id)
      }
    },
  }
}

function safeBase(value: unknown) {
  if (typeof value !== 'string' || !value) return ''
  try { return normalizeUpstreamBase(value) } catch { return '' }
}
