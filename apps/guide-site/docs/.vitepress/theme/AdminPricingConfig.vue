<template>
  <section class="admin-pricing-board" aria-label="管理员价格配置">
    <div class="admin-status-row">
      <span class="status-chip" :class="sourceStatusClass">{{ sourceStatusText }}</span>
      <span>{{ sourceSummary }}</span>
      <strong v-if="status.message" :class="status.type">{{ status.message }}</strong>
      <a class="inline-link" href="/guide/admin/settings">数据源配置</a>
    </div>

    <div class="admin-toolbar">
      <div class="admin-tabs" role="tablist" aria-label="配置类型">
        <button type="button" :class="{ active: activeTab === 'models' }" @click="activeTab = 'models'">
          模型展示
        </button>
        <button type="button" :class="{ active: activeTab === 'groups' }" @click="activeTab = 'groups'">
          分组倍率
        </button>
      </div>

      <label>
        <span>供应商</span>
        <select v-model="providerFilter">
          <option value="all">全部供应商</option>
          <option v-for="provider in providerOptions" :key="provider.value" :value="provider.value">
            {{ provider.label }}
          </option>
        </select>
      </label>

      <label class="search-field">
        <span>搜索</span>
        <input v-model.trim="searchQuery" type="search" placeholder="模型、分组或备注" />
      </label>

      <button class="soft-btn" type="button" :disabled="!adminToken || loading" @click="loadAll(true)">
        刷新来源
      </button>
    </div>

    <section v-if="!adminToken" class="empty-panel">
      <h2>需要先完成管理员配置</h2>
      <p>请先到配置中心保存并验证 `GUIDE_API_ADMIN_TOKEN`，然后再维护模型价格展示。</p>
      <a class="primary-link" href="/guide/admin/settings">打开配置中心</a>
    </section>

    <section v-else-if="activeTab === 'models'" class="admin-table-shell" aria-label="模型展示配置">
      <div class="table-head">
        <div>
          <h2>模型展示</h2>
          <p>显示 {{ filteredModels.length }} 个模型，已开启 {{ visibleModelCount }} 个。按供应商和排序号排列。</p>
        </div>
        <div class="table-actions">
          <button class="soft-btn" type="button" :disabled="loading || filteredModels.length === 0" @click="applyDefaultModelSort">
            默认重排
          </button>
          <button class="soft-btn" type="button" :disabled="loading || savingAllModels || filteredModels.length === 0" @click="saveVisibleModels">
            {{ savingAllModels ? '保存中...' : '保存当前列表' }}
          </button>
        </div>
      </div>

      <div v-if="loading" class="skeleton-list" aria-label="正在加载模型配置">
        <span v-for="item in 5" :key="item" />
      </div>

      <div v-else-if="filteredModels.length > 0" class="admin-table-wrap">
        <table class="models-table">
          <thead>
            <tr>
              <th>展示</th>
              <th>推荐</th>
              <th>模型</th>
              <th>供应商</th>
              <th>显示名</th>
              <th>排序</th>
              <th>备注</th>
              <th>来源</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in filteredModels" :key="row.key">
              <td>
                <label class="switch-field">
                  <input v-model="row.is_visible" type="checkbox" />
                  <span>{{ row.is_visible ? '开' : '关' }}</span>
                </label>
              </td>
              <td>
                <label class="switch-field">
                  <input v-model="row.is_featured" type="checkbox" />
                  <span>{{ row.is_featured ? '是' : '否' }}</span>
                </label>
              </td>
              <td class="model-name-cell">
                <strong :title="row.model_name">{{ row.model_name }}</strong>
                <small v-if="row.id">#{{ row.id }}</small>
              </td>
              <td>{{ providerLabel(row.provider) }}</td>
              <td>
                <input v-model.trim="row.display_name" class="table-input" type="text" placeholder="默认模型名" />
              </td>
              <td>
                <input v-model.number="row.sort_order" class="table-input number" type="number" min="0" max="100000" />
              </td>
              <td>
                <input v-model.trim="row.note" class="table-input" type="text" placeholder="可选" />
              </td>
              <td>
                <span class="source-pill" :class="{ muted: !row.source_available }">
                  {{ row.source_available ? 'sub2api' : '本地配置' }}
                </span>
              </td>
              <td>
                <div class="row-actions">
                  <button class="primary-btn small" type="button" :disabled="savingKey === row.key" @click="saveModel(row)">
                    保存
                  </button>
                  <button class="soft-btn small" type="button" :disabled="!row.id || savingKey === row.key" @click="deleteModel(row)">
                    重置
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p v-else class="empty-text">没有匹配的模型。可以刷新来源或调整筛选条件。</p>
    </section>

    <section v-else class="admin-table-shell" aria-label="分组展示配置">
      <div class="table-head">
        <div>
          <h2>分组倍率</h2>
          <p>显示 {{ filteredGroups.length }} 个分组，已开启 {{ visibleGroupCount }} 个。排序号影响公开价格页套餐顺序，保存后按新排序展示。</p>
        </div>
        <div class="table-actions">
          <button class="soft-btn" type="button" :disabled="loading || filteredGroups.length === 0" @click="applyDefaultGroupSort">
            默认重排
          </button>
          <button class="soft-btn" type="button" :disabled="loading || savingAllGroups || filteredGroups.length === 0" @click="saveVisibleGroups">
            {{ savingAllGroups ? '保存中...' : '保存当前列表' }}
          </button>
        </div>
      </div>

      <div v-if="loading" class="skeleton-list" aria-label="正在加载分组配置">
        <span v-for="item in 5" :key="item" />
      </div>

      <div v-else-if="filteredGroups.length > 0" class="group-config-list">
        <article v-for="row in filteredGroups" :key="row.key" class="group-config-row">
          <div class="group-main-panel">
            <div class="group-row-top">
              <label class="switch-field">
                <input v-model="row.is_visible" type="checkbox" />
                <span>{{ row.is_visible ? '展示' : '隐藏' }}</span>
              </label>
              <span class="source-pill" :class="{ muted: !row.source_available, warning: row.is_exclusive }">
                {{ groupSourceText(row) }}
              </span>
            </div>
            <strong :title="row.source_name || row.source_id">{{ row.source_name || row.source_id }}</strong>
            <small>{{ row.source_id }}</small>
            <div class="group-meta-line">
              <span>{{ providerLabel(row.provider) }}</span>
              <span>排序 {{ safeInt(row.sort_order, 1000) }}</span>
            </div>
            <label class="compact-field">
              <span>显示名</span>
              <input v-model.trim="row.display_name" class="table-input" type="text" placeholder="默认分组名" />
            </label>
          </div>

          <div class="group-billing-panel">
            <div class="panel-label">倍率与充值</div>
            <div class="metric-strip">
              <span>
                <em>分组倍率</em>
                <b>{{ formatRate(row.rate_multiplier) }}</b>
              </span>
              <span>
                <em>等效倍率</em>
                <b>{{ formatRate(effectiveRate(row)) }}</b>
              </span>
            </div>
            <div class="recharge-cell">
              <label>
                <span>付 ¥</span>
                <input
                  v-model.number="row.recharge_pay_cny"
                  class="table-input number"
                  type="number"
                  min="0.01"
                  max="100000"
                  step="0.01"
                />
              </label>
              <label>
                <span>到账 $</span>
                <input
                  v-model.number="row.recharge_credit_usd"
                  class="table-input number"
                  type="number"
                  min="0.01"
                  max="1000000"
                  step="0.01"
                />
              </label>
              <small>{{ rechargeSummary(row) }}</small>
              <button
                v-if="hasSourceRecharge(row)"
                class="inline-mini-btn"
                type="button"
                @click="applySourceRecharge(row)"
              >
                套用套餐
              </button>
            </div>
          </div>

          <div class="group-image-panel">
            <div class="panel-label">生图配置</div>
            <div v-if="row.allow_image_generation || hasImagePrices(row)" class="image-price-cell">
              <strong>{{ imageRateSummary(row) }}</strong>
              <div class="mini-price-grid">
                <span v-for="item in imagePriceItems(row)" :key="item.label">
                  <em>{{ item.label }}</em>
                  <b>{{ item.value }}</b>
                  <small>{{ item.source }}</small>
                </span>
              </div>
            </div>
            <span v-else class="muted-text">未开启</span>
          </div>

          <div class="group-manage-panel">
            <label class="compact-field">
              <span>排序</span>
              <input v-model.number="row.sort_order" class="table-input number" type="number" min="0" max="100000" />
            </label>
            <div class="row-actions">
              <button class="primary-btn small" type="button" :disabled="savingKey === row.key" @click="saveGroup(row)">
                保存
              </button>
              <button class="soft-btn small" type="button" :disabled="!row.id || savingKey === row.key" @click="deleteGroup(row)">
                重置
              </button>
            </div>
          </div>
        </article>
      </div>

      <p v-else class="empty-text">没有匹配的分组。可以刷新来源或调整筛选条件。</p>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { readAdminToken } from './admin-session'

