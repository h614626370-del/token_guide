import { defineEventHandler, getRouterParam, readBody } from 'h3'
import { createDocsRepository } from '../../../../domain/docs/repository'
import { adminDocUpdateSchema } from '../../../../domain/docs/schema'
import { apiError, apiOk } from '../../../../utils/api'
import { useGuideDatabase } from '../../../../utils/database'
import { requireAdminSession } from '../../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const parsed = adminDocUpdateSchema.safeParse(await readBody(event))
  if (!parsed.success) apiError(400, 'INVALID_DOC_CONTENT', '文档内容格式不正确。', parsed.error.flatten())
  const doc = createDocsRepository(useGuideDatabase()).publish(getRouterParam(event, 'id') || '', parsed.data)
  if (!doc) apiError(404, 'DOC_NOT_FOUND', 'Document was not found.')
  return apiOk(doc)
})
