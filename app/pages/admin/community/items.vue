<script setup lang="ts">
import { Archive, ChevronLeft, ChevronRight, ExternalLink, FolderTree, Heart, ImagePlus, Pencil, Plus, RefreshCw, Save, Search, Send, Trash2, X } from 'lucide-vue-next'
import type { ApiSuccess } from '~/types/api'
import { apiErrorMessage } from '~/types/api'
import type { CommunityCategory, CommunityItem, CommunityStatus } from '~/types/community'

definePageMeta({ layout: 'admin' })
useSeoMeta({ title: '社区管理', robots: 'noindex, nofollow' })

const admin = useAdminSessionState()
const items = ref<CommunityItem[]>([])
const categories = ref<CommunityCategory[]>([])
const loading = ref(false)
const saving = ref(false)
const uploading = ref(false)
const editingId = ref<number | null>(null)
const editorOpen = ref(false)
const editorView = ref<'content' | 'preview'>('content')
const nameInput = ref<HTMLInputElement | null>(null)
const deletingItem = ref<CommunityItem | null>(null)
const query = ref('')
const categoryFilter = ref<string | 'all'>('all')
const statusFilter = ref<CommunityStatus | 'all'>('all')
const currentPage = ref(1)
const pageSize = 12
const notice = reactive({ type: 'idle' as 'idle' | 'success' | 'error', message: '' })
const iconInput = ref<HTMLInputElement | null>(null)
const brokenIcons = reactive<Record<number, boolean>>({})
const detailImageInput = ref<HTMLInputElement | null>(null)
const detailUploading = ref(false)
const form = reactive({
  slug: '',
  category: '',
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

const filteredItems = computed(() => {
  const keyword = query.value.trim().toLocaleLowerCase()
  return items.value.filter((item) => {
    if (categoryFilter.value !== 'all' && item.category !== categoryFilter.value) return false
    if (statusFilter.value !== 'all' && item.status !== statusFilter.value) return false
    if (!keyword) return true
    return [item.name, item.slug, item.summary, item.category_name, ...item.tags]
      .some(value => value.toLocaleLowerCase().includes(keyword))
  })
})
const pageCount = computed(() => Math.max(1, Math.ceil(filteredItems.value.length / pageSize)))
const paginatedItems = computed(() => filteredItems.value.slice((currentPage.value - 1) * pageSize, currentPage.value * pageSize))
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

watch([query, categoryFilter, statusFilter], () => { currentPage.value = 1 })
watch(pageCount, count => { if (currentPage.value > count) currentPage.value = count })
watch([editorOpen, deletingItem], ([open, deleting]) => {
  if (import.meta.client) document.body.style.overflow = open || deleting ? 'hidden' : ''
})

onMounted(() => window.addEventListener('keydown', handleEscape))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleEscape)
  document.body.style.overflow = ''
})

async function loadItems() {
  loading.value = true
  try {
    const [itemResponse, categoryResponse] = await Promise.all([
      $fetch<ApiSuccess<CommunityItem[]>>('/api/admin/community'),
      $fetch<ApiSuccess<CommunityCategory[]>>('/api/admin/community/categories'),
    ])
    items.value = itemResponse.data
    categories.value = categoryResponse.data
    if (!form.category) form.category = defaultCategorySlug()
  } catch (cause) {
    showError(cause, '社区条目读取失败。')
  } finally {
    loading.value = false
  }
}

async function saveItem() {
  saving.value = true
  clearNotice()
  const wasEditing = editingId.value !== null
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
    if (!wasEditing) {
      query.value = response.data.slug
      categoryFilter.value = 'all'
      statusFilter.value = 'all'
      currentPage.value = 1
    }
    notice.type = 'success'
    notice.message = wasEditing ? '社区条目已保存。' : '社区条目已创建，已在列表中定位。'
    closeEditor()
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
  editorView.value = 'content'
  editorOpen.value = true
  clearNotice()
  nextTick(() => nameInput.value?.focus())
}

function openCreate() {
  resetForm()
  editorView.value = 'content'
  editorOpen.value = true
  clearNotice()
  nextTick(() => nameInput.value?.focus())
}

function closeEditor() {
  editorOpen.value = false
  editorView.value = 'content'
  resetForm()
}

