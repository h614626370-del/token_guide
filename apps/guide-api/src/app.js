import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import { fail } from './http/responses.js'
import { feedbackRoutes } from './modules/feedback/routes.js'
import { pricingRoutes } from './modules/pricing/routes.js'
import { systemRoutes } from './modules/system/routes.js'

export async function createApp({ config, db }) {
  const app = Fastify({
    bodyLimit: config.bodyLimitBytes,
    logger: {
      level: config.logLevel,
      redact: ['req.headers.authorization', 'req.headers.cookie', 'req.headers.x-admin-token', 'req.headers.x-api-key'],
    },
    trustProxy: config.trustProxy,
  })

  await app.register(helmet, {
    contentSecurityPolicy: false,
  })

  await app.register(cors, {
    origin(origin, cb) {
      if (!origin) return cb(null, true)
      if (config.corsOrigins.includes('*') || config.corsOrigins.includes(origin)) {
        return cb(null, true)
      }
      return cb(null, false)
    },
  })

  app.setErrorHandler((error, _request, reply) => {
    app.log.error(error)
    if (error.statusCode === 413) {
      return fail(reply, 413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.')
    }
    return fail(reply, error.statusCode || 500, 'INTERNAL_ERROR', 'Internal server error.')
  })

  app.setNotFoundHandler((request, reply) => {
    return fail(reply, 404, 'NOT_FOUND', `Route ${request.method} ${request.url} was not found.`)
  })

  await app.register(systemRoutes, { prefix: config.apiPrefix, db, config })
  await app.register(feedbackRoutes, { prefix: config.apiPrefix, db, config })
  await app.register(pricingRoutes, { prefix: config.apiPrefix, db, config })

  return app
}
