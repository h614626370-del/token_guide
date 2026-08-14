import { defineEventHandler } from 'h3'
import { createGame } from '../../../domain/games/service'
import { apiError, apiOk } from '../../../utils/api'
import { readLimitedJson } from '../../../utils/request-body'
import { requireAdminSession } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  try {
    return apiOk(createGame(await readLimitedJson(event, 32 * 1024)))
  } catch (error) {
    const message = error instanceof Error ? error.message : '游戏创建失败。'
    apiError(400, 'CREATE_GAME_FAILED', message.includes('UNIQUE') ? 'Slug 已经存在。' : message)
  }
})
