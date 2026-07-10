import { ok } from '../../http/responses.js'

export async function systemRoutes(app, { db, config }) {
  app.get('/health', async (_request, reply) => {
    db.prepare('SELECT 1').get()
    return ok(reply, {
      service: 'kkflow-guide-api',
      status: 'ok',
      uptime_seconds: Math.round(process.uptime()),
      api_prefix: config.apiPrefix,
    })
  })

  app.get('/meta', async (_request, reply) => {
    return ok(reply, {
      service: 'kkflow-guide-api',
      public_origin: config.publicOrigin,
      features: {
        feedback: true,
        pricing: true,
      },
    })
  })
}
