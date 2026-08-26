import { defineEventHandler, readBody } from 'h3'
import { compensationExecuteSchema } from '../../../domain/compensation/schema.js'
import { apiError, apiOk } from '../../../utils/api'
import { throwCompensationError } from '../../../utils/compensation-api'
import { useCompensationService } from '../../../utils/compensation'
import { requireAdminSession } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const parsed = compensationExecuteSchema.safeParse(await readBody(event))
  if (!parsed.success) apiError(400, 'INVALID_COMPENSATION_EXECUTION', 'Compensation execution parameters are invalid.', parsed.error.flatten())
  try {
    return apiOk(await useCompensationService(event).execute(parsed.data))
  } catch (error) {
    throwCompensationError(error)
  }
})
