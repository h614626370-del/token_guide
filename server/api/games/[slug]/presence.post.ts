import { defineEventHandler, getRouterParam } from 'h3'
import { getGameBySlug, touchGamePresence } from '../../../domain/games/service'
import { apiError, apiOk } from '../../../utils/api'
import { readLimitedJson } from '../../../utils/request-body'

export default defineEventHandler(async (event) => {
  const slug = String(getRouterParam(event, 'slug') || '').trim().toLowerCase()
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) apiError(400, 'INVALID_GAME_SLUG', '游戏地址无效。')
  const game = getGameBySlug(slug)
  if (!game) apiError(404, 'GAME_NOT_FOUND', '游戏不存在或尚未上架。')
  const body = await readLimitedJson(event, 1024) as { session_id?: unknown }
  const sessionId = String(body.session_id || '').trim()
  if (!/^[a-zA-Z0-9_-]{16,128}$/.test(sessionId)) apiError(400, 'INVALID_GAME_SESSION', '游戏会话无效。')
  return apiOk({ slug, online_count: touchGamePresence(slug, sessionId), ttl_seconds: 90 })
})
