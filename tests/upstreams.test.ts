import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openDatabase } from '../server/db/index.js'
import { createUpstreamService } from '../server/domain/upstreams/service'
import { createUpstreamRepository } from '../server/domain/upstreams/repository'
import { upstreamSchema, normalizeUpstreamBase } from '../server/domain/upstreams/schema'
import { parseUpstreamUsage, fetchUpstreamUsage } from '../server/domain/upstreams/usage'

let directory: string
let db: ReturnType<typeof openDatabase>
const secret = 'sk-upstream-test-only'
const mainAccount = { id: 5, name: '主站三方账号', type: 'apikey', platform: 'openai', status: 'active', credentials: { base_url: 'https://upstream.example/v1', api_key: secret } }

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'guide-upstreams-'))
  db = openDatabase(join(directory, 'guide.sqlite'))
})
afterEach(() => {
  db.close()
  rmSync(directory, { recursive: true, force: true })
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function fixture() {
  const client = { configured: true, getAccount: vi.fn().mockResolvedValue(mainAccount), exportAccountCredentials: vi.fn(), listAccountsAll: vi.fn().mockResolvedValue([mainAccount, { ...mainAccount, id: 9, type: 'oauth' }]) }
  const sendAlert = vi.fn().mockResolvedValue({ status: 'sent' })
  const service = createUpstreamService({ db, getClient: () => client, sendAlert })
  const input = upstreamSchema.parse({ name: '测试上游', source: 'manual', base_url: 'https://upstream.example/v1', api_key: secret })
  return { service, input, client, sendAlert }
}

function mockBalances(...values: number[]) {
  const fetchMock = vi.fn()
  for (const value of values) fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ mode: 'unrestricted', balance: value, remaining: value, unit: 'USD' })))
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('upstream usage protocol', () => {
  it.each([
    [{ remaining: 12.5, unit: 'USD' }, 12.5],
    [{ balance: '0' }, 0],
    [{ quota: { remaining: 4, unit: 'USD' } }, 4],
    [{ code: 0, data: { remaining: 2 } }, 2],
    [{ ok: true, data: { remaining_balance: '3.2' } }, 3.2],
    [{ total_available: -2 }, -2],
  ])('parses supported usage responses %j', (payload, balance) => {
    expect(parseUpstreamUsage(payload)).toMatchObject({ balance, unlimited: false })
  })

  it.each([null, {}, { remaining: null }, { remaining: '' }, { remaining: false }, { remaining: 'NaN' }, { code: 401, data: { remaining: 10 } }, { isValid: false, remaining: 10 }, { ok: false, data: { remaining: 10 } }])('rejects missing or invalid balances %j', payload => {
    expect(() => parseUpstreamUsage(payload)).toThrow()
  })

  it('distinguishes unlimited subscription quota from a negative wallet balance', () => {
    expect(parseUpstreamUsage({ remaining: -1, subscription: {} })).toMatchObject({ balance: null, unlimited: true })
    expect(parseUpstreamUsage({ remaining: -1, planName: '钱包余额', mode: 'unrestricted' })).toMatchObject({ balance: -1, unlimited: false })
  })

  it.each(['https://upstream.example', 'https://upstream.example/v1/', 'https://upstream.example/v1/usage'])('normalizes addresses %s', value => {
    expect(normalizeUpstreamBase(value)).toBe('https://upstream.example')
  })

  it.each(['file:///tmp/test', 'https://user:pass@upstream.example', 'https://upstream.example?token=x', 'https://upstream.example/#x'])('rejects unsafe address shapes %s', value => {
    expect(() => normalizeUpstreamBase(value)).toThrow()
  })

  it('uses server-side Bearer authentication and refuses redirects', async () => {
    const request = mockBalances(14)
    expect(await fetchUpstreamUsage('https://upstream.example/v1', secret)).toMatchObject({ balance: 14 })
    expect(request).toHaveBeenCalledWith('https://upstream.example/v1/usage', expect.objectContaining({ redirect: 'error', headers: { authorization: `Bearer ${secret}`, accept: 'application/json' } }))
  })

  it('does not expose the upstream error body or secret in query errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(`bad credential ${secret}`, { status: 401 })))
    await expect(fetchUpstreamUsage('https://upstream.example', secret)).rejects.toThrow('HTTP 401')
    try { await fetchUpstreamUsage('https://upstream.example', secret) } catch (error) { expect(String(error)).not.toContain(secret) }
  })
})

