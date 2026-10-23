import { z } from 'zod'

export function normalizeUpstreamBase(value: string) {
  const url = new URL(value.trim())
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('上游地址必须是无凭据、无查询参数的 HTTP 或 HTTPS 地址。')
  }
  url.pathname = url.pathname.replace(/\/+$/, '').replace(/\/v1(?:\/usage)?$/, '')
  return url.toString().replace(/\/+$/, '')
}

export const upstreamSchema = z.object({
  name: z.string().trim().min(1).max(120),
  source: z.enum(['manual', 'main_site']),
  account_id: z.number().int().positive().nullable().default(null),
  base_url: z.string().trim().max(1000).default('').refine(value => {
    if (!value) return true
    try { normalizeUpstreamBase(value); return true } catch { return false }
  }, '上游地址无效'),
  api_key: z.string().trim().max(4096).regex(/^[^\s\x00-\x1f\x7f]*$/).optional().nullable(),
  enabled: z.boolean().default(true),
  low_balance_enabled: z.boolean().default(true),
  low_balance_threshold: z.number().finite().min(0).max(1e12).default(10),
  exhausted_enabled: z.boolean().default(true),
  check_interval_minutes: z.number().int().min(1).max(1440).default(5),
}).strict().superRefine((value, ctx) => {
  if (value.source === 'manual' && !value.base_url) ctx.addIssue({ code: 'custom', path: ['base_url'], message: '请填写上游地址' })
  if (value.source === 'main_site' && !value.account_id) ctx.addIssue({ code: 'custom', path: ['account_id'], message: '请选择主站三方 API 账号' })
})

export type UpstreamInput = z.infer<typeof upstreamSchema>
