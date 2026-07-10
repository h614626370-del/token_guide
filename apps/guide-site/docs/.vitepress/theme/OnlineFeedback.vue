<template>
  <div class="feedback-app">
    <header class="tool-topbar">
      <a class="tool-brand" href="./">
        <img class="brand-mark" :src="guideLogoSrc" width="34" height="34" alt="" aria-hidden="true" />
        <span>Token向云指南</span>
      </a>
      <nav aria-label="独立页面导航">
        <a href="./playground">模型试用</a>
        <a href="./pricing">模型价格</a>
        <a href="./feedback" aria-current="page">在线反馈</a>
        <a href="./">指南首页</a>
      </nav>
    </header>

    <main class="feedback-shell">
      <section class="feedback-hero" aria-labelledby="feedback-title">
        <div>
          <h1 id="feedback-title">在线反馈</h1>
          <p>
            提交 API 接入、模型试用、价格说明、充值账单和页面问题。
            管理员处理后，回复会显示在你的历史反馈中。
          </p>
        </div>
        <div class="hero-actions">
          <a class="primary-link" href="./pricing">查看模型价格</a>
          <a href="./playground">打开试用台</a>
        </div>
      </section>

      <section v-if="authState === 'checking'" class="gate-panel">
        <h2>正在确认登录状态</h2>
        <p>请稍等，页面会读取主站登录状态后加载反馈记录。</p>
      </section>

      <section v-else-if="authState !== 'ready'" class="gate-panel">
        <h2>登录后使用在线反馈</h2>
        <p>在线反馈会关联你的 Token向云账号，用于查看历史反馈、接收管理员回复，并限制同一用户每日提交次数。</p>
        <div class="gate-actions">
          <button class="primary-btn" type="button" @click="goLogin">去主站登录</button>
          <button class="soft-btn" type="button" @click="loadFeedbackState">重新检测</button>
        </div>
      </section>

      <section v-else class="feedback-board" aria-label="在线反馈">
        <div class="feedback-main">
          <form class="feedback-form-shell" @submit.prevent="submitFeedback">
            <div class="feedback-head">
              <div>
                <h2>提交反馈</h2>
                <p>问题、建议、价格说明和模型试用异常都可以从这里提交。</p>
              </div>
              <span class="status-chip" :class="status.type">{{ statusLabel }}</span>
            </div>

            <div class="quota-strip" :class="{ blocked: quota.remaining <= 0 }">
              <strong>今日还可提交 {{ quota.remaining }} 次</strong>
              <span>每日最多 {{ quota.limit }} 次，历史记录和管理员回复会保留在本页。</span>
            </div>

            <div class="feedback-grid">
              <label>
                <span>反馈类型</span>
                <select v-model="form.category" :disabled="submitting || quota.remaining <= 0">
                  <option v-for="option in categoryOptions" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </select>
              </label>

              <label>
                <span>联系方式</span>
                <input
                  v-model.trim="form.contact"
                  type="text"
                  autocomplete="off"
                  placeholder="邮箱 / QQ / 微信 / 手机号（选填）"
                  :disabled="submitting || quota.remaining <= 0"
                />
                <em>建议填写国内常用联系方式，方便需要核对订单或报错时回访。</em>
              </label>

              <label class="full">
                <span>标题</span>
                <input
                  v-model.trim="form.title"
                  type="text"
                  maxlength="120"
                  placeholder="用一句话说明你遇到的问题"
                  :disabled="submitting || quota.remaining <= 0"
                />
              </label>

              <label class="full">
                <span>具体内容</span>
                <textarea
                  v-model.trim="form.content"
                  maxlength="4000"
                  placeholder="可以附上页面、模型名称、报错信息、订单状态或希望改进的地方"
                  :disabled="submitting || quota.remaining <= 0"
                />
              </label>
            </div>

            <label class="bot-field" aria-hidden="true">
              <span>Website</span>
              <input v-model="form.website" type="text" tabindex="-1" autocomplete="off" />
            </label>

            <div class="feedback-footer">
              <p class="feedback-message" :class="status.type">{{ status.message }}</p>
              <button class="primary-btn" type="submit" :disabled="!canSubmit || submitting">
                {{ submitting ? '提交中...' : '提交反馈' }}
              </button>
            </div>
          </form>

          <section class="history-panel" aria-label="历史反馈">
            <div class="history-head">
              <div>
                <h2>历史反馈</h2>
                <p>只展示当前登录账号提交的记录，共 {{ historyTotal }} 条。</p>
              </div>
              <div class="history-actions">
                <button class="soft-btn" type="button" :disabled="loadingHistory" @click="loadFeedbackState">
                  {{ loadingHistory ? '刷新中...' : '刷新' }}
                </button>
                <button class="soft-btn" type="button" :disabled="historyPage <= 1 || loadingHistory" @click="changeHistoryPage(historyPage - 1)">
                  上一页
                </button>
                <button class="soft-btn" type="button" :disabled="historyPage >= historyPages || loadingHistory" @click="changeHistoryPage(historyPage + 1)">
                  下一页
                </button>
              </div>
            </div>

            <div v-if="loadingHistory" class="history-empty">正在读取历史反馈...</div>

            <div v-else-if="historyItems.length === 0" class="history-empty">
              还没有提交过反馈。
            </div>

            <template v-else>
              <article v-for="item in historyItems" :key="item.id" class="history-item">
                <div class="history-item-head">
                  <div>
                    <strong>{{ item.title }}</strong>
                    <span>{{ categoryLabel(item.category) }} · {{ formatTime(item.created_at) }}</span>
                  </div>
                  <em :class="['status-pill', item.status]">{{ feedbackStatusLabel(item.status) }}</em>
                </div>
                <p>{{ item.content }}</p>
                <div v-if="item.admin_reply" class="reply-box">
                  <span>管理员回复</span>
                  <p>{{ item.admin_reply }}</p>
                  <small v-if="item.replied_at">{{ formatTime(item.replied_at) }}</small>
                </div>
              </article>
              <div class="history-page-note">第 {{ historyPage }} / {{ historyPages }} 页</div>
            </template>
          </section>
        </div>

        <aside class="feedback-side">
          <section class="feedback-panel">
            <h2>处理状态</h2>
            <dl>
              <div>
                <dt>已接收</dt>
                <dd>提交后会生成反馈编号，并写入 guide-api 数据库。</dd>
              </div>
              <div>
                <dt>管理员处理</dt>
                <dd>管理员可回复、标记处理中或已处理；回复会显示在历史反馈里。</dd>
              </div>
            </dl>
          </section>

          <section class="feedback-panel">
            <h2>提交建议</h2>
            <ul>
              <li>接口问题请带上模型名称和请求入口。</li>
              <li>价格问题请带上分组名称或页面截图描述。</li>
              <li>订单问题请优先保留订单号，方便客服核对。</li>
            </ul>
          </section>
        </aside>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { withBase } from 'vitepress'

