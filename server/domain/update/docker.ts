import { access } from 'node:fs/promises'
import http from 'node:http'
import { constants as fsConstants } from 'node:fs'

export interface DockerContainerSummary {
  id: string
  name: string
  image: string
}

export interface DockerContainerInspect {
  Id: string
  Image?: string
  Name: string
  Config: {
    Image?: string
    Env?: string[]
    Cmd?: string[]
    Entrypoint?: string[] | string | null
    Labels?: Record<string, string>
    WorkingDir?: string
    User?: string
    ExposedPorts?: Record<string, unknown>
    Healthcheck?: Record<string, unknown>
  }
  HostConfig: Record<string, unknown>
  State?: {
    Status?: string
    Running?: boolean
    ExitCode?: number
    Error?: string
    Health?: {
      Status?: string
    }
  }
  NetworkSettings?: {
    Networks?: Record<string, {
      IPAMConfig?: unknown
      Links?: unknown
      Aliases?: string[]
      NetworkID?: string
      EndpointID?: string
      Gateway?: string
      IPAddress?: string
      IPPrefixLen?: number
      IPv6Gateway?: string
      GlobalIPv6Address?: string
      GlobalIPv6PrefixLen?: number
      MacAddress?: string
      DriverOpts?: unknown
    }>
  }
}

export interface DockerImageInspect {
  Id: string
  RepoTags?: string[]
  RepoDigests?: string[]
  Config?: {
    Env?: string[]
    Labels?: Record<string, string>
  }
}

