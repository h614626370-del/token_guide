import { defineEventHandler, getQuery } from 'h3'
import { createFeedbackRepository } from '../../domain/feedback/repository.js'
import { todayChinaStartIso } from '../../domain/feedback/quota-time.js'
import { listMyFeedbackQuerySchema } from '../../domain/feedback/schema.js'
import { apiError, apiOk } from '../../utils/api'
import { getGuideConfig } from '../../utils/config'
import { useGuideDatabase } from '../../utils/database'
import { requireUserSession } from '../../utils/session'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const parsed = listMyFeedbackQuerySchema.safeParse(getQuery(event))
  if (!parsed.success) apiError(400, 'INVALID_QUERY', 'Feedback query is invalid.', parsed.error.flatten())

  const config = getGuideConfig(event)
  const repo = createFeedbackRepository(useGuideDatabase())
  const result = repo.listUser(user.id, parsed.data)
  return apiOk(result.items, {
    total: result.total,
    page: result.page,
    page_size: result.page_size,
    pages: result.pages,
    quota: repo.quotaForUser(user.id, todayChinaStartIso(), config.feedbackDailyLimit),
  })
})