interface ApiResponse<T> {
  ok: boolean
  data: T
  error?: {
    code?: string
    message?: string
  }
}

interface ModelSetting {
  id?: number
  provider: string
  model_name: string
  display_name: string | null
  is_visible: boolean
  is_featured: boolean
  sort_order: number
  note: string | null
}

interface GroupSetting {
  id?: number
  provider: string
  source_id: string
  source_name: string | null
  display_name: string | null
  is_visible: boolean | null
  recharge_multiplier: number
  recharge_pay_cny?: number | null
  recharge_credit_usd?: number | null
  sort_order: number
  note: string | null
}

interface RechargeReference {
  source: string
  plan_id?: string | null
  plan_name?: string | null
  pay_cny: number
  credit_usd: number
}

interface ImagePriceTiers {
  '1k': number | null
  '2k': number | null
  '4k': number | null
}

interface SourceGroup {
  provider: string
  provider_label: string
  provider_short: string
  source_id: string
  source_name: string
  description: string
  subscription_type: string
  is_exclusive: boolean
  rate_multiplier: number
  monthly_limit_usd?: number | null
  recharge_reference?: RechargeReference | null
  allow_image_generation: boolean
  image_rate_independent: boolean
  image_rate_multiplier: number
  image_price_1k: number | null
  image_price_2k: number | null
  image_price_4k: number | null
  default_image_prices_usd?: ImagePriceTiers
  status: string
  sort_order: number
}

interface AdminPricingConfig {
  models: ModelSetting[]
  groups: GroupSetting[]
  settings: RuntimeSettings
  source: {
    configured: boolean
    platforms: string[]
    sub2api_api_base: string | null
  }
}

interface AdminPricingSource {
  source: {
    configured: boolean
    platforms: string[]
    sub2api_api_base: string | null
  }
  groups: SourceGroup[]
  models_by_provider: Record<string, string[]>
  warnings: string[]
  fetched_at: string
}

interface RuntimeSettings {
  sub2api_base_url: string
  sub2api_admin_api_key_configured: boolean
  sub2api_admin_api_key_masked: string
  pricing_platforms: string[]
  provider_display_order: string[]
  usd_to_cny: number
}

interface ModelDraft extends ModelSetting {
  key: string
  display_name: string
  note: string
  source_available: boolean
}

interface GroupDraft extends Omit<GroupSetting, 'display_name' | 'note' | 'is_visible'> {
  key: string
  display_name: string
  note: string
  is_visible: boolean
  source_available: boolean
  provider_label: string
  is_exclusive: boolean
  rate_multiplier: number
  recharge_pay_cny: number
  recharge_credit_usd: number
  source_recharge_pay_cny: number | null
  source_recharge_credit_usd: number | null
  recharge_reference_source: string
  recharge_reference_label: string
  allow_image_generation: boolean
  image_rate_independent: boolean
  image_rate_multiplier: number
  image_price_1k: number | null
  image_price_2k: number | null
  image_price_4k: number | null
  default_image_prices_usd?: ImagePriceTiers
}

const providerLabels: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  gemini: 'Gemini',
  antigravity: 'Antigravity',
  grok: 'Grok',
}

const defaultProviderOrder = ['openai', 'anthropic', 'gemini', 'antigravity', 'grok']

const activeTab = ref<'models' | 'groups'>('models')
const adminToken = ref('')
const providerFilter = ref('all')
const searchQuery = ref('')
const loading = ref(false)
const savingKey = ref('')
const savingAllModels = ref(false)
const savingAllGroups = ref(false)
const configData = ref<AdminPricingConfig | null>(null)
const sourceData = ref<AdminPricingSource | null>(null)
const modelDrafts = reactive<Record<string, ModelDraft>>({})
const groupDrafts = reactive<Record<string, GroupDraft>>({})
const modelListOrder = ref<Record<string, number>>({})
const groupListOrder = ref<Record<string, number>>({})
const status = reactive({
  type: 'idle' as 'idle' | 'success' | 'error',
  message: '',
})

const providerOptions = computed(() => {
  const providers = new Set<string>()
  for (const row of Object.values(modelDrafts)) providers.add(row.provider)
  for (const row of Object.values(groupDrafts)) providers.add(row.provider)
  return Array.from(providers)
    .sort(compareProviders)
    .map((provider) => ({ value: provider, label: providerLabel(provider) }))
})

