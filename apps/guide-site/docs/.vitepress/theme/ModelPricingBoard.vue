<template>
  <div class="pricing-app">
    <header class="tool-topbar">
      <a class="tool-brand" href="./">
        <img class="brand-mark" :src="guideLogoSrc" width="34" height="34" alt="" aria-hidden="true" />
        <span>Token向云指南</span>
      </a>
      <nav aria-label="独立页面导航">
        <a href="./playground">模型试用</a>
        <a href="./pricing" aria-current="page">模型价格</a>
        <a href="./feedback">在线反馈</a>
        <a href="./">指南首页</a>
      </nav>
    </header>

    <main class="pricing-shell">
      <section class="pricing-hero" aria-labelledby="pricing-title">
        <div>
          <h1 id="pricing-title">模型价格参考</h1>
          <p>
            由 guide-api 汇总模型、分组倍率和管理员展示配置，快速估算接入前成本。
            实际扣费仍以主站后台展示和请求记录为准。
          </p>
        </div>
        <div class="hero-actions">
          <a class="primary-link" href="./playground">先试用模型</a>
          <a href="./feedback">价格问题反馈</a>
        </div>
      </section>

      <section class="pricing-board" aria-label="模型价格参考">
        <aside class="pricing-sidebar">
      <section class="pricing-panel pricing-summary">
        <div class="pricing-panel-head">
          <div>
            <h2>模型价格</h2>
            <p>{{ sourceText }}</p>
          </div>
          <span class="count-badge">{{ rows.length }}</span>
        </div>
        <div class="summary-grid">
          <div>
            <strong>{{ models.length }}</strong>
            <span>展示模型</span>
          </div>
          <div>
            <strong>{{ groups.length }}</strong>
            <span>展示分组</span>
          </div>
          <div>
            <strong>{{ providerCount }}</strong>
            <span>供应商</span>
          </div>
        </div>
      </section>

      <section class="pricing-panel">
        <div class="pricing-panel-head">
          <h2>供应商</h2>
          <button class="soft-btn" type="button" :disabled="loading" @click="loadPricing">
            刷新
          </button>
        </div>
        <div class="category-list" role="list">
          <button
            v-for="option in providerOptions"
            :key="option.value"
            type="button"
            :class="{ active: activeProvider === option.value }"
            @click="selectProvider(option.value)"
          >
            <span>{{ option.label }}</span>
            <em>{{ option.count }}</em>
          </button>
        </div>
      </section>

      <section class="pricing-panel model-list-panel">
        <div class="pricing-panel-head">
          <h2>模型列表</h2>
          <span>{{ filteredModelOptions.length }} 个</span>
        </div>
        <div class="mini-model-list">
          <button
            v-for="model in filteredModelOptions"
            :key="model.key"
            type="button"
            :class="{ active: selectedModelName === model.name }"
            @click="selectModel(model.name)"
          >
            <span class="avatar">{{ model.short }}</span>
            <strong>{{ model.label }}</strong>
            <em>{{ model.count }} 组</em>
          </button>
        </div>
      </section>
    </aside>

    <div class="pricing-main">
      <div class="pricing-toolbar">
        <label class="pricing-search">
          <span>$</span>
          <input v-model="searchQuery" type="search" placeholder="搜索模型、分组或供应商" />
        </label>
        <div class="toolbar-selects" aria-label="价格筛选">
          <label>
            <span>口径</span>
            <select v-model="priceMode">
              <option value="effective">套餐折算成本</option>
              <option value="group">倍率折算成本</option>
              <option value="official">官方汇率换算</option>
            </select>
          </label>
          <label>
            <span>排序</span>
            <select v-model="sortMode">
              <option value="model">按模型名</option>
              <option value="group">按分组</option>
              <option value="input">输入价格</option>
              <option value="output">输出价格</option>
              <option value="discount">折扣比例</option>
            </select>
          </label>
        </div>
        <div class="toolbar-actions" aria-label="价格显示设置">
          <button type="button" :class="{ active: unitMode === 'M' }" @click="unitMode = 'M'">
            M
          </button>
          <button type="button" :class="{ active: unitMode === 'K' }" @click="unitMode = 'K'">
            K
          </button>
        </div>
      </div>

      <nav class="provider-tabs" aria-label="模型供应商">
        <button
          v-for="option in providerOptions"
          :key="option.value"
          type="button"
            :class="{ active: activeProvider === option.value }"
            @click="selectProvider(option.value)"
          >
            {{ option.label }}
          </button>
        </nav>

      <section class="price-table-shell" aria-label="价格列表">
        <div class="table-head">
          <div>
            <h2>价格列表</h2>
            <p>
              当前显示 {{ modelGroups.length }} 个模型、{{ filteredRows.length }} 个套餐，{{ priceModeLabel }} / {{ unitLabel }}，
              人民币折算按 USD/CNY {{ usdToCny.toFixed(4) }} 计算
            </p>
          </div>
          <div class="table-head-actions">
            <button class="soft-btn" type="button" @click="resetFilters">重置筛选</button>
            <span class="data-note" :class="sourceBadgeClass">{{ sourceBadgeText }}</span>
          </div>
        </div>

        <div v-if="loading" class="loading-state">
          正在读取模型价格和分组配置...
        </div>

        <div v-else-if="errorMessage" class="empty-state">
          {{ errorMessage }}
        </div>

        <div v-else-if="modelGroups.length > 0" class="model-drawer-list">
          <article
            v-for="group in modelGroups"
            :key="group.key"
            class="model-drawer-card"
            :class="{ open: isModelExpanded(group.key) }"
          >
            <header class="model-drawer-head">
              <div class="model-parent-title">
                <span class="avatar">{{ group.model.provider_short }}</span>
                <div>
                  <h3>{{ group.model.display_name }}</h3>
                  <p>{{ group.model.provider_label }} · {{ group.model.model_name }}</p>
                </div>
              </div>
              <dl class="model-parent-metrics">
                <div v-for="metric in modelSummaryMetrics(group)" :key="metric.label">
                  <dt>{{ metric.label }}</dt>
                  <dd>{{ metric.value }}</dd>
                  <small>{{ metric.note }}</small>
                </div>
              </dl>
              <div class="model-parent-actions">
                <span class="billing-pill">{{ billingLabel(group.model.billing_mode) }}</span>
                <div class="discount-stack" aria-label="折扣口径">
                  <span
                    v-for="badge in modelBestDiscountBadges(group)"
                    :key="badge.key"
                    class="discount-pill"
                    :class="badge.key"
                  >
                    {{ badge.label }}
                  </span>
                </div>
                <button
                  type="button"
                  :aria-expanded="isModelExpanded(group.key)"
                  :aria-controls="`plans-${group.key}`"
                  @click="toggleModelGroup(group.key)"
                >
                  {{ isModelExpanded(group.key) ? '收起套餐' : `展开 ${group.rows.length} 个套餐` }}
                </button>
              </div>
            </header>

            <section
              v-if="isModelExpanded(group.key)"
              :id="`plans-${group.key}`"
              class="plan-drawer"
              aria-label="套餐价格"
            >
              <article
                v-for="row in group.rows"
                :key="row.key"
                class="plan-row"
                :class="{ 'has-image-breakdown': rowSupportsImage(row) }"
              >
                <div class="plan-info">
                  <strong>{{ row.group.display_name }}</strong>
                  <span>{{ rateSummary(row) }}</span>
                  <span v-if="rowSupportsImage(row)" class="image-inline-note">支持生图</span>
                </div>

                <dl class="plan-price-grid">
                  <div>
                    <dt>官方输入</dt>
                    <dd>{{ formatOfficialUsd(row, 'input') }}</dd>
                    <small>{{ officialBillingNote(row, 'input') }}</small>
                  </div>
                  <div>
                    <dt>官方{{ outputMetricLabel(row) }}</dt>
                    <dd>{{ formatOfficialUsd(row, outputPriceKey(row)) }}</dd>
                    <small>{{ officialBillingNote(row, outputPriceKey(row)) }}</small>
                  </div>
                  <div>
                    <dt>官方缓存</dt>
                    <dd>读 {{ formatOfficialUsd(row, 'cacheRead') }}</dd>
                    <small>写 {{ formatOfficialUsd(row, 'cacheWrite') }}</small>
                  </div>
                </dl>

                <div class="plan-tail">
                  <div class="discount-stack" aria-label="折扣口径">
                    <span
                      v-for="badge in discountBadges(row)"
                      :key="badge.key"
                      class="discount-pill"
                      :class="badge.key"
                    >
                      {{ badge.label }}
                    </span>
                  </div>
                  <div class="plan-cost-summary">
                    <strong>{{ compactPriceModeLabel }}</strong>
                    <span>{{ planCostSummary(row) }}</span>
                  </div>
                </div>

                <section v-if="rowSupportsImage(row)" class="plan-image-breakdown" aria-label="分辨率生图价格">
                  <div class="image-breakdown-head">
                    <strong>分辨率价格</strong>
                    <span>{{ priceModeLabel }} · {{ imageRateModeLabel(row.group) }}</span>
                    <em>{{ imageBreakdownCaption }}</em>
                  </div>
                  <dl class="image-resolution-grid">
                    <div v-for="item in imageResolutionItems(row)" :key="item.label">
                      <dt>{{ item.label }}</dt>
                      <dd>{{ item.value }}</dd>
                      <small>{{ item.note }}</small>
                      <small v-if="item.basis" class="image-resolution-basis">{{ item.basis }}</small>
                    </div>
                  </dl>
                  <p v-if="!hasImageResolutionPrices(row)" class="image-missing-note">
                    该分组已允许生图，但暂未配置 1K/2K/4K 分辨率原价。
                  </p>
                </section>
              </article>
            </section>
          </article>
        </div>

        <p v-else class="empty-state">
          暂无可展示价格。请先配置 sub2api 数据源，并在 guide-api 管理接口中确认模型和分组展示。
        </p>
      </section>

      <section class="pricing-footnote">
        <h2>价格说明</h2>
        <ul>
          <li>模型名称和官方价格由 guide-api 通过 sub2api 管理接口读取；前端不写死模型价格。</li>
          <li>平台扣额度始终按模型官方美元价执行；套餐不会改变官方单价，只会影响同样额度折算成人民币后的成本。</li>
          <li>套餐折算成本按“官方美元价 × 分组倍率 × 支付人民币 ÷ 到账美元额度”估算，真实扣费以主站后台和请求记录为准。</li>
          <li>折扣同时展示额度口径和人民币口径：额度口径对比平台余额，人民币口径对比官方 USD/CNY 汇率换算成本。</li>
          <li>生图价格先按 sub2api 规则计算官方额度消耗，再按分组的支付/到账比例折算为人民币。</li>
          <li>管理员可以在 guide-api 中控制模型、分组是否展示，以及配置支付到账比例、排序和备注。</li>
        </ul>
      </section>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { withBase } from 'vitepress'

