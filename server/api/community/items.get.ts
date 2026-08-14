import { defineEventHandler, getQuery } from 'h3'
import { getCommunityCategoryBySlug, isCommunityCategorySlug, listPublishedCommunityItems } from '../../domain/community/service'
import { apiError, apiOk } from '../../utils/api'
import { useGuideSession } from '../../utils/session'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const categoryValue = Array.isArray(query.category) ? query.category[0] : query.category
  const sortValue = Array.isArray(query.sort) ? query.sort[0] : query.sort
  const searchValue = Array.isArray(query.q) ? query.q[0] : query.q
  if (categoryValue && (!isCommunityCategorySlug(categoryValue) || !getCommunityCategoryBySlug(categoryValue))) {
    apiError(400, 'INVALID_COMMUNITY_CATEGORY', '社区分类无效。')
  }
  if (sortValue && !['recommended', 'popular', 'recent'].includes(String(sortValue))) {
    apiError(400, 'INVALID_COMMUNITY_SORT', '社区排序方式无效。')
  }

  const session = await useGuideSession(event)
  const authenticated = Boolean(session.data.user && session.data.accessToken)
  const result = listPublishedCommunityItems({
    category: categoryValue || undefined,
    query: typeof searchValue === 'string' ? searchValue : undefined,
    sort: (sortValue || 'recommended') as 'recommended' | 'popular' | 'recent',
    userId: authenticated ? session.data.user?.id : undefined,
  })
  return apiOk(result.items, {
    counts: result.counts,
    categories: result.categories,
    authenticated,
  })
})
