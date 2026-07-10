<template>
  <section class="admin-feedback-board" aria-label="管理员反馈处理">
    <div class="admin-status-row">
      <span class="status-chip" :class="status.type">{{ statusLabel }}</span>
      <strong v-if="status.message" :class="status.type">{{ status.message }}</strong>
    </div>

    <div class="admin-toolbar">
      <label>
        <span>状态</span>
        <select v-model="statusFilter" :disabled="!adminToken" @change="loadFeedback">
          <option value="">全部状态</option>
          <option value="open">待处理</option>
          <option value="triaged">处理中</option>
          <option value="closed">已处理</option>
          <option value="spam">已忽略</option>
        </select>
      </label>
      <label class="search-field">
        <span>搜索</span>
        <input v-model.trim="searchQuery" type="search" placeholder="编号、标题、内容、用户或联系方式" @keydown.enter.prevent="loadFeedback" />
      </label>
      <button class="soft-btn" type="button" :disabled="!adminToken || loading" @click="loadFeedback">刷新</button>
    </div>

    <section v-if="!adminToken" class="empty-panel">
      <h2>需要先完成管理员配置</h2>
      <p>请先到配置中心保存并验证 `GUIDE_API_ADMIN_TOKEN`，然后再处理用户反馈。</p>
      <a class="primary-link" href="/guide/admin/settings">打开配置中心</a>
    </section>

    <section v-else class="manager-grid">
      <div class="feedback-list-panel">
        <div class="table-head">
          <div>
            <h2>反馈列表</h2>
            <p>共 {{ total }} 条，当前第 {{ page }} 页。</p>
          </div>
          <div class="page-actions">
            <button class="soft-btn small" type="button" :disabled="page <= 1 || loading" @click="page--; loadFeedback()">上一页</button>
            <button class="soft-btn small" type="button" :disabled="page >= pages || loading" @click="page++; loadFeedback()">下一页</button>
          </div>
        </div>

        <div v-if="loading" class="empty-text">正在读取反馈...</div>
        <div v-else-if="feedbackItems.length === 0" class="empty-text">暂无匹配反馈。</div>
        <template v-else>
          <button
            v-for="item in feedbackItems"
            :key="item.public_id"
            type="button"
            class="feedback-row"
            :class="{ active: selected?.public_id === item.public_id }"
            @click="selectFeedback(item)"
          >
            <span class="row-top">
              <strong>{{ item.title }}</strong>
              <em :class="['status-pill', item.status]">{{ feedbackStatusLabel(item.status) }}</em>
            </span>
            <span>{{ item.public_id }} · {{ categoryLabel(item.category) }} · {{ formatTime(item.created_at) }}</span>
            <span>{{ userLabel(item) }}</span>
          </button>
        </template>
      </div>

      <form v-if="selected" class="feedback-detail-panel" @submit.prevent="saveSelected">
        <div class="detail-head">
          <div>
            <h2>{{ selected.title }}</h2>
            <p>{{ selected.public_id }} · {{ categoryLabel(selected.category) }} · {{ formatTime(selected.created_at) }}</p>
          </div>
          <select v-model="detailForm.status">
            <option value="open">待处理</option>
            <option value="triaged">处理中</option>
            <option value="closed">已处理</option>
            <option value="spam">已忽略</option>
          </select>
        </div>

        <dl class="detail-meta">
          <div>
            <dt>用户</dt>
            <dd>{{ userLabel(selected) }}</dd>
          </div>
          <div>
            <dt>联系方式</dt>
            <dd>{{ selected.contact || '未填写' }}</dd>
          </div>
          <div>
            <dt>页面</dt>
            <dd>{{ selected.page_url || '未记录' }}</dd>
          </div>
        </dl>

        <section class="content-box">
          <h3>反馈内容</h3>
          <p>{{ selected.content }}</p>
        </section>

        <label class="detail-field">
          <span>回复用户</span>
          <textarea v-model.trim="detailForm.admin_reply" rows="6" placeholder="这段内容会展示给用户，可以说明处理结果、排查建议或需要补充的信息。" />
        </label>

        <label class="detail-field">
          <span>内部备注</span>
          <textarea v-model.trim="detailForm.admin_note" rows="4" placeholder="仅管理员可见，用于记录处理过程。" />
        </label>

        <div class="detail-actions">
          <p>{{ selected.admin_reply ? `上次回复：${formatTime(selected.replied_at)}` : '还没有回复用户。' }}</p>
          <div>
            <button class="soft-btn" type="button" :disabled="saving" @click="markTriaged">标记处理中</button>
            <button class="soft-btn" type="button" :disabled="saving" @click="markClosed">标记已处理</button>
            <button class="primary-btn" type="submit" :disabled="saving">
              {{ saving ? '保存中...' : '保存处理结果' }}
            </button>
          </div>
        </div>
      </form>

      <section v-else class="feedback-detail-panel empty-panel">
        <h2>选择一条反馈</h2>
        <p>在左侧列表中选择反馈后，可以查看详情、回复用户并更新处理状态。</p>
      </section>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { readAdminToken } from './admin-session'

