import crypto from 'node:crypto'
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

interface TrackingValues {
  ref_code: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_content: string | null
}

function sourceRow(row: Record<string, unknown>): PromotionSource {
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
    link: promotionLink(row),
    clicks: Number(row.clicks || 0),
    unique_visitors: Number(row.unique_visitors || 0),
    clicks_today: Number(row.clicks_today || 0),
    clicks_7d: Number(row.clicks_7d || 0),
    clicks_30d: Number(row.clicks_30d || 0),
  }
}

function promotionLink(row: Record<string, unknown>) {
  const target = new URL(String(row.target_url))
  target.searchParams.set('ref', String(row.code))
  for (const key of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content'] as const) {
    if (row[key]) target.searchParams.set(key, String(row[key]))
  }
  return target.toString()
}

export function listPromotionSources(_event?: H3Event) {
  const db = useGuideDatabase()
  const rows = db.prepare(`
    SELECT
      s.*,
      COUNT(v.id) AS clicks,
      COUNT(DISTINCT v.visitor_hash) AS unique_visitors,
      SUM(CASE WHEN datetime(v.occurred_at) >= datetime('now', 'start of day') THEN 1 ELSE 0 END) AS clicks_today,
      SUM(CASE WHEN datetime(v.occurred_at) >= datetime('now', '-7 days') THEN 1 ELSE 0 END) AS clicks_7d,
      SUM(CASE WHEN datetime(v.occurred_at) >= datetime('now', '-30 days') THEN 1 ELSE 0 END) AS clicks_30d
    FROM promotion_sources s
    LEFT JOIN promotion_visits v ON v.source_id = s.id
    GROUP BY s.id
    ORDER BY clicks_30d DESC, s.created_at DESC
  `).all() as Array<Record<string, unknown>>
  return rows.map(row => sourceRow(row))
}

