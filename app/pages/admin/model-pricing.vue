<script setup lang="ts">
import { ArrowDownAZ, ArrowUpAZ, Download, GripVertical, ListOrdered, RefreshCw, RotateCcw, Save, Search, Trash2 } from 'lucide-vue-next'
import type { ApiSuccess } from '~/types/api'
import { apiErrorMessage } from '~/types/api'
import type { GroupModelPrice, GroupModelPricingOverride, ModelPricingCatalog, ModelPricingDisplayOrderItem } from '~/types/model-pricing'

definePageMeta({ layout: 'admin' })
useSeoMeta({ title: '模型定价', robots: 'noindex, nofollow' })

type PricingDraft = GroupModelPricingOverride & {
  key: string
  vendor: string
  source_multiplier: number
  upstream_base_prices: GroupModelPrice['upstream_base_prices']
  upstream_image_prices: GroupModelPrice['upstream_image_prices']
  base_prices: GroupModelPrice['base_prices']
  base_price_source: GroupModelPrice['base_price_source']
  upstream_price_source: GroupModelPrice['upstream_price_source']
  time_pricing: GroupModelPrice['time_pricing']
  billing_mode: GroupModelPrice['billing_mode']
}

const admin = useAdminSessionState()
const catalog = ref<ModelPricingCatalog | null>(null)
const drafts = ref<PricingDraft[]>([])
const selectedVendorId = ref('')
const selectedGroupId = ref('')
const query = ref('')
const visibilityFilter = ref<'all' | 'visible' | 'hidden'>('all')
const loading = ref(false)
const saving = ref(false)
const sorting = ref(false)
const syncingModelKey = ref('')
const bulkAction = ref<'' | 'overwrite' | 'restore' | 'restore-all'>('')
const loaded = ref(false)
const groupDisplayNameDraft = ref('')
const priceUnit = ref<'usd' | 'rmb'>('usd')
const notice = reactive({ type: 'idle' as 'idle' | 'success' | 'error', message: '' })

const selectedVendor = computed(() => catalog.value?.vendors.find(item => item.id === selectedVendorId.value) || catalog.value?.vendors[0] || null)
const selectedGroup = computed(() => selectedVendor.value?.groups.find(item => item.id === selectedGroupId.value) || selectedVendor.value?.groups[0] || null)
const draftByKey = computed(() => new Map(drafts.value.map(item => [item.key, item])))
const orderedGroupDrafts = computed(() => (selectedGroup.value?.models || []).flatMap((model) => {
  const item = draftByKey.value.get(`${selectedVendor.value?.id}:${selectedGroup.value?.id}:${model.model_name.toLowerCase()}`)
  return item ? [item] : []
}))
const currentDrafts = computed(() => {
  const value = query.value.trim().toLowerCase()
  return orderedGroupDrafts.value.filter((item) => {
    const matchesQuery = !value || item.model_name.toLowerCase().includes(value)
    const matchesVisibility = visibilityFilter.value === 'all'
      || (visibilityFilter.value === 'visible' ? item.is_visible : !item.is_visible)
    return matchesQuery && matchesVisibility
  })
})
const groupDrafts = computed(() => orderedGroupDrafts.value)
const visibilityCounts = computed(() => ({
  all: orderedGroupDrafts.value.length,
  visible: orderedGroupDrafts.value.filter(item => item.is_visible).length,
  hidden: orderedGroupDrafts.value.filter(item => !item.is_visible).length,
}))

watch(() => admin.session.value?.admin, (authenticated) => {
  if (authenticated && !loaded.value) void loadCatalog(false)
}, { immediate: true })

async function loadCatalog(refresh: boolean) {
  loading.value = true
  notice.type = 'idle'
  notice.message = ''
  try {
    const response = await $fetch<ApiSuccess<ModelPricingCatalog>>('/api/admin/model-pricing/config', { query: { refresh } })
    catalog.value = response.data
    selectDefaults()
    rebuildDrafts()
    loaded.value = true
  } catch (cause) {
    notice.type = 'error'
    notice.message = apiErrorMessage(cause, '模型定价读取失败')
  } finally {
    loading.value = false
  }
}

function selectDefaults() {
  const vendors = catalog.value?.vendors || []
  if (!vendors.some(item => item.id === selectedVendorId.value)) selectedVendorId.value = vendors[0]?.id || ''
  const groups = vendors.find(item => item.id === selectedVendorId.value)?.groups || []
  if (!groups.some(item => item.id === selectedGroupId.value)) selectedGroupId.value = groups[0]?.id || ''
  groupDisplayNameDraft.value = groups.find(item => item.id === selectedGroupId.value)?.display_name || ''
}

