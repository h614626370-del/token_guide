<script setup lang="ts">
import type { ApiSuccess } from '~/types/api'
import type { CommunityCategory } from '~/types/community'

const route = useRoute()
const communityCategory = computed(() => String(route.params.category))

const { data, error } = await useFetch<ApiSuccess<CommunityCategory[]>>('/api/community/categories')
if (error.value || !data.value?.data.some(category => category.slug === communityCategory.value)) {
  throw createError({ statusCode: 404, statusMessage: '社区分类不存在' })
}
</script>

<template>
  <CommunityDirectory :category="communityCategory" />
</template>
