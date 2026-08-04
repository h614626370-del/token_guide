<script setup lang="ts">
import { ImageOff } from 'lucide-vue-next'

const site = useSiteConfigState()
const imageFailed = ref(false)
const imageLoaded = ref(false)

watch(() => site.value.support_group_url, () => {
  imageFailed.value = false
  imageLoaded.value = false
})
</script>

<template>
  <figure v-if="site.support_group_url" class="support-group-qr">
    <div class="support-group-qr__media">
      <img
        :class="{ 'is-pending': !imageLoaded || imageFailed }"
        :src="site.support_group_url"
        width="280"
        height="280"
        alt="群二维码图片"
        loading="lazy"
        @load="imageLoaded = true"
        @error="imageFailed = true"
      >
      <div v-if="!imageLoaded || imageFailed" class="support-group-qr__fallback" role="status">
        <ImageOff :size="24" />
        <span>{{ imageFailed ? '二维码图片加载失败' : '正在加载二维码图片' }}</span>
      </div>
    </div>
    <figcaption>这里是群二维码图片。如果无法显示，请关闭网络代理。</figcaption>
  </figure>
</template>
