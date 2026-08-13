import crypto from 'node:crypto'
import type { H3Event } from 'h3'
import { setHeader } from 'h3'
import { apiError } from './api'
import { getGuideConfig } from './config'
import { getTrustedClientIp } from './client-ip'

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()
const adminLoginBuckets = new Map<string, Bucket>()
const communityLikeBuckets = new Map<string, Bucket>()

export function enforceFeedbackRateLimit(event: H3Event) {
  const config = getGuideConfig(event)
  const now = Date.now()
  const ip = getTrustedClientIp(event) || 'unknown'
  const key = crypto
    .createHash('sha256')
    .update(`${config.ipHashSalt || 'dev-salt'}:${ip}`)
    .digest('hex')
  const current = buckets.get(key)

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + config.rateWindowMs })
    cleanup(now)
    return
  }

  current.count += 1
  if (current.count <= config.rateMax) return

  const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000))
  setHeader(event, 'retry-after', retryAfter)
  apiError(429, 'RATE_LIMITED', 'Too many feedback submissions.', { retry_after_seconds: retryAfter })
}

export function hashRequestIp(event: H3Event) {
  const config = getGuideConfig(event)
  const ip = getTrustedClientIp(event)
  if (!ip) return ''
  return crypto.createHash('sha256').update(`${config.ipHashSalt || 'dev-salt'}:${ip}`).digest('hex')
}

export function enforceAdminLoginRateLimit(event: H3Event) {
  const now = Date.now()
  const key = adminLoginKey(event)
  const current = adminLoginBuckets.get(key)

  if (!current || current.resetAt <= now) {
    adminLoginBuckets.set(key, { count: 1, resetAt: now + 15 * 60 * 1000 })
    cleanupBuckets(adminLoginBuckets, now)
    return
  }

  current.count += 1
  if (current.count <= 10) return
  const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000))
  setHeader(event, 'retry-after', retryAfter)
  apiError(429, 'ADMIN_LOGIN_RATE_LIMITED', 'Too many administrator login attempts.', { retry_after_seconds: retryAfter })
}

export function clearAdminLoginRateLimit(event: H3Event) {
  adminLoginBuckets.delete(adminLoginKey(event))
}

export function enforceCommunityLikeRateLimit(event: H3Event, userId: string) {
  const config = getGuideConfig(event)
  const now = Date.now()
  const key = `community-like:${userId}`
  const current = communityLikeBuckets.get(key)

  if (!current || current.resetAt <= now) {
    communityLikeBuckets.set(key, { count: 1, resetAt: now + config.communityLikeWindowMs })
    cleanupBuckets(communityLikeBuckets, now)
    return
  }

  current.count += 1
  if (current.count <= config.communityLikeMax) return

  const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000))
  setHeader(event, 'retry-after', retryAfter)
  apiError(429, 'COMMUNITY_LIKE_RATE_LIMITED', '点赞操作过于频繁，请稍后再试。', { retry_after_seconds: retryAfter })
}

function adminLoginKey(event: H3Event) {
  const ip = getTrustedClientIp(event) || 'unknown'
  return crypto.createHash('sha256').update(`admin-login:${ip}`).digest('hex')
}

function cleanup(now: number) {
  cleanupBuckets(buckets, now)
}

function cleanupBuckets(store: Map<string, Bucket>, now: number) {
  if (store.size < 1000) return
  for (const [key, bucket] of store) {
    if (bucket.resetAt <= now) store.delete(key)
  }
  while (store.size > 5000) {
    const key = store.keys().next().value
    if (!key) break
    store.delete(key)
  }
}
