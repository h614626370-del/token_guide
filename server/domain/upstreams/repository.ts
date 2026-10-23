import type Database from 'better-sqlite3'
import type { UpstreamInput } from './schema'

export interface UpstreamRow extends Omit<UpstreamInput, 'api_key' | 'enabled' | 'low_balance_enabled' | 'exhausted_enabled'> {
  id: number
  api_key: string
  enabled: number
  low_balance_enabled: number
  exhausted_enabled: number
  balance: number | null
  balance_unit: string
  last_checked_at: string | null
  last_check_status: string
  last_error: string | null
  last_alert_kind: string | null
  last_alert_at: string | null
  notification_status: string | null
  created_at: string
  updated_at: string
}

export function publicUpstream(row: UpstreamRow) {
  const { api_key, ...rest } = row
  return { ...rest, enabled: Boolean(row.enabled), low_balance_enabled: Boolean(row.low_balance_enabled), exhausted_enabled: Boolean(row.exhausted_enabled), api_key_configured: Boolean(api_key) }
}

export function createUpstreamRepository(db: Database.Database) {
  return {
    list: () => db.prepare('SELECT * FROM upstream_monitors ORDER BY id DESC').all() as UpstreamRow[],
    get: (id: number) => db.prepare('SELECT * FROM upstream_monitors WHERE id = ?').get(id) as UpstreamRow | undefined,
    save(input: UpstreamInput, id?: number) {
      const current = id === undefined ? undefined : this.get(id)
      const now = new Date(Math.max(Date.now(), current ? Date.parse(current.updated_at) + 1 : 0)).toISOString()
      const values = { ...input, api_key: input.api_key || '', enabled: Number(input.enabled), low_balance_enabled: Number(input.low_balance_enabled), exhausted_enabled: Number(input.exhausted_enabled), updated_at: now }
      if (id !== undefined) {
        db.prepare(`UPDATE upstream_monitors SET name=@name, source=@source, account_id=@account_id,
          base_url=@base_url, api_key=@api_key, enabled=@enabled, low_balance_enabled=@low_balance_enabled,
          low_balance_threshold=@low_balance_threshold, exhausted_enabled=@exhausted_enabled,
          check_interval_minutes=@check_interval_minutes, updated_at=@updated_at,
          balance=NULL, last_checked_at=NULL, last_check_status='pending', last_error=NULL,
          last_alert_kind=NULL, last_alert_at=NULL, notification_status=NULL WHERE id=@id`).run({ ...values, id })
        return this.get(id)!
      }
      const result = db.prepare(`INSERT INTO upstream_monitors (name, source, account_id, base_url, api_key,
        enabled, low_balance_enabled, low_balance_threshold, exhausted_enabled, check_interval_minutes, created_at, updated_at)
        VALUES (@name, @source, @account_id, @base_url, @api_key, @enabled, @low_balance_enabled,
        @low_balance_threshold, @exhausted_enabled, @check_interval_minutes, @updated_at, @updated_at)`).run(values)
      return this.get(Number(result.lastInsertRowid))!
    },
    remove: (id: number) => db.prepare('DELETE FROM upstream_monitors WHERE id = ?').run(id).changes > 0,
    recordCheck(id: number, patch: { balance: number | null, balance_unit: string, last_check_status: string, last_error: string | null }, expectedUpdatedAt: string) {
      return db.prepare(`UPDATE upstream_monitors SET balance=@balance, balance_unit=@balance_unit,
        last_check_status=@last_check_status, last_error=@last_error, last_checked_at=@checked_at
        WHERE id=@id AND updated_at=@expected_updated_at`).run({ ...patch, id, checked_at: new Date().toISOString(), expected_updated_at: expectedUpdatedAt }).changes > 0
    },
    recordNotification(id: number, kind: string | null, status: string | null, expectedUpdatedAt: string) {
      db.prepare(`UPDATE upstream_monitors SET last_alert_kind=@kind, notification_status=@status,
        last_alert_at=CASE WHEN @status='sent' THEN @now ELSE last_alert_at END
        WHERE id=@id AND updated_at=@updated_at`).run({ id, kind, status, now: new Date().toISOString(), updated_at: expectedUpdatedAt })
    },
  }
}
