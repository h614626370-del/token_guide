import { defineEventHandler } from 'h3'
import { apiError, apiOk } from '../../../utils/api'
import { sendEmailSettingsTest } from '../../../utils/email'
import { requireAdminSession } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const result = await sendEmailSettingsTest(event)
  if (result.status === 'disabled') apiError(400, 'EMAIL_NOT_ENABLED', '请先启用并保存邮件通知。')
  if (result.status !== 'sent') apiError(502, 'EMAIL_TEST_FAILED', '测试邮件发送失败，请检查 SMTP 配置和服务器日志。')
  return apiOk({ sent: true })
})