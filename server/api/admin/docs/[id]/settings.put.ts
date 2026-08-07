import { defineEventHandler, getRouterParam, readBody } from 'h3'
import { adminDocSettingsSchema } from '../../../../domain/docs/schema'
import { createDocsRepository } from '../../../../domain/docs/repository'
import { apiError, apiOk } from '../../../../utils/api'
import { useGuideDatabase } from '../../../../utils/database'
import { requireAdminSession } from '../../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const parsed = adminDocSettingsSchema.safeParse(await readBody(event))
  if (!parsed.success) apiError(400, 'INVALID_DOC_SETTINGS', '文档设置格式不正确。', parsed.error.flatten())
  const doc = createDocsRepository(useGuideDatabase()).updateSettings(getRouterParam(event, 'id') || '', parsed.data)
  if (!doc) apiError(404, 'DOC_NOT_FOUND', 'Document was not found.')
  return apiOk(doc)
})
