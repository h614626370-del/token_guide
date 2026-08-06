<script setup lang="ts">
import { Check, Copy, ExternalLink, FileUp, Home, RefreshCcw, Send, Upload } from 'lucide-vue-next'
import type { ApiSuccess } from '~/types/api'
import { apiErrorMessage } from '~/types/api'

definePageMeta({ layout: 'admin' })
useSeoMeta({ title: '首页管理', robots: 'noindex, nofollow' })

interface HomepageFile {
  path: string
  size: number
  content_type: string
  updated_at: string
}

interface HomepageSummary {
  file_count: number
  total_bytes: number
  has_index: boolean
  files: HomepageFile[]
}

interface HomepageDefault extends HomepageSummary {
  id: string
  label: string
  directory: string
  available: boolean
}

interface HomepageHistory {
  history_id: number
  source: 'default' | 'custom'
  default_id: string | null
  label: string
  action: string
  created_at: string
  restorable: boolean
}

interface HomepageState {
  public_url: string
  active_source: 'default' | 'custom'
  active_default_id: string
  active_label: string
  current_version: string | null
  updated_at: string
  current: HomepageSummary
  draft: HomepageSummary | null
  defaults: HomepageDefault[]
  history: HomepageHistory[]
}

const state = ref<HomepageState | null>(null)
const loading = ref(false)
const working = ref('')
const directoryInput = ref<HTMLInputElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const dragging = ref(false)
const notice = reactive({ type: 'idle' as 'idle' | 'success' | 'error', message: '' })

onMounted(() => { void load() })

async function load() {
  loading.value = true
  try {
    const response = await $fetch<ApiSuccess<HomepageState>>('/api/admin/homepage')
    state.value = response.data
  } catch (cause) {
    showError(cause, '首页配置读取失败。')
  } finally {
    loading.value = false
  }
}

function chooseDirectory() { directoryInput.value?.click() }
function chooseFiles() { fileInput.value?.click() }

