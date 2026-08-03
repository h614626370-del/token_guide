import { defineEventHandler, readBody } from 'h3'
import { upsertModelSettingSchema } from '../../../../domain/pricing/schema.js'
import { apiError, apiOk } from '../../../../utils/api'
import { usePricingService } from '../../../../utils/pricing'
import { requireAdminSession } from '../../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const parsed = upsertModelSettingSchema.safeParse(await readBody(event))
  if (!parsed.success) apiError(400, 'INVALID_MODEL_SETTING', 'Model setting is invalid.', parsed.error.flatten())
  return apiOk(usePricingService().upsertModelSetting(parsed.data))
})
