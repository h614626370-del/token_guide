import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type Database from 'better-sqlite3'
import type { InstallerPlatform, InstallerScriptId, InstallerSettingsInput, InstallerTool } from './schema'

interface InstallerDefinition {
  id: InstallerScriptId
  tool: InstallerTool
  platform: InstallerPlatform
  label: string
  file: string
  filename: string
}

interface OverrideRow {
  id: InstallerScriptId
  content: string
  draft_content: string | null
  created_at: string
  updated_at: string
  draft_updated_at: string | null
  published_at: string | null
}

interface VersionRow {
  version_id: number
  script_id: InstallerScriptId
  content: string
  source: 'published' | 'draft' | 'default'
  action: string
  created_at: string
}

const definitions: InstallerDefinition[] = [
  { id: 'codex-windows', tool: 'codex', platform: 'windows', label: 'Codex · Windows', file: 'codex-cli/setup.ps1', filename: 'setup-codex-windows.ps1' },
  { id: 'codex-macos', tool: 'codex', platform: 'macos', label: 'Codex · macOS', file: 'codex-cli/setup-macos.sh', filename: 'setup-codex-macos.sh' },
  { id: 'codex-linux', tool: 'codex', platform: 'linux', label: 'Codex · Linux', file: 'codex-cli/setup-linux.sh', filename: 'setup-codex-linux.sh' },
  { id: 'claude-windows', tool: 'claude', platform: 'windows', label: 'Claude Code · Windows', file: 'claude-cli/setup.ps1', filename: 'setup-claude-windows.ps1' },
  { id: 'claude-macos', tool: 'claude', platform: 'macos', label: 'Claude Code · macOS', file: 'claude-cli/setup-macos.sh', filename: 'setup-claude-macos.sh' },
  { id: 'claude-linux', tool: 'claude', platform: 'linux', label: 'Claude Code · Linux', file: 'claude-cli/setup-linux.sh', filename: 'setup-claude-linux.sh' },
]

const settingDefaults: InstallerSettingsInput = {
  provider_id: 'onekey_relay',
  base_url: 'https://llapi.org',
  codex_default_model: 'gpt-5.6-sol',
  claude_default_model: '',
}

export function installerDefinition(id: string | undefined) {
  return definitions.find(item => item.id === id) || null
}

export function installerDefinitionFor(tool: InstallerTool, platform: InstallerPlatform) {
  return definitions.find(item => item.tool === tool && item.platform === platform) || null
}

function readDefault(definition: InstallerDefinition) {
  const candidates = [
    path.join(process.cwd(), 'scripts', definition.file),
    path.join(process.cwd(), '.output', 'scripts', definition.file),
    path.join(process.cwd(), 'server', 'scripts', definition.file),
  ]
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return fs.readFileSync(candidate, 'utf8').replace(/^\uFEFF/, '')
  }
  throw new Error(`Default installer script was not found: ${definition.file}`)
}

function validateTemplate(definition: InstallerDefinition, content: string) {
  const required = definition.tool === 'codex'
    ? ['{{PROVIDER_ID}}', '{{BASE_URL}}', '{{DEFAULT_MODEL}}']
    : ['{{BASE_URL}}', '{{DEFAULT_MODEL}}']
  const missing = required.filter(marker => !content.includes(marker))
  if (missing.length) throw new Error(`Missing required template markers: ${missing.join(', ')}`)
}

function checksum(content: string) {
  return createHash('sha256').update(content, 'utf8').digest('hex').toUpperCase()
}

function actionLabel(action: string) {
  const labels: Record<string, string> = {
    before_draft_save: '保存草稿前',
    before_publish: '发布前',
    before_default_publish: '默认覆盖前',
    before_restore: '恢复历史前',
  }
  return labels[action] || action
}

export function renderInstallerScript(content: string, tool: InstallerTool, settings: InstallerSettingsInput) {
  const model = tool === 'codex' ? settings.codex_default_model : settings.claude_default_model
  return content
    .replaceAll('{{PROVIDER_ID}}', settings.provider_id)
    .replaceAll('{{BASE_URL}}', settings.base_url.replace(/\/+$/, ''))
    .replaceAll('{{DEFAULT_MODEL}}', model)
}

