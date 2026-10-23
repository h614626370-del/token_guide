import { normalizeUpstreamBase } from './schema'

type JsonObject = Record<string, any>

export function parseUpstreamUsage(payload: unknown): { balance: number | null, unit: string, unlimited: boolean } {
  let data = payload as JsonObject
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('余额接口返回格式不正确。')
  if ('code' in data && data.code !== 0) throw new Error('上游未能返回有效余额，请检查 API Key 和账号状态。')
  if (data.error || data.isValid === false || data.ok === false) throw new Error('上游账号或 API Key 不可用。')
  if (data.data && typeof data.data === 'object') data = data.data
  if (data.error || data.isValid === false) throw new Error('上游账号或 API Key 不可用。')
  const values = [data.remaining, data.balance, data.quota?.remaining, data.remaining_balance, data.total_available]
  const raw = values.find(value => (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) && Number.isFinite(Number(value)))
  if (raw === undefined) throw new Error('余额接口未返回可识别的余额字段。')
  const balance = Number(raw)
  const unlimited = balance === -1 && Boolean(data.subscription || (data.mode === 'unrestricted' && data.planName && data.planName !== '钱包余额'))
  const unit = String(data.unit || data.quota?.unit || 'USD').slice(0, 12).replace(/[\r\n]/g, '')
  return { balance: unlimited ? null : balance, unit, unlimited }
}

export async function fetchUpstreamUsage(baseUrl: string, apiKey: string, timeoutMs = 8000) {
  const url = `${normalizeUpstreamBase(baseUrl)}/v1/usage`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${apiKey}`, accept: 'application/json' },
      redirect: 'error',
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`余额查询失败（HTTP ${response.status}），请检查地址、API Key 和账号状态。`)
    // Do not retain or expose upstream payloads, which can contain credentials.
    const payload = await response.json().catch(() => { throw new Error('余额接口未返回 JSON 数据。') })
    return parseUpstreamUsage(payload)
  } catch (error) {
    if (controller.signal.aborted) throw new Error('余额查询超时，请检查上游网络。')
    if (error instanceof TypeError) throw new Error('无法连接上游余额接口，请检查地址和网络。')
    throw error
  } finally {
    clearTimeout(timer)
  }
}