interface ApiResponse<T> {
  ok: boolean
  data: T
  meta?: {
    total?: number
    page?: number
    page_size?: number
    pages?: number
    quota?: FeedbackQuota
  }
  error?: {
    code?: string
    message?: string
    details?: {
      quota?: FeedbackQuota
    }
  }
}

interface FeedbackResponse {
  id: string
  status: string
  created_at: string
}

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
  contact: string | null
  status: string
  admin_reply: string | null
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
] as const

const guideLogoSrc = withBase('/logo-80.png')
const authState = ref<'checking' | 'ready' | 'required' | 'error'>('checking')
const authToken = ref('')
const loadingHistory = ref(false)
const submitting = ref(false)
const historyItems = ref<FeedbackItem[]>([])
const historyPage = ref(1)
const historyPages = ref(1)
const historyTotal = ref(0)
const quota = reactive<FeedbackQuota>({
  limit: 5,
  used: 0,
  remaining: 0,
  resets_at: '',
})

const form = reactive({
  category: 'suggestion',
  title: '',
  content: '',
  contact: '',
  website: '',
})

const status = reactive({
  type: 'idle' as 'idle' | 'success' | 'error',
  message: '提交后会返回反馈编号。',
})

const canSubmit = computed(() => {
  return authState.value === 'ready'
    && quota.remaining > 0
    && form.title.trim().length >= 2
    && form.content.trim().length >= 10
    && !submitting.value
})

