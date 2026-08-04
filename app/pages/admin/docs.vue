<script setup lang="ts">
import { ExternalLink, FileText, RefreshCw, RotateCcw, Save, Send, Trash2 } from 'lucide-vue-next'
import { replaceGuideDefaults } from '#shared/utils/guide-content'
import type { ApiSuccess } from '~/types/api'
import { apiErrorMessage } from '~/types/api'

interface DocContent {
  title: string
  description: string
  body: string
}

interface AdminDocVersion extends DocContent {
  version_id: number
  source: 'published' | 'draft' | 'default'
  action: string
  created_at: string
}

interface AdminDocSummary {
  id: string
  path: string
  label: string
  title: string
  description: string
  source: 'default' | 'published' | 'draft'
  sync_status: 'default' | 'same_as_default' | 'custom' | 'draft_same_as_published' | 'draft_differs'
  has_override: boolean
  has_draft: boolean
  updated_at: string | null
  published_at: string | null
  draft_updated_at: string | null
}

interface AdminDocDetail extends AdminDocSummary {
  body: string
  default_content: DocContent
  published_content: (DocContent & { updated_at: string | null }) | null
  history: AdminDocVersion[]
}

interface DiffLine {
  type: 'same' | 'add' | 'remove'
  text: string
}

definePageMeta({ layout: 'admin' })
useSeoMeta({ title: '指南内容', robots: 'noindex, nofollow' })

const admin = useAdminSessionState()
const site = useSiteConfigState()
const loading = ref(false)
const saving = ref(false)
const docs = ref<AdminDocSummary[]>([])
const selectedId = ref('')
const loadedDoc = ref<AdminDocDetail | null>(null)
const activeTab = ref<'edit' | 'preview' | 'diff' | 'history'>('edit')
const diffBase = ref<'published' | 'default'>('published')
const notice = reactive({ type: 'idle' as 'idle' | 'success' | 'error', message: '' })
const form = reactive({ title: '', description: '', body: '' })

const editorContent = computed<DocContent>(() => ({
  title: form.title,
  description: form.description,
  body: form.body,
}))
const previewBody = computed(() => replaceGuideDefaults(form.body, site.value))

const diffLines = computed(() => {
  const base = diffBase.value === 'default'
    ? loadedDoc.value?.default_content
    : loadedDoc.value?.published_content || loadedDoc.value?.default_content
  if (!base) return [] as DiffLine[]
  return lineDiff(formatDocContent(base), formatDocContent(editorContent.value))
})

watch(() => admin.session.value?.admin, (authenticated) => {
  if (authenticated && !docs.value.length) void loadDocs()
}, { immediate: true })

async function loadDocs() {
  loading.value = true
  notice.type = 'idle'
  notice.message = ''
  try {
    const response = await $fetch<ApiSuccess<AdminDocSummary[]>>('/api/admin/docs')
    docs.value = response.data
    const nextId = selectedId.value || docs.value[0]?.id || ''
    if (nextId) await selectDoc(nextId)
  } catch (cause) {
    notice.type = 'error'
    notice.message = apiErrorMessage(cause, '文档列表读取失败。若刚部署，请确认镜像已包含 content/ 并重启容器。')
  } finally {
    loading.value = false
  }
}

async function selectDoc(id: string) {
  selectedId.value = id
  loading.value = true
  notice.type = 'idle'
  notice.message = ''
  try {
    const response = await $fetch<ApiSuccess<AdminDocDetail>>(`/api/admin/docs/${id}`)
    applyLoadedDoc(response.data)
  } catch (cause) {
    notice.type = 'error'
    notice.message = apiErrorMessage(cause, '文档内容读取失败')
  } finally {
    loading.value = false
  }
}

async function saveDraft() {
  if (!selectedId.value) return
  await mutateDoc('文档草稿保存失败', async () => {
    const response = await $fetch<ApiSuccess<AdminDocDetail>>(`/api/admin/docs/${selectedId.value}`, {
      method: 'PUT',
      body: editorContent.value,
    })
    applyLoadedDoc(response.data)
    notice.message = '草稿已保存，前台内容不会变化。'
  })
}

async function publishDoc() {
  if (!selectedId.value) return
  await mutateDoc('文档发布失败', async () => {
    const response = await $fetch<ApiSuccess<AdminDocDetail>>(`/api/admin/docs/${selectedId.value}/publish`, {
      method: 'POST',
      body: editorContent.value,
    })
    applyLoadedDoc(response.data)
    notice.message = '已发布到前台。'
  })
}

async function overwriteWithDefault() {
  if (!selectedId.value) return
  const confirmed = window.confirm('确定要用默认 Markdown 覆盖并发布到数据库吗？当前草稿和已发布数据库内容都会被替换。')
  if (!confirmed) return

  await mutateDoc('默认 Markdown 覆盖失败', async () => {
    const response = await $fetch<ApiSuccess<AdminDocDetail>>(`/api/admin/docs/${selectedId.value}/default`, {
      method: 'POST',
    })
    applyLoadedDoc(response.data)
    notice.message = '已把默认 Markdown 覆盖并发布到数据库。'
  })
}

