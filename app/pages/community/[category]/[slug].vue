<script setup lang="ts">
import { ArrowLeft, ArrowUpRight, Heart } from 'lucide-vue-next'
import type { ApiSuccess } from '~/types/api'
import type { CommunityItem } from '~/types/community'
import { apiErrorMessage } from '~/types/api'

const route = useRoute()
const site = useSiteConfigState()
const guideSession = useGuideSessionState()
const notice = ref('')
const liking = ref(false)
const category = computed(() => String(route.params.category))
const slug = computed(() => String(route.params.slug))

const { data, error } = await useFetch<ApiSuccess<CommunityItem>>(
  () => '/api/community/item',
  { query: () => ({ category: category.value, slug: slug.value }), key: () => `community-detail-${category.value}-${slug.value}` },
)
const item = computed(() => data.value?.data || null)
const activeImage = ref(0)
const authenticated = computed(() => guideSession.initialized.value
  ? Boolean(guideSession.session.value?.authenticated)
  : Boolean(data.value?.meta?.authenticated))

if (error.value || !item.value) {
  throw createError({ statusCode: 404, statusMessage: '社区条目不存在' })
}

useSeoMeta({
  title: () => item.value?.name || '社区资源详情',
  description: () => item.value?.summary || '',
})

onMounted(() => { void guideSession.ensureLoaded() })

async function toggleLike() {
  if (!item.value || liking.value) return
  if (!authenticated.value) {
    notice.value = `请先登录 ${site.value.project_name} 账号后点赞。`
    return
  }
  liking.value = true
  notice.value = ''
  try {
    const response = await $fetch<ApiSuccess<CommunityItem>>(`/api/community/items/${item.value.id}/like`, {
      method: item.value.liked ? 'DELETE' : 'POST',
    })
    Object.assign(item.value, response.data)
  } catch (cause) {
    notice.value = apiErrorMessage(cause, '点赞操作失败，请稍后重试。')
  } finally {
    liking.value = false
  }
}
</script>

<template>
  <div v-if="item" class="community-detail-page">
    <div class="community-detail-page__inner">
      <NuxtLink class="community-detail-back" :to="`/community/${item.category}`"><ArrowLeft :size="16" />返回{{ item.category_name }}</NuxtLink>
      <header class="community-detail-heading">
        <div class="community-detail-heading__icon">
          <img v-if="item.icon_url" :src="item.icon_url" :alt="`${item.name} 图标`">
          <span v-else>{{ item.name.slice(0, 1).toUpperCase() }}</span>
        </div>
        <div>
          <div class="community-detail-heading__title"><h1>{{ item.name }}</h1><span v-if="item.is_featured">精选</span></div>
          <p>{{ item.summary }}</p>
          <div class="community-tags"><span v-for="tag in item.tags" :key="tag">{{ tag }}</span></div>
        </div>
      </header>

      <div class="community-detail-actions">
        <a class="primary-command" :href="item.official_url" target="_blank" rel="noopener noreferrer">打开官方地址 <ArrowUpRight :size="16" /></a>
        <button class="community-like" type="button" :class="{ 'is-liked': item.liked }" :disabled="liking" @click="toggleLike"><Heart :size="17" :fill="item.liked ? 'currentColor' : 'none'" />{{ item.liked ? '已点赞' : '点赞' }} {{ item.like_count }}</button>
      </div>
      <div v-if="notice" class="community-notice">{{ notice }} <a v-if="!authenticated" :href="site.login_url">去登录 <ArrowUpRight :size="14" /></a></div>

      <section v-if="item.images.length" class="community-detail-gallery">
        <div class="community-detail-gallery__main"><img :src="item.images[activeImage]?.image_url" :alt="item.images[activeImage]?.alt_text || item.images[activeImage]?.title || `${item.name} 配图`"><p v-if="item.images[activeImage]?.title">{{ item.images[activeImage]?.title }}</p></div>
        <div v-if="item.images.length > 1" class="community-detail-gallery__thumbs"><button v-for="(image, index) in item.images" :key="image.id || image.image_url" type="button" :class="{ active: activeImage === index }" @click="activeImage = index"><img :src="image.image_url" :alt="image.alt_text || ''"></button></div>
      </section>

      <div class="community-detail-layout">
        <article class="community-detail-content doc-content">
          <MDC v-if="item.description_md" :value="item.description_md" />
          <p v-else class="community-detail-empty">管理员还没有补充详细介绍。</p>
        </article>
        <aside class="community-detail-meta">
          <div><span>分类</span><strong>{{ item.category_name }}</strong></div>
          <div v-if="item.compatibility"><span>兼容平台</span><strong>{{ item.compatibility }}</strong></div>
          <div><span>收录时间</span><strong>{{ new Date(item.published_at || item.created_at).toLocaleDateString('zh-CN') }}</strong></div>
        </aside>
      </div>
    </div>
  </div>
</template>
