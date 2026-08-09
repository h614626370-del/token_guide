import { defineEventHandler } from 'h3'
import { createInstallerRepository } from '../../domain/installers/repository'
import { installerCommandSchema } from '../../domain/installers/schema'
import { apiError, apiOk } from '../../utils/api'
import { useGuideDatabase } from '../../utils/database'
import { CODEX_PROVIDER_ID, getInstallerBaseUrl } from '../../utils/installer-config'
import { listMaskedPlaygroundKeys, resolvePlaygroundCredential, selectModelForGroup } from '../../utils/playground'
import { getPublicRequestOrigin } from '../../utils/request-url'
import { readLimitedJson } from '../../utils/request-body'

function powershellQuote(value: string) {
  return value.replaceAll("'", "''")
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'"'"'`)}'`
}

export default defineEventHandler(async (event) => {
  const parsed = installerCommandSchema.safeParse(await readLimitedJson(event, 16 * 1024))
  if (!parsed.success) apiError(400, 'INVALID_INSTALLER_COMMAND', 'Installer command request is invalid.', parsed.error.flatten())

  const protocol = parsed.data.tool === 'codex' ? 'openai' : 'anthropic'
  const keys = await listMaskedPlaygroundKeys(event)
  const selected = keys.find(item => item.id === parsed.data.key_id && String(item.group?.platform || '').toLowerCase() === protocol)
  if (!selected) apiError(404, 'INSTALLER_KEY_NOT_FOUND', 'The selected API key is unavailable for this tool.')

  const baseUrl = getInstallerBaseUrl(event)
  const repository = createInstallerRepository(useGuideDatabase())
  const groupId = selected.group_id ?? selected.group?.id
  const configuredModel = repository.modelForGroup(parsed.data.tool, groupId)
  const hasGroupOverride = repository.settings().group_models.some(item => item.tool === parsed.data.tool && item.group_id === String(groupId ?? ''))
  const modelSelection = selectModelForGroup(configuredModel, selected.group, {
    hasGroupOverride,
  })
  const model = modelSelection.model
  const script = repository.publicScript(parsed.data.tool, parsed.data.platform, {
    base_url: baseUrl,
    provider_id: CODEX_PROVIDER_ID,
  })
  if (!script) apiError(404, 'INSTALLER_SCRIPT_NOT_FOUND', 'Installer script was not found.')
  const apiKey = await resolvePlaygroundCredential(event, { type: 'saved', id: parsed.data.key_id }, selected.group_id)

  const origin = getPublicRequestOrigin(event)
  const scriptUrl = parsed.data.tool === 'codex'
    ? `${origin}/${parsed.data.platform === 'windows' ? 'setup.ps1' : 'setup.sh'}`
    : `${origin}/api/install/scripts/${parsed.data.tool}/${parsed.data.platform}`
  const envName = parsed.data.tool === 'codex' ? 'CODEX_API_KEY' : 'CLAUDE_API_KEY'

  if (parsed.data.platform === 'windows') {
    const baseUrlEnv = parsed.data.tool === 'codex' ? `$env:CODEX_BASE_URL='${powershellQuote(baseUrl)}';` : ''
    const clearBaseUrl = parsed.data.tool === 'codex' ? 'Remove-Item Env:CODEX_BASE_URL -ErrorAction SilentlyContinue;' : ''
    const prefix = `$env:${envName}='${powershellQuote(apiKey)}';${baseUrlEnv}`
    const cleanup = `Remove-Item Env:${envName} -ErrorAction SilentlyContinue;${clearBaseUrl}`
    const modelArgument = parsed.data.tool === 'codex' && model ? ` -Model '${powershellQuote(model)}'` : ''
    const runRemote = parsed.data.tool === 'codex'
      ? `& ([scriptblock]::Create($installerSource.TrimStart([char]0xFEFF)))${modelArgument}`
      : 'iex $installerSource.TrimStart([char]0xFEFF)'
    const remote = `${prefix}try{$installerSource=irm '${powershellQuote(scriptUrl)}';${runRemote}}finally{${cleanup}}`
    const local = `${prefix}try{& .\\${script.definition.filename}${modelArgument}}finally{${cleanup}}`
    return apiOk({
      remote: [
        { label: 'Windows PowerShell 5.1 / 7+', command: remote },
      ],
      local: [
        { label: 'Windows PowerShell 5.1 / 7+', command: local },
      ],
      download_url: scriptUrl,
      filename: script.definition.filename,
      checksum: script.checksum,
      model,
      model_source: modelSelection.source,
      model_policy_mode: modelSelection.policy_mode,
      allowed_models: modelSelection.allowed_models,
    })
  }

  const key = shellQuote(apiKey)
  const baseUrlEnv = parsed.data.tool === 'codex' ? ` CODEX_BASE_URL=${shellQuote(baseUrl)}` : ''
  const modelEnv = parsed.data.tool === 'codex' && model ? ` CODEX_MODEL=${shellQuote(model)}` : ''
  const clearEnv = parsed.data.tool === 'codex' ? `${envName} CODEX_BASE_URL CODEX_MODEL` : envName
  const url = shellQuote(scriptUrl)
  const filename = shellQuote(script.definition.filename)
  return apiOk({
    remote: [{ label: parsed.data.platform === 'macos' ? 'macOS Terminal' : 'Linux Terminal', command: `export ${envName}=${key}${baseUrlEnv}${modelEnv}; curl -fsSL ${url} | bash; unset ${clearEnv}` }],
    local: [{ label: parsed.data.platform === 'macos' ? 'macOS Terminal' : 'Linux Terminal', command: `chmod +x ./${script.definition.filename} && export ${envName}=${key}${baseUrlEnv}${modelEnv}; ./${script.definition.filename}; unset ${clearEnv}` }],
    download_url: scriptUrl,
    filename: filename.slice(1, -1),
    checksum: script.checksum,
    model,
    model_source: modelSelection.source,
    model_policy_mode: modelSelection.policy_mode,
    allowed_models: modelSelection.allowed_models,
  })
})
