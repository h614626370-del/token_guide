import type { H3Event } from 'h3'
import { fetchCurrentSub2apiUser } from './sub2api-auth'
import { jwtExpiresAt, useGuideSession } from './session'

export async function establishGuideSession(
  event: H3Event,
  token: string,
  expectedUserId?: string,
) {
  const user = await fetchCurrentSub2apiUser(event, token)
  if (!user) return null
  if (expectedUserId && expectedUserId !== user.id) return null

  const session = await useGuideSession(event)
  await session.update({
    user,
    accessToken: token,
    tokenExpiresAt: jwtExpiresAt(token),
    lastValidatedAt: Date.now(),
    admin: session.data.admin || false,
  })
  return user
}
