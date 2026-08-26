<script setup lang="ts">
import { AlertTriangle, CheckCircle2, Clock3, Play, RefreshCw, RotateCcw, Search, ShieldCheck, UserRoundCheck } from 'lucide-vue-next'
import type { ApiSuccess } from '~/types/api'
import { apiErrorMessage } from '~/types/api'
import type { CompensationBatch, CompensationBatchItem, CompensationPreview } from '~/types/admin'

definePageMeta({ layout: 'admin' })
useSeoMeta({ title: '余额补偿', robots: 'noindex, nofollow' })

const admin = useAdminSessionState()
const loading = ref(false)
const testing = ref(false)
const executing = ref(false)
const retrying = ref(false)
const testBatch = ref<CompensationBatch | null>(null)
const preview = ref<CompensationPreview | null>(null)
const batch = ref<CompensationBatch | null>(null)
const history = ref<CompensationBatch[]>([])
const notice = reactive({ type: 'idle' as 'idle' | 'success' | 'error', message: '' })
const form = reactive({
  date: beijingDate(),
  start_time: '12:00',
  end_time: '19:00',
  timezone: 'Asia/Shanghai',
  test_operation: 'add' as 'add' | 'subtract' | 'set',
  test_amount: 5,
  batch_operation: 'add' as 'add' | 'subtract' | 'set',
  batch_amount: 5,
  test_notes: '',
  batch_notes: '',
})
const testTarget = reactive({
  type: 'id' as 'id' | 'account',
  value: '',
})

const testOperationLabel = computed(() => operationText(form.test_operation))
const batchOperationLabel = computed(() => operationText(form.batch_operation))
const testTargetLabel = computed(() => testTarget.type === 'id' ? '用户 ID' : '账号')
const batchAmountValid = computed(() => Number.isFinite(Number(form.batch_amount)) && Number(form.batch_amount) > 0)
const previewMatchesDraft = computed(() => {
  const value = preview.value
  if (!value) return false
  return value.date === form.date
    && value.start_time === form.start_time
    && value.end_time === form.end_time
    && value.timezone === form.timezone
    && value.operation === form.batch_operation
    && Number(value.amount) === Number(form.batch_amount)
})
const canExecute = computed(() => Boolean(
  preview.value
  && previewMatchesDraft.value
  && batchAmountValid.value
  && form.batch_notes.trim()
  && !batch.value
  && !loading.value
  && !executing.value,
))
const testFailedCount = computed(() => testBatch.value?.items?.filter(item => item.status === 'failed').length || 0)
const failedCount = computed(() => batch.value?.items?.filter(item => item.status === 'failed').length || 0)
const executionKey = ref('')
const executionFingerprint = ref('')

watch(() => admin.session.value?.admin, (authenticated) => {
  if (authenticated) void loadHistory()
}, { immediate: true })

async function loadHistory() {
  try {
    const response = await $fetch<ApiSuccess<{ items: CompensationBatch[] }>>('/api/admin/compensation', { query: { page: 1, page_size: 20 } })
    history.value = response.data.items
  } catch {
    history.value = []
  }
}

async function runPreview() {
  if (!batchAmountValid.value) return
  const previousPreview = preview.value
  loading.value = true
  batch.value = null
  notice.type = 'idle'
  notice.message = ''
  try {
    const response = await $fetch<ApiSuccess<CompensationPreview>>('/api/admin/compensation/preview', {
      method: 'POST',
      body: previewPayload(),
    })
    preview.value = response.data
    form.batch_operation = response.data.operation
    form.batch_amount = response.data.amount
    syncExecutionIntent(response.data.fingerprint)
    notice.type = 'success'
    notice.message = `预览完成：${response.data.summary.user_count} 个用户，预计${operationText(response.data.operation)} ${money(response.data.summary.total_amount)}。`
  } catch (cause) {
    if (!previousPreview) preview.value = null
    notice.type = 'error'
    notice.message = apiErrorMessage(cause, '活跃用户统计失败')
  } finally {
    loading.value = false
  }
}