interface ApiResponse<T> {
  ok: boolean
  data: T
  meta?: {
    total?: number
    page?: number
    page_size?: number
    pages?: number
  }
  error?: {
    message?: string
  }
}

interface FeedbackAdminItem {
  id: number
  public_id: string
  category: string
  title: string
  content: string
  contact: string | null
  page_url: string | null
  source: string
  user_id: string | null
  user_email: string | null
  user_name: string | null
  status: string
  admin_reply: string | null
  admin_note: string | null
  created_at: string
  updated_at: string
  replied_at: string | null
  closed_at: string | null
}

const categoryOptions = [
  { value: 'suggestion', label: '功能建议' },
  { value: 'api', label: 'API 接入' },
  { value: 'playground', label: '模型试用' },
  { value: 'pricing', label: '模型价格' },
  { value: 'billing', label: '充值与账单' },
  { value: 'bug', label: '页面问题' },
  { value: 'other', label: '其他' },
]

const adminToken = ref('')
const loading = ref(false)
const saving = ref(false)
const feedbackItems = ref<FeedbackAdminItem[]>([])
const selected = ref<FeedbackAdminItem | null>(null)
const statusFilter = ref('')
const searchQuery = ref('')
const page = ref(1)
const pages = ref(1)
const total = ref(0)
const status = reactive({
  type: 'idle' as 'idle' | 'success' | 'error',
  message: '',
})
const detailForm = reactive({
  status: 'open',
  admin_reply: '',
  admin_note: '',
})

const statusLabel = computed(() => {
  if (status.type === 'success') return '已连接'
  if (status.type === 'error') return '需检查'
  return adminToken.value ? '待加载' : '未验证'
})

onMounted(() => {
  adminToken.value = readAdminToken()
  if (adminToken.value) {
    void loadFeedback()
  } else {
    setStatus('idle', '请先到配置中心保存管理员 Token。')
  }
})

async function loadFeedback() {
  if (!adminToken.value) return
  loading.value = true
  setStatus('idle', '正在加载反馈...')
  try {
    const query = new URLSearchParams({
      page: String(page.value),
      page_size: '20',
    })
    if (statusFilter.value) query.set('status', statusFilter.value)
    if (searchQuery.value) query.set('q', searchQuery.value)
    const body = await adminFetch<FeedbackAdminItem[]>(`/admin/feedback?${query}`)
    feedbackItems.value = body.data
    total.value = body.meta?.total || 0
    pages.value = body.meta?.pages || 1
    page.value = body.meta?.page || page.value
    if (selected.value) {
      const nextSelected = feedbackItems.value.find((item) => item.public_id === selected.value?.public_id)
      selected.value = nextSelected || null
      if (selected.value) applySelectedToForm(selected.value)
    }
    setStatus('success', '反馈已加载。')
  } catch (error) {
    setStatus('error', error instanceof Error ? error.message : '反馈加载失败')
  } finally {
    loading.value = false
  }
}

function selectFeedback(item: FeedbackAdminItem) {
  selected.value = item
  applySelectedToForm(item)
}

