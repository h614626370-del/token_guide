import { createApp } from './app.js'
import { config, configWarnings } from './config.js'
import { openDatabase } from './db/index.js'

const db = openDatabase(config.dbPath)
const app = await createApp({ config, db })

for (const warning of configWarnings) {
  app.log.warn(warning)
}

try {
  await app.listen({ host: config.host, port: config.port })
  app.log.info({
    service: 'kkflow-guide-api',
    address: `http://${config.host}:${config.port}${config.apiPrefix}`,
    db_path: config.dbPath,
  }, 'guide api started')
} catch (error) {
  app.log.error(error)
  db.close()
  process.exit(1)
}

async function shutdown(signal) {
  app.log.info({ signal }, 'shutting down guide api')
  try {
    await app.close()
  } finally {
    db.close()
  }
}

process.on('SIGINT', () => {
  void shutdown('SIGINT').then(() => process.exit(0))
})

process.on('SIGTERM', () => {
  void shutdown('SIGTERM').then(() => process.exit(0))
})
