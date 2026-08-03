import { defineEventHandler, readBody } from 'h3'
import { upsertGroupSettingsSchema } from '../../../../domain/pricing/schema.js'
import { apiError, apiOk } from '../../../../utils/api'
import { usePricingService } from '../../../../utils/pricing'
import { requireAdminSession } from '../../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const parsed = upsertGroupSettingsSchema.safeParse(await readBody(event))
  if (!parsed.success) apiError(400, 'INVALID_GROUP_SETTINGS', 'Group settings are invalid.', parsed.error.flatten())
  return apiOk(usePricingService().upsertGroupSettings(parsed.data.items))
})
