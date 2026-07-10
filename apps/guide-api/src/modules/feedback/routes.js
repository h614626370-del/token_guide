import { requireAdmin } from '../../http/admin-auth.js'
import { getClientIp, getUserAgent, hashIp } from '../../http/request.js'
import { created, fail, ok } from '../../http/responses.js'
import { requireGuideUser } from '../../http/sub2api-user-auth.js'
import { todayChinaStartIso } from './quota-time.js'
import { createFeedbackRepository } from './repository.js'
import {
  createFeedbackSchema,
  listFeedbackQuerySchema,
  listMyFeedbackQuerySchema,
  updateFeedbackSchema,
} from './schema.js'

export async function feedbackRoutes(app, { db, config }) {
  const repo = createFeedbackRepository(db)
  const adminAuth = requireAdmin(config)
  const guideUserAuth = requireGuideUser({ db, config, logger: app.log })

  app.get('/feedback/quota', { preHandler: guideUserAuth }, async (request, reply) => {
    return ok(reply, repo.quotaForUser(request.guideUser.id, todayChinaStartIso(), config.feedbackDailyLimit))
  })

  app.get('/feedback/me', { preHandler: guideUserAuth }, async (request, reply) => {
    const parsed = listMyFeedbackQuerySchema.safeParse(request.query || {})
    if (!parsed.success) {
      return fail(reply, 400, 'INVALID_QUERY', 'Feedback query is invalid.', parsed.error.flatten())
    }

    const result = repo.listUser(request.guideUser.id, parsed.data)
    return ok(reply, result.items, {
      total: result.total,
      page: result.page,
      page_size: result.page_size,
      pages: result.pages,
      quota: repo.quotaForUser(request.guideUser.id, todayChinaStartIso(), config.feedbackDailyLimit),
    })
  })

  app.post('/feedback', { preHandler: guideUserAuth }, async (request, reply) => {
    const parsed = createFeedbackSchema.safeParse(request.body || {})
    if (!parsed.success) {
      return fail(reply, 400, 'INVALID_FEEDBACK', 'Feedback payload is invalid.', parsed.error.flatten())
    }

    const input = parsed.data
    const quotaBefore = repo.quotaForUser(request.guideUser.id, todayChinaStartIso(), config.feedbackDailyLimit)
    if (quotaBefore.remaining <= 0) {
      return fail(reply, 429, 'DAILY_LIMIT_REACHED', 'Daily feedback limit reached.', {
        quota: quotaBefore,
      })
    }

    const clientIp = getClientIp(request, config.trustProxy)
    const row = repo.create({
      ...input,
      user_id: request.guideUser.id,
      user_email: request.guideUser.email,
      user_name: request.guideUser.username,
      ip_hash: hashIp(clientIp, config.ipHashSalt),
      user_agent: getUserAgent(request),
      metadata: {
        ...(input.metadata || {}),
        request_id: request.id,
      },
    })

    return created(reply, {
      id: row.public_id,
      status: row.status,
      created_at: row.created_at,
    }, {
      quota: repo.quotaForUser(request.guideUser.id, todayChinaStartIso(), config.feedbackDailyLimit),
    })
  })

  app.get('/admin/feedback', { preHandler: adminAuth }, async (request, reply) => {
    const parsed = listFeedbackQuerySchema.safeParse(request.query || {})
    if (!parsed.success) {
      return fail(reply, 400, 'INVALID_QUERY', 'Feedback query is invalid.', parsed.error.flatten())
    }

    const result = repo.list(parsed.data)
    return ok(reply, result.items, {
      total: result.total,
      page: result.page,
      page_size: result.page_size,
      pages: result.pages,
    })
  })

  app.get('/admin/feedback/:id', { preHandler: adminAuth }, async (request, reply) => {
    const row = repo.get(request.params.id)
    if (!row) return fail(reply, 404, 'FEEDBACK_NOT_FOUND', 'Feedback not found.')
    return ok(reply, row)
  })

  app.patch('/admin/feedback/:id', { preHandler: adminAuth }, async (request, reply) => {
    const parsed = updateFeedbackSchema.safeParse(request.body || {})
    if (!parsed.success) {
      return fail(reply, 400, 'INVALID_UPDATE', 'Feedback update is invalid.', parsed.error.flatten())
    }

    const row = repo.update(request.params.id, parsed.data)
    if (!row) return fail(reply, 404, 'FEEDBACK_NOT_FOUND', 'Feedback not found.')
    return ok(reply, row)
  })
}
