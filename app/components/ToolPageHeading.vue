<script setup lang="ts">
defineProps<{
  eyebrow: string
  title: string
  description: string
}>()
</script>

<template>
  <header class="tool-heading">
    <span>{{ eyebrow }}</span>
    <h1>{{ title }}</h1>
    <p>{{ description }}</p>
    <div v-if="$slots.actions" class="tool-heading__actions">
      <slot name="actions" />
    </div>
  </header>
</template>
