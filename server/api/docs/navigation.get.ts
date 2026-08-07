import { defineEventHandler } from 'h3'
import { createDocsRepository } from '../../domain/docs/repository'
import { apiOk } from '../../utils/api'
import { useGuideDatabase } from '../../utils/database'

export default defineEventHandler(() => apiOk(createDocsRepository(useGuideDatabase()).getNavigation()))
