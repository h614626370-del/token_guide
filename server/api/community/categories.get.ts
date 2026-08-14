import { defineEventHandler } from 'h3'
import { listPublicCommunityCategories } from '../../domain/community/service'
import { apiOk } from '../../utils/api'

export default defineEventHandler(() => apiOk(listPublicCommunityCategories()))