type PriceKey = 'input' | 'output' | 'cacheRead' | 'cacheWrite' | 'imageOutput'

interface ImagePriceTiers {
  '1k': number | null
  '2k': number | null
  '4k': number | null
}

interface PricingSource {
  configured: boolean
  status: 'live' | 'partial' | 'unconfigured'
  fetched_at: string
  warnings: string[]
}

interface PricingModel {
  provider: string
  provider_label: string
  provider_short: string
  model_name: string
  display_name: string
  billing_mode: string
  capabilities?: {
    image_generation?: boolean
  }
  is_featured: boolean
  sort_order: number
  note: string
  pricing_found: boolean
  prices: {
    input_usd_per_million: number | null
    output_usd_per_million: number | null
    cache_write_usd_per_million: number | null
    cache_read_usd_per_million: number | null
    image_output_usd_per_million: number | null
    per_request_usd: number | null
    output_cost_per_image_usd?: number | null
    default_image_prices_usd?: ImagePriceTiers
  }
}

interface PricingGroup {
  provider: string
  provider_label: string
  provider_short: string
  source_id: string
  name: string
  display_name: string
  description?: string
  is_exclusive: boolean
  rate_multiplier: number
  recharge_multiplier: number
  recharge_pay_cny?: number
  recharge_credit_usd?: number
  recharge_reference_source?: string
  recharge_reference_label?: string
  effective_rate: number
  allow_image_generation?: boolean
  image_rate_independent?: boolean
  image_rate_multiplier?: number
  image_effective_rate?: number
  image_prices_usd?: {
    '1k': number | null
    '2k': number | null
    '4k': number | null
  }
  default_image_prices_usd?: ImagePriceTiers
  has_image_prices?: boolean
  sort_order: number
  note: string
}

interface PricingReference {
  source: PricingSource
  exchange: {
    usd_to_cny: number
  }
  display?: {
    provider_order?: string[]
  }
  models: PricingModel[]
  groups: PricingGroup[]
}

interface PricingRow {
  key: string
  model: PricingModel
  group: PricingGroup
}

interface ModelPriceGroup {
  key: string
  model: PricingModel
  rows: PricingRow[]
}

interface DiscountBadge {
  key: 'quota' | 'rmb'
  label: string
}

