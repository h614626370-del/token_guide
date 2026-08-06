import type { H3Event } from 'h3'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { getGuideConfig } from '../../utils/config'
import {
  buildRecreatePayload,
  buildUpdateHelperPayload,
  createDockerClient,
  resolveSelfContainer,
  type DockerClient,
} from './docker'
import {
  isUpdateAvailable,
  isSemverLike,
  normalizeVersion,
  toImageTag,
} from './version'

export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'pulling'
  | 'recreating'
  | 'restarting'
  | 'success'
  | 'error'

export interface UpdateStatus {
  current_version: string
  current_runtime_version: string
  current_image: string | null
  current_image_id: string | null
  current_version_source: 'image' | 'runtime' | 'image_tag' | 'unknown'
  latest_version: string | null
  latest_tag: string | null
  latest_published_at: string | null
  latest_url: string | null
  update_available: boolean
  checked_at: string | null
  image_repository: string
  github_repo: string
  container_name: string
  docker_socket: string
  docker_available: boolean
  can_apply: boolean
  can_restart: boolean
  apply_block_reason: string | null
  job: UpdateJobView
}

export interface UpdateJobView {
  phase: UpdatePhase
  message: string
  target_version: string | null
  started_at: string | null
  finished_at: string | null
  logs: string[]
  error: string | null
}

interface UpdateJobState extends UpdateJobView {
  running: boolean
}

interface UpdateStateStore {
  latest: LatestRelease | null
  checkedAt: string | null
  job: UpdateJobState
}

interface LatestRelease {
  version: string
  tag: string
  publishedAt: string | null
  url: string | null
}

interface CurrentInstallation {
  version: string
  runtimeVersion: string
  image: string | null
  imageId: string | null
  source: UpdateStatus['current_version_source']
}

declare global {
  // eslint-disable-next-line no-var
  var __sub2apiUpdateState: UpdateStateStore | undefined
}

let persistedJobNeedsReconcile = false

function createDefaultState(): UpdateStateStore {
  return {
    latest: null,
    checkedAt: null,
    job: {
      running: false,
      phase: 'idle',
      message: '尚未执行更新操作。',
      target_version: null,
      started_at: null,
      finished_at: null,
      logs: [],
      error: null,
    },
  }
}

function getState() {
  if (!globalThis.__sub2apiUpdateState) {
    const persisted = readPersistedState()
    globalThis.__sub2apiUpdateState = persisted || createDefaultState()
    persistedJobNeedsReconcile = Boolean(persisted?.job.running)
  }
  return globalThis.__sub2apiUpdateState
}

function updateStatePath() {
  const explicit = String(process.env.NUXT_UPDATE_STATE_PATH || '').trim()
  if (explicit) return resolve(explicit)
  if (process.env.NODE_ENV === 'test') return null
  const databasePath = String(process.env.NUXT_DATABASE_PATH || 'data/guide.sqlite').trim()
  return resolve(dirname(databasePath), 'update-state.json')
}

function readPersistedState(): UpdateStateStore | null {
  const file = updateStatePath()
  if (!file) return null
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<UpdateStateStore>
    if (!parsed.job || typeof parsed.job.phase !== 'string') return null
    return {
      latest: parsed.latest || null,
      checkedAt: parsed.checkedAt || null,
      job: {
        ...createDefaultState().job,
        ...parsed.job,
        logs: Array.isArray(parsed.job.logs) ? parsed.job.logs.slice(-80) : [],
      },
    }
  } catch {
    return null
  }
}

function persistState() {
  const file = updateStatePath()
  if (!file || !globalThis.__sub2apiUpdateState) return
  try {
    mkdirSync(dirname(file), { recursive: true })
    const temporary = `${file}.${process.pid}.tmp`
    writeFileSync(temporary, JSON.stringify(globalThis.__sub2apiUpdateState), 'utf8')
    renameSync(temporary, file)
  } catch {
    // Updating must still work when the optional progress file cannot be written.
  }
}

function jobView(job: UpdateJobState): UpdateJobView {
  return {
    phase: job.phase,
    message: job.message,
    target_version: job.target_version,
    started_at: job.started_at,
    finished_at: job.finished_at,
    logs: [...job.logs].slice(-40),
    error: job.error,
  }
}

function appendLog(message: string) {
  const state = getState()
  const stamp = new Date().toISOString().slice(11, 19)
  state.job.logs.push(`[${stamp}] ${message}`)
  if (state.job.logs.length > 80) {
    state.job.logs = state.job.logs.slice(-80)
  }
  persistState()
}

