import { defineEventHandler } from 'h3'
import { createInstallerRepository } from '../../domain/installers/repository'
import { installerCommandSchema } from '../../domain/installers/schema'
import { apiError, apiOk } from '../../utils/api'
import { useGuideDatabase } from '../../utils/database'
import { CODEX_PROVIDER_ID, getInstallerBaseUrl } from '../../utils/installer-config'
import { listMaskedPlaygroundKeys, listModelsForApiKey, resolvePlaygroundCredential } from '../../utils/playground'
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

  const apiKey = await resolvePlaygroundCredential(event, { type: 'saved', id: parsed.data.key_id })
  const models = await listModelsForApiKey(event, apiKey)
  if (!models.includes(parsed.data.model)) {
    apiError(400, 'INSTALLER_MODEL_NOT_AVAILABLE', 'The selected model is unavailable for this API key.')
  }
  const baseUrl = getInstallerBaseUrl(event)
  const script = createInstallerRepository(useGuideDatabase()).publicScript(parsed.data.tool, parsed.data.platform, {
    base_url: baseUrl,
    provider_id: CODEX_PROVIDER_ID,
  })
  if (!script) apiError(404, 'INSTALLER_SCRIPT_NOT_FOUND', 'Installer script was not found.')

  const origin = getPublicRequestOrigin(event)
  const scriptUrl = parsed.data.tool === 'codex'
    ? `${origin}/${parsed.data.platform === 'windows' ? 'setup.ps1' : 'setup.sh'}`
    : `${origin}/api/install/scripts/${parsed.data.tool}/${parsed.data.platform}`
  const envName = parsed.data.tool === 'codex' ? 'CODEX_API_KEY' : 'CLAUDE_API_KEY'
  const modelEnvName = parsed.data.tool === 'codex' ? 'CODEX_MODEL' : 'ANTHROPIC_MODEL'

  if (parsed.data.platform === 'windows') {
    const baseUrlEnv = parsed.data.tool === 'codex' ? `$env:CODEX_BASE_URL='${powershellQuote(baseUrl)}';` : ''
    const clearBaseUrl = parsed.data.tool === 'codex' ? 'Remove-Item Env:CODEX_BASE_URL -ErrorAction SilentlyContinue;' : ''
    const prefix = `$env:${envName}='${powershellQuote(apiKey)}';$env:${modelEnvName}='${powershellQuote(parsed.data.model)}';${baseUrlEnv}`
    const cleanup = `Remove-Item Env:${envName} -ErrorAction SilentlyContinue;Remove-Item Env:${modelEnvName} -ErrorAction SilentlyContinue;${clearBaseUrl}`
    const remote = `${prefix}try{$installerSource=irm '${powershellQuote(scriptUrl)}';iex $installerSource.TrimStart([char]0xFEFF)}finally{${cleanup}}`
    const local = `${prefix}try{& .\\${script.definition.filename}}finally{${cleanup}}`
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
    })
  }

  const key = shellQuote(apiKey)
  const baseUrlEnv = parsed.data.tool === 'codex' ? ` CODEX_BASE_URL=${shellQuote(baseUrl)}` : ''
  const modelEnv = ` ${modelEnvName}=${shellQuote(parsed.data.model)}`
  const clearEnv = parsed.data.tool === 'codex' ? `${envName} ${modelEnvName} CODEX_BASE_URL` : `${envName} ${modelEnvName}`
  const url = shellQuote(scriptUrl)
  const filename = shellQuote(script.definition.filename)
  return apiOk({
    remote: [{ label: parsed.data.platform === 'macos' ? 'macOS Terminal' : 'Linux Terminal', command: `export ${envName}=${key}${modelEnv}${baseUrlEnv}; curl -fsSL ${url} | bash; unset ${clearEnv}` }],
    local: [{ label: parsed.data.platform === 'macos' ? 'macOS Terminal' : 'Linux Terminal', command: `chmod +x ./${script.definition.filename} && export ${envName}=${key}${modelEnv}${baseUrlEnv}; ./${script.definition.filename}; unset ${clearEnv}` }],
    download_url: scriptUrl,
    filename: filename.slice(1, -1),
    checksum: script.checksum,
  })
})
