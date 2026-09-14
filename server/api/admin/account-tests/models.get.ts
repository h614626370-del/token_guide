import { defineEventHandler } from 'h3'
import { apiError, apiOk } from '../../../utils/api'
import { usePricingService } from '../../../utils/pricing'
import { requireAdminSession } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const client = usePricingService().getSub2apiClient()
  if (!client.configured) apiError(503, 'SUB2API_NOT_CONFIGURED', 'Sub2API 管理接口尚未配置。')
  try {
    const models = await client.listModelNames('openai')
    return apiOk({ models: Array.from(new Set(models.map((item: unknown) => String(item).trim()).filter(Boolean))) })
  } catch {
    apiError(502, 'SUB2API_MODELS_UNAVAILABLE', '无法读取 Sub2API 的 OpenAI 模型列表。')
  }
})