async function saveSelected() {
  if (!selected.value) return
  saving.value = true
  try {
    const updated = await adminFetch<FeedbackAdminItem>(`/admin/feedback/${selected.value.public_id}`, {
      method: 'PATCH',
      body: {
        status: detailForm.status,
        admin_reply: detailForm.admin_reply || null,
        admin_note: detailForm.admin_note || null,
      },
    })
    replaceFeedback(updated.data)
    selected.value = updated.data
    applySelectedToForm(updated.data)
    setStatus('success', '处理结果已保存。')
  } catch (error) {
    setStatus('error', error instanceof Error ? error.message : '保存失败')
  } finally {
    saving.value = false
  }
}

async function markTriaged() {
  detailForm.status = 'triaged'
  await saveSelected()
}

async function markClosed() {
  detailForm.status = 'closed'
  await saveSelected()
}

async function adminFetch<T>(path: string, options: { method?: string; body?: unknown } = {}) {
  const response = await fetch(`/guide-api${path}`, {
    method: options.method || 'GET',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${adminToken.value}`,
      'x-admin-token': adminToken.value,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const body = await response.json() as ApiResponse<T>
  if (!response.ok || !body.ok) {
    throw new Error(body.error?.message || 'guide-api 请求失败')
  }
  return body
}

function applySelectedToForm(item: FeedbackAdminItem) {
  detailForm.status = item.status || 'open'
  detailForm.admin_reply = item.admin_reply || ''
  detailForm.admin_note = item.admin_note || ''
}

function replaceFeedback(item: FeedbackAdminItem) {
  const index = feedbackItems.value.findIndex((row) => row.public_id === item.public_id)
  if (index >= 0) feedbackItems.value[index] = item
}

function userLabel(item: FeedbackAdminItem) {
  return item.user_name || item.user_email || (item.user_id ? `用户 ${item.user_id}` : '未知用户')
}

function categoryLabel(value: string) {
  return categoryOptions.find((item) => item.value === value)?.label || '其他'
}

function feedbackStatusLabel(value: string) {
  if (value === 'triaged') return '处理中'
  if (value === 'closed') return '已处理'
  if (value === 'spam') return '已忽略'
  return '待处理'
}

function formatTime(value: string | null) {
  if (!value) return ''
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value))
  } catch {
    return value
  }
}

function setStatus(type: 'idle' | 'success' | 'error', message: string) {
  status.type = type
  status.message = message
}
</script>

<style scoped>
.admin-feedback-board {
  display: flex;
  flex-direction: column;
  gap: 12px;
  color: #102033;
}

.admin-toolbar,
.feedback-list-panel,
.feedback-detail-panel,
.empty-panel {
  border: 1px solid #d5e0ec;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.96);
}

.feedback-list-panel h2,
.feedback-detail-panel h2,
.empty-panel h2 {
  margin: 0;
  padding: 0;
  border: 0;
  color: #102033;
  font-size: 18px;
  line-height: 1.35;
}

.admin-status-row strong,
.table-head p,
.detail-head p,
.detail-meta dd,
.content-box p,
.detail-actions p,
.empty-panel p {
  margin: 0;
  color: #516882;
  font-size: 13px;
  line-height: 1.55;
}

.admin-status-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  min-height: 34px;
}

.admin-status-row strong.success {
  color: #04743b;
}

.admin-status-row strong.error {
  color: #a23124;
}

.admin-toolbar label,
.detail-field {
  display: grid;
  gap: 6px;
}

.admin-toolbar label span,
.detail-field span,
.detail-meta dt,
.content-box h3 {
  color: #24364b;
  font-size: 12px;
  font-weight: 800;
}

.admin-toolbar input,
.admin-toolbar select,
.detail-head select,
.detail-field textarea {
  width: 100%;
  border: 1px solid #c7d4e4;
  border-radius: 8px;
  color: #18283b;
  background: #ffffff;
  font: inherit;
}

.admin-toolbar input,
.admin-toolbar select,
.detail-head select {
  min-height: 38px;
  padding: 0 10px;
}

.detail-field textarea {
  padding: 10px;
  line-height: 1.6;
  resize: vertical;
}

.page-actions,
.detail-actions,
.detail-actions div {
  display: flex;
  gap: 8px;
  align-items: center;
}

.admin-toolbar {
  display: grid;
  grid-template-columns: 180px minmax(240px, 1fr) auto;
  gap: 10px;
  align-items: end;
  padding: 12px;
}

.manager-grid {
  display: grid;
  grid-template-columns: minmax(320px, 0.9fr) minmax(0, 1.3fr);
  gap: 12px;
  align-items: start;
}

.feedback-list-panel,
.feedback-detail-panel {
  overflow: hidden;
}

.table-head,
.detail-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 14px;
  border-bottom: 1px solid #d5e0ec;
}

.feedback-row {
  display: grid;
  width: 100%;
  gap: 6px;
  padding: 12px 14px;
  border: 0;
  border-bottom: 1px solid #d5e0ec;
  color: #102033;
  text-align: left;
  background: transparent;
  cursor: pointer;
}

.feedback-row:hover,
.feedback-row.active {
  background: #eef8f7;
}

.feedback-row span {
  color: #516882;
  font-size: 12px;
  line-height: 1.45;
}

.row-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.row-top strong {
  overflow: hidden;
  color: #102033;
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-meta {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin: 0;
  padding: 14px;
  border-bottom: 1px solid #d5e0ec;
}

.detail-meta div,
.content-box {
  min-width: 0;
  padding: 10px;
  border-radius: 8px;
  background: #f5f8fb;
}

.detail-meta dd {
  overflow-wrap: anywhere;
}

.content-box {
  margin: 14px;
}

.content-box h3 {
  margin: 0 0 6px;
}

.detail-field {
  margin: 14px;
}

.detail-actions {
  justify-content: space-between;
  padding: 14px;
  border-top: 1px solid #d5e0ec;
}

.primary-btn,
.soft-btn {
  display: inline-flex;
  min-height: 38px;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  padding: 0 13px;
  font: inherit;
  font-weight: 800;
  cursor: pointer;
  transition: background 160ms ease, border-color 160ms ease, color 160ms ease, opacity 160ms ease;
  white-space: nowrap;
}

.primary-btn {
  border: 1px solid #146c6f;
  color: #ffffff;
  background: #146c6f;
}

.soft-btn {
  border: 1px solid #d0dbe8;
  color: #27384b;
  background: #f5f8fb;
}

.primary-btn:hover:not(:disabled) {
  border-color: #0f5c5f;
  background: #0f5c5f;
}

.soft-btn:hover:not(:disabled) {
  border-color: #aec0d4;
  background: #eef4f8;
}

.primary-btn.small,
.soft-btn.small {
  min-height: 32px;
  padding: 0 10px;
  font-size: 12px;
}

.primary-btn:disabled,
.soft-btn:disabled {
  cursor: not-allowed;
  opacity: 0.56;
}

.status-chip,
.status-pill {
  display: inline-flex;
  min-height: 26px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 0 10px;
  color: #526982;
  font-size: 12px;
  font-style: normal;
  font-weight: 800;
  white-space: nowrap;
  background: #edf2f7;
}

.status-chip.success,
.status-pill.closed {
  color: #04743b;
  background: #dff9e9;
}

.status-chip.error,
.status-pill.spam {
  color: #a23124;
  background: #ffe6e1;
}

.status-pill.triaged {
  color: #8a4b05;
  background: #fff1d8;
}

.empty-panel,
.empty-text {
  padding: 26px 18px;
  text-align: center;
}

.primary-link {
  display: inline-flex;
  min-height: 38px;
  align-items: center;
  justify-content: center;
  margin-top: 14px;
  border: 1px solid #146c6f;
  border-radius: 8px;
  padding: 0 13px;
  color: #ffffff;
  background: #146c6f;
  font-size: 13px;
  font-weight: 800;
  text-decoration: none;
}

.empty-text {
  color: #516882;
  font-size: 13px;
}

@media (max-width: 1080px) {
  .admin-toolbar,
  .manager-grid,
  .detail-meta {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 680px) {
  .admin-toolbar,
  .table-head,
  .detail-head,
  .detail-actions,
  .detail-actions div {
    display: grid;
    grid-template-columns: 1fr;
    align-items: stretch;
  }

  .primary-btn,
  .soft-btn {
    width: 100%;
  }
}
</style>