async function deleteDatabaseOverride() {
  if (!selectedId.value) return
  const confirmed = window.confirm('确定要删除数据库覆盖吗？前台会回到 content 目录里的默认 Markdown。')
  if (!confirmed) return

  await mutateDoc('数据库覆盖删除失败', async () => {
    const response = await $fetch<ApiSuccess<AdminDocDetail>>(`/api/admin/docs/${selectedId.value}`, {
      method: 'DELETE',
    })
    applyLoadedDoc(response.data)
    notice.message = '已删除数据库覆盖，前台回到默认 Markdown。'
  })
}

async function restoreVersion(version: AdminDocVersion) {
  if (!selectedId.value) return
  const confirmed = window.confirm(`确定要把版本 #${version.version_id} 恢复为当前草稿吗？前台不会立即变化。`)
  if (!confirmed) return

  await mutateDoc('历史版本恢复失败', async () => {
    const response = await $fetch<ApiSuccess<AdminDocDetail>>(`/api/admin/docs/${selectedId.value}/versions/${version.version_id}/restore`, {
      method: 'POST',
    })
    applyLoadedDoc(response.data)
    activeTab.value = 'edit'
    notice.message = '历史版本已恢复为草稿，确认后可发布到前台。'
  })
}

async function mutateDoc(fallback: string, run: () => Promise<void>) {
  saving.value = true
  notice.type = 'idle'
  notice.message = ''
  try {
    await run()
    notice.type = 'success'
  } catch (cause) {
    notice.type = 'error'
    notice.message = apiErrorMessage(cause, fallback)
  } finally {
    saving.value = false
  }
}

function applyLoadedDoc(doc: AdminDocDetail) {
  loadedDoc.value = doc
  apply(doc)
  const index = docs.value.findIndex(item => item.id === doc.id)
  const { body, default_content, published_content, history, ...summary } = doc
  if (index >= 0) docs.value[index] = summary
}

function apply(doc: AdminDocDetail) {
  form.title = doc.title
  form.description = doc.description
  form.body = doc.body
}

function previewPath(doc: AdminDocSummary | AdminDocDetail | null) {
  if (!doc) return '/'
  return doc.path || '/'
}

function statusLabel(doc: AdminDocSummary | AdminDocDetail) {
  const labels: Record<AdminDocSummary['sync_status'], string> = {
    default: '使用默认文件',
    same_as_default: '数据库与默认一致',
    custom: '已发布自定义内容',
    draft_same_as_published: '草稿无变化',
    draft_differs: '有未发布草稿',
  }
  return labels[doc.sync_status]
}

function sourceLabel(source: AdminDocSummary['source'] | AdminDocVersion['source']) {
  if (source === 'draft') return '草稿'
  if (source === 'published') return '已发布'
  return '默认'
}