const guideLogoSrc = withBase('/logo-80.png')
const data = ref<PricingReference | null>(null)
const loading = ref(false)
const errorMessage = ref('')
const searchQuery = ref('')
const activeProvider = ref('all')
const sortMode = ref<'model' | 'group' | 'input' | 'output' | 'discount'>('model')
const priceMode = ref<'effective' | 'group' | 'official'>('effective')
const unitMode = ref<'M' | 'K'>('M')
const selectedModelName = ref('')
const expandedModelKeys = ref<string[]>([])
const imageResolutionLabels = [
  { key: '1k', label: '1K' },
  { key: '2k', label: '2K' },
  { key: '4k', label: '4K' },
] as const

const models = computed(() => data.value?.models || [])
const groups = computed(() => data.value?.groups || [])
const usdToCny = computed(() => data.value?.exchange.usd_to_cny || 6.8102)
const providerOrder = computed(() => data.value?.display?.provider_order || [])

const rows = computed<PricingRow[]>(() => {
  return models.value.flatMap((model) => {
    const matchedGroups = groups.value.filter((group) => {
      if (group.provider !== model.provider) return false
      return !modelSupportsImage(model) || groupSupportsImage(group)
    })
    return matchedGroups.map((group) => ({
      key: `${model.provider}:${model.model_name}:${group.source_id}`,
      model,
      group,
    }))
  })
})

const providerOptions = computed(() => {
  const entries = new Map<string, { value: string; label: string; count: number }>()
  for (const row of rows.value) {
    const current = entries.get(row.model.provider)
    if (current) {
      current.count += 1
    } else {
      entries.set(row.model.provider, {
        value: row.model.provider,
        label: row.model.provider_label,
        count: 1,
      })
    }
  }
  return [
    { value: 'all', label: '全部', count: rows.value.length },
    ...Array.from(entries.values()).sort((a, b) => {
      return providerRank(a.value) - providerRank(b.value)
        || a.label.localeCompare(b.label, 'en', { sensitivity: 'base' })
    }),
  ]
})

const providerCount = computed(() => providerOptions.value.length - 1)

const filteredRows = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  return rows.value
    .filter((row) => activeProvider.value === 'all' || row.model.provider === activeProvider.value)
    .filter((row) => !selectedModelName.value || row.model.model_name === selectedModelName.value)
    .filter((row) => {
      if (!query) return true
      return [
        row.model.display_name,
        row.model.model_name,
        row.model.provider_label,
        row.group.display_name,
        row.group.name,
      ].some((value) => value.toLowerCase().includes(query))
    })
    .sort((a, b) => {
      switch (sortMode.value) {
        case 'group':
          return comparePlanRows(a, b) || compareModelRows(a, b)
        case 'input':
          return numericPrice(a, 'input') - numericPrice(b, 'input')
        case 'output':
          return numericPrice(a, outputPriceKey(a)) - numericPrice(b, outputPriceKey(b))
        case 'discount':
          return rowDiscountMultiplier(a) - rowDiscountMultiplier(b)
        default:
          return compareModelRows(a, b) || comparePlanRows(a, b)
      }
    })
})

const modelGroups = computed<ModelPriceGroup[]>(() => {
  const grouped = new Map<string, ModelPriceGroup>()
  for (const row of filteredRows.value) {
    const key = `${row.model.provider}:${row.model.model_name}`
    const current = grouped.get(key)
    if (current) {
      current.rows.push(row)
    } else {
      grouped.set(key, {
        key,
        model: row.model,
        rows: [row],
      })
    }
  }
  return Array.from(grouped.values())
    .map((group) => ({
      ...group,
      rows: [...group.rows].sort(comparePlanRows),
    }))
    .sort(compareModelGroups)
})

const filteredModelOptions = computed(() => {
  const entries = new Map<string, { key: string; name: string; label: string; short: string; count: number }>()
  const query = searchQuery.value.trim().toLowerCase()
  for (const row of rows.value) {
    if (activeProvider.value !== 'all' && row.model.provider !== activeProvider.value) continue
    if (query && ![
      row.model.display_name,
      row.model.model_name,
      row.model.provider_label,
      row.group.display_name,
      row.group.name,
    ].some((value) => value.toLowerCase().includes(query))) continue
    const key = `${row.model.provider}:${row.model.model_name}`
    const current = entries.get(key)
    if (current) {
      current.count += 1
    } else {
      entries.set(key, {
        key,
        name: row.model.model_name,
        label: row.model.display_name,
        short: row.model.provider_short,
        count: 1,
      })
    }
  }
  return Array.from(entries.values())
})

const sourceText = computed(() => {
  const source = data.value?.source
  if (!source) return '读取 guide-api 聚合价格'
  if (!source.configured) return '待配置 sub2api 数据源'
  if (source.status === 'live') return '已同步 sub2api 模型与分组'
  return '部分数据已同步'
})

const sourceBadgeText = computed(() => {
  const status = data.value?.source.status
  if (status === 'live') return '实时参考'
  if (status === 'partial') return '部分同步'
  return '待配置'
})

const sourceBadgeClass = computed(() => ({
  live: data.value?.source.status === 'live',
  partial: data.value?.source.status === 'partial',
}))

const priceModeLabel = computed(() => {
  if (priceMode.value === 'official') return '官方汇率换算'
  if (priceMode.value === 'group') return '倍率折算成本'
  return '套餐折算成本'
})

const compactPriceModeLabel = computed(() => {
  if (priceMode.value === 'official') return '官方换算'
  if (priceMode.value === 'group') return '倍率折算'
  return '套餐折算'
})

const imageBreakdownCaption = computed(() => {
  if (priceMode.value === 'official') return '官方汇率换算'
  if (priceMode.value === 'group') return '倍率折算人民币'
  return '套餐折算人民币'
})

const unitLabel = computed(() => unitMode.value === 'M' ? '100 万 token' : '1000 token')

watch(modelGroups, syncExpandedModels)

onMounted(() => {
  void loadPricing()
})

async function loadPricing() {
  loading.value = true
  errorMessage.value = ''
  try {
    const response = await fetch('/guide-api/pricing/reference', {
      headers: { accept: 'application/json' },
    })
    const body = await response.json()
    if (!response.ok || !body?.ok) {
      throw new Error(body?.error?.message || '模型价格读取失败')
    }
    data.value = body.data
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '模型价格读取失败'
  } finally {
    loading.value = false
  }
}

function resetFilters() {
  searchQuery.value = ''
  activeProvider.value = 'all'
  sortMode.value = 'model'
  selectedModelName.value = ''
  expandedModelKeys.value = []
}

function selectProvider(provider: string) {
  activeProvider.value = provider
  selectedModelName.value = ''
  expandedModelKeys.value = []
}

function selectModel(modelName: string) {
  selectedModelName.value = selectedModelName.value === modelName ? '' : modelName
  expandedModelKeys.value = []
}

function isModelExpanded(key: string) {
  return expandedModelKeys.value.includes(key)
}