function filePath(file: File) {
  return String((file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name)
}

async function upload(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  input.value = ''
  await uploadFiles(files)
}

async function uploadFiles(files: File[]) {
  if (!files.length) return

  working.value = 'upload'
  clearNotice()
  try {
    const manifest = files.map(filePath)
    const body = new FormData()
    body.append('manifest', JSON.stringify(manifest))
    files.forEach(file => body.append('files', file, file.name))
    const response = await $fetch<ApiSuccess<HomepageSummary>>('/api/admin/homepage/upload', { method: 'POST', body })
    await load()
    showSuccess(`已上传 ${response.data.file_count} 个文件，请预览确认后发布。`)
  } catch (cause) {
    showError(cause, '首页上传失败。')
  } finally {
    working.value = ''
  }
}

function dragEnter(event: DragEvent) {
  event.preventDefault()
  dragging.value = true
}

function dragLeave(event: DragEvent) {
  event.preventDefault()
  dragging.value = false
}

function dropFiles(event: DragEvent) {
  event.preventDefault()
  dragging.value = false
  void uploadFiles(Array.from(event.dataTransfer?.files || []))
}

async function applyDefault(item: HomepageDefault) {
  if (!item.available || !window.confirm(`确定将“${item.label}”应用为当前首页吗？`)) return
  working.value = `apply-${item.id}`
  clearNotice()
  try {
    await $fetch<ApiSuccess<HomepageState>>('/api/admin/homepage/apply', { method: 'POST', body: { default_id: item.id } })
    await load()
    showSuccess(`${item.label} 已应用。`)
  } catch (cause) {
    showError(cause, '默认首页应用失败。')
  } finally {
    working.value = ''
  }
}

async function publish() {
  if (!state.value?.draft || !window.confirm('确定发布当前上传的首页吗？')) return
  working.value = 'publish'
  clearNotice()
  try {
    await $fetch<ApiSuccess<HomepageState>>('/api/admin/homepage/publish', { method: 'POST' })
    await load()
    showSuccess('首页已发布并立即生效。')
  } catch (cause) {
    showError(cause, '首页发布失败。')
  } finally {
    working.value = ''
  }
}

async function restore(item: HomepageHistory) {
  if (!item.restorable || !window.confirm(`确定恢复“${item.label}”这个历史版本吗？`)) return
  working.value = `restore-${item.history_id}`
  clearNotice()
  try {
    await $fetch<ApiSuccess<HomepageState>>(`/api/admin/homepage/history/${item.history_id}`, { method: 'POST' })
    await load()
    showSuccess('首页历史版本已恢复。')
  } catch (cause) {
    showError(cause, '首页恢复失败。')
  } finally {
    working.value = ''
  }
}

async function copyUrl() {
  if (!state.value) return
  try {
    await navigator.clipboard.writeText(state.value.public_url)
    showSuccess('首页地址已复制。')
  } catch { showError(null, '复制失败，请手动复制地址。') }
}

function previewUrl(preview = false) {
  if (!state.value) return '#'
  return preview ? `${state.value.public_url}?preview=1` : state.value.public_url
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(2)} MB`
}

function formatTime(value: string | null) { return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '—' }
function clearNotice() { notice.type = 'idle'; notice.message = '' }
function showSuccess(message: string) { notice.type = 'success'; notice.message = message }
function showError(cause: unknown, fallback: string) { notice.type = 'error'; notice.message = apiErrorMessage(cause, fallback) }
</script>

<template>
  <AdminAccessGate>
    <div class="admin-page admin-homepage-page">
      <header class="admin-page-heading">
        <span>Homepage</span>
        <h1>首页管理</h1>
        <p>选择镜像内置首页，或上传独立的静态首页并即时发布。</p>
        <div class="admin-page-heading__actions">
          <a class="secondary-command" :href="previewUrl()" target="_blank" rel="noreferrer"><ExternalLink :size="16" />打开当前首页</a>
          <button class="secondary-command" type="button" @click="copyUrl"><Copy :size="16" />复制首页地址</button>
        </div>
      </header>

      <div v-if="notice.message" class="admin-notice" :class="`admin-notice--${notice.type}`">{{ notice.message }}</div>

      <section v-if="state" class="admin-status-band homepage-current-status">
        <Home :size="21" />
        <div><strong>当前首页：{{ state.active_label }}</strong><span>{{ state.active_source === 'custom' ? '自定义静态文件' : '镜像默认模板' }} · {{ state.current.file_count }} 个文件 · {{ formatBytes(state.current.total_bytes) }}</span></div>
        <div class="homepage-status-meta"><span>更新于 {{ formatTime(state.updated_at) }}</span><span v-if="state.current_version">版本 {{ state.current_version }}</span></div>
      </section>

      <section class="admin-section homepage-upload-section">
        <header class="admin-section__heading"><div><span>Custom files</span><h2>上传自定义首页</h2><p>选择整个静态目录，必须包含根目录 <code>index.html</code>。上传后先预览，再点击发布。</p></div><div class="homepage-upload-actions"><button class="secondary-command" type="button" :disabled="working !== ''" @click="chooseFiles"><FileUp :size="16" />选择文件</button><button class="primary-command" type="button" :disabled="working !== ''" @click="chooseDirectory"><Upload :size="16" />选择首页目录</button></div></header>
        <input ref="directoryInput" class="sr-only" type="file" multiple webkitdirectory directory @change="upload">
        <input ref="fileInput" class="sr-only" type="file" multiple accept=".html,.htm,.css,.js,.mjs,.json,.map,.txt,.png,.jpg,.jpeg,.webp,.gif,.svg,.ico,.woff,.woff2,.ttf,.otf,.webmanifest" @change="upload">
        <div class="homepage-upload-drop" :class="{ 'is-dragging': dragging }" @dragenter="dragEnter" @dragover="dragEnter" @dragleave="dragLeave" @drop="dropFiles"><strong>把 HTML 或静态资源拖到这里即可覆盖上传</strong><span>支持 HTML、CSS、JS、图片、字体和其他静态资源；也可以选择整个首页目录。</span></div>
        <div v-if="state?.draft" class="homepage-draft-row"><span>待发布草稿：{{ state.draft.file_count }} 个文件，{{ formatBytes(state.draft.total_bytes) }}</span><div><a class="secondary-command" :href="previewUrl(true)" target="_blank" rel="noreferrer"><ExternalLink :size="15" />预览草稿</a><button class="primary-command" type="button" :disabled="working !== ''" @click="publish"><Send :size="15" />{{ working === 'publish' ? '发布中...' : '发布草稿' }}</button></div></div>
      </section>

      <section class="admin-section">
        <header class="admin-section__heading"><div><span>Built-in templates</span><h2>默认首页模板</h2><p>这些首页会随 Guide 新版本一起发布，应用后立即成为当前首页。</p></div></header>
        <div class="homepage-default-grid">
          <article v-for="item in state?.defaults" :key="item.id" class="homepage-default-card" :class="{ active: state?.active_source === 'default' && state.active_default_id === item.id }">
            <div class="homepage-default-card__preview"><iframe :src="`${state?.public_url}?default=${item.id}`" :title="item.label" loading="lazy" /></div>
            <div class="homepage-default-card__body"><div><strong>{{ item.label }}</strong><span>{{ item.available ? `${item.file_count} 个文件 · ${formatBytes(item.total_bytes)}` : '模板文件不完整' }}</span></div><span v-if="state?.active_source === 'default' && state.active_default_id === item.id" class="homepage-active-tag"><Check :size="14" />当前使用</span></div>
            <button class="primary-command" type="button" :disabled="!item.available || working !== ''" @click="applyDefault(item)"><RefreshCcw :size="15" />{{ working === `apply-${item.id}` ? '应用中...' : '应用此模板' }}</button>
          </article>
        </div>
      </section>

      <section v-if="state" class="admin-section homepage-files-section">
        <header class="admin-section__heading"><div><span>Current files</span><h2>当前首页文件</h2><p>当前实际对外提供的静态文件。</p></div></header>
        <div class="homepage-file-list"><div v-for="file in state.current.files" :key="file.path" class="homepage-file-row"><code>{{ file.path }}</code><span>{{ formatBytes(file.size) }}</span></div><div v-if="!state.current.files.length" class="empty-result">当前首页文件为空。</div></div>
      </section>

      <section v-if="state?.history.length" class="admin-section">
        <header class="admin-section__heading"><div><span>History</span><h2>首页历史</h2><p>应用默认模板或发布自定义首页前会自动留下可恢复记录。</p></div></header>
        <div class="homepage-history-list"><div v-for="item in state.history" :key="item.history_id" class="homepage-history-row"><div><strong>#{{ item.history_id }} · {{ item.label }}</strong><span>{{ item.action }} · {{ formatTime(item.created_at) }}</span></div><button class="secondary-command" type="button" :disabled="!item.restorable || working !== ''" @click="restore(item)"><RefreshCcw :size="15" />恢复</button></div></div>
      </section>

      <p v-else-if="loading" class="admin-loading">正在读取首页配置...</p>
    </div>
  </AdminAccessGate>
</template>
