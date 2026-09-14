<script setup lang="ts">
import { AlertTriangle, CheckCircle2, CircleStop, LoaderCircle, Play, RefreshCw, Users, XCircle } from 'lucide-vue-next'
import { SseDecoder } from '#shared/utils/sse'
import type { ApiSuccess } from '~/types/api'
import { apiErrorMessage } from '~/types/api'
import type { AccountTestAccount, AccountTestBatchCounts } from '~/types/account-tests'

definePageMeta({ layout: 'admin' })
useSeoMeta({ title: 'OpenAI 账号测试', robots: 'noindex, nofollow' })

type RowState = 'queued' | 'running' | 'success' | 'failed' | 'cancelled'
type AccountTestRow = AccountTestAccount & {
  state: RowState
  answer: string
  statusText: string
  error: string
  latencyMs: number | null
}

const admin = useAdminSessionState()
const models = ref<string[]>([])
const selectedModel = ref('')
const prompt = ref('')
const rows = ref<AccountTestRow[]>([])
const loading = ref(false)
const running = ref(false)
const notice = reactive({ type: 'idle' as 'idle' | 'success' | 'error', message: '' })
const counts = ref<AccountTestBatchCounts>({ total: 0, succeeded: 0, failed: 0 })
let abortController: AbortController | null = null

const canStart = computed(() => Boolean(selectedModel.value && prompt.value.trim() && rows.value.length && !loading.value && !running.value))
const completedCount = computed(() => rows.value.filter(item => ['success', 'failed', 'cancelled'].includes(item.state)).length)
const successCount = computed(() => rows.value.filter(item => item.state === 'success').length)
const failedCount = computed(() => rows.value.filter(item => item.state === 'failed').length)
const stateLabel = (state: RowState) => ({
  queued: '等待测试',
  running: '测试中',
  success: '成功',
  failed: '失败',
  cancelled: '已中止',
}[state])

watch(() => admin.session.value?.admin, (authenticated) => {
  if (authenticated) void loadData()
}, { immediate: true })

async function loadData() {
  loading.value = true
  notice.type = 'idle'
  notice.message = ''
  try {
    const [modelResponse, accountResponse] = await Promise.all([
      $fetch<ApiSuccess<{ models: string[] }>>('/api/admin/account-tests/models'),
      $fetch<ApiSuccess<{ accounts: AccountTestAccount[] }>>('/api/admin/account-tests/accounts'),
    ])
    models.value = modelResponse.data.models || []
    if (!models.value.includes(selectedModel.value)) selectedModel.value = models.value[0] || ''
    rows.value = (accountResponse.data.accounts || []).map(createRow)
    counts.value = { total: rows.value.length, succeeded: 0, failed: 0 }
  } catch (cause) {
    models.value = []
    rows.value = []
    notice.type = 'error'
    notice.message = apiErrorMessage(cause, 'OpenAI 账号或模型读取失败')
  } finally {
    loading.value = false
  }
}

function createRow(account: AccountTestAccount): AccountTestRow {
  return { ...account, state: 'queued', answer: '', statusText: '', error: '', latencyMs: null }
}

async function refreshData() {
  if (running.value) return
  await loadData()
}

