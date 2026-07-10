import { requireAdmin } from '../../http/admin-auth.js'
import { fail, ok } from '../../http/responses.js'
import { createPricingService } from './service.js'
import {
  listSourceQuerySchema,
  updateRuntimeSettingsSchema,
  upsertGroupSettingSchema,
  upsertModelSettingSchema,
} from './schema.js'

export async function pricingRoutes(app, { db, config }) {
  const service = createPricingService({ db, config, logger: app.log })
  const adminAuth = requireAdmin(config)

  app.get('/pricing/reference', async (_request, reply) => {
    return ok(reply, await service.getReference())
  })

  app.get('/admin/pricing/config', { preHandler: adminAuth }, async (_request, reply) => {
    return ok(reply, service.listConfig())
  })

  app.get('/admin/pricing/source', { preHandler: adminAuth }, async (request, reply) => {
    const parsed = listSourceQuerySchema.safeParse(request.query || {})
    if (!parsed.success) {
      return fail(reply, 400, 'INVALID_QUERY', 'Pricing source query is invalid.', parsed.error.flatten())
    }
    return ok(reply, await service.listSource(parsed.data))
  })

  app.put('/admin/pricing/settings', { preHandler: adminAuth }, async (request, reply) => {
    const parsed = updateRuntimeSettingsSchema.safeParse(request.body || {})
    if (!parsed.success) {
      return fail(reply, 400, 'INVALID_PRICING_SETTINGS', 'Pricing runtime settings are invalid.', parsed.error.flatten())
    }
    return ok(reply, service.updateRuntimeSettings(parsed.data))
  })

  app.post('/admin/pricing/refresh', { preHandler: adminAuth }, async (_request, reply) => {
    return ok(reply, await service.getReference({ refresh: true }))
  })

  app.put('/admin/pricing/models', { preHandler: adminAuth }, async (request, reply) => {
    const parsed = upsertModelSettingSchema.safeParse(request.body || {})
    if (!parsed.success) {
      return fail(reply, 400, 'INVALID_MODEL_SETTING', 'Model display setting is invalid.', parsed.error.flatten())
    }
    return ok(reply, service.upsertModelSetting(parsed.data))
  })

  app.delete('/admin/pricing/models/:id', { preHandler: adminAuth }, async (request, reply) => {
    if (!service.deleteModelSetting(request.params.id)) {
      return fail(reply, 404, 'MODEL_SETTING_NOT_FOUND', 'Model display setting not found.')
    }
    return ok(reply, { deleted: true })
  })

  app.put('/admin/pricing/groups', { preHandler: adminAuth }, async (request, reply) => {
    const parsed = upsertGroupSettingSchema.safeParse(request.body || {})
    if (!parsed.success) {
      return fail(reply, 400, 'INVALID_GROUP_SETTING', 'Group display setting is invalid.', parsed.error.flatten())
    }
    return ok(reply, service.upsertGroupSetting(parsed.data))
  })

  app.delete('/admin/pricing/groups/:id', { preHandler: adminAuth }, async (request, reply) => {
    if (!service.deleteGroupSetting(request.params.id)) {
      return fail(reply, 404, 'GROUP_SETTING_NOT_FOUND', 'Group display setting not found.')
    }
    return ok(reply, { deleted: true })
  })
}
