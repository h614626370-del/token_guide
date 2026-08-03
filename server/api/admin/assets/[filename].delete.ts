import { defineEventHandler, getRouterParam } from 'h3'
import { deleteUploadedAsset } from '../../../domain/assets/service'
import { apiError, apiOk } from '../../../utils/api'
import { requireAdminSession } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const filename = getRouterParam(event, 'filename') || ''
  const deleted = await deleteUploadedAsset(filename, event)
  if (!deleted) {
    apiError(404, 'ASSET_NOT_FOUND', '图片不存在。')
  }
  return apiOk({ filename })
})
