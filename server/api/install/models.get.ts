import { defineEventHandler, getQuery } from 'h3'
import { installerModelsQuerySchema } from '../../domain/installers/schema'
import { apiError, apiOk } from '../../utils/api'
import { listMaskedPlaygroundKeys, listModelsForApiKey, resolvePlaygroundCredential } from '../../utils/playground'

export default defineEventHandler(async (event) => {
  const parsed = installerModelsQuerySchema.safeParse(getQuery(event))
  if (!parsed.success) apiError(400, 'INVALID_INSTALLER_MODELS_QUERY', 'Installer model query is invalid.')

  const protocol = parsed.data.tool === 'codex' ? 'openai' : 'anthropic'
  const keys = await listMaskedPlaygroundKeys(event)
  const selected = keys.find(item => item.id === parsed.data.key_id && String(item.group?.platform || '').toLowerCase() === protocol)
  if (!selected) apiError(404, 'INSTALLER_KEY_NOT_FOUND', 'The selected API key is unavailable for this tool.')

  const apiKey = await resolvePlaygroundCredential(event, { type: 'saved', id: parsed.data.key_id })
  return apiOk(await listModelsForApiKey(event, apiKey))
})
