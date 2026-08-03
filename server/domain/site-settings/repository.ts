import type Database from 'better-sqlite3'
import type { SiteSettingsInput } from './schema'

const settingKeys = [
  'project_name',
  'site_title',
  'site_description',
  'logo_path',
  'footer_text',
  'main_site_url',
  'login_path',
  'register_path',
  'support_path',
  'api_path',
  'support_wechat',
  'support_group_url',
] as const satisfies readonly (keyof SiteSettingsInput)[]

export function createSiteSettingsRepository(db: Database.Database) {
  const list = db.prepare('SELECT key, value FROM site_settings ORDER BY key ASC')
  const upsert = db.prepare(`
    INSERT INTO site_settings (key, value, created_at, updated_at)
    VALUES (@key, @value, @created_at, @updated_at)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `)

  const save = db.transaction((input: SiteSettingsInput) => {
    const now = new Date().toISOString()
    for (const key of settingKeys) {
      upsert.run({ key, value: input[key], created_at: now, updated_at: now })
    }
  })

  return {
    listOverrides() {
      return Object.fromEntries(
        (list.all() as Array<{ key: string, value: string }>)
          .filter(row => settingKeys.includes(row.key as keyof SiteSettingsInput))
          .map(row => [row.key, row.value]),
      ) as Partial<SiteSettingsInput>
    },

    update(input: SiteSettingsInput) {
      save(input)
      return this.listOverrides()
    },
  }
}
