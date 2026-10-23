import { defineEventHandler } from 'h3'
import { apiOk } from '../../../utils/api'
import { requireAdminSession } from '../../../utils/session'
import { useUpstreamService } from '../../../utils/upstreams'

export default defineEventHandler(async event => {
  await requireAdminSession(event)
  return apiOk(await useUpstreamService().list())
})
