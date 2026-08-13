export const migrations = [
  {
    id: 1,
    name: 'create_feedback',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS feedback (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          public_id TEXT NOT NULL UNIQUE,
          category TEXT NOT NULL,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          contact TEXT,
          page_url TEXT,
          source TEXT NOT NULL DEFAULT 'guide',
          user_id TEXT,
          status TEXT NOT NULL DEFAULT 'open',
          admin_note TEXT,
          ip_hash TEXT,
          user_agent TEXT,
          metadata_json TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          closed_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_feedback_status_created
          ON feedback(status, created_at DESC);

        CREATE INDEX IF NOT EXISTS idx_feedback_category_created
          ON feedback(category, created_at DESC);

        CREATE INDEX IF NOT EXISTS idx_feedback_public_id
          ON feedback(public_id);
      `)
    },
  },
  {
    id: 2,
    name: 'create_pricing_display_settings',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS pricing_model_settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          provider TEXT NOT NULL,
          model_name TEXT NOT NULL,
          display_name TEXT,
          is_visible INTEGER NOT NULL DEFAULT 0 CHECK (is_visible IN (0, 1)),
          is_featured INTEGER NOT NULL DEFAULT 0 CHECK (is_featured IN (0, 1)),
          sort_order INTEGER NOT NULL DEFAULT 1000,
          note TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(provider, model_name)
        );

        CREATE INDEX IF NOT EXISTS idx_pricing_model_visible_provider
          ON pricing_model_settings(is_visible, provider, sort_order, model_name);

        CREATE TABLE IF NOT EXISTS pricing_group_settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          provider TEXT NOT NULL,
          source_id TEXT NOT NULL,
          source_name TEXT,
          display_name TEXT,
          is_visible INTEGER CHECK (is_visible IN (0, 1)),
          recharge_multiplier REAL NOT NULL DEFAULT 1 CHECK (recharge_multiplier > 0),
          sort_order INTEGER NOT NULL DEFAULT 1000,
          note TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          UNIQUE(provider, source_id)
        );

        CREATE INDEX IF NOT EXISTS idx_pricing_group_provider_visible
          ON pricing_group_settings(provider, is_visible, sort_order, source_name);
      `)

      const now = new Date().toISOString()
      const seed = db.prepare(`
        INSERT OR IGNORE INTO pricing_model_settings (
          provider,
          model_name,
          display_name,
          is_visible,
          is_featured,
          sort_order,
          note,
          created_at,
          updated_at
        ) VALUES (?, ?, NULL, 1, ?, ?, NULL, ?, ?)
      `)

      const defaults = [
        ['openai', 'gpt-5.5', 1, 10],
        ['openai', 'gpt-5.4', 0, 20],
        ['openai', 'gpt-5.4-mini', 0, 30],
        ['openai', 'gpt-5.4-nano', 0, 40],
        ['openai', 'codex-auto-review', 0, 50],
        ['openai', 'gpt-image-2', 0, 60],
        ['anthropic', 'claude-sonnet-4-5', 1, 110],
        ['anthropic', 'claude-haiku-4-5', 0, 120],
      ]

      for (const item of defaults) {
        seed.run(item[0], item[1], item[2], item[3], now, now)
      }
    },
  },
  {
    id: 3,
    name: 'create_pricing_runtime_settings',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS pricing_runtime_settings (
          key TEXT PRIMARY KEY,
          value TEXT,
          is_secret INTEGER NOT NULL DEFAULT 0 CHECK (is_secret IN (0, 1)),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `)
    },
  },
  {
    id: 4,
    name: 'extend_feedback_for_user_history_and_reply',
    up(db) {
      const columns = new Set(db.prepare('PRAGMA table_info(feedback)').all().map((row) => row.name))
      const addColumn = (name, sql) => {
        if (!columns.has(name)) {
          db.exec(`ALTER TABLE feedback ADD COLUMN ${sql};`)
        }
      }

      addColumn('user_email', 'user_email TEXT')
      addColumn('user_name', 'user_name TEXT')
      addColumn('admin_reply', 'admin_reply TEXT')
      addColumn('replied_at', 'replied_at TEXT')

      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_feedback_user_created
          ON feedback(user_id, created_at DESC);

        CREATE INDEX IF NOT EXISTS idx_feedback_user_day
          ON feedback(user_id, created_at);
      `)
    },
  },
  {
    id: 5,
    name: 'extend_pricing_group_recharge_reference',
    up(db) {
      const columns = new Set(db.prepare('PRAGMA table_info(pricing_group_settings)').all().map((row) => row.name))
      const addColumn = (name, sql) => {
        if (!columns.has(name)) {
          db.exec(`ALTER TABLE pricing_group_settings ADD COLUMN ${sql};`)
        }
      }

      addColumn('recharge_pay_cny', 'recharge_pay_cny REAL CHECK (recharge_pay_cny IS NULL OR recharge_pay_cny > 0)')
      addColumn('recharge_credit_usd', 'recharge_credit_usd REAL CHECK (recharge_credit_usd IS NULL OR recharge_credit_usd > 0)')
    },
  },
  {
    id: 6,
    name: 'create_site_settings',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS site_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `)
    },
  },
  {
    id: 7,
    name: 'create_content_overrides',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS content_overrides (
          id TEXT PRIMARY KEY,
          path TEXT NOT NULL UNIQUE,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          body TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_content_overrides_path
          ON content_overrides(path);
      `)
    },
  },
  {
    id: 8,
    name: 'extend_content_overrides_for_drafts_and_versions',
    up(db) {
      const columns = new Set(db.prepare('PRAGMA table_info(content_overrides)').all().map((row) => row.name))
      const addColumn = (name, sql) => {
        if (!columns.has(name)) {
          db.exec(`ALTER TABLE content_overrides ADD COLUMN ${sql};`)
        }
      }

      addColumn('draft_title', 'draft_title TEXT')
      addColumn('draft_description', 'draft_description TEXT')
      addColumn('draft_body', 'draft_body TEXT')
      addColumn('draft_updated_at', 'draft_updated_at TEXT')
      addColumn('published_at', 'published_at TEXT')
      addColumn('last_action', 'last_action TEXT')

      db.exec(`
        UPDATE content_overrides
        SET published_at = COALESCE(published_at, updated_at),
            last_action = COALESCE(last_action, 'legacy_publish');

        CREATE TABLE IF NOT EXISTS content_versions (
          version_id INTEGER PRIMARY KEY AUTOINCREMENT,
          doc_id TEXT NOT NULL,
          path TEXT NOT NULL,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          body TEXT NOT NULL,
          source TEXT NOT NULL CHECK (source IN ('published', 'draft', 'default')),
          action TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_content_versions_doc_created
          ON content_versions(doc_id, created_at DESC);
      `)
    },
  },
  {
    id: 9,
    name: 'create_installer_configuration_and_versions',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS installer_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS installer_overrides (
          id TEXT PRIMARY KEY,
          content TEXT NOT NULL,
          draft_content TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          draft_updated_at TEXT,
          published_at TEXT,
          last_action TEXT
        );

        CREATE TABLE IF NOT EXISTS installer_versions (
          version_id INTEGER PRIMARY KEY AUTOINCREMENT,
          script_id TEXT NOT NULL,
          content TEXT NOT NULL,
          source TEXT NOT NULL CHECK (source IN ('published', 'draft', 'default')),
          action TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_installer_versions_script_created
          ON installer_versions(script_id, created_at DESC);
      `)
    },
  },
  {
    id: 10,
    name: 'create_homepage_management',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS homepage_settings (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          active_source TEXT NOT NULL DEFAULT 'default' CHECK (active_source IN ('default', 'custom')),
          active_default_id TEXT NOT NULL DEFAULT 'ziyou',
          current_version TEXT,
          last_action TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS homepage_history (
          history_id INTEGER PRIMARY KEY AUTOINCREMENT,
          source TEXT NOT NULL CHECK (source IN ('default', 'custom')),
          default_id TEXT,
          snapshot_path TEXT,
          label TEXT NOT NULL,
          action TEXT NOT NULL,
          created_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_homepage_history_created
          ON homepage_history(created_at DESC, history_id DESC);

        INSERT OR IGNORE INTO homepage_settings (
          id, active_source, active_default_id, current_version, last_action, created_at, updated_at
        ) VALUES (1, 'default', 'ziyou', NULL, 'initial_default', datetime('now'), datetime('now'));
      `)
    },
  },
  {
    id: 11,
    name: 'create_promotion_tracking',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS promotion_sources (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          code TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          target_url TEXT NOT NULL,
          utm_source TEXT,
          utm_medium TEXT,
          utm_campaign TEXT,
          utm_content TEXT,
          enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS promotion_events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          source_id INTEGER NOT NULL REFERENCES promotion_sources(id) ON DELETE CASCADE,
          event_type TEXT NOT NULL DEFAULT 'click',
          occurred_at TEXT NOT NULL,
          visitor_hash TEXT,
          referer_host TEXT,
          user_agent TEXT,
          metadata_json TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_promotion_events_source_time
          ON promotion_events(source_id, occurred_at DESC);

        CREATE INDEX IF NOT EXISTS idx_promotion_events_time
          ON promotion_events(occurred_at DESC);
      `)
    },
  },
  {
    id: 12,
    name: 'create_email_settings',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS email_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          is_secret INTEGER NOT NULL DEFAULT 0 CHECK (is_secret IN (0, 1)),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `)
    },
  },
  {
    id: 13,
    name: 'create_direct_promotion_visits',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS promotion_visits (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          legacy_event_id INTEGER UNIQUE,
          source_id INTEGER REFERENCES promotion_sources(id) ON DELETE CASCADE,
          occurred_at TEXT NOT NULL,
          visitor_hash TEXT,
          referer_host TEXT,
          user_agent TEXT,
          landing_path TEXT NOT NULL DEFAULT '/',
          ref_code TEXT,
          utm_source TEXT,
          utm_medium TEXT,
          utm_campaign TEXT,
          utm_content TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_promotion_visits_source_time
          ON promotion_visits(source_id, occurred_at DESC);

        CREATE INDEX IF NOT EXISTS idx_promotion_visits_time
          ON promotion_visits(occurred_at DESC);

        CREATE INDEX IF NOT EXISTS idx_promotion_visits_referer_time
          ON promotion_visits(referer_host, occurred_at DESC);

        INSERT OR IGNORE INTO promotion_visits (
          legacy_event_id,
          source_id,
          occurred_at,
          visitor_hash,
          referer_host,
          user_agent,
          landing_path
        )
        SELECT
          id,
          source_id,
          occurred_at,
          visitor_hash,
          referer_host,
          user_agent,
          '/'
        FROM promotion_events
        WHERE event_type = 'click';
      `)
    },
  },
  {
    id: 14,
    name: 'create_guide_document_management',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS guide_document_settings (
          id TEXT PRIMARY KEY,
          path TEXT NOT NULL UNIQUE,
          label TEXT NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
          sort_order INTEGER NOT NULL DEFAULT 1000,
          is_custom INTEGER NOT NULL DEFAULT 0 CHECK (is_custom IN (0, 1)),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_guide_document_settings_order
          ON guide_document_settings(enabled, sort_order, created_at);
      `)

      const now = new Date().toISOString()
      const seed = db.prepare(`
        INSERT OR IGNORE INTO guide_document_settings (
          id, path, label, enabled, sort_order, is_custom, created_at, updated_at
        ) VALUES (?, ?, ?, 1, ?, 0, ?, ?)
      `)

      const defaults = [
        ['index', '/', '指南首页', 10],
        ['integration', '/integration', 'API 接入配置', 20],
        ['member', '/member', '会员充值流程', 30],
      ]

      for (const item of defaults) {
        seed.run(item[0], item[1], item[2], item[3], now, now)
      }
    },
  },
  {
    id: 15,
    name: 'prioritize_current_pricing_models',
    up(db) {
      const now = new Date().toISOString()
      const update = db.prepare(`
        UPDATE pricing_model_settings
        SET sort_order = ?, updated_at = ?
        WHERE provider = 'openai' AND model_name = ? AND sort_order = 1000
      `)
      const priorities = [
        ['gpt-5.6', 4],
        ['gpt-5.6-sol', 5],
        ['gpt-5.6-luna', 6],
        ['gpt-5.6-terra', 7],
        ['deepseek-v4-flash', 8],
      ]
      for (const [modelName, sortOrder] of priorities) {
        update.run(sortOrder, now, modelName)
      }
    },
  },
  {
    id: 16,
    name: 'track_pricing_model_discoveries',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS pricing_model_discoveries (
          provider TEXT NOT NULL,
          model_name TEXT NOT NULL,
          first_seen_at TEXT NOT NULL,
          PRIMARY KEY (provider, model_name)
        );

        CREATE INDEX IF NOT EXISTS idx_pricing_model_discoveries_provider_seen
          ON pricing_model_discoveries(provider, first_seen_at DESC, model_name);
      `)
    },
  },
  {
    id: 17,
    name: 'reset_pricing_model_discovery_baseline',
    up(db) {
      db.exec('DELETE FROM pricing_model_discoveries;')
    },
  },
  {
    id: 18,
    name: 'create_pricing_source_snapshots',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS pricing_source_snapshots (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          payload_json TEXT NOT NULL,
          fetched_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `)
    },
  },
  {
    id: 19,
    name: 'extend_pricing_models_for_image_prices',
    up(db) {
      const columns = new Set(db.prepare('PRAGMA table_info(pricing_model_settings)').all().map((row) => row.name))
      const addColumn = (name, sql) => {
        if (!columns.has(name)) db.exec(`ALTER TABLE pricing_model_settings ADD COLUMN ${sql};`)
      }

      addColumn('is_image_model', 'is_image_model INTEGER CHECK (is_image_model IS NULL OR is_image_model IN (0, 1))')
      addColumn('image_price_1k', 'image_price_1k REAL CHECK (image_price_1k IS NULL OR image_price_1k > 0)')
      addColumn('image_price_2k', 'image_price_2k REAL CHECK (image_price_2k IS NULL OR image_price_2k > 0)')
      addColumn('image_price_4k', 'image_price_4k REAL CHECK (image_price_4k IS NULL OR image_price_4k > 0)')
    },
  },
  {
    id: 20,
    name: 'create_community_directory',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS community_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          slug TEXT NOT NULL UNIQUE,
          category TEXT NOT NULL CHECK (category IN ('tools', 'skills', 'mcp')),
          name TEXT NOT NULL,
          summary TEXT NOT NULL,
          icon_url TEXT,
          official_url TEXT NOT NULL,
          tags_json TEXT NOT NULL DEFAULT '[]',
          compatibility TEXT,
          status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
          is_featured INTEGER NOT NULL DEFAULT 0 CHECK (is_featured IN (0, 1)),
          sort_order INTEGER NOT NULL DEFAULT 1000,
          like_count INTEGER NOT NULL DEFAULT 0 CHECK (like_count >= 0),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          published_at TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_community_items_public
          ON community_items(status, category, is_featured DESC, sort_order, name);

        CREATE TABLE IF NOT EXISTS community_likes (
          item_id INTEGER NOT NULL REFERENCES community_items(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (item_id, user_id)
        );

        CREATE INDEX IF NOT EXISTS idx_community_likes_user
          ON community_likes(user_id, created_at DESC);
      `)

      const now = new Date().toISOString()
      const seed = db.prepare(`
        INSERT OR IGNORE INTO community_items (
          slug, category, name, summary, icon_url, official_url, tags_json,
          compatibility, status, is_featured, sort_order, like_count,
          created_at, updated_at, published_at
        ) VALUES (?, 'tools', ?, ?, ?, ?, ?, ?, 'published', ?, ?, 0, ?, ?, ?)
      `)
      const defaults = [
        [
          'codex-plus-plus',
          'Codex++',
          '面向 OpenAI Codex 与 ChatGPT 桌面应用的外部启动器和管理工具，支持供应商切换、协议转换、会话管理与界面增强。',
          '/community/codex-plus-plus.png',
          'https://github.com/BigPizzaV3/CodexPlusPlus',
          JSON.stringify(['Codex', 'ChatGPT', 'Tauri']),
          'Windows / macOS',
          1,
          10,
        ],
        [
          'cc-switch',
          'CC Switch',
          '跨平台的 AI 编程助手配置管理工具，可集中维护和切换 Claude Code、Codex 等客户端的 Provider 配置。',
          null,
          'https://github.com/farion1231/cc-switch',
          JSON.stringify(['Codex', 'Claude Code', '配置管理']),
          'Windows / macOS / Linux',
          1,
          20,
        ],
      ]

      for (const item of defaults) {
        seed.run(...item, now, now, now)
      }
    },
  },
  {
    id: 21,
    name: 'localize_default_community_icons',
    up(db) {
      db.prepare(`
        UPDATE community_items
        SET icon_url = '/community/codex-plus-plus.png', updated_at = ?
        WHERE slug = 'codex-plus-plus'
          AND icon_url = 'https://raw.githubusercontent.com/BigPizzaV3/CodexPlusPlus/main/docs/images/codex-plus-plus.png'
      `).run(new Date().toISOString())
      db.prepare(`
        UPDATE community_items
        SET icon_url = NULL, updated_at = ?
        WHERE slug = 'cc-switch'
          AND icon_url = 'https://raw.githubusercontent.com/farion1231/cc-switch/main/src-tauri/icons/icon.png'
      `).run(new Date().toISOString())
    },
  },
  {
    id: 22,
    name: 'extend_community_details_and_images',
    up(db) {
      const columns = new Set(db.prepare('PRAGMA table_info(community_items)').all().map((row) => row.name))
      if (!columns.has('description_md')) {
        db.exec('ALTER TABLE community_items ADD COLUMN description_md TEXT NOT NULL DEFAULT \'\';')
      }
      db.exec(`
        CREATE TABLE IF NOT EXISTS community_item_images (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          item_id INTEGER NOT NULL REFERENCES community_items(id) ON DELETE CASCADE,
          image_url TEXT NOT NULL,
          title TEXT,
          alt_text TEXT,
          sort_order INTEGER NOT NULL DEFAULT 1000,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_community_item_images_item_order
          ON community_item_images(item_id, sort_order, id);
      `)
    },
  },
  {
    id: 23,
    name: 'add_agent_and_plugin_community_categories',
    up(db) {
      db.exec(`
        CREATE TEMP TABLE community_likes_backup AS
          SELECT item_id, user_id, created_at FROM community_likes;
        CREATE TEMP TABLE community_item_images_backup AS
          SELECT id, item_id, image_url, title, alt_text, sort_order, created_at, updated_at
          FROM community_item_images;

        DROP TABLE community_likes;
        DROP TABLE community_item_images;

        CREATE TABLE community_items_next (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          slug TEXT NOT NULL UNIQUE,
          category TEXT NOT NULL CHECK (category IN ('tools', 'skills', 'mcp', 'agent', 'plugin')),
          name TEXT NOT NULL,
          summary TEXT NOT NULL,
          icon_url TEXT,
          official_url TEXT NOT NULL,
          tags_json TEXT NOT NULL DEFAULT '[]',
          compatibility TEXT,
          status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
          is_featured INTEGER NOT NULL DEFAULT 0 CHECK (is_featured IN (0, 1)),
          sort_order INTEGER NOT NULL DEFAULT 1000,
          like_count INTEGER NOT NULL DEFAULT 0 CHECK (like_count >= 0),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          published_at TEXT,
          description_md TEXT NOT NULL DEFAULT ''
        );

        INSERT INTO community_items_next (
          id, slug, category, name, summary, icon_url, official_url, tags_json,
          compatibility, status, is_featured, sort_order, like_count,
          created_at, updated_at, published_at, description_md
        )
        SELECT
          id, slug, category, name, summary, icon_url, official_url, tags_json,
          compatibility, status, is_featured, sort_order, like_count,
          created_at, updated_at, published_at, description_md
        FROM community_items;

        DROP TABLE community_items;
        ALTER TABLE community_items_next RENAME TO community_items;

        CREATE INDEX idx_community_items_public
          ON community_items(status, category, is_featured DESC, sort_order, name);

        CREATE TABLE community_likes (
          item_id INTEGER NOT NULL REFERENCES community_items(id) ON DELETE CASCADE,
          user_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (item_id, user_id)
        );
        INSERT INTO community_likes (item_id, user_id, created_at)
          SELECT item_id, user_id, created_at FROM community_likes_backup;
        CREATE INDEX idx_community_likes_user
          ON community_likes(user_id, created_at DESC);

        CREATE TABLE community_item_images (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          item_id INTEGER NOT NULL REFERENCES community_items(id) ON DELETE CASCADE,
          image_url TEXT NOT NULL,
          title TEXT,
          alt_text TEXT,
          sort_order INTEGER NOT NULL DEFAULT 1000,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        INSERT INTO community_item_images (
          id, item_id, image_url, title, alt_text, sort_order, created_at, updated_at
        )
        SELECT id, item_id, image_url, title, alt_text, sort_order, created_at, updated_at
        FROM community_item_images_backup;
        CREATE INDEX idx_community_item_images_item_order
          ON community_item_images(item_id, sort_order, id);

        DROP TABLE community_likes_backup;
        DROP TABLE community_item_images_backup;
      `)
    },
  },
  {
    id: 24,
    name: 'create_asset_metadata',
    up(db) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS asset_metadata (
          filename TEXT PRIMARY KEY,
          kind TEXT NOT NULL DEFAULT 'long_term' CHECK (kind IN ('replaceable', 'long_term')),
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_asset_metadata_kind_updated
          ON asset_metadata(kind, updated_at DESC);
      `)
    },
  },
]
