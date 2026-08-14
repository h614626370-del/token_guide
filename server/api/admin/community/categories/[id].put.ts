import { defineEventHandler, getRouterParam } from 'h3'
import { updateCommunityCategory } from '../../../../domain/community/service'
import { apiError, apiOk } from '../../../../utils/api'
import { readLimitedJson } from '../../../../utils/request-body'
import { requireAdminSession } from '../../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const id = Number(getRouterParam(event, 'id') || 0)
  if (!Number.isInteger(id) || id <= 0) apiError(400, 'INVALID_COMMUNITY_CATEGORY_ID', '社区分类无效。')
  try {
    const category = updateCommunityCategory(id, await readLimitedJson(event, 4 * 1024))
    if (!category) apiError(404, 'COMMUNITY_CATEGORY_NOT_FOUND', '社区分类不存在。')
    return apiOk(category)
  } catch (error) {
    if ((error as { statusCode?: number })?.statusCode === 404) throw error
    apiError(400, 'UPDATE_COMMUNITY_CATEGORY_FAILED', error instanceof Error ? error.message : '社区分类保存失败。')
  }
})
