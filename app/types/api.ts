export interface ApiSuccess<T> {
  ok: true
  data: T
  meta?: Record<string, any>
}

export interface GuideUser {
  id: string
  email: string
  username: string
  role: string
}

export interface GuideSessionView {
  authenticated: boolean
  admin: boolean
  user: GuideUser | null
  token_expires_at: number | null
}

export function apiErrorMessage(error: unknown, fallback: string) {
  const value = error as any
  return value?.data?.statusMessage
    || value?.data?.message
    || value?.data?.data?.message
    || value?.message
    || fallback
}

export function apiErrorCode(error: unknown) {
  const value = error as any
  return value?.data?.data?.code || value?.data?.code || ''
}

export function apiErrorDetails(error: unknown) {
  const value = error as any
  return value?.data?.data?.details || value?.data?.details || null
}
