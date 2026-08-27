import { defineEventHandler } from 'h3'
import { apiOk } from '../../../../utils/api'
import { useModelPricingService } from '../../../../utils/model-pricing'
import { requireAdminSession } from '../../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  return apiOk(await useModelPricingService().clearAllManualOverrides())
})
