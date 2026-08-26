import { createHash } from 'node:crypto'
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

    upsertModelSettings(inputs) {
      cache.reference = null
      return repo.upsertModelSettings(inputs)
    },

    deleteModelSetting(id) {
      cache.reference = null
      return repo.deleteModelSetting(id)
    },

    upsertGroupSetting(input) {
      cache.reference = null
      return repo.upsertGroupSetting(input)
    },

    upsertGroupSettings(inputs) {
      cache.reference = null
      return repo.upsertGroupSettings(inputs)
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
      if (!refresh) {
        const snapshot = repo.getPricingSourceSnapshot()
        if (snapshot && sourceSnapshotMatchesRuntime(snapshot, runtime)) {
          const result = normalizeSourceSnapshot(snapshot, runtime)
          cache.source = createCacheItem(result)
          return result
        }

        const result = createSourceResult(runtime)
        result.warnings.push(snapshot
          ? '来源配置已变化，请在后台重新刷新来源。'
          : '来源尚未手动刷新，请在后台点击“刷新来源”。')
        cache.source = createCacheItem(result)
        return result
      }

      cache.reference = null
      const warnings = []
      const result = createSourceResult(runtime, warnings)
      let groupsRefreshed = false

      if (!runtime.sub2api.configured) {
        warnings.push('sub2api admin source is not configured.')
        cache.source = createCacheItem(result)
        return result
      }

      try {
        const groups = await runtime.sub2api.listGroups()
        if (!Array.isArray(groups)) throw new TypeError('sub2api groups response is not an array.')
        result.groups = sanitizeGroups(groups)
        groupsRefreshed = true
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
          let pricingModels = []
          let accountAccess = []
          let accountAccessAvailable = true
          try {
            pricingModels = await runtime.sub2api.listModelNames(provider)
          } catch (error) {
            logger?.warn({ provider, err: error }, 'failed to fetch sub2api pricing model names')
            warnings.push(`failed to fetch pricing model list for ${provider}.`)
          }
          try {
            accountAccess = await runtime.sub2api.listAccountModelAccess(provider)
          } catch (error) {
            accountAccessAvailable = false
            logger?.warn({ provider, err: error }, 'failed to fetch sub2api account model names')
            warnings.push(`failed to fetch account model list for ${provider}.`)
          }
          const access = buildModelGroupAccess(pricingModels, accountAccess)
          result.models_by_provider[provider] = access.model_names
          result.model_first_seen_by_provider[provider] = repo.recordModelDiscoveries(provider, access.model_names)
          result.model_group_ids_by_provider[provider] = access.model_group_ids
          result.model_group_scope_by_provider[provider] = accountAccessAvailable
        }),
      )

      mergeGroupModelNames(result.groups, result.models_by_provider)
      result.model_pricing = await fetchModelPricingSnapshot(
        runtime.sub2api,
        pricingSnapshotModels(repo.listVisibleModelSettings(), result.groups),
        warnings,
      )

      if (!groupsRefreshed) {
        const snapshot = repo.getPricingSourceSnapshot()
        if (snapshot && sourceSnapshotMatchesRuntime(snapshot, runtime)) {
          const previous = normalizeSourceSnapshot(snapshot, runtime)
          previous.warnings = [...new Set([
            ...previous.warnings,
            ...warnings,
            '分组刷新失败，继续使用上一次成功快照。',
          ])]
          cache.source = createCacheItem(previous)
          return previous
        }
        cache.source = createCacheItem(result)
        return result
      }

      result.snapshot_available = true
      cache.source = createCacheItem(result)
      repo.savePricingSourceSnapshot({
        ...result,
        source_signature: sourceSignature(runtime),
      })
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
          const pricing = source.model_pricing?.[modelPricingKey(setting)] || { found: false }
          const scoped = source.model_group_scope_by_provider?.[setting.provider] === true
          const groupIds = scoped
            ? source.model_group_ids_by_provider?.[setting.provider]?.[setting.model_name] || []
            : null
          return mergeModel(setting, pricing, groupIds)
        }),
      )
      const scoped = scopePublicPricing(groups, models)

      const result = {
        source: {
          ...sourceState(runtime.config, runtime.sub2api),
          status: pricingStatus(runtime.sub2api, warnings),
          fetched_at: source.fetched_at || new Date().toISOString(),
          snapshot_available: Boolean(source.snapshot_available),
          cache_ttl_seconds: Math.round(runtime.config.pricingCacheTtlMs / 1000),
          warnings,
        },
        exchange: {
          usd_to_cny: runtime.config.usdToCny,
        },
        display: {
          provider_order: runtime.config.providerDisplayOrder,
        },
        groups: scoped.groups,
        models: scoped.models.sort(createDisplayComparator(runtime.config.providerDisplayOrder)),
      }

      cache.reference = createCacheItem(result)
      return result
    },

    getSub2apiClient() {
      return createRuntimeContext(repo, config, logger).sub2api
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

async function fetchModelPricingSnapshot(sub2api, settings, warnings) {
  const output = {}
  const queue = [...settings]
  const workers = Array.from({ length: Math.min(8, queue.length) }, async () => {
    while (queue.length) {
      const setting = queue.shift()
      if (!setting) return
      output[modelPricingKey(setting)] = await getPricingForModel(sub2api, setting, warnings)
    }
  })
  await Promise.all(workers)
  return output
}

function pricingSnapshotModels(settings, groups) {
  const values = new Map()
  for (const setting of settings || []) addPricingSnapshotModel(values, setting.provider, setting.model_name)
  for (const group of groups || []) {
    if (!group.model_list_enabled) continue
    for (const modelName of group.model_names || []) addPricingSnapshotModel(values, group.provider, modelName)
  }
  return [...values.values()]
}

function addPricingSnapshotModel(values, providerValue, modelValue) {
  const provider = normalizeProvider(providerValue)
  const modelName = String(modelValue || '').trim()
  if (!provider || !modelName) return
  values.set(`${provider}:${modelName.toLowerCase()}`, { provider, model_name: modelName })
}

function modelPricingKey(setting) {
  return `${normalizeProvider(setting.provider)}:${String(setting.model_name || '').trim().toLowerCase()}`
}

function createSourceResult(runtime, warnings = []) {
  return {
    source: sourceState(runtime.config, runtime.sub2api, { includePrivate: true }),
    groups: [],
    subscription_plans: [],
    models_by_provider: {},
    model_first_seen_by_provider: {},
    model_group_ids_by_provider: {},
    model_group_scope_by_provider: {},
    model_pricing: {},
    warnings,
    fetched_at: new Date().toISOString(),
    snapshot_available: false,
  }
}

function sourceSignature(runtime) {
  const source = [
    String(runtime.config.sub2apiApiBase || '').trim().replace(/\/+$/, '').toLowerCase(),
    String(runtime.config.sub2apiAdminApiKey || ''),
    [...activePlatforms(runtime.config)].sort().join(','),
  ].join('\n')
  return createHash('sha256').update(source).digest('hex')
}

function sourceSnapshotMatchesRuntime(snapshot, runtime) {
  return typeof snapshot?.source_signature === 'string'
    && snapshot.source_signature === sourceSignature(runtime)
}

function normalizeSourceSnapshot(snapshot, runtime) {
  const result = createSourceResult(runtime)
  result.snapshot_available = true
  result.groups = Array.isArray(snapshot.groups) ? snapshot.groups : []
  result.subscription_plans = Array.isArray(snapshot.subscription_plans) ? snapshot.subscription_plans : []
  result.models_by_provider = normalizeProviderMap(snapshot.models_by_provider, sanitizeModelNames)
  result.model_first_seen_by_provider = normalizeProviderMap(snapshot.model_first_seen_by_provider)
  result.model_group_ids_by_provider = normalizeProviderMap(snapshot.model_group_ids_by_provider)
  result.model_group_scope_by_provider = normalizeProviderMap(snapshot.model_group_scope_by_provider)
  result.model_pricing = snapshot.model_pricing && typeof snapshot.model_pricing === 'object'
    ? snapshot.model_pricing
    : {}
  result.warnings = Array.isArray(snapshot.warnings) ? snapshot.warnings : []
  result.fetched_at = snapshot.fetched_at || result.fetched_at
  return result
}

function normalizeProviderMap(value, normalizeValue = item => item) {
  if (!value || typeof value !== 'object') return {}
  return Object.fromEntries(Object.entries(value).map(([provider, item]) => [provider, normalizeValue(item)]))
}

function mergeGroupModelNames(groups, modelsByProvider) {
  for (const group of groups) {
    if (!group.model_list_enabled || !group.model_names.length) continue
    const current = modelsByProvider[group.provider] || []
    modelsByProvider[group.provider] = sanitizeModelNames([...current, ...group.model_names])
  }
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
        model_list_enabled: Boolean(group.models_list_config?.enabled),
        model_names: normalizeModelNamesInOrder(group.models_list_config?.models),
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

function normalizeModelNamesInOrder(value) {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  const output = []
  for (const item of value) {
    const model = String(item || '').trim()
    const key = model.toLowerCase()
    if (!model || seen.has(key)) continue
    seen.add(key)
    output.push(model)
  }
  return output
}

function buildModelGroupAccess(pricingModels, accountAccess) {
  const exactAccountModels = accountAccess.flatMap((account) => account.model_patterns.filter((name) => !name.includes('*')))
  const modelNames = sanitizeModelNames([...pricingModels, ...exactAccountModels])
  const groupsByModel = new Map(modelNames.map((name) => [name, new Set()]))
  const patternsByGroup = new Map()

  for (const account of accountAccess) {
    for (const groupId of account.group_ids) {
      if (!patternsByGroup.has(groupId)) patternsByGroup.set(groupId, new Set())
      const patterns = patternsByGroup.get(groupId)
      for (const pattern of account.model_patterns) patterns.add(pattern)
    }
  }

  for (const [groupId, patterns] of patternsByGroup) {
    for (const modelName of modelNames) {
      if (patterns.size && ![...patterns].some((pattern) => modelPatternMatches(pattern, modelName))) continue
      groupsByModel.get(modelName).add(groupId)
    }
  }

  return {
    model_names: modelNames,
    model_group_ids: Object.fromEntries(
      [...groupsByModel].map(([modelName, groupIds]) => [modelName, [...groupIds].sort()]),
    ),
  }
}

function modelPatternMatches(pattern, modelName) {
  if (!pattern.includes('*')) return pattern === modelName
  if (pattern === '*') return true
  if (pattern.endsWith('*') && pattern.indexOf('*') === pattern.length - 1) {
    return modelName.startsWith(pattern.slice(0, -1))
  }
  const expression = pattern
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*')
  return new RegExp(`^${expression}$`).test(modelName)
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
  const equivalentMultiplier = rateMultiplier * recharge.pay_cny / recharge.credit_usd
  const effectiveRate = equivalentMultiplier
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
    display_name: groupDisplayName(group, setting),
    description: group.description,
    model_list_enabled: Boolean(group.model_list_enabled),
    model_names: Array.isArray(group.model_names) ? [...group.model_names] : [],
    subscription_type: group.subscription_type,
    is_exclusive: group.is_exclusive,
    is_visible: Boolean(isVisible),
    rate_multiplier: rateMultiplier,
    recharge_multiplier: rechargeMultiplier,
    recharge_pay_cny: recharge.pay_cny,
    recharge_credit_usd: recharge.credit_usd,
    recharge_reference_source: recharge.source,
    recharge_reference_label: recharge.label,
    equivalent_multiplier: equivalentMultiplier,
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

function scopePublicPricing(groups, models) {
  const usedGroups = new Set()
  const scopedModels = models.flatMap((model) => {
    const modelName = String(model.model_name || '').trim().toLowerCase()
    const allowedGroups = groups.filter((group) => {
      if (group.provider !== model.provider) return false
      if (model.group_ids != null && !model.group_ids.includes(group.source_id)) return false
      if (!group.model_list_enabled) return true
      return Array.isArray(group.model_names)
        && group.model_names.some(name => String(name || '').trim().toLowerCase() === modelName)
    })
    if (!allowedGroups.length) return []
    for (const group of allowedGroups) usedGroups.add(`${group.provider}:${group.source_id}`)
    return [{ ...model, group_ids: allowedGroups.map(group => group.source_id) }]
  })
  return {
    groups: groups.filter(group => usedGroups.has(`${group.provider}:${group.source_id}`)),
    models: scopedModels,
  }
}

function groupDisplayName(group, setting) {
  const override = String(setting?.display_name || '').trim()
  const savedSourceName = String(setting?.source_name || '').trim()
  if (override && override !== savedSourceName) return override
  return group.source_name
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

function mergeModel(setting, pricing, groupIds) {
  const provider = normalizeProvider(setting.provider)
  const prices = normalizePricing(pricing)
  const configuredImagePrices = {
    '1k': positiveNumberOrNull(setting.image_price_1k),
    '2k': positiveNumberOrNull(setting.image_price_2k),
    '4k': positiveNumberOrNull(setting.image_price_4k),
  }
  const hasConfiguredImagePrices = Object.values(configuredImagePrices).some((value) => value != null)
  const capabilities = inferModelCapabilities(setting.model_name, prices, setting.is_image_model, hasConfiguredImagePrices)
  if (hasConfiguredImagePrices) {
    prices.default_image_prices_usd = {
      ...prices.default_image_prices_usd,
      ...Object.fromEntries(Object.entries(configuredImagePrices).filter(([, value]) => value != null)),
    }
  }
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
    group_ids: groupIds,
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

function inferModelCapabilities(modelName, prices, imageOverride = null, hasConfiguredImagePrices = false) {
  return {
    image_generation: imageOverride == null
      ? hasConfiguredImagePrices || supportsImageGeneration(modelName, prices)
      : Boolean(imageOverride),
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
