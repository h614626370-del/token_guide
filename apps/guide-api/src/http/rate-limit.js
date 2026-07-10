import { getClientIp, hashIp } from './request.js'
import { fail } from './responses.js'

export function createMemoryRateLimiter(config) {
  const buckets = new Map()

  return async function rateLimit(request, reply) {
    const now = Date.now()
    const ip = getClientIp(request, config.trustProxy)
    const key = hashIp(ip, config.ipHashSalt) || 'unknown'
    const current = buckets.get(key)

    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + config.rateWindowMs })
      cleanupBuckets(buckets, now)
      return
    }

    current.count += 1
    if (current.count > config.rateMax) {
      const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000))
      reply.header('Retry-After', String(retryAfter))
      return fail(reply, 429, 'RATE_LIMITED', 'Too many feedback submissions. Please try again later.', {
        retry_after_seconds: retryAfter,
      })
    }
  }
}

function cleanupBuckets(buckets, now) {
  if (buckets.size < 1000) return
  for (const [key, value] of buckets.entries()) {
    if (value.resetAt <= now) buckets.delete(key)
  }
}
