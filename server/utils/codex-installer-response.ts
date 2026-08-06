import type { H3Event } from 'h3'
import { setHeader } from 'h3'
import type { InstallerPlatform } from '../domain/installers/schema'
import { createInstallerRepository } from '../domain/installers/repository'
import { useGuideDatabase } from './database'
import { CODEX_PROVIDER_ID, getInstallerBaseUrl } from './installer-config'

export function codexInstallerResponse(event: H3Event, platform: InstallerPlatform) {
  const script = createInstallerRepository(useGuideDatabase()).publicScript('codex', platform, {
    base_url: getInstallerBaseUrl(event),
    provider_id: CODEX_PROVIDER_ID,
  })
  if (!script) throw new Error(`Codex installer script was not found for ${platform}.`)

  setHeader(event, 'content-type', 'text/plain; charset=utf-8')
  setHeader(event, 'content-disposition', `inline; filename="${script.definition.filename}"`)
  setHeader(event, 'x-content-sha256', script.checksum)
  setHeader(event, 'cache-control', 'no-store')
  return script.content
}