export function createDockerClient(socketPath: string) {
  async function request<T = unknown>(method: string, requestPath: string, body?: unknown, options?: {
    raw?: boolean
    timeoutMs?: number
  }): Promise<{ statusCode: number, body: T | string, headers: http.IncomingHttpHeaders }> {
    const payload = body === undefined ? undefined : JSON.stringify(body)
    return await new Promise((resolve, reject) => {
      const req = http.request({
        socketPath,
        path: requestPath,
        method,
        timeout: options?.timeoutMs ?? 120_000,
        headers: {
          Host: 'localhost',
          Accept: 'application/json',
          ...(payload
            ? {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(payload),
              }
            : {}),
        },
      }, (res) => {
        const chunks: Buffer[] = []
        res.on('data', chunk => chunks.push(Buffer.from(chunk)))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          if (options?.raw) {
            resolve({ statusCode: res.statusCode || 0, body: text, headers: res.headers })
            return
          }
          if (!text) {
            resolve({ statusCode: res.statusCode || 0, body: '' as T, headers: res.headers })
            return
          }
          try {
            resolve({
              statusCode: res.statusCode || 0,
              body: JSON.parse(text) as T,
              headers: res.headers,
            })
          } catch {
            resolve({ statusCode: res.statusCode || 0, body: text as T, headers: res.headers })
          }
        })
      })
      req.on('timeout', () => {
        req.destroy(new Error('Docker API request timed out.'))
      })
      req.on('error', reject)
      if (payload) req.write(payload)
      req.end()
    })
  }

  return {
    socketPath,

    async isAvailable() {
      try {
        await access(socketPath, fsConstants.R_OK | fsConstants.W_OK)
      } catch {
        return false
      }
      try {
        const response = await request('GET', '/version', undefined, { timeoutMs: 3000 })
        return response.statusCode >= 200 && response.statusCode < 300
      } catch {
        return false
      }
    },

    async ping() {
      const response = await request('GET', '/_ping', undefined, { timeoutMs: 3000, raw: true })
      return response.statusCode === 200
    },

    async listContainers(all = true) {
      const response = await request<Array<{
        Id: string
        Names?: string[]
        Image?: string
      }>>('GET', `/containers/json?all=${all ? '1' : '0'}`)
      if (response.statusCode >= 300) {
        throw new Error(formatDockerError('list containers', response.statusCode, response.body))
      }
      const items = Array.isArray(response.body) ? response.body : []
      return items.map((item): DockerContainerSummary => ({
        id: item.Id,
        name: String(item.Names?.[0] || '').replace(/^\//, ''),
        image: String(item.Image || ''),
      }))
    },

    async inspectContainer(idOrName: string) {
      const response = await request<DockerContainerInspect>(
        'GET',
        `/containers/${encodeURIComponent(idOrName)}/json`,
      )
      if (response.statusCode === 404) return null
      if (response.statusCode >= 300) {
        throw new Error(formatDockerError('inspect', response.statusCode, response.body))
      }
      return response.body as DockerContainerInspect
    },

    async inspectImage(idOrName: string) {
      const response = await request<DockerImageInspect>(
        'GET',
        `/images/${encodeURIComponent(idOrName)}/json`,
      )
      if (response.statusCode === 404) return null
      if (response.statusCode >= 300) {
        throw new Error(formatDockerError('image inspect', response.statusCode, response.body))
      }
      return response.body as DockerImageInspect
    },

    async pullImage(repository: string, tag: string, onProgress?: (line: string) => void) {
      const query = new URLSearchParams({
        fromImage: repository,
        tag,
      })
      const response = await request<string>(
        'POST',
        `/images/create?${query.toString()}`,
        undefined,
        { raw: true, timeoutMs: 600_000 },
      )
      if (response.statusCode >= 300) {
        throw new Error(formatDockerError('pull', response.statusCode, response.body))
      }

      const text = String(response.body || '')
      const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
      for (const line of lines) {
        onProgress?.(line)
        try {
          const parsed = JSON.parse(line) as { error?: string }
          if (parsed.error) throw new Error(parsed.error)
        } catch (error) {
          if (error instanceof SyntaxError) continue
          throw error
        }
      }
    },

    async renameContainer(idOrName: string, newName: string) {
      const response = await request(
        'POST',
        `/containers/${encodeURIComponent(idOrName)}/rename?name=${encodeURIComponent(newName)}`,
      )
      if (response.statusCode >= 300 && response.statusCode !== 204) {
        throw new Error(formatDockerError('rename', response.statusCode, response.body))
      }
    },

    async stopContainer(idOrName: string, timeoutSeconds = 20) {
      const response = await request(
        'POST',
        `/containers/${encodeURIComponent(idOrName)}/stop?t=${timeoutSeconds}`,
      )
      if (response.statusCode >= 300 && response.statusCode !== 304 && response.statusCode !== 204) {
        throw new Error(formatDockerError('stop', response.statusCode, response.body))
      }
    },

    async removeContainer(idOrName: string, force = true) {
      const response = await request(
        'DELETE',
        `/containers/${encodeURIComponent(idOrName)}?force=${force ? '1' : '0'}&v=0`,
      )
      if (response.statusCode >= 300 && response.statusCode !== 204 && response.statusCode !== 404) {
        throw new Error(formatDockerError('remove', response.statusCode, response.body))
      }
    },

    async createContainer(name: string, body: Record<string, unknown>) {
      const response = await request<{ Id?: string, message?: string }>(
        'POST',
        `/containers/create?name=${encodeURIComponent(name)}`,
        body,
      )
      if (response.statusCode >= 300) {
        throw new Error(formatDockerError('create', response.statusCode, response.body))
      }
      const id = typeof response.body === 'object' && response.body ? response.body.Id : ''
      if (!id) throw new Error('Docker create did not return a container id.')
      return id
    },

    async startContainer(idOrName: string) {
      const response = await request(
        'POST',
        `/containers/${encodeURIComponent(idOrName)}/start`,
      )
      if (response.statusCode >= 300 && response.statusCode !== 204 && response.statusCode !== 304) {
        throw new Error(formatDockerError('start', response.statusCode, response.body))
      }
    },

    async restartContainer(idOrName: string, timeoutSeconds = 10) {
      const response = await request(
        'POST',
        `/containers/${encodeURIComponent(idOrName)}/restart?t=${timeoutSeconds}`,
      )
      if (response.statusCode >= 300 && response.statusCode !== 204) {
        throw new Error(formatDockerError('restart', response.statusCode, response.body))
      }
    },
  }
}

export type DockerClient = ReturnType<typeof createDockerClient>

const UPDATE_HELPER_SCRIPT = String.raw`
const http = require('node:http')
const socketPath = process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock'
const oldId = process.env.OLD_CONTAINER_ID
const newId = process.env.NEW_CONTAINER_ID
const desiredName = process.env.DESIRED_CONTAINER_NAME

function request(method, path) {
  return new Promise((resolve, reject) => {
    const req = http.request({ socketPath, path, method, timeout: 30000 }, (res) => {
      const chunks = []
      res.on('data', chunk => chunks.push(Buffer.from(chunk)))
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8')
        if ((res.statusCode || 500) >= 300 && res.statusCode !== 304 && res.statusCode !== 404) {
          reject(new Error('Docker API ' + method + ' ' + path + ' failed (' + res.statusCode + '): ' + body.slice(0, 300)))
          return
        }
        resolve(body)
      })
    })
    req.on('timeout', () => req.destroy(new Error('Docker API request timed out')))
    req.on('error', reject)
    req.end()
  })
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function waitUntilReady() {
  for (let attempt = 0; attempt < 75; attempt += 1) {
    const body = await request('GET', '/containers/' + encodeURIComponent(newId) + '/json')
    const inspect = JSON.parse(body)
    const running = Boolean(inspect.State && inspect.State.Running)
    const health = inspect.State && inspect.State.Health && inspect.State.Health.Status
    if (!running) throw new Error('New container stopped before becoming ready')
    if (!health || health === 'healthy') return
    if (health === 'unhealthy') throw new Error('New container health check failed')
    await sleep(1000)
  }
  throw new Error('Timed out waiting for the new container health check')
}

async function rollback(error) {
  console.error(error && error.stack ? error.stack : error)
  try { await request('DELETE', '/containers/' + encodeURIComponent(newId) + '?force=1&v=0') } catch {}
  try { await request('POST', '/containers/' + encodeURIComponent(oldId) + '/rename?name=' + encodeURIComponent(desiredName)) } catch {}
  try { await request('POST', '/containers/' + encodeURIComponent(oldId) + '/start') } catch {}
  process.exitCode = 1
}

async function main() {
  await sleep(800)
  try {
    await request('POST', '/containers/' + encodeURIComponent(oldId) + '/stop?t=15')
    await request('POST', '/containers/' + encodeURIComponent(newId) + '/start')
    await waitUntilReady()
    await request('DELETE', '/containers/' + encodeURIComponent(oldId) + '?force=1&v=0')
  } catch (error) {
    await rollback(error)
  }
}

main().catch(rollback)
`

