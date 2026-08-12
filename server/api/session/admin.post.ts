import crypto from 'node:crypto'
import { defineEventHandler } from 'h3'
import { z } from 'zod'
import { apiError, apiOk } from '../../utils/api'
import { getGuideConfig } from '../../utils/config'
import { clearAdminLoginRateLimit, enforceAdminLoginRateLimit } from '../../utils/rate-limit'
import { readLimitedJson } from '../../utils/request-body'
import { useAdminSession } from '../../utils/session'

const loginSchema = z.object({ token: z.string().min(1).max(512) }).strict()

export default defineEventHandler(async (event) => {
  enforceAdminLoginRateLimit(event)
  const parsed = loginSchema.safeParse(await readLimitedJson(event, 4096))
  if (!parsed.success) apiError(400, 'INVALID_ADMIN_LOGIN', 'Administrator login payload is invalid.')
  const supplied = parsed.data.token
  const expected = getGuideConfig(event).adminToken
  if (!expected || !safeEqual(supplied, expected)) {
    apiError(401, 'INVALID_ADMIN_TOKEN', 'Administrator token is invalid.')
  }
  clearAdminLoginRateLimit(event)

  const session = await useAdminSession(event)
  await session.update({ authenticated: true })
  return apiOk({ authenticated: true })
})

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}
