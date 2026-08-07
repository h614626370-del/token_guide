import crypto from 'node:crypto'
import { cp, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type Database from 'better-sqlite3'
import { unzipSync } from 'fflate'
import type { H3Event } from 'h3'
import { getGuideConfig } from '../../utils/config'
import { useGuideDatabase } from '../../utils/database'
import { getPublicRequestOrigin } from '../../utils/request-url'

const maxHomepageBytes = 20 * 1024 * 1024
const maxHomepageFileBytes = 5 * 1024 * 1024
const maxHomepageFiles = 300
const maxHomepageArchiveBytes = 25 * 1024 * 1024

export const homepageDefaults = [
  { id: 'ziyou', label: '自由home', directory: '自由home' },
  { id: 'xiangyun', label: '向云home', directory: '向云home' },
  { id: 'linglian', label: '灵链home', directory: '灵链home' },
] as const

type HomepageSource = 'default' | 'custom'

interface HomepageStateRow {
  active_source: HomepageSource
  active_default_id: string
  current_version: string | null
  last_action: string | null
  updated_at: string
}

export interface HomepageFile {
  path: string
  size: number
  content_type: string
  updated_at: string
}

export interface HomepageDefault extends HomepageFileSummary {
  id: string
  label: string
  directory: string
  available: boolean
}

export interface HomepageFileSummary {
  file_count: number
  total_bytes: number
  has_index: boolean
}

export type HomepageUploadMode = 'index' | 'merge' | 'directory' | 'archive'

export interface HomepageUploadResult extends HomepageFileSummary {
  files: HomepageFile[]
  mode: HomepageUploadMode
  preserved_count: number
  replaced_count: number
  added_count: number
}

export interface HomepageAdminState {
  public_url: string
  active_source: HomepageSource
  active_default_id: string
  active_label: string
  current_version: string | null
  updated_at: string
  current: HomepageFileSummary & { files: HomepageFile[] }
  draft: (HomepageFileSummary & { files: HomepageFile[] }) | null
  defaults: HomepageDefault[]
  history: HomepageHistory[]
}

export interface HomepageHistory {
  history_id: number
  source: HomepageSource
  default_id: string | null
  label: string
  action: string
  created_at: string
  restorable: boolean
}

export function homepageDataRoot(event?: H3Event) {
  return path.join(path.dirname(getGuideConfig(event).dbPath), 'homepages')
}

export function homepageDefaultsRoot(event?: H3Event) {
  return getGuideConfig(event).homepageDefaultsPath
}

export function homepagePublicUrl(event?: H3Event) {
  return new URL('/site-home/', `${getPublicRequestOrigin(event)}/`).toString()
}

export function getHomepageDefault(id: string) {
  return homepageDefaults.find(item => item.id === id) || null
}

function state(db: Database.Database): HomepageStateRow {
  const row = db.prepare('SELECT active_source, active_default_id, current_version, last_action, updated_at FROM homepage_settings WHERE id = 1').get() as HomepageStateRow | undefined
  if (row) return row
  const now = new Date().toISOString()
  db.prepare(`
    INSERT INTO homepage_settings (id, active_source, active_default_id, current_version, last_action, created_at, updated_at)
    VALUES (1, 'default', ?, NULL, 'initial_default', ?, ?)
  `).run(getGuideConfig().homepageDefaultId, now, now)
  return { active_source: 'default', active_default_id: getGuideConfig().homepageDefaultId, current_version: null, last_action: 'initial_default', updated_at: now }
}

function updateState(db: Database.Database, source: HomepageSource, defaultId: string, version: string | null, action: string) {
  const now = new Date().toISOString()
  db.prepare(`
    UPDATE homepage_settings
    SET active_source = ?, active_default_id = ?, current_version = ?, last_action = ?, updated_at = ?
    WHERE id = 1
  `).run(source, defaultId, version, action, now)
  return now
}

function customRoot(event?: H3Event) {
  return path.join(homepageDataRoot(event), 'current')
}

function draftRoot(event?: H3Event) {
  return path.join(homepageDataRoot(event), 'draft')
}

function backupRoot(event?: H3Event) {
  return path.join(homepageDataRoot(event), 'backups')
}

function defaultRoot(id: string, event?: H3Event) {
  const definition = getHomepageDefault(id)
  return definition ? path.join(homepageDefaultsRoot(event), definition.directory) : ''
}

async function directorySummary(root: string): Promise<HomepageFileSummary & { files: HomepageFile[] }> {
  const files: HomepageFile[] = []
  let totalBytes = 0

  async function walk(directory: string, prefix = '') {
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name
      const fullPath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath, relative)
        continue
      }
      if (!entry.isFile() || !isSafeHomepagePath(relative)) continue
      const info = await stat(fullPath)
      totalBytes += info.size
      files.push({
        path: relative,
        size: info.size,
        content_type: contentTypeFromPath(relative),
        updated_at: info.mtime.toISOString(),
      })
    }
  }

  await walk(root)
  files.sort((a, b) => a.path.localeCompare(b.path))
  return { files, file_count: files.length, total_bytes: totalBytes, has_index: files.some(file => file.path === 'index.html') }
}

