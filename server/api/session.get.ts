import { defineEventHandler } from 'h3'
import { apiOk } from '../utils/api'
import { useGuideSession } from '../utils/session'

export default defineEventHandler(async (event) => {
  const session = await useGuideSession(event)
  return apiOk({
    authenticated: Boolean(session.data.user && session.data.accessToken),
    admin: Boolean(session.data.admin),
    user: session.data.user || null,
    token_expires_at: session.data.tokenExpiresAt || null,
  })
})
