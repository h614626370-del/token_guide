import { defineEventHandler, getRouterParam, setHeader } from 'h3'
import { readPublicAsset } from '../../domain/assets/service'
import { apiError } from '../../utils/api'

export default defineEventHandler(async (event) => {
  const filename = getRouterParam(event, 'filename') || ''
  const asset = await readPublicAsset(filename, event)
  if (!asset) {
    apiError(404, 'ASSET_NOT_FOUND', '图片不存在。')
  }

  setHeader(event, 'content-type', asset.contentType)
  setHeader(event, 'cache-control', 'public, max-age=0, must-revalidate')
  setHeader(event, 'content-length', asset.size)
  return asset.bytes
})
