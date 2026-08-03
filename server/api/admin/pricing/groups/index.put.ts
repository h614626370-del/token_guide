import { defineEventHandler, readBody } from 'h3'
import { upsertGroupSettingSchema } from '../../../../domain/pricing/schema.js'
import { apiError, apiOk } from '../../../../utils/api'
import { usePricingService } from '../../../../utils/pricing'
import { requireAdminSession } from '../../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const parsed = upsertGroupSettingSchema.safeParse(await readBody(event))
  if (!parsed.success) apiError(400, 'INVALID_GROUP_SETTING', 'Group setting is invalid.', parsed.error.flatten())
  return apiOk(usePricingService().upsertGroupSetting(parsed.data))
})