function toggleModelGroup(key: string) {
  if (isModelExpanded(key)) {
    expandedModelKeys.value = expandedModelKeys.value.filter((item) => item !== key)
  } else {
    expandedModelKeys.value = [...expandedModelKeys.value, key]
  }
}

function syncExpandedModels() {
  const keys = modelGroups.value.map((group) => group.key)
  if (!keys.length) {
    expandedModelKeys.value = []
    return
  }
  const existing = expandedModelKeys.value.filter((key) => keys.includes(key))
  if (existing.length > 0) {
    expandedModelKeys.value = existing
    return
  }
  expandedModelKeys.value = keys.slice(0, 1)
}

function modelSummaryMetrics(group: ModelPriceGroup) {
  const row = bestDiscountRow(group)
  return [
    { label: '套餐', value: `${group.rows.length} 个`, note: '按分组排序展示' },
    { label: '官方输入', value: formatOfficialUsd(row, 'input'), note: officialBillingNote(row, 'input') },
    { label: `官方${outputMetricLabel(row)}`, value: formatOfficialUsd(row, outputPriceKey(row)), note: officialBillingNote(row, outputPriceKey(row)) },
  ]
}

function modelBestDiscountBadges(group: ModelPriceGroup) {
  return discountBadges(bestDiscountRow(group))
}

function bestDiscountRow(group: ModelPriceGroup) {
  return group.rows.reduce((best, row) => {
    return rowDiscountMultiplier(row) < rowDiscountMultiplier(best) ? row : best
  }, group.rows[0])
}

function compareModelGroups(a: ModelPriceGroup, b: ModelPriceGroup) {
  switch (sortMode.value) {
    case 'group':
      return comparePlanRows(a.rows[0], b.rows[0]) || compareModelRows(a.rows[0], b.rows[0])
    case 'input':
      return groupNumericPrice(a, 'input') - groupNumericPrice(b, 'input')
    case 'output':
      return groupNumericPrice(a, outputPriceKey(bestDiscountRow(a))) - groupNumericPrice(b, outputPriceKey(bestDiscountRow(b)))
    case 'discount':
      return rowDiscountMultiplier(bestDiscountRow(a)) - rowDiscountMultiplier(bestDiscountRow(b))
    default:
      return compareModelRows(a.rows[0], b.rows[0])
  }
}

function groupNumericPrice(group: ModelPriceGroup, key: PriceKey) {
  return Math.min(...group.rows.map((row) => numericPrice(row, key)))
}

function compareModelRows(a: PricingRow, b: PricingRow) {
  return providerRank(a.model.provider) - providerRank(b.model.provider)
    || a.model.sort_order - b.model.sort_order
    || a.model.display_name.localeCompare(b.model.display_name, 'zh-CN', { numeric: true, sensitivity: 'base' })
}

function comparePlanRows(a: PricingRow, b: PricingRow) {
  return providerRank(a.group.provider) - providerRank(b.group.provider)
    || a.group.sort_order - b.group.sort_order
    || a.group.display_name.localeCompare(b.group.display_name, 'zh-CN', { numeric: true, sensitivity: 'base' })
}

function outputPriceKey(row: PricingRow): PriceKey {
  return rowSupportsImage(row) && positiveNumberOrNull(row.model.prices.image_output_usd_per_million) != null
    ? 'imageOutput'
    : 'output'
}

function outputMetricLabel(row: PricingRow) {
  return rowSupportsImage(row) ? '图片' : '输出'
}

function planCostSummary(row: PricingRow) {
  const input = formatPrice(row, 'input')
  const output = formatPrice(row, outputPriceKey(row))
  return `输入 ${input} · ${outputMetricLabel(row)} ${output}`
}

function numericPrice(row: PricingRow, key: PriceKey) {
  const value = officialUsd(row, key)
  if (value == null) return Number.POSITIVE_INFINITY
  return value * priceCnyMultiplier(row, key)
}

function scaledPrice(row: PricingRow, key: PriceKey) {
  const value = numericPrice(row, key)
  if (!Number.isFinite(value)) return null
  return unitMode.value === 'M' ? value : value / 1000
}

function formatPrice(row: PricingRow, key: PriceKey) {
  const value = scaledPrice(row, key)
  if (value == null) return '-'
  const decimals = unitMode.value === 'M' ? 4 : 6
  return `¥${formatNumber(value, decimals)}/${unitMode.value}`
}

function formatOfficialUsd(row: PricingRow, key: PriceKey) {
  const value = officialUsd(row, key)
  if (value == null) return '-'
  const scaled = unitMode.value === 'M' ? value : value / 1000
  const decimals = unitMode.value === 'M' ? 4 : 6
  return `$${formatNumber(scaled, decimals)}/${unitMode.value}`
}

function officialBillingNote(row: PricingRow, key: PriceKey) {
  return officialUsd(row, key) == null ? '暂无官方价' : '按官方价扣额度'
}

function officialUsd(row: PricingRow, key: PriceKey) {
  const prices = row.model.prices
  if (key === 'input') return prices.input_usd_per_million
  if (key === 'output') return prices.output_usd_per_million
  if (key === 'cacheRead') return prices.cache_read_usd_per_million
  if (key === 'cacheWrite') return prices.cache_write_usd_per_million
  return prices.image_output_usd_per_million
}

function priceCnyMultiplier(row: PricingRow, key: PriceKey) {
  if (key === 'imageOutput' && rowSupportsImage(row)) return imageCnyMultiplier(row.group)
  if (priceMode.value === 'official') return usdToCny.value
  if (priceMode.value === 'group') return row.group.rate_multiplier * usdToCny.value
  return row.group.effective_rate
}

function rowDiscountMultiplier(row: PricingRow) {
  if (rowSupportsImage(row)) return imageDisplayMultiplier(row.group)
  if (priceMode.value === 'official') return 1
  if (priceMode.value === 'group') return row.group.rate_multiplier
  return row.group.effective_rate
}

function rmbDiscountMultiplier(row: PricingRow) {
  if (priceMode.value === 'official') return 1
  const exchange = positiveNumberOrNull(usdToCny.value) || 1
  const cnyMultiplier = rowSupportsImage(row)
    ? imageCnyMultiplier(row.group)
    : priceCnyMultiplier(row, 'input')
  return cnyMultiplier / exchange
}

function rateSummary(row: PricingRow) {
  return `官方价扣额度 · ${formatRate(row.group.rate_multiplier)} / ${rechargeSummary(row.group)}`
}

function rechargeSummary(group: PricingGroup) {
  if (group.recharge_pay_cny && group.recharge_credit_usd) {
    return `¥${formatNumber(group.recharge_pay_cny, 2)} -> $${formatNumber(group.recharge_credit_usd, 2)}`
  }
  return `充值 ${formatRate(group.recharge_multiplier)}`
}

