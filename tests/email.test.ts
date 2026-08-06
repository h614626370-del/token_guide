import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../server/db/index.js'
import {
  createEmailSettingsRepository,
  defaultEmailSettings,
} from '../server/domain/email/repository'
import { feedbackReplyEmail, renderEmailTemplate } from '../server/domain/email/template'

const temporaryDirectories: string[] = []

function createRepository() {
  const directory = mkdtempSync(join(tmpdir(), 'kkflow-guide-email-'))
  temporaryDirectories.push(directory)
  const db = openDatabase(join(directory, 'guide.sqlite'))
  return { db, repo: createEmailSettingsRepository(db) }
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('email settings repository', () => {
  it('keeps SMTP passwords server-side and only clears them explicitly', () => {
    const { db, repo } = createRepository()
    try {
      expect(repo.getPublic()).toMatchObject({
        enabled: false,
        smtp_host: 'smtp.gmail.com',
        smtp_port: 587,
        smtp_secure: false,
        smtp_username: '',
        from_email: '',
        admin_email: '',
        smtp_password_configured: false,
      })
      expect(repo.get().smtp_password).toBe('')

      const input = {
        ...defaultEmailSettings,
        enabled: true,
        smtp_host: 'smtp.example.com',
        smtp_username: 'notice@example.com',
        smtp_password: 'smtp-secret',
        from_name: 'Guide',
        from_email: 'notice@example.com',
        admin_email: 'admin@example.com',
      }
      const saved = repo.update(input)
      expect(saved).not.toHaveProperty('smtp_password')
      expect(saved).toMatchObject({
        enabled: true,
        smtp_password_configured: true,
        smtp_password_masked: '********',
      })
      expect(db.prepare("SELECT value, is_secret FROM email_settings WHERE key = 'smtp_password'").get()).toEqual({
        value: 'smtp-secret',
        is_secret: 1,
      })

      repo.update({ ...input, smtp_password: null })
      expect(repo.get().smtp_password).toBe('smtp-secret')

      repo.update({ ...input, smtp_password: null, clear_smtp_password: true })
      expect(repo.getPublic().smtp_password_configured).toBe(false)
    } finally {
      db.close()
    }
  })
})

describe('email templates', () => {
  it('renders known variables and removes unknown variables', () => {
    expect(renderEmailTemplate(
      '{{project_name}} / {{ title }} / {{missing}}',
      { project_name: 'Token向云', title: '反馈标题' },
    )).toBe('Token向云 / 反馈标题 / ')
  })

  it('only uses an explicitly supplied valid reply email', () => {
    expect(feedbackReplyEmail({ contact: ' user@example.com ' })).toBe('user@example.com')
    expect(feedbackReplyEmail({ contact: '微信 example' })).toBeNull()
    expect(feedbackReplyEmail({ contact: null })).toBeNull()
  })
})