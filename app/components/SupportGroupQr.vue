<script setup lang="ts">
import { ImageOff } from 'lucide-vue-next'

const site = useSiteConfigState()
const imageFailed = ref(false)

watch(() => site.value.support_group_url, () => {
  imageFailed.value = false
})
</script>

<template>
  <figure v-if="site.support_group_url" class="support-group-qr">
    <img
      v-if="!imageFailed"
      :src="site.support_group_url"
      width="280"
      height="280"
      alt="群二维码图片"
      loading="lazy"
      @error="imageFailed = true"
    >
    <div v-else class="support-group-qr__fallback" role="img" aria-label="群二维码图片加载失败">
      <ImageOff :size="24" />
      <span>二维码图片加载失败</span>
    </div>
    <figcaption>这里是群二维码图片。如果无法显示，请关闭网络代理。</figcaption>
  </figure>
</template>
