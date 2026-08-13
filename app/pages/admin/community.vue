<script setup lang="ts">
import { Archive, ExternalLink, Heart, ImagePlus, Pencil, Plus, RefreshCw, RotateCcw, Save, Send, Trash2 } from 'lucide-vue-next'
import type { ApiSuccess } from '~/types/api'
import { apiErrorMessage } from '~/types/api'
import type { CommunityCategory, CommunityImage, CommunityItem, CommunityStatus } from '~/types/community'

definePageMeta({ layout: 'admin' })
useSeoMeta({ title: '社区管理', robots: 'noindex, nofollow' })

const admin = useAdminSessionState()
const items = ref<CommunityItem[]>([])
const loading = ref(false)
const saving = ref(false)
const uploading = ref(false)
const editingId = ref<number | null>(null)
const categoryFilter = ref<CommunityCategory | 'all'>('all')
const notice = reactive({ type: 'idle' as 'idle' | 'success' | 'error', message: '' })
const iconInput = ref<HTMLInputElement | null>(null)
const brokenIcons = reactive<Record<number, boolean>>({})
const detailImageInput = ref<HTMLInputElement | null>(null)
const detailUploading = ref(false)
const form = reactive({
  slug: '',
  category: 'tools' as CommunityCategory,
  name: '',
  summary: '',
  description_md: '',
  icon_url: '',
  official_url: '',
  tags: '',
  compatibility: '',
  status: 'draft' as CommunityStatus,
  is_featured: false,
  sort_order: 1000,
  images: [] as Array<{ image_url: string, title: string, alt_text: string }>,
})

const filteredItems = computed(() => categoryFilter.value === 'all'
  ? items.value
  : items.value.filter(item => item.category === categoryFilter.value))
const previewTags = computed(() => form.tags.split(/[,，\n]/).map(tag => tag.trim()).filter(Boolean).slice(0, 8))
const previewCategoryLabel = computed(() => categoryLabel(form.category))
const metrics = computed(() => ({
  total: items.value.length,
  published: items.value.filter(item => item.status === 'published').length,
  likes: items.value.reduce((total, item) => total + item.like_count, 0),
}))

watch(() => admin.session.value?.admin, (authenticated) => {
  if (authenticated && !items.value.length) void loadItems()
}, { immediate: true })

async function loadItems() {
  loading.value = true
  try {
    const response = await $fetch<ApiSuccess<CommunityItem[]>>('/api/admin/community')
    items.value = response.data
  } catch (cause) {
    showError(cause, '社区条目读取失败。')
  } finally {
    loading.value = false
  }
}

async function saveItem() {
  saving.value = true
  clearNotice()
  const body = {
    ...form,
    tags: form.tags.split(/[,，\n]/).map(tag => tag.trim()).filter(Boolean),
    icon_url: form.icon_url.trim() || null,
    compatibility: form.compatibility.trim() || null,
    sort_order: Number(form.sort_order),
    images: form.images.map((image, index) => ({ ...image, sort_order: index * 10 + 10 })),
  }
  try {
    const response = editingId.value
      ? await $fetch<ApiSuccess<CommunityItem>>(`/api/admin/community/${editingId.value}`, { method: 'PUT', body })
      : await $fetch<ApiSuccess<CommunityItem>>('/api/admin/community', { method: 'POST', body })
    const index = items.value.findIndex(item => item.id === response.data.id)
    brokenIcons[response.data.id] = false
    if (index >= 0) items.value[index] = response.data
    else items.value.push(response.data)
    items.value.sort(compareItems)
    notice.type = 'success'
    notice.message = editingId.value ? '社区条目已保存。' : '社区条目已创建。'
    resetForm()
  } catch (cause) {
    showError(cause, '社区条目保存失败。')
  } finally {
    saving.value = false
  }
}

