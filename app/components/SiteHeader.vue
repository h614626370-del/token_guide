<script setup lang="ts">
import {
  BadgeDollarSign,
  BookOpen,
  ExternalLink,
  FlaskConical,
  LogIn,
  Menu,
  MessageSquareText,
  X,
} from 'lucide-vue-next'

const route = useRoute()
const site = useSiteConfigState()
const menuOpen = ref(false)
const navigation = [
  { label: '指南', to: '/', icon: BookOpen, paths: ['/', '/member', '/integration'] },
  { label: '模型价格', to: '/pricing', icon: BadgeDollarSign, paths: ['/pricing'] },
  { label: '使用工作台', to: '/playground', icon: FlaskConical, paths: ['/playground'] },
  { label: '反馈', to: '/feedback', icon: MessageSquareText, paths: ['/feedback'] },
]

watch(() => route.fullPath, () => {
  menuOpen.value = false
})

function isActive(paths: string[]) {
  return paths.includes(route.path)
}
</script>

<template>
  <header class="site-header">
    <div class="site-header__inner">
      <NuxtLink class="site-brand" to="/" :aria-label="`${site.site_title}首页`">
        <img :src="site.logo_path" width="34" height="34" alt="" aria-hidden="true">
        <span>{{ site.site_title }}</span>
      </NuxtLink>

      <nav :class="['site-nav', { 'is-open': menuOpen }]" aria-label="主导航">
        <div class="site-nav__sections">
          <NuxtLink
            v-for="item in navigation"
            :key="item.to"
            :to="item.to"
            :aria-current="isActive(item.paths) ? 'page' : undefined"
          >
            <component :is="item.icon" :size="17" />
            <span>{{ item.label }}</span>
          </NuxtLink>
        </div>
        <div class="site-nav__actions">
          <a class="site-nav__external" :href="site.main_site_url">
            <span>进入主站</span>
            <ExternalLink :size="15" />
          </a>
          <a class="site-nav__account" :href="site.login_url">
            <LogIn :size="16" />
            <span>登录账号</span>
          </a>
        </div>
      </nav>

      <button
        class="icon-button site-menu-button"
        type="button"
        :aria-expanded="menuOpen"
        aria-label="切换导航"
        @click="menuOpen = !menuOpen"
      >
        <X v-if="menuOpen" :size="20" />
        <Menu v-else :size="20" />
      </button>
    </div>
  </header>
</template>
