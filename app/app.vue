<script setup lang="ts">
import type { ApiSuccess } from '~/types/api'
import type { PublicSiteConfig } from '~/types/site'

const site = useSiteConfigState()
const { data } = await useFetch<ApiSuccess<PublicSiteConfig>>('/api/site-config', {
  key: 'public-site-config-request',
})

if (data.value?.data) site.value = data.value.data

useHead(() => ({
  titleTemplate: title => title ? `${title} | ${site.value.project_name}` : site.value.site_title,
  meta: [
    { name: 'description', content: site.value.site_description },
    { name: 'theme-color', content: '#ffffff' },
  ],
}))
</script>

<template>
  <NuxtLoadingIndicator color="#202329" :height="2" />
  <NuxtLayout>
    <NuxtPage :page-key="route => route.path" />
  </NuxtLayout>
</template>
