<script setup lang="ts">
import { ArrowLeft, BadgeDollarSign, FileText, Images, LayoutDashboard, LogOut, MessageSquareText, RefreshCcw, Settings } from 'lucide-vue-next'
import { PackageOpen } from 'lucide-vue-next'

const route = useRoute()
const admin = useAdminSessionState()
const site = useSiteConfigState()
const links = [
  { label: '概览', to: '/admin', icon: LayoutDashboard },
  { label: '站点配置', to: '/admin/settings', icon: Settings },
  { label: '图片管理', to: '/admin/assets', icon: Images },
  { label: '指南内容', to: '/admin/docs', icon: FileText },
  { label: '脚本配置', to: '/admin/installers', icon: PackageOpen },
  { label: '价格配置', to: '/admin/pricing', icon: BadgeDollarSign },
  { label: '反馈处理', to: '/admin/feedback', icon: MessageSquareText },
  { label: '系统更新', to: '/admin/update', icon: RefreshCcw },
]

async function logout() {
  await admin.logout()
  await navigateTo('/admin')
}
</script>

<template>
  <div class="admin-frame">
    <aside class="admin-sidebar">
      <NuxtLink class="admin-brand" to="/admin">
        <img :src="site.logo_path" width="32" height="32" alt="">
        <span>{{ site.project_name }}管理</span>
      </NuxtLink>
      <nav aria-label="管理员导航">
        <NuxtLink v-for="item in links" :key="item.to" :to="item.to" :aria-current="route.path === item.to ? 'page' : undefined">
          <component :is="item.icon" :size="17" />
          {{ item.label }}
        </NuxtLink>
      </nav>
      <div class="admin-sidebar__foot">
        <NuxtLink to="/"><ArrowLeft :size="16" /> 返回站点</NuxtLink>
        <button v-if="admin.session.value?.admin" type="button" title="退出管理" :disabled="admin.busy.value" @click="logout"><LogOut :size="16" /> 退出管理</button>
      </div>
    </aside>
    <main class="admin-main">
      <slot />
    </main>
  </div>
</template>
