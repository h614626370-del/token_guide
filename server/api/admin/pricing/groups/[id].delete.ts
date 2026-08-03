import { defineEventHandler, getRouterParam } from 'h3'
import { apiError, apiOk } from '../../../../utils/api'
import { usePricingService } from '../../../../utils/pricing'
import { requireAdminSession } from '../../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const id = getRouterParam(event, 'id') || ''
  if (!usePricingService().deleteGroupSetting(id)) apiError(404, 'GROUP_SETTING_NOT_FOUND', 'Group setting was not found.')
  return apiOk({ deleted: true })
})
