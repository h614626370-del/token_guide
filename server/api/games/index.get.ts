import { defineEventHandler, getQuery } from 'h3'
import { isGameCategory, listPublishedGames } from '../../domain/games/service'
import { apiError, apiOk } from '../../utils/api'

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const categoryValue = String(query.category || '').trim()
  const sortValue = String(query.sort || 'recommended').trim()
  if (categoryValue && !isGameCategory(categoryValue)) apiError(400, 'INVALID_GAME_CATEGORY', '游戏分类无效。')
  if (!['recommended', 'recent', 'online'].includes(sortValue)) apiError(400, 'INVALID_GAME_SORT', '游戏排序方式无效。')
  const category = isGameCategory(categoryValue) ? categoryValue : undefined
  const result = listPublishedGames({
    category,
    query: String(query.q || '').trim(),
    sort: sortValue as 'recommended' | 'recent' | 'online',
  })
  return apiOk(result.items, { counts: result.counts })
})
