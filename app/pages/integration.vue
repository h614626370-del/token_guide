<script setup lang="ts">
const site = useSiteConfigState()
useHead(() => ({ link: [{ rel: 'canonical', href: `${site.value.site_url}/integration` }] }))
</script>

<template>
  <DocPage content-path="/integration" section="API 接入" />
</template>
