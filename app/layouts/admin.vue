<script setup lang="ts">
import { ArrowLeft, BadgeDollarSign, BarChart3, Boxes, FileText, FolderTree, Gamepad2, Home, Images, LayoutDashboard, List, LogOut, Mail, MessageSquareText, RefreshCcw, Settings } from 'lucide-vue-next'
import { PackageOpen } from 'lucide-vue-next'

const route = useRoute()
const admin = useAdminSessionState()
const site = useSiteConfigState()
const links = [
  { label: '概览', to: '/admin', icon: LayoutDashboard },
  { label: '站点配置', to: '/admin/settings', icon: Settings },
  { label: '邮件通知', to: '/admin/email', icon: Mail },
  { label: '图片管理', to: '/admin/assets', icon: Images },
  { label: '首页管理', to: '/admin/homepage', icon: Home },
  { label: '指南内容', to: '/admin/docs', icon: FileText },
  { label: '脚本配置', to: '/admin/installers', icon: PackageOpen },
  { label: '价格配置', to: '/admin/pricing', icon: BadgeDollarSign },
  { label: '反馈处理', to: '/admin/feedback', icon: MessageSquareText },
  {
    label: '社区管理', icon: Boxes, children: [
      { label: '分类管理', to: '/admin/community/categories', icon: FolderTree },
      { label: '条目管理', to: '/admin/community/items', icon: List },
    ],
  },
  { label: '游戏管理', to: '/admin/games', icon: Gamepad2 },
  { label: '推广统计', to: '/admin/promotions', icon: BarChart3 },
  { label: '系统更新', to: '/admin/update', icon: RefreshCcw },
]

async function logout() {
  await admin.logout()
  await navigateTo('/admin')
}

function isActive(to: string) {
  return route.path === to
}

function isGroupActive(item: { children?: Array<{ to: string }> }) {
  return item.children?.some(child => route.path === child.to) || false
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
        <template v-for="item in links" :key="item.label">
          <div v-if="item.children" :class="['admin-nav-group', { active: isGroupActive(item) }]">
            <div class="admin-nav-group__label"><component :is="item.icon" :size="17" /><span>{{ item.label }}</span></div>
            <NuxtLink v-for="child in item.children" :key="child.to" class="admin-nav-child" :to="child.to" :aria-current="isActive(child.to) ? 'page' : undefined" :title="child.label">
              <component :is="child.icon" :size="16" />
              <span>{{ child.label }}</span>
            </NuxtLink>
          </div>
          <NuxtLink v-else :to="item.to" :aria-current="isActive(item.to!) ? 'page' : undefined" :title="item.label">
            <component :is="item.icon" :size="17" />
            <span>{{ item.label }}</span>
          </NuxtLink>
        </template>
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