async function runSingleTest() {
  const target = testTarget.value.trim()
  if (!target || !form.test_notes.trim()) return
  if (!window.confirm(`确认对${testTargetLabel.value}“${target}”执行${testOperationLabel.value} ${money(form.test_amount)}？此操作会真实修改上游余额。`)) return
  testing.value = true
  testBatch.value = null
  notice.type = 'idle'
  notice.message = ''
  try {
    const response = await $fetch<ApiSuccess<CompensationBatch>>('/api/admin/compensation/test', {
      method: 'POST',
      body: {
        target_type: testTarget.type,
        target,
        operation: form.test_operation,
        amount: Number(form.test_amount),
        notes: form.test_notes.trim(),
      },
    })
    testBatch.value = response.data
    await loadHistory()
    notice.type = response.data.status === 'completed' ? 'success' : 'error'
    notice.message = singleTestMessage(response.data)
  } catch (cause) {
    notice.type = 'error'
    notice.message = apiErrorMessage(cause, '单用户测试失败')
  } finally {
    testing.value = false
  }
}

async function retrySingleTest() {
  if (!testBatch.value || testFailedCount.value === 0) return
  if (!window.confirm('确认重试这次单用户余额调整？')) return
  retrying.value = true
  try {
    const response = await $fetch<ApiSuccess<CompensationBatch>>(`/api/admin/compensation/${testBatch.value.id}/retry`, {
      method: 'POST',
      body: { notes: form.test_notes.trim() || undefined },
    })
    testBatch.value = response.data
    await loadHistory()
    notice.type = response.data.status === 'completed' ? 'success' : 'error'
    notice.message = singleTestMessage(response.data)
  } catch (cause) {
    notice.type = 'error'
    notice.message = apiErrorMessage(cause, '单用户测试重试失败')
  } finally {
    retrying.value = false
  }
}

async function executeCompensation() {
  if (!preview.value || !form.batch_notes.trim()) return
  if (!previewMatchesDraft.value) {
    notice.type = 'error'
    notice.message = '批量参数已修改，请先更新预览再执行。'
    return
  }
  const confirmedPreview = preview.value
  const confirmedNotes = form.batch_notes.trim()
  if (!window.confirm(`确认向 ${confirmedPreview.summary.user_count} 个用户执行${operationText(confirmedPreview.operation)}，每人 ${money(confirmedPreview.amount)}，预计总额 ${money(confirmedPreview.summary.total_amount)}？\n批量备注：${confirmedNotes}\n此操作会真实修改上游余额。`)) return
  const intentKey = ensureExecutionKey(confirmedPreview.fingerprint)
  executing.value = true
  notice.type = 'idle'
  notice.message = ''
  try {
    const response = await $fetch<ApiSuccess<CompensationBatch>>('/api/admin/compensation/execute', {
      method: 'POST',
      body: {
        date: confirmedPreview.date,
        start_time: confirmedPreview.start_time,
        end_time: confirmedPreview.end_time,
        timezone: confirmedPreview.timezone,
        operation: confirmedPreview.operation,
        amount: confirmedPreview.amount,
        notes: confirmedNotes,
        preview_fingerprint: confirmedPreview.fingerprint,
        execution_key: intentKey,
      },
    })
    batch.value = response.data
    await loadHistory()
    notice.type = response.data.status === 'completed' ? 'success' : 'error'
    notice.message = batchMessage(response.data)
  } catch (cause) {
    notice.type = 'error'
    notice.message = apiErrorMessage(cause, '余额补偿执行失败')
  } finally {
    executing.value = false
  }
}

