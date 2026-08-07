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
]
