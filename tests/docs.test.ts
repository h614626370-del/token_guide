import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../server/db/index.js'
import { createDocsRepository } from '../server/domain/docs/repository'

const temporaryDirectories: string[] = []

function createDatabasePath() {
  const directory = mkdtempSync(join(tmpdir(), 'kkflow-docs-db-'))
  temporaryDirectories.push(directory)
  return join(directory, 'guide.sqlite')
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('docs repository', () => {
  it('keeps drafts private until published and can delete database overrides', () => {
    const db = openDatabase(createDatabasePath())
    try {
      const repo = createDocsRepository(db)
      const draft = {
        title: '草稿标题',
        description: '草稿描述',
        body: '# 草稿正文',
      }

      const saved = repo.saveDraft('index', draft)
      expect(saved?.has_draft).toBe(true)
      expect(saved?.source).toBe('draft')
      expect(repo.getOverrideByPath('/')?.body).not.toBe(draft.body)

      const published = repo.publish('index', draft)
      expect(published?.has_draft).toBe(false)
      expect(published?.source).toBe('published')
      expect(repo.getOverrideByPath('/')?.body).toBe(draft.body)

      const next = {
        title: '第二版',
        description: '第二版描述',
        body: '# 第二版正文',
      }
      const secondPublish = repo.publish('index', next)
      const previousVersion = secondPublish?.history[0]
      expect(previousVersion?.body).toBe(draft.body)

      const rollback = repo.restoreVersion('index', previousVersion?.version_id || 0)
      expect(rollback?.source).toBe('draft')
      expect(rollback?.body).toBe(draft.body)
      expect(repo.getOverrideByPath('/')?.body).toBe(next.body)

      const restored = repo.deleteOverride('index')
      expect(restored?.source).toBe('default')
      expect(repo.getOverrideByPath('/')).toBeNull()
    } finally {
      db.close()
    }
  })

  it('supports uploaded documents with enablement and persistent ordering', () => {
    const db = openDatabase(createDatabasePath())
    try {
      const repo = createDocsRepository(db)
      const created = repo.createCustom({
        path: '/quick-start',
        label: '快速开始',
        content: { title: '快速开始', description: '说明', body: '# 内容' },
      })

      expect(created?.is_custom).toBe(true)
      expect(created?.enabled).toBe(false)
      expect(repo.getNavigation().some(item => item.id === created?.id)).toBe(false)

      const published = repo.publish(created!.id, {
        title: '快速开始',
        description: '说明',
        body: '# 已发布',
      })
      expect(published?.has_draft).toBe(false)
      expect(repo.getOverrideByPath('/quick-start')).toBeNull()

      repo.updateSettings(created!.id, { enabled: true })
      expect(repo.getOverrideByPath('/quick-start')?.body).toBe('# 已发布')
      expect(repo.getNavigation()[0]?.id).toBe('index')

      const reordered = repo.reorder([created!.id, 'index', 'integration', 'member'])
      expect(reordered[0]?.id).toBe(created!.id)

      repo.updateSettings(created!.id, { enabled: false })
      expect(repo.getNavigation().some(item => item.id === created!.id)).toBe(false)
    } finally {
      db.close()
    }
  })
})
