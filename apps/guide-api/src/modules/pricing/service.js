import { createPricingRepository } from './repository.js'
import { createSub2apiClient } from './sub2api-client.js'
import { providers } from './schema.js'

const providerMeta = {
  openai: { label: 'OpenAI', short: 'O' },
  anthropic: { label: 'Anthropic', short: 'A' },
  gemini: { label: 'Gemini', short: 'G' },
  antigravity: { label: 'Antigravity', short: 'AG' },
  grok: { label: 'Grok', short: 'X' },
}

const fallbackImageBasePriceUsd = 0.134

export function createPricingService({ db, config, logger }) {
  const repo = createPricingRepository(db)
  const cache = {
    reference: null,
    source: null,
  }

  return {
    listConfig() {
      const runtime = createRuntimeContext(repo, config, logger)
      return {
        models: repo.listModelSettings(),
        groups: repo.listGroupSettings(),
        settings: settingsView(runtime.config, repo.listRuntimeSettings()),
        source: sourceState(runtime.config, runtime.sub2api, { includePrivate: true }),
      }
    },

    updateRuntimeSettings(input) {
      repo.updateRuntimeSettings(input)
      cache.reference = null
      cache.source = null
      const runtime = createRuntimeContext(repo, config, logger)
      return settingsView(runtime.config, repo.listRuntimeSettings())
    },

    upsertModelSetting(input) {
      cache.reference = null
      return repo.upsertModelSetting(input)
    },

    deleteModelSetting(id) {
      cache.reference = null
      return repo.deleteModelSetting(id)
    },

    upsertGroupSetting(input) {
      cache.reference = null
      return repo.upsertGroupSetting(input)
    },

    deleteGroupSetting(id) {
      cache.reference = null
      return repo.deleteGroupSetting(id)
    },

    async listSource({ refresh = false } = {}) {
      const runtime = createRuntimeContext(repo, config, logger)
      if (!refresh && isFresh(cache.source, runtime.config.pricingCacheTtlMs)) {
        return cache.source.value
      }

      const warnings = []
      const result = {
        source: sourceState(runtime.config, runtime.sub2api, { includePrivate: true }),
        groups: [],
        subscription_plans: [],
        models_by_provider: {},
        warnings,
        fetched_at: new Date().toISOString(),
      }

      if (!runtime.sub2api.configured) {
        warnings.push('sub2api admin source is not configured.')
        cache.source = createCacheItem(result)
        return result
      }

      try {
        result.groups = sanitizeGroups(await runtime.sub2api.listGroups())
      } catch (error) {
        logger?.warn({ err: error }, 'failed to fetch sub2api groups')
        warnings.push('failed to fetch groups from sub2api.')
      }

      try {
        result.subscription_plans = sanitizeSubscriptionPlans(await runtime.sub2api.listSubscriptionPlans())
        result.groups = attachRechargeReferences(result.groups, result.subscription_plans)
      } catch (error) {
        logger?.warn({ err: error }, 'failed to fetch sub2api subscription plans')
        warnings.push('failed to fetch subscription plans from sub2api.')
      }

      await Promise.all(
        activePlatforms(runtime.config).map(async (provider) => {
          try {
            result.models_by_provider[provider] = sanitizeModelNames(await runtime.sub2api.listModelNames(provider))
          } catch (error) {
            logger?.warn({ provider, err: error }, 'failed to fetch sub2api model names')
            result.models_by_provider[provider] = []
            warnings.push(`failed to fetch model list for ${provider}.`)
          }
        }),
      )

      cache.source = createCacheItem(result)
      return result
    },

    async getReference({ refresh = false } = {}) {
      const runtime = createRuntimeContext(repo, config, logger)
      if (!refresh && isFresh(cache.reference, runtime.config.pricingCacheTtlMs)) {
        return cache.reference.value
      }

      const warnings = []
      const source = await this.listSource({ refresh })
      warnings.push(...source.warnings)

      const modelSettings = repo.listVisibleModelSettings()
      const groupSettings = repo.listGroupSettings()
      const groupSettingMap = new Map(
        groupSettings.map((setting) => [`${setting.provider}:${setting.source_id}`, setting]),
      )

      const groups = source.groups
        .map((group) => mergeGroup(group, groupSettingMap.get(`${group.provider}:${group.source_id}`), runtime.config))
        .filter((group) => group.is_visible)
        .sort(createDisplayComparator(runtime.config.providerDisplayOrder))

      const models = await Promise.all(
        modelSettings.map(async (setting) => {
          const pricing = await getPricingForModel(runtime.sub2api, setting, warnings)
          return mergeModel(setting, pricing)
        }),
      )

      const result = {
        source: {
          ...sourceState(runtime.config, runtime.sub2api),
          status: pricingStatus(runtime.sub2api, warnings),
          fetched_at: new Date().toISOString(),
          cache_ttl_seconds: Math.round(runtime.config.pricingCacheTtlMs / 1000),
          warnings,
        },
        exchange: {
          usd_to_cny: runtime.config.usdToCny,
        },
        display: {
          provider_order: runtime.config.providerDisplayOrder,
        },
        groups,
        models: models.sort(createDisplayComparator(runtime.config.providerDisplayOrder)),
      }

      cache.reference = createCacheItem(result)
      return result
    },
  }
}

