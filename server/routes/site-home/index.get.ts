import { defineEventHandler, deleteCookie, getCookie, getQuery, getRequestHeader, getRequestURL, sendRedirect, setCookie, setHeader } from 'h3'
import { readHomepageFile } from '../../domain/homepage/service'
import { recordHomepageVisit } from '../../domain/promotion/service'
import { apiError } from '../../utils/api'
import { requireAdminSession } from '../../utils/session'

export default defineEventHandler(async (event) => {
  const requestUrl = getRequestURL(event)
  if (requestUrl.pathname === '/site-home') {
    return sendRedirect(event, `/site-home/${requestUrl.search}`, 308)
  }

  const query = getQuery(event)
  const preview = query.preview === '1' || query.preview === 'true'
  const requestedDefaultId = typeof query.default === 'string' ? query.default : ''
  if (preview || requestedDefaultId) await requireAdminSession(event)

  if (preview) {
    setCookie(event, 'homepage_preview', 'draft', { httpOnly: true, sameSite: 'lax', maxAge: 600, path: '/site-home/' })
  } else if (requestedDefaultId) {
    setCookie(event, 'homepage_preview', `default:${requestedDefaultId}`, { httpOnly: true, sameSite: 'lax', maxAge: 600, path: '/site-home/' })
  } else if (getCookie(event, 'homepage_preview')) {
    deleteCookie(event, 'homepage_preview', { path: '/site-home/' })
  }

  const file = await readHomepageFile('index.html', event, preview, requestedDefaultId)
  if (!file) apiError(404, 'HOMEPAGE_FILE_NOT_FOUND', '首页文件不存在。')

  if (!preview && !requestedDefaultId && getRequestHeader(event, 'x-public-homepage') === '1') {
    try {
      recordHomepageVisit(event)
    } catch (error) {
      console.warn('Failed to record public homepage visit.', error instanceof Error ? error.message : error)
    }
  }

  setHeader(event, 'content-type', file.contentType)
  setHeader(event, 'cache-control', preview ? 'no-store' : 'no-cache, no-store, must-revalidate')
  setHeader(event, 'x-content-type-options', 'nosniff')
  setHeader(event, 'cross-origin-resource-policy', 'cross-origin')
  setHeader(event, 'referrer-policy', 'strict-origin-when-cross-origin')
  setHeader(event, 'content-length', file.size)
  return file.bytes
})
