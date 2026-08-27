import { defineEventHandler, getQuery } from 'h3'
import { apiOk } from '../../../utils/api'
import { useModelPricingService } from '../../../utils/model-pricing'
import { requireAdminSession } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const query = getQuery(event)
  return apiOk(await useModelPricingService().getCatalog({
    refresh: query.refresh === 'true' || query.refresh === true,
    includeHidden: true,
  }))
})