function formatTime(value: string | null) {
  if (!value) return '未生成'
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function formatDocContent(value: DocContent) {
  return `title: ${value.title}\ndescription: ${value.description}\n\n${value.body}`
}

function lineDiff(before: string, after: string) {
  const beforeLines = before.split(/\r?\n/)
  const afterLines = after.split(/\r?\n/)
  const rows: DiffLine[] = []
  const length = Math.max(beforeLines.length, afterLines.length)
  for (let index = 0; index < length; index += 1) {
    const left = beforeLines[index]
    const right = afterLines[index]
    if (left === right) {
      rows.push({ type: 'same', text: left ?? '' })
    } else {
      if (left !== undefined) rows.push({ type: 'remove', text: left })
      if (right !== undefined) rows.push({ type: 'add', text: right })
    }
  }
  return rows
}
</script>

<template>
  <AdminAccessGate>
    <div class="admin-page admin-docs-page">
      <header class="admin-page-heading">
        <span>Guide content</span>
        <h1>指南内容</h1>
        <p>编辑首页、API 接入配置和会员充值流程的 Markdown 内容。</p>
        <div class="admin-page-heading__actions">
          <button class="secondary-command" type="button" :disabled="loading || saving" @click="loadDocs">
            <RefreshCw :size="16" :class="{ spinning: loading }" />刷新
          </button>
          <button class="secondary-command" type="button" :disabled="loading || saving || !selectedId" @click="saveDraft">
            <Save :size="16" />{{ saving ? '处理中...' : '保存草稿' }}
          </button>
          <button class="primary-command" type="button" :disabled="loading || saving || !selectedId" @click="publishDoc">
            <Send :size="16" />发布
          </button>
        </div>
      </header>

      <div v-if="notice.message" :class="['tool-alert', notice.type === 'error' ? 'tool-alert--error' : 'tool-alert--success']">
        {{ notice.message }}
      </div>

      <div class="admin-docs-layout">
        <section class="admin-doc-list" aria-label="可编辑文档">
          <button
            v-for="item in docs"
            :key="item.id"
            type="button"
            :class="{ active: selectedId === item.id }"
            :disabled="saving"
            @click="selectDoc(item.id)"
          >
            <FileText :size="18" />
            <div>
              <strong>{{ item.label }}</strong>
              <span>{{ statusLabel(item) }} · {{ formatTime(item.updated_at) }}</span>
            </div>
          </button>
        </section>

        <form v-if="loadedDoc" class="admin-doc-editor" @submit.prevent="saveDraft">
          <section class="admin-section">
            <header>
              <h2>{{ loadedDoc.label }}</h2>
              <div class="admin-doc-title-actions">
                <button class="secondary-command" type="button" :disabled="loading || saving" @click="overwriteWithDefault">
                  <RotateCcw :size="16" />默认覆盖数据库
                </button>
                <button class="secondary-command danger-command" type="button" :disabled="loading || saving || (!loadedDoc.has_override && !loadedDoc.has_draft)" @click="deleteDatabaseOverride">
                  <Trash2 :size="16" />删除覆盖
                </button>
                <a :href="previewPath(loadedDoc)" target="_blank" rel="noreferrer" title="打开前台页面"><ExternalLink :size="18" /></a>
              </div>
            </header>

            <div class="admin-doc-status-grid">
              <span>路径：{{ loadedDoc.path }}</span>
              <span>编辑源：{{ sourceLabel(loadedDoc.source) }}</span>
              <span>状态：{{ statusLabel(loadedDoc) }}</span>
              <span>发布时间：{{ formatTime(loadedDoc.published_at) }}</span>
              <span>草稿时间：{{ formatTime(loadedDoc.draft_updated_at) }}</span>
            </div>

            <div class="admin-tabs admin-doc-tabs">
              <button type="button" :class="{ active: activeTab === 'edit' }" @click="activeTab = 'edit'">编辑</button>
              <button type="button" :class="{ active: activeTab === 'preview' }" @click="activeTab = 'preview'">预览</button>
              <button type="button" :class="{ active: activeTab === 'diff' }" @click="activeTab = 'diff'">差异</button>
              <button type="button" :class="{ active: activeTab === 'history' }" @click="activeTab = 'history'">历史</button>
            </div>

            <div v-show="activeTab === 'edit'" class="admin-doc-panel">
              <label class="form-field"><span>标题</span><input v-model.trim="form.title" maxlength="120" required></label>
              <label class="form-field"><span>描述</span><textarea v-model.trim="form.description" rows="3" maxlength="300" /></label>
              <label class="form-field form-field--markdown">
                <span>Markdown 正文</span>
                <textarea v-model="form.body" rows="26" maxlength="100000" spellcheck="false" required />
                <small>{{ form.body.length }} / 100000</small>
              </label>
            </div>

            <div v-show="activeTab === 'preview'" class="admin-doc-panel admin-doc-preview doc-content">
              <MDC
                :value="previewBody"
                :data="{
                  projectName: site.project_name,
                  siteTitle: site.site_title,
                  mainSiteUrl: site.main_site_url,
                  apiBaseUrl: site.api_base_url,
                }"
              />
            </div>

            <div v-show="activeTab === 'diff'" class="admin-doc-panel">
              <div class="admin-doc-diff-toolbar">
                <span>对比基准</span>
                <div class="segmented-control compact-segment">
                  <button type="button" :class="{ active: diffBase === 'published' }" @click="diffBase = 'published'">已发布</button>
                  <button type="button" :class="{ active: diffBase === 'default' }" @click="diffBase = 'default'">默认文件</button>
                </div>
              </div>
              <pre class="admin-doc-diff"><code><span v-for="(line, index) in diffLines" :key="index" :class="`diff-${line.type}`">{{ line.type === 'add' ? '+ ' : line.type === 'remove' ? '- ' : '  ' }}{{ line.text }}
</span></code></pre>
            </div>

            <div v-show="activeTab === 'history'" class="admin-doc-panel">
              <div v-if="loadedDoc.history.length" class="admin-doc-history">
                <article v-for="version in loadedDoc.history" :key="version.version_id">
                  <header>
                    <div>
                      <strong>#{{ version.version_id }} · {{ version.action }}</strong>
                      <span>{{ sourceLabel(version.source) }} · {{ formatTime(version.created_at) }}</span>
                    </div>
                    <button class="secondary-command" type="button" :disabled="saving" @click="restoreVersion(version)">
                      <RotateCcw :size="16" />恢复为草稿
                    </button>
                  </header>
                  <p>{{ version.title }}</p>
                </article>
              </div>
              <div v-else class="empty-result"><strong>暂无历史版本</strong></div>
            </div>

            <div class="admin-doc-footer-actions">
              <button class="secondary-command" type="button" :disabled="saving" @click="saveDraft">
                <Save :size="16" />保存草稿
              </button>
              <button class="primary-command" type="button" :disabled="saving" @click="publishDoc">
                <Send :size="16" />发布到前台
              </button>
            </div>
          </section>
        </form>

        <div v-else class="admin-section empty-result"><strong>选择一篇文档开始编辑</strong></div>
      </div>
    </div>
  </AdminAccessGate>
</template>
