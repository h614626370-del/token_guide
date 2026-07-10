export const ADMIN_TOKEN_STORAGE_KEY = 'guide_api_admin_token'

export function readAdminToken() {
  return readStorage('localStorage')?.getItem(ADMIN_TOKEN_STORAGE_KEY)
    || readStorage('sessionStorage')?.getItem(ADMIN_TOKEN_STORAGE_KEY)
    || ''
}

export function isAdminTokenRemembered() {
  return Boolean(readStorage('localStorage')?.getItem(ADMIN_TOKEN_STORAGE_KEY))
}

export function saveAdminToken(token: string, remember: boolean) {
  const value = token.trim()
  if (!value) return clearAdminToken()

  const local = readStorage('localStorage')
  const session = readStorage('sessionStorage')
  if (remember) {
    local?.setItem(ADMIN_TOKEN_STORAGE_KEY, value)
    session?.removeItem(ADMIN_TOKEN_STORAGE_KEY)
  } else {
    session?.setItem(ADMIN_TOKEN_STORAGE_KEY, value)
    local?.removeItem(ADMIN_TOKEN_STORAGE_KEY)
  }
  notifyTokenChange()
}

export function clearAdminToken() {
  readStorage('localStorage')?.removeItem(ADMIN_TOKEN_STORAGE_KEY)
  readStorage('sessionStorage')?.removeItem(ADMIN_TOKEN_STORAGE_KEY)
  notifyTokenChange()
}

export function readStorage(name: 'localStorage' | 'sessionStorage') {
  if (typeof window === 'undefined') return null
  try {
    return window[name]
  } catch {
    return null
  }
}

function notifyTokenChange() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('guide-admin-token-updated'))
}
