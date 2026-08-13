<script setup lang="ts">
import type { CommunityCategory } from '~/types/community'

const route = useRoute()
const communityCategory = computed(() => String(route.params.category) as CommunityCategory)

definePageMeta({
  validate: route => ['tools', 'skills', 'mcp', 'agent', 'plugin'].includes(String(route.params.category || '')),
})
</script>

<template>
  <CommunityDirectory :category="communityCategory" />
</template>