async function retryFailed() {
  if (!batch.value || failedCount.value === 0) return
  if (!window.confirm(`确认重试 ${failedCount.value} 条失败的余额调整？`)) return
  retrying.value = true
  try {
    const response = await $fetch<ApiSuccess<CompensationBatch>>(`/api/admin/compensation/${batch.value.id}/retry`, {
      method: 'POST',
      body: { notes: form.batch_notes.trim() || undefined },
    })
    batch.value = response.data
    await loadHistory()
    notice.type = response.data.status === 'completed' ? 'success' : 'error'
    notice.message = batchMessage(response.data)
  } catch (cause) {
    notice.type = 'error'
    notice.message = apiErrorMessage(cause, '失败项目重试失败')
  } finally {
    retrying.value = false
  }
}

function previewPayload() {
  return {
    date: form.date,
    start_time: form.start_time,
    end_time: form.end_time,
    timezone: form.timezone,
    operation: form.batch_operation,
    amount: Number(form.batch_amount),
  }
}

function syncExecutionIntent(fingerprint: string) {
  if (executionFingerprint.value === fingerprint) return
  executionFingerprint.value = fingerprint
  executionKey.value = ''
}

function ensureExecutionKey(fingerprint: string) {
  syncExecutionIntent(fingerprint)
  if (!executionKey.value) executionKey.value = crypto.randomUUID()
  return executionKey.value
}

function batchMessage(value: CompensationBatch) {
  const succeeded = (value.items || []).filter(item => item.status === 'succeeded').length
  const failed = (value.items || []).filter(item => item.status === 'failed').length
  return `批次 ${value.id.slice(0, 8)}：成功 ${succeeded} 条，失败 ${failed} 条。`
}

function singleTestMessage(value: CompensationBatch) {
  const item = value.items?.[0]
  if (!item) return `单用户测试批次 ${value.id.slice(0, 8)} 未返回执行结果。`
  return item.status === 'succeeded'
    ? `单用户测试成功：用户 ${item.user_id} 已完成${operationText(value.operation)} ${money(value.amount)}${item.balance_after == null ? '。' : `，调整后余额 ${money(item.balance_after)}。`}`
    : `单用户测试未成功：${item.error_message || '上游未返回具体原因。'}`
}

function selectTestTargetType(type: 'id' | 'account') {
  if (testTarget.type === type) return
  testTarget.type = type
  testTarget.value = ''
  testBatch.value = null
}

function operationText(operation: CompensationBatch['operation']) {
  return { add: '增加余额', subtract: '扣减余额', set: '设置余额' }[operation]
}

function userLabel(user: CompensationPreview['users'][number]) {
  return user.email || user.username || `用户 ${user.id}`
}

function accountLabel(value: { email: string | null, username: string | null }) {
  return [value.email, value.username].filter(Boolean).join(' / ') || '-'
}

function statusLabel(status: CompensationBatchItem['status']) {
  const labels: Record<CompensationBatchItem['status'], string> = { pending: '待处理', running: '处理中', succeeded: '成功', failed: '失败' }
  return labels[status]
}

function money(value: number) {
  return `¥${Number(value || 0).toFixed(2)}`
}

function beijingDate() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date())
}
</script>

