import { defineEventHandler, getRouterParam } from 'h3'
import { updateCommunityItem } from '../../../domain/community/service'
import { apiError, apiOk } from '../../../utils/api'
import { readLimitedJson } from '../../../utils/request-body'
import { requireAdminSession } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const id = Number(getRouterParam(event, 'id') || 0)
  if (!Number.isInteger(id) || id <= 0) apiError(400, 'INVALID_COMMUNITY_ID', '社区条目无效。')
  try {
    const item = updateCommunityItem(id, await readLimitedJson(event, 16 * 1024))
    if (!item) return apiError(404, 'COMMUNITY_ITEM_NOT_FOUND', '社区条目不存在。')
    return apiOk(item)
  } catch (error) {
    if ((error as { statusCode?: number })?.statusCode === 404) throw error
    const message = error instanceof Error ? error.message : '社区条目保存失败。'
    apiError(400, 'UPDATE_COMMUNITY_ITEM_FAILED', message.includes('UNIQUE') ? 'Slug 已经存在。' : message)
  }
})
