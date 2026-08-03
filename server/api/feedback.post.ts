import { defineEventHandler, getRequestHeader, readBody } from 'h3'
import { createFeedbackRepository } from '../domain/feedback/repository.js'
import { todayChinaStartIso } from '../domain/feedback/quota-time.js'
import { createFeedbackSchema } from '../domain/feedback/schema.js'
import { apiError, apiOk } from '../utils/api'
import { getGuideConfig } from '../utils/config'
import { useGuideDatabase } from '../utils/database'
import { enforceFeedbackRateLimit, hashRequestIp } from '../utils/rate-limit'
import { requireUserSession } from '../utils/session'

export default defineEventHandler(async (event) => {
  enforceFeedbackRateLimit(event)
  const { user } = await requireUserSession(event)
  const parsed = createFeedbackSchema.safeParse(await readBody(event))
  if (!parsed.success) apiError(400, 'INVALID_FEEDBACK', 'Feedback payload is invalid.', parsed.error.flatten())

  const config = getGuideConfig(event)
  const repo = createFeedbackRepository(useGuideDatabase())
  const quota = repo.quotaForUser(user.id, todayChinaStartIso(), config.feedbackDailyLimit)
  if (quota.remaining <= 0) apiError(429, 'DAILY_LIMIT_REACHED', 'Daily feedback limit reached.', { quota })

  const row = repo.create({
    ...parsed.data,
    user_id: user.id,
    user_email: user.email,
    user_name: user.username,
    ip_hash: hashRequestIp(event),
    user_agent: getRequestHeader(event, 'user-agent') || '',
    metadata: {
      ...(parsed.data.metadata || {}),
      request_id: event.context.requestId || null,
    },
  })

  return apiOk({ id: row.public_id, status: row.status, created_at: row.created_at }, {
    quota: repo.quotaForUser(user.id, todayChinaStartIso(), config.feedbackDailyLimit),
  })
})
