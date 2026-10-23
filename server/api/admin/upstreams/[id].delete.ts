import { defineEventHandler } from 'h3'
import { apiError, apiOk } from '../../../utils/api'
import { requireAdminSession } from '../../../utils/session'
import { upstreamId } from '../../../utils/upstream-api'
import { useUpstreamService } from '../../../utils/upstreams'

export default defineEventHandler(async event => {
  await requireAdminSession(event)
  if (!useUpstreamService().remove(upstreamId(event))) apiError(404, 'UPSTREAM_NOT_FOUND', '上游配置不存在。')
  return apiOk({ deleted: true })
})
