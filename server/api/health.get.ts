import { defineEventHandler } from 'h3'
import { apiOk } from '../utils/api'
import { useGuideDatabase } from '../utils/database'

export default defineEventHandler(() => {
  useGuideDatabase().prepare('SELECT 1').get()
  return apiOk({
    service: 'kkflow-guide',
    status: 'ok',
    uptime_seconds: Math.round(process.uptime()),
  })
})
