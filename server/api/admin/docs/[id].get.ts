import { defineEventHandler, getRouterParam } from 'h3'
import { createDocsRepository } from '../../../domain/docs/repository'
import { apiError, apiOk } from '../../../utils/api'
import { useGuideDatabase } from '../../../utils/database'
import { requireAdminSession } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const doc = createDocsRepository(useGuideDatabase()).get(getRouterParam(event, 'id') || '')
  if (!doc) apiError(404, 'DOC_NOT_FOUND', 'Document was not found.')
  return apiOk(doc)
})
