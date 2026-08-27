import { defineEventHandler, getRequestHeader, setHeader } from 'h3'
import { apiOk } from '../utils/api'
import { useModelPricingService } from '../utils/model-pricing'
import { getPublicSiteConfig } from '../utils/site-config'

export default defineEventHandler(async (event) => {
  const requestOrigin = getRequestHeader(event, 'origin') || ''
  const mainSiteOrigin = new URL(getPublicSiteConfig(event).main_site_url).origin
  if (requestOrigin === mainSiteOrigin) {
    setHeader(event, 'access-control-allow-origin', mainSiteOrigin)
    setHeader(event, 'vary', 'Origin')
  }
  return apiOk(await useModelPricingService().getCatalog({ preferSnapshot: true }))
})