const filteredModels = computed(() => {
  return Object.values(modelDrafts)
    .filter((row) => providerFilter.value === 'all' || row.provider === providerFilter.value)
    .filter((row) => matchQuery([row.model_name, row.display_name, row.note, row.provider]))
    .sort(compareStableModelRows)
})

const filteredGroups = computed(() => {
  return Object.values(groupDrafts)
    .filter((row) => providerFilter.value === 'all' || row.provider === providerFilter.value)
    .filter((row) => matchQuery([row.source_name || '', row.display_name, row.note, row.provider, row.source_id]))
    .sort(compareStableGroupRows)
})

const usdToCny = computed(() => Number(configData.value?.settings.usd_to_cny || 7))
const visibleModelCount = computed(() => Object.values(modelDrafts).filter((row) => row.is_visible).length)
const visibleGroupCount = computed(() => Object.values(groupDrafts).filter((row) => row.is_visible).length)

const sourceStatusText = computed(() => {
  if (!sourceData.value && !configData.value) return '未加载'
  if (sourceData.value?.source.configured || configData.value?.source.configured) return '已配置数据源'
  return '未配置数据源'
})

const sourceStatusClass = computed(() => ({
  success: sourceData.value?.source.configured || configData.value?.source.configured,
  warning: sourceData.value && !sourceData.value.source.configured,
}))

const sourceSummary = computed(() => {
  if (!sourceData.value) return '尚未读取 sub2api 来源。'
  const groupCount = sourceData.value.groups.length
  const modelCount = Object.values(sourceData.value.models_by_provider || {}).reduce((sum, items) => sum + items.length, 0)
  return `${modelCount} 个来源模型，${groupCount} 个来源分组。`
})

onMounted(() => {
  adminToken.value = readAdminToken()
  if (adminToken.value) {
    void loadAll(false)
  } else {
    setStatus('idle', '请先到配置中心保存管理员 Token。')
  }
})

async function loadAll(refresh: boolean) {
  if (!adminToken.value) return
  loading.value = true
  setStatus('idle', refresh ? '正在刷新来源...' : '正在加载配置...')
  try {
    const [config, source] = await Promise.all([
      adminFetch<AdminPricingConfig>('/admin/pricing/config'),
      adminFetch<AdminPricingSource>(`/admin/pricing/source${refresh ? '?refresh=true' : ''}`),
    ])
    configData.value = config
    sourceData.value = source
    rebuildDrafts(config, source)
    setStatus('success', refresh ? '来源已刷新。' : '配置已加载。')
  } catch (error) {
    setStatus('error', error instanceof Error ? error.message : '配置读取失败')
  } finally {
    loading.value = false
  }
}

async function saveModel(row: ModelDraft) {
  savingKey.value = row.key
  try {
    const saved = await adminFetch<ModelSetting>('/admin/pricing/models', {
      method: 'PUT',
      body: modelPayload(row),
    })
    applySavedModel(saved)
    refreshModelListOrder()
    setStatus('success', `${row.model_name} 已保存。`)
  } catch (error) {
    setStatus('error', error instanceof Error ? error.message : '模型保存失败')
  } finally {
    savingKey.value = ''
  }
}

async function saveVisibleModels() {
  savingAllModels.value = true
  try {
    for (const row of filteredModels.value) {
      const saved = await adminFetch<ModelSetting>('/admin/pricing/models', {
        method: 'PUT',
        body: modelPayload(row),
      })
      applySavedModel(saved)
    }
    refreshModelListOrder()
    setStatus('success', '当前模型列表已保存。')
  } catch (error) {
    setStatus('error', error instanceof Error ? error.message : '批量保存失败')
  } finally {
    savingAllModels.value = false
  }
}

async function deleteModel(row: ModelDraft) {
  if (!row.id) return
  savingKey.value = row.key
  try {
    await adminFetch<{ deleted: boolean }>(`/admin/pricing/models/${row.id}`, { method: 'DELETE' })
    row.id = undefined
    row.display_name = ''
    row.is_visible = false
    row.is_featured = false
    row.sort_order = defaultSort(row.sort_order)
    row.note = ''
    refreshModelListOrder()
    setStatus('success', `${row.model_name} 已重置。`)
  } catch (error) {
    setStatus('error', error instanceof Error ? error.message : '模型重置失败')
  } finally {
    savingKey.value = ''
  }
}

function applyDefaultModelSort() {
  const providerCounts = new Map<string, number>()
  for (const row of filteredModels.value) {
    const index = providerCounts.get(row.provider) || 0
    row.sort_order = defaultModelSort(row.provider, row.model_name, index)
    providerCounts.set(row.provider, index + 1)
  }
  refreshModelListOrder()
  setStatus('idle', '已按默认规则重排，确认后点击“保存当前列表”落库。')
}

function applyDefaultGroupSort() {
  const rowsByProvider = new Map<string, GroupDraft[]>()
  for (const row of filteredGroups.value) {
    const current = rowsByProvider.get(row.provider) || []
    current.push(row)
    rowsByProvider.set(row.provider, current)
  }
  for (const provider of Array.from(rowsByProvider.keys()).sort(compareProviders)) {
    const rows = rowsByProvider.get(provider) || []
    rows.sort(compareDefaultGroupRows).forEach((row, index) => {
      row.sort_order = (index + 1) * 10
    })
  }
  refreshGroupListOrder()
  setStatus('idle', '已按等效倍率和分组名称重排，确认后点击“保存当前列表”落库。')
}

async function saveGroup(row: GroupDraft) {
  savingKey.value = row.key
  try {
    const saved = await adminFetch<GroupSetting>('/admin/pricing/groups', {
      method: 'PUT',
      body: groupPayload(row),
    })
    applySavedGroup(saved)
    refreshGroupListOrder()
    setStatus('success', `${row.source_name || row.source_id} 已保存。`)
  } catch (error) {
    setStatus('error', error instanceof Error ? error.message : '分组保存失败')
  } finally {
    savingKey.value = ''
  }
}

async function saveVisibleGroups() {
  savingAllGroups.value = true
  try {
    for (const row of filteredGroups.value) {
      const saved = await adminFetch<GroupSetting>('/admin/pricing/groups', {
        method: 'PUT',
        body: groupPayload(row),
      })
      applySavedGroup(saved)
    }
    refreshGroupListOrder()
    setStatus('success', '当前分组列表已保存。')
  } catch (error) {
    setStatus('error', error instanceof Error ? error.message : '批量保存失败')
  } finally {
    savingAllGroups.value = false
  }
}

