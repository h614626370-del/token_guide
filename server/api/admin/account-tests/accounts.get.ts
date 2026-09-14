import { defineEventHandler } from 'h3'
import { apiError, apiOk } from '../../../utils/api'
import { sanitizeAccount } from '../../../domain/account-tests/service'
import { usePricingService } from '../../../utils/pricing'
import { requireAdminSession } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const client = usePricingService().getSub2apiClient()
  if (!client.configured) apiError(503, 'SUB2API_NOT_CONFIGURED', 'Sub2API 管理接口尚未配置。')
  try {
    const accounts = await client.listAccountsAll({ provider: 'openai', status: 'active' })
    return apiOk({ accounts: accounts.map(sanitizeAccount).filter((item): item is NonNullable<typeof item> => Boolean(item)) })
  } catch {
    apiError(502, 'SUB2API_ACCOUNTS_UNAVAILABLE', '无法读取 Sub2API 的 OpenAI 账号列表。')
  }
})
