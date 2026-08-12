import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { openDatabase } from '../server/db/index.js'
import { createInstallerRepository, renderInstallerScript } from '../server/domain/installers/repository'

const directories: string[] = []

function database() {
  const directory = mkdtempSync(join(tmpdir(), 'kkflow-installer-'))
  directories.push(directory)
  return openDatabase(join(directory, 'guide.sqlite'))
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('installer configuration', () => {
  it('keeps Windows installer templates and rendered scripts UTF-8 BOM encoded', () => {
    const templatePaths = [
      join(process.cwd(), 'scripts', 'codex-cli', 'setup.ps1'),
      join(process.cwd(), 'scripts', 'claude-cli', 'setup.ps1'),
    ]
    for (const templatePath of templatePaths) {
      expect(readFileSync(templatePath).subarray(0, 3)).toEqual(Buffer.from([0xEF, 0xBB, 0xBF]))
    }

    const db = database()
    try {
      const repository = createInstallerRepository(db)
      expect(Buffer.from(repository.publicScript('codex', 'windows')!.content, 'utf8').subarray(0, 3)).toEqual(Buffer.from([0xEF, 0xBB, 0xBF]))
      expect(Buffer.from(repository.publicScript('claude', 'windows')!.content, 'utf8').subarray(0, 3)).toEqual(Buffer.from([0xEF, 0xBB, 0xBF]))
      expect(repository.publicScript('codex', 'linux')?.content.startsWith('\uFEFF')).toBe(false)
    } finally {
      db.close()
    }
  })

  it('keeps independent macOS and Linux script records for both tools', () => {
    const db = database()
    try {
      const scripts = createInstallerRepository(db).list()
      expect(scripts.map(item => item.id)).toEqual([
        'codex-windows',
        'codex-macos',
        'codex-linux',
        'claude-windows',
        'claude-macos',
        'claude-linux',
      ])
      expect(scripts.find(item => item.id === 'codex-macos')?.filename).toBe('setup.sh')
      expect(scripts.find(item => item.id === 'codex-linux')?.filename).toBe('setup.sh')
      expect(scripts.find(item => item.id === 'claude-macos')?.filename).not.toBe(scripts.find(item => item.id === 'claude-linux')?.filename)
    } finally {
      db.close()
    }
  })

  it('keeps the Codex provider fixed and renders the configured base URL', () => {
    const db = database()
    try {
      const repository = createInstallerRepository(db)
      repository.updateSettings({
        provider_id: 'custom_relay',
        base_url: 'https://relay.example.com/',
        codex_default_model: 'gpt-test',
        claude_default_model: 'claude-test',
        codex_enabled: false,
        claude_enabled: true,
      })
      expect(repository.settings()).toMatchObject({ codex_enabled: false, claude_enabled: true })
      const codex = repository.publicScript('codex', 'windows')
      const claude = repository.publicScript('claude', 'linux')
      expect(codex?.content).toContain('$ProviderId = "custom"')
      expect(codex?.content).toContain('$BaseUrl = "https://relay.example.com"')
      expect(codex?.content).toContain('[string]$Model = $env:CODEX_MODEL')
      expect(codex?.content).toContain('if ([string]::IsNullOrWhiteSpace($Model)) { $Model = "gpt-test" }')
      expect(codex?.content).toContain('requires_openai_auth = true')
      expect(codex?.content).toContain('$authData["OPENAI_API_KEY"] = $ApiKey')
      expect(codex?.content).not.toContain('http_headers = { Authorization')
      const codexShell = repository.publicScript('codex', 'linux')
      expect(codexShell?.content).toContain('auth.OPENAI_API_KEY = apiKey;')
      expect(codexShell?.content).not.toContain('http_headers = { Authorization')
      expect(claude?.content).toContain('BASE_URL="https://relay.example.com"')
      expect(claude?.content).toContain('MODEL="${ANTHROPIC_MODEL:-claude-test}"')
      expect(codexShell?.content).not.toContain('\r')
    } finally {
      db.close()
    }
  })

  it('saves drafts separately and publishes with history', () => {
    const db = database()
    try {
      const repository = createInstallerRepository(db)
      const initial = repository.get('codex-linux')
      const draftContent = `${initial?.content}\n# draft marker\n`
      const draft = repository.saveDraft('codex-linux', draftContent)
      expect(draft).toMatchObject({ source: 'draft', has_draft: true, has_override: false })
      expect(repository.publicScript('codex', 'linux')?.content).not.toContain('# draft marker')

      const published = repository.publish('codex-linux', draftContent)
      expect(published).toMatchObject({ source: 'published', has_draft: false, has_override: true })
      expect(repository.publicScript('codex', 'linux')?.content).toContain('# draft marker')

      repository.saveDraft('codex-linux', `${draftContent}# next\n`)
      const replacedDraft = repository.saveDraft('codex-linux', `${draftContent}# replacement\n`)
      expect(replacedDraft?.history.length).toBeGreaterThan(0)
    } finally {
      db.close()
    }
  })

  it('requires the tool-specific template markers', () => {
    expect(() => renderInstallerScript('{{BASE_URL}}', 'claude', {
      provider_id: 'relay',
      base_url: 'https://relay.example.com',
      codex_default_model: '',
      claude_default_model: '',
      codex_enabled: true,
      claude_enabled: true,
    })).not.toThrow()

    const db = database()
    try {
      expect(() => createInstallerRepository(db).saveDraft('codex-windows', 'invalid')).toThrow(/BASE_URL/)
    } finally {
      db.close()
    }
  })
})
