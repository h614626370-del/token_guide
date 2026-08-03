<script setup lang="ts">
const site = useSiteConfigState()
useHead(() => ({ link: [{ rel: 'canonical', href: `${site.value.site_url}/member` }] }))
</script>

<template>
  <DocPage content-path="/member" section="会员与额度" />
</template>
