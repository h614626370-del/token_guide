<script setup lang="ts">
import { RefreshCw, Save, Search } from 'lucide-vue-next'
import type { ApiSuccess } from '~/types/api'
import { apiErrorMessage } from '~/types/api'
import type {
  AdminPricingConfig,
  AdminPricingSource,
  GroupDraft,
  GroupSetting,
  ModelDraft,
  ModelSetting,
  RuntimeSettings,
} from '~/types/admin'

definePageMeta({ layout: 'admin' })
useSeoMeta({ title: '价格配置', robots: 'noindex, nofollow' })

const providers = [
  ['openai', 'OpenAI'],
  ['anthropic', 'Anthropic'],
  ['gemini', 'Gemini'],
  ['antigravity', 'Antigravity'],
  ['grok', 'Grok'],
] as const

const activeTab = ref<'source' | 'models' | 'groups'>('source')
const admin = useAdminSessionState()
const site = useSiteConfigState()
const loading = ref(false)
const saving = ref(false)
const loaded = ref(false)
const query = ref('')
const providerFilter = ref('all')
const config = ref<AdminPricingConfig | null>(null)
const source = ref<AdminPricingSource | null>(null)
const models = ref<ModelDraft[]>([])
const groups = ref<GroupDraft[]>([])
const notice = reactive({ type: 'idle' as 'idle' | 'success' | 'error', message: '' })
const settings = reactive({
  sub2api_base_url: site.value.main_site_url,
  sub2api_admin_api_key: '',
  clear_sub2api_admin_api_key: false,
  sub2api_admin_api_key_configured: false,
  sub2api_admin_api_key_masked: '',
  pricing_platforms: ['openai', 'anthropic'],
  provider_display_order: ['openai', 'anthropic'],
  usd_to_cny: 6.8102,
})

const filteredModels = computed(() => models.value.filter((item) => matches(item.provider, [item.model_name, item.display_name, item.note])))
const filteredGroups = computed(() => groups.value.filter((item) => matches(item.provider, [item.source_name || '', item.display_name, item.note, item.source_id, ...item.model_names])))
const sourceSummary = computed(() => {
  if (!source.value?.snapshot_available) return '来源尚未手动刷新'
  const count = Object.values(source.value.models_by_provider).reduce((sum, items) => sum + items.length, 0)
  return `${count} 个模型，${source.value.groups.length} 个分组`
})

watch(() => admin.session.value?.admin, (authenticated) => {
  if (authenticated && !loaded.value) void loadAll(false)
}, { immediate: true })

async function loadAll(refresh: boolean) {
  loading.value = true
  notice.type = 'idle'
  notice.message = ''
  try {
    const configResponse = await $fetch<ApiSuccess<AdminPricingConfig>>('/api/admin/pricing/config')
    config.value = configResponse.data
    applySettings(config.value.settings)
    try {
      const sourceResponse = await $fetch<ApiSuccess<AdminPricingSource>>('/api/admin/pricing/source', { query: { refresh } })
      source.value = sourceResponse.data
    } catch (cause) {
      source.value = null
      notice.type = 'error'
      notice.message = apiErrorMessage(cause, '来源数据读取失败')
    }
    rebuildDrafts()
    loaded.value = true
  } catch (cause) {
    notice.type = 'error'
    notice.message = apiErrorMessage(cause, '价格配置读取失败')
  } finally {
    loading.value = false
  }
}

function applySettings(value: RuntimeSettings) {
  settings.sub2api_base_url = value.sub2api_base_url || site.value.main_site_url
  settings.sub2api_admin_api_key = ''
  settings.clear_sub2api_admin_api_key = false
  settings.sub2api_admin_api_key_configured = Boolean(value.sub2api_admin_api_key_configured)
  settings.sub2api_admin_api_key_masked = value.sub2api_admin_api_key_masked || ''
  settings.pricing_platforms = value.pricing_platforms?.length ? [...value.pricing_platforms] : ['openai', 'anthropic']
  settings.provider_display_order = value.provider_display_order?.length ? [...value.provider_display_order] : [...settings.pricing_platforms]
  settings.usd_to_cny = Number(value.usd_to_cny || 6.8102)
}