export function recordUpdateLog(message: string) {
  appendLog(message)
}

function beginJob(phase: UpdatePhase, message: string, targetVersion: string | null = null) {
  const state = getState()
  if (state.job.running) {
    throw new Error('已有更新任务正在执行。')
  }
  state.job = {
    running: true,
    phase,
    message,
    target_version: targetVersion,
    started_at: new Date().toISOString(),
    finished_at: null,
    logs: [],
    error: null,
  }
  appendLog(message)
}

function finishJob(phase: 'success' | 'error', message: string, error: string | null = null) {
  const state = getState()
  state.job.running = false
  state.job.phase = phase
  state.job.message = message
  state.job.error = error
  state.job.finished_at = new Date().toISOString()
  appendLog(message)
}

function setJobProgress(phase: UpdatePhase, message: string) {
  const state = getState()
  state.job.phase = phase
  state.job.message = message
  appendLog(message)
}

function reconcilePersistedJob(current: CurrentInstallation) {
  const state = getState()
  if (!persistedJobNeedsReconcile || !state.job.running) return
  persistedJobNeedsReconcile = false

  const target = state.job.target_version
  if (target && !isUpdateAvailable(current.version, target)) {
    finishJob('success', `已更新到 ${toImageTag(target)}，新容器运行正常。`)
    return
  }

  const message = target
    ? `更新到 ${toImageTag(target)} 的过程中服务已恢复，但当前仍是 ${toImageTag(current.version)}。旧版本已自动回滚。`
    : '更新过程中服务发生重启，任务未能完成。'
  finishJob('error', message, message)
}

export function getUpdateConfig(event?: H3Event) {
  const config = getGuideConfig(event)
  const runtime = useRuntimeConfig(event)
  return {
    currentVersion: String(runtime.appVersion || process.env.NUXT_APP_VERSION || 'dev'),
    imageRepository: String(runtime.updateImageRepository || '614626370/sub2api-guide'),
    githubRepo: String(runtime.updateGithubRepo || 'h614626370-del/token_guide'),
    containerName: String(runtime.updateContainerName || 'sub2api-guide'),
    dockerSocketPath: String(runtime.dockerSocketPath || '/var/run/docker.sock'),
    siteUrl: config.siteUrl,
  }
}

export async function getUpdateStatus(event?: H3Event, docker?: DockerClient | null): Promise<UpdateStatus> {
  const config = getUpdateConfig(event)
  const state = getState()
  const client = docker === undefined
    ? createDockerClient(config.dockerSocketPath)
    : docker
  const dockerAvailable = client ? await client.isAvailable() : false
  const current = await resolveCurrentInstallation(config, dockerAvailable ? client : null)
  reconcilePersistedJob(current)
  const latest = state.latest
  const updateAvailable = latest ? isUpdateAvailable(current.version, latest.version) : false
  const applyBlockReason = getApplyBlockReason({
    latest,
    dockerAvailable,
    updateAvailable,
    jobRunning: state.job.running,
  })

  return {
    current_version: current.version,
    current_runtime_version: current.runtimeVersion,
    current_image: current.image,
    current_image_id: current.imageId,
    current_version_source: current.source,
    latest_version: latest?.version || null,
    latest_tag: latest?.tag || null,
    latest_published_at: latest?.publishedAt || null,
    latest_url: latest?.url || null,
    update_available: updateAvailable,
    checked_at: state.checkedAt,
    image_repository: config.imageRepository,
    github_repo: config.githubRepo,
    container_name: config.containerName,
    docker_socket: config.dockerSocketPath,
    docker_available: dockerAvailable,
    can_apply: Boolean(latest && dockerAvailable && updateAvailable && !state.job.running),
    can_restart: !state.job.running,
    apply_block_reason: applyBlockReason,
    job: jobView(state.job),
  }
}

