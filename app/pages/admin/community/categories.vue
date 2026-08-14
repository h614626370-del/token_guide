<script setup lang="ts">
import { Eye, EyeOff, Pencil, Plus, RefreshCw, Save, Trash2, X } from 'lucide-vue-next'
import type { ApiSuccess } from '~/types/api'
import { apiErrorMessage } from '~/types/api'
import type { CommunityCategory, CommunityCategoryIcon } from '~/types/community'

definePageMeta({ layout: 'admin' })
useSeoMeta({ title: '社区分类管理', robots: 'noindex, nofollow' })

const iconOptions: Array<{ value: CommunityCategoryIcon, label: string }> = [
  { value: 'wrench', label: '工具' },
  { value: 'box', label: '方盒' },
  { value: 'sliders-horizontal', label: '控制器' },
  { value: 'bot', label: '机器人' },
  { value: 'package', label: '插件包' },
  { value: 'database', label: '数据库' },
  { value: 'boxes', label: '资源库' },
  { value: 'folder', label: '文件夹' },
  { value: 'sparkles', label: '精选' },
  { value: 'workflow', label: '工作流' },
]

const admin = useAdminSessionState()
const categories = ref<CommunityCategory[]>([])
const loading = ref(false)
const saving = ref(false)
const editingId = ref<number | null>(null)
const editorOpen = ref(false)
const nameInput = ref<HTMLInputElement | null>(null)
const deletingCategory = ref<CommunityCategory | null>(null)
const replacementId = ref<number | null>(null)
const notice = reactive({ type: 'idle' as 'idle' | 'success' | 'error', message: '' })
const form = reactive({
  slug: '',
  name: '',
  icon_key: 'box' as CommunityCategoryIcon,
  description: '',
  is_visible: false,
  sort_order: 1000,
})

const replacementOptions = computed(() => categories.value.filter(category => category.id !== deletingCategory.value?.id))
const metrics = computed(() => ({
  total: categories.value.length,
  visible: categories.value.filter(category => category.is_visible).length,
  items: categories.value.reduce((total, category) => total + category.item_count, 0),
}))

watch(() => admin.session.value?.admin, (authenticated) => {
  if (authenticated && !categories.value.length) void loadCategories()
}, { immediate: true })

watch([editorOpen, deletingCategory], ([open, deleting]) => {
  if (import.meta.client) document.body.style.overflow = open || deleting ? 'hidden' : ''
})

onMounted(() => window.addEventListener('keydown', handleEscape))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleEscape)
  document.body.style.overflow = ''
})

async function loadCategories() {
  loading.value = true
  try {
    const response = await $fetch<ApiSuccess<CommunityCategory[]>>('/api/admin/community/categories')
    categories.value = response.data
  } catch (cause) {
    showError(cause, '社区分类读取失败。')
  } finally {
    loading.value = false
  }
}

async function saveCategory() {
  saving.value = true
  clearNotice()
  try {
    const body = { ...form, sort_order: Number(form.sort_order) }
    const response = editingId.value
      ? await $fetch<ApiSuccess<CommunityCategory>>(`/api/admin/community/categories/${editingId.value}`, { method: 'PUT', body })
      : await $fetch<ApiSuccess<CommunityCategory>>('/api/admin/community/categories', { method: 'POST', body })
    const index = categories.value.findIndex(category => category.id === response.data.id)
    if (index >= 0) categories.value[index] = response.data
    else categories.value.push(response.data)
    sortCategories()
    notice.type = 'success'
    notice.message = editingId.value ? '社区分类已保存。' : '社区分类已创建。'
    closeEditor()
  } catch (cause) {
    showError(cause, '社区分类保存失败。')
  } finally {
    saving.value = false
  }
}

function editCategory(category: CommunityCategory) {
  editingId.value = category.id
  Object.assign(form, {
    slug: category.slug,
    name: category.name,
    icon_key: category.icon_key,
    description: category.description,
    is_visible: category.is_visible,
    sort_order: category.sort_order,
  })
  editorOpen.value = true
  nextTick(() => nameInput.value?.focus())
}

function openCreate() {
  resetForm()
  editorOpen.value = true
  nextTick(() => nameInput.value?.focus())
}

function closeEditor() {
  editorOpen.value = false
  resetForm()
}

