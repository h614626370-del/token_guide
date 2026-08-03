import { defineEventHandler } from 'h3'
import { checkForUpdate } from '../../../domain/update/service'
import { apiError, apiOk } from '../../../utils/api'
import { requireAdminSession } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  try {
    return apiOk(await checkForUpdate(event))
  } catch (error) {
    const message = error instanceof Error ? error.message : '检测更新失败。'
    apiError(502, 'UPDATE_CHECK_FAILED', message)
  }
})
