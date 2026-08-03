import { defineEventHandler } from 'h3'
import { apiOk } from '../utils/api'
import { getPublicSiteConfig } from '../utils/site-config'

export default defineEventHandler(event => apiOk(getPublicSiteConfig(event)))