function rebuildDrafts() {
  drafts.value = (catalog.value?.vendors || []).flatMap(vendor => vendor.groups.flatMap(group => group.models.map(model => ({
    key: `${vendor.id}:${group.id}:${model.model_name.toLowerCase()}`,
    vendor: vendor.id,
    group_id: group.id,
    model_name: model.model_name,
    is_enabled: model.override_enabled,
    is_visible: model.is_visible,
    multiplier: model.manual_multiplier,
    input_usd_per_million: model.manual_prices.input_usd_per_million,
    output_usd_per_million: model.manual_prices.output_usd_per_million,
    cache_read_usd_per_million: model.manual_prices.cache_read_usd_per_million,
    cache_write_usd_per_million: model.manual_prices.cache_write_usd_per_million,
    image_price_1k: model.manual_image_prices.find(item => item.label.toLowerCase() === '1k')?.price ?? null,
    image_price_2k: model.manual_image_prices.find(item => item.label.toLowerCase() === '2k')?.price ?? null,
    image_price_4k: model.manual_image_prices.find(item => item.label.toLowerCase() === '4k')?.price ?? null,
    official_input_usd_per_million: model.manual_official_prices.input_usd_per_million,
    official_output_usd_per_million: model.manual_official_prices.output_usd_per_million,
    official_cache_read_usd_per_million: model.manual_official_prices.cache_read_usd_per_million,
    official_cache_write_usd_per_million: model.manual_official_prices.cache_write_usd_per_million,
    official_image_price_1k: model.manual_official_image_prices.find(item => item.label.toLowerCase() === '1k')?.price ?? null,
    official_image_price_2k: model.manual_official_image_prices.find(item => item.label.toLowerCase() === '2k')?.price ?? null,
    official_image_price_4k: model.manual_official_image_prices.find(item => item.label.toLowerCase() === '4k')?.price ?? null,
    official_price_unit: model.official_price_unit,
    note: model.note || null,
    source_multiplier: model.source_multiplier,
    upstream_base_prices: model.upstream_base_prices,
    upstream_image_prices: model.upstream_image_prices,
    base_prices: model.base_prices,
    base_price_source: model.base_price_source,
    upstream_price_source: model.upstream_price_source,
    time_pricing: model.time_pricing,
    billing_mode: model.billing_mode,
  }))))
  if (priceUnit.value === 'rmb') convertDraftValues('usd', 'rmb')
}

const priceFields = [
  'input_usd_per_million', 'output_usd_per_million', 'cache_read_usd_per_million', 'cache_write_usd_per_million',
  'image_price_1k', 'image_price_2k', 'image_price_4k',
] as const

const officialPriceFields = [
  'official_input_usd_per_million', 'official_output_usd_per_million', 'official_cache_read_usd_per_million', 'official_cache_write_usd_per_million',
  'official_image_price_1k', 'official_image_price_2k', 'official_image_price_4k',
] as const

function exchangeRate() {
  return catalog.value?.exchange.usd_to_cny || 1
}

function convertDraftValues(from: 'usd' | 'rmb', to: 'usd' | 'rmb') {
  if (from === to) return
  const rate = exchangeRate()
  for (const item of drafts.value) {
    for (const field of priceFields) {
      const value = item[field]
      if (value == null) continue
      item[field] = Number((Number(value) * (to === 'rmb' ? rate : 1 / rate)).toFixed(8)) as never
    }
  }
}

function setPriceUnit(unit: 'usd' | 'rmb') {
  convertDraftValues(priceUnit.value, unit)
  priceUnit.value = unit
}

function toUsdDraft(item: PricingDraft) {
  if (priceUnit.value === 'usd') return item
  const rate = exchangeRate()
  const converted = { ...item }
  for (const field of priceFields) {
    if (field.startsWith('official_')) continue
    const value = converted[field]
    if (value == null) continue
    converted[field] = Number((Number(value) / rate).toFixed(8)) as never
  }
  return converted
}

function changeOfficialUnit(item: PricingDraft, event: Event) {
  const unit = (event.target as HTMLSelectElement).value as 'usd' | 'rmb'
  item.official_price_unit = unit
}

function officialUnitLabel(item: PricingDraft) {
  return item.official_price_unit === 'rmb' ? '人民币原值' : 'USD'
}

function findCatalogModel(value: ModelPricingCatalog, item: PricingDraft) {
  return value.vendors
    .find(vendor => vendor.id === item.vendor)?.groups
    .find(group => group.id === item.group_id)?.models
    .find(model => model.model_name.toLowerCase() === item.model_name.toLowerCase()) || null
}

function draftPlatformPrice(value: number | null) {
  if (value == null || priceUnit.value === 'usd') return value
  return Number((value * exchangeRate()).toFixed(8))
}

function imageTierPrice(tiers: GroupModelPrice['upstream_image_prices'], label: string) {
  return tiers.find(item => item.label.toLowerCase() === label.toLowerCase())?.price ?? null
}

function clearManualPricing(item: PricingDraft) {
  for (const field of priceFields) item[field] = null as never
  for (const field of officialPriceFields) item[field] = null as never
  item.multiplier = null
}

