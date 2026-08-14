import type Database from 'better-sqlite3'
import { useGuideDatabase } from '../../utils/database'

export const gameCategories = ['board', 'arcade', 'puzzle', 'training', 'adventure'] as const
export const gameStatuses = ['draft', 'published', 'archived'] as const

export type GameCategory = typeof gameCategories[number]
export type GameStatus = typeof gameStatuses[number]

export interface GameItemInput {
  slug: string
  category: GameCategory
  name: string
  summary: string
  description_md?: string
  cover_url?: string | null
  official_url: string
  play_path: string
  license: string
  author: string
  tags?: string[]
  compatibility?: string | null
  status?: GameStatus
  is_featured?: boolean
  sort_order?: number
}

export interface GameItem {
  id: number
  slug: string
  category: GameCategory
  name: string
  summary: string
  description_md: string
  cover_url: string | null
  official_url: string
  play_path: string
  license: string
  author: string
  tags: string[]
  compatibility: string | null
  status: GameStatus
  is_featured: boolean
  sort_order: number
  online_count: number
  created_at: string
  updated_at: string
  published_at: string | null
}

export interface GameCounts {
  all: number
  board: number
  arcade: number
  puzzle: number
  training: number
  adventure: number
}

interface GameListOptions {
  category?: GameCategory
  query?: string
  sort?: 'recommended' | 'recent' | 'online'
}

interface GamePresenceBucket {
  expiresAt: number
}

declare global {
  // eslint-disable-next-line no-var
  var __guideGamePresence: Map<string, Map<string, GamePresenceBucket>> | undefined
}

const presence = globalThis.__guideGamePresence || (globalThis.__guideGamePresence = new Map())
const presenceTtlMs = 90_000

function itemFromRow(row: Record<string, unknown>): GameItem {
  return {
    id: Number(row.id),
    slug: String(row.slug),
    category: String(row.category) as GameCategory,
    name: String(row.name),
    summary: String(row.summary),
    description_md: String(row.description_md || ''),
    cover_url: row.cover_url ? String(row.cover_url) : null,
    official_url: String(row.official_url),
    play_path: String(row.play_path),
    license: String(row.license),
    author: String(row.author),
    tags: parseTags(row.tags_json),
    compatibility: row.compatibility ? String(row.compatibility) : null,
    status: String(row.status) as GameStatus,
    is_featured: Boolean(row.is_featured),
    sort_order: Number(row.sort_order),
    online_count: getGameOnlineCount(String(row.slug)),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    published_at: row.published_at ? String(row.published_at) : null,
  }
}

export function isGameCategory(value: unknown): value is GameCategory {
  return gameCategories.includes(value as GameCategory)
}

export function isGameStatus(value: unknown): value is GameStatus {
  return gameStatuses.includes(value as GameStatus)
}

export function listPublishedGames(options: GameListOptions = {}) {
  const db = useGuideDatabase()
  const conditions = ["status = 'published'"]
  const params: Record<string, unknown> = {}
  if (options.category) {
    conditions.push('category = @category')
    params.category = options.category
  }
  if (options.query?.trim()) {
    conditions.push("(name LIKE @query ESCAPE '\\' OR summary LIKE @query ESCAPE '\\' OR tags_json LIKE @query ESCAPE '\\')")
    params.query = `%${escapeLike(options.query.trim().slice(0, 80))}%`
  }

  const orderBy = options.sort === 'recent'
    ? 'COALESCE(published_at, created_at) DESC, id DESC'
    : options.sort === 'online'
      ? 'is_featured DESC, sort_order ASC, name COLLATE NOCASE ASC'
      : 'is_featured DESC, sort_order ASC, name COLLATE NOCASE ASC'
  const rows = db.prepare(`
    SELECT * FROM game_items
    WHERE ${conditions.join(' AND ')}
    ORDER BY ${orderBy}
  `).all(params) as Array<Record<string, unknown>>

  const items = rows.map(itemFromRow)
  if (options.sort === 'online') {
    items.sort((a, b) => b.online_count - a.online_count || Number(b.is_featured) - Number(a.is_featured) || a.sort_order - b.sort_order)
  }
  return {
    items,
    counts: publicGameCounts(db),
  }
}

export function listAdminGames() {
  const rows = useGuideDatabase().prepare(`
    SELECT * FROM game_items
    ORDER BY category ASC, sort_order ASC, created_at DESC
  `).all() as Array<Record<string, unknown>>
  return rows.map(itemFromRow)
}