export function createInstallerRepository(db: Database.Database) {
  const getOverride = db.prepare('SELECT * FROM installer_overrides WHERE id = ?')
  const listOverrides = db.prepare('SELECT * FROM installer_overrides')
  const listSettings = db.prepare('SELECT key, value FROM installer_settings')
  const upsertSetting = db.prepare(`
    INSERT INTO installer_settings (key, value, created_at, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `)
  const listVersions = db.prepare('SELECT * FROM installer_versions WHERE script_id = ? ORDER BY created_at DESC, version_id DESC LIMIT 20')
  const getVersion = db.prepare('SELECT * FROM installer_versions WHERE script_id = ? AND version_id = ?')
  const insertVersion = db.prepare(`
    INSERT INTO installer_versions (script_id, content, source, action, created_at)
    VALUES (?, ?, ?, ?, ?)
  `)
  const upsertDraft = db.prepare(`
    INSERT INTO installer_overrides (id, content, draft_content, created_at, updated_at, draft_updated_at, published_at, last_action)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'draft_save')
    ON CONFLICT(id) DO UPDATE SET draft_content = excluded.draft_content, updated_at = excluded.updated_at,
      draft_updated_at = excluded.draft_updated_at, last_action = 'draft_save'
  `)
  const upsertPublished = db.prepare(`
    INSERT INTO installer_overrides (id, content, draft_content, created_at, updated_at, draft_updated_at, published_at, last_action)
    VALUES (?, ?, NULL, ?, ?, NULL, ?, ?)
    ON CONFLICT(id) DO UPDATE SET content = excluded.content, draft_content = NULL, updated_at = excluded.updated_at,
      draft_updated_at = NULL, published_at = excluded.published_at, last_action = excluded.last_action
  `)

  function settings() {
    const saved = Object.fromEntries((listSettings.all() as Array<{ key: string, value: string }>).map(item => [item.key, item.value]))
    return { ...settingDefaults, ...saved }
  }

  function row(id: InstallerScriptId) {
    return getOverride.get(id) as OverrideRow | undefined
  }

  function snapshot(id: InstallerScriptId, content: string | null | undefined, source: VersionRow['source'], action: string, now: string) {
    if (content) insertVersion.run(id, content, source, action, now)
  }

  function view(definition: InstallerDefinition) {
    const defaultContent = readDefault(definition)
    const current = row(definition.id)
    const published = current?.published_at ? current.content : null
    const draft = current?.draft_content || null
    const active = draft || published || defaultContent
    return {
      ...definition,
      source: draft ? 'draft' : published ? 'published' : 'default',
      has_override: Boolean(published),
      has_draft: Boolean(draft),
      updated_at: draft ? current?.draft_updated_at : current?.published_at,
      published_at: current?.published_at || null,
      draft_updated_at: current?.draft_updated_at || null,
      checksum: checksum(renderInstallerScript(active, definition.tool, settings())),
      content: active,
      default_content: defaultContent,
      published_content: published,
      history: (listVersions.all(definition.id) as VersionRow[]).map(item => ({ ...item, action: actionLabel(item.action) })),
    }
  }

  const saveSettings = db.transaction((input: InstallerSettingsInput) => {
    const now = new Date().toISOString()
    for (const [key, value] of Object.entries(input)) upsertSetting.run(key, value, now, now)
  })

  const saveDraft = db.transaction((definition: InstallerDefinition, content: string) => {
    validateTemplate(definition, content)
    const current = row(definition.id)
    const now = new Date().toISOString()
    snapshot(definition.id, current?.draft_content, 'draft', 'before_draft_save', now)
    upsertDraft.run(definition.id, current?.published_at ? current.content : readDefault(definition), content, current?.created_at || now, now, now, current?.published_at || null)
  })

  const publish = db.transaction((definition: InstallerDefinition, content: string, action = 'publish') => {
    validateTemplate(definition, content)
    const current = row(definition.id)
    const now = new Date().toISOString()
    snapshot(definition.id, current?.published_at ? current.content : null, 'published', action === 'default_publish' ? 'before_default_publish' : 'before_publish', now)
    upsertPublished.run(definition.id, content, current?.created_at || now, now, now, action)
  })

  return {
    list() {
      const overrides = new Map((listOverrides.all() as OverrideRow[]).map(item => [item.id, item]))
      return definitions.map((definition) => {
        const current = overrides.get(definition.id)
        const defaultContent = readDefault(definition)
        const active = current?.draft_content || (current?.published_at ? current.content : defaultContent)
        return {
          ...definition,
          source: current?.draft_content ? 'draft' : current?.published_at ? 'published' : 'default',
          has_draft: Boolean(current?.draft_content),
          has_override: Boolean(current?.published_at),
          updated_at: current?.draft_updated_at || current?.published_at || null,
          checksum: checksum(renderInstallerScript(active, definition.tool, settings())),
        }
      })
    },
    settings,
    updateSettings(input: InstallerSettingsInput) {
      saveSettings(input)
      return settings()
    },
    get(id: string) {
      const definition = installerDefinition(id)
      return definition ? view(definition) : null
    },
    saveDraft(id: string, content: string) {
      const definition = installerDefinition(id)
      if (!definition) return null
      saveDraft(definition, content)
      return view(definition)
    },
    publish(id: string, content: string) {
      const definition = installerDefinition(id)
      if (!definition) return null
      publish(definition, content)
      return view(definition)
    },
    publishDefault(id: string) {
      const definition = installerDefinition(id)
      if (!definition) return null
      publish(definition, readDefault(definition), 'default_publish')
      return view(definition)
    },
    restoreVersion(id: string, versionId: number) {
      const definition = installerDefinition(id)
      if (!definition) return null
      const version = getVersion.get(id, versionId) as VersionRow | undefined
      if (!version) return null
      const current = row(definition.id)
      const now = new Date().toISOString()
      snapshot(definition.id, current?.draft_content, 'draft', 'before_restore', now)
      validateTemplate(definition, version.content)
      upsertDraft.run(definition.id, current?.published_at ? current.content : readDefault(definition), version.content, current?.created_at || now, now, now, current?.published_at || null)
      return view(definition)
    },
    publicScript(tool: InstallerTool, platform: InstallerPlatform) {
      const definition = installerDefinitionFor(tool, platform)
      if (!definition) return null
      const current = row(definition.id)
      const template = current?.published_at ? current.content : readDefault(definition)
      const content = renderInstallerScript(template, tool, settings())
      return { definition, content, checksum: checksum(content) }
    },
  }
}
