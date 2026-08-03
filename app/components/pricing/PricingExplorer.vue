<script setup lang="ts">
import { ChevronDown, Image as ImageIcon, Search, Star } from 'lucide-vue-next'
import type { ImagePriceTiers, PricingGroup, PricingModel, PricingReference } from '~/types/pricing'

type PriceMode = 'effective' | 'group' | 'official'
type PriceKey = 'input' | 'output' | 'cacheRead' | 'cacheWrite'

const props = defineProps<{ reference: PricingReference }>()

const query = ref('')
const provider = ref('all')
const priceMode = ref<PriceMode>('effective')
const unit = ref<'M' | 'K'>('M')
const expanded = ref<string[]>([])

const providerOrder = computed(() => props.reference.display?.provider_order || [])
const providerOptions = computed(() => {
  const values = new Map<string, string>()
  for (const model of props.reference.models) values.set(model.provider, model.provider_label)
  return [...values.entries()].sort((a, b) => providerRank(a[0]) - providerRank(b[0]))
})

const visibleModels = computed(() => {
  const value = query.value.trim().toLowerCase()
  return props.reference.models
    .filter(model => provider.value === 'all' || model.provider === provider.value)
    .filter((model) => {
      if (!value) return true
      const groups = groupsForModel(model)
      return [model.display_name, model.model_name, model.provider_label, ...groups.flatMap(group => [group.display_name, group.name])]
        .some(item => String(item || '').toLowerCase().includes(value))
    })
    .filter(model => groupsForModel(model).length > 0)
    .sort((a, b) => providerRank(a.provider) - providerRank(b.provider)
      || Number(b.is_featured) - Number(a.is_featured)
      || a.sort_order - b.sort_order
      || a.display_name.localeCompare(b.display_name, 'zh-CN', { numeric: true }))
})

watch(visibleModels, (models) => {
  const valid = new Set(models.map(model => modelKey(model)))
  expanded.value = expanded.value.filter(key => valid.has(key))
  if (!expanded.value.length && models[0]) expanded.value = [modelKey(models[0])]
}, { immediate: true })

function groupsForModel(model: PricingModel) {
  return props.reference.groups
    .filter(group => group.provider === model.provider)
    .filter(group => !modelSupportsImage(model) || groupSupportsImage(group))
    .sort((a, b) => a.sort_order - b.sort_order || a.display_name.localeCompare(b.display_name, 'zh-CN', { numeric: true }))
}

function modelKey(model: PricingModel) {
  return `${model.provider}:${model.model_name}`
}

function toggle(model: PricingModel) {
  const key = modelKey(model)
  expanded.value = expanded.value.includes(key)
    ? expanded.value.filter(item => item !== key)
    : [...expanded.value, key]
}

function providerRank(value: string) {
  const index = providerOrder.value.indexOf(value)
  return index < 0 ? 999 : index
}

function officialPrice(model: PricingModel, key: PriceKey) {
  if (key === 'input') return model.prices.input_usd_per_million
  if (key === 'output') return model.prices.output_usd_per_million
  if (key === 'cacheRead') return model.prices.cache_read_usd_per_million
  return model.prices.cache_write_usd_per_million
}

function priceMultiplier(group: PricingGroup) {
  if (priceMode.value === 'official') return props.reference.exchange.usd_to_cny
  if (priceMode.value === 'group') return group.rate_multiplier * props.reference.exchange.usd_to_cny
  return group.effective_rate
}

function formatPrice(model: PricingModel, group: PricingGroup, key: PriceKey) {
  const price = officialPrice(model, key)
  if (price == null) return '-'
  const value = price * priceMultiplier(group) / (unit.value === 'M' ? 1 : 1000)
  return `¥${number(value, unit.value === 'M' ? 4 : 6)}`
}

function formatOfficial(model: PricingModel, key: PriceKey) {
  const price = officialPrice(model, key)
  if (price == null) return '暂无官方价'
  const value = price / (unit.value === 'M' ? 1 : 1000)
  return `$${number(value, unit.value === 'M' ? 4 : 6)}`
}

function discountLabel(group: PricingGroup) {
  const rate = priceMode.value === 'official'
    ? 1
    : priceMode.value === 'group'
      ? group.rate_multiplier
      : group.effective_rate / Math.max(props.reference.exchange.usd_to_cny, 0.000001)
  if (Math.abs(rate - 1) < 0.0005) return '人民币基准'
  if (rate < 1) return `人民币约 ${number(rate * 10, 2)} 折`
  return `人民币约 ${number(rate, 2)} 倍`
}

function rechargeLabel(group: PricingGroup) {
  if (group.recharge_pay_cny && group.recharge_credit_usd) {
    return `¥${number(group.recharge_pay_cny, 2)} -> $${number(group.recharge_credit_usd, 2)}`
  }
  return `充值 ${number(group.recharge_multiplier || 1, 3)}x`
}

function modelSupportsImage(model: PricingModel) {
  return Boolean(
    model.capabilities?.image_generation
    || model.billing_mode === 'image'
    || /gpt[-_.]?image|dall[-_.]?e|imagen|image[-_.]?generation/i.test(model.model_name),
  )
}

function groupSupportsImage(group: PricingGroup) {
  return Boolean(group.allow_image_generation || group.has_image_prices)
}

