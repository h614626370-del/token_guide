import {
  defineEventHandler,
  getQuery,
  sendRedirect,
  setHeaders,
} from 'h3'
import { establishGuideSession } from '../../utils/token-entry'

const allowedDestinations = new Set(['/install', '/playground', '/pricing', '/feedback', '/'])

export default defineEventHandler(async (event) => {
  setHeaders(event, {
    'cache-control': 'no-store, max-age=0',
    pragma: 'no-cache',
    'referrer-policy': 'no-referrer',
    'x-robots-tag': 'noindex, nofollow',
  })

  const query = getQuery(event)
  const token = typeof query.token === 'string' ? query.token.trim() : ''
  const requestedDestination = typeof query.redirect === 'string' ? query.redirect : '/playground'
  const destination = allowedDestinations.has(requestedDestination) ? requestedDestination : '/playground'

  if (!token || token.length > 8192) {
    return sendRedirect(event, '/auth/error?reason=missing', 303)
  }

  const user = await establishGuideSession(event, token)
  if (!user) {
    return sendRedirect(event, '/auth/error?reason=invalid', 303)
  }

  const embedded = query.ui_mode === 'embedded' ? '?embedded=1' : ''
  return sendRedirect(event, `${destination}${embedded}`, 303)
})
