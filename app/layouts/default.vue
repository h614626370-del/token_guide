<script setup lang="ts">
const route = useRoute()
const embedded = computed(() => route.query.embedded === '1')
const guideRoutes = new Set(['/', '/member', '/integration'])
const showGuideSidebar = computed(() => !embedded.value && guideRoutes.has(route.path))
</script>

<template>
  <div class="site-frame">
    <SiteHeader v-if="!embedded" />
    <main :class="['site-main', { 'site-main--guide': showGuideSidebar }]">
      <div v-if="showGuideSidebar" class="guide-layout">
        <GuideSidebar />
        <div class="guide-layout__content">
          <slot />
        </div>
      </div>
      <slot v-else />
    </main>
    <SiteFooter v-if="!embedded" />
  </div>
</template>