export async function getHomepageAdminState(event?: H3Event): Promise<HomepageAdminState> {
  const db = useGuideDatabase()
  const currentState = state(db)
  const activeDefault = getHomepageDefault(currentState.active_default_id) || homepageDefaults[0]
  const liveRoot = currentState.active_source === 'custom'
    ? customRoot(event)
    : defaultRoot(activeDefault.id, event)
  const current = await directorySummary(liveRoot)
  const draftSummary = await directorySummary(draftRoot(event))
  const draft = draftSummary.file_count ? draftSummary : null
  const defaults = await Promise.all(homepageDefaults.map(async (definition) => {
    const summary = await directorySummary(defaultRoot(definition.id, event))
    return { ...definition, ...summary, available: summary.has_index }
  }))
  const history = (db.prepare(`
    SELECT history_id, source, default_id, label, action, snapshot_path, created_at
    FROM homepage_history
    ORDER BY created_at DESC, history_id DESC
    LIMIT 30
  `).all() as Array<HomepageHistory & { snapshot_path: string | null }>).map(item => ({
    history_id: item.history_id,
    source: item.source,
    default_id: item.default_id,
    label: item.label,
    action: item.action,
    created_at: item.created_at,
    restorable: item.source === 'default' || Boolean(item.snapshot_path),
  }))

  return {
    public_url: homepagePublicUrl(event),
    active_source: currentState.active_source,
    active_default_id: currentState.active_default_id,
    active_label: currentState.active_source === 'custom' ? '自定义上传首页' : activeDefault.label,
    current_version: currentState.current_version,
    updated_at: currentState.updated_at,
    current,
    draft,
    defaults,
    history,
  }
}

export async function readHomepageFile(relativePath: string, event?: H3Event, preview = false, requestedDefaultId = '') {
  const db = useGuideDatabase()
  const currentState = state(db)
  const previewDefault = requestedDefaultId ? getHomepageDefault(requestedDefaultId) : null
  const root = previewDefault
    ? defaultRoot(previewDefault.id, event)
    : preview && (await directorySummary(draftRoot(event))).has_index
    ? draftRoot(event)
    : currentState.active_source === 'custom'
      ? customRoot(event)
      : defaultRoot(currentState.active_default_id, event)
  const safePath = normalizeHomepagePath(relativePath || 'index.html')
  if (!safePath) return null
  const fullPath = safeJoin(root, safePath)
  if (!fullPath) return null
  try {
    const info = await stat(fullPath)
    if (!info.isFile()) return null
    const contentType = contentTypeFromPath(safePath)
    const bytes = rewriteHomepageAssetUrls(await readFile(fullPath), contentType)
    return { bytes, size: bytes.length, contentType, preview }
  } catch {
    return null
  }
}