export function getGameById(id: number, includeUnpublished = false) {
  const row = useGuideDatabase().prepare(`
    SELECT * FROM game_items
    WHERE id = ? ${includeUnpublished ? '' : "AND status = 'published'"}
  `).get(id) as Record<string, unknown> | undefined
  return row ? itemFromRow(row) : null
}

export function getGameBySlug(slug: string, includeUnpublished = false) {
  const row = useGuideDatabase().prepare(`
    SELECT * FROM game_items
    WHERE slug = ? ${includeUnpublished ? '' : "AND status = 'published'"}
  `).get(slug) as Record<string, unknown> | undefined
  return row ? itemFromRow(row) : null
}

export function listPublishedGamePaths() {
  return useGuideDatabase().prepare(`
    SELECT slug
    FROM game_items
    WHERE status = 'published'
    ORDER BY sort_order ASC, id ASC
  `).all() as Array<{ slug: string }>
}

export function createGame(input: GameItemInput) {
  const db = useGuideDatabase()
  const normalized = normalizeGameInput(input)
  const now = new Date().toISOString()
  const result = db.prepare(`
    INSERT INTO game_items (
      slug, category, name, summary, description_md, cover_url, official_url, play_path,
      license, author, tags_json, compatibility, status, is_featured, sort_order,
      created_at, updated_at, published_at
    ) VALUES (
      @slug, @category, @name, @summary, @description_md, @cover_url, @official_url, @play_path,
      @license, @author, @tags_json, @compatibility, @status, @is_featured, @sort_order,
      @created_at, @updated_at, @published_at
    )
  `).run({
    ...normalized,
    is_featured: normalized.is_featured ? 1 : 0,
    created_at: now,
    updated_at: now,
    published_at: normalized.status === 'published' ? now : null,
  })
  return getGameById(Number(result.lastInsertRowid), true)
}

export function updateGame(id: number, input: Partial<GameItemInput>) {
  const db = useGuideDatabase()
  const existing = db.prepare('SELECT * FROM game_items WHERE id = ?').get(id) as Record<string, unknown> | undefined
  if (!existing) return null
  const normalized = normalizeGameInput({
    slug: input.slug ?? String(existing.slug),
    category: input.category ?? String(existing.category) as GameCategory,
    name: input.name ?? String(existing.name),
    summary: input.summary ?? String(existing.summary),
    description_md: input.description_md ?? String(existing.description_md || ''),
    cover_url: input.cover_url === undefined ? existing.cover_url as string | null : input.cover_url,
    official_url: input.official_url ?? String(existing.official_url),
    play_path: input.play_path ?? String(existing.play_path),
    license: input.license ?? String(existing.license),
    author: input.author ?? String(existing.author),
    tags: input.tags === undefined ? parseTags(existing.tags_json) : input.tags,
    compatibility: input.compatibility === undefined ? existing.compatibility as string | null : input.compatibility,
    status: input.status ?? String(existing.status) as GameStatus,
    is_featured: input.is_featured ?? Boolean(existing.is_featured),
    sort_order: input.sort_order ?? Number(existing.sort_order),
  })
  const now = new Date().toISOString()
  const publishedAt = normalized.status === 'published'
    ? (existing.published_at ? String(existing.published_at) : now)
    : null
  db.prepare(`
    UPDATE game_items
    SET slug = @slug, category = @category, name = @name, summary = @summary,
        description_md = @description_md, cover_url = @cover_url,
        official_url = @official_url, play_path = @play_path, license = @license,
        author = @author, tags_json = @tags_json, compatibility = @compatibility,
        status = @status, is_featured = @is_featured, sort_order = @sort_order,
        updated_at = @updated_at, published_at = @published_at
    WHERE id = @id
  `).run({
    ...normalized,
    is_featured: normalized.is_featured ? 1 : 0,
    id,
    updated_at: now,
    published_at: publishedAt,
  })
  return getGameById(id, true)
}

export function deleteGame(id: number) {
  return Boolean(useGuideDatabase().prepare('DELETE FROM game_items WHERE id = ?').run(id).changes)
}

export function setGameStatus(id: number, status: 'published' | 'archived') {
  return updateGame(id, { status })
}

export function touchGamePresence(slug: string, sessionId: string) {
  const now = Date.now()
  prunePresence(now)
  let bucket = presence.get(slug)
  if (!bucket) {
    bucket = new Map()
    presence.set(slug, bucket)
  }
  bucket.set(sessionId, { expiresAt: now + presenceTtlMs })
  return bucket.size
}

export function getGameOnlineCount(slug: string) {
  prunePresence(Date.now())
  return presence.get(slug)?.size || 0
}