function createRuntimeContext(repo, baseConfig, logger) {
  const runtimeConfig = mergeRuntimeConfig(baseConfig, repo.listRuntimeSettings())
  return {
    config: runtimeConfig,
    sub2api: createSub2apiClient(runtimeConfig, logger),
  }
}

function mergeRuntimeConfig(baseConfig, settings) {
  const sub2apiApiBase = normalizeSub2apiBase(settings.sub2api_base_url || baseConfig.sub2apiApiBase)
  const sub2apiAdminApiKey = String(settings.sub2api_admin_api_key || baseConfig.sub2apiAdminApiKey || '').trim()
  const pricingPlatforms = parseRuntimePlatforms(settings.pricing_platforms, baseConfig.pricingPlatforms)
  const providerDisplayOrder = parseRuntimePlatforms(
    settings.provider_display_order,
    baseConfig.providerDisplayOrder || pricingPlatforms,
  )
  const usdToCny = numberOr(settings.usd_to_cny, baseConfig.usdToCny)
  return {
    ...baseConfig,
    sub2apiApiBase,
    sub2apiAdminApiKey,
    pricingPlatforms,
    providerDisplayOrder: normalizeProviderOrder(providerDisplayOrder, pricingPlatforms),
    usdToCny,
  }
}

function settingsView(runtimeConfig, rawSettings) {
  return {
    sub2api_base_url: stripApiSuffix(runtimeConfig.sub2apiApiBase),
    sub2api_admin_api_key_configured: Boolean(runtimeConfig.sub2apiAdminApiKey),
    sub2api_admin_api_key_masked: maskSecret(runtimeConfig.sub2apiAdminApiKey),
    pricing_platforms: runtimeConfig.pricingPlatforms,
    provider_display_order: runtimeConfig.providerDisplayOrder,
    usd_to_cny: runtimeConfig.usdToCny,
    overrides: {
      sub2api_base_url: Boolean(rawSettings.sub2api_base_url),
      sub2api_admin_api_key: Boolean(rawSettings.sub2api_admin_api_key),
      pricing_platforms: Boolean(rawSettings.pricing_platforms),
      provider_display_order: Boolean(rawSettings.provider_display_order),
      usd_to_cny: Boolean(rawSettings.usd_to_cny),
    },
  }
}

async function getPricingForModel(sub2api, setting, warnings) {
  if (!sub2api.configured) return { found: false }
  const pricing = await sub2api.getModelPricing(setting.model_name)
  if (!pricing?.found) {
    warnings.push(`pricing not found for ${setting.model_name}.`)
  }
  return pricing || { found: false }
}

function sourceState(config, sub2api, { includePrivate = false } = {}) {
  const state = {
    configured: sub2api.configured,
    platforms: activePlatforms(config),
  }
  if (includePrivate) {
    state.sub2api_api_base = config.sub2apiApiBase || null
  }
  return state
}

function pricingStatus(sub2api, warnings) {
  if (!sub2api.configured) return 'unconfigured'
  return warnings.length ? 'partial' : 'live'
}

function activePlatforms(config) {
  return config.pricingPlatforms.filter((provider) => providers.includes(provider))
}

function parseRuntimePlatforms(value, fallback) {
  if (!value) return fallback
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) {
      const normalized = parsed.map((item) => String(item).trim()).filter((item) => providers.includes(item))
      return normalized.length ? normalized : fallback
    }
  } catch {
    const normalized = String(value)
      .split(',')
      .map((item) => item.trim())
      .filter((item) => providers.includes(item))
    return normalized.length ? normalized : fallback
  }
  return fallback
}

