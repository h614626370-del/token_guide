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
    try {
      expect(db.prepare('SELECT id, name FROM schema_migrations ORDER BY id').all()).toEqual([
        { id: 1, name: 'create_feedback' },
        { id: 2, name: 'create_pricing_display_settings' },
        { id: 3, name: 'create_pricing_runtime_settings' },
        { id: 4, name: 'extend_feedback_for_user_history_and_reply' },
        { id: 5, name: 'extend_pricing_group_recharge_reference' },
        { id: 6, name: 'create_site_settings' },
        { id: 7, name: 'create_content_overrides' },
        { id: 8, name: 'extend_content_overrides_for_drafts_and_versions' },
        { id: 9, name: 'create_installer_configuration_and_versions' },
        { id: 10, name: 'create_homepage_management' },
        { id: 11, name: 'create_promotion_tracking' },
        { id: 12, name: 'create_email_settings' },
        { id: 13, name: 'create_direct_promotion_visits' },
        { id: 14, name: 'create_guide_document_management' },
        { id: 15, name: 'prioritize_current_pricing_models' },
        { id: 16, name: 'track_pricing_model_discoveries' },
        { id: 17, name: 'reset_pricing_model_discovery_baseline' },
        { id: 18, name: 'create_pricing_source_snapshots' },
        { id: 19, name: 'extend_pricing_models_for_image_prices' },
        { id: 20, name: 'create_community_directory' },
        { id: 21, name: 'localize_default_community_icons' },
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
      const modelColumns = db.prepare('PRAGMA table_info(pricing_model_settings)').all().map((row: any) => row.name)
      expect(modelColumns).toEqual(expect.arrayContaining([
        'is_image_model',
        'image_price_1k',
        'image_price_2k',
        'image_price_4k',
      ]))
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'site_settings'").get()).toEqual({ name: 'site_settings' })
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'content_overrides'").get()).toEqual({ name: 'content_overrides' })
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'content_versions'").get()).toEqual({ name: 'content_versions' })
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'installer_settings'").get()).toEqual({ name: 'installer_settings' })
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'installer_overrides'").get()).toEqual({ name: 'installer_overrides' })
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'installer_versions'").get()).toEqual({ name: 'installer_versions' })
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'homepage_settings'").get()).toEqual({ name: 'homepage_settings' })
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'homepage_history'").get()).toEqual({ name: 'homepage_history' })
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'promotion_sources'").get()).toEqual({ name: 'promotion_sources' })
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'promotion_events'").get()).toEqual({ name: 'promotion_events' })
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'promotion_visits'").get()).toEqual({ name: 'promotion_visits' })
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'email_settings'").get()).toEqual({ name: 'email_settings' })
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'pricing_model_discoveries'").get()).toEqual({ name: 'pricing_model_discoveries' })
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'pricing_source_snapshots'").get()).toEqual({ name: 'pricing_source_snapshots' })
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'community_items'").get()).toEqual({ name: 'community_items' })
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'community_likes'").get()).toEqual({ name: 'community_likes' })
      expect(db.prepare('SELECT slug, status, icon_url FROM community_items ORDER BY sort_order').all()).toEqual([
        { slug: 'codex-plus-plus', status: 'published', icon_url: '/community/codex-plus-plus.png' },
        { slug: 'cc-switch', status: 'published', icon_url: null },
      ])
    } finally {
      db.close()
    }
  })

  it('can reopen an existing database without reapplying migrations or seeds', () => {
    const databasePath = createDatabasePath()
    const first = openDatabase(databasePath)
    let firstAppliedAt: any
    try {
      firstAppliedAt = first.prepare('SELECT applied_at FROM schema_migrations WHERE id = 21').get()
    } finally {
      first.close()
    }

    const second = openDatabase(databasePath)
    try {
      expect(second.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get()).toEqual({ count: 21 })
      expect(second.prepare('SELECT COUNT(*) AS count FROM pricing_model_settings').get()).toEqual({ count: 8 })
      expect(second.prepare('SELECT applied_at FROM schema_migrations WHERE id = 21').get()).toEqual(firstAppliedAt)
    } finally {
      second.close()
    }
  })
})
