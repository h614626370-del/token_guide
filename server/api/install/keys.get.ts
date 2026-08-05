import { defineEventHandler, getQuery } from 'h3'
import { installerToolSchema } from '../../domain/installers/schema'
import { apiError, apiOk } from '../../utils/api'
import { listMaskedPlaygroundKeys } from '../../utils/playground'

export default defineEventHandler(async (event) => {
  const parsed = installerToolSchema.safeParse(getQuery(event).tool)
  if (!parsed.success) apiError(400, 'INVALID_INSTALLER_TOOL', 'Installer tool is invalid.')
  const protocol = parsed.data === 'codex' ? 'openai' : 'anthropic'
  const keys = await listMaskedPlaygroundKeys(event)
  return apiOk(keys.filter(item => String(item.group?.platform || '').toLowerCase() === protocol))
})
