import { defineEventHandler, getRouterParam } from 'h3'
import { createInstallerRepository } from '../../../../domain/installers/repository'
import { installerScriptUpdateSchema } from '../../../../domain/installers/schema'
import { apiError, apiOk } from '../../../../utils/api'
import { useGuideDatabase } from '../../../../utils/database'
import { readLimitedJson } from '../../../../utils/request-body'
import { requireAdminSession } from '../../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const parsed = installerScriptUpdateSchema.safeParse(await readLimitedJson(event, 220 * 1024))
  if (!parsed.success) apiError(400, 'INVALID_INSTALLER_SCRIPT', '脚本内容格式不正确。', parsed.error.flatten())
  try {
    const script = createInstallerRepository(useGuideDatabase()).publish(getRouterParam(event, 'id') || '', parsed.data.content)
    if (!script) apiError(404, 'INSTALLER_SCRIPT_NOT_FOUND', 'Installer script was not found.')
    return apiOk(script)
  } catch (error) {
    apiError(400, 'INVALID_INSTALLER_TEMPLATE', error instanceof Error ? error.message : '脚本模板校验失败。')
  }
})
