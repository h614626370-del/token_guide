import { defineEventHandler } from 'h3'
import { apiError, apiOk } from '../../../utils/api'
import { requireAdminSession } from '../../../utils/session'
import { readUpstreamInput, upstreamId } from '../../../utils/upstream-api'
import { useUpstreamService } from '../../../utils/upstreams'

export default defineEventHandler(async event => {
  await requireAdminSession(event)
  const id = upstreamId(event)
  const input = await readUpstreamInput(event)
  try { return apiOk(await useUpstreamService().save(input, id)) }
  catch (error) { apiError(400, 'UPSTREAM_SAVE_FAILED', error instanceof Error ? error.message : '上游保存失败。') }
})
