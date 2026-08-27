import { defineEventHandler, readBody } from 'h3'
import { updateModelPricingOrderSchema } from '../../../domain/model-pricing/schema.js'
import { apiError, apiOk } from '../../../utils/api'
import { useModelPricingService } from '../../../utils/model-pricing'
import { requireAdminSession } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const parsed = updateModelPricingOrderSchema.safeParse(await readBody(event))
  if (!parsed.success) apiError(400, 'INVALID_MODEL_PRICING_ORDER', '模型定价排序无效。', parsed.error.flatten())
  return apiOk(await useModelPricingService().upsertDisplayOrder(parsed.data.items))
})
