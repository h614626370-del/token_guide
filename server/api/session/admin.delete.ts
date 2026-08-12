import { defineEventHandler } from 'h3'
import { apiOk } from '../../utils/api'
import { useAdminSession } from '../../utils/session'

export default defineEventHandler(async (event) => {
  const session = await useAdminSession(event)
  await session.clear()
  return apiOk({ authenticated: false })
})
