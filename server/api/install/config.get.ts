import { defineEventHandler } from 'h3'
import { createInstallerRepository } from '../../domain/installers/repository'
import { apiOk } from '../../utils/api'
import { useGuideDatabase } from '../../utils/database'
import { CODEX_PROVIDER_ID, getInstallerBaseUrl } from '../../utils/installer-config'

export default defineEventHandler((event) => {
  const repository = createInstallerRepository(useGuideDatabase())
  const settings = repository.settings()
  return apiOk({
    settings: { ...settings, provider_id: CODEX_PROVIDER_ID, base_url: getInstallerBaseUrl(event) },
    scripts: repository.list().map(item => ({
      id: item.id,
      tool: item.tool,
      platform: item.platform,
      filename: item.filename,
      checksum: item.checksum,
    })),
  })
})
