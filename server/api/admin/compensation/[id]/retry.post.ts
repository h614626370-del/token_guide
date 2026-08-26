import { defineEventHandler, getRouterParam, readBody } from 'h3'
import { compensationRetrySchema } from '../../../../domain/compensation/schema.js'
import { apiError, apiOk } from '../../../../utils/api'
import { throwCompensationError } from '../../../../utils/compensation-api'
import { useCompensationService } from '../../../../utils/compensation'
import { requireAdminSession } from '../../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const id = String(getRouterParam(event, 'id') || '').trim()
  if (!/^[0-9a-f-]{16,64}$/i.test(id)) apiError(400, 'INVALID_COMPENSATION_ID', 'Compensation batch id is invalid.')
  const parsed = compensationRetrySchema.safeParse(await readBody(event).catch(() => ({})))
  if (!parsed.success) apiError(400, 'INVALID_COMPENSATION_RETRY', 'Compensation retry parameters are invalid.', parsed.error.flatten())
  try {
    const batch = await useCompensationService(event).retry(id, parsed.data.notes)
    if (!batch) apiError(404, 'COMPENSATION_NOT_FOUND', 'Compensation batch was not found.')
    return apiOk(batch)
  } catch (error) {
    throwCompensationError(error)
  }
})
