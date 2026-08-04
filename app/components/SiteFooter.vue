<script setup lang="ts">
const site = useSiteConfigState()
</script>

<template>
  <footer class="site-footer">
    <div class="site-footer__inner">
      <div>
        <span>{{ site.project_name }}</span>
        <p>{{ site.footer_text }}</p>
      </div>
      <nav aria-label="页脚导航">
        <NuxtLink to="/integration">接入文档</NuxtLink>
        <NuxtLink to="/pricing">模型价格</NuxtLink>
        <NuxtLink to="/playground">使用工作台</NuxtLink>
        <NuxtLink to="/feedback">在线反馈</NuxtLink>
        <a :href="site.main_site_url">主站</a>
      </nav>
    </div>
  </footer>
</template>
