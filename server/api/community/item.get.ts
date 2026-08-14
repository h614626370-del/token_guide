import { defineEventHandler, getQuery } from 'h3'
import { getCommunityItemBySlug, isCommunityCategorySlug } from '../../domain/community/service'
import { apiError, apiOk } from '../../utils/api'
import { useGuideSession } from '../../utils/session'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const category = Array.isArray(query.category) ? query.category[0] : query.category
  const slug = Array.isArray(query.slug) ? query.slug[0] : query.slug
  if (!isCommunityCategorySlug(category) || typeof slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    apiError(400, 'INVALID_COMMUNITY_PATH', '社区条目地址无效。')
  }

  const session = await useGuideSession(event)
  const authenticated = Boolean(session.data.user && session.data.accessToken)
  const item = getCommunityItemBySlug(category, slug, authenticated ? session.data.user?.id : undefined)
  if (!item) apiError(404, 'COMMUNITY_ITEM_NOT_FOUND', '社区条目不存在或尚未发布。')
  return apiOk(item, { authenticated })
})
