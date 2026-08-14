import { defineEventHandler, getRouterParam } from 'h3'
import { getGameBySlug } from '../../domain/games/service'
import { apiError, apiOk } from '../../utils/api'

export default defineEventHandler((event) => {
  const slug = String(getRouterParam(event, 'slug') || '').trim().toLowerCase()
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) apiError(400, 'INVALID_GAME_SLUG', '游戏地址无效。')
  const game = getGameBySlug(slug)
  if (!game) apiError(404, 'GAME_NOT_FOUND', '游戏不存在或尚未上架。')
  return apiOk(game)
})