function overwriteWithUpstream(item: PricingDraft, model: GroupModelPrice) {
  clearManualPricing(item)
  item.is_enabled = true
  if (model.billing_mode === 'image' || model.billing_mode === 'per_request') {
    item.image_price_1k = draftPlatformPrice(imageTierPrice(model.upstream_image_prices, '1K'))
    item.image_price_2k = draftPlatformPrice(imageTierPrice(model.upstream_image_prices, '2K'))
    item.image_price_4k = draftPlatformPrice(imageTierPrice(model.upstream_image_prices, '4K'))
    item.official_image_price_1k = imageTierPrice(model.upstream_image_prices, '1K')
    item.official_image_price_2k = imageTierPrice(model.upstream_image_prices, '2K')
    item.official_image_price_4k = imageTierPrice(model.upstream_image_prices, '4K')
    return
  }

  item.input_usd_per_million = draftPlatformPrice(model.upstream_base_prices.input_usd_per_million)
  item.output_usd_per_million = draftPlatformPrice(model.upstream_base_prices.output_usd_per_million)
  item.cache_read_usd_per_million = draftPlatformPrice(model.upstream_base_prices.cache_read_usd_per_million)
  item.cache_write_usd_per_million = draftPlatformPrice(model.upstream_base_prices.cache_write_usd_per_million)
  item.official_input_usd_per_million = model.upstream_base_prices.input_usd_per_million
  item.official_output_usd_per_million = model.upstream_base_prices.output_usd_per_million
  item.official_cache_read_usd_per_million = model.upstream_base_prices.cache_read_usd_per_million
  item.official_cache_write_usd_per_million = model.upstream_base_prices.cache_write_usd_per_million
}

function applyUpstreamModel(item: PricingDraft, model: GroupModelPrice) {
  item.source_multiplier = model.source_multiplier
  item.upstream_base_prices = model.upstream_base_prices
  item.upstream_image_prices = model.upstream_image_prices
  item.base_prices = model.upstream_base_prices
  item.base_price_source = model.upstream_price_source
  item.upstream_price_source = model.upstream_price_source
  item.time_pricing = model.time_pricing
  item.billing_mode = model.billing_mode
}

async function refreshModelPricing(item: PricingDraft, overwrite: boolean) {
  if (syncingModelKey.value) return
  syncingModelKey.value = item.key
  notice.type = 'idle'
  notice.message = ''
  try {
    const response = await $fetch<ApiSuccess<ModelPricingCatalog>>('/api/admin/model-pricing/config', { query: { refresh: true } })
    if (response.data.source.status !== 'live') {
      throw new Error(response.data.source.warnings.join(' ') || '主站价格同步失败，未修改当前模型。')
    }
    const model = findCatalogModel(response.data, item)
    if (!model) throw new Error('主站返回的数据中没有这个模型。')

    if (catalog.value) {
      catalog.value.source = response.data.source
      catalog.value.exchange = response.data.exchange
    }
    applyUpstreamModel(item, model)

    if (overwrite) overwriteWithUpstream(item, model)
    notice.type = 'success'
    notice.message = overwrite
      ? `已将“${item.model_name}”的最新主站价格填入手动配置，请保存当前分组。`
      : `已重新拉取“${item.model_name}”的主站价格，手动配置未改动。`
  } catch (cause) {
    notice.type = 'error'
    notice.message = apiErrorMessage(cause, '模型价格重新拉取失败')
  } finally {
    syncingModelKey.value = ''
  }
}

function restoreUpstreamPricing(item: PricingDraft) {
  clearManualPricing(item)
  item.is_enabled = false
  notice.type = 'success'
  notice.message = `“${item.model_name}”已恢复为跟随上游，请保存当前分组。`
}

async function overwriteGroupPricing() {
  if (!selectedGroup.value || !groupDrafts.value.length || bulkAction.value) return
  const confirmed = window.confirm(`将清空“${selectedGroup.value.name}”中全部模型的手动价格，并使用最新主站价格重新覆盖。是否继续？`)
  if (!confirmed) return

  bulkAction.value = 'overwrite'
  notice.type = 'idle'
  notice.message = ''
  try {
    const response = await $fetch<ApiSuccess<ModelPricingCatalog>>('/api/admin/model-pricing/config', { query: { refresh: true } })
    if (response.data.source.status !== 'live') {
      throw new Error(response.data.source.warnings.join(' ') || '主站价格同步失败，未修改当前分组。')
    }

    const matches = groupDrafts.value.flatMap((item) => {
      const model = findCatalogModel(response.data, item)
      return model ? [{ item, model }] : []
    })
    if (!matches.length) throw new Error('主站返回的数据中没有当前分组的模型。')

    if (catalog.value) {
      catalog.value.source = response.data.source
      catalog.value.exchange = response.data.exchange
    }
    for (const { item, model } of matches) {
      applyUpstreamModel(item, model)
      overwriteWithUpstream(item, model)
    }

    const saved = await saveGroup()
    if (saved) {
      const skipped = groupDrafts.value.length - matches.length
      notice.type = 'success'
      notice.message = `已用最新主站价格覆盖 ${matches.length} 个模型${skipped ? `，跳过 ${skipped} 个主站已不存在的模型` : ''}。`
    }
  } catch (cause) {
    notice.type = 'error'
    notice.message = apiErrorMessage(cause, '批量覆盖模型价格失败')
  } finally {
    bulkAction.value = ''
  }
}

