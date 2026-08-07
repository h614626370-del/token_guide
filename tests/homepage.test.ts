import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { stageHomepageArchive, stageHomepageFiles, stageHomepageMerge } from '../server/domain/homepage/service'
import { closeGuideDatabase } from '../server/utils/database'

let temporaryDirectory = ''

beforeEach(() => {
  temporaryDirectory = mkdtempSync(join(tmpdir(), 'kkflow-homepage-'))
  ;(globalThis as typeof globalThis & { useRuntimeConfig: () => Record<string, unknown> }).useRuntimeConfig = () => ({
    databasePath: join(temporaryDirectory, 'guide.sqlite'),
  })
})

afterEach(() => {
  closeGuideDatabase()
  delete (globalThis as typeof globalThis & { useRuntimeConfig?: () => Record<string, unknown> }).useRuntimeConfig
  rmSync(temporaryDirectory, { recursive: true, force: true })
})

describe('homepage uploads', () => {
  it('merges multiple uploaded files while preserving untouched assets', async () => {
    await stageHomepageFiles([
      { path: 'index.html', data: Buffer.from('<h1>old</h1>') },
      { path: 'css/app.css', data: Buffer.from('body { color: black; }') },
      { path: 'images/logo.svg', data: Buffer.from('<svg></svg>') },
    ])

    const result = await stageHomepageMerge([
      { path: 'index.html', data: Buffer.from('<h1>new</h1>') },
      { path: 'css/app.css', data: Buffer.from('body { color: green; }') },
      { path: 'js/app.js', data: Buffer.from('console.log("ready")') },
    ])

    expect(result).toMatchObject({
      mode: 'merge',
      file_count: 4,
      preserved_count: 1,
      replaced_count: 2,
      added_count: 1,
    })
    const draft = join(temporaryDirectory, 'homepages', 'draft')
    expect(readFileSync(join(draft, 'index.html'), 'utf8')).toContain('new')
    expect(readFileSync(join(draft, 'images', 'logo.svg'), 'utf8')).toContain('svg')
  })

  it('extracts a zip bundle and removes its outer directory', async () => {
    const archive = zipSync({
      'homepage/index.html': strToU8('<h1>zip</h1>'),
      'homepage/assets/app.css': strToU8('body {}'),
      'homepage/__MACOSX/.DS_Store': strToU8('ignored'),
    })

    const result = await stageHomepageArchive(Buffer.from(archive))

    expect(result).toMatchObject({ mode: 'archive', file_count: 2, has_index: true })
    expect(result.files.map(file => file.path)).toEqual(['assets/app.css', 'index.html'])
  })

  it('rejects unsafe paths inside zip archives', async () => {
    const archive = zipSync({
      '../outside.txt': strToU8('unsafe'),
      'homepage/index.html': strToU8('<h1>zip</h1>'),
    })

    await expect(stageHomepageArchive(Buffer.from(archive))).rejects.toThrow('路径不安全')
  })
})