const statusLabel = computed(() => {
  if (status.type === 'success') return '已提交'
  if (status.type === 'error') return '需检查'
  if (quota.remaining <= 0) return '今日已用完'
  return '待提交'
})

onMounted(() => {
  void loadFeedbackState()
})

async function loadFeedbackState(options: { preserveStatus?: boolean } = {}) {
  const preserveStatus = Boolean(options.preserveStatus)
  authState.value = 'checking'
  loadingHistory.value = true
  if (!preserveStatus) {
    status.type = 'idle'
    status.message = '正在读取反馈记录...'
  }
  authToken.value = readAuthToken()

  if (!authToken.value) {
    authState.value = 'required'
    loadingHistory.value = false
    if (!preserveStatus) status.message = '请先登录 Token向云账号。'
    return
  }

  try {
    const query = new URLSearchParams({
      page: String(historyPage.value),
      page_size: '10',
    })
    const body = await guideFetch<FeedbackItem[]>(`/feedback/me?${query}`)
    historyItems.value = body.data
    historyTotal.value = body.meta?.total || 0
    historyPages.value = body.meta?.pages || 1
    historyPage.value = body.meta?.page || historyPage.value
    if (body.meta?.quota) applyQuota(body.meta.quota)
    authState.value = 'ready'
    if (!preserveStatus) {
      status.message = quota.remaining > 0
        ? `今日还可提交 ${quota.remaining} 次。`
        : '今日反馈次数已用完，请明天再提交。'
    }
  } catch (error) {
    if ((error as { code?: string }).code === 'LOGIN_REQUIRED') {
      authState.value = 'required'
      status.message = '请先登录 Token向云账号。'
    } else {
      authState.value = 'error'
      status.type = 'error'
      status.message = error instanceof Error ? error.message : '反馈记录读取失败'
    }
  } finally {
    loadingHistory.value = false
  }
}

async function submitFeedback() {
  if (!canSubmit.value) return
  submitting.value = true
  status.type = 'idle'
  status.message = '正在提交反馈...'

  try {
    const pageUrl = typeof window === 'undefined' ? undefined : window.location.href
    const body = await guideFetch<FeedbackResponse>('/feedback', {
      method: 'POST',
      body: {
        category: form.category,
        title: form.title,
        content: form.content,
        contact: form.contact || null,
        page_url: pageUrl,
        source: 'guide',
        website: form.website,
        metadata: {
          path: typeof window === 'undefined' ? '' : window.location.pathname,
        },
      },
    })

    if (body.meta?.quota) applyQuota(body.meta.quota)
    status.type = 'success'
    status.message = `已收到反馈，编号 ${body.data?.id || '已生成'}。`
    form.title = ''
    form.content = ''
    form.website = ''
    historyPage.value = 1
    await loadFeedbackState({ preserveStatus: true })
  } catch (error) {
    const apiError = error as Error & { details?: { quota?: FeedbackQuota } }
    if (apiError.details?.quota) applyQuota(apiError.details.quota)
    status.type = 'error'
    status.message = error instanceof Error ? error.message : '反馈提交失败'
  } finally {
    submitting.value = false
  }
}

async function changeHistoryPage(nextPage: number) {
  historyPage.value = Math.min(Math.max(1, nextPage), historyPages.value)
  await loadFeedbackState()
}

