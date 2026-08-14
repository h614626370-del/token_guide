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
  {
    id: 25,
    name: 'seed_domestic_codex_community_items',
    up(db) {
      const now = new Date().toISOString()
      const seed = db.prepare(`
        INSERT OR IGNORE INTO community_items (
          slug, category, name, summary, description_md, icon_url, official_url, tags_json,
          compatibility, status, is_featured, sort_order, like_count,
          created_at, updated_at, published_at
        ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, 'published', ?, ?, 0, ?, ?, ?)
      `)
      const defaults = [
        [
          'openai-codex', 'tools', 'OpenAI Codex CLI',
          'OpenAI 官方开源编码 Agent，适合通过中转站调用 Codex 模型完成代码任务。',
          'Codex CLI 是终端优先的编码 Agent，支持代码阅读、修改、测试和 Git 工作流。使用中转站时可按服务商文档配置 OpenAI 兼容地址和密钥。',
          'https://github.com/openai/codex', JSON.stringify(['Codex', '终端', '代码 Agent']),
          'macOS / Linux / Windows WSL', 1, 30,
        ],
        [
          'cherry-studio', 'tools', 'Cherry Studio',
          '面向多模型用户的开源桌面客户端，支持 OpenAI 兼容接口以及多家国产模型服务。',
          'Cherry Studio 适合同时管理 Codex、DeepSeek、通义千问、智谱和豆包等模型。它提供对话、知识库、助手和 MCP 配置能力。',
          'https://github.com/CherryHQ/cherry-studio', JSON.stringify(['Codex', '国产模型', '桌面客户端']),
          'Windows / macOS / Linux', 1, 40,
        ],
        [
          'fastgpt', 'tools', 'FastGPT',
          '面向中文用户的知识库和工作流平台，适合快速搭建企业内部 AI 应用。',
          'FastGPT 提供知识库、工作流、函数调用和多模型接入能力，支持通过 OpenAI 兼容接口连接中转站和国内模型服务。',
          'https://github.com/labring/FastGPT', JSON.stringify(['知识库', '工作流', 'RAG']),
          'Docker / Linux', 1, 50,
        ],
        [
          'maxkb', 'tools', 'MaxKB',
          '开源企业级知识库问答系统，中文文档完整，支持本地和云端部署。',
          'MaxKB 适合将企业文档、产品资料和内部规范整理为可检索的 AI 知识库，并可接入国产大模型和 OpenAI 兼容服务。',
          'https://github.com/1Panel-dev/MaxKB', JSON.stringify(['知识库', 'RAG', '国产模型']),
          'Docker / Linux', 0, 60,
        ],
        [
          'dify', 'tools', 'Dify',
          '可视化构建 LLM 应用、Agent 和工作流的平台，适合团队自部署。',
          'Dify 支持模型供应商、知识库、工作流、Agent 和插件扩展，能够统一管理国内外模型和中转站配置。',
          'https://github.com/langgenius/dify', JSON.stringify(['Agent', '工作流', '知识库']),
          'Docker / Linux', 0, 70,
        ],
        [
          'astrbot', 'tools', 'AstrBot',
          '支持 QQ 等聊天渠道的开源 Agent 框架，适合构建中文聊天机器人和自动化助手。',
          'AstrBot 提供多模型接入、消息平台适配和插件机制，适合在国内常用聊天平台中部署个人或群组助手。',
          'https://github.com/AstrBotDevs/AstrBot', JSON.stringify(['聊天机器人', 'QQ', '插件']),
          'Windows / Linux / Docker', 0, 80,
        ],
        [
          'continue', 'tools', 'Continue',
          '开源代码助手，支持在 VS Code 和 JetBrains 中接入 Codex 及国内 OpenAI 兼容模型。',
          'Continue 支持自定义模型、Provider、提示词和上下文源，适合需要在编辑器里复用中转站配置的开发者。',
          'https://github.com/continuedev/continue', JSON.stringify(['代码助手', 'VS Code', 'OpenAI 兼容']),
          'VS Code / JetBrains', 0, 90,
        ],
        [
          'cline', 'tools', 'Cline',
          'VS Code 内的开源编码 Agent，支持自定义 API 地址和浏览器工具。',
          'Cline 适合需要图形化代码 Agent 的用户，可配置 OpenAI 兼容中转站并按任务审批文件和命令操作。',
          'https://github.com/cline/cline', JSON.stringify(['代码 Agent', 'VS Code', '浏览器']),
          'VS Code', 0, 100,
        ],
        [
          'litellm', 'tools', 'LiteLLM',
          '统一代理多家模型 API 的开源网关，适合中转站和团队内部模型路由。',
          'LiteLLM 将不同模型供应商统一为 OpenAI 兼容接口，支持路由、预算、重试和日志。生产环境应单独配置鉴权、审计和网络访问控制。',
          'https://github.com/BerriAI/litellm', JSON.stringify(['API 网关', '模型路由', 'OpenAI 兼容']),
          'Docker / Linux', 1, 110,
        ],
        [
          'tencentcloud-mcp', 'mcp', 'Tencent Cloud COS MCP',
          '腾讯云 COS 官方 MCP 服务，适合让 Agent 管理对象存储和文件资源。',
          '适合已经使用腾讯云 COS 的团队，将对象存储查询和操作能力接入支持 MCP 的客户端。使用前应按官方文档配置最小权限凭证。',
          'https://github.com/TencentCloud/cos-mcp', JSON.stringify(['腾讯云', 'COS', '官方']),
          'Node.js / Docker', 1, 120,
        ],
        [
          'alibabacloud-mcp-server', 'mcp', 'Alibaba Cloud MCP Server',
          '阿里云官方 MCP 服务，适合将云产品查询和操作能力接入 AI 助手。',
          'Alibaba Cloud MCP Server 面向阿里云用户提供 MCP 接入方式，适合和通义千问、百炼及其他兼容客户端组合使用。',
          'https://github.com/aliyun/alibabacloud-mcp-server', JSON.stringify(['阿里云', '云运维', '官方']),
          'Node.js / Docker', 1, 130,
        ],
        [
          'playwright-mcp', 'mcp', 'Playwright MCP',
          '浏览器自动化 MCP 服务，适合网页操作、回归测试和国内内网系统自动化。',
          'Playwright MCP 将浏览器控制能力暴露给 Agent，可配合本地浏览器和内网系统使用。涉及登录态时应使用专用测试账号并限制权限。',
          'https://github.com/microsoft/playwright-mcp', JSON.stringify(['浏览器自动化', '测试', 'Playwright']),
          'Node.js / Windows / Linux', 0, 140,
        ],
        [
          'context7', 'mcp', 'Context7',
          '为 Agent 提供最新软件库文档的 MCP 服务，减少模型使用过时 API 的问题。',
          'Context7 适合前端、Node.js 和 Python 开发场景，可在 Codex、Claude Code 等支持 MCP 的客户端中使用。',
          'https://github.com/upstash/context7', JSON.stringify(['文档检索', '开发工具', 'MCP']),
          'Node.js / Docker', 0, 150,
        ],
        [
          'qwen-agent', 'agent', 'Qwen-Agent',
          '通义千问团队开源的 Agent 应用开发框架，支持工具调用、代码解释器和 MCP。',
          'Qwen-Agent 适合使用通义千问及其他 OpenAI 兼容模型构建中文 Agent，提供较完整的工具调用和多轮任务示例。',
          'https://github.com/QwenLM/Qwen-Agent', JSON.stringify(['通义千问', '工具调用', 'MCP']),
          'Python / Linux / Windows', 1, 160,
        ],
        [
          'openmanus', 'agent', 'OpenManus',
          '中文社区关注度较高的开源通用 Agent 项目，支持浏览器和工具编排实验。',
          'OpenManus 适合研究和验证通用 Agent 工作流。生产部署前应单独评估工具权限、网络访问和任务隔离。',
          'https://github.com/FoundationAgents/OpenManus', JSON.stringify(['通用 Agent', '自动化', '研究']),
          'Python / Linux', 0, 170,
        ],
        [
          'agentscope', 'agent', 'AgentScope',
          'ModelScope 社区的多智能体应用框架，提供中文示例和可组合的 Agent 组件。',
          'AgentScope 适合构建多智能体协作、工具调用和可观测的应用，支持连接国产模型和自定义模型服务。',
          'https://github.com/modelscope/agentscope', JSON.stringify(['多智能体', 'ModelScope', 'Python']),
          'Python / Linux / Windows', 0, 180,
        ],
        [
          'coze-studio', 'agent', 'Coze Studio',
          '字节跳动开源的 Agent 和工作流开发平台，适合中文团队自部署和二次开发。',
          'Coze Studio 提供 Agent、工作流、知识库和插件扩展能力，适合在企业内网搭建面向中文业务的 AI 应用。',
          'https://github.com/coze-dev/coze-studio', JSON.stringify(['豆包', '工作流', '企业应用']),
          'Docker / Linux', 1, 190,
        ],
        [
          'superpowers', 'skills', 'Superpowers',
          '面向软件工程 Agent 的可复用 Skills 集合，覆盖规划、实现、测试和代码审查流程。',
          'Superpowers 可以作为 Codex、Claude Code 等 Agent 的工作流参考。使用时建议按团队规范翻译和裁剪，并审查其中的命令权限。',
          'https://github.com/obra/superpowers', JSON.stringify(['软件工程', '代码审查', '工作流']),
          'Codex / Claude Code', 1, 200,
        ],
        [
          'awesome-copilot', 'skills', 'Awesome Copilot',
          'GitHub 社区维护的 Copilot 指令、Agent 和扩展配置集合，可作为中文团队的 Skills 素材库。',
          'Awesome Copilot 汇总了大量提示词和 Agent 配置。收录时建议挑选有明确用途的条目，并补充中文说明和安全注意事项。',
          'https://github.com/github/awesome-copilot', JSON.stringify(['Copilot', '提示词', 'Agent']),
          'GitHub Copilot', 0, 210,
        ],
      ]

      for (const item of defaults) {
        seed.run(...item, now, now, now)
      }
    },
  },
  {
    id: 26,
    name: 'seed_codex_tools_for_existing_community',
    up(db) {
      const now = new Date().toISOString()
      const seed = db.prepare(`
        INSERT OR IGNORE INTO community_items (
          slug, category, name, summary, description_md, icon_url, official_url, tags_json,
          compatibility, status, is_featured, sort_order, like_count,
          created_at, updated_at, published_at
        ) VALUES (?, 'tools', ?, ?, ?, NULL, ?, ?, ?, 'published', ?, ?, 0, ?, ?, ?)
      `)
      const defaults = [
        [
          'openai-codex', 'OpenAI Codex CLI',
          'OpenAI 官方开源编码 Agent，适合通过中转站调用 Codex 模型完成代码任务。',
          'Codex CLI 是终端优先的编码 Agent，支持代码阅读、修改、测试和 Git 工作流。使用中转站时可按服务商文档配置 OpenAI 兼容地址和密钥。',
          'https://github.com/openai/codex', JSON.stringify(['Codex', '终端', '代码 Agent']),
          'macOS / Linux / Windows WSL', 1, 30,
        ],
        [
          'continue', 'Continue',
          '开源代码助手，支持在 VS Code 和 JetBrains 中接入 Codex 及国内 OpenAI 兼容模型。',
          'Continue 支持自定义模型、Provider、提示词和上下文源，适合需要在编辑器里复用中转站配置的开发者。',
          'https://github.com/continuedev/continue', JSON.stringify(['代码助手', 'VS Code', 'OpenAI 兼容']),
          'VS Code / JetBrains', 0, 90,
        ],
        [
          'cline', 'Cline',
          'VS Code 内的开源编码 Agent，支持自定义 API 地址和浏览器工具。',
          'Cline 适合需要图形化代码 Agent 的用户，可配置 OpenAI 兼容中转站并按任务审批文件和命令操作。',
          'https://github.com/cline/cline', JSON.stringify(['代码 Agent', 'VS Code', '浏览器']),
          'VS Code', 0, 100,
        ],
        [
          'litellm', 'LiteLLM',
          '统一代理多家模型 API 的开源网关，适合中转站和团队内部模型路由。',
          'LiteLLM 将不同模型供应商统一为 OpenAI 兼容接口，支持路由、预算、重试和日志。生产环境应单独配置鉴权、审计和网络访问控制。',
          'https://github.com/BerriAI/litellm', JSON.stringify(['API 网关', '模型路由', 'OpenAI 兼容']),
          'Docker / Linux', 1, 110,
        ],
      ]

      for (const item of defaults) {
        seed.run(...item, now, now, now)
      }
    },
  },
  {
    id: 27,
    name: 'correct_seeded_community_urls',
    up(db) {
      db.prepare(`
        UPDATE community_items
        SET name = 'Tencent Cloud COS MCP',
            summary = '腾讯云 COS 官方 MCP 服务，适合让 Agent 管理对象存储和文件资源。',
            description_md = '适合已经使用腾讯云 COS 的团队，将对象存储查询和操作能力接入支持 MCP 的客户端。使用前应按官方文档配置最小权限凭证。',
            official_url = 'https://github.com/TencentCloud/cos-mcp',
            tags_json = ?
        WHERE slug = 'tencentcloud-mcp'
          AND official_url = 'https://github.com/TencentCloud/tencentcloud-mcp'
      `).run(JSON.stringify(['腾讯云', 'COS', '官方']))
      db.prepare(`
        UPDATE community_items
        SET official_url = 'https://github.com/aliyun/alibaba-cloud-ops-mcp-server'
        WHERE slug = 'alibabacloud-mcp-server'
          AND official_url = 'https://github.com/aliyun/alibabacloud-mcp-server'
      `).run()
      db.prepare(`
        UPDATE community_items
        SET official_url = 'https://github.com/coze-dev/coze-studio'
        WHERE slug = 'coze-studio'
          AND official_url = 'https://github.com/volcengine/CozeStudio'
      `).run()
    },
  },
  {
    id: 28,
    name: 'seed_second_batch_community_items',
    up(db) {
      const now = new Date().toISOString()
      const seed = db.prepare(`
        INSERT OR IGNORE INTO community_items (
          slug, category, name, summary, description_md, icon_url, official_url, tags_json,
          compatibility, status, is_featured, sort_order, like_count,
          created_at, updated_at, published_at
        ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, 'published', ?, ?, 0, ?, ?, ?)
      `)
      const defaults = [
        [
          'ragflow', 'tools', 'RAGFlow',
          '面向企业文档理解和知识库问答的开源 RAG 引擎，适合中文资料和复杂文档场景。',
          'RAGFlow 提供文档解析、切片、检索和生成式问答能力，适合自部署企业知识库，并可连接国产模型或 OpenAI 兼容中转站。',
          'https://github.com/infiniflow/ragflow', JSON.stringify(['RAG', '文档解析', '企业知识库']),
          'Docker / Linux', 1, 65,
        ],
        [
          'lobehub', 'tools', 'LobeHub',
          '中文用户活跃的开源多模型客户端，支持助手、知识库、插件和 OpenAI 兼容 Provider。',
          'LobeHub 适合个人和团队统一管理 Codex、DeepSeek、通义千问、智谱等模型。部署前应根据中转站文档配置模型地址和访问密钥。',
          'https://github.com/lobehub/lobehub', JSON.stringify(['多模型', '知识库', '中文社区']),
          'Docker / Web', 0, 115,
        ],
        [
          'deer-flow', 'agent', 'DeerFlow',
          '字节跳动开源的复杂任务 Agent 框架，支持研究、写作、代码和多步骤工具编排。',
          'DeerFlow 适合验证长流程 Agent 和子任务协作。生产使用时应限制浏览器、文件系统和网络工具权限，并单独审查模型调用成本。',
          'https://github.com/bytedance/deer-flow', JSON.stringify(['复杂任务', '多智能体', '字节跳动']),
          'Docker / Linux', 0, 195,
        ],
      ]

      for (const item of defaults) {
        seed.run(...item, now, now, now)
      }
    },
  },
  {
    id: 29,
    name: 'seed_database_community_mcp',
    up(db) {
      const now = new Date().toISOString()
      db.prepare(`
        INSERT OR IGNORE INTO community_items (
          slug, category, name, summary, description_md, icon_url, official_url, tags_json,
          compatibility, status, is_featured, sort_order, like_count,
          created_at, updated_at, published_at
        ) VALUES (?, 'mcp', ?, ?, ?, NULL, ?, ?, ?, 'published', ?, ?, 0, ?, ?, ?)
      `).run(
        'dbhub', 'DBHub',
        'Bytebase 开源的通用数据库 MCP 服务，支持 PostgreSQL、MySQL、SQL Server、MariaDB 和 SQLite。',
        'DBHub 适合让 Codex 等 Agent 在受控条件下查询数据库结构和数据。生产环境建议使用只读账号、数据库白名单和独立审计账号，禁止直接暴露高权限凭证。',
        'https://github.com/bytebase/dbhub', JSON.stringify(['数据库', 'SQL', 'Bytebase']),
        'Go / Docker / Windows / Linux', 1, 135, now, now, now,
      )
    },
  },
  {
    id: 30,
    name: 'seed_renwei_writing_skill',
    up(db) {
      const now = new Date().toISOString()
      db.prepare(`
        INSERT OR IGNORE INTO community_items (
          slug, category, name, summary, description_md, icon_url, official_url, tags_json,
          compatibility, status, is_featured, sort_order, like_count,
          created_at, updated_at, published_at
        ) VALUES (?, 'skills', ?, ?, ?, NULL, ?, ?, ?, 'published', ?, ?, 0, ?, ?, ?)
      `).run(
        'renwei-writing', 'Renwei Writing',
        '面向中文文本润色和改写的 Skill，强调保留作者的语气、立场和个人存在感。',
        'Renwei Writing 适合把 AI 生成的文案、说明和文章改得更像真实的人在说话。它强调少改、白描和保留手迹，适合 Codex、Claude Code 等支持 Skill 的 Agent。使用时仍应由作者确认最终文本和事实准确性。',
        'https://github.com/orange2ai/renwei-writing', JSON.stringify(['中文写作', '润色改写', '去 AI 味']),
        'Codex / Claude Code', 1, 220, now, now, now,
      )
    },
  },
  {
    id: 31,
    name: 'create_community_categories',
    up(db) {
      const now = new Date().toISOString()
      db.exec(`
        CREATE TABLE community_categories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          slug TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          icon_key TEXT NOT NULL DEFAULT 'box',
          description TEXT NOT NULL DEFAULT '',
          is_visible INTEGER NOT NULL DEFAULT 0 CHECK (is_visible IN (0, 1)),
          sort_order INTEGER NOT NULL DEFAULT 1000,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX idx_community_categories_visible_order
          ON community_categories(is_visible, sort_order, name);
      `)

      const seedCategory = db.prepare(`
        INSERT INTO community_categories (
          slug, name, icon_key, description, is_visible, sort_order, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 1, ?, ?, ?)
      `)
      const categories = [
        ['tools', '开源工具', 'wrench', '社区整理的开源工具与实用项目。', 10],
        ['skills', 'Skills', 'box', '可复用的 Agent Skills 与工作流能力。', 20],
        ['mcp', 'MCP', 'sliders-horizontal', '可连接模型与外部服务的 MCP 工具。', 30],
        ['agent', 'Agent', 'bot', '面向不同任务场景的智能 Agent。', 40],
        ['plugin', 'Plugin', 'package', '扩展客户端和工作流能力的插件。', 50],
      ]
      for (const category of categories) seedCategory.run(...category, now, now)

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
          category TEXT NOT NULL REFERENCES community_categories(slug) ON UPDATE CASCADE ON DELETE RESTRICT,
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
]
