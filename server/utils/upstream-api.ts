import { getRouterParam, type H3Event } from 'h3'
import { upstreamSchema } from '../domain/upstreams/schema'
import { apiError } from './api'
import { readLimitedJson } from './request-body'

export function upstreamId(event: H3Event) {
  const id = Number(getRouterParam(event, 'id'))
  if (!Number.isSafeInteger(id) || id <= 0) apiError(400, 'INVALID_UPSTREAM_ID', '上游编号无效。')
  return id
}

export async function readUpstreamInput(event: H3Event) {
  const parsed = upstreamSchema.safeParse(await readLimitedJson(event, 16_384))
  if (!parsed.success) apiError(400, 'INVALID_UPSTREAM', '上游配置格式不正确。', parsed.error.flatten())
  return parsed.data
}