function editItem(item: CommunityItem) {
  editingId.value = item.id
  Object.assign(form, {
    slug: item.slug,
    category: item.category,
    name: item.name,
    summary: item.summary,
    description_md: item.description_md || '',
    icon_url: item.icon_url || '',
    official_url: item.official_url,
    tags: item.tags.join(', '),
    compatibility: item.compatibility || '',
    status: item.status,
    is_featured: item.is_featured,
    sort_order: item.sort_order,
    images: item.images.map(image => ({ image_url: image.image_url, title: image.title || '', alt_text: image.alt_text || '' })),
  })
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function resetForm() {
  editingId.value = null
  Object.assign(form, {
    slug: '', category: 'tools', name: '', summary: '', icon_url: '', official_url: '',
    tags: '', compatibility: '', status: 'draft', is_featured: false, sort_order: 1000,
    description_md: '', images: [],
  })
}

async function changeStatus(item: CommunityItem, status: 'published' | 'archived') {
  clearNotice()
  try {
    const response = await $fetch<ApiSuccess<CommunityItem>>(`/api/admin/community/${item.id}/${status === 'published' ? 'publish' : 'archive'}`, { method: 'POST' })
    Object.assign(item, response.data)
    notice.type = 'success'
    notice.message = status === 'published' ? `${item.name} 已发布。` : `${item.name} 已归档。`
  } catch (cause) {
    showError(cause, '条目状态更新失败。')
  }
}

async function removeItem(item: CommunityItem) {
  if (!window.confirm(`确定删除“${item.name}”吗？点赞记录也会一并删除。`)) return
  clearNotice()
  try {
    await $fetch(`/api/admin/community/${item.id}`, { method: 'DELETE' })
    items.value = items.value.filter(row => row.id !== item.id)
    if (editingId.value === item.id) resetForm()
    notice.type = 'success'
    notice.message = '社区条目已删除。'
  } catch (cause) {
    showError(cause, '社区条目删除失败。')
  }
}

async function recountLikes() {
  clearNotice()
  try {
    const response = await $fetch<ApiSuccess<CommunityItem[]>>('/api/admin/community/recount', { method: 'POST' })
    items.value = response.data
    notice.type = 'success'
    notice.message = '点赞数已按明细重新统计。'
  } catch (cause) {
    showError(cause, '点赞数校准失败。')
  }
}

function chooseIcon() {
  iconInput.value?.click()
}

function chooseDetailImage() {
  if (form.images.length >= 8) {
    showError(null, '每个条目最多添加 8 张详情图片。')
    return
  }
  detailImageInput.value?.click()
}

async function uploadIcon(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  uploading.value = true
  clearNotice()
  try {
    const body = new FormData()
    body.append('file', file)
    const response = await $fetch<ApiSuccess<{ url: string }>>('/api/admin/assets/upload', { method: 'POST', body })
    const uploaded = new URL(response.data.url, window.location.origin)
    form.icon_url = uploaded.origin === window.location.origin ? uploaded.pathname : uploaded.toString()
    notice.type = 'success'
    notice.message = '图标已上传并填入。'
  } catch (cause) {
    showError(cause, '图标上传失败。')
  } finally {
    uploading.value = false
  }
}

function compareItems(a: CommunityItem, b: CommunityItem) {
  return a.category.localeCompare(b.category) || a.sort_order - b.sort_order || a.name.localeCompare(b.name)
}

function categoryLabel(category: CommunityCategory) {
  return { tools: '开源工具', skills: 'Skills', mcp: 'MCP', agent: 'Agent', plugin: 'Plugin' }[category]
}

function statusLabel(status: CommunityStatus) {
  return { draft: '草稿', published: '已发布', archived: '已归档' }[status]
}

function clearNotice() {
  notice.type = 'idle'
  notice.message = ''
}

function showError(cause: unknown, fallback: string) {
  notice.type = 'error'
  notice.message = apiErrorMessage(cause, fallback)
}

function handleIconError(item: CommunityItem) {
  brokenIcons[item.id] = true
}

function removeDetailImage(index: number) {
  form.images.splice(index, 1)
}

async function uploadDetailImage(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  detailUploading.value = true
  clearNotice()
  try {
    const body = new FormData()
    body.append('file', file)
    const response = await $fetch<ApiSuccess<{ url: string }>>('/api/admin/assets/upload', { method: 'POST', body })
    form.images.push({ image_url: new URL(response.data.url, window.location.origin).pathname, title: '', alt_text: '' })
    notice.type = 'success'
    notice.message = '详情图片已上传并加入列表。'
  } catch (cause) {
    showError(cause, '详情图片上传失败。')
  } finally {
    detailUploading.value = false
  }
}
</script>

<template>
  <AdminAccessGate>
    <div class="admin-page admin-community-page">
      <header class="admin-page-heading">
        <span>Community</span>
        <h1>社区管理</h1>
        <p>维护开源工具、Skills、MCP、Agent 与 Plugin 的公开信息和展示顺序。</p>
        <div class="admin-page-heading__actions">
          <NuxtLink class="secondary-command" to="/community" target="_blank"><ExternalLink :size="16" />查看前台</NuxtLink>
          <button class="secondary-command" type="button" :disabled="loading" @click="loadItems"><RefreshCw :size="16" :class="{ spinning: loading }" />刷新</button>
        </div>
      </header>

      <div v-if="notice.message" :class="['tool-alert', notice.type === 'error' ? 'tool-alert--error' : 'tool-alert--success']">{{ notice.message }}</div>

      <section class="community-admin-metrics">
        <div><strong>{{ metrics.total }}</strong><span>全部条目</span></div>
        <div><strong>{{ metrics.published }}</strong><span>已发布</span></div>
        <div><strong>{{ metrics.likes }}</strong><span>累计点赞</span></div>
      </section>

      <section class="admin-section community-editor">
        <header><h2>{{ editingId ? '编辑条目' : '新增条目' }}</h2><span>{{ editingId ? `ID ${editingId}` : '默认保存为草稿' }}</span></header>
        <form class="community-editor-form" @submit.prevent="saveItem">
          <label class="form-field"><span>名称</span><input v-model.trim="form.name" required maxlength="80" placeholder="例如 Codex++"></label>
          <label class="form-field"><span>Slug</span><input v-model.trim="form.slug" required maxlength="80" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="codex-plus-plus"></label>
          <label class="form-field"><span>分类</span><select v-model="form.category" aria-label="社区分类"><option value="tools">开源工具</option><option value="skills">Skills</option><option value="mcp">MCP</option><option value="agent">Agent</option><option value="plugin">Plugin</option></select></label>
          <label class="form-field"><span>状态</span><select v-model="form.status" aria-label="发布状态"><option value="draft">草稿</option><option value="published">已发布</option><option value="archived">已归档</option></select></label>
          <label class="form-field community-editor-summary"><span>简介</span><textarea v-model.trim="form.summary" required minlength="10" maxlength="500" placeholder="说明它解决什么问题，以及适合谁使用。" /></label>
          <label class="form-field community-editor-description"><span>详细介绍（可选 Markdown）</span><textarea v-model="form.description_md" rows="10" maxlength="30000" placeholder="可填写详细功能、使用场景、安装命令或 Codex 配置示例。" /></label>
          <label class="form-field community-editor-url"><span>官方地址</span><input v-model.trim="form.official_url" required type="url" maxlength="500" placeholder="https://github.com/owner/project"></label>
          <div class="form-field community-editor-icon">
            <span>图标地址</span>
            <div><input v-model.trim="form.icon_url" maxlength="800" placeholder="/uploads/...png 或 HTTPS 图片地址"><button class="icon-button" type="button" :disabled="uploading" title="上传图标" @click="chooseIcon"><ImagePlus :size="17" /></button></div>
            <input ref="iconInput" class="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" @change="uploadIcon">
          </div>
          <label class="form-field"><span>标签</span><input v-model="form.tags" maxlength="240" placeholder="Codex, Tauri, 配置管理"><small>使用逗号分隔，最多 8 个。</small></label>
          <label class="form-field"><span>兼容对象</span><input v-model.trim="form.compatibility" maxlength="120" placeholder="Windows / macOS / Linux"></label>
          <label class="form-field"><span>排序</span><input v-model.number="form.sort_order" type="number" min="0" max="1000000" step="1"></label>
          <label class="check-line community-featured"><input v-model="form.is_featured" type="checkbox" aria-label="优先展示">在分类中优先展示</label>
          <div class="form-field community-editor-images">
            <div class="community-editor-images__heading"><span>详情图片（可选，最多 8 张）</span><button class="secondary-command" type="button" :disabled="detailUploading || form.images.length >= 8" @click="chooseDetailImage"><ImagePlus :size="15" />{{ detailUploading ? '上传中...' : '上传图片' }}</button></div>
            <input ref="detailImageInput" class="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp,image/gif" @change="uploadDetailImage">
            <div v-if="form.images.length" class="community-editor-images__list">
              <div v-for="(image, index) in form.images" :key="`${image.image_url}-${index}`" class="community-editor-image-row">
                <img :src="image.image_url" alt="">
                <div><input v-model.trim="image.title" placeholder="图片标题（可选）"><input v-model.trim="image.alt_text" placeholder="无障碍描述（建议填写）"></div>
                <button class="icon-button icon-button--danger" type="button" title="移除图片" @click="removeDetailImage(index)"><Trash2 :size="15" /></button>
              </div>
            </div>
            <small v-else>可以上传产品截图、界面预览或使用示例图。</small>
          </div>
          <div v-if="form.icon_url" class="community-icon-preview"><img :src="form.icon_url" alt="图标预览"><span>图标预览</span></div>
          <div class="community-editor-actions">
            <button v-if="editingId" class="secondary-command" type="button" @click="resetForm"><RotateCcw :size="16" />取消编辑</button>
            <button class="primary-command" type="submit" :disabled="saving"><Save :size="16" />{{ saving ? '保存中...' : (editingId ? '保存修改' : '创建条目') }}</button>
          </div>
        </form>
      </section>

      <section class="admin-section community-preview-section">
        <header>
          <div><span>Draft preview</span><h2>未保存内容预览</h2><p>这里显示当前表单内容，保存或发布前可先确认前台卡片效果。</p></div>
          <span class="community-preview-badge">仅管理员可见</span>
        </header>
        <article class="community-card community-card--preview">
          <header>
            <div class="community-card__icon">
              <img v-if="form.icon_url" :src="form.icon_url" alt="预览图标">
              <span v-else aria-hidden="true">{{ form.name.trim().slice(0, 1).toUpperCase() || '？' }}</span>
            </div>
            <div class="community-card__title">
              <div>
                <h2>{{ form.name.trim() || '条目名称' }}</h2>
                <span v-if="form.is_featured">精选</span>
              </div>
              <small>{{ previewCategoryLabel }}</small>
            </div>
          </header>
          <p>{{ form.summary.trim() || '填写简介后，这里会显示资源的介绍。' }}</p>
          <div v-if="previewTags.length" class="community-tags" aria-label="预览标签">
            <span v-for="tag in previewTags" :key="tag">{{ tag }}</span>
          </div>
          <div v-if="form.compatibility.trim()" class="community-card__compatibility">{{ form.compatibility.trim() }}</div>
          <footer>
            <span class="community-preview-link"><ExternalLink :size="15" />{{ form.official_url.trim() || '官方地址' }}</span>
            <span class="community-like community-like--preview"><Heart :size="17" /><span>0</span></span>
          </footer>
        </article>
      </section>

      <section class="admin-section community-admin-list">
        <header><h2>已维护条目</h2><button class="secondary-command" type="button" @click="recountLikes"><Heart :size="15" />校准点赞数</button></header>
        <div class="community-admin-filter" role="tablist" aria-label="社区条目筛选">
          <button v-for="filter in ['all', 'tools', 'skills', 'mcp', 'agent', 'plugin'] as const" :key="filter" type="button" :class="{ active: categoryFilter === filter }" @click="categoryFilter = filter">{{ filter === 'all' ? '全部' : categoryLabel(filter) }}</button>
        </div>
        <div class="community-admin-rows">
          <article v-for="item in filteredItems" :key="item.id">
            <div class="community-admin-item-icon"><img v-if="item.icon_url && !brokenIcons[item.id]" :src="item.icon_url" alt="" @error="handleIconError(item)"><span v-else>{{ item.name.slice(0, 1) }}</span></div>
            <div class="community-admin-item-main"><div><strong>{{ item.name }}</strong><code>{{ item.slug }}</code><span :class="`is-${item.status}`">{{ statusLabel(item.status) }}</span></div><p>{{ item.summary }}</p><small>{{ categoryLabel(item.category) }} · 排序 {{ item.sort_order }} · {{ item.like_count }} 赞</small></div>
            <div class="community-admin-item-actions">
              <button class="icon-button" type="button" title="编辑" @click="editItem(item)"><Pencil :size="16" /></button>
              <button v-if="item.status !== 'published'" class="icon-button" type="button" title="发布" @click="changeStatus(item, 'published')"><Send :size="16" /></button>
              <button v-else class="icon-button" type="button" title="归档" @click="changeStatus(item, 'archived')"><Archive :size="16" /></button>
              <button class="icon-button icon-button--danger" type="button" title="删除" @click="removeItem(item)"><Trash2 :size="16" /></button>
            </div>
          </article>
          <div v-if="!filteredItems.length && !loading" class="empty-result"><Plus :size="18" />这个分类还没有条目。</div>
        </div>
      </section>
    </div>
  </AdminAccessGate>
</template>
