import Database from 'better-sqlite3'
import { describe, expect, it, vi } from 'vitest'
import { migrations } from '../server/db/migrations.js'
import { createModelPricingService, inferModelVendor } from '../server/domain/model-pricing/service.js'

function createDatabase() {
  const db = new Database(':memory:')
  for (const migration of migrations) migration.up(db)
  return db
}

function createClient() {
  return {
    configured: true,
    async listGroups() {
      return [
        {
          id: 6,
          name: 'OpenAI public',
          platform: 'openai',
          status: 'active',
          is_exclusive: false,
          rate_multiplier: 0.27,
          models_list_config: { enabled: false, models: ['gpt-5.6', 'deepseek-v4-flash'] },
          model_pricing: [{
            platform: 'openai',
            models: ['gpt-*'],
            billing_mode: 'token',
            input_price: 0.0000005,
            output_price: 0.0000015,
            cache_read_price: 0.00000005,
            cache_write_price: null,
          }],
        },
        {
          id: 19,
          name: 'DeepSeek public',
          platform: 'openai',
          status: 'active',
          is_exclusive: false,
          rate_multiplier: 0.3,
          models_list_config: { enabled: true, models: ['deepseek-v4-flash'] },
        },
        {
          id: 20,
          name: 'Private',
          platform: 'openai',
          status: 'active',
          is_exclusive: true,
          rate_multiplier: 1,
          models_list_config: { enabled: true, models: ['gpt-5.6'] },
        },
      ]
    },
    async getModelPricing() {
      return { found: true, input_price: 0.000001, output_price: 0.000002, cache_read_price: 0.0000001, cache_write_price: 0 }
    },
    async listChannels() {
      return [{
        id: 4,
        name: '国产模型',
        status: 'active',
        group_ids: [6, 19],
        model_pricing: [
          {
            platform: 'openai',
            models: ['gpt-*'],
            billing_mode: 'token',
            input_price: 0.0000008,
            output_price: 0.0000018,
          },
          {
            platform: 'openai',
            models: ['deepseek-v4-flash'],
            billing_mode: 'token',
            input_price: 0.00000022,
            output_price: 0.00000066,
            cache_read_price: 0.000000007,
            cache_write_price: 0,
            time_pricing: {
              timezone: 'Asia/Shanghai',
              weekdays_only: false,
              periods: [{ start_time: '09:00:00', end_time: '12:00:00', multiplier: 2 }],
            },
          },
        ],
      }]
    },
  }
}

const config = {
  sub2apiApiBase: 'https://upstream.example/api/v1',
  sub2apiAdminApiKey: 'admin-key',
  pricingCacheTtlMs: 60_000,
  pricingFetchTimeoutMs: 5_000,
  usdToCny: 7,
}

