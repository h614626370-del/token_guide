import { defineEventHandler, getRouterParam } from 'h3'
import { deleteCommunityCategory } from '../../../../domain/community/service'
import { apiError, apiOk } from '../../../../utils/api'
import { readLimitedJson } from '../../../../utils/request-body'
import { requireAdminSession } from '../../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const id = Number(getRouterParam(event, 'id') || 0)
  if (!Number.isInteger(id) || id <= 0) apiError(400, 'INVALID_COMMUNITY_CATEGORY_ID', '社区分类无效。')
  try {
    const body = await readLimitedJson(event, 2 * 1024) as { replacement_id?: number | null }
    const result = deleteCommunityCategory(id, body.replacement_id)
    if (!result) apiError(404, 'COMMUNITY_CATEGORY_NOT_FOUND', '社区分类不存在。')
    return apiOk(result)
  } catch (error) {
    if ((error as { statusCode?: number })?.statusCode === 404) throw error
    apiError(400, 'DELETE_COMMUNITY_CATEGORY_FAILED', error instanceof Error ? error.message : '社区分类删除失败。')
  }
})
