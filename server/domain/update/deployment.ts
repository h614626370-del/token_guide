import { basename, dirname, isAbsolute, parse, resolve } from 'node:path'
import {
  createDockerClient,
  resolveSelfContainer,
  type DockerClient,
  type DockerContainerInspect,
} from './docker'

interface DeploymentSyncOptions {
  docker?: DockerClient
  containerName?: string
  dockerSocketPath?: string
}

export function resolveManagedDeploymentDirectory(inspect: DockerContainerInspect) {
  const labels = inspect.Config.Labels || {}
  if (labels['com.docker.compose.service'] !== 'guide') return null

  const dataMount = inspect.Mounts?.find(mount => (
    mount.Type === 'bind'
    && mount.Destination === '/data'
    && Boolean(mount.Source)
  ))
  const dataSource = String(dataMount?.Source || '').trim()
  if (!isAbsolute(dataSource) || basename(dataSource) !== 'data') return null

  const inferredDirectory = resolve(dirname(dataSource))
  if (inferredDirectory === parse(inferredDirectory).root) return null

  const composeDirectory = String(labels['com.docker.compose.project.working_dir'] || '').trim()
  if (composeDirectory && isAbsolute(composeDirectory) && resolve(composeDirectory) !== inferredDirectory) {
    return null
  }
  return inferredDirectory
}

export function buildDeploymentSyncPayload(input: {
  imageRef: string
  deploymentDirectory: string
}) {
  return {
    Image: input.imageRef,
    User: '0',
    Env: ['MANAGED_DEPLOY_DIR=/managed-deploy'],
    Cmd: ['node', '/app/scripts/sync-deployment-config.mjs'],
    HostConfig: {
      AutoRemove: false,
      NetworkMode: 'none',
      Binds: [`${input.deploymentDirectory}:/managed-deploy`],
    },
  }
}

export async function syncManagedDeploymentConfig(options: DeploymentSyncOptions = {}) {
  const dockerSocketPath = options.dockerSocketPath
    || String(process.env.NUXT_DOCKER_SOCKET_PATH || '/var/run/docker.sock')
  const containerName = options.containerName
    || String(process.env.NUXT_UPDATE_CONTAINER_NAME || 'sub2api-guide')
  const docker = options.docker || createDockerClient(dockerSocketPath)
  if (!(await docker.isAvailable())) return false

  const self = await resolveSelfContainer(docker, containerName)
  if (!self) return false
  const deploymentDirectory = resolveManagedDeploymentDirectory(self)
  const imageRef = String(self.Config.Image || self.Image || '').trim()
  if (!deploymentDirectory || !imageRef) return false

  const helperName = `${containerName}-config-sync`
  const staleHelper = await docker.inspectContainer(helperName)
  if (staleHelper) await docker.removeContainer(staleHelper.Id, true)

  const helperId = await docker.createContainer(helperName, buildDeploymentSyncPayload({
    imageRef,
    deploymentDirectory,
  }))
  try {
    await docker.startContainer(helperId)
    const result = await docker.waitContainer(helperId)
    if (result.statusCode !== 0) {
      throw new Error(result.error || `部署配置同步助手退出码为 ${result.statusCode}。`)
    }
    return true
  } finally {
    await docker.removeContainer(helperId, true)
  }
}
