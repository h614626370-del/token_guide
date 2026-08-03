import { defineEventHandler, readBody } from 'h3'
import { updateRuntimeSettingsSchema } from '../../../domain/pricing/schema.js'
import { apiError, apiOk } from '../../../utils/api'
import { usePricingService } from '../../../utils/pricing'
import { requireAdminSession } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const parsed = updateRuntimeSettingsSchema.safeParse(await readBody(event))
  if (!parsed.success) apiError(400, 'INVALID_PRICING_SETTINGS', 'Pricing settings are invalid.', parsed.error.flatten())
  return apiOk(usePricingService().updateRuntimeSettings(parsed.data))
})