<template>
  <AdminAccessGate>
    <div class="admin-page compensation-page">
      <header class="admin-page-heading">
        <span>Compensation</span>
        <h1>余额补偿</h1>
        <p>先用指定账号验证余额调整，再按时间范围预览实际活跃用户并批量执行。</p>
      </header>

      <div v-if="notice.message" :class="['tool-alert', notice.type === 'error' ? 'tool-alert--error' : 'tool-alert--success']">{{ notice.message }}</div>

      <section class="compensation-panel">
        <header class="admin-section__heading">
          <div><span>Step 1</span><h2>单用户测试</h2><p>按用户 ID、邮箱或用户名验证一次实际调整；测试参数不会带入后续批量执行。</p></div>
          <UserRoundCheck :size="22" />
        </header>
        <p class="compensation-real-action-warning"><AlertTriangle :size="16" /><span>单用户测试会立即真实修改该账号的上游余额，并写入补偿批次记录。</span></p>
        <form class="compensation-form compensation-test-form" @submit.prevent="runSingleTest">
          <fieldset class="compensation-target-type">
            <legend>查找方式</legend>
            <div>
              <button type="button" :class="{ active: testTarget.type === 'id' }" :aria-pressed="testTarget.type === 'id'" @click="selectTestTargetType('id')">用户 ID</button>
              <button type="button" :class="{ active: testTarget.type === 'account' }" :aria-pressed="testTarget.type === 'account'" @click="selectTestTargetType('account')">邮箱 / 用户名</button>
            </div>
          </fieldset>
          <label class="compensation-test-target"><span>{{ testTargetLabel }}</span><input v-model.trim="testTarget.value" :type="testTarget.type === 'id' ? 'number' : 'text'" :inputmode="testTarget.type === 'id' ? 'numeric' : 'text'" :min="testTarget.type === 'id' ? 1 : undefined" maxlength="320" required :placeholder="testTarget.type === 'id' ? '例如：1024' : 'name@example.com 或 username'"></label>
          <label><span>测试调整方式</span><select v-model="form.test_operation"><option value="add">增加余额</option><option value="subtract">扣减余额</option><option value="set">设置余额</option></select></label>
          <label><span>测试金额</span><input v-model.number="form.test_amount" type="number" min="0.01" step="0.01" required></label>
          <label class="compensation-form__notes"><span>测试备注</span><input v-model.trim="form.test_notes" type="text" maxlength="500" placeholder="单用户测试时必填，例如：故障补偿测试"></label>
          <button class="primary-command" type="submit" :disabled="testing || !testTarget.value.trim() || !form.test_notes.trim()"><Play :size="16" :class="{ spinning: testing }" />{{ testing ? '测试中...' : '执行单用户测试' }}</button>
        </form>
        <div v-if="testBatch" class="compensation-test-result" aria-live="polite">
          <div class="compensation-test-result__heading">
            <div><strong>最近一次测试</strong><span>批次 {{ testBatch.id }}</span></div>
            <button v-if="testFailedCount" class="secondary-command" type="button" :disabled="retrying" @click="retrySingleTest"><RotateCcw :size="15" :class="{ spinning: retrying }" />{{ retrying ? '重试中...' : '重试测试' }}</button>
          </div>
          <table class="compensation-table">
            <thead><tr><th>用户 ID</th><th>用户</th><th>状态</th><th>调整后余额</th><th>错误</th></tr></thead>
            <tbody><tr v-for="item in testBatch.items || []" :key="item.id"><td>{{ item.user_id }}</td><td>{{ accountLabel(item) }}</td><td>{{ statusLabel(item.status) }}</td><td>{{ item.balance_after == null ? '-' : money(item.balance_after) }}</td><td>{{ item.error_message || '-' }}</td></tr></tbody>
          </table>
        </div>
      </section>

      <section class="compensation-panel">
        <header class="admin-section__heading">
          <div><span>Step 2</span><h2>批量统计条件</h2><p>选择活跃用户时间窗口并生成初始预览；统计使用记录，不读取 24 小时汇总，时间范围采用左闭右开。</p></div>
          <Clock3 :size="22" />
        </header>
        <form class="compensation-form compensation-window-form" @submit.prevent="runPreview">
          <label><span>日期</span><input v-model="form.date" type="date" required :disabled="loading || executing"></label>
          <label><span>开始时间</span><input v-model="form.start_time" type="time" required :disabled="loading || executing"></label>
          <label><span>结束时间</span><input v-model="form.end_time" type="time" required :disabled="loading || executing"></label>
          <label><span>时区</span><input v-model.trim="form.timezone" type="text" required :disabled="loading || executing"></label>
          <button class="primary-command" type="submit" :disabled="loading || executing"><Search :size="16" :class="{ spinning: loading }" />{{ loading ? '统计中...' : '预览活跃用户' }}</button>
        </form>
      </section>

      <section v-if="preview" class="compensation-panel">
        <header class="admin-section__heading">
          <div><span>Step 3</span><h2>预览结果</h2><p>{{ preview.date }} {{ preview.start_time }}–{{ preview.end_time }} · {{ preview.timezone }} · {{ operationText(preview.operation) }} {{ money(preview.amount) }}/人 · 已按 user_id 去重</p></div>
          <ShieldCheck :size="22" />
        </header>
        <div class="compensation-metrics">
          <article><span>活跃用户</span><strong>{{ preview.summary.user_count }}</strong></article>
          <article><span>窗口内记录</span><strong>{{ preview.source.records_in_window }}</strong></article>
          <article><span>预计金额</span><strong :class="{ 'is-stale': !previewMatchesDraft }">{{ previewMatchesDraft ? money(preview.summary.total_amount) : '待更新' }}</strong></article>
          <article><span>已删除用户</span><strong>{{ preview.source.excluded_users }}</strong></article>
          <article><span>无法解析</span><strong>{{ preview.source.unresolved_users }}</strong></article>
        </div>
        <form class="compensation-form compensation-execution-form" @submit.prevent="executeCompensation">
          <label><span>批量调整方式</span><select v-model="form.batch_operation" :disabled="loading || executing || Boolean(batch)"><option value="add">增加余额</option><option value="subtract">扣减余额</option><option value="set">设置余额</option></select></label>
          <label><span>每人金额</span><input v-model.number="form.batch_amount" type="number" min="0.01" step="0.01" required :disabled="loading || executing || Boolean(batch)"></label>
          <label class="compensation-form__notes"><span>批量备注</span><input v-model.trim="form.batch_notes" type="text" maxlength="500" required :disabled="executing || Boolean(batch)" placeholder="批量执行时必填，例如：主站故障补偿"></label>
          <div class="compensation-execution-actions">
            <button class="secondary-command" type="button" :disabled="loading || executing || !batchAmountValid || Boolean(batch)" @click="runPreview"><RefreshCw :size="16" :class="{ spinning: loading }" />{{ loading ? '更新中...' : '更新预览' }}</button>
            <button class="primary-command" type="submit" :disabled="!canExecute"><Play :size="16" />{{ executing ? '执行中...' : `执行${batchOperationLabel}` }}</button>
          </div>
        </form>
        <span v-if="!previewMatchesDraft" class="compensation-hint compensation-hint--warning">批量参数已修改，请更新预览后再执行。</span>
        <span v-else-if="!form.batch_notes.trim()" class="compensation-hint">执行前请填写批量备注。</span>
        <div class="compensation-table-wrap">
          <table class="compensation-table">
            <thead><tr><th>用户 ID</th><th>用户</th><th>状态</th></tr></thead>
            <tbody><tr v-for="user in preview.users" :key="user.id"><td>{{ user.id }}</td><td>{{ userLabel(user) }}</td><td>{{ user.status || 'active' }}</td></tr></tbody>
          </table>
        </div>
      </section>

      <section v-if="batch" class="compensation-panel">
        <header class="admin-section__heading">
          <div><span>Step 4</span><h2>调整记录</h2><p>批次 {{ batch.id }} · {{ batch.notes }}</p></div>
          <component :is="batch.status === 'completed' ? CheckCircle2 : AlertTriangle" :size="22" />
        </header>
        <div class="compensation-actions">
          <span class="compensation-status">{{ batchMessage(batch) }}</span>
          <button v-if="failedCount" class="secondary-command" type="button" :disabled="retrying" @click="retryFailed"><RotateCcw :size="16" :class="{ spinning: retrying }" />重试失败项</button>
        </div>
        <div class="compensation-table-wrap">
          <table class="compensation-table">
            <thead><tr><th>用户 ID</th><th>用户</th><th>状态</th><th>调整后余额</th><th>错误</th></tr></thead>
          <tbody><tr v-for="item in batch.items || []" :key="item.id"><td>{{ item.user_id }}</td><td>{{ accountLabel(item) }}</td><td>{{ statusLabel(item.status) }}</td><td>{{ item.balance_after == null ? '-' : money(item.balance_after) }}</td><td>{{ item.error_message || '-' }}</td></tr></tbody>
        </table>
      </div>
      </section>

      <section class="compensation-panel">
        <header class="admin-section__heading">
          <div><span>History</span><h2>补偿批次记录</h2><p>这里记录本指南后台发起的批次；具体用户结果见批次详情。</p></div>
          <RefreshCw :size="22" />
        </header>
        <div v-if="!history.length" class="compensation-empty">暂无补偿批次记录。</div>
        <div v-else class="compensation-history">
          <div v-for="item in history" :key="item.id" class="compensation-history__row">
            <div><strong>{{ item.mode === 'single' ? `单用户测试 · ${operationText(item.operation)} ${money(item.amount)}` : `${item.date} ${item.start_time}–${item.end_time}` }}</strong><span>{{ item.id }}</span></div>
            <span>{{ item.user_count }} 人 · {{ money(item.total_amount) }}</span>
            <span :class="`compensation-history__status compensation-history__status--${item.status}`">{{ item.status }}</span>
          </div>
        </div>
      </section>
    </div>
  </AdminAccessGate>
