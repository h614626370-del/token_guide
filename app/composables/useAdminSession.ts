import type { ApiSuccess } from '~/types/api'
import { apiErrorMessage } from '~/types/api'

export function useAdminSessionState() {
  const guide = useGuideSessionState()
  const busy = useState('admin-session-busy', () => false)
  const loginError = useState('admin-session-error', () => '')

  async function login(token: string) {
    busy.value = true
    loginError.value = ''
    try {
      await $fetch<ApiSuccess<{ authenticated: boolean }>>('/api/session/admin', {
        method: 'POST',
        body: { token },
      })
      const next = await guide.refresh()
      if (!next?.admin) {
        loginError.value = '登录成功但会话未生效，请确认站点已使用 HTTPS，或刷新后重试。'
        return false
      }
      return true
    } catch (cause) {
      loginError.value = apiErrorMessage(cause, '管理员登录失败')
      return false
    } finally {
      busy.value = false
    }
  }

  async function logout() {
    busy.value = true
    try {
      await $fetch('/api/session/admin', { method: 'DELETE' })
      await guide.refresh()
    } finally {
      busy.value = false
    }
  }

  return { ...guide, busy, loginError, login, logout }
}