async function restoreGroupPricing() {
  if (!selectedGroup.value || !groupDrafts.value.length || bulkAction.value) return
  const confirmed = window.confirm(`将清空“${selectedGroup.value.name}”中全部模型的手动价格、官方价格和手动倍率，恢复跟随上游。是否继续？`)
  if (!confirmed) return

  bulkAction.value = 'restore'
  for (const item of groupDrafts.value) {
    clearManualPricing(item)
    item.is_enabled = false
  }
  const saved = await saveGroup()
  if (saved) {
    notice.type = 'success'
    notice.message = `已清空“${selectedGroup.value?.name || ''}”中全部模型的手动价格。`
  }
  bulkAction.value = ''
}

async function clearAllManualPricing() {
  if (bulkAction.value || saving.value) return
  const confirmed = window.confirm('将清空所有分组、所有模型的手动平台基础价、手动官方价格和手动倍率，并全部恢复为跟随上游。模型显示状态、排序、分组名称和备注会保留。此操作不可撤销，是否继续？')
  if (!confirmed) return

  bulkAction.value = 'restore-all'
  notice.type = 'idle'
  notice.message = ''
  try {
    const response = await $fetch<ApiSuccess<{ cleared: number }>>('/api/admin/model-pricing/overrides/clear', {
      method: 'POST',
    })
    await loadCatalog(false)
    notice.type = 'success'
    notice.message = `已清空全部手动定价，共处理 ${response.data.cleared} 条模型配置。`
  } catch (cause) {
    notice.type = 'error'
    notice.message = apiErrorMessage(cause, '全部手动定价清空失败')
  } finally {
    bulkAction.value = ''
  }
}

function selectVendor(id: string) {
  selectedVendorId.value = id
  selectedGroupId.value = catalog.value?.vendors.find(item => item.id === id)?.groups[0]?.id || ''
  query.value = ''
  groupDisplayNameDraft.value = selectedGroup.value?.display_name || ''
}

function selectGroup(id: string) {
  selectedGroupId.value = id
  query.value = ''
  groupDisplayNameDraft.value = selectedGroup.value?.display_name || ''
}

async function saveGroupSettings() {
  if (!selectedGroup.value) return
  saving.value = true
  notice.type = 'idle'
  notice.message = ''
  try {
    await $fetch<ApiSuccess<unknown>>('/api/admin/model-pricing/groups', {
      method: 'PUT',
      body: { group_id: selectedGroup.value.id, display_name: groupDisplayNameDraft.value.trim() || null },
    })
    notice.type = 'success'
    notice.message = '分组显示名称已保存。'
    await loadCatalog(false)
  } catch (cause) {
    notice.type = 'error'
    notice.message = apiErrorMessage(cause, '分组名称保存失败')
  } finally {
    saving.value = false
  }
}

async function saveGroup(): Promise<boolean> {
  if (!groupDrafts.value.length) return false
  saving.value = true
  notice.type = 'idle'
  notice.message = ''
  try {
    await $fetch<ApiSuccess<GroupModelPricingOverride[]>>('/api/admin/model-pricing/overrides/bulk', {
      method: 'PUT',
      body: { items: groupDrafts.value.map(item => {
        const draft = toUsdDraft(item)
        const {
          key: _key,
          vendor: _vendor,
          source_multiplier: _sourceMultiplier,
          upstream_base_prices: _upstreamBasePrices,
          upstream_image_prices: _upstreamImagePrices,
          base_prices: _basePrices,
          base_price_source: _basePriceSource,
          upstream_price_source: _upstreamPriceSource,
          time_pricing: _timePricing,
          billing_mode: _billingMode,
          ...payload
        } = draft
        return payload
      }) },
    })
    await loadCatalog(false)
    notice.type = 'success'
    notice.message = `已保存“${selectedGroup.value?.name || ''}”中 ${groupDrafts.value.length} 个模型的定价。`
    return true
  } catch (cause) {
    notice.type = 'error'
    notice.message = apiErrorMessage(cause, '模型定价保存失败')
    return false
  } finally {
    saving.value = false
  }
}

type OrderScope = ModelPricingDisplayOrderItem['scope']

const dragItem = ref<{ scope: OrderScope, key: string } | null>(null)

function startOrderDrag(event: DragEvent, scope: OrderScope, key: string) {
  dragItem.value = { scope, key }
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', `${scope}:${key}`)
  }
}

function finishOrderDrag() {
  dragItem.value = null
}

async function dropOrder(scope: OrderScope, targetKey: string) {
  const source = dragItem.value
  finishOrderDrag()
  if (!source || source.scope !== scope || source.key === targetKey || !catalog.value) return

  if (scope === 'vendor') {
    moveBefore(catalog.value.vendors, source.key, targetKey, item => item.id)
    await persistOrder(scope, '', catalog.value.vendors.map(item => item.id))
    return
  }
  if (scope === 'group' && selectedVendor.value) {
    moveBefore(selectedVendor.value.groups, source.key, targetKey, item => item.id)
    await persistOrder(scope, selectedVendor.value.id, selectedVendor.value.groups.map(item => item.id))
    return
  }
  if (scope === 'model' && selectedVendor.value && selectedGroup.value) {
    moveBefore(selectedGroup.value.models, source.key, targetKey, item => item.model_name)
    await persistOrder(scope, `${selectedVendor.value.id}:${selectedGroup.value.id}`, selectedGroup.value.models.map(item => item.model_name))
  }
}