function resetForm() {
  editingId.value = null
  Object.assign(form, {
    slug: '',
    name: '',
    icon_key: 'box',
    description: '',
    is_visible: false,
    sort_order: categories.value.length ? Math.max(...categories.value.map(category => category.sort_order)) + 10 : 10,
  })
}

async function toggleVisibility(category: CommunityCategory) {
  clearNotice()
  try {
    const response = await $fetch<ApiSuccess<CommunityCategory>>(`/api/admin/community/categories/${category.id}`, {
      method: 'PUT',
      body: { is_visible: !category.is_visible },
    })
    Object.assign(category, response.data)
    notice.type = 'success'
    notice.message = category.is_visible ? `${category.name} 已在前台显示。` : `${category.name} 及其公开条目已从前台隐藏。`
  } catch (cause) {
    showError(cause, '分类显示状态更新失败。')
  }
}

function requestDelete(category: CommunityCategory) {
  deletingCategory.value = category
  replacementId.value = category.item_count ? (replacementOptions.value[0]?.id || null) : null
}

function handleEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  if (deletingCategory.value) {
    deletingCategory.value = null
    replacementId.value = null
  } else if (editorOpen.value && !saving.value) {
    closeEditor()
  }
}

async function confirmDelete() {
  const category = deletingCategory.value
  if (!category) return
  if (category.item_count > 0 && !replacementId.value) {
    showError(null, '请选择条目迁移目标分类。')
    return
  }
  clearNotice()
  try {
    await $fetch(`/api/admin/community/categories/${category.id}`, {
      method: 'DELETE',
      body: { replacement_id: replacementId.value },
    })
    if (editingId.value === category.id) resetForm()
    deletingCategory.value = null
    replacementId.value = null
    await loadCategories()
    notice.type = 'success'
    notice.message = category.item_count ? '分类条目已迁移，原分类已删除。' : '社区分类已删除。'
  } catch (cause) {
    showError(cause, '社区分类删除失败。')
  }
}

function sortCategories() {
  categories.value.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
}

function clearNotice() {
  notice.type = 'idle'
  notice.message = ''
}

function showError(cause: unknown, fallback: string) {
  notice.type = 'error'
  notice.message = apiErrorMessage(cause, fallback)
}
</script>

