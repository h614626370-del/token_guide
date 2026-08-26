import { defineEventHandler, getRouterParam } from 'h3'
import { apiError, apiOk } from '../../../utils/api'
import { useCompensationService } from '../../../utils/compensation'
import { requireAdminSession } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const id = String(getRouterParam(event, 'id') || '').trim()
  if (!/^[0-9a-f-]{16,64}$/i.test(id)) apiError(400, 'INVALID_COMPENSATION_ID', 'Compensation batch id is invalid.')
  const batch = await useCompensationService(event).getBatch(id)
  if (!batch) apiError(404, 'COMPENSATION_NOT_FOUND', 'Compensation batch was not found.')
  return apiOk(batch)
})
