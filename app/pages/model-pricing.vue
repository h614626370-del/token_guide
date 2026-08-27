<script setup lang="ts">
import { ArrowRight, RefreshCw, Search } from 'lucide-vue-next'
import type { ApiSuccess } from '~/types/api'
import type { ModelPricingCatalog, ModelPricingSubscriptionPlan } from '~/types/model-pricing'

const site = useSiteConfigState()
useSeoMeta({
  title: '模型定价',
  description: () => `按模型厂商和公开分组查看${site.value.project_name}的实际模型价格与倍率。`,
  ogTitle: () => `${site.value.project_name}模型定价`,
  ogDescription: () => `查看${site.value.project_name}各公开分组的模型单价、倍率与折算价格。`,
})
useHead({ link: [{ rel: 'canonical', href: `${site.value.site_url || ''}/model-pricing` }] })

const { data, pending, error, refresh } = await useFetch<ApiSuccess<ModelPricingCatalog>>('/api/model-pricing')
const catalog = computed(() => data.value?.data || null)
const selectedVendorId = ref('')
const selectedGroupId = ref('')
const query = ref('')

const selectedVendor = computed(() => catalog.value?.vendors.find(item => item.id === selectedVendorId.value) || catalog.value?.vendors[0] || null)
const selectedGroup = computed(() => selectedVendor.value?.groups.find(item => item.id === selectedGroupId.value) || selectedVendor.value?.groups[0] || null)
const visibleModels = computed(() => {
  const value = query.value.trim().toLowerCase()
  const models = selectedGroup.value?.models || []
  return value ? models.filter(model => model.model_name.toLowerCase().includes(value)) : models
})
const sourceLabel = computed(() => ({
  live: '已同步主站',
  cached: '最近同步数据',
  unconfigured: '数据源待配置',
  error: '同步失败',
}[catalog.value?.source.status || 'unconfigured']))

watch(catalog, selectDefaults, { immediate: true })

function selectDefaults() {
  const vendors = catalog.value?.vendors || []
  if (!vendors.some(item => item.id === selectedVendorId.value)) selectedVendorId.value = vendors[0]?.id || ''
  const groups = vendors.find(item => item.id === selectedVendorId.value)?.groups || []
  if (!groups.some(item => item.id === selectedGroupId.value)) selectedGroupId.value = groups[0]?.id || ''
}

function selectVendor(id: string) {
  selectedVendorId.value = id
  selectedGroupId.value = catalog.value?.vendors.find(item => item.id === id)?.groups[0]?.id || ''
  query.value = ''
}

function selectGroup(id: string) {
  selectedGroupId.value = id
  query.value = ''
}

function platformBase(value: number | null) {
  if (value == null) return '暂无'
  return formatNumber(value)
}

function officialCny(value: number | null, model?: ModelPricingCatalog['vendors'][number]['groups'][number]['models'][number]) {
  if (value == null || !catalog.value) return '暂无'
  if (model?.official_price_unit === 'rmb') return `¥${formatNumber(value)}`
  return `¥${formatNumber(value * catalog.value.exchange.usd_to_cny)}`
}

function officialFormula(model: ModelPricingCatalog['vendors'][number]['groups'][number]['models'][number]) {
  if (model.official_price_unit === 'rmb') return '官方价格按人民币原值展示，不做汇率换算'
  return `${model.official_price_source === 'manual' ? '后台官方价格' : '平台基础价'} × 官方参考汇率`
}

function platformCny(value: number | null) {
  if (value == null) return '暂无'
  return `¥${formatNumber(value)}`
}

function discount(value: number | null) {
  if (value == null) return '暂无'
  return `${(value * 10).toFixed(2).replace(/0+$/, '').replace(/\.$/, '')} 折`
}

function imageUnit(mode: 'token' | 'image' | 'per_request') {
  return mode === 'image' ? '张' : '次'
}

function periodLabel(start: string, end: string) {
  return `${start.slice(0, 5)}–${end.slice(0, 5)}`
}

function subscriptionPayment(selectedPlan?: ModelPricingSubscriptionPlan | null) {
  const plan = selectedPlan || selectedGroup.value?.subscription_plan
  if (!plan) return ''
  const symbol = plan.currency === 'CNY' ? '¥' : `${plan.currency} `
  return `${symbol}${formatNumber(plan.price)}`
}

