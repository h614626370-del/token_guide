import { createModelPricingRepository } from './repository.js'
import { createModelPricingSub2apiClient } from './sub2api-client.js'

const vendorDefinitions = [
  { id: 'openai', name: 'OpenAI', short: 'OA', logo_url: '/vendor-logos/openai.svg', patterns: [/^(gpt|chatgpt|codex)(?:[-_]|$)/i, /^o[134](?:[-_]|$)/i, /^dall-e/i, /^sora/i] },
  { id: 'anthropic', name: 'Anthropic', short: 'AN', logo_url: '/vendor-logos/anthropic.svg', patterns: [/^claude(?:[-_]|$)/i] },
  { id: 'google', name: 'Google', short: 'GO', logo_url: '/vendor-logos/google.svg', patterns: [/^(gemini|imagen|veo)(?:[-_]|$)/i] },
  { id: 'deepseek', name: 'DeepSeek', short: 'DS', logo_url: '/vendor-logos/deepseek.svg', patterns: [/^deepseek(?:[-_]|$)/i] },
  { id: 'xai', name: 'xAI', short: 'xAI', logo_url: '/vendor-logos/xai.svg', patterns: [/^grok(?:[-_]|$)/i] },
  { id: 'qwen', name: '通义千问', short: 'QW', logo_url: '/vendor-logos/qwen.svg', patterns: [/^(qwen|qwq|tongyi)(?:[-_]|$)/i] },
  { id: 'moonshot', name: 'Moonshot', short: 'KM', logo_url: '/vendor-logos/moonshot-light.svg', patterns: [/^(kimi|moonshot)(?:[-_]|$)/i] },
  { id: 'minimax', name: 'MiniMax', short: 'MM', logo_url: '/vendor-logos/minimax.svg', patterns: [/^minimax(?:[-_]|$)/i] },
  { id: 'zhipu', name: '智谱 AI', short: 'GLM', logo_url: '/vendor-logos/zhipu.svg', patterns: [/^(glm|cogview|cogvideo)(?:[-_]|$)/i] },
  { id: 'xiaomi', name: '小米', short: 'MI', logo_url: '/vendor-logos/xiaomi.svg', patterns: [/^mimo(?:[-_]|$)/i] },
  { id: 'tencent', name: '腾讯混元', short: 'HY', logo_url: '/vendor-logos/tencent.svg', patterns: [/^(hunyuan|hy\d)(?:[-_]|$)/i] },
  { id: 'bytedance', name: '字节跳动', short: 'DB', logo_url: '/vendor-logos/bytedance.svg', patterns: [/^(doubao|seed)(?:[-_]|$)/i] },
  { id: 'baidu', name: '百度', short: 'BD', logo_url: '/vendor-logos/baidu.svg', patterns: [/^ernie(?:[-_]|$)/i] },
  { id: 'other', name: '其他', short: 'OT', logo_url: null, patterns: [] },
]
const fallbackOpenAIImagePriceUsd = 0.134

export function createModelPricingService({ db, config, logger, clientFactory = createModelPricingSub2apiClient }) {
  const repo = createModelPricingRepository(db)
  let sourceCache = null

  async function resolveSource(refresh = false) {
    const runtime = runtimeContext(repo, config, logger, clientFactory)
    const source = await getSource({ refresh, runtime, repo, logger, sourceCache })
    sourceCache = source.cacheItem
    return { runtime, source }
  }

  function catalogFromSource(source, runtime, includeHidden) {
    return buildCatalog(
      source.payload,
      repo.listOverrides(),
      repo.listDisplayOrder(),
      repo.listGroupSettings(),
      runtime.config,
      { includeHidden },
    )
  }

  async function rebuildPublicCatalogSnapshot() {
    const runtime = runtimeContext(repo, config, logger, clientFactory)
    let payload = sourceCache?.payload || repo.getSourceSnapshot()?.payload
    if (!payload) {
      const source = await getSource({ refresh: false, runtime, repo, logger, sourceCache })
      sourceCache = source.cacheItem
      payload = source.payload
    }
    const catalog = buildCatalog(
      payload,
      repo.listOverrides(),
      repo.listDisplayOrder(),
      repo.listGroupSettings(),
      runtime.config,
      { includeHidden: false },
    )
    repo.savePublicCatalogSnapshot(catalog)
    return catalog
  }

  return {
    async getCatalog({ refresh = false, includeHidden = false, preferSnapshot = false } = {}) {
      if (preferSnapshot && !refresh && !includeHidden) {
        const snapshot = repo.getPublicCatalogSnapshot()
        if (snapshot) return snapshot.payload
      }

      const { runtime, source } = await resolveSource(refresh)
      const catalog = catalogFromSource(source, runtime, includeHidden)
      if (!includeHidden) {
        repo.savePublicCatalogSnapshot(catalog)
      } else if (refresh) {
        repo.savePublicCatalogSnapshot(catalogFromSource(source, runtime, false))
      }
      return catalog
    },

    async upsertOverrides(items) {
      const saved = repo.upsertOverrides(items)
      await rebuildPublicCatalogSnapshot()
      return saved
    },

    async clearAllManualOverrides() {
      const result = repo.clearAllManualOverrides()
      await rebuildPublicCatalogSnapshot()
      return result
    },

    async upsertDisplayOrder(items) {
      const saved = repo.upsertDisplayOrder(items)
      await rebuildPublicCatalogSnapshot()
      return saved
    },

    listOverrides() {
      return repo.listOverrides()
    },

    async upsertGroupSetting(input) {
      const saved = repo.upsertGroupSetting(input)
      await rebuildPublicCatalogSnapshot()
      return saved
    },
  }
}

