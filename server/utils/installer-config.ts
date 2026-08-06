import type { H3Event } from 'h3'
import { getGuideConfig } from './config'

export const CODEX_PROVIDER_ID = 'custom'

export function getInstallerBaseUrl(event: H3Event) {
  return getGuideConfig(event).sub2apiOrigin
}
