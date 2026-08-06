import { defineEventHandler, getRouterParam, sendRedirect, setHeader } from 'h3'
import { recordPromotionClick } from '../../domain/promotion/service'
import { apiError } from '../../utils/api'

export default defineEventHandler(async (event) => {
  const code = getRouterParam(event, 'code') || ''
  const result = recordPromotionClick(code, event)
  if (!result) apiError(404, 'PROMOTION_NOT_FOUND', '推广链接不存在或已停用。')
  setHeader(event, 'cache-control', 'no-store')
  return sendRedirect(event, result.target, 302)
})
