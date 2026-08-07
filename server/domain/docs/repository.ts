import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import type { AdminDocSettingsInput, AdminDocUpdateInput, EditableDocId } from './schema'

interface DocDefinition {
  id: EditableDocId
  path: string
  file?: string
  label: string
  enabled: boolean
  sort_order: number
  is_custom: boolean
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

interface DocumentSettingRow {
  id: EditableDocId
  path: string
  label: string
  enabled: number
  sort_order: number
  is_custom: number
  created_at: string
  updated_at: string
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
  { id: 'index', path: '/', file: 'index.md', label: '指南首页', enabled: true, sort_order: 10, is_custom: false },
  { id: 'integration', path: '/integration', file: 'integration.md', label: 'API 接入配置', enabled: true, sort_order: 20, is_custom: false },
  { id: 'member', path: '/member', file: 'member.md', label: '会员充值流程', enabled: true, sort_order: 30, is_custom: false },
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
  enabled: boolean
  sort_order: number
  is_custom: boolean
}

export interface PublicDocOverride extends DocContent {
  path: string
  updated_at: string
}

function builtinDefinition(id: string | undefined) {
  return docDefinitions.find(item => item.id === id) || null
}

function sameContent(left: DocContent | null | undefined, right: DocContent | null | undefined) {
  if (!left || !right) return false
  return left.title === right.title
    && left.description === right.description
    && left.body === right.body
}

export function parseFrontmatter(markdown: string, fallbackTitle: string): DocContent {
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

function contentCandidates(file: string) {
  return [
    path.join(process.cwd(), 'content', file),
    path.join(process.cwd(), '.output', 'content', file),
    path.join(process.cwd(), 'server', 'content', file),
  ]
}

function readDefaultDoc(definition: DocDefinition) {
  if (!definition.file) {
    return { title: definition.label, description: '', body: '' }
  }
  for (const filePath of contentCandidates(definition.file)) {
    try {
      if (!fs.existsSync(filePath)) continue
      const markdown = fs.readFileSync(filePath, 'utf8')
      return parseFrontmatter(markdown, definition.label)
    } catch {
      // try next candidate
    }
  }

  // 运行镜像若未打包 content/，仍返回可编辑占位，避免整个后台文档接口 500
  return {
    title: definition.label,
    description: '',
    body: [
      `# ${definition.label}`,
      '',
      '> 默认 Markdown 源文件未找到（容器内缺少 `content/` 目录）。',
      '> 可直接在此编辑并发布；完整默认文稿请升级到包含 content 的镜像。',
      '',
    ].join('\n'),
  }
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
    enabled: definition.enabled,
    sort_order: definition.sort_order,
    is_custom: definition.is_custom,
  }
}

export function createDocsRepository(db: Database.Database) {
  const listOverrides = db.prepare('SELECT * FROM content_overrides')
  const getById = db.prepare('SELECT * FROM content_overrides WHERE id = ?')
  const getByPath = db.prepare('SELECT * FROM content_overrides WHERE path = ?')
  const listSettings = db.prepare('SELECT * FROM guide_document_settings ORDER BY sort_order ASC, created_at ASC, id ASC')
  const getSetting = db.prepare('SELECT * FROM guide_document_settings WHERE id = ?')
  const getSettingByPath = db.prepare('SELECT * FROM guide_document_settings WHERE path = ?')
  const insertSetting = db.prepare(`
    INSERT INTO guide_document_settings (id, path, label, enabled, sort_order, is_custom, created_at, updated_at)
    VALUES (@id, @path, @label, @enabled, @sort_order, @is_custom, @created_at, @updated_at)
  `)
  const updateSetting = db.prepare(`
    UPDATE guide_document_settings
    SET label = COALESCE(@label, label),
        enabled = COALESCE(@enabled, enabled),
        sort_order = COALESCE(@sort_order, sort_order),
        updated_at = @updated_at
    WHERE id = @id
  `)
  const deleteSetting = db.prepare('DELETE FROM guide_document_settings WHERE id = ?')
  const updateOverridePath = db.prepare('UPDATE content_overrides SET path = ? WHERE id = ?')
  const getVersionById = db.prepare('SELECT * FROM content_versions WHERE version_id = ? AND doc_id = ?')
  const listHistory = db.prepare('SELECT * FROM content_versions WHERE doc_id = ? ORDER BY created_at DESC, version_id DESC LIMIT 20')
  const insertVersion = db.prepare(`
    INSERT INTO content_versions (doc_id, path, title, description, body, source, action, created_at)
    VALUES (@doc_id, @path, @title, @description, @body, @source, @action, @created_at)
  `)
  const upsertPublished = db.prepare(`
    INSERT INTO content_overrides (
      id, path, title, description, body, created_at, updated_at,
      draft_title, draft_description, draft_body, draft_updated_at, published_at, last_action
    ) VALUES (
      @id, @path, @title, @description, @body, @created_at, @updated_at,
      NULL, NULL, NULL, NULL, @published_at, @last_action
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
      id, path, title, description, body, created_at, updated_at,
      draft_title, draft_description, draft_body, draft_updated_at, published_at, last_action
    ) VALUES (
      @id, @path, @published_title, @published_description, @published_body, @created_at, @updated_at,
      @draft_title, @draft_description, @draft_body, @draft_updated_at, @published_at, @last_action
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

  function setting(id: string | undefined) {
    return id ? getSetting.get(id) as DocumentSettingRow | undefined : undefined
  }

  function settingPath(value: string | undefined) {
    const normalized = value === '' || !value ? '/' : value
    return getSettingByPath.get(normalized) as DocumentSettingRow | undefined
  }

  function definitionFromSetting(row: DocumentSettingRow): DocDefinition {
    const builtin = builtinDefinition(row.id)
    return {
      id: row.id,
      path: row.path,
      file: builtin?.file,
      label: row.label,
      enabled: Boolean(row.enabled),
      sort_order: row.sort_order,
      is_custom: Boolean(row.is_custom),
    }
  }

  function definitionById(id: string | undefined) {
    const row = setting(id)
    return row ? definitionFromSetting(row) : null
  }

  function definitionByPath(value: string | undefined) {
    const row = settingPath(value)
    return row ? definitionFromSetting(row) : null
  }

  function row(id: EditableDocId) {
    return getById.get(id) as ContentOverrideRow | undefined
  }

  function history(id: EditableDocId) {
    return listHistory.all(id) as ContentVersionRow[]
  }

  function view(definition: DocDefinition) {
    return toView(definition, row(definition.id), history(definition.id))
  }

  function summary(definition: DocDefinition) {
    const item = view(definition)
    const { body, default_content, published_content, history, ...result } = item
    return result
  }

  function recordSnapshot(definition: DocDefinition, content: DocContent | null, source: 'published' | 'draft' | 'default', action: string, now: string) {
    if (!content || !content.body) return
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

  const removeOverride = (definition: DocDefinition) => {
    const existing = row(definition.id)
    if (!existing) return
    const now = new Date().toISOString()
    recordSnapshot(definition, publishedFromRow(existing), 'published', 'before_delete', now)
    recordSnapshot(definition, draftFromRow(existing), 'draft', 'before_delete', now)
    deleteOverride.run(definition.id)
  }

  const deleteDocument = db.transaction((definition: DocDefinition) => {
    if (!definition.is_custom) {
      removeOverride(definition)
      return false
    }
    deleteOverride.run(definition.id)
    deleteSetting.run(definition.id)
    return true
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

  const updateSettings = db.transaction((id: string, input: AdminDocSettingsInput) => {
    const definition = definitionById(id)
    if (!definition) return false
    updateSetting.run({
      id,
      label: input.label ?? null,
      enabled: input.enabled === undefined ? null : input.enabled ? 1 : 0,
      sort_order: input.sort_order ?? null,
      updated_at: new Date().toISOString(),
    })
    return true
  })

  const reorder = db.transaction((ids: string[]) => {
    const all = listSettings.all() as DocumentSettingRow[]
    const known = new Set(all.map(item => item.id))
    const requested = ids.filter((id, index) => known.has(id) && ids.indexOf(id) === index)
    const ordered = [...requested, ...all.map(item => item.id).filter(id => !requested.includes(id))]
    const now = new Date().toISOString()
    ordered.forEach((id, index) => updateSetting.run({ id, label: null, enabled: null, sort_order: (index + 1) * 10, updated_at: now }))
  })

  const createCustom = db.transaction((input: { id: string, path: string, label: string, content: DocContent }) => {
    if (settingPath(input.path)) return null
    const now = new Date().toISOString()
    const highest = db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS value FROM guide_document_settings').get() as { value: number }
    insertSetting.run({
      id: input.id,
      path: input.path,
      label: input.label,
      enabled: 0,
      sort_order: Number(highest.value || 0) + 10,
      is_custom: 1,
      created_at: now,
      updated_at: now,
    })
    upsertDraft.run({
      id: input.id,
      path: input.path,
      published_title: '',
      published_description: '',
      published_body: '',
      created_at: now,
      updated_at: now,
      draft_title: input.content.title,
      draft_description: input.content.description,
      draft_body: input.content.body,
      draft_updated_at: now,
      published_at: null,
      last_action: 'upload',
    })
    return input.id
  })

  return {
    list() {
      return (listSettings.all() as DocumentSettingRow[]).map(definitionFromSetting).map(summary)
    },

    get(id: string) {
      const definition = definitionById(id)
      return definition ? view(definition) : null
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
      if (!definition || definition.is_custom || !definition.file) return null
      publishContent(definition, readDefaultDoc(definition), 'default_publish')
      return view(definition)
    },

    deleteOverride(id: string) {
      const definition = definitionById(id)
      if (!definition || definition.is_custom) return null
      removeOverride(definition)
      return view(definition)
    },

    deleteDocument(id: string) {
      const definition = definitionById(id)
      if (!definition) return null
      const deleted = deleteDocument(definition)
      return deleted ? { deleted: true, id } : view(definition)
    },

    restoreVersion(id: string, versionId: number) {
      const definition = definitionById(id)
      if (!definition) return null
      if (!restoreVersion(definition, versionId)) return null
      return view(definition)
    },

    updateSettings(id: string, input: AdminDocSettingsInput) {
      if (!updateSettings(id, input)) return null
      return this.get(id)
    },

    reorder(ids: string[]) {
      reorder(ids)
      return this.list()
    },

    createCustom(input: { path: string, label: string, content: DocContent }) {
      const id = `custom_${randomUUID()}`
      const created = createCustom({ ...input, id })
      return created ? this.get(created) : null
    },

    getNavigation() {
      return (listSettings.all() as DocumentSettingRow[])
        .map(definitionFromSetting)
        .filter(item => item.enabled)
        .filter(item => !item.is_custom || Boolean(row(item.id)?.published_at))
        .map(item => ({ id: item.id, path: item.path, label: item.label, sort_order: item.sort_order, is_custom: item.is_custom }))
    },

    getOverrideByPath(value: string): PublicDocOverride | null {
      const definition = definitionByPath(value)
      if (!definition) return null
      if (definition.is_custom && !definition.enabled) return null
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

    getPublishedCustomByPath(value: string): PublicDocOverride | null {
      const definition = definitionByPath(value)
      if (!definition || !definition.is_custom || !definition.enabled) return null
      return this.getOverrideByPath(value)
    },
  }
}
