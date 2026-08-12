import type { H3Event } from 'h3'
import { getRequestHeader, getRequestURL, useSession } from 'h3'
import { apiError } from './api'
import { getGuideConfig } from './config'
import { fetchCurrentSub2apiUser } from './sub2api-auth'

function requestIsHttps(event: H3Event) {
  if (getRequestURL(event).protocol === 'https:') return true
  const forwarded = String(getRequestHeader(event, 'x-forwarded-proto') || '')
    .split(',')[0]
    ?.trim()
    .toLowerCase()
  return forwarded === 'https'
}

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
}

export interface AdminSessionData {
  authenticated?: boolean
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
  return useSession<GuideSessionData>(event, sessionOptions(event, 'guide_session', 12 * 60 * 60))
}

export function useAdminSession(event: H3Event) {
  return useSession<AdminSessionData>(event, sessionOptions(event, 'guide_admin_session', 7 * 24 * 60 * 60))
}

function sessionOptions(event: H3Event, name: string, maxAge: number) {
  const config = getGuideConfig(event)
  // __Host- + Secure 只能在 HTTPS 下使用；HTTP 反代未配 TLS 时回退普通 Cookie，避免登录态丢失
  const https = requestIsHttps(event)
  return {
    password: sessionPassword(event),
    name: https && config.isProduction ? `__Host-${name}` : name,
    maxAge,
    cookie: {
      httpOnly: true,
      secure: https,
      sameSite: 'lax' as const,
      path: '/',
    },
  }
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
  const session = await useAdminSession(event)
  if (!session.data.authenticated) {
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
