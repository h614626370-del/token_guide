import { defineEventHandler, getQuery } from 'h3'
import { apiError, apiOk } from '../../../utils/api'
import { requireAdminSession } from '../../../utils/session'
import { useUpstreamService } from '../../../utils/upstreams'

export default defineEventHandler(async event => {
  await requireAdminSession(event)
  const provider = String(getQuery(event).platform || 'openai')
  if (!['openai', 'anthropic', 'gemini', 'antigravity', 'grok'].includes(provider)) apiError(400, 'INVALID_PLATFORM', '请选择有效的平台。')
  try { return apiOk(await useUpstreamService().accounts(provider)) }
  catch (error) { apiError(502, 'UPSTREAM_ACCOUNTS_FAILED', error instanceof Error ? error.message : '主站账号读取失败。') }
})