async function getSource({ refresh, runtime, repo, logger, sourceCache }) {
  const maxAge = runtime.config.pricingCacheTtlMs
  if (!refresh && isFresh(sourceCache, maxAge)) {
    return { payload: sourceCache.payload, cacheItem: sourceCache }
  }

  if (runtime.client.configured) {
    try {
      const payload = await fetchLiveSource(runtime.client)
      repo.saveSourceSnapshot(payload)
      return { payload, cacheItem: { payload, cached_at: Date.now() } }
    } catch (error) {
      logger?.warn?.({ err: error }, 'failed to refresh group model pricing')
      const snapshot = repo.getSourceSnapshot()
      if (snapshot) {
        const payload = {
          ...snapshot.payload,
          source_status: 'cached',
          warnings: [...(snapshot.payload.warnings || []), '上游暂时不可用，当前展示最近一次同步结果。'],
        }
        return { payload, cacheItem: { payload, cached_at: Date.now() } }
      }
      return emptySource('error', ['模型定价数据读取失败，请在后台检查 sub2api 连接。'])
    }
  }

  const snapshot = repo.getSourceSnapshot()
  if (snapshot) {
    const payload = { ...snapshot.payload, source_status: 'cached', warnings: ['当前未配置 sub2api 管理凭据，展示最近一次同步结果。'] }
    return { payload, cacheItem: { payload, cached_at: Date.now() } }
  }
  return emptySource('unconfigured', ['请先在后台价格配置中设置 sub2api 管理地址和 API Key。'])
}

async function fetchLiveSource(client) {
  const [rawGroups, rawChannels] = await Promise.all([
    client.listGroups(),
    client.listChannels(),
  ])
  let rawSubscriptionPlans = []
  if (typeof client.listSubscriptionPlans === 'function') {
    try {
      rawSubscriptionPlans = await client.listSubscriptionPlans()
    } catch {
      // Subscription data is optional; retain group pricing when the endpoint is unavailable.
    }
  }
  const subscriptionByGroup = indexSubscriptionPlans(rawSubscriptionPlans)
  const channelByGroup = indexChannelsByGroup(rawChannels)
  const normalizedGroups = (Array.isArray(rawGroups) ? rawGroups : [])
    .map(normalizePublicGroup)
    .filter(Boolean)
  if (typeof client.listGroupModelsListCandidates === 'function') {
    for (const group of normalizedGroups) {
      if (group.model_names.length || !subscriptionByGroup.has(group.id)) continue
      try {
        const candidates = await client.listGroupModelsListCandidates(group.id, group.platform)
        group.model_names = normalizeModelNames(candidates)
      } catch {
        // The group pricing entries below remain the fallback source of model ids.
      }
    }
  }
  const groups = normalizedGroups
    .map(group => {
      const subscription = subscriptionByGroup.get(group.id)
      // Some subscription groups do not enable the custom models list. Keep
      // them in the pricing catalog and recover any model names exposed by
      // the group payload before applying the empty-group filter.
      if (!group.model_names.length && subscription) {
        group.model_names = extractGroupModelNames(group.source)
      }
      const enriched = attachSubscription(attachChannelPricing(group, channelByGroup.get(group.id)), subscription)
      delete enriched.source
      return enriched
    })
    .filter(group => group.model_names.length)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'zh-CN'))
  const modelNames = Array.from(new Map(groups.flatMap(group => group.model_names)
    .map(name => [name.toLowerCase(), name])).values())
  const pricing = {}
  const queue = [...modelNames]
  const workers = Array.from({ length: Math.min(8, queue.length) }, async () => {
    while (queue.length) {
      const modelName = queue.shift()
      if (!modelName) return
      pricing[modelName.toLowerCase()] = normalizeSourcePrices(await client.getModelPricing(modelName))
    }
  })
  await Promise.all(workers)
  return {
    source_status: 'live',
    groups,
    pricing,
    warnings: [],
    fetched_at: new Date().toISOString(),
  }
}

