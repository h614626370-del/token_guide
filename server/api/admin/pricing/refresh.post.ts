import { defineEventHandler } from 'h3'
import { apiOk } from '../../../utils/api'
import { usePricingService } from '../../../utils/pricing'
import { requireAdminSession } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  return apiOk(await usePricingService().getReference({ refresh: true }))
})
