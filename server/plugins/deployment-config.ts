import { syncManagedDeploymentConfig } from '../domain/update/deployment'
import { recordUpdateLog } from '../domain/update/service'

export default defineNitroPlugin(() => {
  if (process.env.NODE_ENV !== 'production') return

  const timer = setTimeout(() => {
    void syncManagedDeploymentConfig()
      .then((synced) => {
        if (synced) {
          recordUpdateLog('宿主机部署配置已自动同步。')
          console.info('Managed deployment configuration synchronized.')
        }
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error)
        recordUpdateLog(`宿主机部署配置自动同步失败：${message}`)
        console.warn('Managed deployment configuration sync failed:', message)
      })
  }, 1500)
  timer.unref()
})
