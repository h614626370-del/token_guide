import { defineEventHandler } from 'h3'
import { createFeedbackRepository } from '../../domain/feedback/repository.js'
import { todayChinaStartIso } from '../../domain/feedback/quota-time.js'
import { apiOk } from '../../utils/api'
import { getGuideConfig } from '../../utils/config'
import { useGuideDatabase } from '../../utils/database'
import { requireUserSession } from '../../utils/session'

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event)
  const config = getGuideConfig(event)
  const repo = createFeedbackRepository(useGuideDatabase())
  return apiOk(repo.quotaForUser(user.id, todayChinaStartIso(), config.feedbackDailyLimit))
})