</template>

<style scoped>
.compensation-page { display: grid; min-width: 0; gap: 18px; }
.compensation-panel { min-width: 0; padding: 20px; border: 1px solid var(--line); border-radius: 7px; background: var(--surface); }
.admin-section__heading > svg { flex: 0 0 auto; color: var(--success); }
.compensation-form { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 14px; margin-top: 22px; }
.compensation-form label { display: grid; gap: 7px; min-width: 0; }
.compensation-form label > span, .compensation-target-type legend { color: var(--muted); font-size: 12px; font-weight: 700; }
.compensation-form input, .compensation-form select { width: 100%; min-height: 40px; padding: 0 10px; border: 1px solid var(--line); border-radius: 6px; color: var(--ink); background: #fff; }
.compensation-form input:focus, .compensation-form select:focus { border-color: var(--success); outline: 2px solid rgba(8, 118, 90, .12); }
.compensation-form > button { align-self: end; }
.compensation-real-action-warning { display: flex; align-items: center; gap: 8px; margin: 16px 0 -6px; padding: 10px 12px; border: 1px solid #e3c89f; border-radius: 6px; color: #74521d; background: #fff8eb; font-size: 12px; line-height: 1.5; }
.compensation-real-action-warning svg { flex: 0 0 auto; }
.compensation-test-form { grid-template-columns: minmax(190px, 1.15fr) minmax(190px, 1.35fr) repeat(2, minmax(130px, .8fr)); }
.compensation-target-type { display: grid; gap: 7px; min-width: 0; margin: 0; padding: 0; border: 0; }
.compensation-target-type legend { margin-bottom: 7px; padding: 0; }
.compensation-target-type > div { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); min-height: 40px; padding: 3px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface-subtle); }
.compensation-target-type button { min-width: 0; border: 0; border-radius: 4px; color: var(--muted); background: transparent; cursor: pointer; font-size: 12px; font-weight: 700; }
.compensation-target-type button:hover { color: var(--ink-soft); }
.compensation-target-type button:focus-visible { outline: 2px solid rgba(8, 118, 90, .25); outline-offset: 1px; }
.compensation-target-type button.active { color: var(--success); background: #fff; box-shadow: 0 1px 3px rgba(18, 54, 45, .12); }
.compensation-test-form .compensation-form__notes { grid-column: span 3; }
.compensation-test-result { display: grid; min-width: 0; max-width: 100%; gap: 11px; margin-top: 18px; overflow: auto; border: 1px solid var(--soft-line); border-radius: 6px; }
.compensation-test-result__heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 11px 12px 0; }
.compensation-test-result__heading > div { display: grid; min-width: 0; gap: 3px; }
.compensation-test-result__heading strong { color: var(--ink-soft); font-size: 13px; }
.compensation-test-result__heading span { overflow: hidden; color: var(--muted); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.compensation-test-result__heading button { flex: 0 0 auto; min-height: 34px; }
.compensation-test-result .compensation-table { min-width: 620px; }
.compensation-window-form { grid-template-columns: repeat(4, minmax(130px, 1fr)) auto; }
.compensation-metrics { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin-top: 20px; }
.compensation-metrics article { display: grid; gap: 6px; padding: 15px; border: 1px solid var(--line); border-radius: 6px; background: var(--surface-subtle); }
.compensation-metrics span { color: var(--muted); font-size: 12px; }
.compensation-metrics strong { color: var(--ink); font-size: 24px; line-height: 1; }
.compensation-metrics strong.is-stale { color: var(--muted); font-size: 15px; }
.compensation-execution-form { grid-template-columns: minmax(160px, .75fr) minmax(140px, .6fr) minmax(260px, 2fr); margin-top: 18px; }
.compensation-execution-form .compensation-form__notes { grid-column: auto; }
.compensation-execution-actions { display: flex; grid-column: 1 / -1; justify-content: flex-end; gap: 10px; }
.compensation-execution-actions button { min-height: 40px; }
.compensation-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-top: 18px; }
.compensation-hint { display: block; margin-top: 7px; color: var(--muted); font-size: 12px; }
.compensation-hint--warning { color: #74521d; }
.compensation-status { color: var(--ink-soft); font-size: 13px; font-weight: 700; }
.compensation-empty { margin-top: 18px; color: var(--muted); font-size: 13px; }
.compensation-history { display: grid; margin-top: 18px; border: 1px solid var(--soft-line); border-radius: 6px; overflow: hidden; }
.compensation-history__row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 16px; padding: 11px 13px; border-bottom: 1px solid var(--soft-line); font-size: 12px; }
.compensation-history__row:last-child { border-bottom: 0; }
.compensation-history__row > div { display: grid; gap: 3px; min-width: 0; }
.compensation-history__row strong { color: var(--ink-soft); font-size: 13px; }
.compensation-history__row span { color: var(--muted); }
.compensation-history__status { font-weight: 750; text-transform: uppercase; }
.compensation-history__status--completed { color: var(--success) !important; }
.compensation-history__status--partial, .compensation-history__status--failed { color: var(--danger) !important; }
.compensation-table-wrap { min-width: 0; max-width: 100%; margin-top: 18px; overflow: auto; border: 1px solid var(--soft-line); border-radius: 6px; }
.compensation-table { width: 100%; min-width: 620px; border-collapse: collapse; font-size: 12px; }
.compensation-table th, .compensation-table td { padding: 10px 12px; border-bottom: 1px solid var(--soft-line); text-align: left; }
.compensation-table th { color: var(--muted); background: var(--surface-subtle); font-size: 11px; font-weight: 750; }
.compensation-table td { color: var(--ink-soft); }
.compensation-table tr:last-child td { border-bottom: 0; }
@media (max-width: 900px) {
  .compensation-form { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .compensation-test-form .compensation-form__notes { grid-column: span 2; }
  .compensation-execution-form .compensation-form__notes { grid-column: span 2; }
  .compensation-execution-actions { grid-column: span 2; }
  .compensation-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 560px) {
  .compensation-panel { padding: 15px; }
  .compensation-form { grid-template-columns: 1fr; }
  .compensation-test-form .compensation-form__notes { grid-column: auto; }
  .compensation-execution-form .compensation-form__notes, .compensation-execution-actions { grid-column: auto; }
  .compensation-execution-actions { display: grid; grid-template-columns: 1fr; }
  .compensation-execution-actions button { width: 100%; }
  .compensation-form > button { width: 100%; }
  .compensation-test-result__heading { align-items: flex-start; flex-direction: column; }
  .compensation-history__row { grid-template-columns: 1fr; gap: 5px; }
}
</style>