function normalizeProviderOrder(order, activeProviderList) {
  const active = activeProviderList.filter((provider) => providers.includes(provider))
  const ordered = []
  for (const provider of order || []) {
    if (active.includes(provider) && !ordered.includes(provider)) ordered.push(provider)
  }
  for (const provider of active) {
    if (!ordered.includes(provider)) ordered.push(provider)
  }
  return ordered
}

function normalizeSub2apiBase(value) {
  const raw = String(value || '').trim().replace(/\/+$/, '')
  if (!raw) return ''
  return raw.endsWith('/api/v1') ? raw : `${raw}/api/v1`
}

function stripApiSuffix(value) {
  return String(value || '').replace(/\/api\/v1$/, '')
}

function maskSecret(value) {
  const text = String(value || '')
  if (!text) return ''
  if (text.length <= 14) return `${text.slice(0, 4)}...`
  return `${text.slice(0, 10)}...${text.slice(-4)}`
}

function sanitizeGroups(value) {
  if (!Array.isArray(value)) return []
  return value
    .map((group) => {
      const provider = normalizeProvider(group.platform)
      if (!provider) return null
      return {
        provider,
        provider_label: providerMeta[provider].label,
        provider_short: providerMeta[provider].short,
        source_id: String(group.id),
        source_name: String(group.name || ''),
        description: group.description || '',
        subscription_type: group.subscription_type || 'standard',
        is_exclusive: Boolean(group.is_exclusive),
        rate_multiplier: numberOr(group.rate_multiplier, 1),
        daily_limit_usd: numberOrNull(group.daily_limit_usd),
        weekly_limit_usd: numberOrNull(group.weekly_limit_usd),
        monthly_limit_usd: numberOrNull(group.monthly_limit_usd),
        default_validity_days: numberOr(group.default_validity_days, 30),
        allow_image_generation: Boolean(group.allow_image_generation),
        image_rate_independent: Boolean(group.image_rate_independent),
        image_rate_multiplier: numberOr(group.image_rate_multiplier, 1),
        image_price_1k: numberOrNull(group.image_price_1k),
        image_price_2k: numberOrNull(group.image_price_2k),
        image_price_4k: numberOrNull(group.image_price_4k),
        default_image_prices_usd: imagePriceTiers(),
        peak_rate_enabled: Boolean(group.peak_rate_enabled),
        peak_start: group.peak_start || '',
        peak_end: group.peak_end || '',
        peak_rate_multiplier: numberOr(group.peak_rate_multiplier, 1),
        status: group.status || 'active',
        sort_order: numberOr(group.sort_order, 1000),
      }
    })
    .filter(Boolean)
}

function sanitizeModelNames(value) {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.map((item) => String(item || '').trim()).filter(Boolean))).sort()
}

function sanitizeSubscriptionPlans(value) {
  if (!Array.isArray(value)) return []
  return value
    .map((plan) => {
      const groupId = plan.group_id ?? plan.groupId
      if (groupId == null) return null
      return {
        id: plan.id == null ? null : String(plan.id),
        group_id: String(groupId),
        name: String(plan.name || ''),
        description: String(plan.description || ''),
        product_name: String(plan.product_name || plan.productName || ''),
        price: numberOrNull(plan.price),
        original_price: numberOrNull(plan.original_price ?? plan.originalPrice),
        validity_days: numberOr(plan.validity_days ?? plan.validityDays, 30),
        validity_unit: String(plan.validity_unit || plan.validityUnit || 'day'),
        for_sale: plan.for_sale == null && plan.forSale == null ? true : Boolean(plan.for_sale ?? plan.forSale),
        sort_order: numberOr(plan.sort_order ?? plan.sortOrder, 1000),
      }
    })
    .filter(Boolean)
    .sort((a, b) => Number(b.for_sale) - Number(a.for_sale) || a.sort_order - b.sort_order)
}

function attachRechargeReferences(groups, plans) {
  const plansByGroup = new Map()
  for (const plan of plans) {
    if (!plansByGroup.has(plan.group_id)) plansByGroup.set(plan.group_id, [])
    plansByGroup.get(plan.group_id).push(plan)
  }

  return groups.map((group) => {
    const plan = plansByGroup.get(group.source_id)?.[0] || null
    const reference = inferRechargeReference(group, plan)
    return {
      ...group,
      recharge_reference: reference,
    }
  })
}

