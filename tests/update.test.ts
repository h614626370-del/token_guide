import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildRecreatePayload } from '../server/domain/update/docker'
import {
  applyUpdate,
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
  vi.unstubAllEnvs()
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
    expect(isUpdateAvailable('latest', 'v2.1.0')).toBe(true)
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

  it('resolves the real version from the current docker image when runtime says latest', async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({
      appVersion: 'latest',
      updateImageRepository: '614626370/sub2api-guide',
      updateGithubRepo: 'h614626370-del/token_guide',
      updateContainerName: 'sub2api-guide',
      dockerSocketPath: '/var/run/docker.sock',
    }))

    const status = await getUpdateStatus(undefined, {
      isAvailable: async () => true,
      inspectContainer: async () => ({
        Id: 'container-id',
        Image: 'sha256:image-id',
        Name: '/sub2api-guide',
        Config: {
          Image: '614626370/sub2api-guide:latest',
          Env: ['NUXT_APP_VERSION=latest'],
        },
        HostConfig: {},
      }),
      inspectImage: async () => ({
        Id: 'sha256:image-id',
        Config: {
          Env: ['NUXT_APP_VERSION=v2.0.0'],
        },
      }),
    } as any)

    expect(status.current_version).toBe('v2.0.0')
    expect(status.current_runtime_version).toBe('latest')
    expect(status.current_image).toBe('614626370/sub2api-guide:latest')
    expect(status.current_version_source).toBe('image')
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

  it('stops the old container before starting the replacement during updates', async () => {
    vi.stubEnv('HOSTNAME', 'old-container-id')
    const fetcher = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        tag_name: 'v2.0.4',
        published_at: '2026-08-03T00:00:00Z',
        html_url: 'https://github.com/example/releases/tag/v2.0.4',
      }),
    })) as unknown as typeof fetch
    const oldContainer = {
      Id: 'old-container-id',
      Image: 'sha256:old-image',
      Name: '/sub2api-guide-old-leftover',
      Config: {
        Image: '614626370/sub2api-guide:v2.0.0',
        Env: ['NUXT_APP_VERSION=v2.0.0', 'PORT=3000'],
      },
      HostConfig: {
        PortBindings: { '3000/tcp': [{ HostIp: '127.0.0.1', HostPort: '3000' }] },
        RestartPolicy: { Name: 'unless-stopped' },
      },
      NetworkSettings: { Networks: { bridge: { Aliases: null as any } } },
    }
    const staleContainer = {
      ...oldContainer,
      Id: 'stale-new-container-id',
      Image: 'sha256:new-image',
      Name: '/sub2api-guide',
    }
    const operations: string[] = []
    const docker = {
      isAvailable: async () => true,
      inspectContainer: async (idOrName: string) => {
        if (idOrName === 'old-container-id') return oldContainer
        if (idOrName === 'sub2api-guide') return staleContainer
        return oldContainer
      },
      inspectImage: async () => ({
        Id: 'sha256:old-image',
        Config: { Env: ['NUXT_APP_VERSION=v2.0.0'] },
      }),
      pullImage: async () => operations.push('pull'),
      removeContainer: async (idOrName: string) => operations.push(`remove:${idOrName}`),
      renameContainer: async (idOrName: string, newName: string) => operations.push(`rename:${idOrName}:${newName}`),
      createContainer: async (name: string) => {
        operations.push(`create:${name}`)
        return 'new-container-id'
      },
      stopContainer: async (idOrName: string) => operations.push(`stop:${idOrName}`),
      startContainer: async (idOrName: string) => operations.push(`start:${idOrName}`),
    }

    await checkForUpdate(undefined, fetcher)
    await applyUpdate(undefined, { docker: docker as any, fetcher })

    const status = await waitForUpdateJob(docker as any)
    expect(status.job.phase).toBe('success')
    expect(operations).toEqual(expect.arrayContaining([
      'remove:stale-new-container-id',
      'create:sub2api-guide',
      'stop:old-container-id',
      'start:new-container-id',
      'remove:old-container-id',
    ]))
    expect(operations.indexOf('stop:old-container-id')).toBeLessThan(operations.indexOf('start:new-container-id'))
  })
})

async function waitForUpdateJob(docker: any) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const status = await getUpdateStatus(undefined, docker)
    if (status.job.phase === 'success' || status.job.phase === 'error') return status
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  return await getUpdateStatus(undefined, docker)
}

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
