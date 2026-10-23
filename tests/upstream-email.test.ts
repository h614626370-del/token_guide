import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDatabase } from '../server/db/index.js'
import { createEmailSettingsRepository, defaultEmailSettings } from '../server/domain/email/repository'
import { emailSettingsSchema } from '../server/domain/email/schema'
import { sendUpstreamBalanceAlert } from '../server/utils/email'

const transport = vi.hoisted(() => ({ sendMail: vi.fn(), close: vi.fn() }))
vi.mock('nodemailer', () => ({ default: { createTransport: () => transport } }))

let directory: string
let db: ReturnType<typeof openDatabase>
const alert = { name: '测试供应商', base_url: 'https://upstream.example', balance: 0, unit: 'USD', threshold: 10, kind: 'exhausted' as const }

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'guide-upstream-email-'))
  db = openDatabase(join(directory, 'guide.sqlite'))
  globalThis.__guideDatabase = db
  vi.stubGlobal('useRuntimeConfig', () => ({}))
  transport.sendMail.mockResolvedValue({ accepted: ['ops@example.com', 'finance@example.com'], rejected: [] })
})

afterEach(() => {
  globalThis.__guideDatabase = undefined
  db.close()
  rmSync(directory, { recursive: true, force: true })
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

function configure(recipients: string[] = ['ops@example.com', 'finance@example.com']) {
  createEmailSettingsRepository(db).update({ ...defaultEmailSettings, enabled: true, from_email: 'notice@example.com', admin_email: 'admin@example.com', upstream_alert_emails: recipients })
}

describe('upstream alert email delivery', () => {
  it('reuses configured SMTP and sends to multiple recipients without exposing recipient addresses to each other', async () => {
    configure()
    expect(await sendUpstreamBalanceAlert(alert)).toEqual({ status: 'sent' })
    expect(transport.sendMail).toHaveBeenCalledWith(expect.objectContaining({ bcc: ['ops@example.com', 'finance@example.com'], subject: expect.stringContaining('余额已用完'), text: expect.stringContaining('当前余额：0 USD') }))
    expect(transport.sendMail.mock.calls[0]?.[0]).not.toHaveProperty('to')
    expect(transport.close).toHaveBeenCalledOnce()
  })

  it('falls back to the administrator mailbox when no alert recipients are configured', async () => {
    configure([])
    await sendUpstreamBalanceAlert({ ...alert, kind: 'low', balance: 5 })
    expect(transport.sendMail).toHaveBeenCalledWith(expect.objectContaining({ bcc: ['admin@example.com'], subject: expect.stringContaining('余额不足') }))
  })

  it('does not send while email notifications are disabled', async () => {
    expect(await sendUpstreamBalanceAlert(alert)).toEqual({ status: 'disabled', reason: 'not_configured' })
    expect(transport.sendMail).not.toHaveBeenCalled()
  })

  it('treats partial recipient rejection as a failed delivery', async () => {
    configure()
    transport.sendMail.mockResolvedValue({ accepted: ['ops@example.com'], rejected: ['finance@example.com'] })
    expect(await sendUpstreamBalanceAlert(alert)).toEqual({ status: 'failed', reason: 'delivery_failed' })
  })

  it('validates, normalizes and deduplicates the recipient list', () => {
    expect(emailSettingsSchema.parse({ ...defaultEmailSettings, upstream_alert_emails: ['Ops@example.com', 'ops@example.com'] }).upstream_alert_emails).toEqual(['ops@example.com'])
    expect(emailSettingsSchema.safeParse({ ...defaultEmailSettings, upstream_alert_emails: ['invalid'] }).success).toBe(false)
  })
})
