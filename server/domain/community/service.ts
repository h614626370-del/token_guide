import type Database from 'better-sqlite3'
import { useGuideDatabase } from '../../utils/database'

export const communityCategories = ['tools', 'skills', 'mcp', 'agent', 'plugin'] as const
export const communityStatuses = ['draft', 'published', 'archived'] as const

export type CommunityCategory = typeof communityCategories[number]
export type CommunityStatus = typeof communityStatuses[number]

export interface CommunityItemInput {
  slug: string
  category: CommunityCategory
  name: string
  summary: string
  description_md?: string
  icon_url?: string | null
  official_url: string
  tags?: string[]
  compatibility?: string | null
  status?: CommunityStatus
  is_featured?: boolean
  sort_order?: number
  images?: CommunityImageInput[]
}

export interface CommunityImageInput {
  image_url: string
  title?: string | null
  alt_text?: string | null
  sort_order?: number
}

export interface CommunityImage {
  id: number
  image_url: string
  title: string | null
  alt_text: string | null
  sort_order: number
}

export interface CommunityItem {
  id: number
  slug: string
  category: CommunityCategory
  name: string
  summary: string
  description_md: string
  icon_url: string | null
  official_url: string
  tags: string[]
  compatibility: string | null
  status: CommunityStatus
  is_featured: boolean
  sort_order: number
  like_count: number
  liked: boolean
  created_at: string
  updated_at: string
  published_at: string | null
  images: CommunityImage[]
}

interface CommunityListOptions {
  category?: CommunityCategory
  query?: string
  sort?: 'recommended' | 'popular' | 'recent'
  userId?: string | null
}

function itemFromRow(row: Record<string, unknown>, images: CommunityImage[] = []): CommunityItem {
  return {
    id: Number(row.id),
    slug: String(row.slug),
    category: String(row.category) as CommunityCategory,
    name: String(row.name),
    summary: String(row.summary),
    description_md: String(row.description_md || ''),
    icon_url: row.icon_url ? String(row.icon_url) : null,
    official_url: String(row.official_url),
    tags: parseTags(row.tags_json),
    compatibility: row.compatibility ? String(row.compatibility) : null,
    status: String(row.status) as CommunityStatus,
    is_featured: Boolean(row.is_featured),
    sort_order: Number(row.sort_order),
    like_count: Number(row.like_count || 0),
    liked: Boolean(row.liked),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    published_at: row.published_at ? String(row.published_at) : null,
    images,
  }
}

export function isCommunityCategory(value: unknown): value is CommunityCategory {
  return communityCategories.includes(value as CommunityCategory)
}

export function isCommunityStatus(value: unknown): value is CommunityStatus {
  return communityStatuses.includes(value as CommunityStatus)
}

export function listPublishedCommunityItems(options: CommunityListOptions = {}) {
  const db = useGuideDatabase()
  const conditions = ["i.status = 'published'"]
  const params: Record<string, unknown> = { user_id: options.userId || '' }
  if (options.category) {
    conditions.push('i.category = @category')
    params.category = options.category
  }
  if (options.query?.trim()) {
    conditions.push("(i.name LIKE @query ESCAPE '\\' OR i.summary LIKE @query ESCAPE '\\' OR i.tags_json LIKE @query ESCAPE '\\')")
    params.query = `%${escapeLike(options.query.trim().slice(0, 80))}%`
  }

  const orderBy = options.sort === 'popular'
    ? 'i.like_count DESC, i.is_featured DESC, i.sort_order ASC, i.name COLLATE NOCASE ASC'
    : options.sort === 'recent'
      ? 'COALESCE(i.published_at, i.created_at) DESC, i.id DESC'
      : 'i.is_featured DESC, i.sort_order ASC, i.like_count DESC, i.name COLLATE NOCASE ASC'
  const rows = db.prepare(`
    SELECT i.*,
      EXISTS(
        SELECT 1 FROM community_likes l
        WHERE l.item_id = i.id AND l.user_id = @user_id
      ) AS liked
    FROM community_items i
    WHERE ${conditions.join(' AND ')}
    ORDER BY ${orderBy}
  `).all(params) as Array<Record<string, unknown>>

  return {
    items: rows.map(row => itemFromRow(row)),
    counts: publicCategoryCounts(db),
  }
}

