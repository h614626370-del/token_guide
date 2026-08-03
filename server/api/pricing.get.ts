import { defineEventHandler } from 'h3'
import { apiOk } from '../utils/api'
import { usePricingService } from '../utils/pricing'

export default defineEventHandler(async () => {
  return apiOk(await usePricingService().getReference())
})