export function buildUpdateHelperPayload(input: {
  imageRef: string
  oldContainerId: string
  newContainerId: string
  desiredName: string
  dockerSocketPath: string
}) {
  return {
    Image: input.imageRef,
    User: '0',
    Env: [
      `DOCKER_SOCKET_PATH=${input.dockerSocketPath}`,
      `OLD_CONTAINER_ID=${input.oldContainerId}`,
      `NEW_CONTAINER_ID=${input.newContainerId}`,
      `DESIRED_CONTAINER_NAME=${input.desiredName}`,
    ],
    Cmd: ['node', '-e', UPDATE_HELPER_SCRIPT],
    HostConfig: {
      AutoRemove: true,
      NetworkMode: 'none',
      Binds: [`${input.dockerSocketPath}:${input.dockerSocketPath}`],
    },
  }
}

function formatDockerError(action: string, statusCode: number, body: unknown) {
  const detail = dockerErrorDetail(body)
  return `Docker ${action} failed (${statusCode})${detail ? `: ${detail}` : ''}.`
}

function dockerErrorDetail(body: unknown) {
  if (!body) return ''
  if (typeof body === 'object' && 'message' in body) {
    return String((body as { message?: unknown }).message || '').slice(0, 500)
  }
  return String(body).slice(0, 500)
}

export function buildRecreatePayload(inspect: DockerContainerInspect, imageRef: string) {
  const hostConfig = { ...(inspect.HostConfig || {}) } as Record<string, unknown>
  // Avoid conflicting with top-level NetworkingConfig.
  delete hostConfig.NetworkMode

  const networks = inspect.NetworkSettings?.Networks || {}
  const endpoints: Record<string, unknown> = {}
  for (const [name, network] of Object.entries(networks)) {
    endpoints[name] = {
      Aliases: network.Aliases || undefined,
      IPAMConfig: network.IPAMConfig || undefined,
      Links: network.Links || undefined,
      DriverOpts: network.DriverOpts || undefined,
    }
  }

  const name = inspect.Name.replace(/^\//, '')
  return {
    name,
    body: {
      Image: imageRef,
      Env: inspect.Config.Env || [],
      Cmd: inspect.Config.Cmd,
      Entrypoint: inspect.Config.Entrypoint,
      Labels: inspect.Config.Labels || {},
      WorkingDir: inspect.Config.WorkingDir || '',
      User: inspect.Config.User || '',
      ExposedPorts: inspect.Config.ExposedPorts,
      Healthcheck: inspect.Config.Healthcheck,
      HostConfig: {
        ...hostConfig,
        // Keep original network mode when there is a single custom network handled below.
        NetworkMode: Object.keys(networks).length === 1
          ? Object.keys(networks)[0]
          : inspect.HostConfig?.NetworkMode,
      },
      NetworkingConfig: Object.keys(endpoints).length
        ? { EndpointsConfig: endpoints }
        : undefined,
    },
  }
}

export async function resolveSelfContainer(client: DockerClient, preferredName: string) {
  const hostname = String(process.env.HOSTNAME || '').trim()
  if (hostname) {
    const byHostname = await client.inspectContainer(hostname)
    if (byHostname) return byHostname
  }

  const preferred = await client.inspectContainer(preferredName)
  if (preferred) return preferred

  const containers = await client.listContainers(true)
  const match = containers.find(item => item.name === preferredName || item.name.endsWith(preferredName))
  if (match) {
    const inspected = await client.inspectContainer(match.id)
    if (inspected) return inspected
  }

  return null
}