function inferRechargeReference(group, plan) {
  if (!plan) return null
  const payCny = positiveNumberOrNull(plan.price)
  const creditUsd = inferCreditUsd(group, plan)
  if (!payCny || !creditUsd) return null
  return {
    source: 'subscription_plan',
    plan_id: plan.id,
    plan_name: plan.name,
    pay_cny: payCny,
    credit_usd: creditUsd,
  }
}

function inferCreditUsd(group, plan) {
  return positiveNumberOrNull(group.monthly_limit_usd)
    || parseDollarQuota([
      plan.name,
      plan.product_name,
      plan.description,
      group.source_name,
      group.description,
    ])
}

function parseDollarQuota(values) {
  for (const value of values) {
    const match = String(value || '').match(/[$＄]\s*([0-9]+(?:\.[0-9]+)?)/)
    const parsed = positiveNumberOrNull(match?.[1])
    if (parsed) return parsed
  }
  return null
}

function mergeGroup(group, setting, config) {
  const recharge = resolveRechargeReference(group, setting, config)
  const rechargeMultiplier = recharge.multiplier
  const rateMultiplier = numberOr(group.rate_multiplier, 1)
  const effectiveRate = rateMultiplier / rechargeMultiplier
  const imageRateMultiplier = numberOr(group.image_rate_multiplier, 1)
  const imageEffectiveRate = (group.image_rate_independent ? imageRateMultiplier : rateMultiplier) / rechargeMultiplier
  const isVisible = setting?.is_visible == null ? !group.is_exclusive : setting.is_visible
  const imagePricesUsd = {
    '1k': numberOrNull(group.image_price_1k),
    '2k': numberOrNull(group.image_price_2k),
    '4k': numberOrNull(group.image_price_4k),
  }

  return {
    provider: group.provider,
    provider_label: group.provider_label,
    provider_short: group.provider_short,
    source_id: group.source_id,
    name: group.source_name,
    display_name: setting?.display_name || group.source_name,
    description: group.description,
    subscription_type: group.subscription_type,
    is_exclusive: group.is_exclusive,
    is_visible: Boolean(isVisible),
    rate_multiplier: rateMultiplier,
    recharge_multiplier: rechargeMultiplier,
    recharge_pay_cny: recharge.pay_cny,
    recharge_credit_usd: recharge.credit_usd,
    recharge_reference_source: recharge.source,
    recharge_reference_label: recharge.label,
    effective_rate: effectiveRate,
    allow_image_generation: Boolean(group.allow_image_generation),
    image_rate_independent: Boolean(group.image_rate_independent),
    image_rate_multiplier: imageRateMultiplier,
    image_effective_rate: imageEffectiveRate,
    image_prices_usd: imagePricesUsd,
    default_image_prices_usd: imagePriceTiers(),
    has_image_prices: Object.values(imagePricesUsd).some((value) => value != null),
    peak_rate_enabled: group.peak_rate_enabled,
    peak_start: group.peak_start,
    peak_end: group.peak_end,
    peak_rate_multiplier: group.peak_rate_multiplier,
    sort_order: setting?.sort_order ?? group.sort_order,
    note: setting?.note || '',
  }
}

function resolveRechargeReference(group, setting, config) {
  const usdToCny = numberOr(config?.usdToCny, 1)
  const manualPay = positiveNumberOrNull(setting?.recharge_pay_cny)
  const manualCredit = positiveNumberOrNull(setting?.recharge_credit_usd)
  const sourcePay = positiveNumberOrNull(group.recharge_reference?.pay_cny)
  const sourceCredit = positiveNumberOrNull(group.recharge_reference?.credit_usd)
  const defaultExchangeArtifact = isDefaultExchangeRecharge(manualPay, manualCredit, usdToCny)

  if (manualPay && manualCredit && !defaultExchangeArtifact) {
    return createRechargeReference({
      payCny: manualPay,
      creditUsd: manualCredit,
      source: 'manual',
      label: 'manual',
    })
  }

  if (sourcePay && sourceCredit) {
    return createRechargeReference({
      payCny: sourcePay,
      creditUsd: sourceCredit,
      source: group.recharge_reference.source || 'source',
      label: group.recharge_reference.plan_name || 'subscription plan',
    })
  }

  const multiplier = numberOr(setting?.recharge_multiplier, 1)
  if (setting?.recharge_multiplier && multiplier !== 1 && !defaultExchangeArtifact) {
    return createRechargeReference({
      payCny: 1,
      creditUsd: multiplier,
      source: 'legacy_multiplier',
      label: 'legacy multiplier',
    })
  }

  return createRechargeReference({
    payCny: 1,
    creditUsd: 1,
    source: 'balance_recharge',
    label: 'balance recharge',
  })
}