function normalizePublicGroup(group) {
  const subscriptionType = String(group?.subscription_type || 'standard').toLowerCase()
  if (!group || group.status === 'disabled' || group.status === 'inactive' || (group.is_exclusive && subscriptionType !== 'subscription')) return null
  const modelNames = normalizeModelNames(group.models_list_config?.models)
  return {
    id: String(group.id),
    name: String(group.name || `分组 ${group.id}`),
    platform: String(group.platform || 'unknown').toLowerCase(),
    description: String(group.description || ''),
    source_multiplier: positiveNumber(group.rate_multiplier, 1),
    subscription_type: subscriptionType,
    image_rate_independent: Boolean(group.image_rate_independent),
    image_rate_multiplier: positiveNumber(group.image_rate_multiplier, 1),
    model_names: modelNames,
    source: group,
    group_pricing: normalizePricingEntries(group.model_pricing),
    image_prices: normalizeGroupImagePrices(group),
    sort_order: finiteNumber(group.sort_order, 1000),
  }
}

function indexSubscriptionPlans(value) {
  const plans = subscriptionPlanItems(value)
  const byGroup = new Map()
  for (const plan of plans) {
    const groupId = String(plan?.group_id ?? plan?.groupId ?? '').trim()
    const price = nullablePositive(plan?.price ?? plan?.amount)
    const originalPrice = nullablePositive(plan?.original_price ?? plan?.originalPrice)
    const monthlyQuota = nullablePositive(plan?.monthly_limit_usd ?? plan?.monthlyLimitUsd)
    const forSale = plan?.for_sale ?? plan?.forSale
    if (!groupId || !price || forSale === false || forSale === 0) continue
    const normalized = {
      id: String(plan.id ?? ''),
      group_id: groupId,
      name: String(plan.name || plan.product_name || plan.productName || `订阅 ${groupId}`),
      price,
      original_price: originalPrice,
      currency: String(plan?.currency || 'CNY').trim().toUpperCase() || 'CNY',
      monthly_quota_usd: monthlyQuota,
      validity_days: finiteNumber(plan.validity_days ?? plan.validityDays, 0),
      for_sale: forSale !== false,
      sort_order: finiteNumber(plan.sort_order ?? plan.sortOrder, 1000),
      multiplier: monthlyQuota ? roundPrice(price / monthlyQuota) : null,
    }
    const current = byGroup.get(groupId)
    if (!current || normalized.sort_order < current.sort_order) byGroup.set(groupId, normalized)
  }
  return byGroup
}

function subscriptionPlanItems(value) {
  if (Array.isArray(value)) return value
  if (!value || typeof value !== 'object') return []
  for (const candidate of [value.items, value.plans, value.data, value.result]) {
    if (Array.isArray(candidate)) return candidate
    if (candidate && typeof candidate === 'object') {
      const nested = subscriptionPlanItems(candidate)
      if (nested.length) return nested
    }
  }
  return []
}

function extractGroupModelNames(group) {
  const candidates = [
    group?.models_list_config?.models,
    group?.models,
    group?.model_names,
    group?.model_list,
  ]
  const direct = candidates.flatMap(value => Array.isArray(value) ? value.filter(item => typeof item === 'string') : [])
  if (direct.length) return normalizeModelNames(direct)
  // Group pricing entries often contain exact model ids even when the custom
  // models list is disabled. Wildcards are intentionally excluded because
  // they cannot be expanded without an upstream model registry.
  const priced = Array.isArray(group?.model_pricing)
    ? group.model_pricing.flatMap(entry => Array.isArray(entry?.models) ? entry.models.filter(model => typeof model === 'string' && !model.includes('*')) : [])
    : []
  return normalizeModelNames(priced)
}

function attachSubscription(group, plan) {
  return {
    ...group,
    subscription_plan: plan || null,
    subscription_multiplier: plan?.multiplier ?? null,
  }
}

function indexChannelsByGroup(value) {
  const channels = (Array.isArray(value) ? value : [])
    .filter(channel => channel && channel.status === 'active')
    .sort((a, b) => finiteNumber(a.id, 0) - finiteNumber(b.id, 0))
  const byGroup = new Map()
  for (const channel of channels) {
    const normalized = {
      id: String(channel.id),
      name: String(channel.name || `渠道 ${channel.id}`),
      pricing: normalizePricingEntries(channel.model_pricing),
    }
    for (const groupId of Array.isArray(channel.group_ids) ? channel.group_ids : []) {
      byGroup.set(String(groupId), normalized)
    }
  }
  return byGroup
}

