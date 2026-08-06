import crypto from 'node:crypto'
import type Database from 'better-sqlite3'
import type { H3Event } from 'h3'
import { getQuery, getRequestHeader, getRequestURL } from 'h3'
import { getGuideConfig } from '../../utils/config'
import { hashRequestIp } from '../../utils/rate-limit'
import { useGuideDatabase } from '../../utils/database'

export interface PromotionSourceInput {
  code: string
  name: string
  target_url: string
  utm_source?: string | null
  utm_medium?: string | null
  utm_campaign?: string | null
  utm_content?: string | null
  enabled?: boolean
}

export interface PromotionSource {
  id: number
  code: string
  name: string
  target_url: string
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_content: string | null
  enabled: boolean
  created_at: string
  updated_at: string
  link: string
  clicks: number
  unique_visitors: number
  clicks_today: number
  clicks_7d: number
  clicks_30d: number
}

function sourceRow(row: Record<string, unknown>, event?: H3Event): PromotionSource {
  return {
    id: Number(row.id),
    code: String(row.code),
    name: String(row.name),
    target_url: String(row.target_url),
    utm_source: row.utm_source ? String(row.utm_source) : null,
    utm_medium: row.utm_medium ? String(row.utm_medium) : null,
    utm_campaign: row.utm_campaign ? String(row.utm_campaign) : null,
    utm_content: row.utm_content ? String(row.utm_content) : null,
    enabled: Boolean(row.enabled),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    link: new URL(`/go/${encodeURIComponent(String(row.code))}`, `${getGuideConfig(event).siteUrl}/`).toString(),
    clicks: Number(row.clicks || 0),
    unique_visitors: Number(row.unique_visitors || 0),
    clicks_today: Number(row.clicks_today || 0),
    clicks_7d: Number(row.clicks_7d || 0),
    clicks_30d: Number(row.clicks_30d || 0),
  }
}

export function listPromotionSources(event?: H3Event) {
  const db = useGuideDatabase()
  const rows = db.prepare(`
    SELECT
      s.*,
      COUNT(e.id) AS clicks,
      COUNT(DISTINCT e.visitor_hash) AS unique_visitors,
      SUM(CASE WHEN e.occurred_at >= datetime('now', 'start of day') THEN 1 ELSE 0 END) AS clicks_today,
      SUM(CASE WHEN e.occurred_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END) AS clicks_7d,
      SUM(CASE WHEN e.occurred_at >= datetime('now', '-30 days') THEN 1 ELSE 0 END) AS clicks_30d
    FROM promotion_sources s
    LEFT JOIN promotion_events e ON e.source_id = s.id AND e.event_type = 'click'
    GROUP BY s.id
    ORDER BY clicks_30d DESC, s.created_at DESC
  `).all() as Array<Record<string, unknown>>
  return rows.map(row => sourceRow(row, event))
}

export function promotionOverview(event?: H3Event) {
  const db = useGuideDatabase()
  const rows = listPromotionSources(event)
  const summary = db.prepare(`
    SELECT
      COUNT(*) AS clicks,
      COUNT(DISTINCT visitor_hash) AS unique_visitors,
      SUM(CASE WHEN occurred_at >= datetime('now', 'start of day') THEN 1 ELSE 0 END) AS clicks_today,
      SUM(CASE WHEN occurred_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END) AS clicks_7d,
      SUM(CASE WHEN occurred_at >= datetime('now', '-30 days') THEN 1 ELSE 0 END) AS clicks_30d
    FROM promotion_events
    WHERE event_type = 'click'
  `).get() as Record<string, unknown>
  const trend = db.prepare(`
    SELECT substr(occurred_at, 1, 10) AS day, COUNT(*) AS clicks, COUNT(DISTINCT visitor_hash) AS unique_visitors
    FROM promotion_events
    WHERE event_type = 'click' AND occurred_at >= datetime('now', '-30 days')
    GROUP BY day
    ORDER BY day ASC
  `).all() as Array<{ day: string; clicks: number; unique_visitors: number }>
  return {
    summary: {
      clicks: Number(summary.clicks || 0),
      unique_visitors: Number(summary.unique_visitors || 0),
      clicks_today: Number(summary.clicks_today || 0),
      clicks_7d: Number(summary.clicks_7d || 0),
      clicks_30d: Number(summary.clicks_30d || 0),
    },
    trend: trend.map(item => ({ day: item.day, clicks: Number(item.clicks), unique_visitors: Number(item.unique_visitors) })),
    sources: rows,
  }
}

export function createPromotionSource(input: PromotionSourceInput, event?: H3Event) {
  const db = useGuideDatabase()
  const normalized = normalizeSourceInput(input)
  const now = new Date().toISOString()
  const result = db.prepare(`
    INSERT INTO promotion_sources (code, name, target_url, utm_source, utm_medium, utm_campaign, utm_content, enabled, created_at, updated_at)
    VALUES (@code, @name, @target_url, @utm_source, @utm_medium, @utm_campaign, @utm_content, @enabled, @created_at, @updated_at)
  `).run({ ...normalized, enabled: normalized.enabled ? 1 : 0, created_at: now, updated_at: now })
  return getPromotionSource(Number(result.lastInsertRowid), event)
}

