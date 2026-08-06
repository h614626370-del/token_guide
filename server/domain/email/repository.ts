import type Database from 'better-sqlite3'
import type { EmailSettingsInput } from './schema'

export interface EmailSettings {
  enabled: boolean
  smtp_host: string
  smtp_port: number
  smtp_secure: boolean
  smtp_username: string
  smtp_password: string
  from_name: string
  from_email: string
  admin_email: string
  admin_subject_template: string
  admin_body_template: string
  reply_subject_template: string
  reply_body_template: string
}

export const defaultEmailSettings: Readonly<EmailSettings> = Object.freeze({
  enabled: false,
  smtp_host: 'smtp.gmail.com',
  smtp_port: 587,
  smtp_secure: false,
  smtp_username: '',
  smtp_password: '',
  from_name: '指南中心',
  from_email: '',
  admin_email: '',
  admin_subject_template: '[{{project_name}}反馈] {{title}}',
  admin_body_template: `收到一条新的用户反馈。

反馈编号：{{feedback_id}}
问题类型：{{category}}
标题：{{title}}
用户：{{user_name}}
账号邮箱：{{user_email}}
回复邮箱：{{reply_email}}
来源页面：{{page_url}}

反馈内容：
{{content}}

管理地址：{{admin_url}}`,
  reply_subject_template: '[{{project_name}}] 您的反馈已有回复：{{title}}',
  reply_body_template: `{{user_name}}，您好：

您提交的反馈“{{title}}”已有管理员回复：

{{admin_reply}}

反馈编号：{{feedback_id}}
查看反馈：{{feedback_url}}

{{project_name}}`,
})

const persistedKeys = [
  'enabled',
  'smtp_host',
  'smtp_port',
  'smtp_secure',
  'smtp_username',
  'from_name',
  'from_email',
  'admin_email',
  'admin_subject_template',
  'admin_body_template',
  'reply_subject_template',
  'reply_body_template',
] as const

export function createEmailSettingsRepository(db: Database.Database) {
  const list = db.prepare('SELECT key, value FROM email_settings ORDER BY key ASC')
  const upsert = db.prepare(`
    INSERT INTO email_settings (key, value, is_secret, created_at, updated_at)
    VALUES (@key, @value, @is_secret, @created_at, @updated_at)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      is_secret = excluded.is_secret,
      updated_at = excluded.updated_at
  `)
  const remove = db.prepare('DELETE FROM email_settings WHERE key = ?')

  function get(): EmailSettings {
    const stored = Object.fromEntries((list.all() as Array<{ key: string, value: string }>).map(row => [row.key, row.value]))
    return {
      ...defaultEmailSettings,
      ...stored,
      enabled: stored.enabled === undefined ? defaultEmailSettings.enabled : stored.enabled === 'true',
      smtp_port: parsePort(stored.smtp_port),
      smtp_secure: stored.smtp_secure === undefined ? defaultEmailSettings.smtp_secure : stored.smtp_secure === 'true',
      smtp_password: stored.smtp_password || '',
    }
  }

  return {
    get,

    getPublic() {
      const settings = get()
      const { smtp_password: password, ...publicSettings } = settings
      return {
        ...publicSettings,
        smtp_password_configured: Boolean(password),
        smtp_password_masked: password ? '********' : '',
      }
    },

    update(input: EmailSettingsInput) {
      const now = new Date().toISOString()
      const save = db.transaction(() => {
        for (const key of persistedKeys) {
          upsert.run({
            key,
            value: String(input[key]),
            is_secret: 0,
            created_at: now,
            updated_at: now,
          })
        }
        if (input.clear_smtp_password) remove.run('smtp_password')
        if (input.smtp_password) {
          upsert.run({
            key: 'smtp_password',
            value: input.smtp_password,
            is_secret: 1,
            created_at: now,
            updated_at: now,
          })
        }
      })
      save()
      return this.getPublic()
    },
  }
}

function parsePort(value: string | undefined) {
  const port = Number(value ?? defaultEmailSettings.smtp_port)
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : defaultEmailSettings.smtp_port
}