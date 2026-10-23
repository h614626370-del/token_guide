<script setup lang="ts">
import { Check, ExternalLink, Mail, Network, Pencil, Plus, RefreshCw, Save, Trash2, X } from 'lucide-vue-next'
import type { ApiSuccess } from '~/types/api'
import { apiErrorMessage } from '~/types/api'
import type { MainSiteUpstreamAccount, UpstreamMonitor } from '~/types/upstreams'

definePageMeta({ layout: 'admin' })
useSeoMeta({ title: '上游管理', robots: 'noindex, nofollow' })

const admin = useAdminSessionState()
const monitors = ref<UpstreamMonitor[]>([])
const accounts = ref<MainSiteUpstreamAccount[]>([])
const loading = ref(false)
const loaded = ref(false)
const saving = ref(false)
const accountsLoading = ref(false)
const checking = ref<number[]>([])
const deleting = ref<number | null>(null)
const confirmDelete = ref<number | null>(null)
const editing = ref(false)
const editingId = ref<number | null>(null)
const keyConfigured = ref(false)
const platform = ref('openai')
const notice = reactive({ type: 'success' as 'success' | 'error', message: '' })
const accountError = ref('')
const form = reactive(emptyForm())
const selectedAccount = computed(() => accounts.value.find(account => account.id === form.account_id))
const counts = computed(() => ({
  total: monitors.value.length,
  active: monitors.value.filter(item => item.enabled).length,
  warning: monitors.value.filter(item => item.enabled && item.balance !== null && (item.balance <= 0 || (item.low_balance_enabled && item.balance <= item.low_balance_threshold))).length,
}))

function emptyForm() {
  return { name: '', source: 'manual' as 'manual' | 'main_site', account_id: null as number | null, base_url: '', api_key: '', enabled: true, low_balance_enabled: true, low_balance_threshold: 10, exhausted_enabled: true, check_interval_minutes: 5 }
}

watch(() => admin.session.value?.admin, authenticated => {
  if (authenticated && !loaded.value) void load()
}, { immediate: true })

let accountRequest = 0
watch([() => form.source, platform], () => {
  accounts.value = []
  if (form.source === 'main_site') void loadAccounts()
  else { accountRequest++; accountError.value = ''; accountsLoading.value = false }
})

async function load() {
  loading.value = true
  try {
    const response = await $fetch<ApiSuccess<UpstreamMonitor[]>>('/api/admin/upstreams')
    monitors.value = response.data
    loaded.value = true
  } catch (error) { showError(error, '上游列表读取失败') }
  finally { loading.value = false }
}

async function loadAccounts() {
  const request = ++accountRequest
  accountsLoading.value = true
  accountError.value = ''
  try {
    const response = await $fetch<ApiSuccess<MainSiteUpstreamAccount[]>>('/api/admin/upstreams/accounts', { query: { platform: platform.value } })
    if (request === accountRequest) accounts.value = response.data
  } catch (error) {
    if (request === accountRequest) accountError.value = apiErrorMessage(error, '主站账号读取失败')
  } finally { if (request === accountRequest) accountsLoading.value = false }
}

function edit(item?: UpstreamMonitor) {
  Object.assign(form, emptyForm(), item ? {
    name: item.name, source: item.source, account_id: item.account_id, base_url: item.base_url,
    enabled: item.enabled, low_balance_enabled: item.low_balance_enabled, low_balance_threshold: item.low_balance_threshold,
    exhausted_enabled: item.exhausted_enabled, check_interval_minutes: item.check_interval_minutes,
  } : {})
  editingId.value = item?.id ?? null
  keyConfigured.value = Boolean(item?.api_key_configured)
  editing.value = true
  confirmDelete.value = null
  notice.message = ''
}

function chooseAccount() {
  if (!form.name && selectedAccount.value) form.name = selectedAccount.value.name
}

