import { defineEventHandler, getRouterParam } from 'h3'
import { createInstallerRepository } from '../../../domain/installers/repository'
import { apiError, apiOk } from '../../../utils/api'
import { useGuideDatabase } from '../../../utils/database'
import { requireAdminSession } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const script = createInstallerRepository(useGuideDatabase()).get(getRouterParam(event, 'id') || '')
  if (!script) apiError(404, 'INSTALLER_SCRIPT_NOT_FOUND', 'Installer script was not found.')
  return apiOk(script)
})