function rebuildDrafts() {
  const modelSettings = new Map((config.value?.models || []).map(item => [`${item.provider}:${item.model_name}`, item]))
  const modelKeys = new Set(modelSettings.keys())
  for (const [provider, names] of Object.entries(source.value?.models_by_provider || {})) {
    for (const name of names) modelKeys.add(`${provider}:${name}`)
  }
  models.value = [...modelKeys].map((key) => {
    const parts = key.split(':')
    const provider = parts.shift() || ''
    const modelName = parts.join(':')
    const item = modelSettings.get(key)
    return {
      key,
      id: item?.id,
      provider,
      model_name: modelName,
      display_name: item?.display_name || '',
      is_visible: Boolean(item?.is_visible),
      is_featured: Boolean(item?.is_featured),
      sort_order: Number(item?.sort_order ?? 1000),
      note: item?.note || '',
      source_available: Boolean(source.value?.models_by_provider?.[provider]?.includes(modelName)),
      first_seen_at: source.value?.model_first_seen_by_provider?.[provider]?.[modelName] || null,
    }
  }).sort(compareModelDiscovery)

  const groupSettings = new Map((config.value?.groups || []).map(item => [`${item.provider}:${item.source_id}`, item]))
  const sourceGroups = new Map((source.value?.groups || []).map(item => [`${item.provider}:${item.source_id}`, item]))
  const groupKeys = new Set([...groupSettings.keys(), ...sourceGroups.keys()])
  groups.value = [...groupKeys].map((key) => {
    const parts = key.split(':')
    const provider = parts.shift() || ''
    const sourceId = parts.join(':')
    const item = groupSettings.get(key)
    const upstream = sourceGroups.get(key)
    const displayName = item?.display_name && item.display_name !== item.source_name ? item.display_name : ''
    const pay = item?.recharge_pay_cny ?? upstream?.recharge_reference?.pay_cny ?? null
    const credit = item?.recharge_credit_usd ?? upstream?.recharge_reference?.credit_usd ?? null
    return {
      key,
      id: item?.id,
      provider,
      source_id: sourceId,
      source_name: upstream?.source_name || item?.source_name || sourceId,
      display_name: displayName,
      is_visible: item?.is_visible == null ? Boolean(upstream && !upstream.is_exclusive) : Boolean(item.is_visible),
      recharge_multiplier: Number(item?.recharge_multiplier || (pay && credit ? credit / pay : 1)),
      recharge_pay_cny: pay,
      recharge_credit_usd: credit,
      sort_order: Number(item?.sort_order ?? upstream?.sort_order ?? 1000),
      note: item?.note || '',
      source_available: Boolean(upstream),
      provider_label: upstream?.provider_label || providerLabel(provider),
      rate_multiplier: Number(upstream?.rate_multiplier || 1),
      model_list_enabled: Boolean(upstream?.model_list_enabled),
      model_names: upstream?.model_list_enabled ? [...upstream.model_names] : [],
    }
  }).sort((a, b) => providerRank(a.provider) - providerRank(b.provider) || a.sort_order - b.sort_order || String(a.source_name).localeCompare(String(b.source_name), 'zh-CN', { numeric: true }))
}

async function saveSettings() {
  saving.value = true
  notice.type = 'idle'
  try {
    const payload: Record<string, unknown> = {
      sub2api_base_url: settings.sub2api_base_url,
      pricing_platforms: settings.pricing_platforms,
      provider_display_order: orderedProviders(),
      usd_to_cny: Number(settings.usd_to_cny),
      clear_sub2api_admin_api_key: settings.clear_sub2api_admin_api_key,
    }
    if (settings.sub2api_admin_api_key.trim()) payload.sub2api_admin_api_key = settings.sub2api_admin_api_key.trim()
    const response = await $fetch<ApiSuccess<RuntimeSettings>>('/api/admin/pricing/settings', { method: 'PUT', body: payload })
    applySettings(response.data)
    notice.type = 'success'
    notice.message = '数据源配置已保存。'
    await loadAll(true)
  } catch (cause) {
    notice.type = 'error'
    notice.message = apiErrorMessage(cause, '数据源配置保存失败')
  } finally {
    saving.value = false
  }
}