function discountBadges(row: PricingRow): DiscountBadge[] {
  return [
    { key: 'quota', label: formatDiscountBadge(rowDiscountMultiplier(row), '额度') },
    { key: 'rmb', label: formatDiscountBadge(rmbDiscountMultiplier(row), '人民币') },
  ]
}

function formatDiscountBadge(value: number, prefix: string) {
  const rate = Number(value)
  if (!Number.isFinite(rate)) return `${prefix}待计算`
  if (Math.abs(rate - 1) < 0.0005) return `${prefix}基准`
  if (rate < 1) return `${prefix}约 ${formatNumber(rate * 10, 2)} 折`
  return `${prefix}约 ${formatNumber(rate, 2)} 倍`
}

function rowSupportsImage(row: PricingRow) {
  return modelSupportsImage(row.model) && groupSupportsImage(row.group)
}

function modelSupportsImage(model: PricingModel) {
  if (model.capabilities?.image_generation) return true
  if (model.billing_mode === 'image') return true
  return looksLikeImageGenerationModel(model.model_name)
}

function looksLikeImageGenerationModel(modelName: string) {
  return /(^|[-_.:])(gpt[-_.]?image|dall[-_.]?e|imagen|image|image[-_.]?generation)(?=$|[-_.:0-9a-z])/.test(
    String(modelName || '').toLowerCase(),
  )
}

function groupSupportsImage(group: PricingGroup) {
  return Boolean(group.allow_image_generation || group.has_image_prices)
}

function hasImageResolutionPrices(row: PricingRow) {
  return imageResolutionLabels.some((item) => imageUnitPrice(row, item.key).value != null)
}

function imageResolutionItems(row: PricingRow) {
  return imageResolutionLabels.map((item) => ({
    label: item.label,
    value: formatImagePrice(row, item.key),
    note: imageOfficialNote(row, item.key),
    basis: imageRmbBasisNote(row, item.key),
  }))
}

function imageEffectiveMultiplier(group: PricingGroup) {
  return imageCnyMultiplier(group)
}

function imageCnyMultiplier(group: PricingGroup) {
  if (priceMode.value === 'official') return usdToCny.value
  if (priceMode.value === 'group') {
    const rate = group.image_rate_independent ? Number(group.image_rate_multiplier || 1) : Number(group.rate_multiplier || 1)
    return rate * usdToCny.value
  }
  return Number(group.image_effective_rate || 1)
}

function imageDisplayMultiplier(group: PricingGroup) {
  if (priceMode.value === 'official') return 1
  if (priceMode.value === 'group') {
    return group.image_rate_independent ? Number(group.image_rate_multiplier || 1) : Number(group.rate_multiplier || 1)
  }
  return Number(group.image_effective_rate || 1)
}

function formatImagePrice(row: PricingRow, key: keyof ImagePriceTiers) {
  const rmb = imageDisplayCnyPrice(row, key)
  if (rmb == null) return '-'
  return `¥${formatNumber(rmb, 4)}/张`
}

function imageOfficialNote(row: PricingRow, key: keyof ImagePriceTiers) {
  const { value, source } = imageUnitPrice(row, key)
  if (value == null) return '未配置'
  const quotaCost = imageQuotaUsdPrice(row, key)
  const quotaText = quotaCost == null ? `$${formatNumber(value, 4)}` : `$${formatNumber(quotaCost, 4)}`
  return `扣额度 ${quotaText}/张 · ${source}`
}

function imageRmbBasisNote(row: PricingRow, key: keyof ImagePriceTiers) {
  if (imageUnitPrice(row, key).value == null) return ''
  if (priceMode.value === 'official') return `按 USD/CNY ${formatNumber(usdToCny.value, 4)}`
  if (priceMode.value === 'group') return `${imageRateModeLabel(row.group)} · 官方汇率`

  const payCny = positiveNumberOrNull(row.group.recharge_pay_cny)
  const creditUsd = positiveNumberOrNull(row.group.recharge_credit_usd)
  if (payCny && creditUsd) {
    return `按 ¥${formatNumber(payCny, 2)} -> $${formatNumber(creditUsd, 2)}`
  }
  return `按 ${formatRate(row.group.recharge_multiplier || 1)} 充值折算`
}

function imageDisplayCnyPrice(row: PricingRow, key: keyof ImagePriceTiers) {
  if (priceMode.value === 'official') {
    const unitPrice = imageUnitPrice(row, key).value
    return unitPrice == null ? null : unitPrice * usdToCny.value
  }
  if (priceMode.value === 'group') {
    const quotaCost = imageQuotaUsdPrice(row, key)
    return quotaCost == null ? null : quotaCost * usdToCny.value
  }
  return imagePlanRmbPrice(row, key)
}

function imagePlanRmbPrice(row: PricingRow, key: keyof ImagePriceTiers) {
  const quotaCost = imageQuotaUsdPrice(row, key)
  if (quotaCost == null) return null
  const payCny = positiveNumberOrNull(row.group.recharge_pay_cny)
  const creditUsd = positiveNumberOrNull(row.group.recharge_credit_usd)
  if (payCny && creditUsd) {
    return quotaCost * (payCny / creditUsd)
  }
  const quotaMultiplier = imageQuotaMultiplier(row.group)
  if (quotaMultiplier <= 0) return 0
  return quotaCost * Number(row.group.image_effective_rate || 1) / quotaMultiplier
}

function imageQuotaUsdPrice(row: PricingRow, key: keyof ImagePriceTiers) {
  const unitPrice = imageUnitPrice(row, key).value
  if (unitPrice == null) return null
  return unitPrice * imageQuotaMultiplier(row.group)
}

function imageQuotaMultiplier(group: PricingGroup) {
  const multiplier = group.image_rate_independent ? group.image_rate_multiplier : group.rate_multiplier
  const numeric = Number(multiplier)
  return Number.isFinite(numeric) && numeric >= 0 ? numeric : 1
}

function imageUnitPrice(row: PricingRow, key: keyof ImagePriceTiers) {
  const groupValue = row.group.image_prices_usd?.[key]
  if (groupValue != null) {
    return {
      value: groupValue,
      source: '分组价',
    }
  }

  const modelValue = row.model.prices.default_image_prices_usd?.[key]
  if (modelValue != null) {
    return {
      value: modelValue,
      source: row.model.prices.output_cost_per_image_usd != null ? '模型默认价' : '默认价',
    }
  }

  const fallbackValue = row.group.default_image_prices_usd?.[key]
  return {
    value: fallbackValue ?? null,
    source: fallbackValue == null ? '未配置' : '默认价',
  }
}

function imageRateModeLabel(group: PricingGroup) {
  return group.image_rate_independent ? `生图独立 ${formatRate(group.image_rate_multiplier || 1)}` : `跟随文本 ${formatRate(group.rate_multiplier)}`
}

