import {
  chmodSync,
  chownSync,
  existsSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'

const deployDirectory = process.env.MANAGED_DEPLOY_DIR || '/managed-deploy'
const envTemplatePath = process.env.MANAGED_ENV_TEMPLATE || '/app/deploy/.env.example'

function atomicWrite(file, content) {
  const stat = statSync(file)
  const temporary = `${file}.${process.pid}.tmp`
  writeFileSync(temporary, content, { encoding: 'utf8', mode: stat.mode })
  chmodSync(temporary, stat.mode)
  if (process.platform !== 'win32') chownSync(temporary, stat.uid, stat.gid)
  renameSync(temporary, file)
}

function environmentEntries(content) {
  const entries = new Map()
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
    if (match) entries.set(match[1], match[2])
  }
  return entries
}

function syncEnvironment() {
  const target = join(deployDirectory, '.env')
  if (!existsSync(target) || !existsSync(envTemplatePath)) return false

  const original = readFileSync(target, 'utf8')
  const newline = original.includes('\r\n') ? '\r\n' : '\n'
  const filtered = original
    .split(/\r?\n/)
    .filter(line => !/^IMAGE_TAG=/.test(line))
  const existing = environmentEntries(filtered.join('\n'))
  const template = environmentEntries(readFileSync(envTemplatePath, 'utf8'))
  const additions = []

  for (const [key, value] of template) {
    if (existing.has(key) || value.startsWith('replace-')) continue
    additions.push(`${key}=${value}`)
  }

  while (filtered.length && filtered.at(-1) === '') filtered.pop()
  if (additions.length) filtered.push('', '# Added automatically from the current deployment template', ...additions)
  const updated = `${filtered.join(newline)}${newline}`
  if (updated === original) return false
  atomicWrite(target, updated)
  return true
}

function syncComposeFile(file) {
  if (!existsSync(file)) return false
  const original = readFileSync(file, 'utf8')
  if (!original.includes('container_name: sub2api-guide') || !original.includes('./data:/data')) return false
  if (/^\s{4}pull_policy:\s*always\s*$/m.test(original)) return false

  const updated = original.replace(
    /^(\s{4}image:\s*\$\{IMAGE_REPOSITORY:-614626370\/sub2api-guide\}:\$\{IMAGE_TAG:-latest\}\s*)$/m,
    '$1\n    pull_policy: always',
  )
  if (updated === original) return false
  atomicWrite(file, updated)
  return true
}

const envChanged = syncEnvironment()
const composeChanged = [
  'docker-compose.yml',
  'docker-compose.yaml',
  'compose.yml',
  'compose.yaml',
].some(name => syncComposeFile(join(deployDirectory, name)))

console.log(JSON.stringify({ env_changed: envChanged, compose_changed: composeChanged }))
