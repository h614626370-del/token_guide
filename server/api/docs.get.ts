import { defineEventHandler, getQuery } from 'h3'
import { createDocsRepository } from '../domain/docs/repository'
import { apiError, apiOk } from '../utils/api'
import { useGuideDatabase } from '../utils/database'

export default defineEventHandler((event) => {
  const value = getQuery(event).path
  const documentPath = Array.isArray(value) ? value[0] : value
  if (typeof documentPath !== 'string' || !documentPath.startsWith('/')) {
    apiError(400, 'INVALID_DOC_QUERY', 'Document query is invalid.')
  }
  return apiOk(createDocsRepository(useGuideDatabase()).getOverrideByPath(documentPath))
})