export async function checkForUpdate(event?: H3Event, fetcher: typeof fetch = fetch): Promise<UpdateStatus> {
  const config = getUpdateConfig(event)
  const state = getState()
  if (state.job.running) {
    throw new Error('已有更新任务正在执行，请稍后再检测。')
  }

  beginJob('checking', '正在检测最新版本…')
  try {
    const latest = await fetchLatestRelease(config.githubRepo, config.imageRepository, fetcher)
    const docker = createDockerClient(config.dockerSocketPath)
    const current = await resolveCurrentInstallation(config, await docker.isAvailable() ? docker : null)
    state.latest = latest
    state.checkedAt = new Date().toISOString()
    const available = isUpdateAvailable(current.version, latest.version)
    finishJob(
      'success',
      available
        ? `发现新版本 ${latest.tag}。`
        : `当前已是最新版本（${toImageTag(current.version)}）。`,
    )
    return await getUpdateStatus(event)
  } catch (error) {
    const message = error instanceof Error ? error.message : '检测更新失败。'
    finishJob('error', message, message)
    throw error
  }
}

export async function applyUpdate(event?: H3Event, options?: {
  docker?: DockerClient
  fetcher?: typeof fetch
}): Promise<UpdateStatus> {
  const config = getUpdateConfig(event)
  const state = getState()
  const docker = options?.docker || createDockerClient(config.dockerSocketPath)
  const fetcher = options?.fetcher || fetch

  if (!(await docker.isAvailable())) {
    throw new Error('未检测到可用的 Docker Socket。请确认安装时已挂载 /var/run/docker.sock，并允许容器访问。')
  }

  if (!state.latest) {
    await checkForUpdate(event, fetcher)
  }

  const latest = getState().latest
  if (!latest) throw new Error('未能获取最新版本信息。')
  const current = await resolveCurrentInstallation(config, docker)
  if (!isUpdateAvailable(current.version, latest.version)) {
    throw new Error('当前没有可应用的新版本。')
  }

  const imageTag = latest.tag.startsWith('v') || latest.tag === 'latest'
    ? latest.tag
    : toImageTag(latest.version)
  const imageRef = `${config.imageRepository}:${imageTag}`

  beginJob('pulling', `开始下载镜像 ${imageRef}…`, latest.version)
  // Run async so the HTTP response can return job status quickly.
  void runApplyJob({
    docker,
    imageRepository: config.imageRepository,
    imageTag,
    imageRef,
    containerName: config.containerName,
    targetVersion: latest.version,
  })

  return await getUpdateStatus(event, docker)
}

async function resolveCurrentInstallation(
  config: ReturnType<typeof getUpdateConfig>,
  docker: DockerClient | null,
): Promise<CurrentInstallation> {
  const runtimeVersion = String(config.currentVersion || '').trim() || 'unknown'
  const fallback: CurrentInstallation = {
    version: runtimeVersion,
    runtimeVersion,
    image: null,
    imageId: null,
    source: isUsableVersion(runtimeVersion) ? 'runtime' : 'unknown',
  }

  if (!docker) return fallback

  try {
    const self = await resolveSelfContainer(docker, config.containerName)
    if (!self) return fallback

    const image = self.Config.Image || null
    const imageId = self.Image || null
    const inspectedImage = await docker.inspectImage(imageId || image || '')
    const imageVersion = envValue(inspectedImage?.Config?.Env || [], 'NUXT_APP_VERSION')
      || inspectedImage?.Config?.Labels?.['org.opencontainers.image.version']
      || ''
    const imageTagVersion = versionFromImageRef(image || '')

    if (isUsableVersion(imageVersion)) {
      return {
        version: imageVersion,
        runtimeVersion,
        image,
        imageId,
        source: 'image',
      }
    }

    if (isUsableVersion(runtimeVersion)) {
      return {
        version: runtimeVersion,
        runtimeVersion,
        image,
        imageId,
        source: 'runtime',
      }
    }

    if (imageTagVersion) {
      return {
        version: imageTagVersion,
        runtimeVersion,
        image,
        imageId,
        source: 'image_tag',
      }
    }

    return {
      ...fallback,
      image,
      imageId,
    }
  } catch {
    return fallback
  }
}

function envValue(env: string[], key: string) {
  const prefix = `${key}=`
  return env.find(item => item.startsWith(prefix))?.slice(prefix.length) || ''
}

function isUsableVersion(value: string) {
  const normalized = normalizeVersion(value)
  return normalized === 'dev' || normalized === '0.0.0' || isSemverLike(normalized)
}

function versionFromImageRef(image: string) {
  const tag = image.includes(':') ? image.split(':').pop() || '' : ''
  return isSemverLike(tag) ? tag : ''
}

function getApplyBlockReason(input: {
  latest: LatestRelease | null
  dockerAvailable: boolean
  updateAvailable: boolean
  jobRunning: boolean
}) {
  if (input.jobRunning) return '已有更新任务正在执行。'
  if (!input.latest) return '请先检测最新版本。'
  if (!input.dockerAvailable) return 'Docker Socket 不可用，无法在页面内重建容器。'
  if (!input.updateAvailable) return '当前版本已是最新。'
  return null
}