function moveBefore<T>(items: T[], sourceKey: string, targetKey: string, keyOf: (item: T) => string) {
  const sourceIndex = items.findIndex(item => keyOf(item) === sourceKey)
  const targetIndex = items.findIndex(item => keyOf(item) === targetKey)
  if (sourceIndex < 0 || targetIndex < 0) return
  const [moved] = items.splice(sourceIndex, 1)
  if (!moved) return
  items.splice(items.findIndex(item => keyOf(item) === targetKey), 0, moved)
}

function modelPosition(modelName: string) {
  return (selectedGroup.value?.models.findIndex(item => item.model_name === modelName) ?? -1) + 1
}

async function moveModelToPosition(modelName: string, event: Event) {
  if (!selectedVendor.value || !selectedGroup.value) return
  const input = event.target as HTMLInputElement
  const models = selectedGroup.value.models
  const sourceIndex = models.findIndex(item => item.model_name === modelName)
  const requested = Math.trunc(Number(input.value))
  const targetIndex = Math.max(0, Math.min(models.length - 1, Number.isFinite(requested) ? requested - 1 : sourceIndex))
  if (sourceIndex < 0 || sourceIndex === targetIndex) {
    input.value = String(sourceIndex + 1)
    return
  }
  const [moved] = models.splice(sourceIndex, 1)
  if (!moved) return
  models.splice(targetIndex, 0, moved)
  await persistOrder('model', `${selectedVendor.value.id}:${selectedGroup.value.id}`, models.map(item => item.model_name))
}

async function applyQuickModelOrder(mode: 'source' | 'name-asc' | 'name-desc') {
  if (!selectedVendor.value || !selectedGroup.value) return
  const models = selectedGroup.value.models
  const byName = (a: GroupModelPrice, b: GroupModelPrice) => a.model_name.localeCompare(b.model_name, 'en', { numeric: true, sensitivity: 'base' })
  if (mode === 'source') models.sort((a, b) => b.source_order - a.source_order || byName(b, a))
  if (mode === 'name-asc') models.sort(byName)
  if (mode === 'name-desc') models.sort((a, b) => byName(b, a))
  await persistOrder('model', `${selectedVendor.value.id}:${selectedGroup.value.id}`, models.map(item => item.model_name))
}

async function persistOrder(scope: OrderScope, parentKey: string, keys: string[]) {
  sorting.value = true
  try {
    await $fetch<ApiSuccess<ModelPricingDisplayOrderItem[]>>('/api/admin/model-pricing/order', {
      method: 'PUT',
      body: { items: keys.map((itemKey, index) => ({ scope, parent_key: parentKey, item_key: itemKey, sort_order: index * 10 })) },
    })
    notice.type = 'success'
    notice.message = '展示顺序已保存。'
  } catch (cause) {
    notice.type = 'error'
    notice.message = apiErrorMessage(cause, '展示顺序保存失败')
    await loadCatalog(false)
  } finally {
    sorting.value = false
  }
}

function sourcePrice(value: number | null) {
  if (value == null) return '上游无价格'
  const displayValue = priceUnit.value === 'rmb' ? value * exchangeRate() : value
  const prefix = priceUnit.value === 'rmb' ? '¥' : '$'
  return `${prefix}${displayValue.toFixed(displayValue < 1 ? 5 : 3).replace(/0+$/, '').replace(/\.$/, '')}`
}

function priceUnitLabel() {
  return priceUnit.value === 'rmb' ? '人民币' : '美元'
}

function subscriptionPayment() {
  const plan = selectedGroup.value?.subscription_plan
  if (!plan) return ''
  const symbol = plan.currency === 'CNY' ? '¥' : `${plan.currency} `
  return `${symbol}${formatSubscriptionNumber(plan.price)}`
}

function formatSubscriptionNumber(value: number) {
  return value.toFixed(value < 1 ? 4 : 2).replace(/0+$/, '').replace(/\.$/, '')
}

function priceSourceLabel(source: GroupModelPrice['base_price_source'] | GroupModelPrice['upstream_price_source']) {
  return ({ official: '官方基础价', channel: '关联渠道价', group: '分组价卡', manual: '当前手动价' })[source]
}

function timePricingLabel(schedule: GroupModelPrice['time_pricing']) {
  if (!schedule) return '标准时段'
  const periods = schedule.periods.map(item => `${item.start_time.slice(0, 5)}–${item.end_time.slice(0, 5)} ${item.multiplier}x`).join('、')
  return `${schedule.timezone}${schedule.weekdays_only ? ' 工作日' : ''} · ${periods}`
}
</script>