async function guideFetch<T>(path: string, options: { method?: string; body?: unknown } = {}) {
  const response = await fetch(`/guide-api${path}`, {
    method: options.method || 'GET',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${authToken.value}`,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const body = await response.json() as ApiResponse<T>
  if (!response.ok || !body.ok) {
    const error = new Error(errorMessage(body)) as Error & {
      code?: string
      details?: ApiResponse<T>['error']['details']
    }
    error.code = body.error?.code
    error.details = body.error?.details
    throw error
  }
  return body
}

function readAuthToken() {
  if (typeof window === 'undefined') return ''
  try {
    return window.localStorage.getItem('auth_token') || ''
  } catch {
    return ''
  }
}

function goLogin() {
  if (typeof window === 'undefined') return
  const redirect = `${window.location.pathname}${window.location.search}`
  const isLocal = ['127.0.0.1', 'localhost'].includes(window.location.hostname)
  window.location.href = isLocal
    ? 'https://kkflow.org/login'
    : `/login?redirect=${encodeURIComponent(redirect)}`
}

function applyQuota(next: FeedbackQuota) {
  quota.limit = Number(next.limit || 5)
  quota.used = Number(next.used || 0)
  quota.remaining = Math.max(0, Number(next.remaining || 0))
  quota.resets_at = next.resets_at || ''
}

function errorMessage(body: ApiResponse<unknown>) {
  if (body.error?.code === 'DAILY_LIMIT_REACHED') return '今日反馈次数已用完，请明天再提交。'
  if (body.error?.code === 'LOGIN_REQUIRED') return '请先登录 Token向云账号。'
  return body.error?.message || 'guide-api 请求失败'
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
</script>

<style scoped>
.feedback-app {
  --studio-bg: #eef5f4;
  --studio-line: #dbe7e5;
  --studio-line-strong: #b9d8d4;
  --studio-ink: #121827;
  --studio-muted: #64748b;
  --studio-soft: #eef8f7;
  --studio-accent: #0f8b83;
  --studio-accent-strong: #08756e;
  min-height: 100dvh;
  color: var(--studio-ink);
  background:
    linear-gradient(115deg, rgba(15, 139, 131, 0.1), rgba(255, 255, 255, 0) 38%),
    linear-gradient(180deg, #f6faf9 0%, var(--studio-bg) 100%);
  font-family: Inter, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
}

.feedback-app,
.feedback-app * {
  box-sizing: border-box;
}

.tool-topbar {
  display: flex;
  min-height: 56px;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 0 28px;
  border-bottom: 1px solid rgba(185, 216, 212, 0.72);
  background: rgba(255, 255, 255, 0.86);
}

.tool-brand,
.tool-topbar nav,
.hero-actions,
.gate-actions,
.feedback-head,
.feedback-footer,
.history-head,
.history-item-head {
  display: flex;
  align-items: center;
}

.tool-brand {
  gap: 10px;
  color: var(--studio-ink);
  font-size: 15px;
  font-weight: 900;
  text-decoration: none;
  white-space: nowrap;
}

.brand-mark {
  display: block;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  border: 1px solid rgba(15, 118, 110, 0.16);
  border-radius: 8px;
  background: #fffaf3;
  object-fit: cover;
}

.tool-topbar nav {
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.tool-topbar nav a,
.hero-actions a {
  display: inline-flex;
  min-height: 36px;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  color: #43576f;
  font-size: 13px;
  font-weight: 800;
  text-decoration: none;
  transition: color 160ms ease, background 160ms ease, border-color 160ms ease;
}

.tool-topbar nav a {
  padding: 0 11px;
}

.tool-topbar nav a:hover,
.tool-topbar nav a[aria-current="page"] {
  color: var(--studio-accent-strong);
  background: var(--studio-soft);
}

.feedback-shell {
  width: min(1180px, calc(100% - 64px));
  margin: 0 auto;
  padding: 18px 0 30px;
}

.feedback-hero,
.gate-panel,
.feedback-form-shell,
.feedback-panel,
.history-panel {
  border: 1px solid #d5e0ec;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.96);
}

.feedback-hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  padding: 20px;
  margin-bottom: 14px;
}

.feedback-hero h1,
.gate-panel h2,
.feedback-head h2,
.feedback-panel h2,
.history-head h2 {
  margin: 0;
  padding: 0;
  border: 0;
  color: #102033;
  line-height: 1.25;
  letter-spacing: 0;
}

.feedback-hero h1 {
  font-size: 32px;
}

.gate-panel h2,
.feedback-head h2,
.feedback-panel h2,
.history-head h2 {
  font-size: 18px;
}

.feedback-hero p,
.gate-panel p,
.feedback-head p,
.feedback-message,
.feedback-panel dd,
.feedback-panel li,
.history-head p,
.history-item p,
.history-item span,
.quota-strip span,
.feedback-grid em {
  margin: 0;
  color: #516882;
  font-size: 13px;
  line-height: 1.65;
}

.feedback-hero p {
  max-width: 720px;
  margin-top: 10px;
  font-size: 14px;
}

.hero-actions,
.gate-actions,
.history-actions {
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.hero-actions a {
  padding: 0 14px;
  border: 1px solid var(--studio-line-strong);
  background: #ffffff;
}

.hero-actions .primary-link {
  border-color: var(--studio-accent);
  color: #ffffff;
  background: var(--studio-accent);
}

.gate-panel {
  padding: 24px;
}

.gate-panel p {
  max-width: 680px;
  margin-top: 10px;
}

.gate-actions {
  justify-content: flex-start;
  margin-top: 18px;
}

.feedback-board {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 14px;
  color: #102033;
}

.feedback-main,
.feedback-side {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
}

.feedback-form-shell,
.feedback-panel,
.history-panel {
  padding: 18px;
}

.feedback-head,
.feedback-footer,
.history-head,
.history-item-head {
  justify-content: space-between;
  gap: 14px;
}

.feedback-head {
  align-items: flex-start;
  margin-bottom: 14px;
}

.quota-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 42px;
  margin-bottom: 14px;
  padding: 10px 12px;
  border-radius: 8px;
  background: #eef8f7;
}

.quota-strip.blocked {
  background: #fff1d8;
}

.quota-strip strong {
  color: #0b6765;
  font-size: 13px;
}

.quota-strip.blocked strong {
  color: #8a4b05;
}

.status-chip,
.status-pill {
  display: inline-flex;
  min-height: 28px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 0 12px;
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

.feedback-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.feedback-grid label {
  display: grid;
  gap: 7px;
}

.feedback-grid label.full {
  grid-column: 1 / -1;
}

.feedback-grid span {
  color: #24364b;
  font-size: 13px;
  font-weight: 800;
}

.feedback-grid input,
.feedback-grid select,
.feedback-grid textarea {
  width: 100%;
  border: 1px solid #c7d4e4;
  border-radius: 8px;
  color: #18283b;
  background: #ffffff;
  font: inherit;
  transition: border-color 160ms ease, box-shadow 160ms ease;
}

.feedback-grid input,
.feedback-grid select {
  min-height: 44px;
  padding: 0 12px;
}

.feedback-grid textarea {
  min-height: 190px;
  resize: vertical;
  padding: 12px;
  line-height: 1.65;
}

.feedback-grid input:focus,
.feedback-grid select:focus,
.feedback-grid textarea:focus,
.primary-btn:focus-visible,
.soft-btn:focus-visible,
.tool-topbar a:focus-visible,
.hero-actions a:focus-visible {
  border-color: #238b8d;
  outline: 3px solid rgba(35, 139, 141, 0.14);
  outline-offset: 1px;
}

.feedback-grid input:disabled,
.feedback-grid select:disabled,
.feedback-grid textarea:disabled {
  cursor: not-allowed;
  opacity: 0.66;
}

.bot-field {
  position: absolute;
  left: -10000px;
  width: 1px;
  height: 1px;
  overflow: hidden;
}

.feedback-footer {
  margin-top: 16px;
}

.feedback-message.success {
  color: #04743b;
}

.feedback-message.error {
  color: #a23124;
}

.primary-btn,
.soft-btn {
  display: inline-flex;
  min-height: 42px;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  padding: 0 14px;
  font: inherit;
  font-weight: 800;
  cursor: pointer;
  transition: background 160ms ease, border-color 160ms ease, color 160ms ease, opacity 160ms ease;
}

.primary-btn {
  border: 1px solid #146c6f;
  color: #ffffff;
  background: #146c6f;
}

.primary-btn:hover:not(:disabled) {
  border-color: #0f5c5f;
  background: #0f5c5f;
}

.soft-btn {
  border: 1px solid #d0dbe8;
  color: #27384b;
  background: #f5f8fb;
}

.soft-btn:hover:not(:disabled) {
  border-color: #aec0d4;
  background: #eef4f8;
}

.primary-btn:disabled,
.soft-btn:disabled {
  cursor: not-allowed;
  opacity: 0.56;
}

.feedback-panel dl,
.feedback-panel ul {
  display: grid;
  gap: 12px;
  margin: 12px 0 0;
  padding: 0;
}

.feedback-panel ul {
  padding-left: 18px;
}

.feedback-panel dt {
  color: #102033;
  font-size: 13px;
  font-weight: 800;
}

.history-panel {
  display: grid;
  gap: 10px;
}

.history-actions {
  display: flex;
  align-items: center;
}

.history-empty {
  padding: 22px 0;
  color: #516882;
  font-size: 13px;
  text-align: center;
}

.history-item {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid #d5e0ec;
  border-radius: 8px;
  background: #ffffff;
}

.history-item strong {
  display: block;
  color: #102033;
  font-size: 14px;
}

.reply-box {
  padding: 10px 12px;
  border-radius: 8px;
  background: #eef8f7;
}

.reply-box span,
.reply-box small {
  display: block;
  color: #0b6765;
  font-size: 12px;
  font-weight: 800;
}

.reply-box p {
  margin: 6px 0;
  color: #1f3547;
}

.history-page-note {
  color: #516882;
  font-size: 12px;
  text-align: center;
}

:global(.dark) .feedback-app {
  --studio-bg: #0e1717;
  --studio-line: rgba(255, 255, 255, 0.1);
  --studio-line-strong: rgba(89, 201, 191, 0.36);
  --studio-ink: #edf7f6;
  --studio-muted: #9fb2b0;
  --studio-soft: rgba(89, 201, 191, 0.14);
  --studio-accent: #45c8bc;
  --studio-accent-strong: #6ee2d7;
  background: #0e1717;
}

:global(.dark) .tool-topbar,
:global(.dark) .feedback-hero,
:global(.dark) .gate-panel,
:global(.dark) .feedback-form-shell,
:global(.dark) .feedback-panel,
:global(.dark) .history-panel,
:global(.dark) .history-item {
  border-color: var(--studio-line);
  background: rgba(16, 26, 27, 0.88);
}

:global(.dark) .tool-brand,
:global(.dark) .feedback-hero h1,
:global(.dark) .gate-panel h2,
:global(.dark) .feedback-head h2,
:global(.dark) .feedback-panel h2,
:global(.dark) .history-head h2,
:global(.dark) .history-item strong,
:global(.dark) .feedback-grid span,
:global(.dark) .feedback-panel dt {
  color: var(--studio-ink);
}

:global(.dark) .tool-topbar nav a,
:global(.dark) .feedback-hero p,
:global(.dark) .gate-panel p,
:global(.dark) .feedback-head p,
:global(.dark) .history-head p,
:global(.dark) .feedback-panel dd,
:global(.dark) .feedback-panel li,
:global(.dark) .history-item p,
:global(.dark) .history-item span,
:global(.dark) .feedback-message,
:global(.dark) .feedback-grid em,
:global(.dark) .history-page-note {
  color: var(--studio-muted);
}

:global(.dark) .feedback-grid input,
:global(.dark) .feedback-grid select,
:global(.dark) .feedback-grid textarea,
:global(.dark) .soft-btn {
  border-color: var(--studio-line);
  color: var(--studio-ink);
  background: #101a1b;
}

@media (max-width: 960px) {
  .feedback-board {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .tool-topbar {
    display: grid;
    grid-template-columns: 1fr;
    align-items: flex-start;
    gap: 12px;
    padding: 12px 16px;
  }

  .tool-topbar nav {
    justify-content: flex-start;
    width: 100%;
  }

  .tool-topbar nav a {
    min-height: 32px;
    padding: 0 9px;
    font-size: 12px;
  }

  .feedback-shell {
    width: min(100% - 20px, 760px);
    padding: 10px 0 18px;
  }

  .feedback-hero,
  .feedback-grid,
  .feedback-footer,
  .feedback-head,
  .history-head,
  .history-actions,
  .history-item-head,
  .quota-strip {
    display: grid;
    align-items: stretch;
  }

  .feedback-hero {
    gap: 16px;
    padding: 16px;
  }

  .feedback-hero h1 {
    font-size: 26px;
  }

  .hero-actions {
    justify-content: flex-start;
  }

  .hero-actions a,
  .primary-btn,
  .soft-btn {
    width: 100%;
  }
}
</style>