function rewriteHomepageAssetUrls(bytes: Buffer, contentType: string) {
  if (!contentType.startsWith('text/html') && !contentType.startsWith('text/css')) return bytes

  let content = bytes.toString('utf8')

  if (contentType.startsWith('text/html')) {
    const resourceAttribute = /(<(?:img|script|source|video|audio|embed|input)\b[^>]*\b(?:src|poster)\s*=\s*["'])([^"']+)(["'])/gi
    const linkAttribute = /(<link\b[^>]*\bhref\s*=\s*["'])([^"']+)(["'])/gi
    content = content
      .replace(resourceAttribute, (_match, prefix: string, value: string, suffix: string) => `${prefix}${homepageAssetUrl(value)}${suffix}`)
      .replace(linkAttribute, (_match, prefix: string, value: string, suffix: string) => `${prefix}${homepageAssetUrl(value)}${suffix}`)
      .replace(/\bsrcset\s*=\s*(["'])(.*?)\1/gi, (match, quote: string, value: string) => {
        const rewritten = value.split(',').map((item) => {
          const [url, ...descriptor] = item.trim().split(/\s+/)
          return [homepageAssetUrl(url || ''), ...descriptor].join(' ')
        }).join(', ')
        return `srcset=${quote}${rewritten}${quote}`
      })
  }

  if (contentType.startsWith('text/html')) {
    content = content.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (_match, quote: string, value: string) => `url(${quote}${homepageAssetUrl(value.trim())}${quote})`)
  } else {
    content = content.replace(/url\(\s*(["']?)\/(?!\/|site-home(?:\/|$))/gi, 'url($1/site-home/')
  }
  return Buffer.from(content, 'utf8')
}

function homepageAssetUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(trimmed)) return value
  try {
    const resolved = new URL(trimmed, 'https://homepage.invalid/site-home/')
    if (resolved.origin !== 'https://homepage.invalid') return value
    if (resolved.pathname === '/site-home' || resolved.pathname.startsWith('/site-home/')) {
      return `${resolved.pathname}${resolved.search}${resolved.hash}`
    }
    return `/site-home${resolved.pathname}${resolved.search}${resolved.hash}`
  } catch {
    return value
  }
}

export async function stageHomepageFiles(files: Array<{ path: string; data: Buffer }>, event?: H3Event): Promise<HomepageUploadResult> {
  const normalized = normalizeUploadFiles(files)
  if (!normalized.length) throw new Error('请至少选择一个首页文件。')
  if (!normalized.some(file => file.path === 'index.html')) throw new Error('首页文件必须包含根目录 index.html。')

  const summary = await writeHomepageDraft(normalized, event)
  return { ...summary, mode: 'directory', preserved_count: 0, replaced_count: 0, added_count: normalized.length }
}

export async function stageHomepageIndex(file: { path: string; data: Buffer }, event?: H3Event): Promise<HomepageUploadResult> {
  const originalPath = normalizeHomepagePath(file.path)
  if (!originalPath || !['index.html', 'index.htm'].includes(originalPath.toLowerCase())) {
    throw new Error('替换首页只能上传根目录 index.html 或 index.htm。')
  }
  if (file.data.length > maxHomepageFileBytes) throw new Error('index.html 不能超过 5MB。')

  const result = await stageHomepageMerge([{ path: 'index.html', data: file.data }], event)
  return { ...result, mode: 'index' }
}

export async function stageHomepageMerge(files: Array<{ path: string; data: Buffer }>, event?: H3Event): Promise<HomepageUploadResult> {
  const normalized = normalizeUploadFiles(files)
  if (!normalized.length) throw new Error('请至少选择一个首页文件。')

  const db = useGuideDatabase()
  const currentState = state(db)
  const draftSummary = await directorySummary(draftRoot(event))
  const baseRoot = draftSummary.has_index
    ? draftRoot(event)
    : currentState.active_source === 'custom'
      ? customRoot(event)
      : defaultRoot(currentState.active_default_id, event)
  const baseFiles = await readHomepageDirectoryFiles(baseRoot)
  const merged = new Map(baseFiles.map(item => [item.path, item]))
  let replacedCount = 0
  let addedCount = 0
  for (const file of normalized) {
    if (merged.has(file.path)) replacedCount += 1
    else addedCount += 1
    merged.set(file.path, file)
  }
  const result = [...merged.values()]
  if (!result.some(file => file.path === 'index.html')) throw new Error('首页文件必须包含根目录 index.html。')

  const summary = await writeHomepageDraft(result, event)
  return {
    ...summary,
    mode: 'merge',
    preserved_count: baseFiles.length - replacedCount,
    replaced_count: replacedCount,
    added_count: addedCount,
  }
}

export async function stageHomepageArchive(data: Buffer, event?: H3Event): Promise<HomepageUploadResult> {
  if (!data.length) throw new Error('ZIP 压缩包为空。')
  if (data.length > maxHomepageArchiveBytes) throw new Error('ZIP 压缩包不能超过 25MB。')

  let archive: Record<string, Uint8Array>
  let archiveFileCount = 0
  let archiveTotalBytes = 0
  try {
    archive = unzipSync(data, {
      filter: (file) => {
        if (!file.name || file.name.endsWith('/') || isIgnoredHomepageUploadPath(file.name)) return false
        if (!normalizeHomepagePath(file.name)) throw new Error(`ZIP 文件路径不安全：${file.name}`)
        archiveFileCount += 1
        archiveTotalBytes += file.originalSize
        if (archiveFileCount > maxHomepageFiles) throw new Error(`首页文件不能超过 ${maxHomepageFiles} 个。`)
        if (file.originalSize > maxHomepageFileBytes) throw new Error(`文件 ${file.name} 不能超过 5MB。`)
        if (archiveTotalBytes > maxHomepageBytes) throw new Error('ZIP 解压后的总大小不能超过 20MB。')
        return true
      },
    })
  } catch (error) {
    if (error instanceof Error && /^(?:ZIP 文件路径不安全|首页文件不能超过|文件 .+ 不能超过|ZIP 解压后的总大小)/.test(error.message)) throw error
    throw new Error('ZIP 压缩包无法解压，请确认文件没有损坏。')
  }

  const files: Array<{ path: string; data: Buffer }> = []
  for (const [archivePath, bytes] of Object.entries(archive)) {
    if (!archivePath || archivePath.endsWith('/')) continue
    if (archivePath.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(archivePath)) {
      throw new Error(`ZIP 文件路径不安全：${archivePath}`)
    }
    const normalized = normalizeHomepagePath(archivePath)
    if (!normalized) throw new Error(`ZIP 文件路径不安全：${archivePath}`)
    files.push({ path: normalized, data: Buffer.from(bytes) })
  }
  if (!files.length) throw new Error('ZIP 压缩包中没有可用文件。')

  const normalized = normalizeUploadFiles(files)
  if (!normalized.some(file => file.path === 'index.html')) throw new Error('ZIP 压缩包必须包含根目录 index.html。')
  const summary = await writeHomepageDraft(normalized, event)
  return { ...summary, mode: 'archive', preserved_count: 0, replaced_count: 0, added_count: normalized.length }
}

async function writeHomepageDraft(normalized: Array<{ path: string; data: Buffer }>, event?: H3Event) {
  if (!normalized.length) throw new Error('请至少选择一个首页文件。')
  if (normalized.some(file => file.path === 'index.html' && !file.data.length)) throw new Error('index.html 不能为空。')

  const totalBytes = normalized.reduce((sum, file) => sum + file.data.length, 0)
  if (totalBytes > maxHomepageBytes) throw new Error('首页文件总大小不能超过 20MB。')
  if (normalized.length > maxHomepageFiles) throw new Error(`首页文件不能超过 ${maxHomepageFiles} 个。`)

  const root = homepageDataRoot(event)
  const temporary = path.join(root, `.draft-${Date.now()}-${crypto.randomBytes(5).toString('hex')}`)
  await rm(temporary, { recursive: true, force: true })
  await mkdir(temporary, { recursive: true })
  try {
    for (const file of normalized) {
      if (file.data.length > maxHomepageFileBytes) throw new Error(`文件 ${file.path} 不能超过 5MB。`)
      const destination = safeJoin(temporary, file.path)
      if (!destination) throw new Error(`文件路径不安全：${file.path}`)
      await mkdir(path.dirname(destination), { recursive: true })
      await writeFile(destination, file.data, { flag: 'wx' })
    }
    await mkdir(root, { recursive: true })
    await rm(draftRoot(event), { recursive: true, force: true })
    await rename(temporary, draftRoot(event))
    return await directorySummary(draftRoot(event))
  } catch (error) {
    await rm(temporary, { recursive: true, force: true })
    throw error
  }
}

async function readHomepageDirectoryFiles(root: string) {
  const files: Array<{ path: string; data: Buffer }> = []

  async function walk(directory: string, prefix = '') {
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name
      const fullPath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath, relative)
      } else if (entry.isFile() && isSafeHomepagePath(relative)) {
        files.push({ path: relative, data: await readFile(fullPath) })
      }
    }
  }

  await walk(root)
  return files
}