function attachChannelPricing(group, channel) {
  return {
    ...group,
    channel_id: channel?.id || null,
    channel_name: channel?.name || null,
    channel_pricing: channel?.pricing || [],
  }
}

function buildCatalog(source, overrides, displayOrder, groupSettings, config, { includeHidden = false } = {}) {
  const overrideMap = new Map(overrides.map(item => [overrideKey(item.group_id, item.model_name), item]))
  const displayOrderMap = new Map(displayOrder.map(item => [displayOrderKey(item.scope, item.parent_key, item.item_key), item.sort_order]))
  const groupSettingsMap = new Map(groupSettings.map(item => [String(item.group_id), item]))
  const vendors = new Map()
  const pricing = source.pricing || {}

  for (const sourceGroup of source.groups || []) {
    const sourceModelNames = sourceGroup.model_names || []
    for (const [sourceOrder, modelName] of sourceModelNames.entries()) {
      const vendor = inferModelVendor(modelName)
      if (!vendors.has(vendor.id)) vendors.set(vendor.id, { ...vendor, groups: new Map() })
      const vendorEntry = vendors.get(vendor.id)
      if (!vendorEntry.groups.has(sourceGroup.id)) {
        const groupSetting = groupSettingsMap.get(String(sourceGroup.id))
        const sourceName = sourceGroup.name
        vendorEntry.groups.set(sourceGroup.id, {
          id: sourceGroup.id,
          name: groupSetting?.display_name || sourceName,
          source_name: sourceName,
          display_name: groupSetting?.display_name || null,
          platform: sourceGroup.platform,
          description: sourceGroup.description,
          source_multiplier: sourceGroup.source_multiplier,
          effective_multiplier: sourceGroup.source_multiplier,
          subscription_type: sourceGroup.subscription_type,
          subscription_multiplier: sourceGroup.subscription_multiplier,
          subscription_plan: sourceGroup.subscription_plan || null,
          image_rate_independent: sourceGroup.image_rate_independent,
          image_rate_multiplier: sourceGroup.image_rate_multiplier,
          channel_id: sourceGroup.channel_id || null,
          channel_name: sourceGroup.channel_name || null,
          sort_order: displaySortOrder(displayOrderMap, 'group', vendor.id, sourceGroup.id, sourceGroup.sort_order),
          models: [],
        })
      }
      const group = vendorEntry.groups.get(sourceGroup.id)
      const groupPricing = matchConfiguredPricing(sourceGroup.group_pricing || sourceGroup.model_pricing, modelName)
      const channelPricing = groupPricing
        ? null
        : matchChannelPricing(sourceGroup.channel_pricing, sourceGroup.platform, modelName)
      const model = buildModel({
        modelName,
        vendor,
        group,
        sourcePrices: pricing[modelName.toLowerCase()] || emptyPrices(),
        groupPricing,
        channelPricing,
        override: overrideMap.get(overrideKey(sourceGroup.id, modelName)),
        sourceOrder,
        modelSortOrder: displaySortOrder(
          displayOrderMap,
          'model',
          `${vendor.id}:${sourceGroup.id}`,
          modelName,
          100_000 + sourceModelNames.length - sourceOrder - 1,
        ),
        groupImagePrices: sourceGroup.image_prices || [],
        usdToCny: positiveNumber(config.usdToCny, 6.8102),
      })
      if (includeHidden || model.is_visible) group.models.push(model)
    }
  }

  const orderedVendors = vendorDefinitions
    .map((definition, index) => ({ vendor: vendors.get(definition.id), defaultOrder: index * 100 }))
    .filter(item => item.vendor)
    .map(({ vendor, defaultOrder }) => ({
      ...vendor,
      sort_order: displaySortOrder(displayOrderMap, 'vendor', '', vendor.id, defaultOrder),
    }))
    .map(vendor => ({
      id: vendor.id,
      name: vendor.name,
      short: vendor.short,
      logo_url: vendor.logo_url,
      sort_order: vendor.sort_order,
      model_count: new Set([...vendor.groups.values()].flatMap(group => group.models.map(model => model.model_name.toLowerCase()))).size,
      groups: [...vendor.groups.values()]
        .filter(group => group.models.length)
        .map(group => ({ ...group, models: group.models.sort(modelComparator) }))
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'zh-CN')),
    }))
    .filter(vendor => vendor.groups.length)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, 'zh-CN'))

  return {
    source: {
      status: source.source_status || 'cached',
      configured: Boolean(config.sub2apiAdminApiKey && config.sub2apiApiBase),
      fetched_at: source.fetched_at || null,
      warnings: source.warnings || [],
    },
    exchange: { usd_to_cny: positiveNumber(config.usdToCny, 6.8102) },
    summary: {
      vendors: orderedVendors.length,
      groups: new Set(orderedVendors.flatMap(vendor => vendor.groups.map(group => group.id))).size,
      models: new Set(orderedVendors.flatMap(vendor => vendor.groups.flatMap(group => group.models.map(model => model.model_name.toLowerCase())))).size,
    },
    vendors: orderedVendors,
  }
}

