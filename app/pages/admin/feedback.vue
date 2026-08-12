<script setup lang="ts">
import { ChevronLeft, ChevronRight, RefreshCw, Save, Search } from 'lucide-vue-next'
import type { ApiSuccess } from '~/types/api'
import { apiErrorMessage } from '~/types/api'

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
}

definePageMeta({ layout: 'admin' })
useSeoMeta({ title: '反馈处理', robots: 'noindex, nofollow' })

const loading = ref(false)
const saving = ref(false)
const admin = useAdminSessionState()
const loaded = ref(false)
const items = ref<FeedbackAdminItem[]>([])
const selected = ref<FeedbackAdminItem | null>(null)
const page = ref(1)
const pages = ref(1)
const total = ref(0)
const query = ref('')
const statusFilter = ref('')
const categoryFilter = ref('')
const notice = reactive({ type: 'idle' as 'idle' | 'success' | 'error', message: '' })
const form = reactive({ status: 'open', admin_reply: '', admin_note: '' })

const categories = [
  ['bug', '页面问题'], ['api', 'API 接入'], ['playground', '模型试用'], ['pricing', '价格说明'],
  ['billing', '充值账单'], ['suggestion', '功能建议'], ['other', '其他'],
] as const

watch(() => admin.session.value?.admin, (authenticated) => {
  if (authenticated && !loaded.value) void loadFeedback()
}, { immediate: true })

async function loadFeedback() {
  loading.value = true
  try {
    const response = await $fetch<ApiSuccess<FeedbackAdminItem[]>>('/api/admin/feedback', {
      query: {
        page: page.value,
        page_size: 20,
        ...(query.value.trim() ? { q: query.value.trim() } : {}),
        ...(statusFilter.value ? { status: statusFilter.value } : {}),
        ...(categoryFilter.value ? { category: categoryFilter.value } : {}),
      },
    })
    items.value = response.data
    total.value = Number(response.meta?.total || 0)
    pages.value = Number(response.meta?.pages || 1)
    page.value = Number(response.meta?.page || page.value)
    loaded.value = true
    if (selected.value) {
      const next = items.value.find(item => item.public_id === selected.value?.public_id)
      selected.value = next || null
      if (next) applySelected(next)
    }
  } catch (cause) {
    notice.type = 'error'
    notice.message = apiErrorMessage(cause, '反馈列表读取失败')
  } finally {
    loading.value = false
  }
}

function select(item: FeedbackAdminItem) {
  selected.value = item
  applySelected(item)
}

function applySelected(item: FeedbackAdminItem) {
  form.status = item.status
  form.admin_reply = item.admin_reply || ''
  form.admin_note = item.admin_note || ''
}

async function saveSelected() {
  if (!selected.value) return
  saving.value = true
  try {
    const response = await $fetch<ApiSuccess<FeedbackAdminItem>>(`/api/admin/feedback/${selected.value.public_id}`, {
      method: 'PATCH',
      body: { status: form.status, admin_reply: form.admin_reply || null, admin_note: form.admin_note || null },
    })
    selected.value = response.data
    const index = items.value.findIndex(item => item.public_id === response.data.public_id)
    if (index >= 0) items.value[index] = response.data
    applySelected(response.data)
    notice.type = response.meta?.notification?.status === 'failed' ? 'error' : 'success'
    if (response.meta?.notification?.status === 'sent') {
      notice.message = '反馈处理结果已保存，回复邮件已发送。'
    } else if (response.meta?.notification?.status === 'failed') {
      notice.message = '反馈处理结果已保存，但回复邮件发送失败，请检查邮件设置。'
    } else if (response.meta?.notification?.status === 'skipped') {
      notice.message = '反馈处理结果已保存；用户未填写有效的回复邮箱。'
    } else if (response.meta?.notification?.status === 'disabled') {
      notice.message = '反馈处理结果已保存；邮件通知当前未启用。'
    } else {
      notice.message = '反馈处理结果已保存。'
    }
  } catch (cause) {
    notice.type = 'error'
    notice.message = apiErrorMessage(cause, '反馈保存失败')
  } finally {
    saving.value = false
  }
}

async function search() {
  page.value = 1
  await loadFeedback()
}

async function changePage(value: number) {
  page.value = Math.min(Math.max(1, value), pages.value)
  await loadFeedback()
}

function categoryLabel(value: string) {
  return categories.find(item => item[0] === value)?.[1] || '其他'
}