async function deleteGroup(row: GroupDraft) {
  if (!row.id) return
  savingKey.value = row.key
  try {
    await adminFetch<{ deleted: boolean }>(`/admin/pricing/groups/${row.id}`, { method: 'DELETE' })
    row.id = undefined
    row.display_name = ''
    row.is_visible = !row.is_exclusive
    if (row.source_recharge_pay_cny && row.source_recharge_credit_usd) {
      row.recharge_pay_cny = row.source_recharge_pay_cny
      row.recharge_credit_usd = row.source_recharge_credit_usd
    } else {
      row.recharge_pay_cny = 1
      row.recharge_credit_usd = 1
    }
    row.recharge_multiplier = rechargeBoost(row)
    row.recharge_reference_source = row.source_recharge_pay_cny ? 'subscription_plan' : 'balance_recharge'
    row.recharge_reference_label = row.source_recharge_pay_cny ? '订阅套餐' : '余额充值'
    row.sort_order = defaultSort(row.sort_order)
    row.note = ''
    refreshGroupListOrder()
    setStatus('success', `${row.source_name || row.source_id} 已重置。`)
  } catch (error) {
    setStatus('error', error instanceof Error ? error.message : '分组重置失败')
  } finally {
    savingKey.value = ''
  }
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
  return body.data
}

function rebuildDrafts(config: AdminPricingConfig, source: AdminPricingSource) {
  clearObject(modelDrafts)
  clearObject(groupDrafts)

  const modelSettings = new Map(config.models.map((item) => [modelKey(item.provider, item.model_name), item]))
  for (const [provider, models] of Object.entries(source.models_by_provider || {})) {
    models.forEach((modelName, index) => {
      const key = modelKey(provider, modelName)
      const setting = modelSettings.get(key)
      modelDrafts[key] = buildModelDraft(provider, modelName, setting, true, defaultModelSort(provider, modelName, index))
      modelSettings.delete(key)
    })
  }
  for (const setting of modelSettings.values()) {
    const key = modelKey(setting.provider, setting.model_name)
    modelDrafts[key] = buildModelDraft(setting.provider, setting.model_name, setting, false, setting.sort_order)
  }

  const groupSettings = new Map(config.groups.map((item) => [groupKey(item.provider, item.source_id), item]))
  for (const group of source.groups || []) {
    const key = groupKey(group.provider, group.source_id)
    const setting = groupSettings.get(key)
    groupDrafts[key] = buildGroupDraft(group, setting, true)
    groupSettings.delete(key)
  }
  for (const setting of groupSettings.values()) {
    const key = groupKey(setting.provider, setting.source_id)
    groupDrafts[key] = buildGroupDraft(null, setting, false)
  }
  refreshModelListOrder()
  refreshGroupListOrder()
}

function buildModelDraft(
  provider: string,
  modelName: string,
  setting: ModelSetting | undefined,
  sourceAvailable: boolean,
  fallbackSort: number,
): ModelDraft {
  const key = modelKey(provider, modelName)
  return {
    key,
    id: setting?.id,
    provider,
    model_name: modelName,
    display_name: setting?.display_name || '',
    is_visible: Boolean(setting?.is_visible),
    is_featured: Boolean(setting?.is_featured),
    sort_order: setting?.sort_order ?? fallbackSort,
    note: setting?.note || '',
    source_available: sourceAvailable,
  }
}

function buildGroupDraft(
  sourceGroup: SourceGroup | null,
  setting: GroupSetting | undefined,
  sourceAvailable: boolean,
): GroupDraft {
  const provider = sourceGroup?.provider || setting?.provider || ''
  const sourceId = sourceGroup?.source_id || setting?.source_id || ''
  const isExclusive = Boolean(sourceGroup?.is_exclusive)
  const defaultVisible = !isExclusive
  const recharge = resolveRechargeDraft(sourceGroup, setting)
  return {
    key: groupKey(provider, sourceId),
    id: setting?.id,
    provider,
    source_id: sourceId,
    source_name: setting?.source_name || sourceGroup?.source_name || '',
    display_name: setting?.display_name || '',
    is_visible: setting?.is_visible == null ? defaultVisible : Boolean(setting.is_visible),
    recharge_multiplier: recharge.multiplier,
    recharge_pay_cny: recharge.payCny,
    recharge_credit_usd: recharge.creditUsd,
    source_recharge_pay_cny: recharge.sourcePayCny,
    source_recharge_credit_usd: recharge.sourceCreditUsd,
    recharge_reference_source: recharge.source,
    recharge_reference_label: recharge.label,
    sort_order: setting?.sort_order ?? sourceGroup?.sort_order ?? 1000,
    note: setting?.note || '',
    source_available: sourceAvailable,
    provider_label: sourceGroup?.provider_label || providerLabel(provider),
    is_exclusive: isExclusive,
    rate_multiplier: Number(sourceGroup?.rate_multiplier || 1),
    allow_image_generation: Boolean(sourceGroup?.allow_image_generation),
    image_rate_independent: Boolean(sourceGroup?.image_rate_independent),
    image_rate_multiplier: Number(sourceGroup?.image_rate_multiplier || 1),
    image_price_1k: sourceGroup?.image_price_1k ?? null,
    image_price_2k: sourceGroup?.image_price_2k ?? null,
    image_price_4k: sourceGroup?.image_price_4k ?? null,
    default_image_prices_usd: sourceGroup?.default_image_prices_usd,
  }
}

function resolveRechargeDraft(sourceGroup: SourceGroup | null, setting: GroupSetting | undefined) {
  const sourcePayCny = positiveNumberOrNull(sourceGroup?.recharge_reference?.pay_cny)
  const sourceCreditUsd = positiveNumberOrNull(sourceGroup?.recharge_reference?.credit_usd)
  const manualPayCny = positiveNumberOrNull(setting?.recharge_pay_cny)
  const manualCreditUsd = positiveNumberOrNull(setting?.recharge_credit_usd)
  const defaultExchangeArtifact = isDefaultExchangeRecharge(manualPayCny, manualCreditUsd)
  if (manualPayCny && manualCreditUsd && !defaultExchangeArtifact) {
    return {
      multiplier: rechargeMultiplierFromPair(manualPayCny, manualCreditUsd),
      payCny: manualPayCny,
      creditUsd: manualCreditUsd,
      sourcePayCny,
      sourceCreditUsd,
      source: 'manual',
      label: '手动配置',
    }
  }
  if (sourcePayCny && sourceCreditUsd) {
    return {
      multiplier: rechargeMultiplierFromPair(sourcePayCny, sourceCreditUsd),
      payCny: sourcePayCny,
      creditUsd: sourceCreditUsd,
      sourcePayCny,
      sourceCreditUsd,
      source: sourceGroup?.recharge_reference?.source || 'subscription_plan',
      label: sourceGroup?.recharge_reference?.plan_name || '订阅套餐',
    }
  }

  const multiplier = safeNumber(setting?.recharge_multiplier, 1)
  if (setting?.recharge_multiplier && multiplier !== 1 && !defaultExchangeArtifact) {
    return {
      multiplier,
      payCny: 1,
      creditUsd: multiplier,
      sourcePayCny,
      sourceCreditUsd,
      source: 'legacy_multiplier',
      label: '旧倍率',
    }
  }

  return {
    multiplier: 1,
    payCny: 1,
    creditUsd: 1,
    sourcePayCny,
    sourceCreditUsd,
    source: 'balance_recharge',
    label: '余额充值',
  }
}

