import { defineEventHandler } from 'h3'
import { createInstallerRepository } from '../../../domain/installers/repository'
import { installerSettingsSchema } from '../../../domain/installers/schema'
import { apiError, apiOk } from '../../../utils/api'
import { useGuideDatabase } from '../../../utils/database'
import { readLimitedJson } from '../../../utils/request-body'
import { requireAdminSession } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const parsed = installerSettingsSchema.safeParse(await readLimitedJson(event, 16 * 1024))
  if (!parsed.success) apiError(400, 'INVALID_INSTALLER_SETTINGS', '脚本公共配置格式不正确。', parsed.error.flatten())
  return apiOk(createInstallerRepository(useGuideDatabase()).updateSettings(parsed.data))
})
