import { defineEventHandler } from 'h3'
import { apiOk } from '../utils/api'
import { getGuideConfig } from '../utils/config'

export default defineEventHandler((event) => {
  const config = getGuideConfig(event)
  return apiOk({
    service: 'kkflow-guide',
    project: config.projectName,
    name: config.siteName,
    origin: config.siteUrl,
    upstream: config.sub2apiOrigin,
    features: {
      content: true,
      playground: true,
      pricing: true,
      feedback: true,
      administration: true,
      embedded_login: true,
    },
  })
})