function prunePresence(now: number) {
  for (const [slug, bucket] of presence) {
    for (const [sessionId, record] of bucket) {
      if (record.expiresAt <= now) bucket.delete(sessionId)
    }
    if (!bucket.size) presence.delete(slug)
  }
}

function publicGameCounts(db: Database.Database): GameCounts {
  const counts: GameCounts = { all: 0, board: 0, arcade: 0, puzzle: 0, training: 0, adventure: 0 }
  const rows = db.prepare(`
    SELECT category, COUNT(*) AS count
    FROM game_items
    WHERE status = 'published'
    GROUP BY category
  `).all() as Array<{ category: GameCategory, count: number }>
  for (const row of rows) {
    counts[row.category] = Number(row.count)
    counts.all += Number(row.count)
  }
  return counts
}

function normalizeGameInput(input: GameItemInput) {
  const slug = String(input.slug || '').trim().toLowerCase()
  const name = String(input.name || '').trim()
  const summary = String(input.summary || '').trim()
  const status = input.status || 'draft'
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) {
    throw new Error('Slug 只能使用小写字母、数字和短横线，且不能超过 80 个字符。')
  }
  if (!isGameCategory(input.category)) throw new Error('游戏分类无效。')
  if (!name || name.length > 80) throw new Error('名称不能为空且不能超过 80 个字符。')
  if (summary.length < 10 || summary.length > 500) throw new Error('简介需要 10-500 个字符。')
  if (!isGameStatus(status)) throw new Error('发布状态无效。')
  if (!/\/games-static\/[a-z0-9-]+\/[a-zA-Z0-9._-]+\.html$/.test(String(input.play_path || '').trim())) {
    throw new Error('游戏地址必须是 /games-static/ 下的站内 HTML 页面。')
  }
  const sortOrder = Number(input.sort_order ?? 1000)
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 1_000_000) {
    throw new Error('排序值必须是 0-1000000 之间的整数。')
  }
  return {
    slug,
    category: input.category,
    name,
    summary,
    description_md: String(input.description_md || '').trim().slice(0, 30_000),
    cover_url: normalizeCoverUrl(input.cover_url),
    official_url: normalizeOfficialUrl(input.official_url),
    play_path: String(input.play_path || '').trim(),
    license: cleanRequired(input.license, 80, '许可证'),
    author: cleanRequired(input.author, 120, '作者'),
    tags_json: JSON.stringify(normalizeTags(input.tags)),
    compatibility: cleanOptional(input.compatibility, 120),
    status,
    is_featured: input.is_featured === true,
    sort_order: sortOrder,
  }
}

function normalizeOfficialUrl(value: unknown) {
  const text = String(value || '').trim()
  let parsed: URL
  try { parsed = new URL(text) } catch { throw new Error('官方地址必须是完整的 HTTP 或 HTTPS 地址。') }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error('官方地址格式不安全。')
  }
  return parsed.toString()
}

function normalizeCoverUrl(value: unknown) {
  const text = String(value || '').trim()
  if (!text) return null
  if (text.startsWith('/')) {
    if (!/^\/(?:uploads|games)\/[a-zA-Z0-9._/-]+\.(png|jpe?g|webp|gif)$/i.test(text)) {
      throw new Error('封面必须使用站内图片地址。')
    }
    return text
  }
  let parsed: URL
  try { parsed = new URL(text) } catch { throw new Error('封面地址格式无效。') }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !/\.(png|jpe?g|webp|gif)$/i.test(parsed.pathname)) {
    throw new Error('封面必须使用 HTTPS 图片地址。')
  }
  return parsed.toString()
}

function cleanRequired(value: unknown, maxLength: number, label: string) {
  const text = String(value || '').trim()
  if (!text || text.length > maxLength) throw new Error(`${label}不能为空且不能超过 ${maxLength} 个字符。`)
  return text
}

function cleanOptional(value: unknown, maxLength: number) {
  const text = String(value || '').trim()
  return text ? text.slice(0, maxLength) : null
}

function normalizeTags(value: unknown) {
  if (!Array.isArray(value)) return []
  const unique = new Set<string>()
  for (const item of value) {
    const tag = String(item || '').trim().slice(0, 24)
    if (tag) unique.add(tag)
    if (unique.size >= 8) break
  }
  return [...unique]
}

function parseTags(value: unknown) {
  try { return normalizeTags(JSON.parse(String(value || '[]'))) } catch { return [] }
}

function escapeLike(value: string) {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')
}
