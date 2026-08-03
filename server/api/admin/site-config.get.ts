import { defineEventHandler } from 'h3'
import { apiOk } from '../../utils/api'
import { getPublicSiteConfig } from '../../utils/site-config'
import { requireAdminSession } from '../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  return apiOk(getPublicSiteConfig(event))
})