async function save() {
  saving.value = true
  notice.message = ''
  try {
    const body = { ...form, account_id: form.source === 'main_site' ? form.account_id : null, api_key: form.api_key || null }
    const response = editingId.value === null
      ? await $fetch<ApiSuccess<UpstreamMonitor>>('/api/admin/upstreams', { method: 'POST', body })
      : await $fetch<ApiSuccess<UpstreamMonitor>>(`/api/admin/upstreams/${editingId.value}`, { method: 'PUT', body })
    editing.value = false
    form.api_key = ''
    replaceMonitor(response.data)
    notice.type = 'success'
    notice.message = '上游已保存。'
    await check(response.data)
  } catch (error) { showError(error, '上游保存失败') }
  finally { saving.value = false }
}

function replaceMonitor(item: UpstreamMonitor) {
  const index = monitors.value.findIndex(row => row.id === item.id)
  if (index < 0) monitors.value.unshift(item)
  else monitors.value[index] = item
}

async function check(item: UpstreamMonitor) {
  if (checking.value.includes(item.id)) return
  checking.value.push(item.id)
  try {
    const response = await $fetch<ApiSuccess<UpstreamMonitor>>(`/api/admin/upstreams/${item.id}/check`, { method: 'POST' })
    replaceMonitor(response.data)
    notice.type = response.data.last_check_status === 'error' ? 'error' : 'success'
    notice.message = response.data.last_error || `已更新「${item.name}」余额。`
  } catch (error) { showError(error, '余额查询失败') }
  finally { checking.value = checking.value.filter(id => id !== item.id) }
}

async function remove(item: UpstreamMonitor) {
  deleting.value = item.id
  try {
    await $fetch(`/api/admin/upstreams/${item.id}`, { method: 'DELETE' })
    monitors.value = monitors.value.filter(row => row.id !== item.id)
    confirmDelete.value = null
    if (editingId.value === item.id) editing.value = false
    notice.type = 'success'
    notice.message = '上游已删除。'
  } catch (error) { showError(error, '上游删除失败') }
  finally { deleting.value = null }
}

function status(item: UpstreamMonitor) {
  if (!item.enabled) return { label: '已暂停', tone: 'muted' }
  if (item.last_check_status === 'error') return { label: '查询失败', tone: 'error' }
  if (item.last_check_status === 'unlimited') return { label: '不限额', tone: 'success' }
  if (item.balance === null) return { label: '待查询', tone: 'muted' }
  if (item.balance <= 0) return { label: '已用完', tone: 'error' }
  if (item.low_balance_enabled && item.balance <= item.low_balance_threshold) return { label: '余额不足', tone: 'warning' }
  return { label: '正常', tone: 'success' }
}

function date(value: string | null) {
  return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '尚未检查'
}

function notification(item: UpstreamMonitor) {
  if (item.notification_status === 'sent') return `已发送${item.last_alert_kind === 'exhausted' ? '用完' : '余额不足'}告警 · ${date(item.last_alert_at)}`
  if (item.notification_status === 'disabled') return '邮件未启用，请前往邮件通知配置'
  if (item.notification_status === 'skipped') return '未配置收件邮箱'
  if (item.notification_status === 'failed') return '邮件发送失败，下次检查将重试'
  return ''
}

function showError(error: unknown, fallback: string) {
  notice.type = 'error'
  notice.message = apiErrorMessage(error, fallback)
}
</script>

