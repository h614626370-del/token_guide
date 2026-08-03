import { defineEventHandler, getRouterParam } from 'h3'
import { createFeedbackRepository } from '../../../domain/feedback/repository.js'
import { apiError, apiOk } from '../../../utils/api'
import { useGuideDatabase } from '../../../utils/database'
import { requireAdminSession } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const row = createFeedbackRepository(useGuideDatabase()).get(getRouterParam(event, 'id') || '')
  if (!row) apiError(404, 'FEEDBACK_NOT_FOUND', 'Feedback was not found.')
  return apiOk(row)
})
