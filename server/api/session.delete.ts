import { defineEventHandler } from 'h3'
import { apiOk } from '../utils/api'
import { useGuideSession } from '../utils/session'

export default defineEventHandler(async (event) => {
  const session = await useGuideSession(event)
  await session.clear()
  return apiOk({ cleared: true })
})
