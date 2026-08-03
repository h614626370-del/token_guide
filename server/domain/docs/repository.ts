import fs from 'node:fs'
import path from 'node:path'
import type Database from 'better-sqlite3'
import type { AdminDocUpdateInput, EditableDocId } from './schema'

interface DocDefinition {
  id: EditableDocId
  path: '/' | '/integration' | '/member'
  file: string
  label: string
}

interface DocContent {
  title: string
  description: string
  body: string
}

interface ContentOverrideRow extends DocContent {
  id: EditableDocId
  path: string
  created_at: string
  updated_at: string
  draft_title: string | null
  draft_description: string | null
  draft_body: string | null
  draft_updated_at: string | null
  published_at: string | null
  last_action: string | null
}

interface ContentVersionRow extends DocContent {
  version_id: number
  doc_id: EditableDocId
  path: string
  source: 'published' | 'draft' | 'default'
  action: string
  created_at: string
}

const docDefinitions: DocDefinition[] = [
  { id: 'index', path: '/', file: 'index.md', label: '指南首页' },
  { id: 'integration', path: '/integration', file: 'integration.md', label: 'API 接入配置' },
  { id: 'member', path: '/member', file: 'member.md', label: '会员充值流程' },
]

export interface EditableDocVersion extends DocContent {
  version_id: number
  source: 'published' | 'draft' | 'default'
  action: string
  created_at: string
}

export interface EditableDocView extends DocContent {
  id: EditableDocId
  path: string
  label: string
  source: 'default' | 'published' | 'draft'
  sync_status: 'default' | 'same_as_default' | 'custom' | 'draft_same_as_published' | 'draft_differs'
  has_override: boolean
  has_draft: boolean
  updated_at: string | null
  published_at: string | null
  draft_updated_at: string | null
  default_content: DocContent
  published_content: (DocContent & { updated_at: string | null }) | null
  history: EditableDocVersion[]
}

export interface PublicDocOverride extends DocContent {
  path: string
  updated_at: string
}

function definitionById(id: string | undefined) {
  return docDefinitions.find(item => item.id === id) || null
}

function definitionByPath(value: string | undefined) {
  const normalized = value === '' ? '/' : value
  return docDefinitions.find(item => item.path === normalized) || null
}

function sameContent(left: DocContent | null | undefined, right: DocContent | null | undefined) {
  if (!left || !right) return false
  return left.title === right.title
    && left.description === right.description
    && left.body === right.body
}

function parseFrontmatter(markdown: string, fallbackTitle: string): DocContent {
  const normalized = markdown.replace(/^\uFEFF/, '')
  if (!normalized.startsWith('---\n') && !normalized.startsWith('---\r\n')) {
    return { title: fallbackTitle, description: '', body: normalized.trimStart() }
  }

  const match = normalized.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!match) return { title: fallbackTitle, description: '', body: normalized.trimStart() }

  const frontmatter = match[1] || ''
  const values = Object.fromEntries(
    frontmatter
      .split(/\r?\n/)
      .map((line) => {
        const separator = line.indexOf(':')
        if (separator < 0) return null
        const key = line.slice(0, separator).trim()
        const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '')
        return [key, value]
      })
      .filter((item): item is [string, string] => Boolean(item)),
  )

  return {
    title: values.title || fallbackTitle,
    description: values.description || '',
    body: normalized.slice(match[0].length).trimStart(),
  }
}

function readDefaultDoc(definition: DocDefinition) {
  const filePath = path.join(process.cwd(), 'content', definition.file)
  const markdown = fs.readFileSync(filePath, 'utf8')
  return parseFrontmatter(markdown, definition.label)
}

function draftFromRow(row: ContentOverrideRow | undefined | null): DocContent | null {
  if (!row?.draft_body) return null
  return {
    title: row.draft_title || '',
    description: row.draft_description || '',
    body: row.draft_body,
  }
}

function publishedFromRow(row: ContentOverrideRow | undefined | null): (DocContent & { updated_at: string | null }) | null {
  if (!row?.published_at) return null
  return {
    title: row.title,
    description: row.description,
    body: row.body,
    updated_at: row.published_at,
  }
}

function actionLabel(action: string) {
  const labels: Record<string, string> = {
    before_draft_save: '保存草稿前',
    before_publish: '发布前',
    before_default_publish: '默认覆盖前',
    before_delete: '删除覆盖前',
    before_restore: '恢复历史前',
    legacy_publish: '旧版本发布',
  }
  return labels[action] || action
}

