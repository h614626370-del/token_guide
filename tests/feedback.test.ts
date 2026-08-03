import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openDatabase } from '../server/db/index.js'
import { createFeedbackRepository } from '../server/domain/feedback/repository.js'
import { nextChinaStartIso, todayChinaStartIso } from '../server/domain/feedback/quota-time.js'

const temporaryDirectories: string[] = []

function createRepository() {
  const directory = mkdtempSync(join(tmpdir(), 'kkflow-guide-feedback-'))
  temporaryDirectories.push(directory)
  const db = openDatabase(join(directory, 'guide.sqlite'))
  return { db, repo: createFeedbackRepository(db) }
}

afterEach(() => {
  vi.useRealTimers()
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('feedback quota time', () => {
  it('uses midnight in Asia/Shanghai as its daily boundary', () => {
    const now = new Date('2026-08-03T02:30:00.000Z')
    expect(todayChinaStartIso(now)).toBe('2026-08-02T16:00:00.000Z')
    expect(nextChinaStartIso(now)).toBe('2026-08-03T16:00:00.000Z')
  })

  it('handles the UTC date before the China day rollover', () => {
    const now = new Date('2026-08-02T15:59:59.999Z')
    expect(todayChinaStartIso(now)).toBe('2026-08-01T16:00:00.000Z')
    expect(nextChinaStartIso(now)).toBe('2026-08-02T16:00:00.000Z')
  })
})

describe('feedback repository', () => {
  it('creates, filters, paginates and updates feedback without exposing admin fields in user history', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-03T02:30:00.000Z'))
    const { db, repo } = createRepository()

    const first = repo.create({
      category: 'bug',
      title: 'Playground request failed',
      content: 'The text playground returned an unexpected response.',
      user_id: 'user-1',
      user_email: 'member@example.com',
      user_name: 'Member',
      contact: ' member@example.com ',
      metadata: { route: '/playground' },
    })
    repo.create({
      category: 'billing',
      title: 'Recharge question',
      content: 'Please explain the recharge conversion shown in pricing.',
      user_id: 'user-1',
    })
    repo.create({
      category: 'suggestion',
      title: 'Another member suggestion',
      content: 'This entry belongs to another account and must stay private.',
      user_id: 'user-2',
    })

    expect(first.public_id).toMatch(/^fb_[a-f0-9]{16}$/)
    expect(first.contact).toBe('member@example.com')
    expect(first.metadata).toEqual({ route: '/playground' })
    expect(repo.quotaForUser('user-1', todayChinaStartIso(), 5)).toEqual({
      limit: 5,
      used: 2,
      remaining: 3,
      resets_at: '2026-08-03T16:00:00.000Z',
    })

    const history = repo.listUser('user-1', { page: 1, page_size: 1 })
    expect(history).toMatchObject({ total: 2, page: 1, page_size: 1, pages: 2 })
    expect(history.items).toHaveLength(1)
    expect(history.items[0]).not.toHaveProperty('admin_note')
    expect(history.items[0]).not.toHaveProperty('user_email')

    const filtered = repo.list({ status: 'open', category: 'bug', q: 'unexpected', page: 1, page_size: 20 })
    expect(filtered.total).toBe(1)
    expect(filtered.items[0].public_id).toBe(first.public_id)

    vi.setSystemTime(new Date('2026-08-03T03:00:00.000Z'))
    const updated = repo.update(first.id, {
      status: 'closed',
      admin_reply: 'The upstream error handling has been corrected.',
      admin_note: 'Verified in production-like smoke test.',
    })
    expect(updated).toMatchObject({
      status: 'closed',
      admin_reply: 'The upstream error handling has been corrected.',
      admin_note: 'Verified in production-like smoke test.',
      replied_at: '2026-08-03T03:00:00.000Z',
      closed_at: '2026-08-03T03:00:00.000Z',
    })

    const publicUpdated = repo.listUser('user-1', { page: 1, page_size: 10 }).items
      .find((item: any) => item.id === first.public_id)
    expect(publicUpdated.admin_reply).toBe('The upstream error handling has been corrected.')
    expect(publicUpdated).not.toHaveProperty('admin_note')
    db.close()
  })
})
