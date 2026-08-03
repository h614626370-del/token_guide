import { defineEventHandler } from 'h3'
import { getUpdateStatus } from '../../../domain/update/service'
import { apiOk } from '../../../utils/api'
import { requireAdminSession } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  return apiOk(await getUpdateStatus(event))
})
