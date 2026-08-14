<script setup lang="ts">
import type { GameCategory } from '~/types/games'

const route = useRoute()
const gameCategory = computed(() => String(route.params.category) as GameCategory)

definePageMeta({
  validate: route => ['board', 'arcade', 'puzzle', 'training', 'adventure'].includes(String(route.params.category || '')),
})
</script>

<template>
  <GamesDirectory :category="gameCategory" />
</template>