export function updatePromotionSource(id: number, input: Partial<PromotionSourceInput>, event?: H3Event) {
  const db = useGuideDatabase()
  const existing = db.prepare('SELECT * FROM promotion_sources WHERE id = ?').get(id) as Record<string, unknown> | undefined
  if (!existing) return null
  const normalized = normalizeSourceInput({
    code: input.code ?? String(existing.code),
    name: input.name ?? String(existing.name),
    target_url: input.target_url ?? String(existing.target_url),
    utm_source: input.utm_source === undefined ? existing.utm_source as string | null : input.utm_source,
    utm_medium: input.utm_medium === undefined ? existing.utm_medium as string | null : input.utm_medium,
    utm_campaign: input.utm_campaign === undefined ? existing.utm_campaign as string | null : input.utm_campaign,
    utm_content: input.utm_content === undefined ? existing.utm_content as string | null : input.utm_content,
    enabled: input.enabled === undefined ? Boolean(existing.enabled) : input.enabled,
  })
  db.prepare(`
    UPDATE promotion_sources
    SET code = @code, name = @name, target_url = @target_url, utm_source = @utm_source, utm_medium = @utm_medium,
        utm_campaign = @utm_campaign, utm_content = @utm_content, enabled = @enabled, updated_at = @updated_at
    WHERE id = @id
  `).run({ ...normalized, enabled: normalized.enabled ? 1 : 0, updated_at: new Date().toISOString(), id })
  return getPromotionSource(id, event)
}

export function deletePromotionSource(id: number) {
  const db = useGuideDatabase()
  return Boolean(db.prepare('DELETE FROM promotion_sources WHERE id = ?').run(id).changes)
}

export function getPromotionSource(id: number, event?: H3Event) {
  const db = useGuideDatabase()
  const row = db.prepare(`
    SELECT s.*, COUNT(e.id) AS clicks, COUNT(DISTINCT e.visitor_hash) AS unique_visitors,
      SUM(CASE WHEN e.occurred_at >= datetime('now', 'start of day') THEN 1 ELSE 0 END) AS clicks_today,
      SUM(CASE WHEN e.occurred_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END) AS clicks_7d,
      SUM(CASE WHEN e.occurred_at >= datetime('now', '-30 days') THEN 1 ELSE 0 END) AS clicks_30d
    FROM promotion_sources s LEFT JOIN promotion_events e ON e.source_id = s.id AND e.event_type = 'click'
    WHERE s.id = ? GROUP BY s.id
  `).get(id) as Record<string, unknown> | undefined
  return row ? sourceRow(row, event) : null
}

export function buildPromotionTarget(source: PromotionSource, event?: H3Event) {
  const target = new URL(source.target_url)
  target.searchParams.set('ref', source.code)
  if (source.utm_source) target.searchParams.set('utm_source', source.utm_source)
  if (source.utm_medium) target.searchParams.set('utm_medium', source.utm_medium)
  if (source.utm_campaign) target.searchParams.set('utm_campaign', source.utm_campaign)
  if (source.utm_content) target.searchParams.set('utm_content', source.utm_content)
  return target.toString()
}

export function recordPromotionClick(code: string, event: H3Event) {
  const db = useGuideDatabase()
  const row = db.prepare(`
    SELECT s.*, COUNT(e.id) AS clicks, COUNT(DISTINCT e.visitor_hash) AS unique_visitors,
      0 AS clicks_today, 0 AS clicks_7d, 0 AS clicks_30d
    FROM promotion_sources s LEFT JOIN promotion_events e ON e.source_id = s.id
    WHERE s.code = ? GROUP BY s.id
  `).get(code) as Record<string, unknown> | undefined
  if (!row || !Boolean(row.enabled)) return null
  const source = sourceRow(row, event)
  const ipHash = hashRequestIp(event)
  const userAgent = String(getRequestHeader(event, 'user-agent') || '').slice(0, 512)
  const visitorHash = crypto.createHash('sha256').update(`${ipHash}:${userAgent}`).digest('hex')
  const referer = getRequestHeader(event, 'referer') || ''
  let refererHost = ''
  try { refererHost = new URL(referer).hostname.slice(0, 255) } catch { /* external referer is optional */ }
  const query = getQuery(event)
  const metadata = Object.fromEntries(Object.entries(query).filter(([key]) => key.startsWith('utm_')).map(([key, value]) => [key, String(value)]))
  db.prepare(`
    INSERT INTO promotion_events (source_id, event_type, occurred_at, visitor_hash, referer_host, user_agent, metadata_json)
    VALUES (?, 'click', ?, ?, ?, ?, ?)
  `).run(source.id, new Date().toISOString(), visitorHash, refererHost || null, userAgent || null, JSON.stringify(metadata))
  return { source, target: buildPromotionTarget(source, event) }
}

function normalizeSourceInput(input: PromotionSourceInput) {
  const code = String(input.code || '').trim().toLowerCase()
  const name = String(input.name || '').trim()
  const targetUrl = String(input.target_url || '').trim()
  if (!/^[a-z0-9][a-z0-9_-]{1,47}$/.test(code)) throw new Error('来源代码需为 2-48 位小写字母、数字、下划线或短横线。')
  if (!name || name.length > 80) throw new Error('来源名称不能为空且不能超过 80 个字符。')
  let parsed: URL
  try { parsed = new URL(targetUrl) } catch { throw new Error('目标地址必须是完整的 HTTP 或 HTTPS 地址。') }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error('目标地址格式不安全。')
  return {
    code,
    name,
    target_url: parsed.toString(),
    utm_source: cleanParam(input.utm_source),
    utm_medium: cleanParam(input.utm_medium),
    utm_campaign: cleanParam(input.utm_campaign),
    utm_content: cleanParam(input.utm_content),
    enabled: input.enabled !== false,
  }
}

function cleanParam(value: unknown) {
  const text = String(value || '').trim()
  return text ? text.slice(0, 120) : null
}
