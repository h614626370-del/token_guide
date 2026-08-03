import { defineEventHandler } from 'h3'
import { createDocsRepository } from '../../../domain/docs/repository'
import { apiOk } from '../../../utils/api'
import { useGuideDatabase } from '../../../utils/database'
import { requireAdminSession } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  return apiOk(createDocsRepository(useGuideDatabase()).list())
})
