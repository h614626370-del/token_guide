import { defineEventHandler, getQuery } from 'h3'
import { z } from 'zod'
import { createDocsRepository } from '../domain/docs/repository'
import { apiError, apiOk } from '../utils/api'
import { useGuideDatabase } from '../utils/database'

const querySchema = z.object({
  path: z.enum(['/', '/integration', '/member']).default('/'),
})

export default defineEventHandler((event) => {
  const parsed = querySchema.safeParse(getQuery(event))
  if (!parsed.success) apiError(400, 'INVALID_DOC_QUERY', 'Document query is invalid.', parsed.error.flatten())
  return apiOk(createDocsRepository(useGuideDatabase()).getOverrideByPath(parsed.data.path))
})