describe('group model pricing', () => {
  it('infers vendors from model names instead of the protocol platform', () => {
    expect(inferModelVendor('gpt-5.6').id).toBe('openai')
    expect(inferModelVendor('deepseek-v4-flash').id).toBe('deepseek')
    expect(inferModelVendor('glm-5.2').id).toBe('zhipu')
    expect(inferModelVendor('kimi-k2.6').id).toBe('moonshot')
  })

  it('keeps public groups with disabled allowlists and layers by inferred vendor', async () => {
    const db = createDatabase()
    const service = createModelPricingService({ db, config, logger: null, clientFactory: vi.fn(() => createClient()) })
    const catalog = await service.getCatalog({ refresh: true })

    expect(catalog.summary).toEqual({ vendors: 2, groups: 2, models: 2 })
    expect(catalog.vendors.find(item => item.id === 'openai')?.groups.map(item => item.id)).toEqual(['6'])
    expect(catalog.vendors.find(item => item.id === 'deepseek')?.groups.map(item => item.id)).toEqual(expect.arrayContaining(['6', '19']))
    expect(catalog.vendors.flatMap(item => item.groups).some(item => item.id === '20')).toBe(false)
    db.close()
  })

  it('stores manual multipliers separately for the same model in different groups', async () => {
    const db = createDatabase()
    const service = createModelPricingService({ db, config, logger: null, clientFactory: vi.fn(() => createClient()) })
    await service.getCatalog({ refresh: true })
    await service.upsertOverrides([
      { group_id: '6', model_name: 'deepseek-v4-flash', is_enabled: true, multiplier: 0.5 },
      { group_id: '19', model_name: 'deepseek-v4-flash', is_enabled: true, multiplier: 0.8 },
    ])

    const catalog = await service.getCatalog()
    const deepSeek = catalog.vendors.find(item => item.id === 'deepseek')
    const group6 = deepSeek?.groups.find(item => item.id === '6')?.models[0]
    const group19 = deepSeek?.groups.find(item => item.id === '19')?.models[0]
    expect(group6).toMatchObject({ effective_multiplier: 0.5, multiplier_source: 'manual' })
    expect(group19).toMatchObject({ effective_multiplier: 0.8, multiplier_source: 'manual' })
    expect(group6?.effective_prices.input_usd_per_million).toBe(0.11)
    expect(group19?.effective_prices.input_usd_per_million).toBe(0.176)
    db.close()
  })

  it('uses group pricing before channel pricing and lets manual prices win', async () => {
    const db = createDatabase()
    const service = createModelPricingService({ db, config, logger: null, clientFactory: vi.fn(() => createClient()) })
    await service.getCatalog({ refresh: true })

    let catalog = await service.getCatalog({ includeHidden: true })
    let model = catalog.vendors.find(item => item.id === 'openai')?.groups[0]?.models[0]
    expect(model).toMatchObject({ base_price_source: 'group', upstream_price_source: 'group', effective_multiplier: 0.27 })
    expect(model?.official_prices.input_usd_per_million).toBe(1)
    expect(model?.group_prices.input_usd_per_million).toBe(0.5)
    expect(model?.channel_prices.input_usd_per_million).toBeNull()
    expect(model?.effective_prices.input_usd_per_million).toBe(0.135)
    expect(model?.discount_ratio).toBe(0.03857143)

    await service.upsertOverrides([{
      group_id: '6',
      model_name: 'gpt-5.6',
      is_enabled: true,
      is_visible: true,
      multiplier: 0.5,
      input_usd_per_million: 0.2,
    }])
    catalog = await service.getCatalog({ includeHidden: true })
    model = catalog.vendors.find(item => item.id === 'openai')?.groups[0]?.models[0]
    expect(model).toMatchObject({ base_price_source: 'manual', effective_multiplier: 0.5 })
    expect(model?.upstream_base_prices.input_usd_per_million).toBe(0.5)
    expect(model?.effective_prices.input_usd_per_million).toBe(0.1)
    db.close()
  })

  it('uses custom official prices for display while keeping platform prices on the base price', async () => {
    const db = createDatabase()
    const service = createModelPricingService({ db, config, logger: null, clientFactory: vi.fn(() => createClient()) })
    await service.getCatalog({ refresh: true })
    await service.upsertOverrides([{
      group_id: '6',
      model_name: 'gpt-5.6',
      is_enabled: true,
      official_input_usd_per_million: 2,
    }])
    const model = (await service.getCatalog({ includeHidden: true })).vendors.find(item => item.id === 'openai')?.groups[0]?.models[0]
    expect(model).toMatchObject({ official_price_source: 'manual' })
    expect(model?.official_display_prices.input_usd_per_million).toBe(2)
    expect(model?.official_display_prices.output_usd_per_million).toBe(model?.base_prices.output_usd_per_million)
    expect(model?.effective_prices.input_usd_per_million).toBe(0.135)
    db.close()
  })

  it('displays manually configured official RMB prices without exchange conversion', async () => {
    const db = createDatabase()
    const service = createModelPricingService({ db, config, logger: null, clientFactory: vi.fn(() => createClient()) })
    await service.getCatalog({ refresh: true })
    await service.upsertOverrides([{
      group_id: '6',
      model_name: 'gpt-5.6',
      is_enabled: true,
      official_price_unit: 'rmb',
      official_input_usd_per_million: 12.34,
    }])
    const model = (await service.getCatalog({ includeHidden: true })).vendors.find(item => item.id === 'openai')?.groups[0]?.models[0]
    expect(model).toMatchObject({ official_price_source: 'manual', official_price_unit: 'rmb' })
    expect(model?.official_display_prices.input_usd_per_million).toBe(12.34)
    db.close()
  })

  it('persists a custom public group display name', async () => {
    const db = createDatabase()
    const service = createModelPricingService({ db, config, logger: null, clientFactory: vi.fn(() => createClient()) })
    await service.getCatalog({ refresh: true })
    service.upsertGroupSetting({ group_id: '6', display_name: 'OpenAI 精选线路' })
    const group = (await service.getCatalog()).vendors.find(item => item.id === 'openai')?.groups[0]
    expect(group).toMatchObject({ name: 'OpenAI 精选线路', display_name: 'OpenAI 精选线路', source_name: 'OpenAI public' })
    db.close()
  })

  it('uses the active linked channel price and exposes peak pricing', async () => {
    const db = createDatabase()
    const service = createModelPricingService({ db, config, logger: null, clientFactory: vi.fn(() => createClient()) })
    const catalog = await service.getCatalog({ refresh: true })
    const model = catalog.vendors.find(item => item.id === 'deepseek')?.groups.find(item => item.id === '19')?.models[0]

    expect(model).toMatchObject({ base_price_source: 'channel', upstream_price_source: 'channel', effective_multiplier: 0.3 })
    expect(model?.channel_prices.input_usd_per_million).toBe(0.22)
    expect(model?.effective_prices.input_usd_per_million).toBe(0.066)
    expect(model?.time_pricing).toMatchObject({
      timezone: 'Asia/Shanghai',
      periods: [{ start_time: '09:00:00', end_time: '12:00:00', multiplier: 2 }],
    })
    expect(model?.time_pricing?.periods[0]?.effective_prices.input_usd_per_million).toBe(0.132)
    db.close()
  })

  it('hides unchecked models from the public catalog but keeps them in admin', async () => {
    const db = createDatabase()
    const service = createModelPricingService({ db, config, logger: null, clientFactory: vi.fn(() => createClient()) })
    await service.getCatalog({ refresh: true })
    await service.upsertOverrides([{
      group_id: '6',
      model_name: 'gpt-5.6',
      is_enabled: false,
      is_visible: false,
    }])

    const publicCatalog = await service.getCatalog()
    const adminCatalog = await service.getCatalog({ includeHidden: true })
    expect(publicCatalog.vendors.find(item => item.id === 'openai')).toBeUndefined()
    expect(adminCatalog.vendors.find(item => item.id === 'openai')?.groups[0]?.models[0]).toMatchObject({ is_visible: false })
    db.close()
  })

  it('uses per-image tiers for OpenAI image models and applies group prices before channel prices', async () => {
    const db = createDatabase()
    const imageClient = {
      configured: true,
      async listGroups() {
        return [{
          id: 8,
          name: 'OpenAI Images',
          platform: 'openai',
          status: 'active',
          is_exclusive: false,
          rate_multiplier: 0.5,
          models_list_config: { enabled: true, models: ['gpt-image-2'] },
          image_price_1k: 0.02,
        }]
      },
      async listChannels() {
        return [{
          id: 9,
          name: 'Images',
          status: 'active',
          group_ids: [8],
          model_pricing: [{
            platform: 'openai',
            models: ['gpt-image-2'],
            billing_mode: 'image',
            per_request_price: 0.05,
            intervals: [
              { tier_label: '1K', per_request_price: 0.04, sort_order: 0 },
              { tier_label: '2K', per_request_price: 0.08, sort_order: 1 },
              { tier_label: '4K', per_request_price: 0.16, sort_order: 2 },
            ],
          }],
        }]
      },
      async getModelPricing() {
        return { found: true, input_price: 0, output_price: 0 }
      },
    }
    const service = createModelPricingService({ db, config, logger: null, clientFactory: vi.fn(() => imageClient) })
    let model = (await service.getCatalog({ refresh: true })).vendors[0]?.groups[0]?.models[0]

    expect(model).toMatchObject({ billing_mode: 'image', effective_multiplier: 0.5 })
    expect(model?.image_prices).toEqual([
      { label: '1K', base_price_usd_per_image: 0.02, effective_price_cny_per_image: 0.01, discount_ratio: 0.07142857 },
      { label: '2K', base_price_usd_per_image: 0.08, effective_price_cny_per_image: 0.04, discount_ratio: 0.07142857 },
      { label: '4K', base_price_usd_per_image: 0.16, effective_price_cny_per_image: 0.08, discount_ratio: 0.07142857 },
    ])

    await service.upsertOverrides([{
      group_id: '8',
      model_name: 'gpt-image-2',
      is_enabled: true,
      is_visible: true,
      image_price_2k: 0.03,
      official_image_price_2k: 0.12,
    }])
    model = (await service.getCatalog()).vendors[0]?.groups[0]?.models[0]
    expect(model?.manual_image_prices).toEqual([{ label: '2K', price: 0.03 }])
    expect(model?.upstream_image_prices.find(item => item.label === '2K')?.price).toBe(0.08)
    expect(model?.official_display_image_prices.find(item => item.label === '2K')?.price).toBe(0.12)
    expect(model?.image_prices.find(item => item.label === '2K')?.effective_price_cny_per_image).toBe(0.015)
    db.close()
  })

  it('uses subscription and independent image multipliers per group', async () => {
    const db = createDatabase()
    const imageClient = {
      configured: true,
      async listGroups() {
        return [{
          id: 30,
          name: '订阅图片组',
          platform: 'openai',
          status: 'active',
          is_exclusive: true,
          subscription_type: 'subscription',
          rate_multiplier: 0.8,
          image_rate_independent: true,
          image_rate_multiplier: 0.25,
          models_list_config: { enabled: true, models: ['gpt-image-2'] },
          image_price_1k: 0.4,
        }]
      },
      async listChannels() { return [] },
      async listSubscriptionPlans() {
        return [{ id: 7, group_id: 30, name: '月度订阅', price: 3, original_price: 6, monthly_limit_usd: 6, currency: 'CNY', for_sale: true, sort_order: 0 }]
      },
      async getModelPricing() { return { found: true, input_price: 0, output_price: 0 } },
    }
    const service = createModelPricingService({ db, config, logger: null, clientFactory: vi.fn(() => imageClient) })
    const model = (await service.getCatalog({ refresh: true })).vendors[0]?.groups[0]?.models[0]

    expect(model).toMatchObject({
      effective_multiplier: 0.4,
      group_effective_multiplier: 0.8,
      image_effective_multiplier: 0.125,
    })
    expect(model?.group_effective_multiplier).toBe(0.8)
    expect(model?.image_prices[0]?.effective_price_cny_per_image).toBe(0.05)
    db.close()
  })

  it('keeps a subscription group when its custom model list is disabled', async () => {
    const db = createDatabase()
    const subscriptionClient = {
      configured: true,
      async listGroups() {
        return [{
          id: 44,
          name: '订阅组',
          platform: 'openai',
          status: 'active',
          is_exclusive: true,
          subscription_type: 'subscription',
          rate_multiplier: 1,
          models_list_config: { enabled: false, models: [] },
          model_pricing: [{ platform: 'openai', models: ['gpt-5.6'], billing_mode: 'token', input_price: 0.000001, output_price: 0.000002 }],
        }]
      },
      async listChannels() { return [] },
      async listSubscriptionPlans() {
        return { data: [{ id: 9, group_id: 44, name: '订阅月卡', price: 50, original_price: 99, monthly_limit_usd: 210, currency: 'CNY', for_sale: true }] }
      },
      async getModelPricing() { return { found: true, input_price: 0.000001, output_price: 0.000002 } },
    }
    const service = createModelPricingService({ db, config, logger: null, clientFactory: vi.fn(() => subscriptionClient) })
    const group = (await service.getCatalog({ refresh: true })).vendors[0]?.groups[0]
    expect(group).toMatchObject({ id: '44', effective_multiplier: 1, subscription_multiplier: 0.23809524 })
    expect(group?.subscription_plan).toMatchObject({ price: 50, monthly_quota_usd: 210, original_price: 99 })
    expect(group?.models[0]).toMatchObject({ group_effective_multiplier: 1, effective_multiplier: 0.23809524 })
    expect(group?.models[0]?.effective_prices.input_usd_per_million).toBe(0.23809524)
    expect(group?.models.map(model => model.model_name)).toEqual(['gpt-5.6'])
    db.close()
  })

  it('persists vendor, group, and model display ordering', async () => {
    const db = createDatabase()
    const client = createClient()
    const listGroups = client.listGroups
    client.listGroups = async () => {
      const groups = await listGroups()
      groups[0].models_list_config.models.push('gpt-4.1')
      return groups
    }
    const service = createModelPricingService({ db, config, logger: null, clientFactory: vi.fn(() => client) })
    const defaultCatalog = await service.getCatalog({ refresh: true })
    expect(defaultCatalog.vendors.find(item => item.id === 'openai')?.groups.find(item => item.id === '6')?.models.map(item => item.model_name)).toEqual(['gpt-4.1', 'gpt-5.6'])
    service.upsertDisplayOrder([
      { scope: 'vendor', parent_key: '', item_key: 'deepseek', sort_order: 0 },
      { scope: 'vendor', parent_key: '', item_key: 'openai', sort_order: 10 },
      { scope: 'group', parent_key: 'deepseek', item_key: '19', sort_order: 0 },
      { scope: 'group', parent_key: 'deepseek', item_key: '6', sort_order: 10 },
      { scope: 'model', parent_key: 'openai:6', item_key: 'gpt-5.6', sort_order: 0 },
      { scope: 'model', parent_key: 'openai:6', item_key: 'gpt-4.1', sort_order: 10 },
    ])

    const catalog = await service.getCatalog({ includeHidden: true })
    expect(catalog.vendors.map(item => item.id)).toEqual(['deepseek', 'openai'])
    expect(catalog.vendors[0]?.groups.map(item => item.id)).toEqual(['19', '6'])
    expect(catalog.vendors[1]?.groups.find(item => item.id === '6')?.models.map(item => item.model_name)).toEqual(['gpt-5.6', 'gpt-4.1'])
    db.close()
  })

  it('serves the public catalog snapshot without contacting upstream after restart', async () => {
    const db = createDatabase()
    const service = createModelPricingService({ db, config, logger: null, clientFactory: vi.fn(() => createClient()) })
    const expected = await service.getCatalog({ refresh: true })
    const disconnectedFactory = vi.fn(() => {
      throw new Error('upstream must not be created when a public snapshot exists')
    })
    const restartedService = createModelPricingService({ db, config, logger: null, clientFactory: disconnectedFactory })

    const catalog = await restartedService.getCatalog({ preferSnapshot: true })

    expect(catalog).toEqual(expected)
    expect(disconnectedFactory).not.toHaveBeenCalled()
    db.close()
  })

  it('rebuilds the public snapshot after admin pricing and group settings change', async () => {
    const db = createDatabase()
    const service = createModelPricingService({ db, config, logger: null, clientFactory: vi.fn(() => createClient()) })
    await service.getCatalog({ refresh: true, includeHidden: true })
    await service.upsertOverrides([{
      group_id: '6',
      model_name: 'gpt-5.6',
      is_enabled: true,
      is_visible: true,
      multiplier: 0.45,
      input_usd_per_million: 0.25,
    }])
    await service.upsertGroupSetting({ group_id: '6', display_name: '快照线路' })

    const disconnectedFactory = vi.fn(() => {
      throw new Error('upstream must not be created when reading the rebuilt snapshot')
    })
    const restartedService = createModelPricingService({ db, config, logger: null, clientFactory: disconnectedFactory })
    const catalog = await restartedService.getCatalog({ preferSnapshot: true })
    const model = catalog.vendors.find(item => item.id === 'openai')?.groups[0]?.models[0]

    expect(catalog.vendors.find(item => item.id === 'openai')?.groups[0]?.name).toBe('快照线路')
    expect(model).toMatchObject({ effective_multiplier: 0.45, base_price_source: 'manual' })
    expect(model?.base_prices.input_usd_per_million).toBe(0.25)
    expect(disconnectedFactory).not.toHaveBeenCalled()
    db.close()
  })

  it('clears all manual pricing while preserving display metadata and rebuilds the public snapshot', async () => {
    const db = createDatabase()
    const service = createModelPricingService({ db, config, logger: null, clientFactory: vi.fn(() => createClient()) })
    await service.getCatalog({ refresh: true, includeHidden: true })
    await service.upsertOverrides([
      {
        group_id: '6',
        model_name: 'gpt-5.6',
        is_enabled: true,
        is_visible: false,
        multiplier: 0.45,
        input_usd_per_million: 0.25,
        official_input_usd_per_million: 2,
        official_price_unit: 'rmb',
        note: '保留备注',
      },
      {
        group_id: '19',
        model_name: 'deepseek-v4-flash',
        is_enabled: true,
        is_visible: true,
        multiplier: 0.8,
        image_price_1k: 0.03,
        official_image_price_1k: 0.12,
      },
    ])

    const result = await service.clearAllManualOverrides()
    const overrides = service.listOverrides()
    const group6Override = overrides.find(item => item.group_id === '6')
    const group19Override = overrides.find(item => item.group_id === '19')
    expect(result).toEqual({ cleared: 2 })
    expect(overrides).toHaveLength(2)
    expect(group6Override).toMatchObject({
      is_enabled: false,
      is_visible: false,
      multiplier: null,
      input_usd_per_million: null,
      official_input_usd_per_million: null,
      official_price_unit: 'rmb',
      note: '保留备注',
    })
    expect(group19Override).toMatchObject({
      is_enabled: false,
      is_visible: true,
      multiplier: null,
      image_price_1k: null,
      official_image_price_1k: null,
    })

    const disconnectedFactory = vi.fn(() => {
      throw new Error('upstream must not be created when reading the rebuilt snapshot')
    })
    const restartedService = createModelPricingService({ db, config, logger: null, clientFactory: disconnectedFactory })
    const catalog = await restartedService.getCatalog({ preferSnapshot: true })
    const model = catalog.vendors.find(item => item.id === 'deepseek')?.groups.find(item => item.id === '19')?.models[0]
    expect(model).toMatchObject({ override_enabled: false, multiplier_source: 'source', base_price_source: 'channel' })
    expect(disconnectedFactory).not.toHaveBeenCalled()
    db.close()
  })
})