function imageRate(group: PricingGroup) {
  return group.image_rate_independent ? Number(group.image_rate_multiplier || 1) : Number(group.rate_multiplier || 1)
}

function imageUnitPrice(model: PricingModel, group: PricingGroup, key: keyof ImagePriceTiers) {
  return group.image_prices_usd?.[key]
    ?? model.prices.default_image_prices_usd?.[key]
    ?? group.default_image_prices_usd?.[key]
    ?? null
}

function imageRmbPrice(model: PricingModel, group: PricingGroup, key: keyof ImagePriceTiers) {
  const base = imageUnitPrice(model, group, key)
  if (base == null) return '-'
  if (priceMode.value === 'official') return `¥${number(base * props.reference.exchange.usd_to_cny, 4)}`
  const quotaCost = base * imageRate(group)
  if (priceMode.value === 'group') return `¥${number(quotaCost * props.reference.exchange.usd_to_cny, 4)}`
  if (group.recharge_pay_cny && group.recharge_credit_usd) {
    return `¥${number(quotaCost * group.recharge_pay_cny / group.recharge_credit_usd, 4)}`
  }
  return `¥${number(base * Number(group.image_effective_rate || group.effective_rate || 1), 4)}`
}

function number(value: number, decimals: number) {
  if (!Number.isFinite(value)) return '-'
  return value.toFixed(decimals).replace(/0+$/, '').replace(/\.$/, '')
}
</script>

<template>
  <div class="pricing-explorer">
    <div class="pricing-toolbar">
      <label class="search-control">
        <Search :size="17" />
        <input v-model="query" type="search" placeholder="搜索模型或套餐" aria-label="搜索模型或套餐">
      </label>
      <label class="compact-control">
        <span>价格口径</span>
        <select v-model="priceMode">
          <option value="effective">套餐折算</option>
          <option value="group">分组倍率</option>
          <option value="official">官方换算</option>
        </select>
      </label>
      <div class="segmented-control compact-segment" aria-label="价格单位">
        <button type="button" :class="{ active: unit === 'M' }" @click="unit = 'M'">每百万</button>
        <button type="button" :class="{ active: unit === 'K' }" @click="unit = 'K'">每千</button>
      </div>
    </div>

    <div class="provider-filter" aria-label="平台筛选">
      <button type="button" :class="{ active: provider === 'all' }" @click="provider = 'all'">全部</button>
      <button v-for="item in providerOptions" :key="item[0]" type="button" :class="{ active: provider === item[0] }" @click="provider = item[0]">
        {{ item[1] }}
      </button>
    </div>

    <div v-if="visibleModels.length" class="pricing-model-list">
      <section v-for="model in visibleModels" :key="modelKey(model)" class="pricing-model">
        <button class="pricing-model__summary" type="button" :aria-expanded="expanded.includes(modelKey(model))" @click="toggle(model)">
          <span class="provider-mark">{{ model.provider_short || model.provider.slice(0, 2).toUpperCase() }}</span>
          <span class="pricing-model__identity">
            <strong>{{ model.display_name }}</strong>
            <small>{{ model.model_name }} · {{ model.provider_label }}</small>
          </span>
          <span v-if="model.is_featured" class="featured-label"><Star :size="14" /> 推荐</span>
          <span class="plan-count">{{ groupsForModel(model).length }} 个套餐</span>
          <ChevronDown :size="18" :class="{ rotated: expanded.includes(modelKey(model)) }" />
        </button>

        <div v-if="expanded.includes(modelKey(model))" class="pricing-table-wrap">
          <table class="pricing-table">
            <thead>
              <tr>
                <th>套餐</th>
                <th>输入 / {{ unit }}</th>
                <th>输出 / {{ unit }}</th>
                <th>缓存读取 / {{ unit }}</th>
                <th>折算参考</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="group in groupsForModel(model)" :key="group.source_id">
                <tr>
                  <td>
                    <strong>{{ group.display_name }}</strong>
                    <small>{{ rechargeLabel(group) }} · {{ number(group.rate_multiplier, 3) }}x 扣额度</small>
                  </td>
                  <td><strong>{{ formatPrice(model, group, 'input') }}</strong><small>{{ formatOfficial(model, 'input') }} 官方价</small></td>
                  <td><strong>{{ formatPrice(model, group, 'output') }}</strong><small>{{ formatOfficial(model, 'output') }} 官方价</small></td>
                  <td><strong>{{ formatPrice(model, group, 'cacheRead') }}</strong><small>{{ formatOfficial(model, 'cacheRead') }} 官方价</small></td>
                  <td><span class="discount-label">{{ discountLabel(group) }}</span><small>{{ group.note || model.note || '以实际账单为准' }}</small></td>
                </tr>
                <tr v-if="modelSupportsImage(model)" class="image-price-row">
                  <td><span><ImageIcon :size="15" /> 分辨率生图</span></td>
                  <td colspan="4">
                    <div class="image-price-list">
                      <span v-for="key in (['1k', '2k', '4k'] as const)" :key="key">
                        <b>{{ key.toUpperCase() }}</b>
                        {{ imageRmbPrice(model, group, key) }}/张
                      </span>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <div v-else class="empty-result pricing-empty">
      <strong>没有符合条件的模型</strong>
      <p>调整搜索词或平台筛选后重试。</p>
    </div>
  </div>
</template>
