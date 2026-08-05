import { defineEventHandler } from 'h3'
import { createInstallerRepository } from '../../../domain/installers/repository'
import { apiOk } from '../../../utils/api'
import { useGuideDatabase } from '../../../utils/database'
import { requireAdminSession } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const repository = createInstallerRepository(useGuideDatabase())
  return apiOk({ scripts: repository.list(), settings: repository.settings() })
})
