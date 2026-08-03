import { defineEventHandler, readBody } from 'h3'
import { siteSettingsSchema } from '../../domain/site-settings/schema'
import { apiError, apiOk } from '../../utils/api'
import { requireAdminSession } from '../../utils/session'
import { updatePublicSiteConfig } from '../../utils/site-config'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const parsed = siteSettingsSchema.safeParse(await readBody(event))
  if (!parsed.success) apiError(400, 'INVALID_SITE_SETTINGS', '站点配置格式不正确。', parsed.error.flatten())
  return apiOk(updatePublicSiteConfig(parsed.data, event))
})
