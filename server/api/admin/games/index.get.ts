import { defineEventHandler } from 'h3'
import { listAdminGames } from '../../../domain/games/service'
import { apiOk } from '../../../utils/api'
import { requireAdminSession } from '../../../utils/session'

export default defineEventHandler(async (event) => {
  await requireAdminSession(event)
  return apiOk(listAdminGames())
})
