import { defineEventHandler, getRouterParam, setHeader } from 'h3'
import { createInstallerRepository } from '../../../../domain/installers/repository'
import { installerPlatformSchema, installerToolSchema } from '../../../../domain/installers/schema'
import { apiError } from '../../../../utils/api'
import { useGuideDatabase } from '../../../../utils/database'
import { CODEX_PROVIDER_ID, getInstallerBaseUrl } from '../../../../utils/installer-config'

export default defineEventHandler((event) => {
  const tool = installerToolSchema.safeParse(getRouterParam(event, 'tool'))
  const platform = installerPlatformSchema.safeParse(getRouterParam(event, 'platform'))
  if (!tool.success || !platform.success) apiError(404, 'INSTALLER_SCRIPT_NOT_FOUND', 'Installer script was not found.')
  const script = createInstallerRepository(useGuideDatabase()).publicScript(tool.data, platform.data, {
    base_url: getInstallerBaseUrl(event),
    provider_id: CODEX_PROVIDER_ID,
  })
  if (!script) apiError(404, 'INSTALLER_SCRIPT_NOT_FOUND', 'Installer script was not found.')
  setHeader(event, 'content-type', 'text/plain; charset=utf-8')
  setHeader(event, 'content-disposition', `attachment; filename="${script.definition.filename}"`)
  setHeader(event, 'x-content-sha256', script.checksum)
  setHeader(event, 'cache-control', 'no-store')
  return script.content
})