export async function applyHomepageDefault(id: string, event?: H3Event) {
  const definition = getHomepageDefault(id)
  if (!definition) throw new Error('默认首页不存在。')
  const root = defaultRoot(id, event)
  if (!(await directorySummary(root)).has_index) throw new Error('默认首页文件不完整。')
  const db = useGuideDatabase()
  await recordCurrentHistory(db, event, 'apply_default')
  updateState(db, 'default', id, null, 'apply_default')
  return getHomepageAdminState(event)
}

export async function publishHomepageDraft(event?: H3Event) {
  const summary = await directorySummary(draftRoot(event))
  if (!summary.has_index) throw new Error('请先上传包含 index.html 的首页文件。')
  const db = useGuideDatabase()
  await recordCurrentHistory(db, event, 'publish_custom')
  const root = homepageDataRoot(event)
  await mkdir(root, { recursive: true })
  await rm(customRoot(event), { recursive: true, force: true })
  await rename(draftRoot(event), customRoot(event))
  updateState(db, 'custom', 'ziyou', `custom-${Date.now()}`, 'publish_custom')
  return getHomepageAdminState(event)
}

export async function restoreHomepageHistory(historyId: number, event?: H3Event) {
  const db = useGuideDatabase()
  const item = db.prepare('SELECT history_id, source, default_id, snapshot_path FROM homepage_history WHERE history_id = ?').get(historyId) as { history_id: number; source: HomepageSource; default_id: string | null; snapshot_path: string | null } | undefined
  if (!item) throw new Error('首页历史版本不存在。')
  await recordCurrentHistory(db, event, 'restore_history')
  if (item.source === 'default') {
    const definition = getHomepageDefault(item.default_id || '')
    if (!definition || !(await directorySummary(defaultRoot(definition.id, event))).has_index) throw new Error('历史默认首页不可用。')
    updateState(db, 'default', definition.id, null, 'restore_history')
  } else {
    if (!item.snapshot_path) throw new Error('历史首页文件不存在。')
    const source = safeJoin(homepageDataRoot(event), item.snapshot_path)
    if (!source || !(await directorySummary(source)).has_index) throw new Error('历史首页文件不存在。')
    await replaceDirectory(source, customRoot(event))
    updateState(db, 'custom', 'ziyou', `restore-${Date.now()}`, 'restore_history')
  }
  return getHomepageAdminState(event)
}

