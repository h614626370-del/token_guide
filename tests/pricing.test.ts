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
      pricing_found: true,
      prices: {
        input_usd_per_million: 1,
        output_usd_per_million: 2,
      },
    })
    expect(fetchMock).toHaveBeenCalled()
    db.close()
  })
})