async function startTest() {
  if (!canStart.value) return
  notice.type = 'idle'
  notice.message = ''
  counts.value = { total: rows.value.length, succeeded: 0, failed: 0 }
  rows.value = rows.value.map(row => ({ ...createRow(row), state: 'queued' }))
  running.value = true
  abortController = new AbortController()

  try {
    const response = await fetch('/api/admin/account-tests/run', {
      method: 'POST',
      headers: { accept: 'text/event-stream', 'content-type': 'application/json' },
      body: JSON.stringify({ model_id: selectedModel.value, prompt: prompt.value.trim() }),
      signal: abortController.signal,
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    if (!response.body) throw new Error('服务器没有返回测试流。')

    const reader = response.body.getReader()
    const decoder = new SseDecoder()
    const consume = async (events: ReturnType<SseDecoder['push']>) => {
      for (const event of events) handleEvent(event.event, parseEventData(event.data))
    }
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      await consume(decoder.push(value))
    }
    await consume(decoder.finish())
    if (running.value) {
      running.value = false
      notice.type = 'success'
      notice.message = `批量测试完成：成功 ${successCount.value} 个，失败 ${failedCount.value} 个。`
    }
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') return
    running.value = false
    notice.type = 'error'
    notice.message = apiErrorMessage(cause, '批量测试失败')
  } finally {
    abortController = null
  }
}

function stopTest() {
  if (!running.value) return
  abortController?.abort()
  rows.value = rows.value.map(row => row.state === 'queued' || row.state === 'running' ? { ...row, state: 'cancelled', error: '测试已中止。' } : row)
  running.value = false
  notice.type = 'idle'
  notice.message = '批量测试已中止。'
}

function handleEvent(eventName: string, data: Record<string, any>) {
  if (eventName === 'batch.complete') {
    counts.value = {
      total: Number(data.total || rows.value.length),
      succeeded: Number(data.succeeded || 0),
      failed: Number(data.failed || 0),
    }
    running.value = false
    notice.type = 'success'
    notice.message = `批量测试完成：成功 ${counts.value.succeeded} 个，失败 ${counts.value.failed} 个。`
    return
  }
  if (eventName === 'batch.error') {
    notice.type = 'error'
    notice.message = String(data.error || '批量测试失败。')
    running.value = false
    return
  }
  const row = rows.value.find(item => item.id === Number(data.account_id))
  if (!row) return
  if (eventName === 'account.start') {
    row.state = 'running'
    row.statusText = '正在连接账号...'
  } else if (eventName === 'account.status') {
    row.statusText = String(data.text || '')
  } else if (eventName === 'account.delta') {
    row.answer += String(data.text || '')
  } else if (eventName === 'account.complete') {
    row.state = data.success === true ? 'success' : 'failed'
    row.answer = typeof data.answer === 'string' ? data.answer : row.answer
    row.error = String(data.error || '')
    row.latencyMs = Number.isFinite(Number(data.latency_ms)) ? Number(data.latency_ms) : null
    row.statusText = row.state === 'success' ? '测试完成' : '测试失败'
  }
}

function parseEventData(value: string) {
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}
</script>

<template>
  <AdminAccessGate>
    <div class="admin-page account-tests-page">
      <header class="admin-page-heading">
        <span>OpenAI Diagnostics</span>
        <h1>OpenAI 账号测试</h1>
        <p>使用同一条提示词并发测试所有活跃 OpenAI 账号，实时比较返回结果。</p>
        <div class="admin-page-heading__actions">
          <button class="secondary-command" type="button" :disabled="loading || running" title="刷新账号和模型" @click="refreshData">
            <RefreshCw :size="16" :class="{ 'is-spinning': loading }" />
            刷新
          </button>
        </div>
      </header>

      <section class="account-tests-controls">
        <div class="account-tests-form">
          <label class="form-field">
            <span>测试模型</span>
            <select v-model="selectedModel" :disabled="loading || running" required>
              <option value="" disabled>{{ loading ? '正在读取模型...' : '请选择模型' }}</option>
              <option v-for="model in models" :key="model" :value="model">{{ model }}</option>
            </select>
          </label>
          <label class="form-field form-field--grow">
            <span>自定义提示词</span>
            <textarea v-model="prompt" rows="5" maxlength="100000" placeholder="输入所有账号都要回答的问题" :disabled="running" required />
            <small>同一条提示词会发送给每个账号，结果只在当前页面展示。</small>
          </label>
          <div class="account-tests-actions">
            <button v-if="!running" class="primary-command" type="button" :disabled="!canStart" @click="startTest">
              <Play :size="17" />
              开始批量测试
            </button>
            <button v-else class="secondary-command" type="button" @click="stopTest">
              <CircleStop :size="17" />
              中止测试
            </button>
            <span class="account-tests-hint"><Users :size="15" /> {{ rows.length }} 个活跃 OpenAI 账号</span>
          </div>
        </div>
      </section>

      <div v-if="notice.message" :class="['tool-alert', notice.type === 'error' ? 'tool-alert--error' : 'tool-alert--success']">
        <AlertTriangle v-if="notice.type === 'error'" :size="17" />
        <CheckCircle2 v-else :size="17" />
        <span>{{ notice.message }}</span>
      </div>

      <section class="account-tests-summary">
        <div><strong>{{ completedCount }} / {{ rows.length }}</strong><span>已完成</span></div>
        <div><strong>{{ successCount }}</strong><span>成功</span></div>
        <div><strong>{{ failedCount }}</strong><span>失败</span></div>
        <div><strong>{{ selectedModel || '未选择' }}</strong><span>测试模型</span></div>
      </section>

      <section class="account-tests-results" aria-live="polite">
        <div v-if="!rows.length" class="account-tests-empty">暂无可测试的 active OpenAI 账号。</div>
        <article v-for="row in rows" :key="row.id" class="account-test-row" :data-state="row.state">
          <header>
            <div class="account-test-identity">
              <strong>{{ row.name }}</strong>
              <span>#{{ row.id }} · {{ row.type || 'OpenAI' }}</span>
            </div>
            <div class="account-test-meta">
              <span class="account-test-state"><LoaderCircle v-if="row.state === 'running'" :size="14" class="is-spinning" /><CheckCircle2 v-else-if="row.state === 'success'" :size="14" /><XCircle v-else-if="row.state === 'failed' || row.state === 'cancelled'" :size="14" />{{ stateLabel(row.state) }}</span>
              <span v-if="row.latencyMs != null">{{ row.latencyMs }} ms</span>
            </div>
          </header>
          <p v-if="row.statusText" class="account-test-status">{{ row.statusText }}</p>
          <pre v-if="row.answer" class="account-test-answer">{{ row.answer }}</pre>
          <p v-if="row.error" class="account-test-error">{{ row.error }}</p>
          <p v-if="!row.answer && !row.error && row.state === 'queued'" class="account-test-placeholder">等待开始...</p>
        </article>
      </section>
    </div>
  </AdminAccessGate>
</template>

<style scoped>
.account-tests-controls { margin-top: 24px; padding: 22px; border: 1px solid var(--line); background: var(--surface); }
.account-tests-form { display: grid; gap: 18px; max-width: 860px; }
.account-tests-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
.account-tests-hint { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); font-size: 12px; }
.account-tests-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 1px; margin-top: 18px; border: 1px solid var(--line); background: var(--line); }
.account-tests-summary > div { display: grid; gap: 4px; min-width: 0; padding: 14px 16px; background: var(--surface); }
.account-tests-summary strong { overflow: hidden; color: var(--ink); font-size: 18px; text-overflow: ellipsis; white-space: nowrap; }
.account-tests-summary span { color: var(--muted); font-size: 12px; }
.account-tests-results { display: grid; gap: 12px; margin-top: 18px; }
.account-tests-empty { padding: 28px; border: 1px dashed var(--line); color: var(--muted); text-align: center; }
.account-test-row { min-width: 0; padding: 16px; border: 1px solid var(--line); background: var(--surface); }
.account-test-row[data-state="running"] { border-color: #90b9ad; }
.account-test-row[data-state="success"] { border-color: #9bcdb8; }
.account-test-row[data-state="failed"], .account-test-row[data-state="cancelled"] { border-color: #e1b0a8; }
.account-test-row > header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.account-test-identity { display: grid; gap: 4px; min-width: 0; }
.account-test-identity strong { overflow: hidden; color: var(--ink); text-overflow: ellipsis; white-space: nowrap; }
.account-test-identity span, .account-test-meta { color: var(--muted); font-size: 12px; }
.account-test-meta { display: flex; align-items: center; flex-wrap: wrap; justify-content: flex-end; gap: 10px; }
.account-test-state { display: inline-flex; align-items: center; gap: 5px; color: var(--brand-strong); font-weight: 700; }
.account-test-row[data-state="success"] .account-test-state { color: var(--success); }
.account-test-row[data-state="failed"] .account-test-state, .account-test-row[data-state="cancelled"] .account-test-state { color: #a24b42; }
.account-test-status, .account-test-placeholder { margin: 12px 0 0; color: var(--muted); font-size: 12px; }
.account-test-answer { max-height: 280px; margin: 12px 0 0; padding: 12px; overflow: auto; border: 1px solid var(--line); background: var(--surface-subtle); color: var(--ink); font: inherit; font-size: 13px; line-height: 1.6; white-space: pre-wrap; }
.account-test-error { margin: 12px 0 0; color: #a24b42; font-size: 13px; line-height: 1.5; }
.is-spinning { animation: account-test-spin 1s linear infinite; }
@keyframes account-test-spin { to { transform: rotate(360deg); } }
@media (max-width: 720px) {
  .account-tests-controls { padding: 16px; }
  .account-tests-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .account-test-row > header { display: grid; gap: 10px; }
  .account-test-meta { justify-content: flex-start; }
}
</style>