export function listAdminCommunityItems() {
  const db = useGuideDatabase()
  const rows = useGuideDatabase().prepare(`
    SELECT i.*, 0 AS liked
    FROM community_items i
    ORDER BY i.category ASC, i.sort_order ASC, i.created_at DESC
  `).all() as Array<Record<string, unknown>>
  return rows.map(row => itemFromRow(row, listCommunityImages(db, Number(row.id))))
}

export function getCommunityItem(id: number, includeUnpublished = false, userId?: string | null) {
  const row = useGuideDatabase().prepare(`
    SELECT i.*,
      EXISTS(
        SELECT 1 FROM community_likes l
        WHERE l.item_id = i.id AND l.user_id = @user_id
      ) AS liked
    FROM community_items i
    WHERE i.id = @id ${includeUnpublished ? '' : "AND i.status = 'published'"}
  `).get({ id, user_id: userId || '' }) as Record<string, unknown> | undefined
  return row ? itemFromRow(row, listCommunityImages(useGuideDatabase(), Number(row.id))) : null
}

export function getCommunityItemBySlug(category: CommunityCategory, slug: string, userId?: string | null) {
  const db = useGuideDatabase()
  const row = db.prepare(`
    SELECT i.*,
      EXISTS(
        SELECT 1 FROM community_likes l
        WHERE l.item_id = i.id AND l.user_id = @user_id
      ) AS liked
    FROM community_items i
    WHERE i.category = @category AND i.slug = @slug AND i.status = 'published'
  `).get({ category, slug, user_id: userId || '' }) as Record<string, unknown> | undefined
  return row ? itemFromRow(row, listCommunityImages(db, Number(row.id))) : null
}

export function listPublishedCommunityPaths() {
  return useGuideDatabase().prepare(`
    SELECT category, slug
    FROM community_items
    WHERE status = 'published'
    ORDER BY category ASC, sort_order ASC, id ASC
  `).all() as Array<{ category: CommunityCategory, slug: string }>
}

export function createCommunityItem(input: CommunityItemInput) {
  const db = useGuideDatabase()
  const normalized = normalizeCommunityInput(input)
  const { images, ...fields } = normalized
  const now = new Date().toISOString()
  const result = db.prepare(`
    INSERT INTO community_items (
      slug, category, name, summary, description_md, icon_url, official_url, tags_json,
      compatibility, status, is_featured, sort_order, like_count,
      created_at, updated_at, published_at
    ) VALUES (
      @slug, @category, @name, @summary, @description_md, @icon_url, @official_url, @tags_json,
      @compatibility, @status, @is_featured, @sort_order, 0,
      @created_at, @updated_at, @published_at
    )
  `).run({
    ...fields,
    is_featured: normalized.is_featured ? 1 : 0,
    created_at: now,
    updated_at: now,
    published_at: normalized.status === 'published' ? now : null,
  })
  const id = Number(result.lastInsertRowid)
  replaceCommunityImages(db, id, images)
  return getCommunityItem(id, true)
}

