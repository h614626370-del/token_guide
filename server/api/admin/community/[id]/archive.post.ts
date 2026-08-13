import { defineEventHandler, getRouterParam } from 'h3'
import { setCommunityItemStatus } from '../../../../domain/community/service'
import { apiError, apiOk } from '../../../../utils/api'
import { requireAdminSession } from '../../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const id = Number(getRouterParam(event, 'id') || 0)
  if (!Number.isInteger(id) || id <= 0) apiError(400, 'INVALID_COMMUNITY_ID', '社区条目无效。')
  const item = setCommunityItemStatus(id, 'archived')
  if (!item) apiError(404, 'COMMUNITY_ITEM_NOT_FOUND', '社区条目不存在。')
  return apiOk(item)
})
