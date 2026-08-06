import { defineEventHandler, getRouterParam, readBody } from 'h3'
import { createFeedbackRepository } from '../../../domain/feedback/repository.js'
import { updateFeedbackSchema } from '../../../domain/feedback/schema.js'
import { apiError, apiOk } from '../../../utils/api'
import { useGuideDatabase } from '../../../utils/database'
import { sendFeedbackReplyNotification } from '../../../utils/email'
import { requireAdminSession } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const parsed = updateFeedbackSchema.safeParse(await readBody(event))
  if (!parsed.success) apiError(400, 'INVALID_UPDATE', 'Feedback update is invalid.', parsed.error.flatten())

  const id = getRouterParam(event, 'id') || ''
  const repo = createFeedbackRepository(useGuideDatabase())
  const previous = repo.get(id)
  if (!previous) apiError(404, 'FEEDBACK_NOT_FOUND', 'Feedback was not found.')

  const row = repo.update(id, parsed.data)
  if (!row) apiError(404, 'FEEDBACK_NOT_FOUND', 'Feedback was not found.')

  const replyChanged = Boolean(row.admin_reply && row.admin_reply !== previous.admin_reply)
  const notification = replyChanged
    ? await sendFeedbackReplyNotification(event, row)
    : null

  return apiOk(row, notification ? { notification } : undefined)
})