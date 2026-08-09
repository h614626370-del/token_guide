import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openDatabase } from '../server/db/index.js'
import { createPricingRepository } from '../server/domain/pricing/repository.js'
import { createPricingService } from '../server/domain/pricing/service.js'

const temporaryDirectories: string[] = []

function createDatabase() {
  const directory = mkdtempSync(join(tmpdir(), 'kkflow-guide-pricing-'))
  temporaryDirectories.push(directory)
  return openDatabase(join(directory, 'guide.sqlite'))
}

afterEach(() => {
  vi.unstubAllGlobals()
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('pricing repository', () => {
  it('records model discovery only once so later refreshes do not make old models new again', () => {
    const db = createDatabase()
    const repo = createPricingRepository(db)

    expect(repo.recordModelDiscoveries('openai', ['gpt-old'], '2026-01-01T00:00:00.000Z')).toMatchObject({
      'gpt-old': '2026-01-01T00:00:00.000Z',
    })
    expect(repo.recordModelDiscoveries('openai', ['gpt-old', 'gpt-new'], '2026-02-01T00:00:00.000Z')).toMatchObject({
      'gpt-old': '2026-01-01T00:00:00.000Z',
      'gpt-new': '2026-02-01T00:00:00.000Z',
    })
    db.close()
  })

  it('rolls back a bulk model update when any row is invalid', () => {
    const db = createDatabase()
    const repo = createPricingRepository(db)

    expect(() => repo.upsertModelSettings([
      { provider: 'gemini', model_name: 'transaction-probe', is_visible: true },
      { provider: 'gemini', model_name: null, is_visible: true },
    ])).toThrow()

    expect(repo.listModelSettings().some((item: any) => item.model_name === 'transaction-probe')).toBe(false)
    db.close()
  })

  it('derives the recharge multiplier from the CNY payment and USD credit pair', () => {
    const db = createDatabase()
    const repo = createPricingRepository(db)
    const group = repo.upsertGroupSetting({
      provider: 'openai',
      source_id: 'group-1',
      source_name: 'Standard',
      is_visible: true,
      recharge_pay_cny: 20,
      recharge_credit_usd: 100,
    })

    expect(group).toMatchObject({
      recharge_pay_cny: 20,
      recharge_credit_usd: 100,
      recharge_multiplier: 5,
    })
    db.close()
  })

  it('stores and explicitly clears the runtime admin API key', () => {
    const db = createDatabase()
    const repo = createPricingRepository(db)

    repo.updateRuntimeSettings({
      sub2api_admin_api_key: 'runtime-secret',
      pricing_platforms: ['openai', 'gemini'],
      usd_to_cny: 7.1,
    })
    expect(repo.listRuntimeSettings()).toMatchObject({
      sub2api_admin_api_key: 'runtime-secret',
      pricing_platforms: '["openai","gemini"]',
      usd_to_cny: '7.1',
    })

    repo.updateRuntimeSettings({ clear_sub2api_admin_api_key: true })
    expect(repo.listRuntimeSettings()).not.toHaveProperty('sub2api_admin_api_key')
    db.close()
  })
})

describe('pricing service', () => {
  it('uses each group model allowlist and persists the manually refreshed source', async () => {
    const db = createDatabase()
    db.prepare('UPDATE pricing_model_settings SET is_visible = 0').run()

    const fetchMock = vi.fn(async (input: URL | RequestInfo) => {
      const requestUrl = new URL(String(input))
      let data: any
      if (requestUrl.pathname.endsWith('/admin/groups/all')) {
        data = [{
          id: 7,
          name: 'DeepSeek Flash',
          platform: 'openai',
          models_list_config: { enabled: true, models: ['deepseek-v4-flash'] },
        }]
      } else if (requestUrl.pathname.endsWith('/admin/payment/plans')) {
        data = []
      } else if (requestUrl.pathname.endsWith('/admin/channels/pricing/sync-models')) {
        data = { models: ['gpt-5.6-sol'] }
      } else if (requestUrl.pathname.endsWith('/admin/channels/model-pricing')) {
        data = {
          found: requestUrl.searchParams.get('model') === 'deepseek-v4-flash',
          input_price: 0.000001,
          output_price: 0.000002,
        }
      } else {
        return new Response('not found', { status: 404 })
      }
      return new Response(JSON.stringify({ code: 0, data }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const config = {
      sub2apiApiBase: 'https://upstream.example/api/v1',
      sub2apiAdminApiKey: 'admin-key',
      pricingPlatforms: ['openai'],
      providerDisplayOrder: ['openai'],
      pricingCacheTtlMs: 60_000,
      pricingFetchTimeoutMs: 5_000,
      usdToCny: 7,
    }
    const service = createPricingService({ db, config, logger: null })
    const source = await service.listSource({ refresh: true })

    expect(source.snapshot_available).toBe(true)
    expect(source.groups[0]).toMatchObject({
      model_list_enabled: true,
      model_names: ['deepseek-v4-flash'],
    })
    expect(source.models_by_provider.openai).toEqual(['deepseek-v4-flash', 'gpt-5.6-sol'])
    expect(source.model_pricing['openai:deepseek-v4-flash']).toMatchObject({ found: true })

    const callsAfterRefresh = fetchMock.mock.calls.length
    const restartedService = createPricingService({ db, config, logger: null })
    const snapshot = await restartedService.listSource()
    expect(snapshot.snapshot_available).toBe(true)
    expect(snapshot.groups[0].model_names).toEqual(['deepseek-v4-flash'])
    expect(fetchMock).toHaveBeenCalledTimes(callsAfterRefresh)
    db.close()
  })

  it('keeps the last successful group snapshot when a manual refresh fails', async () => {
    const db = createDatabase()
    const repo = createPricingRepository(db)
    const config = {
      sub2apiApiBase: 'https://upstream.example/api/v1',
      sub2apiAdminApiKey: 'admin-key',
      pricingPlatforms: ['openai'],
      providerDisplayOrder: ['openai'],
      pricingCacheTtlMs: 60_000,
      pricingFetchTimeoutMs: 5_000,
      usdToCny: 7,
    }
    vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo) => {
      const pathname = new URL(String(input)).pathname
      const data = pathname.endsWith('/admin/groups/all')
        ? [{ id: 11, name: 'DeepSeek Flash', platform: 'openai', models_list_config: { enabled: true, models: ['deepseek-v4-flash'] } }]
        : pathname.endsWith('/admin/channels/pricing/sync-models')
          ? { models: ['deepseek-v4-flash'] }
          : pathname.endsWith('/admin/channels/model-pricing')
            ? { found: true, input_price: 0.000001, output_price: 0.000002 }
            : []
      return new Response(JSON.stringify({ code: 0, data }), { status: 200 })
    }))
    await createPricingService({ db, config, logger: null }).listSource({ refresh: true })

    vi.stubGlobal('fetch', vi.fn(async () => new Response('unavailable', { status: 503 })))
    const source = await createPricingService({ db, config, logger: null }).listSource({ refresh: true })

    expect(source).toMatchObject({
      snapshot_available: true,
      groups: [{ source_id: '11', model_names: ['deepseek-v4-flash'] }],
    })
    expect(source.warnings).toContain('分组刷新失败，继续使用上一次成功快照。')
    expect(repo.getPricingSourceSnapshot().groups[0].model_names).toEqual(['deepseek-v4-flash'])

    vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo) => {
      const pathname = new URL(String(input)).pathname
      const data = pathname.endsWith('/admin/groups/all') ? {} : []
      return new Response(JSON.stringify({ code: 0, data }), { status: 200 })
    }))
    const malformed = await createPricingService({ db, config, logger: null }).listSource({ refresh: true })
    expect(malformed).toMatchObject({
      snapshot_available: true,
      groups: [{ source_id: '11', model_names: ['deepseek-v4-flash'] }],
    })
    expect(malformed.warnings).toContain('分组刷新失败，继续使用上一次成功快照。')
    db.close()
  })

  it('invalidates a snapshot when the configured sub2api source changes', async () => {
    const db = createDatabase()
    const sourceConfig = {
      sub2apiApiBase: 'https://source-a.example/api/v1',
      sub2apiAdminApiKey: 'admin-key-a',
      pricingPlatforms: ['openai'],
      providerDisplayOrder: ['openai'],
      pricingCacheTtlMs: 60_000,
      pricingFetchTimeoutMs: 5_000,
      usdToCny: 7,
    }
    vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo) => {
      const pathname = new URL(String(input)).pathname
      const data = pathname.endsWith('/admin/groups/all')
        ? [{ id: 11, name: 'DeepSeek Flash', platform: 'openai', models_list_config: { enabled: true, models: ['deepseek-v4-flash'] } }]
        : pathname.endsWith('/admin/channels/pricing/sync-models')
          ? { models: ['deepseek-v4-flash'] }
          : pathname.endsWith('/admin/channels/model-pricing')
            ? { found: true }
            : []
      return new Response(JSON.stringify({ code: 0, data }), { status: 200 })
    }))
    await createPricingService({ db, config: sourceConfig, logger: null }).listSource({ refresh: true })

    const changed = await createPricingService({
      db,
      config: {
        ...sourceConfig,
        sub2apiApiBase: 'https://source-b.example/api/v1',
        sub2apiAdminApiKey: 'admin-key-b',
      },
      logger: null,
    }).listSource()

    expect(changed.snapshot_available).toBe(false)
    expect(changed.groups).toEqual([])
    expect(changed.warnings).toContain('来源配置已变化，请在后台重新刷新来源。')
    db.close()
  })

  it('combines upstream rate and recharge references into the effective rate', async () => {
    const db = createDatabase()
    db.prepare('UPDATE pricing_model_settings SET is_visible = 0').run()

    const fetchMock = vi.fn(async (input: URL | RequestInfo) => {
      const requestUrl = new URL(String(input))
      let data: any
      if (requestUrl.pathname.endsWith('/admin/groups/all')) {
        data = [{
          id: 42,
          name: 'OpenAI Standard',
          platform: 'openai',
          rate_multiplier: 0.6,
          is_exclusive: false,
          sort_order: 10,
        }]
      } else if (requestUrl.pathname.endsWith('/admin/payment/plans')) {
        data = []
      } else if (requestUrl.pathname.endsWith('/admin/channels/pricing/sync-models')) {
        data = { models: ['test-model'] }
      } else if (requestUrl.pathname.endsWith('/admin/accounts')) {
        data = {
          items: [{ group_ids: [42], schedulable: true, credentials: {} }],
          total: 1,
          page: 1,
          page_size: 1000,
          pages: 1,
        }
      } else if (requestUrl.pathname.endsWith('/admin/channels/model-pricing')) {
        data = {
          found: true,
          input_price: 0.000001,
          output_price: 0.000002,
        }
      } else {
        return new Response('not found', { status: 404 })
      }
      return new Response(JSON.stringify({ code: 0, data }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const service = createPricingService({
      db,
      config: {
        sub2apiApiBase: 'https://upstream.example/api/v1',
        sub2apiAdminApiKey: 'admin-key',
        pricingPlatforms: ['openai'],
        providerDisplayOrder: ['openai'],
        pricingCacheTtlMs: 60_000,
        pricingFetchTimeoutMs: 5_000,
        usdToCny: 7,
      },
      logger: null,
    })
    service.upsertModelSetting({
      provider: 'openai',
      model_name: 'test-model',
      display_name: 'Test Model',
      is_visible: true,
      is_featured: true,
      sort_order: 1,
    })
    service.upsertGroupSetting({
      provider: 'openai',
      source_id: '42',
      source_name: 'OpenAI Standard',
      is_visible: true,
      recharge_pay_cny: 20,
      recharge_credit_usd: 100,
      sort_order: 1,
    })

    const reference = await service.getReference({ refresh: true })
    expect(reference.source.status).toBe('live')
    expect(reference.groups).toHaveLength(1)
    expect(reference.groups[0]).toMatchObject({
      rate_multiplier: 0.6,
      recharge_multiplier: 5,
      effective_rate: 0.12,
      recharge_reference_source: 'manual',
    })
    expect(reference.models).toHaveLength(1)
    expect(reference.models[0]).toMatchObject({
      model_name: 'test-model',
      group_ids: ['42'],
      pricing_found: true,
      prices: {
        input_usd_per_million: 1,
        output_usd_per_million: 2,
      },
    })
    expect(fetchMock).toHaveBeenCalled()
    db.close()
  })

  it('includes public model names configured on OpenAI-compatible accounts', async () => {
    const db = createDatabase()
    const requestedAccountPages: number[] = []

    const fetchMock = vi.fn(async (input: URL | RequestInfo) => {
      const requestUrl = new URL(String(input))
      let data: any
      if (requestUrl.pathname.endsWith('/admin/groups/all')) {
        data = []
      } else if (requestUrl.pathname.endsWith('/admin/payment/plans')) {
        data = []
      } else if (requestUrl.pathname.endsWith('/admin/channels/pricing/sync-models')) {
        data = { models: ['gpt-5.6-sol', 'shared-model'] }
      } else if (requestUrl.pathname.endsWith('/admin/accounts')) {
        expect(requestUrl.searchParams.get('platform')).toBe('openai')
        expect(requestUrl.searchParams.get('page_size')).toBe('1000')
        const page = Number(requestUrl.searchParams.get('page'))
        requestedAccountPages.push(page)
        data = page === 1
          ? {
              items: [{
                group_ids: [42],
                schedulable: true,
                credentials: {
                  model_mapping: {
                    'deepseek-v4-flash': 'deepseek-v4-flash',
                    'public-alias': 'private-upstream-model',
                    'shared-model': 'shared-model',
                    'wildcard-*': 'wildcard-target',
                  },
                },
              }],
              total: 2,
              page: 1,
              page_size: 1,
              pages: 2,
            }
          : {
              items: [{
                account_groups: [{ group_id: 43 }],
                schedulable: true,
                credentials: { model_mapping: { 'second-page-model': 'upstream-model' } },
              }],
              total: 2,
              page: 2,
              page_size: 1,
              pages: 2,
            }
      } else {
        return new Response('not found', { status: 404 })
      }
      return new Response(JSON.stringify({ code: 0, data }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const service = createPricingService({
      db,
      config: {
        sub2apiApiBase: 'https://upstream.example/api/v1',
        sub2apiAdminApiKey: 'admin-key',
        pricingPlatforms: ['openai'],
        providerDisplayOrder: ['openai'],
        pricingCacheTtlMs: 60_000,
        pricingFetchTimeoutMs: 5_000,
        usdToCny: 7,
      },
      logger: null,
    })

    const source = await service.listSource({ refresh: true })
    expect(source.models_by_provider.openai).toEqual([
      'deepseek-v4-flash',
      'gpt-5.6-sol',
      'public-alias',
      'second-page-model',
      'shared-model',
    ])
    expect(source.model_group_ids_by_provider.openai).toEqual({
      'deepseek-v4-flash': ['42'],
      'gpt-5.6-sol': [],
      'public-alias': ['42'],
      'second-page-model': ['43'],
      'shared-model': ['42'],
    })
    expect(source.model_group_scope_by_provider.openai).toBe(true)
    expect(requestedAccountPages).toEqual([1, 2])
    db.close()
  })

  it('keeps pricing catalog models when the account model source is unavailable', async () => {
    const db = createDatabase()

    vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo) => {
      const requestUrl = new URL(String(input))
      if (requestUrl.pathname.endsWith('/admin/accounts')) {
        return new Response(JSON.stringify({ code: 503, message: 'accounts unavailable' }), { status: 503 })
      }
      const data = requestUrl.pathname.endsWith('/admin/channels/pricing/sync-models')
        ? { models: ['catalog-model'] }
        : []
      return new Response(JSON.stringify({ code: 0, data }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }))

    const service = createPricingService({
      db,
      config: {
        sub2apiApiBase: 'https://upstream.example/api/v1',
        sub2apiAdminApiKey: 'admin-key',
        pricingPlatforms: ['openai'],
        providerDisplayOrder: ['openai'],
        pricingCacheTtlMs: 60_000,
        pricingFetchTimeoutMs: 5_000,
        usdToCny: 7,
      },
      logger: null,
    })

    const source = await service.listSource({ refresh: true })
    expect(source.models_by_provider.openai).toEqual(['catalog-model'])
    expect(source.model_group_scope_by_provider.openai).toBe(false)
    expect(source.warnings).toContain('failed to fetch account model list for openai.')
    db.close()
  })

  it('scopes each model to groups with supporting accounts and follows renamed upstream groups', async () => {
    const db = createDatabase()
    db.prepare('UPDATE pricing_model_settings SET is_visible = 0').run()
    const repo = createPricingRepository(db)
    repo.upsertGroupSetting({
      provider: 'openai',
      source_id: '10',
      source_name: 'DeepSeek Official 10% (old)',
      display_name: 'DeepSeek Official 10% (old)',
      is_visible: true,
    })
    repo.upsertGroupSetting({
      provider: 'openai',
      source_id: '20',
      source_name: 'GPT Standard',
      display_name: 'Custom GPT Plan',
      is_visible: true,
    })

    vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo) => {
      const requestUrl = new URL(String(input))
      let data: any
      if (requestUrl.pathname.endsWith('/admin/groups/all')) {
        data = [
          { id: 10, name: 'DeepSeek Official 10%', platform: 'openai', rate_multiplier: 0.1 },
          { id: 20, name: 'GPT Standard Renamed', platform: 'openai', rate_multiplier: 1 },
        ]
      } else if (requestUrl.pathname.endsWith('/admin/payment/plans')) {
        data = []
      } else if (requestUrl.pathname.endsWith('/admin/channels/pricing/sync-models')) {
        data = { models: ['gpt-5.6-sol'] }
      } else if (requestUrl.pathname.endsWith('/admin/accounts')) {
        data = {
          items: [
            {
              group_ids: [10],
              schedulable: true,
              credentials: { model_mapping: { 'deepseek-v4-flash': 'deepseek-v4-flash' } },
            },
            {
              group_ids: [20],
              schedulable: true,
              credentials: { model_mapping: { 'gpt-*': 'gpt-upstream' } },
            },
          ],
          total: 2,
          page: 1,
          page_size: 1000,
          pages: 1,
        }
      } else if (requestUrl.pathname.endsWith('/admin/channels/model-pricing')) {
        data = { found: true, input_price: 0.000001, output_price: 0.000002 }
      } else {
        return new Response('not found', { status: 404 })
      }
      return new Response(JSON.stringify({ code: 0, data }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }))

    const service = createPricingService({
      db,
      config: {
        sub2apiApiBase: 'https://upstream.example/api/v1',
        sub2apiAdminApiKey: 'admin-key',
        pricingPlatforms: ['openai'],
        providerDisplayOrder: ['openai'],
        pricingCacheTtlMs: 60_000,
        pricingFetchTimeoutMs: 5_000,
        usdToCny: 7,
      },
      logger: null,
    })
    service.upsertModelSettings([
      { provider: 'openai', model_name: 'gpt-5.6-sol', is_visible: true },
      { provider: 'openai', model_name: 'deepseek-v4-flash', is_visible: true },
    ])

    const reference = await service.getReference({ refresh: true })
    expect(reference.groups).toEqual(expect.arrayContaining([
      expect.objectContaining({ source_id: '10', display_name: 'DeepSeek Official 10%', rate_multiplier: 0.1 }),
      expect.objectContaining({ source_id: '20', display_name: 'Custom GPT Plan' }),
    ]))
    expect(reference.models).toEqual(expect.arrayContaining([
      expect.objectContaining({ model_name: 'deepseek-v4-flash', group_ids: ['10'] }),
      expect.objectContaining({ model_name: 'gpt-5.6-sol', group_ids: ['20'] }),
    ]))
    db.close()
  })

  it('does not make a mixed group unrestricted when another account defines model mappings', async () => {
    const db = createDatabase()

    vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo) => {
      const requestUrl = new URL(String(input))
      let data: any
      if (requestUrl.pathname.endsWith('/admin/groups/all') || requestUrl.pathname.endsWith('/admin/payment/plans')) {
        data = []
      } else if (requestUrl.pathname.endsWith('/admin/channels/pricing/sync-models')) {
        data = { models: ['gpt-5.6-sol'] }
      } else if (requestUrl.pathname.endsWith('/admin/accounts')) {
        data = {
          items: [
            { group_ids: [10], schedulable: true, credentials: {} },
            {
              group_ids: [10],
              schedulable: true,
              credentials: { model_mapping: { 'deepseek-v4-flash': 'deepseek-v4-flash' } },
            },
          ],
          total: 2,
          page: 1,
          page_size: 1000,
          pages: 1,
        }
      } else {
        return new Response('not found', { status: 404 })
      }
      return new Response(JSON.stringify({ code: 0, data }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }))

    const service = createPricingService({
      db,
      config: {
        sub2apiApiBase: 'https://upstream.example/api/v1',
        sub2apiAdminApiKey: 'admin-key',
        pricingPlatforms: ['openai'],
        providerDisplayOrder: ['openai'],
        pricingCacheTtlMs: 60_000,
        pricingFetchTimeoutMs: 5_000,
        usdToCny: 7,
      },
      logger: null,
    })

    const source = await service.listSource({ refresh: true })
    expect(source.model_group_ids_by_provider.openai).toMatchObject({
      'deepseek-v4-flash': ['10'],
      'gpt-5.6-sol': [],
    })
    db.close()
  })
})
