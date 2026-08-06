import { defineEventHandler, getRouterParam } from 'h3'
import { deletePromotionSource } from '../../../domain/promotion/service'
import { apiError, apiOk } from '../../../utils/api'
import { requireAdminSession } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const id = Number(getRouterParam(event, 'id') || 0)
  if (!Number.isInteger(id) || id <= 0) apiError(400, 'INVALID_PROMOTION_ID', '推广来源无效。')
  if (!deletePromotionSource(id)) apiError(404, 'PROMOTION_NOT_FOUND', '推广来源不存在。')
  return apiOk({ id })
})