function buildModel({ modelName, vendor, group, sourcePrices, groupPricing, channelPricing, override, sourceOrder, modelSortOrder, groupImagePrices, usdToCny }) {
  const overrideEnabled = Boolean(override?.is_enabled)
  const manualMultiplier = overrideEnabled ? nullablePositive(override.multiplier) : null
  const groupMultiplier = positiveNumber(group.effective_multiplier, group.source_multiplier)
  const subscriptionMultiplier = nullablePositive(group.subscription_multiplier) ?? 1
  const billingMultiplier = manualMultiplier ?? groupMultiplier
  const effectiveMultiplier = roundPrice(billingMultiplier * subscriptionMultiplier)
  const imageMultiplier = group.image_rate_independent
    ? positiveNumber(group.image_rate_multiplier, groupMultiplier)
    : groupMultiplier
  const effectiveImageMultiplier = roundPrice((manualMultiplier ?? imageMultiplier) * subscriptionMultiplier)
  const manualPrices = {
    input_usd_per_million: overrideEnabled ? nullableNonNegative(override?.input_usd_per_million) : null,
    output_usd_per_million: overrideEnabled ? nullableNonNegative(override?.output_usd_per_million) : null,
    cache_read_usd_per_million: overrideEnabled ? nullableNonNegative(override?.cache_read_usd_per_million) : null,
    cache_write_usd_per_million: overrideEnabled ? nullableNonNegative(override?.cache_write_usd_per_million) : null,
  }
  const manualImagePrices = [
    { label: '1K', price: overrideEnabled ? nullableNonNegative(override?.image_price_1k) : null },
    { label: '2K', price: overrideEnabled ? nullableNonNegative(override?.image_price_2k) : null },
    { label: '4K', price: overrideEnabled ? nullableNonNegative(override?.image_price_4k) : null },
  ].filter(item => item.price != null)
  const manualOfficialPrices = {
    input_usd_per_million: overrideEnabled ? nullableNonNegative(override?.official_input_usd_per_million) : null,
    output_usd_per_million: overrideEnabled ? nullableNonNegative(override?.official_output_usd_per_million) : null,
    cache_read_usd_per_million: overrideEnabled ? nullableNonNegative(override?.official_cache_read_usd_per_million) : null,
    cache_write_usd_per_million: overrideEnabled ? nullableNonNegative(override?.official_cache_write_usd_per_million) : null,
  }
  const manualOfficialImagePrices = [
    { label: '1K', price: overrideEnabled ? nullableNonNegative(override?.official_image_price_1k) : null },
    { label: '2K', price: overrideEnabled ? nullableNonNegative(override?.official_image_price_2k) : null },
    { label: '4K', price: overrideEnabled ? nullableNonNegative(override?.official_image_price_4k) : null },
  ].filter(item => item.price != null)
  const hasManualOfficialPrices = Object.values(manualOfficialPrices).some(value => value != null)
    || manualOfficialImagePrices.length > 0
  const officialPriceUnit = hasManualOfficialPrices && override?.official_price_unit === 'rmb' ? 'rmb' : 'usd'
  const hasManualPrices = Object.values(manualPrices).some(value => value != null) || manualImagePrices.length > 0
  const upstreamPricing = groupPricing || channelPricing
  const upstreamPriceSource = groupPricing ? 'group' : channelPricing ? 'channel' : 'official'
  const configuredPrices = upstreamPricing?.billing_mode === 'token' ? upstreamPricing.prices : emptyPrices()
  const upstreamBasePrices = Object.fromEntries(Object.keys(sourcePrices)
    .map(key => [key, configuredPrices[key] ?? sourcePrices[key]]))
  const basePrices = Object.fromEntries(Object.keys(sourcePrices)
    .map(key => [key, manualPrices[key] ?? upstreamBasePrices[key]]))
  const effectivePrices = Object.fromEntries(Object.entries(basePrices).map(([key, value]) => [key, multiplyPrice(value, effectiveMultiplier)]))
  const billingMode = upstreamPricing?.billing_mode || ((groupImagePrices.length || isImageModelName(modelName)) ? 'image' : 'token')
  const upstreamImagePrices = mergeImagePrices({
    upstream: upstreamPricing?.request_prices?.length ? upstreamPricing.request_prices : officialImagePrices(modelName),
    group: billingMode === 'image' ? groupImagePrices : [],
    manual: [],
  })
  const imageBasePrices = mergeImagePrices({
    upstream: upstreamImagePrices,
    group: [],
    manual: manualImagePrices,
  })
  const officialDisplayPrices = Object.fromEntries(Object.keys(basePrices)
    .map(key => [key, manualOfficialPrices[key] ?? basePrices[key]]))
  const officialCalculationPrices = officialPriceUnit === 'rmb'
    ? convertPricesToUsd(officialDisplayPrices, usdToCny)
    : officialDisplayPrices
  const officialDisplayImagePrices = mergeImagePrices({
    upstream: imageBasePrices,
    group: [],
    manual: manualOfficialImagePrices,
  })
  const officialCalculationImagePrices = officialPriceUnit === 'rmb'
    ? officialDisplayImagePrices.map(item => ({ ...item, price: roundPrice(item.price / usdToCny) }))
    : officialDisplayImagePrices
  const imagePrices = imageBasePrices.map(item => ({
    label: item.label,
    base_price_usd_per_image: item.price,
    effective_price_cny_per_image: multiplyPrice(item.price, effectiveImageMultiplier),
    discount_ratio: priceRatioValue(
      officialCalculationImagePrices.find(tier => tier.label.toLowerCase() === item.label.toLowerCase())?.price ?? item.price,
      multiplyPrice(item.price, effectiveImageMultiplier),
      usdToCny,
    ),
  }))
  const timePricing = channelPricing?.time_pricing
    ? buildEffectiveTimePricing(channelPricing.time_pricing, effectivePrices, officialDisplayPrices, imagePrices, officialDisplayImagePrices, usdToCny)
    : null
  return {
    id: `${group.id}:${modelName}`,
    model_name: modelName,
    display_name: modelName,
    vendor: vendor.id,
    source_order: sourceOrder,
    sort_order: modelSortOrder,
    is_visible: override?.is_visible !== false,
    billing_mode: billingMode,
    source_multiplier: group.source_multiplier,
    group_effective_multiplier: groupMultiplier,
    image_rate_independent: Boolean(group.image_rate_independent),
    image_rate_multiplier: positiveNumber(group.image_rate_multiplier, groupMultiplier),
    image_effective_multiplier: effectiveImageMultiplier,
    manual_multiplier: manualMultiplier,
    subscription_multiplier: group.subscription_multiplier,
    effective_multiplier: effectiveMultiplier,
    multiplier_source: manualMultiplier == null ? 'source' : 'manual',
    override_enabled: overrideEnabled,
    official_prices: sourcePrices,
    group_prices: groupPricing?.prices || emptyPrices(),
    channel_prices: channelPricing?.prices || emptyPrices(),
    manual_prices: manualPrices,
    manual_image_prices: manualImagePrices,
    manual_official_prices: manualOfficialPrices,
    manual_official_image_prices: manualOfficialImagePrices,
    official_price_unit: officialPriceUnit,
    official_display_prices: officialDisplayPrices,
    official_display_image_prices: officialDisplayImagePrices,
    official_price_source: hasManualOfficialPrices ? 'manual' : 'base',
    upstream_base_prices: upstreamBasePrices,
    upstream_image_prices: upstreamImagePrices,
    base_prices: basePrices,
    upstream_price_source: upstreamPriceSource,
    base_price_source: hasManualPrices ? 'manual' : upstreamPriceSource,
    effective_prices: effectivePrices,
    image_prices: imagePrices,
    discount_ratio: imagePrices[0]?.discount_ratio ?? priceRatio(officialCalculationPrices, effectivePrices, usdToCny),
    time_pricing: timePricing,
    pricing_found: imagePrices.length > 0 || Object.values(basePrices).some(value => value != null),
    note: override?.note || '',
  }
}

