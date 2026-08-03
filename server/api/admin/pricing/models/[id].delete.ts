import { defineEventHandler, getRouterParam } from 'h3'
import { apiError, apiOk } from '../../../../utils/api'
import { usePricingService } from '../../../../utils/pricing'
import { requireAdminSession } from '../../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const id = getRouterParam(event, 'id') || ''
  if (!usePricingService().deleteModelSetting(id)) apiError(404, 'MODEL_SETTING_NOT_FOUND', 'Model setting was not found.')
  return apiOk({ deleted: true })
})
