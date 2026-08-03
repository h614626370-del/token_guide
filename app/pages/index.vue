<script setup lang="ts">
const site = useSiteConfigState()
useHead(() => ({ link: [{ rel: 'canonical', href: `${site.value.site_url}/` }] }))
</script>

<template>
  <DocPage content-path="/" section="指南首页" />
</template>
