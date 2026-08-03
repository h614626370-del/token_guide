import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { migrations } from './migrations.js'

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
