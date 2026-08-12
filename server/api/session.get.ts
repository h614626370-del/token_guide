import { defineEventHandler } from 'h3'
import { apiOk } from '../utils/api'
import { useAdminSession, useGuideSession } from '../utils/session'

export default defineEventHandler(async (event) => {
  const session = await useGuideSession(event)
  const adminSession = await useAdminSession(event)
  return apiOk({
    authenticated: Boolean(session.data.user && session.data.accessToken),
    admin: Boolean(adminSession.data.authenticated),
    user: session.data.user || null,
    token_expires_at: session.data.tokenExpiresAt || null,
  })
})