async function saveModels() {
  if (!models.value.length) return
  saving.value = true
  try {
    const items = models.value.map(modelPayload)
    const response = await $fetch<ApiSuccess<ModelSetting[]>>('/api/admin/pricing/models/bulk', { method: 'PUT', body: { items } })
    mergeSavedModels(response.data)
    notice.type = 'success'
    notice.message = `已保存 ${response.data.length} 个模型。`
  } catch (cause) {
    notice.type = 'error'
    notice.message = apiErrorMessage(cause, '模型配置保存失败')
  } finally {
    saving.value = false
  }
}

async function saveGroups() {
  if (!groups.value.length) return
  saving.value = true
  try {
    const items = groups.value.map(groupPayload)
    const response = await $fetch<ApiSuccess<GroupSetting[]>>('/api/admin/pricing/groups/bulk', { method: 'PUT', body: { items } })
    mergeSavedGroups(response.data)
    notice.type = 'success'
    notice.message = `已保存 ${response.data.length} 个分组。`
  } catch (cause) {
    notice.type = 'error'
    notice.message = apiErrorMessage(cause, '分组配置保存失败')
  } finally {
    saving.value = false
  }
}

function modelPayload(item: ModelDraft) {
  return {
    provider: item.provider,
    model_name: item.model_name,
    display_name: empty(item.display_name),
    is_visible: Boolean(item.is_visible),
    is_featured: Boolean(item.is_featured),
    sort_order: integer(item.sort_order, 1000),
    note: empty(item.note),
  }
}

function groupPayload(item: GroupDraft) {
  const pay = positive(item.recharge_pay_cny)
  const credit = positive(item.recharge_credit_usd)
  return {
    provider: item.provider,
    source_id: item.source_id,
    source_name: empty(item.source_name || ''),
    display_name: empty(item.display_name),
    is_visible: Boolean(item.is_visible),
    recharge_multiplier: pay && credit ? credit / pay : positive(item.recharge_multiplier) || 1,
    recharge_pay_cny: pay,
    recharge_credit_usd: credit,
    sort_order: integer(item.sort_order, 1000),
    note: empty(item.note),
  }
}

function mergeSavedModels(saved: ModelSetting[]) {
  const values = new Map(saved.map(item => [`${item.provider}:${item.model_name}`, item]))
  for (const draft of models.value) {
    const item = values.get(draft.key)
    if (item) draft.id = item.id
  }
}

function mergeSavedGroups(saved: GroupSetting[]) {
  const values = new Map(saved.map(item => [`${item.provider}:${item.source_id}`, item]))
  for (const draft of groups.value) {
    const item = values.get(draft.key)
    if (item) draft.id = item.id
  }
}

function togglePlatform(value: string) {
  settings.pricing_platforms = settings.pricing_platforms.includes(value)
    ? settings.pricing_platforms.filter(item => item !== value)
    : [...settings.pricing_platforms, value]
}

function orderedProviders() {
  return providers.map(item => item[0]).filter(item => settings.pricing_platforms.includes(item))
}

function matches(itemProvider: string, values: string[]) {
  if (providerFilter.value !== 'all' && itemProvider !== providerFilter.value) return false
  const value = query.value.trim().toLowerCase()
  return !value || values.some(item => String(item || '').toLowerCase().includes(value))
}

function providerLabel(value: string) {
  return providers.find(item => item[0] === value)?.[1] || value
}

function providerRank(value: string) {
  const index = providers.findIndex(item => item[0] === value)
  return index < 0 ? 999 : index
}

function compareModelDiscovery(a: ModelDraft, b: ModelDraft) {
  return providerRank(a.provider) - providerRank(b.provider)
    || Number(b.source_available) - Number(a.source_available)
    || String(b.first_seen_at || '').localeCompare(String(a.first_seen_at || ''))
    || compareModelVersions(a.model_name, b.model_name)
}

