<script setup lang="ts">
import { Archive, ExternalLink, Gamepad2, Pencil, Plus, Save, Send, Trash2, X } from 'lucide-vue-next'
import type { ApiSuccess } from '~/types/api'
import { apiErrorMessage } from '~/types/api'
import type { GameCategory, GameItem, GameStatus } from '~/types/games'

definePageMeta({ layout: 'admin' })
useSeoMeta({ title: '游戏管理', robots: 'noindex, nofollow' })

const admin = useAdminSessionState()
const items = ref<GameItem[]>([])
const loading = ref(false)
const saving = ref(false)
const editingId = ref<number | null>(null)
const editorOpen = ref(false)
const nameInput = ref<HTMLInputElement | null>(null)
const categoryFilter = ref<GameCategory | 'all'>('all')
const notice = reactive({ type: 'idle' as 'idle' | 'success' | 'error', message: '' })
const form = reactive({
  slug: '',
  category: 'arcade' as GameCategory,
  name: '',
  summary: '',
  description_md: '',
  cover_url: '',
  official_url: '',
  play_path: '',
  license: 'MIT',
  author: '',
  tags: '',
  compatibility: '',
  status: 'draft' as GameStatus,
  is_featured: false,
  sort_order: 1000,
})

const filteredItems = computed(() => categoryFilter.value === 'all'
  ? items.value
  : items.value.filter(item => item.category === categoryFilter.value))
const metrics = computed(() => ({
  total: items.value.length,
  published: items.value.filter(item => item.status === 'published').length,
  online: items.value.reduce((total, item) => total + item.online_count, 0),
  featured: items.value.filter(item => item.is_featured).length,
}))

watch(() => admin.session.value?.admin, (authenticated) => {
  if (authenticated && !items.value.length) void loadGames()
}, { immediate: true })

watch(editorOpen, (open) => {
  if (import.meta.client) document.body.style.overflow = open ? 'hidden' : ''
})

onMounted(() => window.addEventListener('keydown', handleEscape))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleEscape)
  document.body.style.overflow = ''
})

async function loadGames() {
  loading.value = true
  try {
    const response = await $fetch<ApiSuccess<GameItem[]>>('/api/admin/games')
    items.value = response.data
  } catch (cause) {
    showError(cause, '游戏条目读取失败。')
  } finally {
    loading.value = false
  }
}

async function saveGame() {
  saving.value = true
  clearNotice()
  const body = {
    ...form,
    tags: form.tags.split(/[,，\n]/).map(tag => tag.trim()).filter(Boolean),
    cover_url: form.cover_url.trim() || null,
    compatibility: form.compatibility.trim() || null,
    sort_order: Number(form.sort_order),
  }
  try {
    const response = editingId.value
      ? await $fetch<ApiSuccess<GameItem>>(`/api/admin/games/${editingId.value}`, { method: 'PUT', body })
      : await $fetch<ApiSuccess<GameItem>>('/api/admin/games', { method: 'POST', body })
    const index = items.value.findIndex(item => item.id === response.data.id)
    if (index >= 0) items.value[index] = response.data
    else items.value.push(response.data)
    items.value.sort(compareItems)
    notice.type = 'success'
    notice.message = editingId.value ? '游戏条目已保存。' : '游戏条目已创建。'
    closeEditor()
  } catch (cause) {
    showError(cause, '游戏条目保存失败。')
  } finally {
    saving.value = false
  }
}

function editGame(game: GameItem) {
  editingId.value = game.id
  Object.assign(form, {
    slug: game.slug,
    category: game.category,
    name: game.name,
    summary: game.summary,
    description_md: game.description_md || '',
    cover_url: game.cover_url || '',
    official_url: game.official_url,
    play_path: game.play_path,
    license: game.license,
    author: game.author,
    tags: game.tags.join(', '),
    compatibility: game.compatibility || '',
    status: game.status,
    is_featured: game.is_featured,
    sort_order: game.sort_order,
  })
  editorOpen.value = true
  clearNotice()
  nextTick(() => nameInput.value?.focus())
}

function openCreate() {
  resetForm()
  editorOpen.value = true
  clearNotice()
  nextTick(() => nameInput.value?.focus())
}

function closeEditor() {
  editorOpen.value = false
  resetForm()
}

function handleEscape(event: KeyboardEvent) {
  if (event.key === 'Escape' && editorOpen.value && !saving.value) closeEditor()
}

function resetForm() {
  editingId.value = null
  Object.assign(form, {
    slug: '', category: 'arcade', name: '', summary: '', description_md: '', cover_url: '',
    official_url: '', play_path: '', license: 'MIT', author: '', tags: '', compatibility: '',
    status: 'draft', is_featured: false, sort_order: 1000,
  })
}

