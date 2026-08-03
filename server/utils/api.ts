import { createError } from 'h3'

export function apiOk<T>(data: T, meta?: Record<string, unknown>) {
  return {
    ok: true as const,
    data,
    ...(meta ? { meta } : {}),
  }
}

export function apiError(
  statusCode: number,
  code: string,
  statusMessage: string,
  details?: unknown,
): never {
  throw createError({
    statusCode,
    statusMessage,
    data: {
      code,
      ...(details === undefined ? {} : { details }),
    },
  })
}
