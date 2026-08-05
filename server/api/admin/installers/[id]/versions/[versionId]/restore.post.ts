import { defineEventHandler, getRouterParam } from 'h3'
import { createInstallerRepository } from '../../../../../../domain/installers/repository'
import { apiError, apiOk } from '../../../../../../utils/api'
import { useGuideDatabase } from '../../../../../../utils/database'
import { requireAdminSession } from '../../../../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const versionId = Number(getRouterParam(event, 'versionId'))
  if (!Number.isInteger(versionId) || versionId <= 0) apiError(400, 'INVALID_INSTALLER_VERSION', 'Installer version is invalid.')
  const script = createInstallerRepository(useGuideDatabase()).restoreVersion(getRouterParam(event, 'id') || '', versionId)
  if (!script) apiError(404, 'INSTALLER_VERSION_NOT_FOUND', 'Installer version was not found.')
  return apiOk(script)
})