export async function restartService(event?: H3Event, options?: {
  docker?: DockerClient
  exitProcess?: (code: number) => void
}): Promise<UpdateStatus> {
  const config = getUpdateConfig(event)
  const docker = options?.docker || createDockerClient(config.dockerSocketPath)
  const exitProcess = options?.exitProcess || ((code: number) => process.exit(code))

  beginJob('restarting', '正在重启服务…')
  try {
    if (await docker.isAvailable()) {
      const self = await resolveSelfContainer(docker, config.containerName)
      if (self) {
        appendLog(`通过 Docker 重启容器 ${self.Name.replace(/^\//, '')}。`)
        // Respond first; restart shortly after.
        setTimeout(() => {
          void docker.restartContainer(self.Id, 8).catch((error) => {
            finishJob('error', error instanceof Error ? error.message : '重启失败。', String(error))
          })
        }, 400)
        finishJob('success', '已发出 Docker 重启指令，服务将短暂中断后恢复。')
        return await getUpdateStatus(event, docker)
      }
      appendLog('未定位到当前容器，回退为进程退出重启。')
    } else {
      appendLog('Docker 不可用，回退为进程退出重启（依赖容器 restart 策略）。')
    }

    setTimeout(() => exitProcess(0), 500)
    finishJob('success', '已安排进程退出，容器管理器将按 restart 策略拉起服务。')
    return await getUpdateStatus(event, docker)
  } catch (error) {
    const message = error instanceof Error ? error.message : '重启失败。'
    finishJob('error', message, message)
    throw error
  }
}

async function runApplyJob(input: {
  docker: DockerClient
  imageRepository: string
  imageTag: string
  imageRef: string
  containerName: string
  targetVersion: string
}) {
  const { docker, imageRepository, imageTag, imageRef, containerName, targetVersion } = input
  try {
    appendLog(`拉取镜像 ${imageRef}`)
    await docker.pullImage(imageRepository, imageTag, (line) => {
      try {
        const parsed = JSON.parse(line) as { status?: string, id?: string, progress?: string }
        if (parsed.status) {
          const detail = [parsed.id, parsed.status, parsed.progress].filter(Boolean).join(' ')
          if (detail) appendLog(detail)
        }
      } catch {
        // ignore non-json stream chunks
      }
    })
    appendLog('镜像下载完成。')

    const self = await resolveSelfContainer(docker, containerName)
    if (!self) {
      throw new Error(`未找到当前容器（期望名称：${containerName}）。`)
    }

    const currentName = self.Name.replace(/^\//, '') || containerName
    const originalName = containerName
    const tempName = `${originalName}-old-${Date.now().toString(36)}`
    const helperName = `${originalName}-updater`
    const recreate = buildRecreatePayload(self, imageRef)

    setJobProgress('recreating', '正在准备新容器并移交更新任务…')
    const existingDesired = await docker.inspectContainer(originalName)
    if (existingDesired && existingDesired.Id !== self.Id) {
      appendLog(`移除上次失败残留容器 ${originalName}`)
      await docker.removeContainer(existingDesired.Id, true)
    }

    appendLog(`重命名旧容器为 ${tempName}`)
    await docker.renameContainer(self.Id, tempName)

    let newId = ''
    let helperId = ''
    try {
      appendLog(`创建新容器 ${originalName} <- ${imageRef}`)
      // Ensure version env is present on the new container.
      const env = Array.isArray(recreate.body.Env) ? [...recreate.body.Env] : []
      const withoutVersion = env.filter(item => !String(item).startsWith('NUXT_APP_VERSION='))
      withoutVersion.push(`NUXT_APP_VERSION=${targetVersion.startsWith('v') ? targetVersion : `v${normalizeVersion(targetVersion)}`}`)
      recreate.body.Env = withoutVersion

      newId = await docker.createContainer(originalName, recreate.body)
      const staleHelper = await docker.inspectContainer(helperName)
      if (staleHelper) {
        appendLog(`移除残留更新助手 ${helperName}`)
        await docker.removeContainer(staleHelper.Id, true)
      }
      helperId = await docker.createContainer(helperName, buildUpdateHelperPayload({
        imageRef,
        oldContainerId: self.Id,
        newContainerId: newId,
        desiredName: originalName,
        dockerSocketPath: getUpdateConfig().dockerSocketPath,
      }))
      setJobProgress('recreating', '更新任务已移交：即将停止旧容器、启动新版并执行健康检查。')
      await docker.startContainer(helperId)
      appendLog(`更新助手 ${helperId.slice(0, 12)} 已启动。`)
    } catch (error) {
      appendLog('移交更新任务失败，尝试恢复旧容器…')
      if (helperId) {
        try {
          await docker.removeContainer(helperId, true)
        } catch {
          // best effort cleanup
        }
      }
      if (newId) {
        try {
          appendLog(`移除未启动的新容器 ${newId.slice(0, 12)}`)
          await docker.removeContainer(newId, true)
        } catch {
          // best effort cleanup
        }
      }
      try {
        await docker.renameContainer(self.Id, originalName)
        appendLog(`旧容器名称已从 ${currentName} 恢复为 ${originalName}`)
      } catch {
        // best effort rollback
      }
      appendLog('旧容器未停止，继续保持运行。')
      try {
        const stale = await docker.inspectContainer(originalName)
        if (stale && stale.Id !== self.Id) {
          await docker.removeContainer(stale.Id, true)
          await docker.renameContainer(self.Id, originalName)
        }
      } catch {
        // best effort rollback
      }
      throw error
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : '更新失败。'
    finishJob('error', message, message)
  }
}

async function fetchLatestRelease(
  githubRepo: string,
  imageRepository: string,
  fetcher: typeof fetch,
): Promise<LatestRelease> {
  try {
    return await fetchGithubLatest(githubRepo, fetcher)
  } catch (githubError) {
    try {
      return await fetchDockerHubLatest(imageRepository, fetcher)
    } catch {
      throw githubError
    }
  }
}

async function fetchGithubLatest(githubRepo: string, fetcher: typeof fetch): Promise<LatestRelease> {
  const response = await fetcher(`https://api.github.com/repos/${githubRepo}/releases/latest`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'sub2api-guide-update-check',
    },
  })
  if (!response.ok) {
    throw new Error(`GitHub 版本检测失败（HTTP ${response.status}）。`)
  }
  const payload = await response.json() as {
    tag_name?: string
    published_at?: string
    html_url?: string
  }
  const tag = String(payload.tag_name || '').trim()
  if (!tag) throw new Error('GitHub Release 未返回 tag_name。')
  return {
    version: normalizeVersion(tag),
    tag: tag.startsWith('v') ? tag : toImageTag(tag),
    publishedAt: payload.published_at || null,
    url: payload.html_url || null,
  }
}