export function updateCommunityItem(id: number, input: Partial<CommunityItemInput>) {
  const db = useGuideDatabase()
  const existing = db.prepare('SELECT * FROM community_items WHERE id = ?').get(id) as Record<string, unknown> | undefined
  if (!existing) return null
  const normalized = normalizeCommunityInput({
    slug: input.slug ?? String(existing.slug),
    category: input.category ?? String(existing.category) as CommunityCategory,
    name: input.name ?? String(existing.name),
    summary: input.summary ?? String(existing.summary),
    description_md: input.description_md ?? String(existing.description_md || ''),
    icon_url: input.icon_url === undefined ? existing.icon_url as string | null : input.icon_url,
    official_url: input.official_url ?? String(existing.official_url),
    tags: input.tags === undefined ? parseTags(existing.tags_json) : input.tags,
    compatibility: input.compatibility === undefined ? existing.compatibility as string | null : input.compatibility,
    status: input.status ?? String(existing.status) as CommunityStatus,
    is_featured: input.is_featured ?? Boolean(existing.is_featured),
    sort_order: input.sort_order ?? Number(existing.sort_order),
    images: input.images === undefined ? listCommunityImages(db, id) : input.images,
  })
  const { images, ...fields } = normalized
  const now = new Date().toISOString()
  const publishedAt = normalized.status === 'published'
    ? (existing.published_at ? String(existing.published_at) : now)
    : null
  db.prepare(`
    UPDATE community_items
    SET slug = @slug, category = @category, name = @name, summary = @summary,
        description_md = @description_md,
        icon_url = @icon_url, official_url = @official_url, tags_json = @tags_json,
        compatibility = @compatibility, status = @status, is_featured = @is_featured,
        sort_order = @sort_order, updated_at = @updated_at, published_at = @published_at
    WHERE id = @id
  `).run({
    ...fields,
    is_featured: normalized.is_featured ? 1 : 0,
    id,
    updated_at: now,
    published_at: publishedAt,
  })
  replaceCommunityImages(db, id, images)
  return getCommunityItem(id, true)
}

export function deleteCommunityItem(id: number) {
  return Boolean(useGuideDatabase().prepare('DELETE FROM community_items WHERE id = ?').run(id).changes)
}

export function setCommunityItemStatus(id: number, status: 'published' | 'archived') {
  return updateCommunityItem(id, { status })
}

export function setCommunityLike(itemId: number, userId: string, liked: boolean) {
  const db = useGuideDatabase()
  const apply = db.transaction(() => {
    const item = db.prepare("SELECT id FROM community_items WHERE id = ? AND status = 'published'").get(itemId)
    if (!item) return null

    if (liked) {
      const inserted = db.prepare(`
        INSERT OR IGNORE INTO community_likes (item_id, user_id, created_at)
        VALUES (?, ?, ?)
      `).run(itemId, userId, new Date().toISOString())
      if (inserted.changes) {
        db.prepare('UPDATE community_items SET like_count = like_count + 1 WHERE id = ?').run(itemId)
      }
    } else {
      const removed = db.prepare('DELETE FROM community_likes WHERE item_id = ? AND user_id = ?').run(itemId, userId)
      if (removed.changes) {
        db.prepare('UPDATE community_items SET like_count = MAX(0, like_count - 1) WHERE id = ?').run(itemId)
      }
    }
    return getCommunityItem(itemId, false, userId)
  })
  return apply()
}

export function recountCommunityLikes() {
  const db = useGuideDatabase()
  db.prepare(`
    UPDATE community_items
    SET like_count = (
      SELECT COUNT(*) FROM community_likes l WHERE l.item_id = community_items.id
    )
  `).run()
  return listAdminCommunityItems()
}

function publicCategoryCounts(db: Database.Database) {
  const counts: Record<CommunityCategory | 'all', number> = { all: 0, tools: 0, skills: 0, mcp: 0, agent: 0, plugin: 0 }
  const rows = db.prepare(`
    SELECT category, COUNT(*) AS count
    FROM community_items
    WHERE status = 'published'
    GROUP BY category
  `).all() as Array<{ category: CommunityCategory, count: number }>
  for (const row of rows) {
    counts[row.category] = Number(row.count)
    counts.all += Number(row.count)
  }
  return counts
}