function resetForm() {
  editingId.value = null
  Object.assign(form, {
    slug: '', category: defaultCategorySlug(), name: '', summary: '', icon_url: '', official_url: '',
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

function requestRemoveItem(item: CommunityItem) {
  deletingItem.value = item
}

async function confirmRemoveItem() {
  const item = deletingItem.value
  if (!item) return
  clearNotice()
  try {
    await $fetch(`/api/admin/community/${item.id}`, { method: 'DELETE' })
    items.value = items.value.filter(row => row.id !== item.id)
    if (editingId.value === item.id) closeEditor()
    deletingItem.value = null
    notice.type = 'success'
    notice.message = '社区条目已删除。'
  } catch (cause) {
    showError(cause, '社区条目删除失败。')
  }
}

function handleEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  if (deletingItem.value) deletingItem.value = null
  else if (editorOpen.value && !saving.value && !uploading.value && !detailUploading.value) closeEditor()
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
  return categoryOrder(a.category) - categoryOrder(b.category) || a.sort_order - b.sort_order || a.name.localeCompare(b.name)
}

function categoryLabel(category: string) {
  return categories.value.find(item => item.slug === category)?.name || category
}

function categoryOrder(category: string) {
  return categories.value.find(item => item.slug === category)?.sort_order ?? 1_000_001
}

function defaultCategorySlug() {
  return categories.value.find(category => category.is_visible)?.slug || categories.value[0]?.slug || ''
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
        <h1>社区条目管理</h1>
        <p>维护社区资源的公开信息、所属分类和展示顺序。</p>
        <div class="admin-page-heading__actions">
          <button class="primary-command" type="button" @click="openCreate"><Plus :size="16" />新增条目</button>
          <NuxtLink class="secondary-command" to="/admin/community/categories"><FolderTree :size="16" />管理分类</NuxtLink>
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

      <section class="admin-section community-admin-list community-item-list">
        <header><div><h2>已维护条目</h2><span>当前显示 {{ filteredItems.length }} / {{ items.length }}</span></div><button class="secondary-command" type="button" @click="recountLikes"><Heart :size="15" />校准点赞数</button></header>
        <div class="community-item-toolbar">
          <label class="community-item-search"><Search :size="16" /><input v-model="query" type="search" maxlength="80" placeholder="搜索名称、Slug、简介或标签" aria-label="搜索社区条目"></label>
          <label><span>分类</span><select v-model="categoryFilter" aria-label="按分类筛选"><option value="all">全部分类</option><option v-for="category in categories" :key="category.id" :value="category.slug">{{ category.name }}</option></select></label>
          <label><span>状态</span><select v-model="statusFilter" aria-label="按状态筛选"><option value="all">全部状态</option><option value="draft">草稿</option><option value="published">已发布</option><option value="archived">已归档</option></select></label>
        </div>
        <div class="community-admin-rows">
          <article v-for="item in paginatedItems" :key="item.id">
            <div class="community-admin-item-icon"><img v-if="item.icon_url && !brokenIcons[item.id]" :src="item.icon_url" alt="" @error="handleIconError(item)"><span v-else>{{ item.name.slice(0, 1) }}</span></div>
            <div class="community-admin-item-main"><div><button class="community-admin-item-title" type="button" @click="editItem(item)">{{ item.name }}</button><code>{{ item.slug }}</code><span :class="`is-${item.status}`">{{ statusLabel(item.status) }}</span></div><p>{{ item.summary }}</p><small>{{ categoryLabel(item.category) }} · 排序 {{ item.sort_order }} · {{ item.like_count }} 赞</small></div>
            <div class="community-admin-item-actions">
              <button class="icon-button" type="button" title="编辑" @click="editItem(item)"><Pencil :size="16" /></button>
              <button v-if="item.status !== 'published'" class="icon-button" type="button" title="发布" @click="changeStatus(item, 'published')"><Send :size="16" /></button>
              <button v-else class="icon-button" type="button" title="归档" @click="changeStatus(item, 'archived')"><Archive :size="16" /></button>
              <button class="icon-button icon-button--danger" type="button" title="删除" @click="requestRemoveItem(item)"><Trash2 :size="16" /></button>
            </div>
          </article>
          <div v-if="!filteredItems.length && !loading" class="empty-result"><Search :size="18" />没有找到匹配的社区条目。</div>
        </div>
        <nav v-if="pageCount > 1" class="community-item-pagination" aria-label="社区条目分页"><button class="icon-button" type="button" title="上一页" :disabled="currentPage <= 1" @click="currentPage--"><ChevronLeft :size="17" /></button><span>第 {{ currentPage }} / {{ pageCount }} 页</span><button class="icon-button" type="button" title="下一页" :disabled="currentPage >= pageCount" @click="currentPage++"><ChevronRight :size="17" /></button></nav>
      </section>
    </div>

    <Teleport to="body">
      <div v-if="editorOpen" class="community-drawer-backdrop" @mousedown.self="closeEditor">
        <aside class="community-item-drawer" role="dialog" aria-modal="true" :aria-labelledby="editingId ? 'community-item-edit-title' : 'community-item-create-title'">
          <header>
            <div><span>{{ editingId ? `Community item · ID ${editingId}` : 'New community item' }}</span><h2 :id="editingId ? 'community-item-edit-title' : 'community-item-create-title'">{{ editingId ? '编辑条目' : '新增条目' }}</h2><p>编辑内容时列表保持原位，保存后自动返回当前筛选结果。</p></div>
            <button class="icon-button" type="button" title="关闭编辑" :disabled="saving" @click="closeEditor"><X :size="18" /></button>
          </header>
          <div class="community-item-editor-tabs" role="tablist" aria-label="条目编辑视图"><button type="button" :aria-selected="editorView === 'content'" @click="editorView = 'content'">内容编辑</button><button type="button" :aria-selected="editorView === 'preview'" @click="editorView = 'preview'">实时预览</button></div>
          <form class="community-item-editor-form" @submit.prevent="saveItem">
            <div v-show="editorView === 'content'" class="community-item-drawer__body">
              <div v-if="notice.message && notice.type === 'error'" class="tool-alert tool-alert--error">{{ notice.message }}</div>
              <section class="community-item-editor-section"><header><h3>基础信息</h3><span>名称、地址和发布位置</span></header><div class="community-item-editor-grid"><label class="form-field"><span>名称</span><input ref="nameInput" v-model.trim="form.name" required maxlength="80" placeholder="例如 Codex++"></label><label class="form-field"><span>Slug</span><input v-model.trim="form.slug" required maxlength="80" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="codex-plus-plus"></label><label class="form-field"><span>分类</span><select v-model="form.category" required aria-label="社区分类"><option v-for="category in categories" :key="category.id" :value="category.slug">{{ category.name }}{{ category.is_visible ? '' : '（已隐藏）' }}</option></select></label><label class="form-field"><span>状态</span><select v-model="form.status" aria-label="发布状态"><option value="draft">草稿</option><option value="published">已发布</option><option value="archived">已归档</option></select></label></div></section>
              <section class="community-item-editor-section"><header><h3>内容介绍</h3><span>用于卡片和详情页面</span></header><label class="form-field"><span>简介</span><textarea v-model.trim="form.summary" required rows="3" minlength="10" maxlength="500" placeholder="说明它解决什么问题，以及适合谁使用。" /></label><label class="form-field"><span>详细介绍（可选 Markdown）</span><textarea v-model="form.description_md" rows="12" maxlength="30000" placeholder="可填写详细功能、使用场景、安装命令或 Codex 配置示例。" /></label></section>
              <section class="community-item-editor-section"><header><h3>展示设置</h3><span>链接、图标、标签和排序</span></header><label class="form-field"><span>官方地址</span><input v-model.trim="form.official_url" required type="url" maxlength="500" placeholder="https://github.com/owner/project"></label><div class="form-field community-editor-icon"><span>图标地址</span><div><input v-model.trim="form.icon_url" maxlength="800" placeholder="/uploads/...png 或 HTTPS 图片地址"><button class="icon-button" type="button" :disabled="uploading" title="上传图标" @click="chooseIcon"><ImagePlus :size="17" /></button></div><input ref="iconInput" class="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" @change="uploadIcon"></div><div class="community-item-editor-grid"><label class="form-field"><span>标签</span><input v-model="form.tags" maxlength="240" placeholder="Codex, Tauri, 配置管理"><small>使用逗号分隔，最多 8 个。</small></label><label class="form-field"><span>兼容对象</span><input v-model.trim="form.compatibility" maxlength="120" placeholder="Windows / macOS / Linux"></label><label class="form-field"><span>排序</span><input v-model.number="form.sort_order" type="number" min="0" max="1000000" step="1"></label><label class="check-line community-featured"><input v-model="form.is_featured" type="checkbox" aria-label="优先展示">在分类中优先展示</label></div><div v-if="form.icon_url" class="community-icon-preview"><img :src="form.icon_url" alt="图标预览"><span>图标预览</span></div></section>
              <section class="community-item-editor-section"><header><h3>详情图片</h3><button class="secondary-command" type="button" :disabled="detailUploading || form.images.length >= 8" @click="chooseDetailImage"><ImagePlus :size="15" />{{ detailUploading ? '上传中...' : '上传图片' }}</button></header><input ref="detailImageInput" class="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp,image/gif" @change="uploadDetailImage"><div v-if="form.images.length" class="community-editor-images__list"><div v-for="(image, index) in form.images" :key="`${image.image_url}-${index}`" class="community-editor-image-row"><img :src="image.image_url" alt=""><div><input v-model.trim="image.title" placeholder="图片标题（可选）"><input v-model.trim="image.alt_text" placeholder="无障碍描述（建议填写）"></div><button class="icon-button icon-button--danger" type="button" title="移除图片" @click="removeDetailImage(index)"><Trash2 :size="15" /></button></div></div><p v-else class="community-item-editor-empty">可以上传产品截图、界面预览或使用示例图，最多 8 张。</p></section>
            </div>
            <div v-show="editorView === 'preview'" class="community-item-preview-pane"><div><span>Directory card</span><h3>前台卡片预览</h3><p>预览会跟随当前未保存内容实时更新。</p></div><article class="community-card community-card--preview"><header><div class="community-card__icon"><img v-if="form.icon_url" :src="form.icon_url" alt="预览图标"><span v-else aria-hidden="true">{{ form.name.trim().slice(0, 1).toUpperCase() || '？' }}</span></div><div class="community-card__title"><div><h2>{{ form.name.trim() || '条目名称' }}</h2><span v-if="form.is_featured">精选</span></div><small>{{ previewCategoryLabel }}</small></div></header><p>{{ form.summary.trim() || '填写简介后，这里会显示资源的介绍。' }}</p><div v-if="previewTags.length" class="community-tags" aria-label="预览标签"><span v-for="tag in previewTags" :key="tag">{{ tag }}</span></div><div v-if="form.compatibility.trim()" class="community-card__compatibility">{{ form.compatibility.trim() }}</div><footer><span class="community-preview-link"><ExternalLink :size="15" />{{ form.official_url.trim() || '官方地址' }}</span><span class="community-like community-like--preview"><Heart :size="17" /><span>0</span></span></footer></article></div>
            <footer><button class="secondary-command" type="button" :disabled="saving" @click="closeEditor">取消</button><button class="primary-command" type="submit" :disabled="saving"><Save :size="16" />{{ saving ? '保存中...' : (editingId ? '保存修改' : '创建条目') }}</button></footer>
          </form>
        </aside>
      </div>

      <div v-if="deletingItem" class="community-drawer-backdrop community-drawer-backdrop--confirm" @mousedown.self="deletingItem = null"><section class="community-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="community-item-delete-title"><header><div><span>Delete item</span><h2 id="community-item-delete-title">删除“{{ deletingItem.name }}”</h2></div><button class="icon-button" type="button" title="关闭删除确认" @click="deletingItem = null"><X :size="18" /></button></header><div class="community-confirm-dialog__body"><p>条目、详情图片记录和点赞记录会一并删除，此操作无法恢复。</p></div><footer><button class="secondary-command" type="button" @click="deletingItem = null">取消</button><button class="danger-command" type="button" @click="confirmRemoveItem"><Trash2 :size="16" />确认删除</button></footer></section></div>
    </Teleport>
  </AdminAccessGate>
</template>
