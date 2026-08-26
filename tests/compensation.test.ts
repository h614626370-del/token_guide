import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { openDatabase } from '../server/db/index.js'
import { createCompensationService } from '../server/domain/compensation/service.js'
import { expect, test } from 'vitest'

function createTestDatabase() {
  const file = path.join(os.tmpdir(), `guide-compensation-${randomUUID()}.sqlite`)
  const db = openDatabase(file)
  return {
    db,
    close() {
      db.close()
      for (const suffix of ['', '-shm', '-wal']) {
        try { fs.rmSync(`${file}${suffix}`, { force: true }) } catch {}
      }
    },
  }
}

function createClient() {
  const adjustments: Array<{ userId: number, input: Record<string, unknown> }> = []
  const usageCalls: boolean[] = []
  return {
    adjustments,
    usageCalls,
    async listUsageLogsAll() {
      usageCalls.push(true)
      return [
        { user_id: 1, created_at: '2026-08-23T04:00:00.000Z', user: { id: 1, email: 'one@example.com', role: 'user' } },
        { user_id: 1, created_at: '2026-08-23T05:00:00.000Z', user: { id: 1, email: 'one@example.com', role: 'user' } },
        { user_id: 2, created_at: '2026-08-23T10:59:59.000Z', user: { id: 2, email: 'two@example.com', role: 'user' } },
        { user_id: 3, created_at: '2026-08-23T11:00:00.000Z', user: { id: 3, email: 'three@example.com', role: 'user' } },
        { user_id: 4, created_at: '2026-08-23T03:59:59.000Z', user: { id: 4, email: 'four@example.com', role: 'user' } },
        { user_id: 5, created_at: '2026-08-23T04:30:00.000Z', user: { id: 5, email: 'admin@example.com', role: 'admin' } },
        { user_id: 6, created_at: '2026-08-23T04:30:00.000Z', user: { id: 6, email: 'deleted@example.com', role: 'user', deleted_at: '2026-08-22T00:00:00.000Z' } },
        { user_id: 7, created_at: '2026-08-23T04:30:00.000Z' },
        { user_id: 8, created_at: '2026-08-23T04:30:00.000Z' },
      ]
    },
    async getUser(userId: number) {
      if (userId === 2) return { id: 2, email: 'two@example.com', username: 'two', role: 'user' }
      if (userId === 5) return { id: 5, email: 'admin@example.com', username: 'root', role: 'admin' }
      if (userId === 6) return { id: 6, email: 'deleted@example.com', role: 'user', deleted_at: '2026-08-22T00:00:00.000Z' }
      if (userId === 7) return { id: 7, email: 'seven@example.com', role: 'user' }
      throw new Error('user lookup failed')
    },
    async listUsersAll({ search }: { search: string }) {
      const users = [
        { id: 2, email: 'two@example.com', username: 'two', role: 'user' },
        { id: 5, email: 'admin@example.com', username: 'root', role: 'admin' },
        { id: 6, email: 'deleted@example.com', username: 'deleted', role: 'user', deleted_at: '2026-08-22T00:00:00.000Z' },
      ]
      const query = search.toLowerCase()
      return users.filter(user => user.email.includes(query) || user.username.includes(query))
    },
    async adjustUserBalance(userId: number, input: Record<string, unknown>) {
      adjustments.push({ userId, input })
      return { id: userId, balance: 100, api_keys: [{ key: `secret-${userId}` }] }
    },
  }
}

test('previews an exact Beijing time window and deduplicates eligible users', async () => {
  const fixture = createTestDatabase()
  const client = createClient()
  try {
    const service = createCompensationService({
      db: fixture.db,
      config: { compensationMaxAmount: 1000 },
      sub2api: client,
      logger: { warn() {} },
    })

    const preview = await service.preview({
      date: '2026-08-23',
      start_time: '12:00',
      end_time: '19:00',
      timezone: 'Asia/Shanghai',
      operation: 'add',
      amount: 5,
    })

    expect(preview.source.records_in_window).toBe(7)
    expect(preview.summary.user_count).toBe(4)
    expect(preview.summary.total_amount).toBe(20)
    expect(preview.users.map(user => user.id)).toEqual([1, 2, 5, 7])
    expect(preview.source.excluded_users).toBe(1)
    expect(client.adjustments).toHaveLength(0)
  } finally {
    fixture.close()
  }
})

