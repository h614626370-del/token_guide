import { defineEventHandler, getQuery } from 'h3'
import { listSourceQuerySchema } from '../../../domain/pricing/schema.js'
import { apiError, apiOk } from '../../../utils/api'
import { usePricingService } from '../../../utils/pricing'
import { requireAdminSession } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const parsed = listSourceQuerySchema.safeParse(getQuery(event))
  if (!parsed.success) apiError(400, 'INVALID_QUERY', 'Pricing source query is invalid.', parsed.error.flatten())
  return apiOk(await usePricingService().listSource(parsed.data))
})
