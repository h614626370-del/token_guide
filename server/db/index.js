import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { migrations } from './migrations.js'

const legacyModelPricingMigrations = [
  { id: 37, name: 'create_model_pricing_overrides' },
  { id: 38, name: 'create_group_model_pricing' },
  { id: 39, name: 'add_group_model_pricing_visibility' },
  { id: 40, name: 'extend_model_pricing_for_images_and_ordering' },
  { id: 41, name: 'add_model_pricing_official_overrides_and_group_names' },
  { id: 42, name: 'add_model_pricing_official_price_unit' },
  { id: 43, name: 'create_model_pricing_public_snapshots' },
]

export function openDatabase(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true })

  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')

  migrate(db)
  return db
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `)

  reconcileLegacyModelPricingMigrationIds(db)

  const applied = new Set(
    db.prepare('SELECT id FROM schema_migrations').all().map((row) => row.id),
  )
  const insertMigration = db.prepare(
    'INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)',
  )

  const run = db.transaction(() => {
    for (const migration of migrations) {
      if (applied.has(migration.id)) continue
      migration.up(db)
      insertMigration.run(migration.id, migration.name, new Date().toISOString())
    }
  })

  run()
}

function reconcileLegacyModelPricingMigrationIds(db) {
  const rows = db.prepare(`
    SELECT id, name
    FROM schema_migrations
    WHERE id BETWEEN 37 AND 43
    ORDER BY id
  `).all()
  const isLegacyLayout = legacyModelPricingMigrations.every((migration, index) => (
    rows[index]?.id === migration.id && rows[index]?.name === migration.name
  ))

  if (!isLegacyLayout || rows.length !== legacyModelPricingMigrations.length) return

  const shiftIds = db.transaction(() => {
    for (const migration of [...legacyModelPricingMigrations].reverse()) {
      db.prepare('UPDATE schema_migrations SET id = ? WHERE id = ? AND name = ?')
        .run(migration.id + 3, migration.id, migration.name)
    }
  })
  shiftIds()
}
