import {
  defineEventHandler,
  getQuery,
  sendRedirect,
  setHeaders,
} from 'h3'
import { fetchCurrentSub2apiUser } from '../../utils/sub2api-auth'
import { jwtExpiresAt, useGuideSession } from '../../utils/session'

const allowedDestinations = new Set(['/playground', '/pricing', '/feedback', '/'])

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

  const user = await fetchCurrentSub2apiUser(event, token)
  if (!user) {
    return sendRedirect(event, '/auth/error?reason=invalid', 303)
  }

  const session = await useGuideSession(event)
  await session.update({
    user,
    accessToken: token,
    tokenExpiresAt: jwtExpiresAt(token),
    lastValidatedAt: Date.now(),
    admin: session.data.admin || false,
  })

  const embedded = query.ui_mode === 'embedded' ? '?embedded=1' : ''
  return sendRedirect(event, `${destination}${embedded}`, 303)
})
