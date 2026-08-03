import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../server/db/index.js'

const temporaryDirectories: string[] = []

function createDatabasePath() {
  const directory = mkdtempSync(join(tmpdir(), 'kkflow-guide-db-'))
  temporaryDirectories.push(directory)
  return join(directory, 'guide.sqlite')
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('database migrations', () => {
  it('applies every migration and seeds the default pricing models', () => {
    const db = openDatabase(createDatabasePath())

    expect(db.prepare('SELECT id, name FROM schema_migrations ORDER BY id').all()).toEqual([
      { id: 1, name: 'create_feedback' },
      { id: 2, name: 'create_pricing_display_settings' },
      { id: 3, name: 'create_pricing_runtime_settings' },
      { id: 4, name: 'extend_feedback_for_user_history_and_reply' },
      { id: 5, name: 'extend_pricing_group_recharge_reference' },
      { id: 6, name: 'create_site_settings' },
    ])
    expect(db.prepare('SELECT COUNT(*) AS count FROM pricing_model_settings').get()).toEqual({ count: 8 })

    const feedbackColumns = db.prepare('PRAGMA table_info(feedback)').all().map((row: any) => row.name)
    expect(feedbackColumns).toEqual(expect.arrayContaining([
      'user_email',
      'user_name',
      'admin_reply',
      'replied_at',
    ]))

    const groupColumns = db.prepare('PRAGMA table_info(pricing_group_settings)').all().map((row: any) => row.name)
    expect(groupColumns).toEqual(expect.arrayContaining([
      'recharge_pay_cny',
      'recharge_credit_usd',
    ]))
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'site_settings'").get()).toEqual({ name: 'site_settings' })
    db.close()
  })

  it('can reopen an existing database without reapplying migrations or seeds', () => {
    const databasePath = createDatabasePath()
    const first = openDatabase(databasePath)
    const firstAppliedAt = first.prepare('SELECT applied_at FROM schema_migrations WHERE id = 6').get() as any
    first.close()

    const second = openDatabase(databasePath)
    expect(second.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get()).toEqual({ count: 6 })
    expect(second.prepare('SELECT COUNT(*) AS count FROM pricing_model_settings').get()).toEqual({ count: 8 })
    expect(second.prepare('SELECT applied_at FROM schema_migrations WHERE id = 6').get()).toEqual(firstAppliedAt)
    second.close()
  })
})
