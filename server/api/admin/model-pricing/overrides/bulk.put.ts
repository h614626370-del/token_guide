import { defineEventHandler, readBody } from 'h3'
import { upsertGroupModelPricingBatchSchema } from '../../../../domain/model-pricing/schema.js'
import { apiError, apiOk } from '../../../../utils/api'
import { useModelPricingService } from '../../../../utils/model-pricing'
import { requireAdminSession } from '../../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const parsed = upsertGroupModelPricingBatchSchema.safeParse(await readBody(event))
  if (!parsed.success) apiError(400, 'INVALID_GROUP_MODEL_PRICING', '分组模型定价配置无效。', parsed.error.flatten())
  return apiOk(await useModelPricingService().upsertOverrides(parsed.data.items))
})