test('executes a confirmed preview into an auditable idempotent batch', async () => {
  const fixture = createTestDatabase()
  const client = createClient()
  try {
    const service = createCompensationService({
      db: fixture.db,
      config: { compensationMaxAmount: 1000 },
      sub2api: client,
      logger: { warn() {} },
    })
    const input = {
      date: '2026-08-23',
      start_time: '12:00',
      end_time: '19:00',
      timezone: 'Asia/Shanghai',
      operation: 'add',
      amount: 5,
    } as const
    const preview = await service.preview(input)
    const executionKey = randomUUID()
    const batch = await service.execute({
      ...input,
      notes: '故障补偿测试',
      preview_fingerprint: preview.fingerprint,
      execution_key: executionKey,
    })

    const replay = await service.execute({
      ...input,
      notes: '故障补偿测试',
      preview_fingerprint: preview.fingerprint,
      execution_key: executionKey,
    })

    expect(batch?.status).toBe('completed')
    expect(replay?.id).toBe(batch?.id)
    expect(batch?.mode).toBe('batch')
    expect(batch?.items).toHaveLength(4)
    expect(batch?.items.every(item => item.status === 'succeeded')).toBe(true)
    expect(client.adjustments.map(item => item.userId)).toEqual([1, 2, 5, 7])
    expect(client.adjustments.every(item => item.input.idempotencyKey)).toBe(true)
    expect(client.usageCalls).toHaveLength(2)
    expect(batch?.items?.every(item => !item.upstream_response_json?.includes('secret-'))).toBe(true)
    expect(batch?.items?.every(item => item.balance_after === 100)).toBe(true)

    const stored = await service.getBatch(batch!.id)
    expect(stored?.notes).toBe('故障补偿测试')
    expect(stored?.items.every(item => item.idempotency_key_hash.length === 64)).toBe(true)
    expect(stored).not.toHaveProperty('execution_key_hash')
    const raw = fixture.db.prepare('SELECT execution_key_hash FROM compensation_batches WHERE id = ?').get(batch!.id) as { execution_key_hash: string }
    expect(raw.execution_key_hash).toMatch(/^[a-f0-9]{64}$/)
    expect(raw.execution_key_hash).not.toContain(executionKey)
  } finally {
    fixture.close()
  }
})

test('executes a single-user test by administrator ID and records an auditable batch', async () => {
  const fixture = createTestDatabase()
  const client = createClient()
  try {
    const service = createCompensationService({
      db: fixture.db,
      config: { compensationMaxAmount: 1000 },
      sub2api: client,
      logger: { warn() {} },
    })

    const batch = await service.test({
      target_type: 'id',
      target: '5',
      operation: 'add',
      amount: 5,
      notes: '单用户测试',
    })

    expect(batch?.mode).toBe('single')
    expect(batch?.status).toBe('completed')
    expect(batch?.items).toHaveLength(1)
    expect(batch?.items[0]).toMatchObject({ user_id: 5, email: 'admin@example.com', balance_after: 100 })
    expect(client.adjustments.map(item => item.userId)).toEqual([5])
    expect(batch?.items[0].upstream_response_json).not.toContain('secret-5')
  } finally {
    fixture.close()
  }
})

test('resolves a single-user test by exact case-insensitive email', async () => {
  const fixture = createTestDatabase()
  const client = createClient()
  try {
    const service = createCompensationService({
      db: fixture.db,
      config: { compensationMaxAmount: 1000 },
      sub2api: client,
      logger: { warn() {} },
    })

    const batch = await service.test({
      target_type: 'account',
      target: ' TWO@EXAMPLE.COM ',
      operation: 'set',
      amount: 12.5,
      notes: '账号测试',
    })

    expect(batch?.items[0]).toMatchObject({ user_id: 2, email: 'two@example.com', balance_after: 100 })
    expect(client.adjustments[0]).toMatchObject({ userId: 2, input: { balance: 12.5, operation: 'set', notes: '账号测试' } })
  } finally {
    fixture.close()
  }
})

test('rejects an ambiguous exact account without adjusting any balance', async () => {
  const fixture = createTestDatabase()
  const client = createClient()
  client.listUsersAll = async () => [
    { id: 2, email: 'shared@example.com', username: 'two', role: 'user' },
    { id: 5, email: 'admin@example.com', username: 'shared@example.com', role: 'admin' },
  ]
  try {
    const service = createCompensationService({
      db: fixture.db,
      config: { compensationMaxAmount: 1000 },
      sub2api: client,
      logger: { warn() {} },
    })

    await expect(service.test({
      target_type: 'account',
      target: 'shared@example.com',
      operation: 'add',
      amount: 5,
      notes: '歧义账号测试',
    })).rejects.toMatchObject({ code: 'COMPENSATION_USER_AMBIGUOUS' })
    expect(client.adjustments).toHaveLength(0)
  } finally {
    fixture.close()
  }
})

test('rejects a deleted account without adjusting any balance', async () => {
  const fixture = createTestDatabase()
  const client = createClient()
  try {
    const service = createCompensationService({
      db: fixture.db,
      config: { compensationMaxAmount: 1000 },
      sub2api: client,
      logger: { warn() {} },
    })

    await expect(service.test({
      target_type: 'account',
      target: 'deleted@example.com',
      operation: 'add',
      amount: 5,
      notes: '删除账号测试',
    })).rejects.toMatchObject({ code: 'COMPENSATION_USER_DELETED' })
    expect(client.adjustments).toHaveLength(0)
  } finally {
    fixture.close()
  }
})
