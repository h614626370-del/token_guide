<script setup lang="ts">
import { ChevronLeft, ChevronRight, Clock3, MessageSquareText, Send } from 'lucide-vue-next'
import type { ApiSuccess } from '~/types/api'
import { apiErrorCode, apiErrorDetails, apiErrorMessage } from '~/types/api'

interface FeedbackQuota {
  limit: number
  used: number
  remaining: number
  resets_at: string
}

interface FeedbackItem {
  id: string
  category: string
  title: string
  content: string
  status: string
  admin_reply: string | null
  created_at: string
  replied_at: string | null
}

const site = useSiteConfigState()
useSeoMeta({
  title: '在线反馈',
  description: () => `提交${site.value.project_name}接入、模型、价格和页面问题，并查看管理员回复。`,
})

const { session, loading: sessionLoading, error: sessionError, refresh: refreshSession } = useGuideSessionState()
const loadingHistory = ref(false)
const submitting = ref(false)
const history = ref<FeedbackItem[]>([])
const page = ref(1)
const pages = ref(1)
const total = ref(0)
const quota = reactive<FeedbackQuota>({ limit: 5, used: 0, remaining: 0, resets_at: '' })
const notice = reactive({ type: 'idle' as 'idle' | 'success' | 'error', message: '' })
const form = reactive({
  category: 'suggestion',
  title: '',
  content: '',
  contact: '',
  website: '',
})

const categories = [
  ['bug', '页面问题'],
  ['api', 'API 接入'],
  ['playground', '模型试用'],
  ['pricing', '价格说明'],
  ['billing', '充值账单'],
  ['suggestion', '功能建议'],
  ['other', '其他'],
] as const

const canSubmit = computed(() => Boolean(
  session.value?.authenticated
  && quota.remaining > 0
  && form.title.trim().length >= 2
  && form.content.trim().length >= 10
  && !submitting.value,
))

onMounted(async () => {
  const current = await refreshSession()
  if (current?.authenticated) await loadHistory()
})

async function loadHistory() {
  loadingHistory.value = true
  try {
    const response = await $fetch<ApiSuccess<FeedbackItem[]>>('/api/feedback/me', {
      query: { page: page.value, page_size: 10 },
    })
    history.value = response.data
    page.value = Number(response.meta?.page || page.value)
    pages.value = Number(response.meta?.pages || 1)
    total.value = Number(response.meta?.total || 0)
    applyQuota(response.meta?.quota)
  } catch (cause) {
    notice.type = 'error'
    notice.message = apiErrorMessage(cause, '反馈记录读取失败')
  } finally {
    loadingHistory.value = false
  }
}

async function submitFeedback() {
  if (!canSubmit.value) return
  submitting.value = true
  notice.type = 'idle'
  notice.message = ''
  try {
    const response = await $fetch<ApiSuccess<{ id: string }>>('/api/feedback', {
      method: 'POST',
      body: {
        category: form.category,
        title: form.title,
        content: form.content,
        contact: form.contact || null,
        page_url: window.location.href,
        source: 'guide',
        website: form.website,
        metadata: { path: window.location.pathname },
      },
    })
    applyQuota(response.meta?.quota)
    notice.type = 'success'
    notice.message = `反馈已提交，编号 ${response.data.id}。`
    form.title = ''
    form.content = ''
    form.website = ''
    page.value = 1
    await loadHistory()
  } catch (cause) {
    const details = apiErrorDetails(cause)
    if (details?.quota) applyQuota(details.quota)
    notice.type = 'error'
    notice.message = apiErrorCode(cause) === 'DAILY_LIMIT_REACHED'
      ? '今日反馈次数已用完，请明天再提交。'
      : apiErrorMessage(cause, '反馈提交失败')
  } finally {
    submitting.value = false
  }
}

async function changePage(next: number) {
  page.value = Math.min(Math.max(1, next), pages.value)
  await loadHistory()
}

