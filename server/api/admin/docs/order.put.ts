import { defineEventHandler, readBody } from 'h3'
import { adminDocOrderSchema } from '../../../domain/docs/schema'
import { createDocsRepository } from '../../../domain/docs/repository'
import { apiError, apiOk } from '../../../utils/api'
import { useGuideDatabase } from '../../../utils/database'
import { requireAdminSession } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const parsed = adminDocOrderSchema.safeParse(await readBody(event))
  if (!parsed.success) apiError(400, 'INVALID_DOC_ORDER', '文档顺序格式不正确。', parsed.error.flatten())
  return apiOk(createDocsRepository(useGuideDatabase()).reorder(parsed.data.ids))
})
