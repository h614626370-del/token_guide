import { defineEventHandler, readBody } from 'h3'
import { upsertModelSettingsSchema } from '../../../../domain/pricing/schema.js'
import { apiError, apiOk } from '../../../../utils/api'
import { usePricingService } from '../../../../utils/pricing'
import { requireAdminSession } from '../../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const parsed = upsertModelSettingsSchema.safeParse(await readBody(event))
  if (!parsed.success) apiError(400, 'INVALID_MODEL_SETTINGS', 'Model settings are invalid.', parsed.error.flatten())
  return apiOk(usePricingService().upsertModelSettings(parsed.data.items))
})