<template>
  <AdminAccessGate>
    <div class="admin-page upstream-page">
      <header class="admin-page-heading">
        <span>Upstreams</span><h1>上游管理</h1>
        <p>查询上游账号余额，在余额不足或用完时接收邮件提醒。</p>
        <div class="admin-page-heading__actions">
          <NuxtLink class="secondary-command" to="/admin/email"><Mail :size="16" />告警邮箱</NuxtLink>
          <button class="secondary-command" type="button" :disabled="loading" @click="load"><RefreshCw :size="16" />刷新列表</button>
          <button class="primary-command" type="button" :disabled="saving" @click="edit()"><Plus :size="16" />添加上游</button>
        </div>
      </header>

      <div v-if="notice.message" role="status" :class="['tool-alert', notice.type === 'error' ? 'tool-alert--error' : 'tool-alert--success']">{{ notice.message }}</div>
      <div class="upstream-summary" aria-label="监控概况">
        <span>已配置 <strong>{{ counts.total }}</strong></span><span>监控中 <strong>{{ counts.active }}</strong></span><span>余额待处理 <strong>{{ counts.warning }}</strong></span>
      </div>

      <section v-if="editing" class="admin-section upstream-editor">
        <header><h2>{{ editingId === null ? '添加上游' : '编辑上游' }}</h2><button class="upstream-icon-button" type="button" title="关闭编辑" aria-label="关闭编辑" :disabled="saving" @click="editing = false; form.api_key = ''"><X :size="18" /></button></header>
        <form @submit.prevent="save">
          <fieldset :disabled="saving" class="upstream-fields">
            <label class="form-field"><span>账号来源</span><select v-model="form.source"><option value="manual">手动配置上游</option><option value="main_site">从主站选择三方 API 账号</option></select></label>
            <label class="form-field"><span>上游名称</span><input v-model.trim="form.name" maxlength="120" required placeholder="例如：主力供应商"></label>
            <template v-if="form.source === 'main_site'">
              <label class="form-field"><span>主站账号平台</span><select v-model="platform" @change="form.account_id = null"><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option><option value="gemini">Gemini</option><option value="antigravity">Antigravity</option><option value="grok">Grok</option></select></label>
              <div class="form-field"><label for="upstream-account">主站三方 API 账号</label><div class="upstream-account-select"><select id="upstream-account" v-model="form.account_id" required :disabled="accountsLoading" @change="chooseAccount"><option :value="null">{{ accountsLoading ? '正在读取账号...' : '请选择账号' }}</option><option v-if="form.account_id && !selectedAccount" :value="form.account_id">已选账号 #{{ form.account_id }}（可切换平台查找）</option><option v-for="account in accounts" :key="account.id" :value="account.id">{{ account.name }} · #{{ account.id }} · {{ account.status }}</option></select><button class="upstream-icon-button" type="button" title="刷新主站账号" aria-label="刷新主站账号" :disabled="accountsLoading" @click="loadAccounts"><RefreshCw :size="17" /></button></div><small v-if="accountError" class="upstream-error">{{ accountError }}</small><small v-else-if="!accountsLoading && !accounts.length">该平台暂无三方 API 账号。<NuxtLink to="/admin/pricing">主站接口配置</NuxtLink></small></div>
            </template>
            <label class="form-field"><span>上游地址{{ form.source === 'main_site' ? '（可选覆盖）' : '' }}</span><input v-model.trim="form.base_url" :aria-label="form.source === 'main_site' ? '上游地址（可选覆盖）' : '上游地址'" aria-describedby="upstream-base-hint" type="url" maxlength="1000" :required="form.source === 'manual'" :placeholder="selectedAccount?.base_url || 'https://api.example.com'"><small id="upstream-base-hint">支持根地址或 /v1 地址，余额查询使用 /v1/usage。</small></label>
            <label class="form-field"><span>API Key{{ form.source === 'main_site' ? '（可选补充）' : '' }}</span><input v-model.trim="form.api_key" type="password" maxlength="4096" autocomplete="new-password" :required="form.source === 'manual' && !keyConfigured" :placeholder="keyConfigured ? '已保存，留空保留' : (form.source === 'main_site' ? '自动从主站读取；主站限制读取时在此补充' : '输入上游 API Key')"></label>
            <label class="form-field"><span>检查间隔（分钟）</span><input v-model.number="form.check_interval_minutes" type="number" min="1" max="1440" required></label>
            <label class="form-field"><span>余额告警阈值（上游返回币种）</span><input v-model.number="form.low_balance_threshold" type="number" min="0" max="1000000000000" step="any" required :disabled="!form.low_balance_enabled"></label>
            <div class="upstream-toggles"><label class="check-line"><input v-model="form.enabled" type="checkbox">启用自动监控</label><label class="check-line"><input v-model="form.low_balance_enabled" type="checkbox">余额不足告警</label><label class="check-line"><input v-model="form.exhausted_enabled" type="checkbox">余额用完告警</label></div>
          </fieldset>
          <footer class="upstream-form-actions"><button class="secondary-command" type="button" :disabled="saving" @click="editing = false; form.api_key = ''">取消</button><button class="primary-command" type="submit" :disabled="saving"><Save :size="16" />{{ saving ? '保存中...' : '保存并查询' }}</button></footer>
        </form>
      </section>

      <div v-if="loading && !loaded" class="loading-band">正在读取上游配置...</div>
      <section v-else-if="!monitors.length" class="upstream-empty"><Network :size="28" /><h2>尚未添加上游</h2><p>添加上游地址和 API Key，或选择主站的三方 API 账号。</p><button v-if="!editing" class="primary-command" type="button" @click="edit()"><Plus :size="16" />添加上游</button></section>
      <section v-else class="upstream-list" aria-label="上游账号列表">
        <article v-for="item in monitors" :key="item.id" class="upstream-row">
          <div class="upstream-identity">
            <div class="upstream-name"><h2>{{ item.name }}</h2><span :class="['upstream-status', `upstream-status--${status(item).tone}`]">{{ status(item).label }}</span></div>
            <p>{{ item.source === 'main_site' ? `主站账号 #${item.account_id}` : '手动配置' }}</p>
            <p><a v-if="item.resolved_base_url" class="upstream-link" :href="item.resolved_base_url" target="_blank" rel="noopener noreferrer">{{ item.resolved_base_url }} <ExternalLink :size="12" aria-hidden="true" /></a><span v-else>上游地址暂不可用</span></p>
            <small>每 {{ item.check_interval_minutes }} 分钟检查 · {{ date(item.last_checked_at) }}</small>
          </div>
          <div class="upstream-balance"><strong>{{ item.last_check_status === 'unlimited' ? '不限额' : (item.balance === null ? '—' : item.balance.toLocaleString('zh-CN', { maximumFractionDigits: 6 })) }}</strong><span>{{ item.balance === null ? '当前余额' : item.balance_unit }}<template v-if="item.last_check_status === 'error' && item.balance !== null"> · 上次余额</template></span></div>
          <div class="upstream-rules"><span>{{ item.low_balance_enabled ? `余额 ≤ ${item.low_balance_threshold} 时告警` : '余额不足告警已关闭' }}</span><span>{{ item.exhausted_enabled ? '余额用完时告警' : '余额用完告警已关闭' }}</span><small v-if="notification(item)" :class="{ 'upstream-error': item.notification_status !== 'sent' }">{{ notification(item) }}</small></div>
          <div class="upstream-actions"><button class="secondary-command" type="button" :disabled="checking.includes(item.id) || deleting === item.id || saving" @click="check(item)"><RefreshCw :size="15" :class="{ 'upstream-spinning': checking.includes(item.id) }" />{{ checking.includes(item.id) ? '查询中...' : '查询余额' }}</button><button class="upstream-icon-button" type="button" :title="`编辑 ${item.name}`" :aria-label="`编辑 ${item.name}`" :disabled="saving || checking.includes(item.id)" @click="edit(item)"><Pencil :size="16" /></button><button class="upstream-icon-button upstream-error" type="button" :title="`删除 ${item.name}`" :aria-label="`删除 ${item.name}`" :disabled="deleting === item.id || saving" @click="confirmDelete = item.id"><Trash2 :size="16" /></button></div>
          <p v-if="item.last_error" class="upstream-row-error" role="alert">{{ item.last_error }}</p>
          <div v-if="confirmDelete === item.id" class="upstream-delete-confirm"><span>确定删除「{{ item.name }}」及其监控配置？</span><button class="secondary-command" type="button" :disabled="deleting === item.id" @click="confirmDelete = null"><X :size="15" />取消</button><button class="secondary-command upstream-error" type="button" :disabled="deleting === item.id" @click="remove(item)"><Check :size="15" />确认删除</button></div>
        </article>
      </section>
      <p class="upstream-footnote">告警发送至<NuxtLink to="/admin/email">邮件通知</NuxtLink>中配置的收件邮箱。同一状态发送成功后不重复提醒；余额恢复后可再次触发，余额用完会单独告警。</p>
    </div>
  </AdminAccessGate>