function statusLabel(value: string) {
  if (value === 'triaged') return '处理中'
  if (value === 'closed') return '已处理'
  if (value === 'spam') return '已忽略'
  return '待处理'
}

function userLabel(item: FeedbackAdminItem) {
  return item.user_name || item.user_email || (item.user_id ? `用户 ${item.user_id}` : '未知用户')
}

function formatTime(value: string | null) {
  if (!value) return ''
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}
</script>

<template>
  <AdminAccessGate>
    <div class="admin-page admin-feedback-page">
      <header class="admin-page-heading">
        <span>Feedback</span>
        <h1>反馈处理</h1>
        <p>筛选反馈，更新处理状态并填写用户可见回复。</p>
        <div class="admin-page-heading__actions"><span class="session-chip">共 {{ total }} 条</span></div>
      </header>

      <form class="admin-list-toolbar feedback-filter" @submit.prevent="search">
        <label class="search-control"><Search :size="17" /><input v-model="query" type="search" placeholder="编号、标题、内容或用户"></label>
        <select v-model="statusFilter" aria-label="状态筛选"><option value="">全部状态</option><option value="open">待处理</option><option value="triaged">处理中</option><option value="closed">已处理</option><option value="spam">已忽略</option></select>
        <select v-model="categoryFilter" aria-label="分类筛选"><option value="">全部分类</option><option v-for="item in categories" :key="item[0]" :value="item[0]">{{ item[1] }}</option></select>
        <button class="secondary-command" type="submit" :disabled="loading"><RefreshCw :size="16" :class="{ spinning: loading }" />查询</button>
      </form>

      <div v-if="notice.message" :class="['tool-alert', notice.type === 'error' ? 'tool-alert--error' : 'tool-alert--success']">{{ notice.message }}</div>

      <div class="admin-feedback-grid">
        <section class="admin-feedback-list">
          <button v-for="item in items" :key="item.public_id" type="button" :class="{ active: selected?.public_id === item.public_id }" @click="select(item)">
            <header><span>{{ categoryLabel(item.category) }}</span><em :class="`status-${item.status}`">{{ statusLabel(item.status) }}</em></header>
            <strong>{{ item.title }}</strong>
            <p>{{ item.content }}</p>
            <small>{{ userLabel(item) }} · {{ formatTime(item.created_at) }}</small>
          </button>
          <div v-if="!loading && !items.length" class="empty-result"><strong>没有符合条件的反馈</strong></div>
          <nav v-if="pages > 1" class="pagination"><button class="icon-button" type="button" :disabled="page <= 1" title="上一页" @click="changePage(page - 1)"><ChevronLeft :size="17" /></button><span>{{ page }} / {{ pages }}</span><button class="icon-button" type="button" :disabled="page >= pages" title="下一页" @click="changePage(page + 1)"><ChevronRight :size="17" /></button></nav>
        </section>

        <form v-if="selected" class="admin-feedback-detail" @submit.prevent="saveSelected">
          <header><div><span>{{ selected.public_id }}</span><h2>{{ selected.title }}</h2></div><select v-model="form.status"><option value="open">待处理</option><option value="triaged">处理中</option><option value="closed">已处理</option><option value="spam">已忽略</option></select></header>
          <dl><div><dt>用户</dt><dd>{{ userLabel(selected) }}</dd></div><div><dt>联系方式</dt><dd>{{ selected.contact || '-' }}</dd></div><div><dt>页面</dt><dd>{{ selected.page_url || '-' }}</dd></div><div><dt>提交时间</dt><dd>{{ formatTime(selected.created_at) }}</dd></div></dl>
          <article><span>反馈内容</span><p>{{ selected.content }}</p></article>
          <label class="form-field"><span>公开回复</span><textarea v-model="form.admin_reply" rows="7" maxlength="4000" placeholder="用户会在反馈历史中看到此内容。" /></label>
          <label class="form-field"><span>内部备注</span><textarea v-model="form.admin_note" rows="4" maxlength="2000" /></label>
          <button class="primary-command admin-save-command" type="submit" :disabled="saving"><Save :size="16" />{{ saving ? '保存中...' : '保存处理结果' }}</button>
        </form>
        <div v-else class="admin-feedback-detail empty-result"><strong>选择一条反馈查看详情</strong></div>
      </div>
    </div>
  </AdminAccessGate>
</template>
