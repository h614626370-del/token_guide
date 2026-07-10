<template>
  <div class="admin-shell">
    <header class="admin-topbar">
      <a class="admin-brand" href="/guide/admin/settings">
        <img class="admin-brand-mark" :src="guideLogoSrc" width="34" height="34" alt="" aria-hidden="true" />
        <span>Token向云管理</span>
      </a>

      <nav aria-label="管理员导航">
        <a
          v-for="item in navItems"
          :key="item.href"
          :href="item.href"
          :aria-current="isActive(item.href) ? 'page' : undefined"
        >
          {{ item.label }}
        </a>
      </nav>

      <div class="admin-session-state">
        <span :class="{ active: hasToken }">{{ hasToken ? '已保存 Token' : '未配置 Token' }}</span>
      </div>
    </header>

    <main class="admin-main">
      <section class="admin-page-head">
        <div>
          <h1>{{ title }}</h1>
          <p>{{ description }}</p>
        </div>
        <slot name="actions" />
      </section>

      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { withBase } from 'vitepress'
import { readAdminToken } from './admin-session'

defineProps<{
  title: string
  description: string
}>()

const navItems = [
  { label: '配置中心', href: '/guide/admin/settings' },
  { label: '价格配置', href: '/guide/admin/pricing' },
  { label: '反馈处理', href: '/guide/admin/feedback' },
  { label: '返回指南', href: '/guide/' },
]

const guideLogoSrc = withBase('/logo-80.png')
const currentPath = ref('')
const hasToken = ref(false)

onMounted(() => {
  syncState()
  window.addEventListener('guide-admin-token-updated', syncState)
  window.addEventListener('storage', syncState)
})

onUnmounted(() => {
  window.removeEventListener('guide-admin-token-updated', syncState)
  window.removeEventListener('storage', syncState)
})

function syncState() {
  currentPath.value = window.location.pathname.replace(/\/$/, '')
  hasToken.value = Boolean(readAdminToken())
}

function isActive(href: string) {
  return currentPath.value === href.replace(/\/$/, '')
}
</script>

<style scoped>
.admin-shell {
  min-height: 100dvh;
  color: #102033;
  background: #eef5f4;
  font-family: Inter, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
}

.admin-shell,
.admin-shell * {
  box-sizing: border-box;
}

.admin-topbar {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 18px;
  align-items: center;
  min-height: 58px;
  padding: 0 28px;
  border-bottom: 1px solid #d5e0ec;
  background: #ffffff;
}

.admin-brand,
.admin-topbar nav,
.admin-session-state {
  display: flex;
  align-items: center;
}

.admin-brand {
  gap: 10px;
  color: #102033;
  font-size: 15px;
  font-weight: 900;
  text-decoration: none;
  white-space: nowrap;
}

.admin-brand-mark {
  display: block;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  border: 1px solid rgba(15, 118, 110, 0.16);
  border-radius: 8px;
  background: #fffaf3;
  object-fit: cover;
}

.admin-topbar nav {
  flex-wrap: wrap;
  gap: 6px;
}

.admin-topbar nav a {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  padding: 0 11px;
  color: #43576f;
  font-size: 13px;
  font-weight: 800;
  text-decoration: none;
}

.admin-topbar nav a:hover,
.admin-topbar nav a[aria-current="page"] {
  color: #0b6765;
  background: #eef8f7;
}

.admin-session-state {
  justify-content: flex-end;
}

.admin-session-state span {
  display: inline-flex;
  min-height: 28px;
  align-items: center;
  border-radius: 999px;
  padding: 0 10px;
  color: #8a4b05;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
  background: #fff1d8;
}

.admin-session-state span.active {
  color: #04743b;
  background: #dff9e9;
}

.admin-main {
  width: min(1480px, calc(100% - 48px));
  margin: 0 auto;
  padding: 18px 0 34px;
}

.admin-page-head {
  display: flex;
  justify-content: space-between;
  gap: 18px;
  align-items: flex-end;
  margin-bottom: 14px;
}

.admin-page-head h1 {
  margin: 0;
  color: #102033;
  font-size: 28px;
  line-height: 1.25;
  letter-spacing: 0;
}

.admin-page-head p {
  max-width: 760px;
  margin: 8px 0 0;
  color: #516882;
  font-size: 14px;
  line-height: 1.65;
}

@media (max-width: 860px) {
  .admin-topbar {
    grid-template-columns: 1fr;
    align-items: start;
    padding: 12px 16px;
  }

  .admin-topbar nav,
  .admin-session-state {
    justify-content: flex-start;
  }

  .admin-main {
    width: min(100% - 20px, 760px);
    padding-top: 12px;
  }

  .admin-page-head {
    display: grid;
    align-items: start;
  }
}
</style>
