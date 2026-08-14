<script setup lang="ts">
import { ArrowUpRight, Brain, Crosshair, Gamepad2, Map, Play, Search, Sparkles, Swords, Users } from 'lucide-vue-next'
import type { ApiSuccess } from '~/types/api'
import { apiErrorMessage } from '~/types/api'
import type { GameCategory, GameCounts, GameItem } from '~/types/games'

const props = defineProps<{ category?: GameCategory }>()
const site = useSiteConfigState()
const query = ref('')
const sort = ref<'recommended' | 'recent' | 'online'>('recommended')
const loading = ref(true)
const loadError = ref<unknown>(null)
let loadSequence = 0
let searchDebounceTimer: ReturnType<typeof setTimeout> | undefined
let presenceRefreshTimer: ReturnType<typeof setInterval> | undefined

const categories: Array<{ key: GameCategory | 'all', label: string, to: string, icon: typeof Gamepad2 }> = [
  { key: 'all', label: '全部游戏', to: '/games', icon: Gamepad2 },
  { key: 'board', label: '棋类对战', to: '/games/category/board', icon: Swords },
  { key: 'arcade', label: '街机休闲', to: '/games/category/arcade', icon: Sparkles },
  { key: 'puzzle', label: '益智拼图', to: '/games/category/puzzle', icon: Brain },
  { key: 'training', label: '训练工具', to: '/games/category/training', icon: Crosshair },
  { key: 'adventure', label: '冒险闯关', to: '/games/category/adventure', icon: Map },
]

const activeCategory = computed<GameCategory | 'all'>(() => props.category || 'all')
const requestQuery = computed(() => ({
  ...(props.category ? { category: props.category } : {}),
  ...(query.value.trim() ? { q: query.value.trim() } : {}),
  sort: sort.value,
}))
const { data: initialData } = await useAsyncData<ApiSuccess<GameItem[]>>(
  `games-${activeCategory.value}`,
  () => $fetch<ApiSuccess<GameItem[]>>('/api/games', { query: requestQuery.value }),
)
const items = ref<GameItem[]>(initialData.value?.data || [])
const counts = ref<GameCounts>((initialData.value?.meta?.counts as GameCounts | undefined) || {
  all: 0,
  board: 0,
  arcade: 0,
  puzzle: 0,
  training: 0,
  adventure: 0,
})

async function loadGames() {
  const sequence = ++loadSequence
  loading.value = true
  loadError.value = null
  try {
    const response = await $fetch<ApiSuccess<GameItem[]>>('/api/games', { query: requestQuery.value })
    if (sequence !== loadSequence) return
    items.value = response.data
    counts.value = (response.meta?.counts as GameCounts | undefined) || counts.value
  } catch (cause) {
    if (sequence !== loadSequence) return
    loadError.value = cause
  } finally {
    if (sequence === loadSequence) loading.value = false
  }
}

function scheduleLoadGames() {
  clearTimeout(searchDebounceTimer)
  searchDebounceTimer = setTimeout(() => { void loadGames() }, 280)
}

watch(query, scheduleLoadGames)
watch(sort, () => { void loadGames() })
watch(() => props.category, () => { void loadGames() })
onMounted(() => {
  loading.value = false
  presenceRefreshTimer = setInterval(() => {
    if (document.visibilityState === 'visible') void loadGames()
  }, 30_000)
})
onBeforeUnmount(() => {
  clearTimeout(searchDebounceTimer)
  if (presenceRefreshTimer) clearInterval(presenceRefreshTimer)
})

function categoryLabel(category: GameCategory) {
  return categories.find(item => item.key === category)?.label || '游戏'
}

function gameInitial(game: GameItem) {
  return game.name.slice(0, 1)
}

useSeoMeta({
  title: props.category ? `${categoryLabel(props.category)} - 小游戏` : '小游戏',
  description: `浏览 ${site.value.project_name} 收录的中文网页小游戏，打开页面即可游玩。`,
})
</script>

<template>
  <div class="games-page">
    <div class="games-page__inner">
      <header class="games-heading">
        <div>
          <span>游戏空间</span>
          <h1>小游戏</h1>
          <p>中文网页小游戏，资源本地运行，打开就能玩。</p>
        </div>
        <div class="games-heading__stat">
          <strong>{{ counts.all }}</strong>
          <span>已上架</span>
        </div>
      </header>

      <nav class="games-tabs" aria-label="游戏分类">
        <NuxtLink
          v-for="item in categories"
          :key="item.key"
          :to="item.to"
          :aria-current="activeCategory === item.key ? 'page' : undefined"
        >
          <component :is="item.icon" :size="17" />
          <span>{{ item.label }}</span>
          <small>{{ counts[item.key] }}</small>
        </NuxtLink>
      </nav>

      <div class="games-toolbar">
        <label class="games-search">
          <Search :size="17" aria-hidden="true" />
          <input v-model="query" type="search" maxlength="80" placeholder="搜索游戏名称、简介或标签" aria-label="搜索游戏">
        </label>
        <label class="games-sort">
          <span>排序</span>
          <select v-model="sort" aria-label="游戏排序">
            <option value="recommended">推荐</option>
            <option value="online">当前在线</option>
            <option value="recent">最近上架</option>
          </select>
        </label>
      </div>

      <div v-if="loadError" class="tool-alert tool-alert--error">{{ apiErrorMessage(loadError, '小游戏读取失败。') }}</div>

      <section class="games-grid" :aria-busy="loading">
        <article v-for="game in items" :key="game.id" class="game-card">
          <header class="game-card__header">
            <div class="game-card__icon">
              <img v-if="game.cover_url" :src="game.cover_url" :alt="`${game.name} 封面`" loading="lazy">
              <span v-else aria-hidden="true">{{ gameInitial(game) }}</span>
            </div>
            <div class="game-card__title">
              <div><h2>{{ game.name }}</h2><span v-if="game.is_featured">精选</span></div>
              <small>{{ categoryLabel(game.category) }}</small>
            </div>
          </header>

          <p>{{ game.summary }}</p>
          <div v-if="game.tags.length" class="game-tags" aria-label="游戏标签">
            <span v-for="tag in game.tags" :key="tag">{{ tag }}</span>
          </div>
          <div class="game-card__status">
            <span><Users :size="15" />{{ game.online_count }} 人在线</span>
            <span v-if="game.compatibility">{{ game.compatibility }}</span>
          </div>
          <footer class="game-card__footer">
            <NuxtLink class="primary-command game-card__play" :to="`/games/${game.slug}`"><Play :size="15" />开始游戏</NuxtLink>
            <a :href="game.official_url" target="_blank" rel="noopener noreferrer" title="查看源项目"><ArrowUpRight :size="16" /></a>
          </footer>
        </article>

        <div v-if="loading && !items.length" class="games-empty">正在读取小游戏...</div>
        <div v-else-if="!items.length && !loadError" class="games-empty">
          <Search :size="22" />
          <strong>{{ query ? '没有找到匹配的游戏' : '这个分类还没有上架游戏' }}</strong>
          <p>{{ query ? '换一个名称或标签试试。' : '管理员发布后会显示在这里。' }}</p>
        </div>
      </section>
    </div>
  </div>
</template>