async function changeStatus(game: GameItem, status: 'published' | 'archived') {
  clearNotice()
  try {
    const response = await $fetch<ApiSuccess<GameItem>>(`/api/admin/games/${game.id}/${status === 'published' ? 'publish' : 'archive'}`, { method: 'POST' })
    Object.assign(game, response.data)
    notice.type = 'success'
    notice.message = status === 'published' ? `${game.name} 已上架。` : `${game.name} 已下架。`
  } catch (cause) {
    showError(cause, '游戏上架状态更新失败。')
  }
}

async function removeGame(game: GameItem) {
  if (!window.confirm(`确定删除“${game.name}”吗？`)) return
  clearNotice()
  try {
    await $fetch(`/api/admin/games/${game.id}`, { method: 'DELETE' })
    items.value = items.value.filter(item => item.id !== game.id)
    if (editingId.value === game.id) closeEditor()
    notice.type = 'success'
    notice.message = '游戏条目已删除。'
  } catch (cause) {
    showError(cause, '游戏条目删除失败。')
  }
}

function compareItems(a: GameItem, b: GameItem) {
  return a.category.localeCompare(b.category) || a.sort_order - b.sort_order || a.name.localeCompare(b.name)
}

function categoryLabel(category: GameCategory) {
  return { board: '棋类对战', arcade: '街机休闲', puzzle: '益智拼图', training: '训练工具', adventure: '冒险闯关' }[category]
}

