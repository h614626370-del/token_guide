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
]
