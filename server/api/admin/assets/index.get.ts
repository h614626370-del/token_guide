import { defineEventHandler } from 'h3'
import { listUploadedAssets } from '../../../domain/assets/service'
import { apiOk } from '../../../utils/api'
import { requireAdminSession } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  const assets = await listUploadedAssets(event)
  return apiOk(assets, { total: assets.length })
})