function normalizePricingEntries(value) {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    const billingMode = String(entry?.billing_mode || 'token').trim().toLowerCase()
    if (!['token', 'image', 'per_request'].includes(billingMode)) return []
    const models = normalizeModelNames(entry?.models)
    if (!models.length) return []
    return [{
      platform: String(entry?.platform || '').trim().toLowerCase(),
      models,
      billing_mode: billingMode,
      prices: billingMode === 'token' ? normalizeSourcePrices(entry) : emptyPrices(),
      request_prices: normalizeRequestPrices(entry, billingMode),
      time_pricing: normalizeTimePricing(entry?.time_pricing),
    }]
  })
}

function matchConfiguredPricing(entries, modelName) {
  const normalized = normalizePricingModelName(modelName)
  let wildcard
  for (const entry of entries || []) {
    for (const pattern of entry.models) {
      const candidate = normalizePricingModelName(pattern)
      if (candidate === normalized) return entry
      if (!wildcard && candidate.endsWith('*') && normalized.startsWith(candidate.slice(0, -1))) wildcard = entry
    }
  }
  return wildcard || null
}

function matchChannelPricing(entries, groupPlatform, modelName) {
  const platforms = groupPlatform === 'composite'
    ? ['anthropic', 'gemini', 'openai', 'antigravity', 'grok', 'kimi', 'zhipu', 'deepseek']
    : [groupPlatform]
  const normalized = normalizePricingModelName(modelName)
  for (const platform of platforms) {
    let exact = null
    for (const entry of entries || []) {
      if (entry.platform !== platform) continue
      if (entry.models.some(pattern => normalizePricingModelName(pattern) === normalized)) exact = entry
    }
    if (exact) return exact
  }
  for (const platform of platforms) {
    for (const entry of entries || []) {
      if (entry.platform !== platform) continue
      if (entry.models.some((pattern) => {
        const candidate = normalizePricingModelName(pattern)
        return candidate.endsWith('*') && normalized.startsWith(candidate.slice(0, -1))
      })) return entry
    }
  }
  return null
}

