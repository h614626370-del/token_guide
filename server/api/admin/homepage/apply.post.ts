import { defineEventHandler, readBody } from 'h3'
import { applyHomepageDefault, getHomepageDefault } from '../../../domain/homepage/service'
import { apiError, apiOk } from '../../../utils/api'
import { requireAdminSession } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const body = await readBody<{ default_id?: string }>(event)
  if (!getHomepageDefault(String(body?.default_id || ''))) {
    apiError(400, 'INVALID_HOMEPAGE_DEFAULT', '默认首页不存在。')
  }
  try {
    return apiOk(await applyHomepageDefault(String(body.default_id), event))
  } catch (error) {
    apiError(400, 'APPLY_HOMEPAGE_FAILED', error instanceof Error ? error.message : '应用默认首页失败。')
  }
})
