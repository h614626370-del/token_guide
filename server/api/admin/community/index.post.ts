import { defineEventHandler } from 'h3'
import { createCommunityItem } from '../../../domain/community/service'
import { apiError, apiOk } from '../../../utils/api'
import { readLimitedJson } from '../../../utils/request-body'
import { requireAdminSession } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  try {
    return apiOk(createCommunityItem(await readLimitedJson(event, 16 * 1024)))
  } catch (error) {
    const message = error instanceof Error ? error.message : '社区条目创建失败。'
    apiError(400, 'CREATE_COMMUNITY_ITEM_FAILED', message.includes('UNIQUE') ? 'Slug 已经存在。' : message)
  }
})
