import { closeGuideDatabase, useGuideDatabase } from '../utils/database'
import { warmSiteSettingsCache } from '../utils/site-config'
import { startUpstreamMonitoring } from '../utils/upstreams'

export default defineNitroPlugin((nitroApp) => {
  useGuideDatabase()
  warmSiteSettingsCache()
  const stopMonitoring = startUpstreamMonitoring()
  nitroApp.hooks.hook('close', async () => {
    await stopMonitoring()
    closeGuideDatabase()
  })
})