function modelPayload(row: ModelDraft) {
  return {
    provider: row.provider,
    model_name: row.model_name,
    display_name: emptyToNull(row.display_name),
    is_visible: Boolean(row.is_visible),
    is_featured: Boolean(row.is_featured),
    sort_order: safeInt(row.sort_order, 1000),
    note: emptyToNull(row.note),
  }
}

function groupPayload(row: GroupDraft) {
  const payCny = positiveNumberOrNull(row.recharge_pay_cny)
  const creditUsd = positiveNumberOrNull(row.recharge_credit_usd)
  return {
    provider: row.provider,
    source_id: row.source_id,
    source_name: emptyToNull(row.source_name),
    display_name: emptyToNull(row.display_name),
    is_visible: Boolean(row.is_visible),
    recharge_multiplier: rechargeBoost(row),
    recharge_pay_cny: payCny,
    recharge_credit_usd: creditUsd,
    sort_order: safeInt(row.sort_order, 1000),
    note: emptyToNull(row.note),
  }
}

function applySavedModel(setting: ModelSetting) {
  const key = modelKey(setting.provider, setting.model_name)
  const current = modelDrafts[key]
  if (!current) return
  current.id = setting.id
  current.display_name = setting.display_name || ''
  current.is_visible = Boolean(setting.is_visible)
  current.is_featured = Boolean(setting.is_featured)
  current.sort_order = setting.sort_order
  current.note = setting.note || ''
}

function applySavedGroup(setting: GroupSetting) {
  const key = groupKey(setting.provider, setting.source_id)
  const current = groupDrafts[key]
  if (!current) return
  current.id = setting.id
  current.source_name = setting.source_name || current.source_name
  current.display_name = setting.display_name || ''
  current.is_visible = Boolean(setting.is_visible)
  current.recharge_multiplier = setting.recharge_multiplier
  current.recharge_pay_cny = positiveNumberOrNull(setting.recharge_pay_cny) || current.recharge_pay_cny
  current.recharge_credit_usd = positiveNumberOrNull(setting.recharge_credit_usd) || current.recharge_credit_usd
  current.sort_order = setting.sort_order
  current.note = setting.note || ''
}

function matchQuery(values: string[]) {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return true
  return values.some((value) => String(value || '').toLowerCase().includes(query))
}

function providerLabel(provider: string) {
  return providerLabels[provider] || provider
}

function compareModelRows(a: ModelDraft, b: ModelDraft) {
  return compareProviders(a.provider, b.provider)
    || (safeInt(a.sort_order, 1000) - safeInt(b.sort_order, 1000))
    || (Number(b.is_featured) - Number(a.is_featured))
    || (Number(b.is_visible) - Number(a.is_visible))
    || a.model_name.localeCompare(b.model_name, 'en', { numeric: true, sensitivity: 'base' })
}

function compareStableModelRows(a: ModelDraft, b: ModelDraft) {
  const aOrder = modelListOrder.value[a.key]
  const bOrder = modelListOrder.value[b.key]
  if (aOrder != null || bOrder != null) {
    return (aOrder ?? Number.MAX_SAFE_INTEGER) - (bOrder ?? Number.MAX_SAFE_INTEGER)
  }
  return compareModelRows(a, b)
}

function refreshModelListOrder() {
  const nextOrder: Record<string, number> = {}
  Object.values(modelDrafts)
    .sort(compareModelRows)
    .forEach((row, index) => {
      nextOrder[row.key] = index
    })
  modelListOrder.value = nextOrder
}

function compareGroupRows(a: GroupDraft, b: GroupDraft) {
  const aName = a.display_name || a.source_name || a.source_id
  const bName = b.display_name || b.source_name || b.source_id
  return compareProviders(a.provider, b.provider)
    || (safeInt(a.sort_order, 1000) - safeInt(b.sort_order, 1000))
    || (Number(b.is_visible) - Number(a.is_visible))
    || String(aName).localeCompare(String(bName), 'zh-CN', { numeric: true, sensitivity: 'base' })
}

function compareStableGroupRows(a: GroupDraft, b: GroupDraft) {
  const aOrder = groupListOrder.value[a.key]
  const bOrder = groupListOrder.value[b.key]
  if (aOrder != null || bOrder != null) {
    return (aOrder ?? Number.MAX_SAFE_INTEGER) - (bOrder ?? Number.MAX_SAFE_INTEGER)
  }
  return compareGroupRows(a, b)
}

function refreshGroupListOrder() {
  const nextOrder: Record<string, number> = {}
  Object.values(groupDrafts)
    .sort(compareGroupRows)
    .forEach((row, index) => {
      nextOrder[row.key] = index
    })
  groupListOrder.value = nextOrder
}

function compareDefaultGroupRows(a: GroupDraft, b: GroupDraft) {
  const aName = a.display_name || a.source_name || a.source_id
  const bName = b.display_name || b.source_name || b.source_id
  return Number(a.is_exclusive) - Number(b.is_exclusive)
    || effectiveRate(a) - effectiveRate(b)
    || safeNumber(a.rate_multiplier, 1) - safeNumber(b.rate_multiplier, 1)
    || String(aName).localeCompare(String(bName), 'zh-CN', { numeric: true, sensitivity: 'base' })
}

function compareProviders(a: string, b: string) {
  return providerRank(a) - providerRank(b)
    || providerLabel(a).localeCompare(providerLabel(b), 'en', { sensitivity: 'base' })
}

function providerRank(provider: string) {
  const order = configData.value?.settings.provider_display_order?.length
    ? configData.value.settings.provider_display_order
    : defaultProviderOrder
  const index = order.indexOf(provider)
  return index >= 0 ? index : 999
}

