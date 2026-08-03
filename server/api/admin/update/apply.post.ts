import { defineEventHandler } from 'h3'
import { applyUpdate } from '../../../domain/update/service'
import { apiError, apiOk } from '../../../utils/api'
import { requireAdminSession } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  try {
    return apiOk(await applyUpdate(event))
  } catch (error) {
    const message = error instanceof Error ? error.message : '应用更新失败。'
    const code = message.includes('Docker') ? 'UPDATE_DOCKER_UNAVAILABLE' : 'UPDATE_APPLY_FAILED'
    apiError(message.includes('Docker') ? 503 : 400, code, message)
  }
})
