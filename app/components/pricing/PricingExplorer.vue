<script setup lang="ts">
import { ChevronDown, Image as ImageIcon, Search, Star } from 'lucide-vue-next'
import type { ImagePriceTiers, PricingGroup, PricingModel, PricingReference } from '~/types/pricing'

type PriceKey = 'input' | 'output' | 'cacheRead' | 'cacheWrite'

const props = defineProps<{ reference: PricingReference }>()

const query = ref('')
const provider = ref('all')
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
      || a.sort_order - b.sort_order
      || Number(b.is_featured) - Number(a.is_featured)
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
    .filter(group => model.group_ids == null || model.group_ids.includes(group.source_id))
    .filter((group) => {
      if (!group.model_list_enabled) return true
      if (!group.model_names?.length) return false
      const modelName = model.model_name.trim().toLowerCase()
      return group.model_names.some(name => String(name).trim().toLowerCase() === modelName)
    })
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

function formatOfficial(model: PricingModel, key: PriceKey) {
  const price = officialPrice(model, key)
  if (price == null) return '暂无官方价'
  return `$${number(price, 4)}`
}

function officialLabel(key: PriceKey) {
  if (key === 'input') return '输入'
  if (key === 'output') return '输出'
  if (key === 'cacheRead') return '缓存读取'
  return '缓存写入'
}

function discountValue(rate: number) {
  if (Math.abs(rate - 1) < 0.0005) return '原价'
  if (rate < 1) return `${number(rate * 10, 2)} 折`
  return `${number(rate, 2)} 倍`
}

function rmbDiscount(group: PricingGroup) {
  const rate = Number(group.effective_rate || 1) / Math.max(props.reference.exchange.usd_to_cny, 0.000001)
  return discountValue(rate)
}

function quotaMultiplier(group: PricingGroup) {
  return `${number(Number(group.rate_multiplier || 1), 3)}x`
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

function imageOfficialPrice(model: PricingModel, key: keyof ImagePriceTiers) {
  const price = model.prices.default_image_prices_usd?.[key]
  return price == null ? '-' : `$${number(price, 4)}`
}

function imageRmbPrice(model: PricingModel, group: PricingGroup, key: keyof ImagePriceTiers) {
  const base = imageUnitPrice(model, group, key)
  if (base == null) return '-'
  const quotaCost = base * imageRate(group)
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
          <span v-if="!modelSupportsImage(model)" class="pricing-model__official" aria-label="官方价格，每百万 Token">
            <span v-for="key in (['input', 'output', 'cacheRead'] as const)" :key="key">
              <small>{{ officialLabel(key) }}</small>
              <strong>{{ formatOfficial(model, key) }}</strong>
            </span>
          </span>
          <span v-else class="pricing-model__official pricing-model__official--image" aria-label="官方图片单价">
            <span v-for="key in (['1k', '2k', '4k'] as const)" :key="key">
              <small>{{ key.toUpperCase() }} / 张</small>
              <strong>{{ imageOfficialPrice(model, key) }}</strong>
            </span>
          </span>
          <span v-if="model.is_featured" class="featured-label"><Star :size="14" /> 推荐</span>
          <span class="plan-count">{{ groupsForModel(model).length }} 个套餐</span>
          <ChevronDown :size="18" :class="{ rotated: expanded.includes(modelKey(model)) }" />
        </button>

        <div v-if="expanded.includes(modelKey(model))" class="pricing-table-wrap">
          <table v-if="!modelSupportsImage(model)" class="pricing-table pricing-table--discounts">
            <thead>
              <tr>
                <th>分组</th>
                <th>人民币折扣</th>
                <th>倍率</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="group in groupsForModel(model)" :key="group.source_id">
                <td><strong>{{ group.display_name }}</strong><small>{{ rechargeLabel(group) }}</small></td>
                <td><strong class="discount-value">{{ rmbDiscount(group) }}</strong><small>相对官方人民币原价</small></td>
                <td><strong class="discount-value">{{ quotaMultiplier(group) }}</strong></td>
                <td><span>{{ group.note || model.note || '实际扣费以主站账单为准' }}</span></td>
              </tr>
            </tbody>
          </table>
          <table v-else class="pricing-table pricing-table--images">
            <thead><tr><th>分组</th><th>1K / 张</th><th>2K / 张</th><th>4K / 张</th><th>说明</th></tr></thead>
            <tbody>
              <tr v-for="group in groupsForModel(model)" :key="group.source_id">
                <td><strong>{{ group.display_name }}</strong><small>{{ rechargeLabel(group) }}</small></td>
                <td v-for="key in (['1k', '2k', '4k'] as const)" :key="key"><strong>{{ imageRmbPrice(model, group, key) }}</strong></td>
                <td><span class="image-billing-label"><ImageIcon :size="15" />按次计费</span><small>{{ group.note || model.note || '实际扣费以主站账单为准' }}</small></td>
              </tr>
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
