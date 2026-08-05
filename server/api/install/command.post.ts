import { defineEventHandler } from 'h3'
import { createInstallerRepository } from '../../domain/installers/repository'
import { installerCommandSchema } from '../../domain/installers/schema'
import { apiError, apiOk } from '../../utils/api'
import { useGuideDatabase } from '../../utils/database'
import { listMaskedPlaygroundKeys, resolvePlaygroundCredential } from '../../utils/playground'
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
  const script = createInstallerRepository(useGuideDatabase()).publicScript(parsed.data.tool, parsed.data.platform)
  if (!script) apiError(404, 'INSTALLER_SCRIPT_NOT_FOUND', 'Installer script was not found.')

  const origin = getPublicRequestOrigin(event)
  const scriptUrl = `${origin}/api/install/scripts/${parsed.data.tool}/${parsed.data.platform}`
  const envName = parsed.data.tool === 'codex' ? 'CODEX_API_KEY' : 'CLAUDE_API_KEY'

  if (parsed.data.platform === 'windows') {
    const body = `$env:${envName}='${powershellQuote(apiKey)}';try{$s=(Invoke-RestMethod -Uri '${powershellQuote(scriptUrl)}');&([ScriptBlock]::Create($s))}finally{Remove-Item Env:${envName} -ErrorAction SilentlyContinue}`
    const encoded = Buffer.from(body, 'utf16le').toString('base64')
    const local = `$env:${envName}='${powershellQuote(apiKey)}';try{& .\\${script.definition.filename}}finally{Remove-Item Env:${envName} -ErrorAction SilentlyContinue}`
    return apiOk({
      remote: [
        { label: 'Windows PowerShell 5.1', command: `powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}` },
        { label: 'PowerShell 7+', command: `pwsh -NoProfile -EncodedCommand ${encoded}` },
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
  const url = shellQuote(scriptUrl)
  const filename = shellQuote(script.definition.filename)
  return apiOk({
    remote: [{ label: parsed.data.platform === 'macos' ? 'macOS Terminal' : 'Linux Terminal', command: `export ${envName}=${key}; curl -fsSL ${url} | bash; unset ${envName}` }],
    local: [{ label: parsed.data.platform === 'macos' ? 'macOS Terminal' : 'Linux Terminal', command: `chmod +x ./${script.definition.filename} && export ${envName}=${key}; ./${script.definition.filename}; unset ${envName}` }],
    download_url: scriptUrl,
    filename: filename.slice(1, -1),
    checksum: script.checksum,
  })
})
