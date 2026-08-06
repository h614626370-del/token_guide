import { defineEventHandler } from 'h3'
import { publishHomepageDraft } from '../../../domain/homepage/service'
import { apiError, apiOk } from '../../../utils/api'
import { requireAdminSession } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  try {
    return apiOk(await publishHomepageDraft(event))
  } catch (error) {
    apiError(400, 'PUBLISH_HOMEPAGE_FAILED', error instanceof Error ? error.message : '首页发布失败。')
  }
})