<template>
  <AdminAccessGate>
    <div class="admin-page admin-model-pricing-page">
      <header class="admin-page-heading">
        <span>Group model pricing</span>
        <h1>模型定价</h1>
        <p>上游分组倍率是默认值。手动配置按“分组 + 模型”独立保存；拖动手柄可调整厂商、分组和模型的前台顺序。</p>
        <div class="admin-page-heading__actions">
          <div class="price-unit-switch" role="group" aria-label="手动平台基础价输入单位">
            <button type="button" :class="{ active: priceUnit === 'usd' }" @click="setPriceUnit('usd')">USD</button>
            <button type="button" :class="{ active: priceUnit === 'rmb' }" @click="setPriceUnit('rmb')">人民币</button>
          </div>
          <button class="secondary-command" type="button" :disabled="loading || sorting || Boolean(bulkAction)" @click="loadCatalog(true)"><RefreshCw :size="16" :class="{ spinning: loading }" />同步主站</button>
          <button class="secondary-command danger-command" type="button" :disabled="loading || saving || Boolean(bulkAction)" @click="clearAllManualPricing"><Trash2 :size="16" />{{ bulkAction === 'restore-all' ? '清空中...' : '清空所有' }}</button>
          <button class="primary-command" type="button" :disabled="saving || Boolean(bulkAction) || !groupDrafts.length" @click="saveGroup"><Save :size="16" />{{ saving ? '保存中...' : '保存当前分组' }}</button>
        </div>
      </header>

      <div v-if="catalog?.source.warnings.length" class="tool-alert">{{ catalog.source.warnings.join(' ') }}</div>
      <div v-if="notice.message" :class="['tool-alert', notice.type === 'error' ? 'tool-alert--error' : 'tool-alert--success']">{{ notice.message }}</div>
      <div v-if="loading && !catalog" class="loading-band">正在读取公开分组...</div>

      <div v-else-if="catalog?.vendors.length" class="admin-model-pricing-workspace">
        <nav class="admin-model-vendors" aria-label="模型厂商">
          <button v-for="vendor in catalog.vendors" :key="vendor.id" type="button" draggable="true" :class="{ active: selectedVendor?.id === vendor.id, dragging: dragItem?.scope === 'vendor' && dragItem.key === vendor.id }" @click="selectVendor(vendor.id)" @dragover.prevent @drop.prevent="dropOrder('vendor', vendor.id)" @dragstart="startOrderDrag($event, 'vendor', vendor.id)" @dragend="finishOrderDrag">
            <GripVertical class="pricing-drag-handle" :size="14" aria-label="拖动调整厂商顺序" title="拖动调整厂商顺序" @click.stop />
            <span class="admin-vendor-logo"><img v-if="vendor.logo_url" :src="vendor.logo_url" :alt="`${vendor.name} Logo`"><template v-else>{{ vendor.short }}</template></span><strong>{{ vendor.name }}</strong><small>{{ vendor.groups.length }} 组</small>
          </button>
        </nav>

        <div class="admin-model-pricing-body">
          <aside class="admin-model-groups">
            <header><span>{{ selectedVendor?.name }}</span><strong>公开分组</strong></header>
            <button v-for="group in selectedVendor?.groups || []" :key="group.id" type="button" draggable="true" :class="{ active: selectedGroup?.id === group.id, dragging: dragItem?.scope === 'group' && dragItem.key === group.id }" @click="selectGroup(group.id)" @dragover.prevent @drop.prevent="dropOrder('group', group.id)" @dragstart="startOrderDrag($event, 'group', group.id)" @dragend="finishOrderDrag">
              <strong><GripVertical class="pricing-drag-handle" :size="14" aria-label="拖动调整分组顺序" title="拖动调整分组顺序" @click.stop />{{ group.name }}</strong>
              <span><small>{{ group.models.length }} 个模型</small><em>{{ group.effective_multiplier }}x<span v-if="group.subscription_plan"> 订阅</span></em></span>
            </button>
          </aside>

          <section class="admin-model-editor">
            <header class="admin-model-editor__heading">
              <div><span>分组 {{ selectedGroup?.id }} / {{ selectedGroup?.platform }}</span><h2>{{ selectedGroup?.name }}</h2><p>分组默认倍率 {{ selectedGroup?.effective_multiplier }}x<template v-if="selectedGroup?.subscription_plan"> · {{ selectedGroup.subscription_plan.name }} · 实付 {{ subscriptionPayment() }}<template v-if="selectedGroup.subscription_plan.monthly_quota_usd != null"> · 月额度 {{ formatSubscriptionNumber(selectedGroup.subscription_plan.monthly_quota_usd) }} U</template><template v-if="selectedGroup.subscription_multiplier != null"> · 套餐折算 {{ formatSubscriptionNumber(selectedGroup.subscription_multiplier) }}x</template></template><template v-if="selectedGroup?.channel_name"> · 关联渠道 {{ selectedGroup.channel_name }}</template></p></div>
              <div class="admin-model-editor__controls">
                <div class="segmented-control model-visibility-filter" role="group" aria-label="按前台显示状态过滤">
                  <button type="button" :class="{ active: visibilityFilter === 'all' }" :aria-pressed="visibilityFilter === 'all'" @click="visibilityFilter = 'all'">全部 {{ visibilityCounts.all }}</button>
                  <button type="button" :class="{ active: visibilityFilter === 'visible' }" :aria-pressed="visibilityFilter === 'visible'" @click="visibilityFilter = 'visible'">前台显示 {{ visibilityCounts.visible }}</button>
                  <button type="button" :class="{ active: visibilityFilter === 'hidden' }" :aria-pressed="visibilityFilter === 'hidden'" @click="visibilityFilter = 'hidden'">前台隐藏 {{ visibilityCounts.hidden }}</button>
                </div>
                <label class="search-control"><Search :size="16" /><input v-model="query" type="search" placeholder="搜索当前分组模型"></label>
              </div>
            </header>
            <div class="model-group-name-editor">
              <label><span>前台分组名称</span><input v-model="groupDisplayNameDraft" maxlength="200" :placeholder="selectedGroup?.source_name || '沿用主站名称'"></label>
              <button class="secondary-command" type="button" :disabled="saving || !selectedGroup" @click="saveGroupSettings"><Save :size="15" />保存名称</button>
            </div>

            <div class="model-order-toolbar">
              <div class="model-order-toolbar__summary">
                <ListOrdered :size="17" />
                <span><strong>模型顺序</strong><small>{{ groupDrafts.length }} 个模型，可拖拽或输入序号精确调整</small></span>
              </div>
              <div class="model-order-toolbar__actions" aria-label="模型快速排序">
                <button type="button" :disabled="sorting" @click="applyQuickModelOrder('source')"><ListOrdered :size="14" />主站倒序</button>
                <button type="button" :disabled="sorting" @click="applyQuickModelOrder('name-asc')"><ArrowDownAZ :size="14" />名称升序</button>
                <button type="button" :disabled="sorting" @click="applyQuickModelOrder('name-desc')"><ArrowUpAZ :size="14" />名称降序</button>
                <span class="model-order-toolbar__bulk" aria-label="批量价格操作">
                  <button class="is-overwrite" type="button" :disabled="saving || Boolean(bulkAction)" @click="overwriteGroupPricing"><Download :size="14" />{{ bulkAction === 'overwrite' ? '覆盖中...' : '清空并重新覆盖全部' }}</button>
                  <button class="is-destructive" type="button" :disabled="saving || Boolean(bulkAction)" @click="restoreGroupPricing"><RotateCcw :size="14" />{{ bulkAction === 'restore' ? '清空中...' : '清空手动价格' }}</button>
                </span>
              </div>
            </div>

            <div class="admin-model-list" aria-label="当前分组模型配置">
              <article v-for="item in currentDrafts" :key="item.key" class="admin-model-item" :class="{ dragging: dragItem?.scope === 'model' && dragItem.key === item.model_name }" @dragover.prevent @drop.prevent="dropOrder('model', item.model_name)">
                <header class="admin-model-item__identity">
                  <div class="model-position-control">
                    <button class="pricing-row-drag" type="button" title="拖动调整模型顺序" draggable="true" @dragstart="startOrderDrag($event, 'model', item.model_name)" @dragend="finishOrderDrag"><GripVertical :size="15" /></button>
                    <label><span>序号</span><input type="number" min="1" :max="groupDrafts.length" :value="modelPosition(item.model_name)" :aria-label="`${item.model_name} 的展示序号`" :disabled="sorting" @change="moveModelToPosition(item.model_name, $event)"></label>
                  </div>

                  <div class="admin-model-item__name">
                    <div class="model-name-actions">
                      <strong>{{ item.model_name }}</strong>
                      <span>
                        <button type="button" title="重新拉取主站价格，保留手动配置" :aria-label="`重新拉取 ${item.model_name} 的主站价格`" :disabled="Boolean(syncingModelKey) || Boolean(bulkAction)" @click="refreshModelPricing(item, false)"><RefreshCw :size="14" :class="{ spinning: syncingModelKey === item.key }" /></button>
                        <button type="button" title="拉取并填入全部手动价格" :aria-label="`拉取并覆盖 ${item.model_name} 的全部价格`" :disabled="Boolean(syncingModelKey) || Boolean(bulkAction)" @click="refreshModelPricing(item, true)"><Download :size="14" /></button>
                        <button type="button" title="清空手动价格并恢复跟随上游" :aria-label="`恢复 ${item.model_name} 跟随上游`" :disabled="Boolean(syncingModelKey) || Boolean(bulkAction)" @click="restoreUpstreamPricing(item)"><RotateCcw :size="14" /></button>
                      </span>
                    </div>
                    <small>{{ item.billing_mode === 'image' ? '按张计费' : item.billing_mode === 'per_request' ? '按次计费' : selectedVendor?.name }}</small>
                  </div>

                  <div class="admin-model-item__states">
                    <label class="model-visibility-toggle"><input v-model="item.is_visible" type="checkbox"><span>{{ item.is_visible ? '前台展示' : '前台隐藏' }}</span></label>
                    <label class="model-override-toggle"><input v-model="item.is_enabled" type="checkbox"><span>{{ item.is_enabled ? '手动配置' : '跟随上游' }}</span></label>
                  </div>

                  <div class="admin-model-item__source">
                    <span>生效价源</span>
                    <strong class="model-pricing-source-value">{{ priceSourceLabel(item.upstream_price_source) }}</strong>
                    <small>{{ timePricingLabel(item.time_pricing) }}</small>
                  </div>

                  <label class="admin-model-note"><span>备注</span><input v-model="item.note" maxlength="1000" placeholder="可选" :disabled="!item.is_enabled"></label>
                </header>

                <div class="admin-model-item__pricing">
                  <label class="admin-model-multiplier"><span>手动倍率</span><input v-model.number="item.multiplier" type="number" min="0.0001" max="10000" step="0.01" :placeholder="String(item.source_multiplier)" :disabled="!item.is_enabled"><small>上游 {{ item.source_multiplier }}x</small></label>

                  <section class="admin-model-price-section">
                    <header><div><strong>平台基础价</strong><small>{{ priceUnitLabel() }} · 留空跟随{{ priceSourceLabel(item.upstream_price_source) }}</small></div></header>
                    <div v-if="item.billing_mode === 'image'" class="admin-price-input-grid admin-price-input-grid--image">
                      <label><span>1K / 张</span><input v-model.number="item.image_price_1k" type="number" min="0" step="0.0001" :placeholder="priceUnitLabel()" :disabled="!item.is_enabled"></label>
                      <label><span>2K / 张</span><input v-model.number="item.image_price_2k" type="number" min="0" step="0.0001" :placeholder="priceUnitLabel()" :disabled="!item.is_enabled"></label>
                      <label><span>4K / 张</span><input v-model.number="item.image_price_4k" type="number" min="0" step="0.0001" :placeholder="priceUnitLabel()" :disabled="!item.is_enabled"></label>
                    </div>
                    <div v-else class="admin-price-input-grid">
                      <label><span>输入</span><input v-model.number="item.input_usd_per_million" type="number" min="0" step="0.0001" :placeholder="sourcePrice(item.base_prices.input_usd_per_million)" :disabled="!item.is_enabled"></label>
                      <label><span>输出</span><input v-model.number="item.output_usd_per_million" type="number" min="0" step="0.0001" :placeholder="sourcePrice(item.base_prices.output_usd_per_million)" :disabled="!item.is_enabled"></label>
                      <label><span>缓存读</span><input v-model.number="item.cache_read_usd_per_million" type="number" min="0" step="0.0001" :placeholder="sourcePrice(item.base_prices.cache_read_usd_per_million)" :disabled="!item.is_enabled"></label>
                      <label><span>缓存写</span><input v-model.number="item.cache_write_usd_per_million" type="number" min="0" step="0.0001" :placeholder="sourcePrice(item.base_prices.cache_write_usd_per_million)" :disabled="!item.is_enabled"></label>
                    </div>
                  </section>

                  <section class="admin-model-price-section admin-model-price-section--official">
                    <header>
                      <div><strong>官方价格</strong><small>每个模型独立选择换算方式</small></div>
                      <select class="official-unit-select" :value="item.official_price_unit" aria-label="官方价格单位" @change="changeOfficialUnit(item, $event)">
                        <option value="usd">USD（按汇率换算）</option>
                        <option value="rmb">人民币（原值展示）</option>
                      </select>
                    </header>
                    <div v-if="item.billing_mode === 'image'" class="admin-price-input-grid admin-price-input-grid--image">
                      <label><span>1K / 张</span><input v-model.number="item.official_image_price_1k" type="number" min="0" step="0.0001" :placeholder="officialUnitLabel(item)" :disabled="!item.is_enabled"></label>
                      <label><span>2K / 张</span><input v-model.number="item.official_image_price_2k" type="number" min="0" step="0.0001" :placeholder="officialUnitLabel(item)" :disabled="!item.is_enabled"></label>
                      <label><span>4K / 张</span><input v-model.number="item.official_image_price_4k" type="number" min="0" step="0.0001" :placeholder="officialUnitLabel(item)" :disabled="!item.is_enabled"></label>
                    </div>
                    <div v-else class="admin-price-input-grid">
                      <label><span>输入</span><input v-model.number="item.official_input_usd_per_million" type="number" min="0" step="0.0001" placeholder="自动" :disabled="!item.is_enabled"></label>
                      <label><span>输出</span><input v-model.number="item.official_output_usd_per_million" type="number" min="0" step="0.0001" placeholder="自动" :disabled="!item.is_enabled"></label>
                      <label><span>缓存读</span><input v-model.number="item.official_cache_read_usd_per_million" type="number" min="0" step="0.0001" placeholder="自动" :disabled="!item.is_enabled"></label>
                      <label><span>缓存写</span><input v-model.number="item.official_cache_write_usd_per_million" type="number" min="0" step="0.0001" placeholder="自动" :disabled="!item.is_enabled"></label>
                    </div>
                  </section>
                </div>
              </article>
            </div>
            <div v-if="!currentDrafts.length" class="pricing-empty">当前分组没有符合筛选条件的模型。</div>
          </section>
        </div>
      </div>
      <div v-else-if="loaded" class="pricing-empty pricing-empty--standalone">暂无可配置的公开分组。</div>
    </div>
  </AdminAccessGate>
</template>
