import type { H3Event } from 'h3'
import nodemailer from 'nodemailer'
import type { EmailSettingsInput } from '../domain/email/schema'
import { feedbackReplyEmail, isEmail, renderEmailTemplate } from '../domain/email/template'
import {
  createEmailSettingsRepository,
  type EmailSettings,
} from '../domain/email/repository'
import { useGuideDatabase } from './database'
import { getPublicSiteConfig } from './site-config'
import { getGuideConfig } from './config'
import type { UpstreamAlert } from '../domain/upstreams/service'

export type EmailDeliveryStatus = 'sent' | 'disabled' | 'skipped' | 'failed'

export interface EmailDeliveryResult {
  status: EmailDeliveryStatus
  reason?: 'not_configured' | 'missing_recipient' | 'delivery_failed'
}

interface FeedbackEmailData {
  public_id: string
  category: string
  title: string
  content: string
  contact?: string | null
  page_url?: string | null
  user_email?: string | null
  user_name?: string | null
  admin_reply?: string | null
  created_at: string
}

const categoryLabels: Record<string, string> = {
  bug: '页面问题',
  billing: '充值账单',
  api: 'API 接入',
  playground: '模型试用',
  pricing: '价格说明',
  suggestion: '功能建议',
  other: '其他',
}

export function getPublicEmailSettings() {
  return createEmailSettingsRepository(useGuideDatabase()).getPublic()
}

export function updateEmailSettings(input: EmailSettingsInput) {
  const repo = createEmailSettingsRepository(useGuideDatabase())
  const current = repo.get()
  const candidate: EmailSettings = {
    ...current,
    ...input,
    smtp_password: input.clear_smtp_password ? '' : (input.smtp_password || current.smtp_password),
  }
  const issue = validateOperationalSettings(candidate)
  if (input.enabled && issue) {
    return { ok: false as const, issue }
  }
  return { ok: true as const, settings: repo.update(input) }
}

export async function sendAdminFeedbackNotification(event: H3Event, feedback: FeedbackEmailData): Promise<EmailDeliveryResult> {
  const settings = createEmailSettingsRepository(useGuideDatabase()).get()
  if (!settings.enabled) return { status: 'disabled', reason: 'not_configured' }

  const site = getPublicSiteConfig(event)
  const variables = feedbackVariables(feedback, site.project_name, site.site_url)
  return deliver(settings, {
    to: settings.admin_email,
    subject: renderEmailTemplate(settings.admin_subject_template, variables),
    text: renderEmailTemplate(settings.admin_body_template, variables),
  })
}

export async function sendFeedbackReplyNotification(event: H3Event, feedback: FeedbackEmailData): Promise<EmailDeliveryResult> {
  const recipient = feedbackReplyEmail(feedback)
  if (!recipient) return { status: 'skipped', reason: 'missing_recipient' }

  const settings = createEmailSettingsRepository(useGuideDatabase()).get()
  if (!settings.enabled) return { status: 'disabled', reason: 'not_configured' }

  const site = getPublicSiteConfig(event)
  const variables = feedbackVariables(feedback, site.project_name, site.site_url)
  return deliver(settings, {
    to: recipient,
    subject: renderEmailTemplate(settings.reply_subject_template, variables),
    text: renderEmailTemplate(settings.reply_body_template, variables),
  })
}

export async function sendEmailSettingsTest(event: H3Event): Promise<EmailDeliveryResult> {
  const settings = createEmailSettingsRepository(useGuideDatabase()).get()
  if (!settings.enabled) return { status: 'disabled', reason: 'not_configured' }

  const site = getPublicSiteConfig(event)
  return deliver(settings, {
    to: settings.admin_email,
    subject: '[' + site.project_name + '] 邮件通知测试',
    text: '这是一封来自 ' + site.site_title + ' 的 SMTP 配置测试邮件。\n\n发送时间：' + formatDate(new Date().toISOString()),
  })
}

export async function sendUpstreamBalanceAlert(alert: UpstreamAlert): Promise<EmailDeliveryResult> {
  const settings = createEmailSettingsRepository(useGuideDatabase()).get()
  if (!settings.enabled) return { status: 'disabled', reason: 'not_configured' }
  const recipients = settings.upstream_alert_emails.length ? settings.upstream_alert_emails : [settings.admin_email].filter(Boolean)
  if (!recipients.length) return { status: 'skipped', reason: 'missing_recipient' }
  const kind = alert.kind === 'exhausted' ? '余额已用完' : '余额不足'
  return deliver(settings, {
    to: recipients,
    subject: `[${getGuideConfig().projectName}] 上游${kind}：${alert.name.replace(/[\r\n]/g, ' ')}`,
    text: `上游${kind}，请及时充值或调整账号。\n\n上游名称：${alert.name}\n上游地址：${alert.base_url}\n当前余额：${alert.balance} ${alert.unit}\n告警阈值：${alert.threshold} ${alert.unit}\n检查时间：${formatDate(new Date().toISOString())}`,
  })
}

function feedbackVariables(feedback: FeedbackEmailData, projectName: string, siteUrl: string) {
  const baseUrl = siteUrl.replace(/\/+$/, '')
  return {
    project_name: projectName,
    feedback_id: feedback.public_id,
    category: categoryLabels[feedback.category] || feedback.category || '其他',
    title: feedback.title,
    content: feedback.content,
    user_name: feedback.user_name || '用户',
    user_email: feedback.user_email || '未提供',
    reply_email: feedbackReplyEmail(feedback) || '未提供',
    page_url: feedback.page_url || '未提供',
    admin_reply: feedback.admin_reply || '',
    created_at: formatDate(feedback.created_at),
    feedback_url: baseUrl + '/feedback',
    admin_url: baseUrl + '/admin/feedback',
  }
}

function validateOperationalSettings(settings: EmailSettings) {
  if (!settings.smtp_host) return 'SMTP 服务器不能为空。'
  if (!settings.from_email || !isEmail(settings.from_email)) return '发件邮箱无效。'
  if (!settings.admin_email || !isEmail(settings.admin_email)) return '管理员收件邮箱无效。'
  if (settings.smtp_username && !settings.smtp_password) return '已填写 SMTP 用户名时必须配置 SMTP 密码。'
  return ''
}

async function deliver(
  settings: EmailSettings,
  message: { to: string | string[], subject: string, text: string },
): Promise<EmailDeliveryResult> {
  const issue = validateOperationalSettings(settings)
  const recipients = Array.isArray(message.to) ? message.to : [message.to]
  if (issue || !recipients.length || recipients.some(recipient => !isEmail(recipient))) return { status: 'failed', reason: 'delivery_failed' }

  const transporter = nodemailer.createTransport({
    host: settings.smtp_host,
    port: settings.smtp_port,
    secure: settings.smtp_secure,
    auth: settings.smtp_username
      ? { user: settings.smtp_username, pass: settings.smtp_password }
      : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  })

  try {
    const result = await transporter.sendMail({
      from: { name: settings.from_name || '指南中心', address: settings.from_email },
      ...(Array.isArray(message.to) ? { bcc: message.to } : { to: message.to }),
      subject: message.subject,
      text: message.text,
    })
    return result.rejected?.length ? { status: 'failed', reason: 'delivery_failed' } : { status: 'sent' }
  } catch (error) {
    console.error('[email] delivery failed:', error instanceof Error ? error.message : 'Unknown SMTP error')
    return { status: 'failed', reason: 'delivery_failed' }
  } finally {
    transporter.close()
  }
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return value
  }
}
