import { defineEventHandler } from 'h3'
import { restartService } from '../../../domain/update/service'
import { apiError, apiOk } from '../../../utils/api'
import { requireAdminSession } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  try {
    return apiOk(await restartService(event))
  } catch (error) {
    const message = error instanceof Error ? error.message : '重启失败。'
    apiError(500, 'UPDATE_RESTART_FAILED', message)
  }
})