export function promotionOverview(event?: H3Event) {
  const db = useGuideDatabase()
  const rows = listPromotionSources(event)
  const summary = db.prepare(`
    SELECT
      COUNT(*) AS clicks,
      COUNT(DISTINCT visitor_hash) AS unique_visitors,
      SUM(CASE WHEN datetime(occurred_at) >= datetime('now', 'start of day') THEN 1 ELSE 0 END) AS clicks_today,
      SUM(CASE WHEN datetime(occurred_at) >= datetime('now', '-7 days') THEN 1 ELSE 0 END) AS clicks_7d,
      SUM(CASE WHEN datetime(occurred_at) >= datetime('now', '-30 days') THEN 1 ELSE 0 END) AS clicks_30d,
      SUM(CASE WHEN source_id IS NULL AND referer_host IS NULL THEN 1 ELSE 0 END) AS direct_visits,
      SUM(CASE WHEN source_id IS NULL AND referer_host IS NOT NULL THEN 1 ELSE 0 END) AS automatic_referrals
    FROM promotion_visits
  `).get() as Record<string, unknown>
  const trend = db.prepare(`
    SELECT substr(occurred_at, 1, 10) AS day, COUNT(*) AS clicks, COUNT(DISTINCT visitor_hash) AS unique_visitors
    FROM promotion_visits
    WHERE datetime(occurred_at) >= datetime('now', '-30 days')
    GROUP BY day
    ORDER BY day ASC
  `).all() as Array<{ day: string, clicks: number, unique_visitors: number }>
  const referrals = db.prepare(`
    SELECT referer_host AS host, COUNT(*) AS visits, COUNT(DISTINCT visitor_hash) AS unique_visitors
    FROM promotion_visits
    WHERE referer_host IS NOT NULL AND datetime(occurred_at) >= datetime('now', '-30 days')
    GROUP BY referer_host
    ORDER BY visits DESC, referer_host ASC
    LIMIT 50
  `).all() as Array<{ host: string, visits: number, unique_visitors: number }>
  return {
    summary: {
      clicks: Number(summary.clicks || 0),
      unique_visitors: Number(summary.unique_visitors || 0),
      clicks_today: Number(summary.clicks_today || 0),
      clicks_7d: Number(summary.clicks_7d || 0),
      clicks_30d: Number(summary.clicks_30d || 0),
      direct_visits: Number(summary.direct_visits || 0),
      automatic_referrals: Number(summary.automatic_referrals || 0),
    },
    trend: trend.map(item => ({ day: item.day, clicks: Number(item.clicks), unique_visitors: Number(item.unique_visitors) })),
    referrals: referrals.map(item => ({ host: String(item.host), visits: Number(item.visits), unique_visitors: Number(item.unique_visitors) })),
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

export function getPromotionSource(id: number, _event?: H3Event) {
  const db = useGuideDatabase()
  const row = db.prepare(`
    SELECT s.*, COUNT(v.id) AS clicks, COUNT(DISTINCT v.visitor_hash) AS unique_visitors,
      SUM(CASE WHEN datetime(v.occurred_at) >= datetime('now', 'start of day') THEN 1 ELSE 0 END) AS clicks_today,
      SUM(CASE WHEN datetime(v.occurred_at) >= datetime('now', '-7 days') THEN 1 ELSE 0 END) AS clicks_7d,
      SUM(CASE WHEN datetime(v.occurred_at) >= datetime('now', '-30 days') THEN 1 ELSE 0 END) AS clicks_30d
    FROM promotion_sources s LEFT JOIN promotion_visits v ON v.source_id = s.id
    WHERE s.id = ? GROUP BY s.id
  `).get(id) as Record<string, unknown> | undefined
  return row ? sourceRow(row) : null
}

export function recordHomepageVisit(event: H3Event) {
  const userAgent = String(getRequestHeader(event, 'user-agent') || '').slice(0, 512)
  if (isRobot(userAgent)) return { recorded: false, reason: 'robot' as const }

  const db = useGuideDatabase()
  const tracking = trackingValues(event)
  const source = findTrackingSource(tracking.ref_code, tracking.utm_source)
  const refererHost = externalRefererHost(event)
  const ipHash = hashRequestIp(event)
  const visitorHash = ipHash
    ? crypto.createHash('sha256').update(`${ipHash}:${userAgent}`).digest('hex')
    : null
  const occurredAt = new Date().toISOString()
  const sourceId = source ? Number(source.id) : null

  if (visitorHash) {
    const duplicate = db.prepare(`
      SELECT id FROM promotion_visits
      WHERE visitor_hash = ?
        AND occurred_at >= ?
        AND COALESCE(source_id, 0) = COALESCE(?, 0)
        AND COALESCE(referer_host, '') = COALESCE(?, '')
        AND COALESCE(utm_campaign, '') = COALESCE(?, '')
        AND COALESCE(utm_content, '') = COALESCE(?, '')
      LIMIT 1
    `).get(
      visitorHash,
      new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      sourceId,
      refererHost,
      tracking.utm_campaign,
      tracking.utm_content,
    )
    if (duplicate) return { recorded: false, reason: 'duplicate' as const }
  }

  db.prepare(`
    INSERT INTO promotion_visits (
      source_id, occurred_at, visitor_hash, referer_host, user_agent, landing_path,
      ref_code, utm_source, utm_medium, utm_campaign, utm_content
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    sourceId,
    occurredAt,
    visitorHash,
    refererHost,
    userAgent || null,
    landingPath(event),
    tracking.ref_code,
    tracking.utm_source,
    tracking.utm_medium,
    tracking.utm_campaign,
    tracking.utm_content,
  )
  return { recorded: true, source_id: sourceId, referer_host: refererHost }
}

function findTrackingSource(refCode: string | null, utmSource: string | null) {
  const db = useGuideDatabase()
  if (refCode) {
    const source = db.prepare('SELECT id FROM promotion_sources WHERE enabled = 1 AND code = ?').get(refCode) as { id: number } | undefined
    if (source) return source
  }
  if (!utmSource) return null
  return db.prepare(`
    SELECT id FROM promotion_sources
    WHERE enabled = 1 AND (lower(code) = lower(?) OR lower(utm_source) = lower(?))
    ORDER BY id ASC LIMIT 1
  `).get(utmSource, utmSource) as { id: number } | undefined || null
}

function trackingValues(event: H3Event): TrackingValues {
  const query = getQuery(event)
  return {
    ref_code: cleanTrackingParam(query.ref, 48)?.toLowerCase() || null,
    utm_source: cleanTrackingParam(query.utm_source),
    utm_medium: cleanTrackingParam(query.utm_medium),
    utm_campaign: cleanTrackingParam(query.utm_campaign),
    utm_content: cleanTrackingParam(query.utm_content),
  }
}

function externalRefererHost(event: H3Event) {
  const referer = getRequestHeader(event, 'referer') || ''
  try {
    const url = new URL(referer)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    const host = url.hostname.toLowerCase().slice(0, 255)
    const requestHost = getRequestURL(event).hostname.toLowerCase()
    const mainHost = new URL(getGuideConfig(event).sub2apiOrigin).hostname.toLowerCase()
    return host && host !== requestHost && host !== mainHost ? host : null
  } catch {
    return null
  }
}

function landingPath(event: H3Event) {
  const original = getRequestHeader(event, 'x-original-uri') || getRequestURL(event).pathname
  try {
    return new URL(original, 'https://landing.invalid').pathname.slice(0, 500) || '/'
  } catch {
    return '/'
  }
}

function cleanTrackingParam(value: unknown, maxLength = 120) {
  const item = Array.isArray(value) ? value[0] : value
  const text = String(item || '').trim()
  return text ? text.slice(0, maxLength) : null
}

function isRobot(userAgent: string) {
  return /bot|crawler|spider|slurp|bingpreview|facebookexternalhit|headless|lighthouse|monitoring|uptime/i.test(userAgent)
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
