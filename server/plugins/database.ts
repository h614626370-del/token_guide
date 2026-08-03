import { closeGuideDatabase, useGuideDatabase } from '../utils/database'
import { warmSiteSettingsCache } from '../utils/site-config'

export default defineNitroPlugin((nitroApp) => {
  useGuideDatabase()
  warmSiteSettingsCache()
  nitroApp.hooks.hook('close', () => {
    closeGuideDatabase()
  })
})
