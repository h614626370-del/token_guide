import { defineEventHandler, getRouterParam } from 'h3'
import { createDocsRepository } from '../../../../../../domain/docs/repository'
import { apiError, apiOk } from '../../../../../../utils/api'
import { useGuideDatabase } from '../../../../../../utils/database'
import { requireAdminSession } from '../../../../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const versionId = Number(getRouterParam(event, 'versionId') || 0)
  if (!Number.isInteger(versionId) || versionId <= 0) {
    apiError(400, 'INVALID_DOC_VERSION', 'Document version is invalid.')
  }
  const doc = createDocsRepository(useGuideDatabase()).restoreVersion(getRouterParam(event, 'id') || '', versionId)
  if (!doc) apiError(404, 'DOC_VERSION_NOT_FOUND', 'Document version was not found.')
  return apiOk(doc)
})
