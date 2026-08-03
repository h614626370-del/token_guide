import type { H3Event } from 'h3'
import { getRequestHeader } from 'h3'
import type { GuideUser } from './session'
import { getGuideConfig } from './config'
import { getTrustedClientIp } from './client-ip'

export async function fetchCurrentSub2apiUser(event: H3Event, accessToken: string): Promise<GuideUser | null> {
  const config = getGuideConfig(event)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.pricingFetchTimeoutMs)
  const userAgent = getRequestHeader(event, 'user-agent') || 'kkflow-guide'
  const clientIp = getTrustedClientIp(event)

  try {
    const response = await fetch(`${config.sub2apiApiBase}/auth/me`, {
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${accessToken}`,
        'user-agent': userAgent,
        ...(clientIp ? { 'x-forwarded-for': clientIp, 'x-real-ip': clientIp } : {}),
      },
      signal: controller.signal,
    })
    if (!response.ok) return null
    const body = await response.json()
    return normalizeUser(unwrapResponse(body))
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

function unwrapResponse(body: any) {
  if (body && typeof body === 'object') {
    if ('code' in body) return body.code === 0 ? body.data : null
    if (body.ok === true && 'data' in body) return body.data
  }
  return body
}

function normalizeUser(value: any): GuideUser | null {
  const id = value?.id ?? value?.user_id
  if (id === undefined || id === null || id === '') return null
  return {
    id: String(id),
    email: String(value.email || ''),
    username: String(value.username || value.name || value.display_name || ''),
    role: String(value.role || ''),
  }
}