function statusLabel(status: GameStatus) {
  return { draft: '草稿', published: '已上架', archived: '已下架' }[status]
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
    <div class="admin-page games-admin-page">
      <header class="admin-page-heading">
        <span>游戏目录</span>
        <h1>游戏管理</h1>
        <p>维护中文网页小游戏、分类、运行地址和上架状态。在线人数按最近 90 秒心跳估算。</p>
        <div class="admin-page-heading__actions">
          <button class="primary-command" type="button" @click="openCreate"><Plus :size="16" />新增游戏</button>
          <NuxtLink class="secondary-command" to="/games" target="_blank"><ExternalLink :size="16" />查看前台</NuxtLink>
          <button class="secondary-command" type="button" :disabled="loading" @click="loadGames"><Gamepad2 :size="16" />{{ loading ? '读取中...' : '刷新' }}</button>
        </div>
      </header>

      <div v-if="notice.message" :class="['tool-alert', notice.type === 'error' ? 'tool-alert--error' : 'tool-alert--success']">{{ notice.message }}</div>

      <section class="games-admin-metrics">
        <div><strong>{{ metrics.total }}</strong><span>全部游戏</span></div>
        <div><strong>{{ metrics.published }}</strong><span>已上架</span></div>
        <div><strong>{{ metrics.online }}</strong><span>当前在线</span></div>
        <div><strong>{{ metrics.featured }}</strong><span>精选游戏</span></div>
      </section>

      <section class="admin-section">
        <header><h2>已维护游戏</h2><span>上架后才会出现在前台</span></header>
        <div class="games-admin-filter" role="tablist" aria-label="游戏分类筛选">
          <button v-for="filter in ['all', 'board', 'arcade', 'puzzle', 'training', 'adventure'] as const" :key="filter" type="button" :class="{ active: categoryFilter === filter }" @click="categoryFilter = filter">{{ filter === 'all' ? '全部' : categoryLabel(filter) }}</button>
        </div>
        <div class="games-admin-rows">
          <article v-for="game in filteredItems" :key="game.id">
            <div class="games-admin-item-icon">{{ game.name.slice(0, 1) }}</div>
            <div class="games-admin-item-main"><div><strong>{{ game.name }}</strong><code>{{ game.slug }}</code><span :class="`is-${game.status}`">{{ statusLabel(game.status) }}</span></div><p>{{ game.summary }}</p><small>{{ categoryLabel(game.category) }} · {{ game.online_count }} 人在线 · 排序 {{ game.sort_order }}</small></div>
            <div class="games-admin-item-actions">
              <button class="icon-button" type="button" title="编辑" @click="editGame(game)"><Pencil :size="16" /></button>
              <button v-if="game.status !== 'published'" class="icon-button" type="button" title="上架" @click="changeStatus(game, 'published')"><Send :size="16" /></button>
              <button v-else class="icon-button" type="button" title="下架" @click="changeStatus(game, 'archived')"><Archive :size="16" /></button>
              <button class="icon-button icon-button--danger" type="button" title="删除" @click="removeGame(game)"><Trash2 :size="16" /></button>
            </div>
          </article>
          <div v-if="!filteredItems.length && !loading" class="empty-result"><Plus :size="18" />这个分类还没有游戏。</div>
        </div>
      </section>
    </div>

    <Teleport to="body">
      <div v-if="editorOpen" class="community-drawer-backdrop" @mousedown.self="closeEditor">
        <aside class="community-item-drawer games-item-drawer" role="dialog" aria-modal="true" :aria-labelledby="editingId ? 'game-edit-title' : 'game-create-title'">
          <header>
            <div>
              <span>{{ editingId ? `Game item · ID ${editingId}` : 'New game item' }}</span>
              <h2 :id="editingId ? 'game-edit-title' : 'game-create-title'">{{ editingId ? '编辑游戏' : '新增游戏' }}</h2>
              <p>编辑内容时列表保持原位，保存后自动返回当前筛选结果。</p>
            </div>
            <button class="icon-button" type="button" title="关闭编辑" :disabled="saving" @click="closeEditor"><X :size="18" /></button>
          </header>

          <form class="community-item-editor-form" @submit.prevent="saveGame">
            <div class="community-item-drawer__body">
              <div v-if="notice.message && notice.type === 'error'" class="tool-alert tool-alert--error">{{ notice.message }}</div>

              <section class="community-item-editor-section">
                <header><h3>基础信息</h3><span>名称、分类和发布状态</span></header>
                <div class="community-item-editor-grid">
                  <label class="form-field"><span>名称</span><input ref="nameInput" v-model.trim="form.name" required maxlength="80" placeholder="例如 五子棋"></label>
                  <label class="form-field"><span>Slug</span><input v-model.trim="form.slug" required maxlength="80" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="gobang"></label>
                  <label class="form-field"><span>分类</span><select v-model="form.category" aria-label="游戏分类"><option value="board">棋类对战</option><option value="arcade">街机休闲</option><option value="puzzle">益智拼图</option><option value="training">训练工具</option><option value="adventure">冒险闯关</option></select></label>
                  <label class="form-field"><span>状态</span><select v-model="form.status" aria-label="游戏状态"><option value="draft">草稿</option><option value="published">已上架</option><option value="archived">已下架</option></select></label>
                </div>
              </section>

              <section class="community-item-editor-section">
                <header><h3>内容介绍</h3><span>用于前台卡片和详情页</span></header>
                <label class="form-field"><span>简介</span><textarea v-model.trim="form.summary" required minlength="10" maxlength="500" rows="3" placeholder="说明游戏怎么玩，以及适合什么场景。" /></label>
                <label class="form-field"><span>详细介绍（可选 Markdown）</span><textarea v-model="form.description_md" rows="12" maxlength="30000" placeholder="可填写玩法、来源、许可证和注意事项。" /></label>
              </section>

              <section class="community-item-editor-section">
                <header><h3>运行与来源</h3><span>链接、资源地址和授权信息</span></header>
                <label class="form-field"><span>官方地址</span><input v-model.trim="form.official_url" required type="url" maxlength="500" placeholder="https://github.com/owner/project"></label>
                <label class="form-field"><span>站内运行地址</span><input v-model.trim="form.play_path" required maxlength="500" pattern="/games-static/.+\.html" placeholder="/games-static/gobang/index.html"></label>
                <div class="community-item-editor-grid">
                  <label class="form-field"><span>许可证</span><input v-model.trim="form.license" required maxlength="80" placeholder="MIT"></label>
                  <label class="form-field"><span>作者或来源</span><input v-model.trim="form.author" required maxlength="120" placeholder="作者名或组织名"></label>
                </div>
              </section>

              <section class="community-item-editor-section">
                <header><h3>展示设置</h3><span>标签、封面和排序</span></header>
                <div class="community-item-editor-grid">
                  <label class="form-field"><span>标签</span><input v-model="form.tags" maxlength="240" placeholder="中文, Phaser, 休闲"><small>使用逗号分隔，最多 8 个。</small></label>
                  <label class="form-field"><span>适合设备</span><input v-model.trim="form.compatibility" maxlength="120" placeholder="手机 / 电脑"></label>
                  <label class="form-field"><span>封面地址（可选）</span><input v-model.trim="form.cover_url" maxlength="800" placeholder="/uploads/game-cover.png"></label>
                  <label class="form-field"><span>排序</span><input v-model.number="form.sort_order" type="number" min="0" max="1000000" step="1"></label>
                </div>
                <label class="check-line"><input v-model="form.is_featured" type="checkbox" aria-label="精选游戏">优先展示</label>
              </section>
            </div>

            <footer>
              <button class="secondary-command" type="button" :disabled="saving" @click="closeEditor">取消</button>
              <button class="primary-command" type="submit" :disabled="saving"><Save :size="16" />{{ saving ? '保存中...' : (editingId ? '保存修改' : '创建游戏') }}</button>
            </footer>
          </form>
        </aside>
      </div>
    </Teleport>
  </AdminAccessGate>
</template>
