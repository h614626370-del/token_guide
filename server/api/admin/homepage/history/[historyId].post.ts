import { defineEventHandler, getRouterParam } from 'h3'
import { restoreHomepageHistory } from '../../../../domain/homepage/service'
import { apiError, apiOk } from '../../../../utils/api'
import { requireAdminSession } from '../../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const historyId = Number(getRouterParam(event, 'historyId') || 0)
  if (!Number.isInteger(historyId) || historyId <= 0) {
    apiError(400, 'INVALID_HOMEPAGE_HISTORY', '首页历史版本无效。')
  }
  try {
    return apiOk(await restoreHomepageHistory(historyId, event))
  } catch (error) {
    apiError(400, 'RESTORE_HOMEPAGE_FAILED', error instanceof Error ? error.message : '首页恢复失败。')
  }
})
