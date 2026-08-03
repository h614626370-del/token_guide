import type { H3Event } from 'h3'
import { useSession } from 'h3'
import { apiError } from './api'
import { getGuideConfig } from './config'
import { fetchCurrentSub2apiUser } from './sub2api-auth'

export interface GuideUser {
  id: string
  email: string
  username: string
  role: string
}

export interface GuideSessionData {
  user?: GuideUser
  accessToken?: string
  tokenExpiresAt?: number
  lastValidatedAt?: number
  admin?: boolean
}

function sessionPassword(event: H3Event) {
  const config = getGuideConfig(event)
  if (config.sessionPassword.length >= 32) return config.sessionPassword
  if (config.isProduction) {
    apiError(500, 'SESSION_UNCONFIGURED', 'Session password is not configured.')
  }
  return 'dev-only-kkflow-guide-session-password-change-me'
}

export function useGuideSession(event: H3Event) {
  const config = getGuideConfig(event)
  return useSession<GuideSessionData>(event, {
    password: sessionPassword(event),
    name: config.isProduction ? '__Host-guide_session' : 'guide_session',
    maxAge: 12 * 60 * 60,
    cookie: {
      httpOnly: true,
      secure: config.isProduction,
      sameSite: 'lax',
      path: '/',
    },
  })
}

export async function requireUserSession(event: H3Event) {
  const config = getGuideConfig(event)
  const session = await useGuideSession(event)
  const { user, accessToken, tokenExpiresAt, lastValidatedAt } = session.data
  if (!user || !accessToken) {
    apiError(401, 'LOGIN_REQUIRED', `Please enter from the ${config.projectName} member center.`)
  }

  const now = Date.now()
  if (tokenExpiresAt && tokenExpiresAt <= now) {
    await session.clear()
    apiError(401, 'SESSION_EXPIRED', `The ${config.projectName} session has expired.`)
  }

  if (!lastValidatedAt || now - lastValidatedAt > 5 * 60 * 1000) {
    const current = await fetchCurrentSub2apiUser(event, accessToken)
    if (!current) {
      await session.clear()
      apiError(401, 'SESSION_INVALID', `The ${config.projectName} session is no longer valid.`)
    }
    await session.update({ user: current, lastValidatedAt: now })
    return { session, user: current, accessToken }
  }

  return { session, user, accessToken }
}

export async function requireAdminSession(event: H3Event) {
  const session = await useGuideSession(event)
  if (!session.data.admin) {
    apiError(401, 'ADMIN_LOGIN_REQUIRED', 'Administrator login is required.')
  }
  return session
}

export function jwtExpiresAt(token: string) {
  try {
    const payload = token.split('.')[1]
    if (!payload) return undefined
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const decoded = JSON.parse(Buffer.from(normalized, 'base64').toString('utf8'))
    return Number.isFinite(decoded.exp) ? Number(decoded.exp) * 1000 : undefined
  } catch {
    return undefined
  }
}
