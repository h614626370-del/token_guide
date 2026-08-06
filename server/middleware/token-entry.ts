import { defineEventHandler, getQuery, getRequestURL, sendRedirect, setHeaders } from 'h3'
import { establishGuideSession } from '../utils/token-entry'

const tokenEntryPaths = new Set(['/install', '/playground', '/pricing', '/feedback'])

export default defineEventHandler(async (event) => {
  const url = getRequestURL(event)
  if (event.method !== 'GET' || !tokenEntryPaths.has(url.pathname)) return

  const query = getQuery(event)
  const token = typeof query.token === 'string' ? query.token.trim() : ''
  if (!token) return

  setHeaders(event, {
    'cache-control': 'no-store, max-age=0',
    pragma: 'no-cache',
    'referrer-policy': 'no-referrer',
    'x-robots-tag': 'noindex, nofollow',
  })

  if (token.length > 8192) return sendRedirect(event, '/auth/error?reason=invalid', 303)
  const expectedUserId = typeof query.user_id === 'string' ? query.user_id.trim() : ''
  const user = await establishGuideSession(event, token, expectedUserId)
  if (!user) return sendRedirect(event, '/auth/error?reason=invalid', 303)

  // Never carry the JWT or user id into the application URL.
  return sendRedirect(event, url.pathname, 303)
})