async function recordCurrentHistory(db: Database.Database, event: H3Event | undefined, action: string) {
  const current = state(db)
  let snapshotPath: string | null = null
  if (current.active_source === 'custom' && (await directorySummary(customRoot(event))).has_index) {
    const snapshotName = `backups/${Date.now()}-${crypto.randomBytes(5).toString('hex')}`
    const destination = safeJoin(homepageDataRoot(event), snapshotName)
    if (!destination) throw new Error('首页备份目录不可用。')
    await mkdir(path.dirname(destination), { recursive: true })
    await cp(customRoot(event), destination, { recursive: true })
    snapshotPath = snapshotName
  }
  db.prepare(`
    INSERT INTO homepage_history (source, default_id, snapshot_path, label, action, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(current.active_source, current.active_source === 'default' ? current.active_default_id : null, snapshotPath, current.active_source === 'default' ? (getHomepageDefault(current.active_default_id)?.label || current.active_default_id) : '自定义上传首页', action, new Date().toISOString())
}

async function replaceDirectory(source: string, target: string) {
  const temporary = `${target}.restore-${crypto.randomBytes(5).toString('hex')}`
  await rm(temporary, { recursive: true, force: true })
  await cp(source, temporary, { recursive: true })
  await rm(target, { recursive: true, force: true })
  await rename(temporary, target)
}

function normalizeUploadFiles(files: Array<{ path: string; data: Buffer }>) {
  const uploadFiles = files.filter(file => !isIgnoredHomepageUploadPath(file.path))
  const paths = uploadFiles.map(file => {
    const normalized = normalizeHomepagePath(file.path)
    if (!normalized) throw new Error(`首页文件路径不安全：${file.path}`)
    return normalized
  })
  const indexPath = paths.includes('index.html')
    ? 'index.html'
    : paths.filter(value => value.endsWith('/index.html')).sort((a, b) => a.length - b.length)[0]
  const prefix = indexPath && indexPath !== 'index.html' ? indexPath.slice(0, -'index.html'.length) : ''
  const result = uploadFiles.map(file => {
    const normalized = normalizeHomepagePath(file.path)
    const relative = prefix && normalized.startsWith(prefix) ? normalized.slice(prefix.length) : normalized
    return { path: relative, data: file.data }
  }).filter(file => file.path)
  const seen = new Set<string>()
  for (const file of result) {
    if (!isSafeHomepagePath(file.path) || seen.has(file.path)) throw new Error(`首页文件路径无效或重复：${file.path}`)
    seen.add(file.path)
  }
  return result
}

function isIgnoredHomepageUploadPath(value: string) {
  const normalized = String(value || '').replace(/\\/g, '/')
  return normalized.split('/').some(part => part === '__MACOSX' || part === '.DS_Store' || part === 'Thumbs.db')
}

function normalizeHomepagePath(value: string) {
  const original = String(value || '')
  if (original.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(original)) return ''
  const normalized = original.replace(/\\/g, '/').replace(/\/+/g, '/')
  if (!normalized || normalized.includes('\0')) return ''
  const parts = normalized.split('/').filter(Boolean)
  if (parts.some(part => part === '.' || part === '..')) return ''
  return parts.join('/')
}

function safeJoin(root: string, relative: string) {
  const safe = normalizeHomepagePath(relative)
  if (!safe) return ''
  const resolvedRoot = path.resolve(root)
  const resolved = path.resolve(resolvedRoot, ...safe.split('/'))
  return resolved === resolvedRoot || resolved.startsWith(`${resolvedRoot}${path.sep}`) ? resolved : ''
}

function isSafeHomepagePath(value: string) {
  const normalized = normalizeHomepagePath(value)
  if (!normalized || normalized.length > 240 || normalized === 'index.html') return normalized === 'index.html'
  const ext = path.posix.extname(normalized).toLowerCase()
  return Boolean(ext) && ['.html', '.htm', '.css', '.js', '.mjs', '.json', '.map', '.txt', '.xml', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.otf', '.webmanifest'].includes(ext)
}

function contentTypeFromPath(value: string) {
  const ext = path.posix.extname(value).toLowerCase()
  return ({
    '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.map': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.webmanifest': 'application/manifest+json',
  } as Record<string, string>)[ext] || 'application/octet-stream'
}
