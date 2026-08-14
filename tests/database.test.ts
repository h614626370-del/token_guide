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
        { id: 22, name: 'extend_community_details_and_images' },
        { id: 23, name: 'add_agent_and_plugin_community_categories' },
        { id: 24, name: 'create_asset_metadata' },
        { id: 25, name: 'seed_domestic_codex_community_items' },
        { id: 26, name: 'seed_codex_tools_for_existing_community' },
        { id: 27, name: 'correct_seeded_community_urls' },
        { id: 28, name: 'seed_second_batch_community_items' },
        { id: 29, name: 'seed_database_community_mcp' },
        { id: 30, name: 'seed_renwei_writing_skill' },
        { id: 31, name: 'create_community_categories' },
        { id: 32, name: 'create_game_directory_and_seed' },
        { id: 33, name: 'replace_demo_games_with_replayable_games' },
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
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'community_item_images'").get()).toEqual({ name: 'community_item_images' })
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'community_categories'").get()).toEqual({ name: 'community_categories' })
      expect(db.prepare('SELECT slug, name, is_visible FROM community_categories ORDER BY sort_order').all()).toEqual([
        { slug: 'tools', name: '开源工具', is_visible: 1 },
        { slug: 'skills', name: 'Skills', is_visible: 1 },
        { slug: 'mcp', name: 'MCP', is_visible: 1 },
        { slug: 'agent', name: 'Agent', is_visible: 1 },
        { slug: 'plugin', name: 'Plugin', is_visible: 1 },
      ])
      expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'game_items'").get()).toEqual({ name: 'game_items' })
      expect(db.prepare('PRAGMA table_info(community_items)').all().map((row: any) => row.name)).toContain('description_md')
      expect(db.prepare('SELECT COUNT(*) AS count FROM community_items').get()).toEqual({ count: 26 })
      expect(db.prepare('SELECT COUNT(*) AS count FROM game_items').get()).toEqual({ count: 6 })
      expect(db.prepare('SELECT slug, category, status, play_path FROM game_items ORDER BY sort_order').all()).toEqual([
        { slug: 'gobang', category: 'board', status: 'published', play_path: '/games-static/gobang/index.html' },
        { slug: 'pacman', category: 'arcade', status: 'published', play_path: '/games-static/pacman/index.html' },
        { slug: 'train-gun', category: 'training', status: 'published', play_path: '/games-static/train-gun/index.html' },
        { slug: '2048', category: 'puzzle', status: 'published', play_path: '/games-static/2048/index.html' },
        { slug: 'allalive', category: 'arcade', status: 'published', play_path: '/games-static/allalive/index.html' },
        { slug: 'fifty', category: 'arcade', status: 'published', play_path: '/games-static/fifty/index.html' },
      ])
      expect(db.prepare('SELECT slug, status, icon_url FROM community_items ORDER BY sort_order').all()).toEqual(expect.arrayContaining([
        { slug: 'codex-plus-plus', status: 'published', icon_url: '/community/codex-plus-plus.png' },
        { slug: 'cc-switch', status: 'published', icon_url: null },
        { slug: 'openai-codex', status: 'published', icon_url: null },
        { slug: 'cherry-studio', status: 'published', icon_url: null },
        { slug: 'tencentcloud-mcp', status: 'published', icon_url: null },
        { slug: 'qwen-agent', status: 'published', icon_url: null },
        { slug: 'superpowers', status: 'published', icon_url: null },
      ]))
      expect(() => db.prepare(`INSERT INTO community_items (
        slug, category, name, summary, official_url, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'draft', ?, ?)`)
        .run('database-agent', 'agent', 'Database Agent', '用于验证 Agent 社区分类可以保存。', 'https://example.com/agent', new Date().toISOString(), new Date().toISOString())).not.toThrow()
      expect(() => db.prepare(`INSERT INTO community_items (
        slug, category, name, summary, official_url, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'draft', ?, ?)`)
        .run('database-plugin', 'plugin', 'Database Plugin', '用于验证 Plugin 社区分类可以保存。', 'https://example.com/plugin', new Date().toISOString(), new Date().toISOString())).not.toThrow()
      const now = new Date().toISOString()
      db.prepare(`INSERT INTO community_categories (
        slug, name, icon_key, description, is_visible, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, '', 1, 60, ?, ?)`)
        .run('database', '数据库', 'database', now, now)
      expect(() => db.prepare(`INSERT INTO community_items (
        slug, category, name, summary, official_url, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'draft', ?, ?)`)
        .run('database-dynamic', 'database', 'Dynamic Database', '用于验证动态社区分类可以保存。', 'https://example.com/database', now, now)).not.toThrow()
      expect(() => db.prepare(`INSERT INTO community_items (
        slug, category, name, summary, official_url, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'draft', ?, ?)`)
        .run('database-invalid', 'missing', 'Invalid Database', '用于验证不存在的社区分类会被拒绝。', 'https://example.com/invalid', now, now)).toThrow()
    } finally {
      db.close()
    }
  })

  it('can reopen an existing database without reapplying migrations or seeds', () => {
    const databasePath = createDatabasePath()
    const first = openDatabase(databasePath)
    let firstAppliedAt: any
    try {
      firstAppliedAt = first.prepare('SELECT applied_at FROM schema_migrations WHERE id = 22').get()
    } finally {
      first.close()
    }

    const second = openDatabase(databasePath)
    try {
      expect(second.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get()).toEqual({ count: 33 })
      expect(second.prepare('SELECT COUNT(*) AS count FROM pricing_model_settings').get()).toEqual({ count: 8 })
      expect(second.prepare('SELECT COUNT(*) AS count FROM game_items').get()).toEqual({ count: 6 })
      expect(second.prepare('SELECT applied_at FROM schema_migrations WHERE id = 22').get()).toEqual(firstAppliedAt)
    } finally {
      second.close()
    }
  })
})
