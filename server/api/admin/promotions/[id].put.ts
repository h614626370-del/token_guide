import { defineEventHandler, getRouterParam, readBody } from 'h3'
import { updatePromotionSource } from '../../../domain/promotion/service'
import { apiError, apiOk } from '../../../utils/api'
import { requireAdminSession } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const id = Number(getRouterParam(event, 'id') || 0)
  if (!Number.isInteger(id) || id <= 0) apiError(400, 'INVALID_PROMOTION_ID', '推广来源无效。')
  try {
    const source = updatePromotionSource(id, await readBody(event), event)
    if (!source) apiError(404, 'PROMOTION_NOT_FOUND', '推广来源不存在。')
    return apiOk(source)
  } catch (error) {
    apiError(400, 'UPDATE_PROMOTION_FAILED', error instanceof Error ? error.message : '推广来源更新失败。')
  }
})
