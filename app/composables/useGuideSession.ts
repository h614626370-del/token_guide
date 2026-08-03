import type { ApiSuccess, GuideSessionView } from '~/types/api'
import { apiErrorMessage } from '~/types/api'

export function useGuideSessionState() {
  const session = useState<GuideSessionView | null>('guide-session', () => null)
  const loading = useState('guide-session-loading', () => false)
  const error = useState('guide-session-error', () => '')

  async function refresh() {
    loading.value = true
    error.value = ''
    try {
      const response = await $fetch<ApiSuccess<GuideSessionView>>('/api/session')
      session.value = response.data
      return response.data
    } catch (cause) {
      session.value = null
      error.value = apiErrorMessage(cause, '登录状态读取失败')
      return null
    } finally {
      loading.value = false
    }
  }

  return { session, loading, error, refresh }
}
