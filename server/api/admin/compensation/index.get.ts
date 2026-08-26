import { defineEventHandler, getQuery } from 'h3'
import { apiError, apiOk } from '../../../utils/api'
import { useCompensationService } from '../../../utils/compensation'
import { requireAdminSession } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const query = getQuery(event)
  const page = Math.max(1, Number(query.page || 1))
  const pageSize = Math.min(50, Math.max(1, Number(query.page_size || 20)))
  if (!Number.isInteger(page) || !Number.isInteger(pageSize)) apiError(400, 'INVALID_COMPENSATION_PAGE', 'Compensation pagination is invalid.')
  return apiOk(useCompensationService(event).listBatches(page, pageSize))
})
