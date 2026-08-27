import { defineEventHandler, readBody } from 'h3'
import { updateModelPricingGroupSchema } from '../../../domain/model-pricing/schema.js'
import { apiError, apiOk } from '../../../utils/api'
import { useModelPricingService } from '../../../utils/model-pricing'
import { requireAdminSession } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const parsed = updateModelPricingGroupSchema.safeParse(await readBody(event))
  if (!parsed.success) apiError(400, 'INVALID_MODEL_PRICING_GROUP', '分组显示名称无效。', parsed.error.flatten())
  return apiOk(await useModelPricingService().upsertGroupSetting(parsed.data))
})