function defaultModelSort(provider: string, modelName: string, sourceIndex: number) {
  const name = modelName.toLowerCase()
  const knownPriority = modelPriority(name)
  if (knownPriority != null) return knownPriority
  return 1000 + providerRank(provider) * 100 + (sourceIndex + 1) * 10
}

function modelPriority(name: string) {
  if (/gpt-5\.5/.test(name)) return 10
  if (/gpt-5\.4-mini/.test(name)) return 30
  if (/gpt-5\.4-nano/.test(name)) return 40
  if (/gpt-5\.4/.test(name)) return 20
  if (/gpt-image/.test(name)) return 60
  if (/codex/.test(name)) return 70
  if (/gpt-4\.1/.test(name)) return 110
  if (/gpt-4o/.test(name)) return 120
  if (/(^|-)o[34]($|-)/.test(name)) return 130
  if (/gpt-3\.5/.test(name)) return 3000

  if (/claude.*(sonnet.*4|4.*sonnet)|claude-sonnet-4/.test(name)) return 110
  if (/claude.*(haiku.*4|4.*haiku)/.test(name)) return 120
  if (/claude.*(opus.*4|4.*opus)/.test(name)) return 130
  if (/claude.*(3-7|3\.7)/.test(name)) return 210
  if (/claude.*3.*haiku/.test(name)) return 220
  if (/claude.*3.*opus/.test(name)) return 230
  if (/claude.*3.*sonnet/.test(name)) return 240
  return null
}

function effectiveRate(row: GroupDraft) {
  return safeNumber(row.rate_multiplier, 1) / rechargeBoost(row)
}

function imageEffectiveRate(row: GroupDraft) {
  const base = row.image_rate_independent ? row.image_rate_multiplier : row.rate_multiplier
  return safeNumber(base, 1) / rechargeBoost(row)
}

function rechargeBoost(row: GroupDraft) {
  const payCny = positiveNumberOrNull(row.recharge_pay_cny)
  const creditUsd = positiveNumberOrNull(row.recharge_credit_usd)
  if (payCny && creditUsd) {
    return rechargeMultiplierFromPair(payCny, creditUsd)
  }
  return safeNumber(row.recharge_multiplier, 1)
}

function rechargeMultiplierFromPair(payCny: number, creditUsd: number) {
  return safeNumber(creditUsd, 1) / safeNumber(payCny, 1)
}

function rechargeSummary(row: GroupDraft) {
  const payCny = positiveNumberOrNull(row.recharge_pay_cny)
  const creditUsd = positiveNumberOrNull(row.recharge_credit_usd)
  if (!payCny || !creditUsd) return '请填写支付金额和到账额度'
  const perCny = creditUsd / payCny
  return `¥${formatAmount(payCny)} 到账 $${formatAmount(creditUsd)} · 1元≈$${formatNumber(perCny, 4)}`
}

function hasSourceRecharge(row: GroupDraft) {
  return Boolean(row.source_recharge_pay_cny && row.source_recharge_credit_usd)
}

function applySourceRecharge(row: GroupDraft) {
  if (!row.source_recharge_pay_cny || !row.source_recharge_credit_usd) return
  row.recharge_pay_cny = row.source_recharge_pay_cny
  row.recharge_credit_usd = row.source_recharge_credit_usd
}

function imageRateSummary(row: GroupDraft) {
  const state = row.allow_image_generation ? '允许' : '仅配置价格'
  const mode = row.image_rate_independent ? '独立' : '跟随文本'
  const rate = row.image_rate_independent ? row.image_rate_multiplier : row.rate_multiplier
  return `${state} · ${mode} ${formatRate(rate)}`
}

function hasImagePrices(row: GroupDraft) {
  return row.image_price_1k != null || row.image_price_2k != null || row.image_price_4k != null
}

function imagePriceItems(row: GroupDraft) {
  return [
    imagePriceItem(row, '1k', '1K', row.image_price_1k),
    imagePriceItem(row, '2k', '2K', row.image_price_2k),
    imagePriceItem(row, '4k', '4K', row.image_price_4k),
  ]
}

function imagePriceItem(row: GroupDraft, key: keyof ImagePriceTiers, label: string, configuredValue: number | null) {
  if (configuredValue != null) {
    return {
      label,
      value: formatUsd(configuredValue),
      source: '分组价',
    }
  }
  const defaultValue = row.default_image_prices_usd?.[key] ?? null
  return {
    label,
    value: formatUsd(defaultValue),
    source: defaultValue == null ? '未配置' : '默认价',
  }
}

function groupSourceText(row: GroupDraft) {
  if (!row.source_available) return '本地配置'
  if (row.is_exclusive) return '专属分组'
  return 'sub2api'
}

function formatRate(value: number) {
  return `${formatNumber(safeNumber(value, 1), 3)}x`
}

function formatUsd(value: number | null) {
  if (value == null) return '-'
  return `$${Number(value).toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}`
}

