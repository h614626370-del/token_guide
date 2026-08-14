import { defineEventHandler } from 'h3'
import { createCommunityCategory } from '../../../../domain/community/service'
import { apiError, apiOk } from '../../../../utils/api'
import { readLimitedJson } from '../../../../utils/request-body'
import { requireAdminSession } from '../../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  try {
    return apiOk(createCommunityCategory(await readLimitedJson(event, 4 * 1024)))
  } catch (error) {
    const message = error instanceof Error ? error.message : '社区分类创建失败。'
    apiError(400, 'CREATE_COMMUNITY_CATEGORY_FAILED', message.includes('UNIQUE') ? '分类 Slug 已经存在。' : message)
  }
})
