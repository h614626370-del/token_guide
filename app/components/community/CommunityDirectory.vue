<script setup lang="ts">
import { ArrowUpRight, Bot, Box, Heart, Package, Search, SlidersHorizontal, Sparkles, Wrench } from 'lucide-vue-next'
import type { ApiSuccess } from '~/types/api'
import { apiErrorMessage } from '~/types/api'
import type { CommunityCategory, CommunityCounts, CommunityItem } from '~/types/community'

const props = defineProps<{ category?: CommunityCategory }>()
const site = useSiteConfigState()
const guideSession = useGuideSessionState()
const query = ref('')
const sort = ref<'recommended' | 'popular' | 'recent'>('recommended')
const notice = ref('')
const liking = ref<number | null>(null)
const brokenIcons = reactive<Record<number, boolean>>({})
const loading = ref(true)
const loadError = ref<unknown>(null)
let loadSequence = 0
let searchDebounceTimer: ReturnType<typeof setTimeout> | undefined

const categories: Array<{ key: CommunityCategory | 'all', label: string, to: string, icon: typeof Wrench }> = [
  { key: 'all', label: '全部', to: '/community', icon: Sparkles },
  { key: 'tools', label: '开源工具', to: '/community/tools', icon: Wrench },
  { key: 'skills', label: 'Skills', to: '/community/skills', icon: Box },
  { key: 'mcp', label: 'MCP', to: '/community/mcp', icon: SlidersHorizontal },
  { key: 'agent', label: 'Agent', to: '/community/agent', icon: Bot },
  { key: 'plugin', label: 'Plugin', to: '/community/plugin', icon: Package },
]

const activeCategory = computed<CommunityCategory | 'all'>(() => props.category || 'all')
const requestQuery = computed(() => ({
  ...(props.category ? { category: props.category } : {}),
  ...(query.value.trim() ? { q: query.value.trim() } : {}),
  sort: sort.value,
}))
const { data: initialData } = await useAsyncData<ApiSuccess<CommunityItem[]>>(
  `community-${activeCategory.value}`,
  () => $fetch<ApiSuccess<CommunityItem[]>>('/api/community/items', { query: requestQuery.value }),
)
const items = ref<CommunityItem[]>(initialData.value?.data || [])
const counts = ref<CommunityCounts>((initialData.value?.meta?.counts as CommunityCounts | undefined) || {
  all: 0,
  tools: 0,
  skills: 0,
  mcp: 0,
  agent: 0,
  plugin: 0,
})
const authenticated = computed(() => guideSession.initialized.value
  ? Boolean(guideSession.session.value?.authenticated)
  : Boolean(initialData.value?.meta?.authenticated))

async function loadItems() {
  const sequence = ++loadSequence
  loading.value = true
  loadError.value = null
  try {
    const response = await $fetch<ApiSuccess<CommunityItem[]>>('/api/community/items', { query: requestQuery.value })
    if (sequence !== loadSequence) return
    items.value = response.data
    counts.value = (response.meta?.counts as CommunityCounts | undefined) || counts.value
  } catch (cause) {
    if (sequence !== loadSequence) return
    loadError.value = cause
  } finally {
    if (sequence === loadSequence) loading.value = false
  }
}

onMounted(() => {
  void guideSession.ensureLoaded()
  loading.value = false
})

function scheduleLoadItems() {
  clearTimeout(searchDebounceTimer)
  searchDebounceTimer = setTimeout(() => { void loadItems() }, 280)
}

watch(query, scheduleLoadItems)
watch(sort, () => { void loadItems() })
watch(() => props.category, () => { void loadItems() })

onBeforeUnmount(() => clearTimeout(searchDebounceTimer))

async function toggleLike(item: CommunityItem) {
  notice.value = ''
  if (!authenticated.value) {
    notice.value = `请先登录 ${site.value.project_name} 账号后点赞。`
    return
  }
  if (liking.value !== null) return
  liking.value = item.id
  try {
    const response = await $fetch<ApiSuccess<CommunityItem>>(`/api/community/items/${item.id}/like`, {
      method: item.liked ? 'DELETE' : 'POST',
    })
    Object.assign(item, response.data)
  } catch (cause) {
    notice.value = apiErrorMessage(cause, '点赞操作失败，请稍后重试。')
    if ((cause as any)?.status === 401 || (cause as any)?.statusCode === 401) {
      await guideSession.refresh()
    }
  } finally {
    liking.value = null
  }
}