function formatAmount(value: number) {
  return Number(value).toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

function formatNumber(value: number, decimals: number) {
  return Number(value).toFixed(decimals).replace(/0+$/, '').replace(/\.$/, '')
}

function setStatus(type: 'idle' | 'success' | 'error', message: string) {
  status.type = type
  status.message = message
}

function modelKey(provider: string, modelName: string) {
  return `${provider}:${modelName}`
}

function groupKey(provider: string, sourceId: string) {
  return `${provider}:${sourceId}`
}

function clearObject(target: Record<string, unknown>) {
  for (const key of Object.keys(target)) {
    delete target[key]
  }
}

function emptyToNull(value: string) {
  const text = String(value || '').trim()
  return text ? text : null
}

function safeInt(value: unknown, fallback: number) {
  const num = Number(value)
  return Number.isFinite(num) ? Math.max(0, Math.round(num)) : fallback
}

function safeNumber(value: unknown, fallback: number) {
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? num : fallback
}

function positiveNumberOrNull(value: unknown) {
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? num : null
}

function isDefaultExchangeRecharge(payCny: number | null, creditUsd: number | null) {
  if (!payCny || !creditUsd) return false
  return Math.abs(payCny - usdToCny.value) < 0.0001 && Math.abs(creditUsd - 1) < 0.0001
}

function defaultSort(value: number) {
  return Number.isFinite(Number(value)) ? Number(value) : 1000
}
</script>

<style scoped>
.admin-pricing-board {
  display: flex;
  flex-direction: column;
  gap: 12px;
  color: #102033;
}

.admin-toolbar,
.admin-table-shell,
.empty-panel {
  border: 1px solid #d5e0ec;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.96);
}

.admin-table-shell h2,
.empty-panel h2 {
  margin: 0;
  padding: 0;
  border: 0;
  color: #102033;
  font-size: 18px;
  line-height: 1.35;
}

.table-head p,
.empty-panel p,
.admin-status-row span,
.admin-status-row strong {
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

.inline-link {
  color: #0b6765;
  font-size: 13px;
  font-weight: 800;
  text-decoration: none;
}

.inline-link:hover {
  text-decoration: underline;
}

.admin-status-row strong.success {
  color: #04743b;
}

.admin-status-row strong.error {
  color: #a23124;
}

.admin-toolbar label {
  display: grid;
  gap: 6px;
}

.admin-toolbar label span {
  color: #24364b;
  font-size: 12px;
  font-weight: 800;
}

.admin-toolbar input,
.admin-toolbar select,
.table-input {
  width: 100%;
  border: 1px solid #c7d4e4;
  border-radius: 8px;
  color: #18283b;
  background: #ffffff;
  font: inherit;
}

.admin-toolbar input,
.admin-toolbar select,
.table-input {
  min-height: 38px;
  padding: 0 10px;
}

.table-input.number {
  min-width: 92px;
}

.group-config-list .table-input {
  min-height: 32px;
  padding: 0 8px;
  font-size: 12px;
}

.group-config-list .table-input.number {
  min-width: 0;
}

.admin-toolbar input:focus,
.admin-toolbar select:focus,
.table-input:focus {
  border-color: #238b8d;
  outline: 0;
  box-shadow: 0 0 0 3px rgba(35, 139, 141, 0.14);
}

.switch-field input {
  width: 16px;
  height: 16px;
  accent-color: #146c6f;
}

.row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.group-config-list {
  display: grid;
  gap: 8px;
  padding: 10px;
  border-top: 1px solid #d5e0ec;
  background: #f8fafc;
}

.group-config-row {
  display: grid;
  grid-template-columns: minmax(0, 1.18fr) minmax(0, 1.18fr) minmax(0, 0.96fr) minmax(0, 0.58fr);
  gap: 10px;
  align-items: stretch;
  border: 1px solid #d8e2ee;
  border-radius: 8px;
  padding: 10px;
  background: #ffffff;
}

.group-main-panel,
.group-billing-panel,
.group-image-panel,
.group-manage-panel {
  display: grid;
  min-width: 0;
  align-content: start;
  gap: 7px;
}

.group-row-top,
.group-meta-line {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.group-row-top {
  justify-content: space-between;
}

.group-main-panel > strong,
.group-main-panel > small {
  display: block;
  min-width: 0;
  overflow-wrap: anywhere;
}

.group-main-panel > strong {
  color: #071626;
  font-size: 14px;
  font-weight: 900;
  line-height: 1.35;
}

.group-main-panel > small {
  color: #65758a;
  font-size: 11px;
  line-height: 1.35;
}

.group-meta-line span {
  display: inline-flex;
  min-height: 22px;
  align-items: center;
  border-radius: 999px;
  padding: 0 8px;
  color: #40536b;
  background: #f0f4f8;
  font-size: 11px;
  font-weight: 800;
}

.compact-field {
  display: grid;
  min-width: 0;
  gap: 5px;
}

.compact-field span,
.panel-label {
  color: #526982;
  font-size: 11px;
  font-weight: 900;
  line-height: 1.2;
}

.metric-strip {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.metric-strip span {
  display: grid;
  min-width: 0;
  border: 1px solid #d8e2ee;
  border-radius: 8px;
  padding: 7px 8px;
  background: #f7fafc;
}

.metric-strip em {
  color: #65758a;
  font-size: 11px;
  font-style: normal;
  font-weight: 800;
  line-height: 1.2;
}

.metric-strip b {
  margin-top: 2px;
  color: #083f42;
  font-size: 14px;
  font-weight: 900;
  line-height: 1.2;
}

.group-billing-panel .recharge-cell {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 5px 6px;
}

.group-billing-panel .recharge-cell small,
.group-billing-panel .inline-mini-btn {
  grid-column: 1 / -1;
}

.group-image-panel .image-price-cell {
  gap: 6px;
}

.group-image-panel .image-price-cell > strong {
  overflow: visible;
  color: #0f5c5f;
  text-overflow: clip;
  white-space: normal;
}

.group-image-panel .muted-text {
  display: grid;
  min-height: 34px;
  align-content: center;
  border: 1px dashed #d5e0ec;
  border-radius: 8px;
  padding: 0 10px;
  background: #f8fafc;
}

.group-manage-panel {
  align-content: start;
}

.group-manage-panel .row-actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.group-manage-panel .primary-btn.small,
.group-manage-panel .soft-btn.small {
  width: 100%;
  padding: 0 8px;
}

.admin-toolbar {
  display: grid;
  grid-template-columns: auto 180px minmax(240px, 1fr) auto;
  gap: 10px;
  align-items: end;
  padding: 12px;
}

.admin-tabs {
  display: inline-flex;
  gap: 4px;
  min-height: 40px;
  align-items: center;
  padding: 3px;
  border: 1px solid #d5e0ec;
  border-radius: 8px;
  background: #f4f7fa;
}

.admin-tabs button {
  min-height: 32px;
  border: 1px solid transparent;
  border-radius: 6px;
  padding: 0 12px;
  color: #43576f;
  background: transparent;
  font: inherit;
  font-weight: 800;
  cursor: pointer;
}

.admin-tabs button.active {
  border-color: #7ab8b1;
  color: #0b6765;
  background: #ffffff;
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

.primary-btn:hover {
  border-color: #0f5c5f;
  background: #0f5c5f;
}

.soft-btn {
  border: 1px solid #d0dbe8;
  color: #27384b;
  background: #f5f8fb;
}

.soft-btn:hover {
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
.source-pill,
.rate-pill {
  display: inline-flex;
  min-height: 26px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 0 10px;
  color: #526982;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
  background: #edf2f7;
}

.status-chip.success,
.rate-pill {
  color: #04743b;
  background: #dff9e9;
}

.status-chip.warning,
.source-pill.warning {
  color: #8a4b05;
  background: #fff1d8;
}

.source-pill.muted {
  color: #617085;
  background: #eef2f7;
}

.table-head,
.table-actions {
  display: flex;
  align-items: center;
}

.table-head {
  justify-content: space-between;
  gap: 12px;
  padding: 14px;
}

.table-actions {
  gap: 8px;
}

.admin-table-wrap {
  overflow-x: auto;
  border-top: 1px solid #d5e0ec;
}

.admin-table-wrap table {
  width: 100%;
  min-width: 1180px;
  border: 0;
  border-collapse: collapse;
  table-layout: fixed;
  background: #ffffff;
}

.models-table th:nth-child(1),
.models-table th:nth-child(2) {
  width: 7%;
}

.models-table th:nth-child(3) {
  width: 24%;
}

.models-table th:nth-child(4) {
  width: 9%;
}

.models-table th:nth-child(5) {
  width: 13%;
}

.models-table th:nth-child(6) {
  width: 8%;
}

.models-table th:nth-child(7) {
  width: 13%;
}

.models-table th:nth-child(8) {
  width: 9%;
}

.models-table th:nth-child(9) {
  width: 10%;
}

.admin-table-wrap th,
.admin-table-wrap td {
  padding: 10px 8px;
  border-bottom: 1px solid #d5e0ec;
  text-align: left;
  vertical-align: middle;
}

.admin-table-wrap th {
  color: #24364b;
  font-size: 12px;
  font-weight: 800;
  background: #f3f5f8;
}

.admin-table-wrap td {
  color: #071626;
  font-size: 13px;
}

.admin-table-wrap td strong,
.admin-table-wrap td small {
  display: block;
}

.admin-table-wrap td strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.admin-table-wrap td.model-name-cell strong {
  overflow: visible;
  color: #071626;
  text-overflow: clip;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
  line-height: 1.35;
}

.admin-table-wrap td.model-name-cell small {
  margin-top: 5px;
  overflow-wrap: anywhere;
}

.admin-table-wrap td.group-name-cell strong {
  overflow: visible;
  text-overflow: clip;
  white-space: normal;
  overflow-wrap: anywhere;
  line-height: 1.45;
}

.admin-table-wrap td.group-name-cell small {
  margin-top: 6px;
  overflow-wrap: anywhere;
}

.recharge-cell {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.recharge-cell label {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  align-items: center;
  gap: 5px;
}

.recharge-cell label span,
.recharge-cell small {
  color: #65758a;
  font-size: 11px;
  font-weight: 800;
}

.recharge-cell small {
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.inline-mini-btn {
  min-height: 24px;
  justify-self: start;
  border: 1px solid #b8d8d4;
  border-radius: 8px;
  padding: 0 8px;
  color: #0b6765;
  background: #f1faf8;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.inline-mini-btn:hover {
  border-color: #7ab8b1;
  background: #e6f4f1;
}

.image-price-cell {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.admin-table-wrap td .image-price-cell > strong {
  overflow: visible;
  color: #0f5c5f;
  text-overflow: clip;
  white-space: normal;
}

.mini-price-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 3px;
}

.mini-price-grid span {
  display: grid;
  min-height: 36px;
  align-content: center;
  border-radius: 8px;
  padding: 4px 5px;
  color: #102033;
  font-size: 12px;
  font-weight: 800;
  background: #f5f8fb;
}

.mini-price-grid b {
  display: block;
  overflow: hidden;
  color: #102033;
  font-size: 11px;
  font-weight: 900;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mini-price-grid em {
  color: #65758a;
  font-size: 10px;
  font-style: normal;
  font-weight: 800;
}

.mini-price-grid small {
  margin-top: 1px;
  color: #6b7b8f;
  font-size: 9px;
  font-weight: 800;
  line-height: 1.1;
}

.muted-text {
  color: #65758a;
  font-size: 12px;
  font-weight: 800;
}

.admin-table-wrap td small {
  margin-top: 2px;
  color: #65758a;
  font-size: 11px;
}

.switch-field {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-width: 58px;
  color: #27384b;
  font-size: 12px;
  font-weight: 800;
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
  margin: 0;
  color: #516882;
}

.skeleton-list {
  display: grid;
  gap: 8px;
  padding: 14px;
  border-top: 1px solid #d5e0ec;
}

.skeleton-list span {
  height: 44px;
  border-radius: 8px;
  background: linear-gradient(90deg, #eef3f6, #f8fafc, #eef3f6);
}

:global(.dark) .admin-pricing-board {
  color: #e7f2f8;
}

:global(.dark) .admin-toolbar,
:global(.dark) .admin-table-shell,
:global(.dark) .empty-panel,
:global(.dark) .admin-table-wrap table,
:global(.dark) .group-config-row,
:global(.dark) .admin-toolbar input,
:global(.dark) .admin-toolbar select,
:global(.dark) .table-input {
  border-color: #2f464f;
  color: #e7f2f8;
  background: rgba(17, 24, 22, 0.94);
}

:global(.dark) .admin-table-shell h2,
:global(.dark) .empty-panel h2,
:global(.dark) .admin-toolbar label span,
:global(.dark) .admin-table-wrap td.model-name-cell strong,
:global(.dark) .group-main-panel > strong,
:global(.dark) .admin-table-wrap th,
:global(.dark) .admin-table-wrap td {
  color: #eef7f4;
}

:global(.dark) .admin-tabs,
:global(.dark) .soft-btn,
:global(.dark) .inline-mini-btn,
:global(.dark) .admin-table-wrap th,
:global(.dark) .group-config-list,
:global(.dark) .group-meta-line span,
:global(.dark) .metric-strip span,
:global(.dark) .group-image-panel .muted-text,
:global(.dark) .mini-price-grid span,
:global(.dark) .skeleton-list span {
  border-color: #2f464f;
  color: #d8e7e2;
  background: #17211f;
}

:global(.dark) .admin-table-wrap td .image-price-cell > strong,
:global(.dark) .group-image-panel .image-price-cell > strong,
:global(.dark) .metric-strip b,
:global(.dark) .mini-price-grid span {
  color: #eef7f4;
}

:global(.dark) .group-main-panel > small,
:global(.dark) .compact-field span,
:global(.dark) .panel-label,
:global(.dark) .metric-strip em {
  color: #b7c9c4;
}

@media (max-width: 1080px) {
  .admin-toolbar {
    grid-template-columns: 1fr 1fr;
  }

  .group-config-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .group-manage-panel {
    grid-template-columns: minmax(0, 140px) minmax(0, 1fr);
    align-items: end;
  }
}

@media (max-width: 680px) {
  .admin-toolbar {
    grid-template-columns: 1fr;
  }

  .admin-status-row,
  .table-head,
  .table-actions {
    align-items: stretch;
    flex-direction: column;
  }

  .admin-tabs,
  .primary-btn,
  .soft-btn {
    width: 100%;
  }

  .group-config-list {
    padding: 8px;
  }

  .group-config-row,
  .group-manage-panel {
    grid-template-columns: 1fr;
  }

  .group-billing-panel .recharge-cell {
    grid-template-columns: 1fr;
  }

  .metric-strip {
    grid-template-columns: 1fr;
  }
}
</style>