function applyQuota(value: any) {
  if (!value) return
  quota.limit = Number(value.limit || 5)
  quota.used = Number(value.used || 0)
  quota.remaining = Math.max(0, Number(value.remaining || 0))
  quota.resets_at = String(value.resets_at || '')
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

function formatTime(value: string | null) {
  if (!value) return ''
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(new Date(value))
}
</script>

<template>
  <div class="tool-page feedback-page">
    <div class="tool-page__inner">
      <ToolPageHeading eyebrow="问题跟进" title="在线反馈" description="提交接入、模型、价格或页面问题，并在这里查看管理员处理状态和回复。">
        <template #actions>
          <span v-if="session?.authenticated" class="quota-chip">今日剩余 {{ quota.remaining }} / {{ quota.limit }}</span>
        </template>
      </ToolPageHeading>

      <SessionGate v-if="sessionLoading || !session?.authenticated" :loading="sessionLoading" :message="sessionError" />

      <div v-else class="feedback-layout">
        <form class="tool-panel feedback-form" @submit.prevent="submitFeedback">
          <div class="panel-heading">
            <div>
              <span>New</span>
              <h2>提交反馈</h2>
            </div>
            <MessageSquareText :size="20" />
          </div>

          <label class="form-field">
            <span>问题类型</span>
            <select v-model="form.category">
              <option v-for="item in categories" :key="item[0]" :value="item[0]">{{ item[1] }}</option>
            </select>
          </label>
          <label class="form-field">
            <span>标题</span>
            <input v-model.trim="form.title" maxlength="120" placeholder="简要说明问题" required>
          </label>
          <label class="form-field">
            <span>详细说明</span>
            <textarea v-model.trim="form.content" rows="9" maxlength="4000" placeholder="请写明操作步骤、预期结果和实际结果。" required />
            <small>{{ form.content.length }} / 4000</small>
          </label>
          <label class="form-field">
            <span>回复邮箱（可选）</span>
            <input v-model.trim="form.contact" type="email" maxlength="320" autocomplete="email" placeholder="name@example.com">
          </label>
          <label class="honeypot-field" aria-hidden="true">
            <span>Website</span>
            <input v-model="form.website" tabindex="-1" autocomplete="off">
          </label>

          <div v-if="notice.message" :class="['tool-alert', notice.type === 'error' ? 'tool-alert--error' : 'tool-alert--success']">
            {{ notice.message }}
          </div>

          <button class="primary-command panel-submit" type="submit" :disabled="!canSubmit">
            <Send :size="17" />
            {{ submitting ? '提交中...' : '提交反馈' }}
          </button>
        </form>

        <section class="tool-panel feedback-history">
          <div class="panel-heading">
            <div>
              <span>History</span>
              <h2>我的反馈</h2>
            </div>
            <span class="result-duration">{{ total }} 条</span>
          </div>

          <div v-if="loadingHistory" class="loading-band">正在读取反馈记录...</div>
          <div v-else-if="history.length" class="feedback-list">
            <article v-for="item in history" :key="item.id" class="feedback-item">
              <header>
                <div>
                  <span>{{ categoryLabel(item.category) }}</span>
                  <strong>{{ item.title }}</strong>
                </div>
                <span :class="['feedback-status', `feedback-status--${item.status}`]">{{ statusLabel(item.status) }}</span>
              </header>
              <p>{{ item.content }}</p>
              <div class="feedback-meta"><Clock3 :size="14" /> {{ formatTime(item.created_at) }} · {{ item.id }}</div>
              <blockquote v-if="item.admin_reply">
                <strong>管理员回复</strong>
                <p>{{ item.admin_reply }}</p>
                <small>{{ formatTime(item.replied_at) }}</small>
              </blockquote>
            </article>
          </div>
          <div v-else class="empty-result">
            <strong>还没有提交过反馈</strong>
            <p>提交后会在这里持续显示处理状态。</p>
          </div>

          <nav v-if="pages > 1" class="pagination" aria-label="反馈记录分页">
            <button class="icon-button" type="button" title="上一页" :disabled="page <= 1" @click="changePage(page - 1)"><ChevronLeft :size="17" /></button>
            <span>{{ page }} / {{ pages }}</span>
            <button class="icon-button" type="button" title="下一页" :disabled="page >= pages" @click="changePage(page + 1)"><ChevronRight :size="17" /></button>
          </nav>
        </section>
      </div>
    </div>
  </div>
</template>
