import crypto from 'node:crypto'
import { nextChinaStartIso } from './quota-time.js'

const columns = `
  id,
  public_id,
  category,
  title,
  content,
  contact,
  page_url,
  source,
  user_id,
  user_email,
  user_name,
  status,
  admin_reply,
  admin_note,
  ip_hash,
  user_agent,
  metadata_json,
  created_at,
  updated_at,
  replied_at,
  closed_at
`

export function createFeedbackRepository(db) {
  const insert = db.prepare(`
    INSERT INTO feedback (
      public_id,
      category,
      title,
      content,
      contact,
      page_url,
      source,
      user_id,
      user_email,
      user_name,
      status,
      admin_reply,
      admin_note,
      ip_hash,
      user_agent,
      metadata_json,
      created_at,
      updated_at,
      replied_at,
      closed_at
    ) VALUES (
      @public_id,
      @category,
      @title,
      @content,
      @contact,
      @page_url,
      @source,
      @user_id,
      @user_email,
      @user_name,
      @status,
      @admin_reply,
      @admin_note,
      @ip_hash,
      @user_agent,
      @metadata_json,
      @created_at,
      @updated_at,
      @replied_at,
      @closed_at
    )
  `)

  const getById = db.prepare(`SELECT ${columns} FROM feedback WHERE id = ?`)
  const getByPublicId = db.prepare(`SELECT ${columns} FROM feedback WHERE public_id = ?`)
  const countByUserSince = db.prepare(`
    SELECT COUNT(*) AS count
    FROM feedback
    WHERE user_id = ? AND created_at >= ?
  `)

  return {
    create(input) {
      const now = new Date().toISOString()
      const row = {
        public_id: createPublicId(),
        category: input.category,
        title: input.title,
        content: input.content,
        contact: emptyToNull(input.contact),
        page_url: emptyToNull(input.page_url),
        source: input.source || 'guide',
        user_id: emptyToNull(input.user_id),
        user_email: emptyToNull(input.user_email),
        user_name: emptyToNull(input.user_name),
        status: 'open',
        admin_reply: null,
        admin_note: null,
        ip_hash: input.ip_hash || null,
        user_agent: input.user_agent || null,
        metadata_json: input.metadata ? JSON.stringify(input.metadata) : null,
        created_at: now,
        updated_at: now,
        replied_at: null,
        closed_at: null,
      }

      insert.run(row)
      return this.get(row.public_id)
    },

    get(id) {
      const row = /^\d+$/.test(String(id)) ? getById.get(Number(id)) : getByPublicId.get(String(id))
      return row ? normalizeRow(row) : null
    },

    countUserSince(userId, sinceIso) {
      return countByUserSince.get(String(userId), sinceIso).count
    },

    quotaForUser(userId, sinceIso, limit) {
      const used = this.countUserSince(userId, sinceIso)
      return {
        limit,
        used,
        remaining: Math.max(0, limit - used),
        resets_at: nextChinaStartIso(),
      }
    },

    listUser(userId, filters) {
      const page = filters.page
      const pageSize = filters.page_size
      const params = {
        user_id: String(userId),
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }
      const total = db.prepare('SELECT COUNT(*) AS count FROM feedback WHERE user_id = @user_id').get(params).count
      const rows = db.prepare(`
        SELECT ${publicColumns()}
        FROM feedback
        WHERE user_id = @user_id
        ORDER BY created_at DESC, id DESC
        LIMIT @limit OFFSET @offset
      `).all(params)

      return {
        items: rows.map(normalizePublicRow),
        total,
        page,
        page_size: pageSize,
        pages: Math.max(1, Math.ceil(total / pageSize)),
      }
    },

    list(filters) {
      const clauses = []
      const params = {
        limit: filters.page_size,
        offset: (filters.page - 1) * filters.page_size,
      }

      if (filters.status) {
        clauses.push('status = @status')
        params.status = filters.status
      }
      if (filters.category) {
        clauses.push('category = @category')
        params.category = filters.category
      }
      if (filters.q) {
        clauses.push('(public_id LIKE @q OR title LIKE @q OR content LIKE @q OR contact LIKE @q OR user_email LIKE @q OR user_name LIKE @q)')
        params.q = `%${filters.q}%`
      }

      const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
      const total = db.prepare(`SELECT COUNT(*) AS count FROM feedback ${where}`).get(params).count
      const rows = db.prepare(`
        SELECT ${columns}
        FROM feedback
        ${where}
        ORDER BY created_at DESC, id DESC
        LIMIT @limit OFFSET @offset
      `).all(params)

      return {
        items: rows.map(normalizeRow),
        total,
        page: filters.page,
        page_size: filters.page_size,
        pages: Math.max(1, Math.ceil(total / filters.page_size)),
      }
    },

    update(id, patch) {
      const current = this.get(id)
      if (!current) return null

      const nextStatus = patch.status ?? current.status
      const closedAt = ['closed', 'spam'].includes(nextStatus)
        ? (current.closed_at || new Date().toISOString())
        : null
      const adminReply = patch.admin_reply === undefined ? current.admin_reply : emptyToNull(patch.admin_reply)
      const repliedAt = adminReply && adminReply !== current.admin_reply
        ? new Date().toISOString()
        : (adminReply ? current.replied_at : null)

      db.prepare(`
        UPDATE feedback
        SET
          status = @status,
          admin_reply = @admin_reply,
          admin_note = @admin_note,
          updated_at = @updated_at,
          replied_at = @replied_at,
          closed_at = @closed_at
        WHERE id = @id
      `).run({
        id: current.id,
        status: nextStatus,
        admin_reply: adminReply,
        admin_note: patch.admin_note === undefined ? current.admin_note : emptyToNull(patch.admin_note),
        updated_at: new Date().toISOString(),
        replied_at: repliedAt,
        closed_at: closedAt,
      })

      return this.get(current.id)
    },
  }
}

function createPublicId() {
  return `fb_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`
}

function publicColumns() {
  return `
    public_id,
    category,
    title,
    content,
    contact,
    page_url,
    source,
    status,
    admin_reply,
    created_at,
    updated_at,
    replied_at,
    closed_at
  `
}

function emptyToNull(value) {
  if (value == null) return null
  const trimmed = String(value).trim()
  return trimmed ? trimmed : null
}

function normalizeRow(row) {
  return {
    ...row,
    metadata: row.metadata_json ? safeParseJson(row.metadata_json) : null,
    metadata_json: undefined,
  }
}

function normalizePublicRow(row) {
  return {
    id: row.public_id,
    category: row.category,
    title: row.title,
    content: row.content,
    contact: row.contact,
    page_url: row.page_url,
    source: row.source,
    status: row.status,
    admin_reply: row.admin_reply,
    created_at: row.created_at,
    updated_at: row.updated_at,
    replied_at: row.replied_at,
    closed_at: row.closed_at,
  }
}

function safeParseJson(value) {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}
