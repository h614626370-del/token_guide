import { defineEventHandler } from 'h3'
import { createInstallerRepository } from '../../domain/installers/repository'
import { apiOk } from '../../utils/api'
import { useGuideDatabase } from '../../utils/database'

export default defineEventHandler(() => {
  const repository = createInstallerRepository(useGuideDatabase())
  return apiOk({
    settings: repository.settings(),
    scripts: repository.list().map(item => ({
      id: item.id,
      tool: item.tool,
      platform: item.platform,
      filename: item.filename,
      checksum: item.checksum,
    })),
  })
})