function normalizeTimePricing(value) {
  if (!value || typeof value !== 'object') return null
  const periods = (Array.isArray(value.periods) ? value.periods : []).flatMap((period) => {
    const multiplier = nullablePositive(period?.multiplier)
    const startTime = String(period?.start_time || '').trim()
    const endTime = String(period?.end_time || '').trim()
    if (!multiplier || multiplier === 1 || !startTime || !endTime) return []
    return [{ start_time: startTime, end_time: endTime, multiplier }]
  })
  if (!periods.length) return null
  return {
    timezone: String(value.timezone || 'UTC').trim() || 'UTC',
    weekdays_only: Boolean(value.weekdays_only),
    periods,
  }
}

function buildEffectiveTimePricing(schedule, effectivePrices, officialDisplayPrices, imagePrices, officialDisplayImagePrices, usdToCny) {
  return {
    ...schedule,
    periods: schedule.periods.map((period) => {
      const periodPrices = Object.fromEntries(Object.entries(effectivePrices)
        .map(([key, value]) => [key, multiplyPrice(value, period.multiplier)]))
      const periodImagePrices = imagePrices.map(item => ({
        ...item,
        effective_price_cny_per_image: multiplyPrice(item.effective_price_cny_per_image, period.multiplier),
        discount_ratio: priceRatioValue(
          officialDisplayImagePrices.find(tier => tier.label.toLowerCase() === item.label.toLowerCase())?.price ?? item.base_price_usd_per_image,
          multiplyPrice(item.effective_price_cny_per_image, period.multiplier),
          usdToCny,
        ),
      }))
      return {
        ...period,
        effective_prices: periodPrices,
        image_prices: periodImagePrices,
        discount_ratio: periodImagePrices[0]?.discount_ratio ?? priceRatio(officialDisplayPrices, periodPrices, usdToCny),
      }
    }),
  }
}

function priceRatio(officialPrices, effectivePrices, usdToCny) {
  for (const key of ['input_usd_per_million', 'output_usd_per_million', 'cache_read_usd_per_million', 'cache_write_usd_per_million']) {
    const official = officialPrices[key]
    const effective = effectivePrices[key]
    if (official != null && official > 0 && effective != null) return roundPrice(effective / (official * usdToCny))
  }
  return null
}

function convertPricesToUsd(prices, usdToCny) {
  return Object.fromEntries(Object.entries(prices).map(([key, value]) => [key, value == null ? null : roundPrice(value / usdToCny)]))
}

function priceRatioValue(basePrice, effectivePrice, usdToCny) {
  if (basePrice == null || basePrice <= 0 || effectivePrice == null) return null
  return roundPrice(effectivePrice / (basePrice * usdToCny))
}

function normalizeGroupImagePrices(group) {
  return [
    { label: '1K', price: nullableNonNegative(group?.image_price_1k) },
    { label: '2K', price: nullableNonNegative(group?.image_price_2k) },
    { label: '4K', price: nullableNonNegative(group?.image_price_4k) },
  ].filter(item => item.price != null)
}

function normalizeRequestPrices(entry, billingMode) {
  const tiers = (Array.isArray(entry?.intervals) ? entry.intervals : [])
    .map((item, index) => ({
      label: String(item?.tier_label || '').trim() || (billingMode === 'image' ? `${index + 1}K` : `档位 ${index + 1}`),
      price: nullableNonNegative(item?.per_request_price),
      sort_order: finiteNumber(item?.sort_order, index),
    }))
    .filter(item => item.price != null)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(({ label, price }) => ({ label, price }))
  if (tiers.length) return tiers
  const defaultPrice = nullableNonNegative(entry?.per_request_price)
  return defaultPrice == null ? [] : [{ label: billingMode === 'image' ? '每张' : '每次', price: defaultPrice }]
}

