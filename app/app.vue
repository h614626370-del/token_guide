<script setup lang="ts">
import type { ApiSuccess } from '~/types/api'
import type { PublicSiteConfig } from '~/types/site'

const site = useSiteConfigState()
const { data } = await useFetch<ApiSuccess<PublicSiteConfig>>('/api/site-config', {
  key: 'public-site-config-request',
})

if (data.value?.data) site.value = data.value.data

// Nuxt 在切换 layout / 异步页面时可能漏发 page:loading:end，导致顶栏进度条卡死
const nuxtApp = useNuxtApp()
const { finish } = useLoadingIndicator()
nuxtApp.hook('page:finish', () => {
  finish({ force: true })
})
nuxtApp.hook('vue:error', () => {
  finish({ force: true })
})

useHead(() => ({
  titleTemplate: title => title ? `${title} | ${site.value.project_name}` : site.value.site_title,
  meta: [
    { name: 'description', content: site.value.site_description },
    { name: 'theme-color', content: '#ffffff' },
  ],
  // 浏览器标签图标跟随后台配置的 Logo，而不是写死 public/logo-80.png
  link: [
    { rel: 'icon', type: 'image/png', href: site.value.logo_path },
    { rel: 'apple-touch-icon', href: site.value.logo_path },
  ],
}))
</script>

<template>
  <NuxtLoadingIndicator color="#202329" :height="2" :throttle="120" />
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