function itemInitial(item: CommunityItem) {
  return item.name.slice(0, 1).toUpperCase()
}

function handleIconError(item: CommunityItem) {
  brokenIcons[item.id] = true
}

useSeoMeta({
  title: props.category ? `${categories.find(item => item.key === props.category)?.label} - 社区` : '社区',
  description: `浏览 ${site.value.project_name} 社区整理的开源工具、Skills、MCP、Agent 与 Plugin。`,
})
</script>

<template>
  <div class="community-page">
    <div class="community-page__inner">
      <header class="community-heading">
        <div>
          <span>Community directory</span>
          <h1>社区资源库</h1>
          <p>发现值得关注的开源工具、Skills、MCP、Agent 与 Plugin。</p>
        </div>
        <div class="community-heading__stat">
          <strong>{{ counts.all }}</strong>
          <span>已收录</span>
        </div>
      </header>

      <nav class="community-tabs" aria-label="社区分类">
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

      <div class="community-toolbar">
        <label class="community-search">
          <Search :size="17" aria-hidden="true" />
          <input v-model="query" type="search" maxlength="80" placeholder="搜索名称、简介或标签" aria-label="搜索社区资源">
        </label>
        <label class="community-sort">
          <span>排序</span>
          <select v-model="sort" aria-label="社区资源排序">
            <option value="recommended">推荐</option>
            <option value="popular">点赞最多</option>
            <option value="recent">最近收录</option>
          </select>
        </label>
      </div>

      <div v-if="notice" class="community-notice">
        <span>{{ notice }}</span>
        <a v-if="!authenticated" :href="site.login_url">前往登录 <ArrowUpRight :size="14" /></a>
      </div>
      <div v-if="loadError" class="tool-alert tool-alert--error">{{ apiErrorMessage(loadError, '社区资源读取失败。') }}</div>

      <section class="community-grid" :aria-busy="loading">
        <article v-for="item in items" :key="item.id" class="community-card">
          <header>
            <div class="community-card__icon">
              <img v-if="item.icon_url && !brokenIcons[item.id]" :src="item.icon_url" :alt="`${item.name} 图标`" loading="lazy" @error="handleIconError(item)">
              <span v-else aria-hidden="true">{{ itemInitial(item) }}</span>
            </div>
            <div class="community-card__title">
              <div>
                <h2>{{ item.name }}</h2>
                <span v-if="item.is_featured">精选</span>
              </div>
              <small>{{ categories.find(category => category.key === item.category)?.label }}</small>
            </div>
          </header>

          <NuxtLink class="community-card__overlay-link" :to="`/community/${item.category}/${item.slug}`" :aria-label="`查看 ${item.name} 详情`" />

          <p>{{ item.summary }}</p>
          <div v-if="item.tags.length" class="community-tags" aria-label="标签">
            <span v-for="tag in item.tags" :key="tag">{{ tag }}</span>
          </div>
          <div v-if="item.compatibility" class="community-card__compatibility">{{ item.compatibility }}</div>

          <footer>
            <a :href="item.official_url" target="_blank" rel="noopener noreferrer">
              官方地址
              <ArrowUpRight :size="15" />
            </a>
            <button
              type="button"
              :class="['community-like', { 'is-liked': item.liked }]"
              :disabled="liking !== null"
              :title="item.liked ? '取消点赞' : '点赞'"
              :aria-label="`${item.liked ? '取消点赞' : '点赞'} ${item.name}`"
              @click="toggleLike(item)"
            >
              <Heart :size="17" :fill="item.liked ? 'currentColor' : 'none'" />
              <span>{{ item.like_count }}</span>
            </button>
          </footer>
        </article>

        <div v-if="loading && !items.length" class="community-empty">正在读取社区资源...</div>
        <div v-else-if="!items.length && !loadError" class="community-empty">
          <Search :size="22" />
          <strong>{{ query ? '没有找到匹配的资源' : '这个分类还没有公开条目' }}</strong>
          <p>{{ query ? '换一个名称或标签试试。' : '新内容整理完成后会出现在这里。' }}</p>
        </div>
      </section>
    </div>
  </div>
</template>