function compareModelVersions(a: string, b: string) {
  const left = modelVersion(a)
  const right = modelVersion(b)
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (right[index] ?? -1) - (left[index] ?? -1)
    if (difference) return difference
  }
  return a.localeCompare(b, 'en', { numeric: true })
}

function modelVersion(value: string) {
  const withoutDates = value.replace(/(?:^|[-_.])(?:20\d{6}|20\d{2}(?:[-_.]\d{1,2}){0,2})(?=$|[-_.])/g, '-')
  return [...withoutDates.matchAll(/\d+/g)].map(match => Number(match[0]))
}

function modelScopeLabel(item: GroupDraft) {
  if (!source.value?.snapshot_available) return '来源未刷新'
  if (!item.source_available) return '来源中不存在'
  if (!item.model_list_enabled) return '平台模型目录'
  if (!item.model_names.length) return '白名单为空'
  return `${item.model_names.length} 个白名单模型`
}

function empty(value: string) {
  const text = String(value || '').trim()
  return text || null
}

function positive(value: unknown) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

function integer(value: unknown, fallback: number) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : fallback
}
</script>

<template>
  <AdminAccessGate>
    <div class="admin-page admin-pricing-page">
      <header class="admin-page-heading">
        <span>Pricing</span>
        <h1>价格配置</h1>
        <p>维护 sub2api 数据来源与对外展示覆盖项。</p>
        <div class="admin-page-heading__actions">
          <button class="secondary-command" type="button" :disabled="loading" @click="loadAll(true)"><RefreshCw :size="16" :class="{ spinning: loading }" />刷新来源</button>
        </div>
      </header>

      <div :class="['admin-source-status', { 'admin-source-status--empty': !source?.snapshot_available }]">
        <div>
          <strong>{{ source?.snapshot_available ? '模型来源快照已就绪' : '模型来源尚未刷新' }}</strong>
          <span>{{ source?.snapshot_available ? sourceSummary : '自动安装会按这里同步的分组白名单选择模型；首次使用前请刷新来源。' }}</span>
        </div>
        <button class="secondary-command" type="button" :disabled="loading" @click="loadAll(true)"><RefreshCw :size="16" :class="{ spinning: loading }" />{{ source?.snapshot_available ? '重新刷新' : '立即刷新' }}</button>
      </div>

      <div class="admin-tabs" role="tablist">
        <button type="button" :class="{ active: activeTab === 'source' }" @click="activeTab = 'source'">数据源</button>
        <button type="button" :class="{ active: activeTab === 'models' }" @click="activeTab = 'models'">模型 {{ models.length }}</button>
        <button type="button" :class="{ active: activeTab === 'groups' }" @click="activeTab = 'groups'">分组 {{ groups.length }}</button>
      </div>

      <div v-if="notice.message" :class="['tool-alert', notice.type === 'error' ? 'tool-alert--error' : 'tool-alert--success']">{{ notice.message }}</div>
      <div v-if="loading && !config" class="loading-band">正在读取价格配置...</div>

      <form v-else-if="activeTab === 'source'" class="admin-settings-grid" @submit.prevent="saveSettings">
        <section class="admin-section">
          <header><h2>sub2api 来源</h2><span>{{ source?.source.configured ? '已连接' : '待配置' }}</span></header>
          <label class="form-field"><span>主站地址</span><input v-model.trim="settings.sub2api_base_url" type="url" required></label>
          <label class="form-field">
            <span>管理员 API Key</span>
            <input v-model="settings.sub2api_admin_api_key" type="password" autocomplete="new-password" :placeholder="settings.sub2api_admin_api_key_configured ? settings.sub2api_admin_api_key_masked : '输入 sub2api 管理员 Key'">
          </label>
          <label class="check-line"><input v-model="settings.clear_sub2api_admin_api_key" type="checkbox"> 清除已保存的管理员 API Key</label>
        </section>

        <section class="admin-section">
          <header><h2>同步范围</h2><span>{{ sourceSummary }}</span></header>
          <div class="provider-checks">
            <label v-for="item in providers" :key="item[0]" :class="{ active: settings.pricing_platforms.includes(item[0]) }">
              <input type="checkbox" :checked="settings.pricing_platforms.includes(item[0])" @change="togglePlatform(item[0])">
              {{ item[1] }}
            </label>
          </div>
          <label class="form-field"><span>USD / CNY</span><input v-model.number="settings.usd_to_cny" type="number" min="0.0001" max="100" step="0.0001" required></label>
        </section>
        <button class="primary-command admin-save-command" type="submit" :disabled="saving || !settings.pricing_platforms.length"><Save :size="16" />{{ saving ? '保存中...' : '保存数据源' }}</button>
      </form>

      <template v-else>
        <div class="admin-list-toolbar">
          <label class="search-control"><Search :size="17" /><input v-model="query" type="search" placeholder="搜索名称或备注"></label>
          <select v-model="providerFilter" aria-label="平台筛选"><option value="all">全部平台</option><option v-for="item in providers" :key="item[0]" :value="item[0]">{{ item[1] }}</option></select>
          <button class="primary-command" type="button" :disabled="saving || (activeTab === 'models' ? !models.length : !groups.length)" @click="activeTab === 'models' ? saveModels() : saveGroups()"><Save :size="16" />{{ saving ? '保存中...' : '保存全部' }}</button>
        </div>

        <div v-if="activeTab === 'models'" class="admin-table-scroll">
          <table class="admin-edit-table admin-model-table">
            <thead><tr><th>展示</th><th>模型</th><th>展示名称</th><th>推荐</th><th>前台排序</th><th>备注</th></tr></thead>
            <tbody>
              <tr v-for="item in filteredModels" :key="item.key">
                <td><input v-model="item.is_visible" type="checkbox" :aria-label="`${item.model_name} 是否展示`"></td>
                <td><strong>{{ item.model_name }}</strong><small>{{ providerLabel(item.provider) }} · {{ item.source_available ? '来源存在' : '仅本地' }}</small></td>
                <td><input v-model="item.display_name" :placeholder="item.model_name"></td>
                <td><input v-model="item.is_featured" type="checkbox" :aria-label="`${item.model_name} 是否推荐`"></td>
                <td><input v-model.number="item.sort_order" type="number" min="0" max="100000"></td>
                <td><input v-model="item.note" maxlength="1000"></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-else class="admin-table-scroll">
          <table class="admin-edit-table admin-group-table">
            <thead><tr><th>展示</th><th>分组</th><th>模型范围</th><th>展示名称</th><th>支付 CNY</th><th>到账 USD</th><th>排序</th><th>备注</th></tr></thead>
            <tbody>
              <tr v-for="item in filteredGroups" :key="item.key">
                <td><input v-model="item.is_visible" type="checkbox" :aria-label="`${item.source_name} 是否展示`"></td>
                <td><strong>{{ item.source_name }}</strong><small>{{ item.provider_label }} · 扣额度 {{ item.rate_multiplier }}x</small></td>
                <td class="admin-model-scope">
                  <strong :class="{ 'is-allowlist': item.model_list_enabled, 'is-missing': !item.source_available }">{{ modelScopeLabel(item) }}</strong>
                  <small :title="item.model_names.join('、')">{{ item.model_names.length ? item.model_names.join('、') : '未启用分组白名单' }}</small>
                </td>
                <td><input v-model="item.display_name" :placeholder="item.source_name || item.source_id"></td>
                <td><input v-model.number="item.recharge_pay_cny" type="number" min="0.0001" step="0.01"></td>
                <td><input v-model.number="item.recharge_credit_usd" type="number" min="0.0001" step="0.01"></td>
                <td><input v-model.number="item.sort_order" type="number" min="0" max="100000"></td>
                <td><input v-model="item.note" maxlength="1000"></td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>
  </AdminAccessGate>
</template>