function toVersion(row: ContentVersionRow): EditableDocVersion {
  return {
    version_id: row.version_id,
    title: row.title,
    description: row.description,
    body: row.body,
    source: row.source,
    action: actionLabel(row.action),
    created_at: row.created_at,
  }
}

function toView(
  definition: DocDefinition,
  row: ContentOverrideRow | undefined | null,
  history: ContentVersionRow[] = [],
): EditableDocView {
  const defaultContent = readDefaultDoc(definition)
  const draft = draftFromRow(row)
  const published = publishedFromRow(row)
  const editorContent = draft || published || defaultContent
  const source = draft ? 'draft' : published ? 'published' : 'default'
  const liveContent = published || defaultContent
  const syncStatus = draft
    ? sameContent(draft, liveContent) ? 'draft_same_as_published' : 'draft_differs'
    : !published
      ? 'default'
      : sameContent(published, defaultContent) ? 'same_as_default' : 'custom'

  return {
    ...definition,
    title: editorContent.title,
    description: editorContent.description,
    body: editorContent.body,
    source,
    sync_status: syncStatus,
    has_override: Boolean(published),
    has_draft: Boolean(draft),
    updated_at: draft ? row?.draft_updated_at || null : published?.updated_at || null,
    published_at: published?.updated_at || null,
    draft_updated_at: row?.draft_updated_at || null,
    default_content: defaultContent,
    published_content: published,
    history: history.map(toVersion),
  }
}

