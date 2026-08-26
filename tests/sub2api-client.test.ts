import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSub2apiClient } from '../server/domain/pricing/sub2api-client.js'

const config = {
  sub2apiApiBase: 'https://upstream.example/api/v1',
  sub2apiAdminApiKey: 'admin-secret',
  pricingFetchTimeoutMs: 5_000,
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('sub2api compensation client calls', () => {
  it('loads all usage pages with the expected date and pagination filters', async () => {
    const calls: Array<{ url: URL, init: RequestInit }> = []
    vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      const url = new URL(String(input))
      calls.push({ url, init: init || {} })
      const page = Number(url.searchParams.get('page'))
      const data = page === 1
        ? { items: [{ user_id: 1, created_at: '2026-08-23T04:00:00.000Z' }], total: 2, page: 1, page_size: 1000, pages: 2 }
        : { items: [{ user_id: 2, created_at: '2026-08-23T05:00:00.000Z' }], total: 2, page: 2, page_size: 1000, pages: 2 }
      return new Response(JSON.stringify({ code: 0, data }), { status: 200 })
    }))

    const client = createSub2apiClient(config, null)
    const result = await client.listUsageLogsAll({
      startDate: '2026-08-23',
      endDate: '2026-08-23',
      timezone: 'Asia/Shanghai',
      maxPages: 2,
    })

    expect(result.map(item => item.user_id)).toEqual([1, 2])
    expect(calls).toHaveLength(2)
    expect(calls[0].url.pathname).toBe('/api/v1/admin/usage')
    expect(calls[0].url.searchParams.get('start_date')).toBe('2026-08-23')
    expect(calls[0].url.searchParams.get('end_date')).toBe('2026-08-23')
    expect(calls[0].url.searchParams.get('timezone')).toBe('Asia/Shanghai')
    expect(calls[0].url.searchParams.get('exact_total')).toBe('true')
    expect(calls[0].init.headers).toMatchObject({
      accept: 'application/json',
      'x-api-key': 'admin-secret',
    })
  })

  it('posts balance adjustments with JSON and a stable idempotency key', async () => {
    let request: { url: URL, init: RequestInit } | null = null
    vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo, init?: RequestInit) => {
      request = { url: new URL(String(input)), init: init || {} }
      return new Response(JSON.stringify({ code: 0, data: { id: 42, balance: 105 } }), { status: 200 })
    }))

    const client = createSub2apiClient(config, null)
    const result = await client.adjustUserBalance(42, {
      balance: 5,
      operation: 'add',
      notes: '故障补偿',
      idempotencyKey: 'guide-compensation-batch-user-42',
    })

    expect(result).toEqual({ id: 42, balance: 105 })
    expect(request?.url.pathname).toBe('/api/v1/admin/users/42/balance')
    expect(request?.init.method).toBe('POST')
    expect(request?.init.headers).toMatchObject({
      'x-api-key': 'admin-secret',
      'Idempotency-Key': 'guide-compensation-batch-user-42',
      'content-type': 'application/json',
    })
    expect(JSON.parse(String(request?.init.body))).toEqual({ balance: 5, operation: 'add', notes: '故障补偿' })
  })

  it('searches every user page for exact account resolution', async () => {
    const calls: URL[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo) => {
      const url = new URL(String(input))
      calls.push(url)
      const page = Number(url.searchParams.get('page'))
      const data = page === 1
        ? { items: [{ id: 1, email: 'first@example.com' }], total: 2, page: 1, page_size: 100, pages: 2 }
        : { items: [{ id: 2, username: 'tester' }], total: 2, page: 2, page_size: 100, pages: 2 }
      return new Response(JSON.stringify({ code: 0, data }), { status: 200 })
    }))

    const client = createSub2apiClient(config, null)
    const users = await client.listUsersAll({ search: 'tester', maxPages: 2 })

    expect(users.map(user => user.id)).toEqual([1, 2])
    expect(calls).toHaveLength(2)
    expect(calls[0].pathname).toBe('/api/v1/admin/users')
    expect(calls[0].searchParams.get('search')).toBe('tester')
    expect(calls[0].searchParams.get('page_size')).toBe('100')
  })
})
