import { defineEventHandler, getRouterParam, readBody } from 'h3'
import { updateAssetKind, type AssetKind } from '../../../../domain/assets/service'
import { apiError, apiOk } from '../../../../utils/api'
import { requireAdminSession } from '../../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const filename = getRouterParam(event, 'filename') || ''
  const body = await readBody<{ kind?: AssetKind }>(event)
  if (body?.kind !== 'replaceable' && body?.kind !== 'long_term') {
    apiError(400, 'INVALID_ASSET_KIND', '图片类型无效。')
  }
  const updated = await updateAssetKind(filename, body.kind, event)
  if (!updated) apiError(404, 'ASSET_NOT_FOUND', '图片不存在。')
  return apiOk({ filename, kind: body.kind })
})
