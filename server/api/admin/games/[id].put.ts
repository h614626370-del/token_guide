import { defineEventHandler, getRouterParam } from 'h3'
import { updateGame } from '../../../domain/games/service'
import { apiError, apiOk } from '../../../utils/api'
import { readLimitedJson } from '../../../utils/request-body'
import { requireAdminSession } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const id = Number(getRouterParam(event, 'id') || 0)
  if (!Number.isInteger(id) || id <= 0) apiError(400, 'INVALID_GAME_ID', '游戏条目无效。')
  try {
    const game = updateGame(id, await readLimitedJson(event, 32 * 1024))
    if (!game) return apiError(404, 'GAME_NOT_FOUND', '游戏条目不存在。')
    return apiOk(game)
  } catch (error) {
    const message = error instanceof Error ? error.message : '游戏保存失败。'
    apiError(400, 'UPDATE_GAME_FAILED', message.includes('UNIQUE') ? 'Slug 已经存在。' : message)
  }
})
