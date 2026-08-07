import { defineEventHandler, getCookie, getQuery, getRouterParam, setHeader } from 'h3'
import { readHomepageFile } from '../../domain/homepage/service'
import { apiError } from '../../utils/api'
import { requireAdminSession } from '../../utils/session'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const cookiePreview = getCookie(event, 'homepage_preview') || ''
  const preview = query.preview === '1' || query.preview === 'true' || cookiePreview === 'draft'
  const requestedDefaultId = typeof query.default === 'string'
    ? query.default
    : cookiePreview.startsWith('default:') ? cookiePreview.slice('default:'.length) : ''
  if (preview || requestedDefaultId) await requireAdminSession(event)

  const file = await readHomepageFile(getRouterParam(event, 'path') || 'index.html', event, preview, requestedDefaultId)
  if (!file) apiError(404, 'HOMEPAGE_FILE_NOT_FOUND', '首页文件不存在。')

  setHeader(event, 'content-type', file.contentType)
  setHeader(event, 'cache-control', preview ? 'no-store' : 'no-cache, no-store, must-revalidate')
  setHeader(event, 'x-content-type-options', 'nosniff')
  setHeader(event, 'cross-origin-resource-policy', 'cross-origin')
  setHeader(event, 'referrer-policy', 'strict-origin-when-cross-origin')
  setHeader(event, 'content-length', file.size)
  return file.bytes
})