describe('upstream monitors', () => {
  it('persists monitors across service creation, masks keys and preserves a key on blank edits', async () => {
    const { service, input } = fixture()
    const saved = await service.save(input)
    expect(saved).not.toHaveProperty('api_key')
    expect(saved.api_key_configured).toBe(true)
    expect(saved.resolved_base_url).toBe('https://upstream.example')
    expect(JSON.stringify(await service.list())).not.toContain(secret)
    await service.save({ ...input, name: '更新', api_key: null }, saved.id)
    expect(createUpstreamRepository(db).get(saved.id)?.api_key).toBe(secret)
    expect((await fixture().service.list())[0]?.name).toBe('更新')
    expect(service.remove(saved.id)).toBe(true)
    expect(await service.list()).toHaveLength(0)
  })

  it('sends low and exhausted alerts once each, then re-arms after balance recovery', async () => {
    const { service, input, sendAlert } = fixture()
    const row = await service.save(input)
    mockBalances(40, 5, 4, 0, 0, 40, 5)
    for (let i = 0; i < 7; i++) await service.check(row.id)
    expect(sendAlert.mock.calls.map(([alert]) => alert.kind)).toEqual(['low', 'exhausted', 'low'])
    expect((await service.list())[0]).toMatchObject({ balance: 5, notification_status: 'sent', last_alert_kind: 'low' })
  })

  it('keeps alert deduplication after recreating the service', async () => {
    const { service, input, sendAlert } = fixture()
    const row = await service.save(input)
    mockBalances(5, 4)
    await service.check(row.id)
    const next = fixture()
    await next.service.check(row.id)
    expect(sendAlert).toHaveBeenCalledTimes(1)
    expect(next.sendAlert).not.toHaveBeenCalled()
  })

  it('coalesces simultaneous checks to avoid duplicate messages', async () => {
    const { service, input, sendAlert } = fixture()
    const row = await service.save(input)
    const request = mockBalances(0)
    await Promise.all([service.check(row.id), service.check(row.id)])
    expect(request).toHaveBeenCalledTimes(1)
    expect(sendAlert).toHaveBeenCalledTimes(1)
  })

  it.each(['disabled', 'failed', 'skipped'])('retries %s email deliveries on the next check', async status => {
    const { service, input, sendAlert } = fixture()
    const row = await service.save(input)
    sendAlert.mockResolvedValueOnce({ status })
    mockBalances(5, 5)
    await service.check(row.id)
    expect((await service.list())[0]?.notification_status).toBe(status)
    await service.check(row.id)
    expect(sendAlert).toHaveBeenCalledTimes(2)
    expect((await service.list())[0]?.notification_status).toBe('sent')
  })

  it('retains the last known balance on query failure and does not emit a false exhaustion alert', async () => {
    const { service, input, sendAlert } = fixture()
    const row = await service.save(input)
    const request = mockBalances(40)
    request.mockResolvedValueOnce(new Response('{}', { status: 500 }))
    await service.check(row.id)
    await service.check(row.id)
    expect((await service.list())[0]).toMatchObject({ balance: 40, last_check_status: 'error' })
    expect(sendAlert).not.toHaveBeenCalled()
  })

  it('only polls due enabled monitors and allows manual checks on a paused monitor without sending alerts', async () => {
    const { service, input, sendAlert } = fixture()
    const paused = await service.save({ ...input, enabled: false })
    await service.save(input)
    const request = mockBalances(40, 0)
    await service.checkDue()
    await service.checkDue()
    expect(request).toHaveBeenCalledTimes(1)
    await service.check(paused.id)
    expect(sendAlert).not.toHaveBeenCalled()
  })

  it('returns a sanitized main-site account list and uses the selected account credentials', async () => {
    const { service, input, client } = fixture()
    const accounts = await service.accounts('openai')
    expect(accounts).toHaveLength(1)
    expect(JSON.stringify(accounts)).not.toContain(secret)
    expect(accounts[0]?.base_url).toBe('https://upstream.example')
    const row = await service.save({ ...input, source: 'main_site', account_id: 5, base_url: '', api_key: null })
    expect(row).toMatchObject({ base_url: '', resolved_base_url: 'https://upstream.example' })
    expect((await service.list())[0]).toMatchObject({ base_url: '', resolved_base_url: 'https://upstream.example' })
    mockBalances(50)
    expect(await service.check(row.id)).toMatchObject({ balance: 50, resolved_base_url: 'https://upstream.example' })
    expect(client.getAccount).toHaveBeenCalledWith(5)
  })

  it('resolves existing main-site monitors without exporting credentials and follows address changes', async () => {
    const { service, input, client } = fixture()
    const row = createUpstreamRepository(db).save({ ...input, source: 'main_site', account_id: 5, base_url: '', api_key: null })
    client.getAccount.mockResolvedValue({ ...mainAccount, credentials: { base_url: 'https://current.example/v1' } })
    const items = await service.list()
    expect(items[0]).toMatchObject({ id: row.id, base_url: '', resolved_base_url: 'https://current.example' })
    expect(client.exportAccountCredentials).not.toHaveBeenCalled()
    expect(JSON.stringify(items)).not.toContain(secret)
    expect(items[0]).not.toHaveProperty('credentials')
    client.getAccount.mockResolvedValue({ ...mainAccount, credentials: { base_url: 'https://changed.example' } })
    expect((await service.list())[0]?.resolved_base_url).toBe('https://changed.example')
    expect(createUpstreamRepository(db).get(row.id)?.base_url).toBe('')
  })

  it('prefers a configured address override without querying main-site accounts when listing', async () => {
    const { service, input, client } = fixture()
    const row = await service.save({ ...input, source: 'main_site', account_id: 5, base_url: 'https://override.example/v1' })
    expect(row.resolved_base_url).toBe('https://override.example')
    client.getAccount.mockClear()
    client.getAccount.mockRejectedValue(new Error('unavailable'))
    expect((await service.list())[0]?.resolved_base_url).toBe('https://override.example')
    expect(client.getAccount).not.toHaveBeenCalled()
  })

  it('keeps the list available when a main-site account cannot be read', async () => {
    const { service, input, client } = fixture()
    await service.save(input)
    const row = await service.save({ ...input, source: 'main_site', account_id: 5, base_url: '' })
    client.getAccount.mockRejectedValue(new Error('unavailable'))
    const items = await service.list()
    expect(items).toHaveLength(2)
    expect(items.find(item => item.id === row.id)?.resolved_base_url).toBe('')
    expect(items.find(item => item.source === 'manual')?.resolved_base_url).toBe('https://upstream.example')
  })

  it.each(['javascript:alert(1)', 'https://user:pass@upstream.example', 'https://upstream.example?token=private'])('does not expose an unsafe main-site address %s', async baseUrl => {
    const { service, input, client } = fixture()
    client.getAccount.mockResolvedValue({ ...mainAccount, credentials: { base_url: baseUrl } })
    const row = await service.save({ ...input, source: 'main_site', account_id: 5, base_url: '' })
    expect(row.resolved_base_url).toBe('')
    expect((await service.list())[0]?.resolved_base_url).toBe('')
    expect(client.exportAccountCredentials).not.toHaveBeenCalled()
  })

  it('reads only the selected account through the existing export endpoint when credentials are redacted', async () => {
    const { service, input, client } = fixture()
    client.getAccount.mockResolvedValue({ ...mainAccount, credentials: { base_url: 'https://upstream.example' } })
    client.exportAccountCredentials.mockResolvedValue({ accounts: [mainAccount] })
    const row = await service.save({ ...input, source: 'main_site', account_id: 5, base_url: '', api_key: null })
    mockBalances(50)
    expect(await service.check(row.id)).toMatchObject({ balance: 50 })
    expect(client.exportAccountCredentials).toHaveBeenCalledWith(5)
  })

  it('supports a manually supplied key when the main-site export is restricted', async () => {
    const { service, input, client } = fixture()
    client.getAccount.mockResolvedValue({ ...mainAccount, credentials: { base_url: 'https://upstream.example' } })
    client.exportAccountCredentials.mockRejectedValue(new Error('403'))
    const row = await service.save({ ...input, source: 'main_site', account_id: 5, base_url: '', api_key: null })
    expect(await service.check(row.id)).toMatchObject({ last_check_status: 'error', last_error: expect.stringContaining('补充 API Key'), resolved_base_url: 'https://upstream.example' })
    await service.save({ ...input, source: 'main_site', account_id: 5, api_key: secret }, row.id)
    mockBalances(50)
    expect(await service.check(row.id)).toMatchObject({ balance: 50 })
  })

  it('rejects non-third-party accounts and missing manual credentials', async () => {
    const { service, input, client } = fixture()
    client.getAccount.mockResolvedValue({ ...mainAccount, type: 'oauth' })
    await expect(service.save({ ...input, source: 'main_site', account_id: 9 })).rejects.toThrow('三方 API')
    await expect(service.save({ ...input, api_key: '' })).rejects.toThrow('API Key')
  })

  it('does not apply a stale check after the monitor was edited', async () => {
    const { service, input, sendAlert } = fixture()
    const row = await service.save(input)
    let resolve!: (response: Response) => void
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(done => { resolve = done })))
    const pending = service.check(row.id)
    await service.save({ ...input, base_url: 'https://new.example' }, row.id)
    resolve(new Response(JSON.stringify({ remaining: 0 })))
    expect(await pending).toMatchObject({ resolved_base_url: 'https://new.example' })
    expect((await service.list())[0]).toMatchObject({ base_url: 'https://new.example', balance: null, last_check_status: 'pending' })
    expect(sendAlert).not.toHaveBeenCalled()
  })
})