<template>
  <AdminAccessGate>
    <div class="admin-page admin-community-page">
      <header class="admin-page-heading">
        <span>Community categories</span>
        <h1>社区分类管理</h1>
        <p>维护社区分类的名称、图标、展示顺序和前台可见状态。</p>
        <div class="admin-page-heading__actions">
          <button class="primary-command" type="button" @click="openCreate"><Plus :size="16" />新增分类</button>
          <NuxtLink class="secondary-command" to="/admin/community/items"><Plus :size="16" />管理条目</NuxtLink>
          <button class="secondary-command" type="button" :disabled="loading" @click="loadCategories"><RefreshCw :size="16" :class="{ spinning: loading }" />刷新</button>
        </div>
      </header>

      <div v-if="notice.message" :class="['tool-alert', notice.type === 'error' ? 'tool-alert--error' : 'tool-alert--success']">{{ notice.message }}</div>

      <section class="community-admin-metrics">
        <div><strong>{{ metrics.total }}</strong><span>全部分类</span></div>
        <div><strong>{{ metrics.visible }}</strong><span>前台显示</span></div>
        <div><strong>{{ metrics.items }}</strong><span>社区条目</span></div>
      </section>

      <section class="admin-section community-category-list">
        <header><h2>已有分类</h2><span>数字越小越靠前</span></header>
        <div class="community-category-rows">
          <article v-for="category in categories" :key="category.id">
            <div class="community-category-row-icon"><CommunityCategoryIcon :icon-key="category.icon_key" :size="19" /></div>
            <div class="community-category-row-main">
              <div><strong>{{ category.name }}</strong><code>{{ category.slug }}</code><span :class="category.is_visible ? 'is-visible' : 'is-hidden'">{{ category.is_visible ? '前台显示' : '已隐藏' }}</span></div>
              <p>{{ category.description || '暂未填写分类简介。' }}</p>
              <small>排序 {{ category.sort_order }} · {{ category.item_count }} 个条目 · {{ category.published_count }} 个已发布</small>
            </div>
            <div class="community-admin-item-actions">
              <button class="icon-button" type="button" title="编辑分类" @click="editCategory(category)"><Pencil :size="16" /></button>
              <button class="icon-button" type="button" :title="category.is_visible ? '隐藏分类' : '显示分类'" @click="toggleVisibility(category)"><EyeOff v-if="category.is_visible" :size="16" /><Eye v-else :size="16" /></button>
              <button class="icon-button icon-button--danger" type="button" title="删除分类" @click="requestDelete(category)"><Trash2 :size="16" /></button>
            </div>
          </article>
          <div v-if="!categories.length && !loading" class="empty-result"><Plus :size="18" />还没有社区分类。</div>
        </div>
      </section>
    </div>

    <Teleport to="body">
      <div v-if="editorOpen" class="community-drawer-backdrop" @mousedown.self="closeEditor">
        <aside class="community-category-drawer" role="dialog" aria-modal="true" :aria-labelledby="editingId ? 'community-category-edit-title' : 'community-category-create-title'">
          <header>
            <div><span>{{ editingId ? 'Edit category' : 'New category' }}</span><h2 :id="editingId ? 'community-category-edit-title' : 'community-category-create-title'">{{ editingId ? '编辑分类' : '新增分类' }}</h2><p>{{ editingId ? '名称、图标和展示设置会立即同步到前台。' : '新分类默认隐藏，准备好内容后再开启展示。' }}</p></div>
            <button class="icon-button" type="button" title="关闭编辑" :disabled="saving" @click="closeEditor"><X :size="18" /></button>
          </header>
          <form class="community-category-form" @submit.prevent="saveCategory">
            <div class="community-category-drawer__body">
              <label class="form-field"><span>分类名称</span><input ref="nameInput" v-model.trim="form.name" required maxlength="40" placeholder="例如 数据库工具"></label>
              <label class="form-field"><span>Slug</span><input v-model.trim="form.slug" required maxlength="80" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="database-tools" :disabled="Boolean(editingId)"><small>{{ editingId ? 'Slug 已锁定，避免已有公开地址失效。' : '仅使用小写字母、数字和短横线。' }}</small></label>
              <div class="community-category-drawer__row">
                <label class="form-field"><span>图标</span><select v-model="form.icon_key" aria-label="分类图标"><option v-for="option in iconOptions" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
                <label class="form-field"><span>排序</span><input v-model.number="form.sort_order" type="number" min="0" max="1000000" step="1"></label>
              </div>
              <label class="form-field community-category-description"><span>分类简介</span><textarea v-model.trim="form.description" rows="4" maxlength="240" placeholder="简要说明这个分类收录什么内容。" /></label>
              <label class="check-line community-category-visible"><input v-model="form.is_visible" type="checkbox">在前台显示分类和已发布条目</label>
              <div class="community-category-preview"><CommunityCategoryIcon :icon-key="form.icon_key" :size="20" /><div><strong>{{ form.name || '分类名称' }}</strong><code>/community/{{ form.slug || 'category-slug' }}</code></div></div>
            </div>
            <footer><button class="secondary-command" type="button" :disabled="saving" @click="closeEditor">取消</button><button class="primary-command" type="submit" :disabled="saving"><Save :size="16" />{{ saving ? '保存中...' : (editingId ? '保存修改' : '创建分类') }}</button></footer>
          </form>
        </aside>
      </div>

      <div v-if="deletingCategory" class="community-drawer-backdrop community-drawer-backdrop--confirm" @mousedown.self="deletingCategory = null">
        <section class="community-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="community-category-delete-title">
          <header><div><span>Delete category</span><h2 id="community-category-delete-title">删除“{{ deletingCategory.name }}”</h2></div><button class="icon-button" type="button" title="关闭删除确认" @click="deletingCategory = null"><X :size="18" /></button></header>
          <div class="community-confirm-dialog__body">
            <label v-if="deletingCategory.item_count" class="form-field"><span>将 {{ deletingCategory.item_count }} 个条目迁移到</span><select v-model.number="replacementId" aria-label="条目迁移目标分类"><option v-for="category in replacementOptions" :key="category.id" :value="category.id">{{ category.name }}</option></select></label>
            <p>{{ deletingCategory.item_count ? '迁移和删除会在同一事务内完成，不会删除条目和点赞记录。' : '该分类没有条目，删除后无法恢复。' }}</p>
          </div>
          <footer><button class="secondary-command" type="button" @click="deletingCategory = null">取消</button><button class="danger-command" type="button" @click="confirmDelete"><Trash2 :size="16" />确认删除</button></footer>
        </section>
      </div>
    </Teleport>
  </AdminAccessGate>
</template>
