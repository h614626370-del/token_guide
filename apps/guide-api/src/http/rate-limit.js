import { getClientIp, hashIp } from './request.js'
import { fail } from './responses.js'

export function createMemoryRateLimiter(config) {
  const buckets = new Map()
  const maxBuckets = 5000

  return async function rateLimit(request, reply) {
    const now = Date.now()
    const ip = getClientIp(request, config.trustProxy)
    const key = hashIp(ip, config.ipHashSalt) || 'unknown'
    const current = buckets.get(key)

    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + config.rateWindowMs })
      if (buckets.size >= 1000) cleanupBuckets(buckets, now, maxBuckets)
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

function cleanupBuckets(buckets, now, maxBuckets) {
  for (const [key, value] of buckets.entries()) {
    if (value.resetAt <= now) buckets.delete(key)
  }
  while (buckets.size > maxBuckets) {
    const oldestKey = buckets.keys().next().value
    if (oldestKey == null) break
    buckets.delete(oldestKey)
  }
}
