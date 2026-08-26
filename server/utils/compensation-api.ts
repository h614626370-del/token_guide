import { apiError } from './api'

export function throwCompensationError(error: unknown): never {
  const code = error && typeof error === 'object' && 'code' in error
    ? String((error as { code?: unknown }).code || '')
    : ''
  const message = error instanceof Error ? error.message : 'Compensation request failed.'
  const status = code === 'COMPENSATION_USER_NOT_FOUND'
    ? 404
    : code === 'COMPENSATION_PREVIEW_STALE'
      || code === 'COMPENSATION_ALREADY_COMPLETED'
      || code === 'COMPENSATION_USER_AMBIGUOUS'
    ? 409
    : code.startsWith('COMPENSATION_')
      ? 400
      : 502
  apiError(status, code || 'COMPENSATION_UPSTREAM_FAILED', message)
}
