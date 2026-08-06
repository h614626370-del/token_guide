import { defineEventHandler } from 'h3'
import { apiOk } from '../../utils/api'
import { getPublicEmailSettings } from '../../utils/email'
import { requireAdminSession } from '../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  return apiOk(getPublicEmailSettings())
})