function formatRate(value: number) {
  return `${formatNumber(value, 3)}x`
}

function billingLabel(value: string) {
  if (value === 'image') return '图片'
  if (value === 'per_request') return '按次'
  return 'Token'
}

function providerRank(provider: string) {
  const index = providerOrder.value.indexOf(provider)
  return index >= 0 ? index : 999
}

function formatNumber(value: number, decimals: number) {
  return value.toFixed(decimals).replace(/0+$/, '').replace(/\.$/, '')
}

function positiveNumberOrNull(value: unknown) {
  const num = Number(value)
  return Number.isFinite(num) && num > 0 ? num : null
}
</script>

<style scoped>
.pricing-app {
  --studio-bg: #eef5f4;
  --studio-surface: #ffffff;
  --studio-panel: #f8fbfb;
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

.pricing-app,
.pricing-app * {
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
.hero-actions {
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

.tool-topbar a:focus-visible,
.hero-actions a:focus-visible {
  outline: 3px solid rgba(15, 139, 131, 0.18);
  outline-offset: 2px;
}

.pricing-shell {
  width: min(1500px, calc(100% - 36px));
  margin: 0 auto;
  padding: 14px 0 24px;
}

.pricing-hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  padding: 16px;
  margin-bottom: 12px;
  border: 1px solid var(--studio-line);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.78);
}

.pricing-hero h1 {
  margin: 0;
  color: var(--studio-ink);
  font-size: 28px;
  line-height: 1.18;
  letter-spacing: 0;
  text-wrap: balance;
}

.pricing-hero p {
  max-width: 760px;
  margin: 8px 0 0;
  color: var(--studio-muted);
  font-size: 14px;
  line-height: 1.75;
  text-wrap: pretty;
}

.hero-actions {
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

.hero-actions a:hover {
  border-color: var(--studio-accent-strong);
  color: var(--studio-accent-strong);
}

.hero-actions .primary-link:hover {
  color: #ffffff;
  background: var(--studio-accent-strong);
}

.pricing-board {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 12px;
  color: #102033;
}

.pricing-sidebar,
.pricing-main {
  min-width: 0;
}

.pricing-sidebar {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.pricing-panel,
.price-table-shell,
.pricing-toolbar,
.pricing-footnote {
  border: 1px solid #d5e0ec;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.94);
}

.pricing-panel {
  padding: 10px;
}

.pricing-panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
}

.pricing-panel h2,
.price-table-shell h2,
.pricing-footnote h2 {
  margin: 0;
  padding: 0;
  border: 0;
  color: #102033;
  font-size: 16px;
  line-height: 1.3;
}

.pricing-panel p,
.price-table-shell p,
.pricing-footnote li {
  margin: 0;
  color: #516882;
  font-size: 13px;
  line-height: 1.6;
}

.count-badge {
  display: inline-flex;
  min-width: 28px;
  height: 24px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  color: #0b6765;
  font-size: 12px;
  font-weight: 800;
  background: #dff4f1;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.summary-grid div {
  min-height: 58px;
  padding: 9px;
  border-radius: 8px;
  background: #f2f4f7;
}

.summary-grid strong {
  display: block;
  color: #061425;
  font-size: 18px;
}

.summary-grid span,
.mini-model-list em,
.category-list em,
.model-parent-title p,
.plan-info span,
td span {
  color: #526982;
  font-size: 12px;
  font-style: normal;
}

.category-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.category-list button,
.mini-model-list button,
.toolbar-actions button,
.provider-tabs button,
.soft-btn {
  border: 1px solid transparent;
  border-radius: 8px;
  color: #27384b;
  font: inherit;
  background: transparent;
  cursor: pointer;
  transition: border-color 160ms ease, background 160ms ease, color 160ms ease;
}

.category-list button {
  display: flex;
  min-height: 42px;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
  text-align: left;
}

.category-list button.active,
.category-list button:hover,
.mini-model-list button.active,
.mini-model-list button:hover {
  color: #0b6765;
  background: #e6f4f1;
}

.soft-btn {
  min-height: 34px;
  padding: 0 13px;
  border-color: #d0dbe8;
  background: #f5f8fb;
  font-weight: 700;
}

.soft-btn:disabled {
  cursor: default;
  opacity: 0.6;
}

.pricing-search input {
  width: 100%;
  border: 1px solid #c7d4e4;
  border-radius: 8px;
  color: #18283b;
  background: #ffffff;
}

.mini-model-list {
  display: grid;
  max-height: 250px;
  gap: 8px;
  overflow: auto;
  padding-right: 2px;
}

.mini-model-list button {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr) auto;
  min-height: 52px;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  text-align: left;
}

.mini-model-list strong {
  overflow: hidden;
  color: #26384f;
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.avatar {
  display: inline-flex;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  color: #0b6765;
  font-size: 11px;
  font-weight: 800;
  background: #dff4f1;
}

.pricing-main {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.pricing-toolbar {
  display: grid;
  grid-template-columns: minmax(240px, 1fr) auto auto;
  gap: 10px;
  padding: 10px;
}

.pricing-search {
  display: flex;
  min-height: 44px;
  align-items: center;
  gap: 8px;
  border: 1px solid #c7d4e4;
  border-radius: 8px;
  background: #f8fafc;
  padding: 0 12px;
}

.pricing-search span {
  color: #60758d;
  font-weight: 800;
}

.pricing-search input {
  min-width: 0;
  height: 40px;
  border: 0;
  background: transparent;
  outline: none;
}

.toolbar-selects {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.toolbar-selects label {
  display: grid;
  grid-template-columns: auto minmax(116px, 1fr);
  min-height: 40px;
  align-items: center;
  gap: 6px;
  border: 1px solid #d5e0ec;
  border-radius: 8px;
  padding: 0 8px;
  background: #f8fafc;
}

.toolbar-selects span {
  color: #526982;
  font-size: 12px;
  font-weight: 800;
}

.toolbar-selects select {
  min-width: 0;
  border: 0;
  color: #18283b;
  background: transparent;
  font: inherit;
  font-size: 13px;
  font-weight: 800;
  outline: 0;
}

.toolbar-actions,
.provider-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.toolbar-actions button {
  min-height: 40px;
  padding: 0 13px;
  border-color: #d5e0ec;
  background: #f8fafc;
  font-weight: 700;
}

.toolbar-actions button.active,
.provider-tabs button.active {
  border-color: #7ab8b1;
  color: #0b6765;
  background: #f1faf8;
}

.provider-tabs {
  align-items: center;
  flex-wrap: nowrap;
  overflow-x: auto;
  padding-bottom: 2px;
}

.provider-tabs button {
  flex: 0 0 auto;
  min-height: 34px;
  padding: 0 4px;
  border-radius: 0;
  color: #43576f;
  font-weight: 800;
}

.provider-tabs button.active {
  border-color: transparent;
  border-bottom-color: #0b6765;
  background: transparent;
}

.table-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px;
}

.table-head-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.data-note,
.billing-pill,
.discount-pill {
  display: inline-flex;
  min-height: 22px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 0 8px;
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
}

.data-note,
.billing-pill {
  color: #526982;
  background: #edf2f7;
}

.data-note.live,
.discount-pill {
  color: #04743b;
  background: #dff9e9;
}

.discount-pill.rmb {
  color: #1d4e89;
  background: #e7f0ff;
}

.data-note.partial {
  color: #8a4b05;
  background: #fff1d8;
}

.image-inline-note {
  display: inline-flex;
  min-height: 26px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  color: #875305;
  background: #fff1d8;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
}

.image-inline-note {
  padding: 0 9px;
}

.plan-image-breakdown {
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: minmax(150px, 0.25fr) minmax(0, 1fr);
  gap: 10px;
  align-items: stretch;
  margin-top: -2px;
  padding-top: 10px;
  border-top: 1px solid #e3edf5;
}

.image-breakdown-head {
  display: grid;
  align-content: center;
  gap: 4px;
  min-width: 0;
}

.image-breakdown-head strong {
  color: #102033;
  font-size: 13px;
  line-height: 1.35;
}

.image-breakdown-head span,
.image-breakdown-head em {
  color: #526982;
  font-size: 12px;
  font-style: normal;
  line-height: 1.35;
}

.image-breakdown-head em {
  color: #875305;
  font-weight: 800;
}

.image-resolution-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  margin: 0;
}

.image-resolution-grid div {
  display: grid;
  min-width: 0;
  min-height: 76px;
  align-content: center;
  border-radius: 8px;
  padding: 8px;
  background: #f7fafb;
}

.image-resolution-grid dt {
  color: #526982;
  font-size: 12px;
  font-weight: 800;
}

.image-resolution-grid dd {
  margin: 3px 0 0;
  color: #071626;
  font-size: 13px;
  font-weight: 900;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.image-resolution-grid small {
  margin-top: 2px;
  color: #65758a;
  font-size: 11px;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.image-resolution-grid .image-resolution-basis {
  color: #526982;
}

.image-missing-note {
  margin: 0;
  color: #8a4b05;
  font-size: 12px;
  line-height: 1.5;
}

.model-drawer-list {
  display: grid;
  gap: 8px;
  padding: 0 14px 14px;
}

.model-drawer-card {
  border: 1px solid #d5e0ec;
  border-radius: 8px;
  background: #ffffff;
  overflow: hidden;
  transition: border-color 160ms ease, background 160ms ease;
}

.model-drawer-card.open {
  border-color: #b7d9d4;
}

.model-drawer-head {
  display: grid;
  grid-template-columns: minmax(230px, 0.92fr) minmax(300px, 1.08fr) minmax(140px, auto);
  gap: 10px;
  align-items: center;
  padding: 8px 12px;
}

.model-parent-title {
  display: flex;
  gap: 10px;
  align-items: center;
  min-width: 0;
}

.model-parent-title > div,
.model-parent-metrics,
.plan-price-grid {
  min-width: 0;
}

.model-parent-title h3 {
  margin: 0;
  overflow-wrap: anywhere;
  color: #102033;
  font-size: 15px;
  line-height: 1.35;
}

.model-parent-title p {
  overflow: hidden;
  max-width: 100%;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-parent-metrics,
.plan-price-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
  gap: 6px;
  margin: 0;
}

.model-parent-metrics div,
.plan-price-grid div {
  display: grid;
  min-width: 0;
  min-height: 48px;
  align-content: center;
  border-radius: 8px;
  background: #f5f8fb;
  padding: 5px 8px;
}

.model-parent-metrics div {
  min-height: 46px;
}

.model-parent-metrics dt,
.plan-price-grid dt {
  white-space: nowrap;
}

.model-parent-metrics dd,
.plan-price-grid dd {
  margin: 2px 0 0;
  color: #071626;
  font-size: 13px;
  font-weight: 800;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.model-parent-metrics small,
.plan-price-grid small {
  display: block;
  margin-top: 2px;
  color: #526982;
  font-size: 11px;
  line-height: 1.25;
  overflow-wrap: anywhere;
}

.model-parent-actions,
.plan-tail {
  display: grid;
  align-content: center;
  justify-items: end;
  gap: 5px;
}

.model-parent-actions .billing-pill,
.model-parent-actions .discount-pill,
.plan-tail .discount-pill {
  width: 100%;
  min-width: 72px;
}

.discount-stack {
  display: grid;
  width: 100%;
  min-width: 108px;
  gap: 4px;
}

.plan-cost-summary {
  display: flex;
  min-width: 190px;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 2px 6px;
  color: #526982;
  font-size: 11px;
  line-height: 1.25;
  text-align: right;
}

.plan-cost-summary strong {
  color: #102033;
  font-size: 11px;
  line-height: 1.25;
}

.plan-cost-summary span {
  overflow-wrap: anywhere;
}

.model-parent-actions button {
  min-height: 26px;
  border: 1px solid #d0dbe8;
  border-radius: 8px;
  padding: 0 8px;
  color: #27384b;
  background: #f5f8fb;
  font: inherit;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.model-parent-actions button:hover,
.model-parent-actions button:focus-visible {
  border-color: #7ab8b1;
  color: #0b6765;
  background: #eef8f7;
}

.model-parent-actions button:focus-visible {
  outline: 3px solid rgba(15, 139, 131, 0.18);
  outline-offset: 2px;
}

.plan-drawer {
  display: grid;
  gap: 0;
  margin: 0 12px 8px 52px;
  border-top: 1px solid #e3edf5;
}

.plan-row {
  display: grid;
  grid-template-columns: minmax(220px, 0.78fr) minmax(360px, 1.08fr) minmax(190px, 0.56fr);
  gap: 8px;
  align-items: center;
  padding: 7px 10px;
  border-bottom: 1px solid #edf2f7;
}

.plan-row.has-image-breakdown {
  align-items: start;
}

.plan-row:last-child {
  border-bottom: 0;
}

.plan-info {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.plan-info strong {
  color: #102033;
  font-size: 13px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.plan-info span {
  color: #526982;
  font-size: 12px;
  line-height: 1.35;
}

.pricing-footnote {
  padding: 18px;
}

.pricing-footnote ul {
  margin: 10px 0 0;
  padding-left: 20px;
}

.empty-state,
.loading-state {
  padding: 30px 18px;
  color: #526982;
  text-align: center;
}

:global(.dark) .pricing-app {
  --studio-bg: #0e1717;
  --studio-surface: #161f20;
  --studio-panel: #101a1b;
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
:global(.dark) .pricing-hero {
  border-color: var(--studio-line);
  background: rgba(16, 26, 27, 0.88);
}

:global(.dark) .tool-brand,
:global(.dark) .pricing-hero h1 {
  color: var(--studio-ink);
}

:global(.dark) .tool-topbar nav a,
:global(.dark) .pricing-hero p {
  color: var(--studio-muted);
}

:global(.dark) .hero-actions a {
  border-color: var(--studio-line);
  color: var(--studio-ink);
  background: #101a1b;
}

:global(.dark) .hero-actions .primary-link {
  border-color: var(--studio-accent);
  color: #072322;
  background: var(--studio-accent);
}

:global(.dark) .pricing-board {
  color: #e7f2f8;
}

:global(.dark) .pricing-panel,
:global(.dark) .price-table-shell,
:global(.dark) .pricing-toolbar,
:global(.dark) .pricing-footnote,
:global(.dark) .model-drawer-card {
  border-color: #2f464f;
  background: rgba(17, 24, 22, 0.94);
}

:global(.dark) .pricing-panel h2,
:global(.dark) .price-table-shell h2,
:global(.dark) .pricing-footnote h2,
:global(.dark) .model-parent-title h3,
:global(.dark) .plan-info strong,
:global(.dark) .plan-cost-summary strong,
:global(.dark) .image-breakdown-head strong,
:global(.dark) .summary-grid strong,
:global(.dark) .model-parent-metrics dd,
:global(.dark) .plan-price-grid dd,
:global(.dark) .image-resolution-grid dd {
  color: #eef7f4;
}

:global(.dark) .plan-cost-summary {
  color: #9fb2b0;
}

:global(.dark) .discount-pill.rmb {
  color: #bcd8ff;
  background: rgba(87, 151, 233, 0.2);
}

:global(.dark) .summary-grid div,
:global(.dark) .model-parent-metrics div,
:global(.dark) .plan-price-grid div,
:global(.dark) .image-resolution-grid div,
:global(.dark) .toolbar-actions button,
:global(.dark) .toolbar-selects label,
:global(.dark) .toolbar-selects select,
:global(.dark) .pricing-search,
:global(.dark) .pricing-search input {
  border-color: #2f464f;
  color: #e7f2f8;
  background: #17211f;
}

:global(.dark) .model-drawer-head,
:global(.dark) .plan-row,
:global(.dark) .plan-drawer,
:global(.dark) .plan-image-breakdown {
  border-top-color: #2f464f;
  border-bottom-color: #2f464f;
}

@media (max-width: 1180px) {
  .pricing-board {
    grid-template-columns: 1fr;
  }

  .pricing-main {
    order: 1;
  }

  .pricing-sidebar {
    order: 2;
    display: grid;
    grid-template-columns: minmax(220px, 0.9fr) minmax(260px, 1.1fr) minmax(240px, 1fr);
  }

  .model-list-panel {
    grid-column: auto;
  }

  .mini-model-list {
    max-height: 174px;
  }
}

@media (max-width: 980px) {
  .pricing-sidebar,
  .model-drawer-head {
    grid-template-columns: 1fr;
  }

  .plan-row {
    grid-template-columns: minmax(170px, 0.72fr) minmax(0, 1fr);
    align-items: start;
    row-gap: 6px;
  }

  .plan-price-grid,
  .plan-tail {
    grid-column: 2;
  }

  .plan-price-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 5px;
  }

  .plan-drawer {
    margin: 0 10px 10px;
  }

  .plan-cost-summary {
    min-width: min(100%, 260px);
    justify-content: flex-end;
    text-align: left;
  }

  .model-parent-actions,
  .plan-tail {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-start;
  }

  .model-parent-actions .billing-pill,
  .model-parent-actions .discount-pill,
  .plan-tail .discount-pill {
    width: auto;
  }

  .discount-stack {
    display: flex;
    flex-wrap: wrap;
    width: auto;
  }
}

@media (max-width: 640px) {
  .plan-row {
    grid-template-columns: 1fr;
  }

  .plan-price-grid,
  .plan-tail {
    grid-column: auto;
  }

  .plan-price-grid {
    grid-template-columns: 1fr;
  }

  .plan-cost-summary {
    justify-content: flex-start;
  }
}

@media (max-width: 760px) {
  .tool-topbar {
    display: grid;
    grid-template-columns: 1fr;
    align-items: flex-start;
    gap: 10px;
    padding: 10px 12px;
  }

  .tool-topbar nav {
    flex-wrap: nowrap;
    justify-content: flex-start;
    width: 100%;
    overflow-x: auto;
    padding-bottom: 2px;
  }

  .tool-topbar nav a {
    flex: 0 0 auto;
    min-height: 32px;
    padding: 0 9px;
    font-size: 12px;
  }

  .pricing-shell {
    width: min(100% - 16px, 760px);
    padding: 10px 0 18px;
  }

  .pricing-hero {
    display: grid;
    gap: 12px;
    padding: 12px;
  }

  .pricing-hero h1 {
    font-size: 24px;
  }

  .pricing-hero p {
    font-size: 13px;
    line-height: 1.6;
  }

  .hero-actions {
    justify-content: flex-start;
  }

  .hero-actions a {
    flex: 1 1 150px;
  }

  .pricing-sidebar,
  .pricing-toolbar {
    grid-template-columns: 1fr;
  }

  .pricing-toolbar {
    padding: 8px;
  }

  .model-drawer-list {
    padding: 0 10px 10px;
  }

  .model-drawer-head,
  .plan-row {
    padding: 8px;
  }

  .plan-image-breakdown {
    grid-template-columns: 1fr;
  }

  .image-breakdown-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 10px;
  }

  .table-head {
    flex-direction: column;
  }
}

@media (max-width: 640px) {
  .model-list-panel {
    display: none;
  }

  .pricing-panel {
    padding: 9px;
  }

  .summary-grid div {
    min-height: 50px;
    padding: 8px;
  }
}

@media (max-width: 430px) {
  .pricing-shell {
    width: min(100% - 12px, 430px);
  }

  .pricing-hero p,
  .pricing-footnote {
    display: none;
  }

  .pricing-panel-head,
  .table-head {
    gap: 8px;
  }

  .price-table-shell h2 {
    font-size: 15px;
  }

  .table-head p {
    font-size: 12px;
    line-height: 1.45;
  }

  .model-parent-metrics,
  .plan-price-grid {
    gap: 6px;
  }

  .model-parent-metrics div,
  .plan-price-grid div {
    min-height: 60px;
    padding: 7px;
  }

  .image-resolution-grid {
    grid-template-columns: 1fr;
  }
}
</style>