async function fetchDockerHubLatest(imageRepository: string, fetcher: typeof fetch): Promise<LatestRelease> {
  const [namespace, name] = imageRepository.split('/')
  if (!namespace || !name) throw new Error('镜像仓库名无效。')
  const response = await fetcher(
    `https://hub.docker.com/v2/repositories/${namespace}/${name}/tags?page_size=30&ordering=-last_updated`,
    { headers: { 'User-Agent': 'sub2api-guide-update-check' } },
  )
  if (!response.ok) {
    throw new Error(`Docker Hub 版本检测失败（HTTP ${response.status}）。`)
  }
  const payload = await response.json() as {
    results?: Array<{ name?: string, last_updated?: string }>
  }
  const tags = (payload.results || [])
    .map(item => ({
      name: String(item.name || ''),
      updated: item.last_updated || null,
    }))
    .filter(item => item.name && item.name !== 'latest' && isProbablyVersionTag(item.name))

  const latestTag = tags[0]?.name
  if (!latestTag) throw new Error('Docker Hub 未找到可用版本标签。')
  return {
    version: normalizeVersion(latestTag),
    tag: latestTag.startsWith('v') ? latestTag : toImageTag(latestTag),
    publishedAt: tags[0]?.updated || null,
    url: `https://hub.docker.com/r/${imageRepository}/tags`,
  }
}

function isProbablyVersionTag(tag: string) {
  return /^v?\d+\.\d+\.\d+([.-][0-9A-Za-z.-]+)?$/.test(tag)
}

/** Test helper to reset in-memory update state. */
export function resetUpdateStateForTests(removePersisted = true) {
  globalThis.__sub2apiUpdateState = undefined
  persistedJobNeedsReconcile = false
  if (removePersisted) {
    const file = updateStatePath()
    if (file) rmSync(file, { force: true })
  }
}
