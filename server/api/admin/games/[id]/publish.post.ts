import { defineEventHandler, getRouterParam } from 'h3'
import { setGameStatus } from '../../../../domain/games/service'
import { apiError, apiOk } from '../../../../utils/api'
import { requireAdminSession } from '../../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const id = Number(getRouterParam(event, 'id') || 0)
  if (!Number.isInteger(id) || id <= 0) apiError(400, 'INVALID_GAME_ID', '游戏条目无效。')
  const game = setGameStatus(id, 'published')
  if (!game) apiError(404, 'GAME_NOT_FOUND', '游戏条目不存在。')
  return apiOk(game)
})