function subscriptionFormula(model: ModelPricingCatalog['vendors'][number]['groups'][number]['models'][number]) {
  const plan = selectedGroup.value?.subscription_plan
  if (!plan?.monthly_quota_usd || !model.subscription_multiplier) return `平台基础价 × ${model.effective_multiplier}x`
  const billingMultiplier = model.manual_multiplier
    ?? (model.billing_mode === 'image' ? model.image_rate_multiplier : model.group_effective_multiplier)
  return `平台基础价 × ${formatNumber(billingMultiplier)}x × ${subscriptionPayment(plan)} ÷ ${formatNumber(plan.monthly_quota_usd)} U`
}

function formatNumber(value: number) {
  if (value === 0) return '0'
  if (value < 0.0001) return value.toExponential(2)
  return value.toFixed(value < 1 ? 5 : 3).replace(/0+$/, '').replace(/\.$/, '')
}
</script>

<template>
  <div class="tool-page model-pricing-page">
    <div class="tool-page__inner">
      <ToolPageHeading eyebrow="Model pricing" title="模型定价" description="先选模型厂商，再选可用分组。本站价格按充值额度 1:1 显示为美元，实际扣费以主站账单为准。">
        <template #actions>
          <span v-if="catalog" :class="['source-status', `source-status--${catalog.source.status}`]">{{ sourceLabel }}</span>
          <button class="icon-button" type="button" title="刷新模型定价" :disabled="pending" @click="refresh()">
            <RefreshCw :size="17" :class="{ spinning: pending }" />
          </button>
        </template>
      </ToolPageHeading>

      <div v-if="pending && !catalog" class="loading-band">正在读取模型定价...</div>
      <div v-else-if="error" class="tool-alert tool-alert--error">{{ error.message || '模型定价读取失败' }}</div>
      <template v-else-if="catalog">
        <div class="model-pricing-overview" aria-label="定价数据概览">
          <span><strong>{{ catalog.summary.vendors }}</strong> 家模型厂商</span>
          <span><strong>{{ catalog.summary.groups }}</strong> 个公开分组</span>
          <span><strong>{{ catalog.summary.models }}</strong> 个模型</span>
          <span>官方参考汇率 <strong>¥{{ catalog.exchange.usd_to_cny }}</strong></span>
        </div>

        <div v-if="catalog.vendors.length" class="model-pricing-browser">
          <nav class="model-vendor-rail" aria-label="模型厂商">
            <button
              v-for="vendor in catalog.vendors"
              :key="vendor.id"
              type="button"
              :class="{ active: selectedVendor?.id === vendor.id }"
              @click="selectVendor(vendor.id)"
            >
              <span class="model-vendor-mark"><img v-if="vendor.logo_url" :src="vendor.logo_url" :alt="`${vendor.name} Logo`"><template v-else>{{ vendor.short }}</template></span>
              <span><strong>{{ vendor.name }}</strong><small>{{ vendor.model_count }} 个模型</small></span>
              <ArrowRight :size="15" />
            </button>
          </nav>

          <aside class="model-group-rail">
            <header><span>可用分组</span><strong>{{ selectedVendor?.groups.length || 0 }}</strong></header>
            <button
              v-for="group in selectedVendor?.groups || []"
              :key="group.id"
              type="button"
              :class="{ active: selectedGroup?.id === group.id }"
              @click="selectGroup(group.id)"
            >
              <strong>{{ group.name }}</strong>
              <span><small>{{ group.models.length }} 个模型</small><em>{{ group.effective_multiplier }}x<span v-if="group.subscription_plan"> 订阅</span></em></span>
              <small v-if="group.subscription_plan" class="model-subscription-terms">实付 {{ subscriptionPayment(group.subscription_plan) }} · <template v-if="group.subscription_plan.monthly_quota_usd != null">月额度 {{ formatNumber(group.subscription_plan.monthly_quota_usd) }} U</template><template v-else>月额度未配置</template></small>
            </button>
          </aside>

          <section class="model-price-panel">
            <header class="model-price-panel__heading">
              <div>
                <span>{{ selectedVendor?.name }} / 分组 {{ selectedGroup?.id }}</span>
                <h2>{{ selectedGroup?.name }}</h2>
                <p>分组倍率 {{ selectedGroup?.effective_multiplier }}x<template v-if="selectedGroup?.subscription_plan"> · {{ selectedGroup.subscription_plan.name }} · 实付 {{ subscriptionPayment(selectedGroup.subscription_plan) }}<template v-if="selectedGroup.subscription_plan.monthly_quota_usd != null"> · 月额度 {{ formatNumber(selectedGroup.subscription_plan.monthly_quota_usd) }} U</template><template v-if="selectedGroup.subscription_multiplier != null"> · 套餐折算 {{ formatNumber(selectedGroup.subscription_multiplier) }}x</template></template> · Token 模型按每百万 Token，图片模型按张计费</p>
              </div>
              <label class="search-control model-price-search"><Search :size="16" /><input v-model="query" type="search" placeholder="搜索当前分组模型"></label>
            </header>

            <div class="model-price-table-wrap">
              <table class="model-price-table">
                <thead><tr><th>模型</th><th>价格层级</th><th>输入</th><th>输出</th><th>缓存读取</th><th>缓存写入</th><th>折扣</th></tr></thead>
                <tbody v-for="model in visibleModels" :key="model.id" class="model-price-pair">
                  <template v-if="model.billing_mode === 'token'">
                  <tr class="model-price-row model-price-row--official">
                    <td :rowspan="2 + (model.time_pricing?.periods.length || 0)" class="model-name-cell">
                      <strong>{{ model.display_name }}</strong>
                      <small v-if="model.note">{{ model.note }}</small>
                      <span v-if="model.time_pricing" class="model-timezone">{{ model.time_pricing.timezone }}<template v-if="model.time_pricing.weekdays_only"> · 仅工作日</template></span>
                    </td>
                    <td class="model-price-tier"><strong class="model-price-label">官方价格 <span class="model-info-dot" tabindex="0" :title="officialFormula(model)" aria-label="官方价格计算公式">!</span></strong><small>平台基础价</small></td>
                    <td data-label="输入"><strong class="model-official-price">{{ officialCny(model.official_display_prices.input_usd_per_million, model) }}</strong><small>{{ platformBase(model.base_prices.input_usd_per_million) }}</small></td>
                    <td data-label="输出"><strong class="model-official-price">{{ officialCny(model.official_display_prices.output_usd_per_million, model) }}</strong><small>{{ platformBase(model.base_prices.output_usd_per_million) }}</small></td>
                    <td data-label="缓存读取"><strong class="model-official-price">{{ officialCny(model.official_display_prices.cache_read_usd_per_million, model) }}</strong><small>{{ platformBase(model.base_prices.cache_read_usd_per_million) }}</small></td>
                    <td data-label="缓存写入"><strong class="model-official-price">{{ officialCny(model.official_display_prices.cache_write_usd_per_million, model) }}</strong><small>{{ platformBase(model.base_prices.cache_write_usd_per_million) }}</small></td>
                    <td><span class="model-reference-label">参考</span></td>
                  </tr>
                  <tr class="model-price-row model-price-row--platform">
                    <td class="model-price-tier"><strong class="model-price-label">本站价 <span class="model-info-dot" tabindex="0" :title="subscriptionFormula(model)" aria-label="本站价格计算公式">!</span></strong><small>平台基础价 × 倍率</small></td>
                    <td data-label="输入"><strong class="model-platform-price">{{ platformCny(model.effective_prices.input_usd_per_million) }}</strong></td>
                    <td data-label="输出"><strong class="model-platform-price">{{ platformCny(model.effective_prices.output_usd_per_million) }}</strong></td>
                    <td data-label="缓存读取"><strong class="model-platform-price">{{ platformCny(model.effective_prices.cache_read_usd_per_million) }}</strong></td>
                    <td data-label="缓存写入"><strong class="model-platform-price">{{ platformCny(model.effective_prices.cache_write_usd_per_million) }}</strong></td>
                    <td class="model-discount-cell"><strong class="model-discount">{{ discount(model.discount_ratio) }}</strong></td>
                  </tr>
                  <tr v-for="period in model.time_pricing?.periods || []" :key="`${period.start_time}-${period.end_time}`" class="model-price-row model-price-row--peak">
                    <td class="model-price-tier"><strong>本站高峰价</strong><small>{{ periodLabel(period.start_time, period.end_time) }} · {{ period.multiplier }}x</small></td>
                    <td data-label="输入"><strong class="model-platform-price">{{ platformCny(period.effective_prices.input_usd_per_million) }}</strong></td>
                    <td data-label="输出"><strong class="model-platform-price">{{ platformCny(period.effective_prices.output_usd_per_million) }}</strong></td>
                    <td data-label="缓存读取"><strong class="model-platform-price">{{ platformCny(period.effective_prices.cache_read_usd_per_million) }}</strong></td>
                    <td data-label="缓存写入"><strong class="model-platform-price">{{ platformCny(period.effective_prices.cache_write_usd_per_million) }}</strong></td>
                    <td class="model-discount-cell"></td>
                  </tr>
                  </template>
                  <template v-else>
                    <tr class="model-price-row model-price-row--official model-price-row--image">
                      <td :rowspan="2 + (model.time_pricing?.periods.length || 0)" class="model-name-cell">
                        <strong>{{ model.display_name }}</strong>
                        <small v-if="model.note">{{ model.note }}</small>
                        <span class="model-billing-badge">按{{ imageUnit(model.billing_mode) }}计费</span>
                      </td>
                      <td class="model-price-tier"><strong class="model-price-label">官方价格 <span class="model-info-dot" tabindex="0" :title="officialFormula(model)" aria-label="官方价格计算公式">!</span></strong><small>平台基础价</small></td>
                      <td colspan="4" class="model-image-prices-cell">
                        <div class="model-image-prices">
                          <span v-for="tier in model.image_prices" :key="tier.label"><small>{{ tier.label }} / {{ imageUnit(model.billing_mode) }}</small><strong class="model-official-price">{{ officialCny(model.official_display_image_prices.find(item => item.label === tier.label)?.price ?? tier.base_price_usd_per_image, model) }}</strong><em>{{ platformBase(tier.base_price_usd_per_image) }}</em></span>
                          <span v-if="!model.image_prices.length" class="model-image-prices__empty">暂无按{{ imageUnit(model.billing_mode) }}价格</span>
                        </div>
                      </td>
                      <td><span class="model-reference-label">参考</span></td>
                    </tr>
                    <tr class="model-price-row model-price-row--platform model-price-row--image">
                      <td class="model-price-tier"><strong class="model-price-label">本站价 <span class="model-info-dot" tabindex="0" :title="subscriptionFormula(model)" aria-label="本站价格计算公式">!</span></strong><small>平台基础价 × 倍率</small></td>
                      <td colspan="4" class="model-image-prices-cell">
                        <div class="model-image-prices">
                          <span v-for="tier in model.image_prices" :key="tier.label"><small>{{ tier.label }} / {{ imageUnit(model.billing_mode) }}</small><strong class="model-platform-price">{{ platformCny(tier.effective_price_cny_per_image) }}</strong></span>
                          <span v-if="!model.image_prices.length" class="model-image-prices__empty">暂无按{{ imageUnit(model.billing_mode) }}价格</span>
                        </div>
                      </td>
                      <td class="model-discount-cell"><strong class="model-discount">{{ discount(model.discount_ratio) }}</strong></td>
                    </tr>
                    <tr v-for="period in model.time_pricing?.periods || []" :key="`${period.start_time}-${period.end_time}`" class="model-price-row model-price-row--peak model-price-row--image">
                      <td class="model-price-tier"><strong>本站高峰价</strong><small>{{ periodLabel(period.start_time, period.end_time) }} · {{ period.multiplier }}x</small></td>
                      <td colspan="4" class="model-image-prices-cell">
                        <div class="model-image-prices">
                          <span v-for="tier in period.image_prices" :key="tier.label"><small>{{ tier.label }} / {{ imageUnit(model.billing_mode) }}</small><strong class="model-platform-price">{{ platformCny(tier.effective_price_cny_per_image) }}</strong></span>
                        </div>
                      </td>
                      <td class="model-discount-cell"></td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>
            <div v-if="!visibleModels.length" class="pricing-empty">当前分组没有匹配的模型。</div>
          </section>
        </div>
        <div v-else class="pricing-empty pricing-empty--standalone">暂无可公开展示的分组和模型。</div>
      </template>
    </div>
  </div>
</template>
