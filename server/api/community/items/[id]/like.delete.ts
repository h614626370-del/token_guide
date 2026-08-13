import { defineEventHandler, getRouterParam } from 'h3'
import { setCommunityLike } from '../../../../domain/community/service'
import { apiError, apiOk } from '../../../../utils/api'
import { enforceCommunityLikeRateLimit } from '../../../../utils/rate-limit'
import { requireUserSession } from '../../../../utils/session'

export default defineEventHandler(async (event) => {
  const id = Number(getRouterParam(event, 'id') || 0)
  if (!Number.isInteger(id) || id <= 0) apiError(400, 'INVALID_COMMUNITY_ID', '社区条目无效。')
  const { user } = await requireUserSession(event)
  enforceCommunityLikeRateLimit(event, user.id)
  const item = setCommunityLike(id, user.id, false)
  if (!item) apiError(404, 'COMMUNITY_ITEM_NOT_FOUND', '社区条目不存在或尚未发布。')
  return apiOk(item)
})