export function createDocsRepository(db: Database.Database) {
  const listOverrides = db.prepare('SELECT * FROM content_overrides')
  const getById = db.prepare('SELECT * FROM content_overrides WHERE id = ?')
  const getByPath = db.prepare('SELECT * FROM content_overrides WHERE path = ?')
  const getVersionById = db.prepare('SELECT * FROM content_versions WHERE version_id = ? AND doc_id = ?')
  const listHistory = db.prepare('SELECT * FROM content_versions WHERE doc_id = ? ORDER BY created_at DESC, version_id DESC LIMIT 20')
  const insertVersion = db.prepare(`
    INSERT INTO content_versions (doc_id, path, title, description, body, source, action, created_at)
    VALUES (@doc_id, @path, @title, @description, @body, @source, @action, @created_at)
  `)
  const upsertPublished = db.prepare(`
    INSERT INTO content_overrides (
      id,
      path,
      title,
      description,
      body,
      created_at,
      updated_at,
      draft_title,
      draft_description,
      draft_body,
      draft_updated_at,
      published_at,
      last_action
    ) VALUES (
      @id,
      @path,
      @title,
      @description,
      @body,
      @created_at,
      @updated_at,
      NULL,
      NULL,
      NULL,
      NULL,
      @published_at,
      @last_action
    )
    ON CONFLICT(id) DO UPDATE SET
      path = excluded.path,
      title = excluded.title,
      description = excluded.description,
      body = excluded.body,
      updated_at = excluded.updated_at,
      draft_title = NULL,
      draft_description = NULL,
      draft_body = NULL,
      draft_updated_at = NULL,
      published_at = excluded.published_at,
      last_action = excluded.last_action
  `)
  const upsertDraft = db.prepare(`
    INSERT INTO content_overrides (
      id,
      path,
      title,
      description,
      body,
      created_at,
      updated_at,
      draft_title,
      draft_description,
      draft_body,
      draft_updated_at,
      published_at,
      last_action
    ) VALUES (
      @id,
      @path,
      @published_title,
      @published_description,
      @published_body,
      @created_at,
      @updated_at,
      @draft_title,
      @draft_description,
      @draft_body,
      @draft_updated_at,
      @published_at,
      @last_action
    )
    ON CONFLICT(id) DO UPDATE SET
      path = excluded.path,
      updated_at = excluded.updated_at,
      draft_title = excluded.draft_title,
      draft_description = excluded.draft_description,
      draft_body = excluded.draft_body,
      draft_updated_at = excluded.draft_updated_at,
      last_action = excluded.last_action
  `)
  const deleteOverride = db.prepare('DELETE FROM content_overrides WHERE id = ?')

  function row(id: EditableDocId) {
    return getById.get(id) as ContentOverrideRow | undefined
  }

  function history(id: EditableDocId) {
    return listHistory.all(id) as ContentVersionRow[]
  }

  function view(definition: DocDefinition) {
    return toView(definition, row(definition.id), history(definition.id))
  }

  function recordSnapshot(definition: DocDefinition, content: DocContent | null, source: 'published' | 'draft' | 'default', action: string, now: string) {
    if (!content) return
    insertVersion.run({
      doc_id: definition.id,
      path: definition.path,
      title: content.title,
      description: content.description,
      body: content.body,
      source,
      action,
      created_at: now,
    })
  }

  function currentPublishedOrDefault(definition: DocDefinition, existing: ContentOverrideRow | undefined) {
    return publishedFromRow(existing) || readDefaultDoc(definition)
  }

  const saveDraft = db.transaction((definition: DocDefinition, input: AdminDocUpdateInput) => {
    const existing = row(definition.id)
    const now = new Date().toISOString()
    recordSnapshot(definition, draftFromRow(existing), 'draft', 'before_draft_save', now)
    const published = currentPublishedOrDefault(definition, existing)
    upsertDraft.run({
      id: definition.id,
      path: definition.path,
      published_title: published.title,
      published_description: published.description,
      published_body: published.body,
      created_at: existing?.created_at || now,
      updated_at: now,
      draft_title: input.title,
      draft_description: input.description,
      draft_body: input.body,
      draft_updated_at: now,
      published_at: existing?.published_at || existing?.updated_at || null,
      last_action: 'draft_save',
    })
  })

  const publishContent = db.transaction((definition: DocDefinition, input: AdminDocUpdateInput, action = 'publish') => {
    const existing = row(definition.id)
    const now = new Date().toISOString()
    recordSnapshot(definition, publishedFromRow(existing), 'published', action === 'default_publish' ? 'before_default_publish' : 'before_publish', now)
    upsertPublished.run({
      id: definition.id,
      path: definition.path,
      title: input.title,
      description: input.description,
      body: input.body,
      created_at: existing?.created_at || now,
      updated_at: now,
      published_at: now,
      last_action: action,
    })
  })

  const removeOverride = db.transaction((definition: DocDefinition) => {
    const existing = row(definition.id)
    if (!existing) return
    const now = new Date().toISOString()
    recordSnapshot(definition, publishedFromRow(existing), 'published', 'before_delete', now)
    recordSnapshot(definition, draftFromRow(existing), 'draft', 'before_delete', now)
    deleteOverride.run(definition.id)
  })

  const restoreVersion = db.transaction((definition: DocDefinition, versionId: number) => {
    const version = getVersionById.get(versionId, definition.id) as ContentVersionRow | undefined
    if (!version) return false
    const existing = row(definition.id)
    const now = new Date().toISOString()
    recordSnapshot(definition, draftFromRow(existing), 'draft', 'before_restore', now)
    const published = currentPublishedOrDefault(definition, existing)
    upsertDraft.run({
      id: definition.id,
      path: definition.path,
      published_title: published.title,
      published_description: published.description,
      published_body: published.body,
      created_at: existing?.created_at || now,
      updated_at: now,
      draft_title: version.title,
      draft_description: version.description,
      draft_body: version.body,
      draft_updated_at: now,
      published_at: existing?.published_at || null,
      last_action: 'restore_version',
    })
    return true
  })

  return {
    list() {
      const rows = new Map(
        (listOverrides.all() as ContentOverrideRow[]).map(item => [item.id, item]),
      )
      return docDefinitions.map((definition) => {
        const item = toView(definition, rows.get(definition.id))
        const { body, default_content, published_content, history, ...summary } = item
        return summary
      })
    },

    get(id: string) {
      const definition = definitionById(id)
      if (!definition) return null
      return view(definition)
    },

    saveDraft(id: string, input: AdminDocUpdateInput) {
      const definition = definitionById(id)
      if (!definition) return null
      saveDraft(definition, input)
      return view(definition)
    },

    publish(id: string, input: AdminDocUpdateInput) {
      const definition = definitionById(id)
      if (!definition) return null
      publishContent(definition, input)
      return view(definition)
    },

    overwriteWithDefault(id: string) {
      const definition = definitionById(id)
      if (!definition) return null
      publishContent(definition, readDefaultDoc(definition), 'default_publish')
      return view(definition)
    },

    deleteOverride(id: string) {
      const definition = definitionById(id)
      if (!definition) return null
      removeOverride(definition)
      return view(definition)
    },

    restoreVersion(id: string, versionId: number) {
      const definition = definitionById(id)
      if (!definition) return null
      if (!restoreVersion(definition, versionId)) return null
      return view(definition)
    },

    getOverrideByPath(value: string): PublicDocOverride | null {
      const definition = definitionByPath(value)
      if (!definition) return null
      const item = getByPath.get(definition.path) as ContentOverrideRow | undefined
      if (!item?.published_at) return null
      return {
        path: item.path,
        title: item.title,
        description: item.description,
        body: item.body,
        updated_at: item.published_at,
      }
    },
  }
}
