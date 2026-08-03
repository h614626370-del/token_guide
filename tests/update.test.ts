import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildRecreatePayload } from '../server/domain/update/docker'
import {
  checkForUpdate,
  getUpdateStatus,
  resetUpdateStateForTests,
  restartService,
} from '../server/domain/update/service'
import {
  compareVersions,
  isUpdateAvailable,
  normalizeVersion,
  toImageTag,
} from '../server/domain/update/version'

vi.mock('../server/utils/config', () => ({
  getGuideConfig: () => ({
    siteUrl: 'https://guide.example.com',
  }),
}))

vi.stubGlobal('useRuntimeConfig', () => ({
  appVersion: '2.0.0',
  updateImageRepository: '614626370/sub2api-guide',
  updateGithubRepo: 'h614626370-del/token_guide',
  updateContainerName: 'sub2api-guide',
  dockerSocketPath: '/tmp/missing-docker.sock',
}))

afterEach(() => {
  resetUpdateStateForTests()
  vi.restoreAllMocks()
  vi.stubGlobal('useRuntimeConfig', () => ({
    appVersion: '2.0.0',
    updateImageRepository: '614626370/sub2api-guide',
    updateGithubRepo: 'h614626370-del/token_guide',
    updateContainerName: 'sub2api-guide',
    dockerSocketPath: '/tmp/missing-docker.sock',
  }))
})

describe('update version helpers', () => {
  it('normalizes and compares semver tags', () => {
    expect(normalizeVersion('v2.1.0')).toBe('2.1.0')
    expect(toImageTag('2.1.0')).toBe('v2.1.0')
    expect(compareVersions('2.1.0', '2.0.9')).toBeGreaterThan(0)
    expect(compareVersions('v2.0.0', '2.0.0')).toBe(0)
    expect(isUpdateAvailable('2.0.0', 'v2.1.0')).toBe(true)
    expect(isUpdateAvailable('2.1.0', '2.0.9')).toBe(false)
  })
})

describe('update service', () => {
  it('reports docker unavailable when socket is missing', async () => {
    const status = await getUpdateStatus(undefined, {
      isAvailable: async () => false,
    } as any)

    expect(status.current_version).toBe('2.0.0')
    expect(status.docker_available).toBe(false)
    expect(status.can_apply).toBe(false)
    expect(status.can_restart).toBe(true)
  })

  it('checks github releases for a newer version', async () => {
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        tag_name: 'v2.2.0',
        published_at: '2026-08-01T00:00:00Z',
        html_url: 'https://github.com/example/releases/tag/v2.2.0',
      }),
    })) as unknown as typeof fetch

    const status = await checkForUpdate(undefined, fetcher)
    expect(status.latest_tag).toBe('v2.2.0')
    expect(status.update_available).toBe(true)
    expect(status.job.phase).toBe('success')
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('restarts via process exit when docker is unavailable', async () => {
    vi.useFakeTimers()
    const exitProcess = vi.fn()
    const status = await restartService(undefined, {
      docker: { isAvailable: async () => false } as any,
      exitProcess,
    })

    expect(status.job.phase).toBe('success')
    await vi.advanceTimersByTimeAsync(600)
    expect(exitProcess).toHaveBeenCalledWith(0)
    vi.useRealTimers()
  })
})

describe('docker recreate payload', () => {
  it('rewrites image and preserves environment', () => {
    const payload = buildRecreatePayload({
      Id: 'abc',
      Name: '/sub2api-guide',
      Config: {
        Image: '614626370/sub2api-guide:v2.0.0',
        Env: ['NODE_ENV=production', 'PORT=3000'],
        Cmd: ['node', '.output/server/index.mjs'],
        Labels: { 'com.example': '1' },
        WorkingDir: '/app',
        User: 'node',
      },
      HostConfig: {
        RestartPolicy: { Name: 'unless-stopped' },
        Binds: ['/www/data:/data'],
        NetworkMode: 'bridge',
      },
      NetworkSettings: {
        Networks: {
          bridge: { Aliases: null as any },
        },
      },
    }, '614626370/sub2api-guide:v2.2.0')

    expect(payload.name).toBe('sub2api-guide')
    expect(payload.body.Image).toBe('614626370/sub2api-guide:v2.2.0')
    expect(payload.body.Env).toContain('NODE_ENV=production')
    expect(payload.body.HostConfig).toMatchObject({
      RestartPolicy: { Name: 'unless-stopped' },
      Binds: ['/www/data:/data'],
    })
  })
})