function normalizeCommunityInput(input: CommunityItemInput) {
  const slug = String(input.slug || '').trim().toLowerCase()
  const name = String(input.name || '').trim()
  const summary = String(input.summary || '').trim()
  const category = input.category
  const status = input.status || 'draft'
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 80) {
    throw new Error('Slug 只能使用小写字母、数字和短横线，且不能超过 80 个字符。')
  }
  if (!isCommunityCategory(category)) throw new Error('社区分类无效。')
  if (!name || name.length > 80) throw new Error('名称不能为空且不能超过 80 个字符。')
  if (summary.length < 10 || summary.length > 500) throw new Error('简介需要 10-500 个字符。')
  if (!isCommunityStatus(status)) throw new Error('发布状态无效。')

  const sortOrder = Number(input.sort_order ?? 1000)
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 1_000_000) {
    throw new Error('排序值必须是 0-1000000 之间的整数。')
  }
  return {
    slug,
    category,
    name,
    summary,
    description_md: String(input.description_md || '').trim().slice(0, 30_000),
    icon_url: normalizeIconUrl(input.icon_url),
    official_url: normalizeOfficialUrl(input.official_url),
    tags_json: JSON.stringify(normalizeTags(input.tags)),
    compatibility: cleanOptional(input.compatibility, 120),
    status,
    is_featured: input.is_featured === true,
    sort_order: sortOrder,
    images: normalizeCommunityImages(input.images),
  }
}

function listCommunityImages(db: Database.Database, itemId: number): CommunityImage[] {
  return (db.prepare(`
    SELECT id, image_url, title, alt_text, sort_order
    FROM community_item_images
    WHERE item_id = ?
    ORDER BY sort_order ASC, id ASC
  `).all(itemId) as Array<Record<string, unknown>>).map(row => ({
    id: Number(row.id),
    image_url: String(row.image_url),
    title: row.title ? String(row.title) : null,
    alt_text: row.alt_text ? String(row.alt_text) : null,
    sort_order: Number(row.sort_order),
  }))
}

function replaceCommunityImages(db: Database.Database, itemId: number, images: CommunityImageInput[]) {
  const apply = db.transaction(() => {
    db.prepare('DELETE FROM community_item_images WHERE item_id = ?').run(itemId)
    const insert = db.prepare(`
      INSERT INTO community_item_images (
        item_id, image_url, title, alt_text, sort_order, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    const now = new Date().toISOString()
    for (const image of images) {
      insert.run(itemId, image.image_url, image.title || null, image.alt_text || null, image.sort_order || 1000, now, now)
    }
  })
  apply()
}

function normalizeCommunityImages(value: unknown): CommunityImageInput[] {
  if (!Array.isArray(value)) return []
  return value.slice(0, 8).map((item, index) => {
    const input = item as Record<string, unknown>
    return {
      image_url: normalizeImageUrl(input.image_url),
      title: cleanOptional(input.title, 120),
      alt_text: cleanOptional(input.alt_text, 200),
      sort_order: index * 10 + 10,
    }
  })
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

function normalizeIconUrl(value: unknown) {
  return normalizeImageUrl(value, true)
}

function normalizeImageUrl(value: unknown): string
function normalizeImageUrl(value: unknown, icon: true): string | null
function normalizeImageUrl(value: unknown, icon = false): string | null {
  const text = String(value || '').trim()
  if (!text) {
    if (icon) return null
    throw new Error('详情图片地址不能为空。')
  }
  if (text.startsWith('/')) {
    if (!/^\/(?:uploads|community)\/[a-zA-Z0-9._-]+\.(png|jpe?g|webp|gif)$/i.test(text)) {
      throw new Error(`${icon ? '图标' : '详情图片'}必须是站内上传或社区目录下的图片。`)
    }
    return text
  }
  let parsed: URL
  try { parsed = new URL(text) } catch { throw new Error(`${icon ? '图标' : '详情图片'}地址格式无效。`) }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !/\.(png|jpe?g|webp|gif)$/i.test(parsed.pathname)) {
    throw new Error(`${icon ? '图标' : '详情图片'}必须使用 HTTPS 图片地址。`)
  }
  return parsed.toString()
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

function cleanOptional(value: unknown, maxLength: number) {
  const text = String(value || '').trim()
  return text ? text.slice(0, maxLength) : null
}

function escapeLike(value: string) {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')
}