function createRechargeReference({ payCny, creditUsd, source, label }) {
  return {
    multiplier: creditUsd / payCny,
    pay_cny: payCny,
    credit_usd: creditUsd,
    source,
    label,
  }
}

function mergeModel(setting, pricing) {
  const provider = normalizeProvider(setting.provider)
  const prices = normalizePricing(pricing)
  const capabilities = inferModelCapabilities(setting.model_name, prices)
  return {
    provider,
    provider_label: providerMeta[provider]?.label || setting.provider,
    provider_short: providerMeta[provider]?.short || setting.provider.slice(0, 1).toUpperCase(),
    model_name: setting.model_name,
    display_name: setting.display_name || setting.model_name,
    billing_mode: inferBillingMode(prices, capabilities),
    capabilities,
    is_featured: Boolean(setting.is_featured),
    sort_order: setting.sort_order,
    note: setting.note || '',
    pricing_found: Boolean(pricing?.found),
    prices,
  }
}

function normalizePricing(pricing) {
  const outputCostPerImageUsd = numberOrNull(
    pricing?.output_cost_per_image ?? pricing?.per_image_price ?? pricing?.image_price,
  )
  return {
    input_usd_per_million: perTokenToPerMillion(pricing?.input_price),
    output_usd_per_million: perTokenToPerMillion(pricing?.output_price),
    cache_write_usd_per_million: perTokenToPerMillion(pricing?.cache_write_price),
    cache_read_usd_per_million: perTokenToPerMillion(pricing?.cache_read_price),
    image_output_usd_per_million: perTokenToPerMillion(pricing?.image_output_price),
    per_request_usd: numberOrNull(pricing?.per_request_price),
    output_cost_per_image_usd: outputCostPerImageUsd,
    default_image_prices_usd: imagePriceTiers(outputCostPerImageUsd),
  }
}

function inferModelCapabilities(modelName, prices) {
  return {
    image_generation: supportsImageGeneration(modelName, prices),
  }
}

function supportsImageGeneration(modelName, prices) {
  const imageOutputPrice = Number(prices.image_output_usd_per_million)
  if (Number.isFinite(imageOutputPrice) && imageOutputPrice > 0) return true

  const name = String(modelName || '').toLowerCase()
  return /(^|[-_.:])(gpt[-_.]?image|dall[-_.]?e|imagen|image|image[-_.]?generation)(?=$|[-_.:0-9a-z])/.test(name)
}

function inferBillingMode(prices, capabilities) {
  if (capabilities.image_generation) return 'image'
  if (prices.per_request_usd != null) return 'per_request'
  return 'token'
}

function normalizeProvider(value) {
  const provider = String(value || '').trim().toLowerCase()
  return providers.includes(provider) ? provider : ''
}

function perTokenToPerMillion(value) {
  const num = numberOrNull(value)
  if (num == null) return null
  return Number((num * 1_000_000).toPrecision(10))
}

function numberOr(value, fallback) {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

function numberOrNull(value) {
  if (value == null || value === '') return null
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function positiveNumberOrNull(value) {
  const num = numberOrNull(value)
  return num != null && num > 0 ? num : null
}

function imagePriceTiers(basePrice = null) {
  const base = positiveNumberOrNull(basePrice) || fallbackImageBasePriceUsd
  return {
    '1k': base,
    '2k': base * 1.5,
    '4k': base * 2,
  }
}

function isDefaultExchangeRecharge(payCny, creditUsd, usdToCny) {
  if (!payCny || !creditUsd) return false
  return Math.abs(payCny - usdToCny) < 0.0001 && Math.abs(creditUsd - 1) < 0.0001
}

function createDisplayComparator(providerOrder) {
  return (a, b) => {
    return providerRank(a.provider, providerOrder) - providerRank(b.provider, providerOrder)
      || (a.sort_order - b.sort_order)
      || String(a.display_name || '').localeCompare(String(b.display_name || ''), 'zh-CN', {
        numeric: true,
        sensitivity: 'base',
      })
  }
}

function providerRank(provider, providerOrder) {
  const index = providerOrder.indexOf(provider)
  return index >= 0 ? index : 999
}

function createCacheItem(value) {
  return {
    value,
    cached_at: Date.now(),
  }
}

function isFresh(item, ttlMs) {
  return item && Date.now() - item.cached_at < ttlMs
}
