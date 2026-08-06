import { defineEventHandler, readBody } from 'h3'
import { emailSettingsSchema } from '../../domain/email/schema'
import { apiError, apiOk } from '../../utils/api'
import { updateEmailSettings } from '../../utils/email'
import { requireAdminSession } from '../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const parsed = emailSettingsSchema.safeParse(await readBody(event))
  if (!parsed.success) apiError(400, 'INVALID_EMAIL_SETTINGS', '邮件设置格式不正确。', parsed.error.flatten())

  const result = updateEmailSettings(parsed.data)
  if (!result.ok) apiError(400, 'EMAIL_SETTINGS_INCOMPLETE', result.issue)
  return apiOk(result.settings)
})