</template>

<style scoped>
.upstream-summary { display: flex; flex-wrap: wrap; gap: 24px; padding: 16px 0; border-block: 1px solid var(--line); color: var(--muted); font-size: 13px; }
.upstream-summary strong { margin-left: 8px; color: var(--ink); font-variant-numeric: tabular-nums; }
.upstream-editor { margin: 20px 0; }
.upstream-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; border: 0; padding: 0; margin: 0; min-width: 0; }
.upstream-toggles { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 20px; }
.upstream-form-actions { display: flex; justify-content: flex-end; gap: 10px; padding-top: 20px; }
.upstream-account-select { display: flex; gap: 8px; min-width: 0; }
.upstream-account-select select { min-width: 0; width: 100%; }
.upstream-empty { display: flex; align-items: center; flex-direction: column; gap: 12px; padding: 50px 20px; text-align: center; color: var(--muted); }
.upstream-empty h2, .upstream-empty p { margin: 0; }
.upstream-empty h2 { font-size: 17px; color: var(--ink); }
.upstream-empty p { font-size: 13px; }
.upstream-row { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(100px, .6fr) minmax(0, 1fr) auto; gap: 20px; padding: 22px 0; border-bottom: 1px solid var(--line); align-items: center; }
.upstream-identity, .upstream-rules { min-width: 0; overflow-wrap: anywhere; }
.upstream-name { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.upstream-name h2 { margin: 0; font-size: 15px; overflow-wrap: anywhere; }
.upstream-identity p { color: var(--muted); font-size: 12px; margin: 8px 0; }
.upstream-link { color: var(--ink); text-decoration: underline; text-underline-offset: 3px; }
.upstream-link:hover, .upstream-link:focus-visible { color: var(--accent); }
.upstream-link svg { display: inline; vertical-align: -2px; }
.upstream-identity small, .upstream-rules small { color: var(--muted); font-size: 11px; }
.upstream-status { padding: 3px 7px; border-radius: 4px; font-size: 11px; white-space: nowrap; }
.upstream-status--success { color: #16704a; background: #edf8f1; }
.upstream-status--warning { color: #8b5c08; background: #fff7df; }
.upstream-status--error { color: #b42318; background: #fff1f0; }
.upstream-status--muted { color: var(--muted); background: var(--surface-subtle); }
.upstream-balance { display: grid; gap: 5px; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.upstream-balance strong { font-size: 20px; color: var(--ink); }
.upstream-balance span { color: var(--muted); font-size: 11px; }
.upstream-rules { display: grid; gap: 7px; color: var(--muted); font-size: 12px; }
.upstream-actions { display: flex; align-items: center; gap: 5px; }
.upstream-icon-button { display: inline-flex; justify-content: center; align-items: center; width: 34px; height: 34px; flex: 0 0 34px; padding: 0; border: 1px solid var(--line); border-radius: 5px; color: var(--muted); background: var(--surface); cursor: pointer; }
.upstream-icon-button:disabled { cursor: default; opacity: .5; }
.upstream-error { color: #b42318 !important; }
.upstream-row-error { grid-column: 1 / -1; margin: 0; color: #b42318; font-size: 12px; overflow-wrap: anywhere; }
.upstream-delete-confirm { grid-column: 1 / -1; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 13px; }
.upstream-footnote { color: var(--muted); font-size: 12px; line-height: 1.8; }
.upstream-footnote a { margin-inline: 4px; }
.upstream-spinning { animation: upstream-spin 1s linear infinite; }
@keyframes upstream-spin { to { transform: rotate(360deg); } }
@media (max-width: 1150px) { .upstream-row { grid-template-columns: minmax(0, 1fr) minmax(100px, .5fr); } .upstream-actions { justify-self: end; } }
@media (max-width: 600px) { .upstream-fields { grid-template-columns: minmax(0, 1fr); } .upstream-row { gap: 16px; } .upstream-summary { gap: 16px; } .upstream-actions { flex-wrap: wrap; } .upstream-balance { text-align: right; } }
@media (prefers-reduced-motion: reduce) { .upstream-spinning { animation: none; } }
</style>
