import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildDeploymentSyncPayload,
  resolveManagedDeploymentDirectory,
} from '../server/domain/update/deployment'

const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('managed deployment configuration sync', () => {
  it('only accepts the official compose data directory', () => {
    const directory = resolve('/srv/sub2api-guide-deploy')
    const inspect = {
      Id: 'container-id',
      Name: '/sub2api-guide',
      Config: {
        Image: '614626370/sub2api-guide:v2.0.11',
        Labels: {
          'com.docker.compose.service': 'guide',
          'com.docker.compose.project.working_dir': directory,
        },
      },
      HostConfig: {},
      Mounts: [{ Type: 'bind', Source: join(directory, 'data'), Destination: '/data' }],
    }

    expect(resolveManagedDeploymentDirectory(inspect)).toBe(directory)
    expect(resolveManagedDeploymentDirectory({
      ...inspect,
      Config: { ...inspect.Config, Labels: { 'com.docker.compose.service': 'other' } },
    })).toBeNull()

    const payload = buildDeploymentSyncPayload({
      imageRef: inspect.Config.Image,
      deploymentDirectory: directory,
    })
    expect(payload.HostConfig).toMatchObject({
      NetworkMode: 'none',
      Binds: [`${directory}:/managed-deploy`],
    })
  })

  it('preserves existing values while migrating env and compose defaults', () => {
    const directory = mkdtempSync(join(tmpdir(), 'guide-deploy-sync-'))
    temporaryDirectories.push(directory)
    const template = join(directory, '.env.example')
    const envFile = join(directory, '.env')
    const composeFile = join(directory, 'docker-compose.yml')
    writeFileSync(template, [
      'HOST_PORT=3000',
      'NUXT_ADMIN_TOKEN=replace-with-a-random-administrator-token',
      'NUXT_NEW_SETTING=enabled',
      '',
    ].join('\n'))
    writeFileSync(envFile, [
      'HOST_PORT=8080',
      'IMAGE_TAG=v2.0.9',
      'NUXT_ADMIN_TOKEN=existing-secret',
      '',
    ].join('\n'))
    writeFileSync(composeFile, [
      'services:',
      '  guide:',
      '    image: ${IMAGE_REPOSITORY:-614626370/sub2api-guide}:${IMAGE_TAG:-latest}',
      '    container_name: sub2api-guide',
      '    volumes:',
      '      - ./data:/data',
      '',
    ].join('\n'))

    execFileSync(process.execPath, [resolve('scripts/sync-deployment-config.mjs')], {
      env: {
        ...process.env,
        MANAGED_DEPLOY_DIR: directory,
        MANAGED_ENV_TEMPLATE: template,
      },
    })

    const env = readFileSync(envFile, 'utf8')
    expect(env).toContain('HOST_PORT=8080')
    expect(env).toContain('NUXT_ADMIN_TOKEN=existing-secret')
    expect(env).toContain('NUXT_NEW_SETTING=enabled')
    expect(env).not.toContain('IMAGE_TAG=')
    expect(readFileSync(composeFile, 'utf8')).toContain('pull_policy: always')
  })
})
