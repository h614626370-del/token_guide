import { defineEventHandler, readBody } from 'h3'
import { createPromotionSource } from '../../../domain/promotion/service'
import { apiError, apiOk } from '../../../utils/api'
import { requireAdminSession } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  try {
    return apiOk(createPromotionSource(await readBody(event), event))
  } catch (error) {
    apiError(400, 'CREATE_PROMOTION_FAILED', error instanceof Error ? error.message : '推广来源创建失败。')
  }
})
