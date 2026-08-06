import type { H3Event } from 'h3'

export const CODEX_PROVIDER_ID = 'custom'

export function getInstallerBaseUrl(event: H3Event) {
  const config = useRuntimeConfig(event)
  const publicConfig = config.public as { sub2apiOrigin?: string }
  return String(publicConfig.sub2apiOrigin || '').trim().replace(/\/+$/, '')
}
