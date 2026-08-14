<script setup lang="ts">
import { Bot, Box, Boxes, Database, Folder, Package, SlidersHorizontal, Sparkles, Workflow, Wrench } from 'lucide-vue-next'
import type { CommunityCategoryIcon } from '~/types/community'

const props = withDefaults(defineProps<{ iconKey?: CommunityCategoryIcon, size?: number }>(), {
  iconKey: 'box',
  size: 17,
})

const icons = {
  wrench: Wrench,
  box: Box,
  'sliders-horizontal': SlidersHorizontal,
  bot: Bot,
  package: Package,
  database: Database,
  boxes: Boxes,
  folder: Folder,
  sparkles: Sparkles,
  workflow: Workflow,
}

const icon = computed(() => icons[props.iconKey] || Box)
</script>

<template>
  <component :is="icon" :size="size" />
</template>
