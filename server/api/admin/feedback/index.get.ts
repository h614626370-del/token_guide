import { defineEventHandler, getQuery } from 'h3'
import { createFeedbackRepository } from '../../../domain/feedback/repository.js'
import { listFeedbackQuerySchema } from '../../../domain/feedback/schema.js'
import { apiError, apiOk } from '../../../utils/api'
import { useGuideDatabase } from '../../../utils/database'
import { requireAdminSession } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const parsed = listFeedbackQuerySchema.safeParse(getQuery(event))
  if (!parsed.success) apiError(400, 'INVALID_QUERY', 'Feedback query is invalid.', parsed.error.flatten())
  const result = createFeedbackRepository(useGuideDatabase()).list(parsed.data)
  return apiOk(result.items, {
    total: result.total,
    page: result.page,
    page_size: result.page_size,
    pages: result.pages,
  })
})