function mergeImagePrices({ upstream, group, manual }) {
  const sources = [upstream, group, manual]
  const labels = []
  for (const source of sources) {
    for (const item of source) {
      if (!labels.some(label => label.toLowerCase() === item.label.toLowerCase())) labels.push(item.label)
    }
  }
  const defaultUpstream = upstream.find(item => ['每张', '每次'].includes(item.label))?.price ?? null
  return labels.flatMap((label) => {
    const find = source => source.find(item => item.label.toLowerCase() === label.toLowerCase())?.price
    const price = find(manual) ?? find(group) ?? find(upstream) ?? defaultUpstream
    return price == null ? [] : [{ label, price }]
  })
}

function isImageModelName(modelName) {
  return /(^|[-_])(image|imagen|dall-e|cogview)([-_]|$)/i.test(String(modelName || ''))
}

function officialImagePrices(modelName) {
  if (!/^(gpt-image|dall-e)(?:[-_]|$)/i.test(String(modelName || ''))) return []
  return [
    { label: '1K', price: fallbackOpenAIImagePriceUsd },
    { label: '2K', price: roundPrice(fallbackOpenAIImagePriceUsd * 1.5) },
    { label: '4K', price: roundPrice(fallbackOpenAIImagePriceUsd * 2) },
  ]
}

function normalizePricingModelName(value) {
  let model = String(value || '').trim().toLowerCase()
  if (model.startsWith('claude-')) model = model.replaceAll('.', '-')
  return model
}

export function inferModelVendor(modelName) {
  const value = String(modelName || '').trim()
  return vendorDefinitions.find(item => item.patterns.some(pattern => pattern.test(value))) || vendorDefinitions[vendorDefinitions.length - 1]
}

function normalizeSourcePrices(value) {
  return {
    input_usd_per_million: perMillion(value?.input_price),
    output_usd_per_million: perMillion(value?.output_price),
    cache_read_usd_per_million: perMillion(value?.cache_read_price),
    cache_write_usd_per_million: perMillion(value?.cache_write_price),
  }
}

function emptyPrices() {
  return {
    input_usd_per_million: null,
    output_usd_per_million: null,
    cache_read_usd_per_million: null,
    cache_write_usd_per_million: null,
  }
}

function emptySource(status, warnings) {
  const payload = { source_status: status, groups: [], pricing: {}, warnings, fetched_at: null }
  return { payload, cacheItem: { payload, cached_at: Date.now() } }
}

function runtimeContext(repo, baseConfig, logger, clientFactory) {
  const settings = repo.listRuntimeSettings()
  const config = {
    ...baseConfig,
    sub2apiApiBase: normalizeApiBase(settings.sub2api_base_url || baseConfig.sub2apiApiBase),
    sub2apiAdminApiKey: String(settings.sub2api_admin_api_key || baseConfig.sub2apiAdminApiKey || '').trim(),
    usdToCny: positiveNumber(settings.usd_to_cny, baseConfig.usdToCny || 6.8102),
  }
  return { config, client: clientFactory(config, logger) }
}

function normalizeApiBase(value) {
  const base = String(value || '').trim().replace(/\/+$/, '')
  if (!base) return ''
  return base.endsWith('/api/v1') ? base : `${base}/api/v1`
}

function normalizeModelNames(value) {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  return value.flatMap((item) => {
    const name = String(item || '').trim()
    const key = name.toLowerCase()
    if (!name || seen.has(key)) return []
    seen.add(key)
    return [name]
  })
}

function overrideKey(groupId, modelName) {
  return `${String(groupId)}:${String(modelName).trim().toLowerCase()}`
}

function displayOrderKey(scope, parentKey, itemKey) {
  return `${scope}:${String(parentKey).toLowerCase()}:${String(itemKey).toLowerCase()}`
}

function displaySortOrder(orderMap, scope, parentKey, itemKey, fallback) {
  return finiteNumber(orderMap.get(displayOrderKey(scope, parentKey, itemKey)), fallback)
}

function perMillion(value) {
  const number = nullableNonNegative(value)
  return number == null ? null : roundPrice(number * 1_000_000)
}

function multiplyPrice(value, multiplier) {
  return value == null ? null : roundPrice(value * multiplier)
}

function roundPrice(value) {
  return Number(Number(value).toFixed(8))
}

function positiveNumber(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : fallback
}

function finiteNumber(value, fallback) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function nullablePositive(value) {
  if (value == null || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : null
}

function nullableNonNegative(value) {
  if (value == null || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : null
}

function isFresh(item, maxAge) {
  return Boolean(item && Date.now() - item.cached_at < maxAge)
}

function modelComparator(a, b) {
  return a.sort_order - b.sort_order || a.model_name.localeCompare(b.model_name, 'en', { numeric: true, sensitivity: 'base' })
}
