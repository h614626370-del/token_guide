<script setup lang="ts">
import type { Component } from 'vue'
import { BookOpen, Cable, ChevronDown, House, WalletCards } from 'lucide-vue-next'

interface GuideLink {
  label: string
  to: string
  icon?: Component
}

interface GuideGroup {
  label: string
  kind: 'pages' | 'toc'
  items: GuideLink[]
}

const route = useRoute()
const menuOpen = ref(false)

const guideStructureItems: GuideLink[] = [
  { label: '指南首页', to: '/', icon: House },
  { label: '会员充值流程', to: '/member', icon: WalletCards },
  { label: 'API 接入配置', to: '/integration', icon: Cable },
]

const memberItems: GuideLink[] = [
  { label: '注册账号', to: '/member#_1-注册账号' },
  { label: '登录账号', to: '/member#_2-登录账号' },
  { label: '余额充值', to: '/member#_3-余额充值' },
  { label: '订阅套餐', to: '/member#_4-订阅套餐已开放' },
  { label: '兑换功能', to: '/member#_5-兑换功能暂未开放' },
  { label: '订单状态', to: '/member#_6-订单状态说明' },
  { label: '常见问题', to: '/member#_7-常见问题' },
]

const integrationItems: GuideLink[] = [
  { label: '创建 API 密钥', to: '/integration#_1-创建-api-密钥' },
  { label: '接口地址与连通测试', to: '/integration#_2-接口地址与连通测试' },
  { label: '客户端安装', to: '/integration#_3-客户端安装' },
  { label: 'Codex CLI（macOS / Linux）', to: '/integration#_4-codex-climacos-linux' },
  { label: 'Codex CLI（Windows）', to: '/integration#_5-codex-cliwindows' },
  { label: 'Claude Code', to: '/integration#_6-claude-code' },
  { label: 'OpenCode', to: '/integration#_7-opencode' },
  { label: 'OpenClaw', to: '/integration#_8-openclaw可选' },
  { label: 'GPT 文本调用', to: '/integration#_9-gpt-文本模型调用参数responses' },
  { label: '图片生成', to: '/integration#_10-gpt-image-2-调用参数images' },
  { label: '参考图编辑', to: '/integration#_11-参考图编辑imagesedits' },
  { label: '常见错误排查', to: '/integration#_12-常见错误排查' },
]

const homeItems: GuideLink[] = [
  { label: '支持的 API 与工具', to: '/#支持的-api-与工具' },
  { label: '常用接入地址', to: '/#常用接入地址' },
  { label: '典型使用流程', to: '/#典型使用流程' },
  { label: '接入边界', to: '/#接入边界' },
  { label: '常见问题', to: '/#常见问题' },
]

const groups = computed<GuideGroup[]>(() => {
  const currentPage = route.path === '/member'
    ? { label: '本页目录 · 会员充值', items: memberItems }
    : route.path === '/integration'
      ? { label: '本页目录 · API 接入', items: integrationItems }
      : { label: '本页目录 · 指南首页', items: homeItems }

  return [
    { label: '指南', kind: 'pages', items: guideStructureItems },
    { ...currentPage, kind: 'toc' },
  ]
})

watch(() => route.fullPath, () => {
  menuOpen.value = false
})

function isCurrent(item: GuideLink) {
  if (item.to.includes('#')) {
    try {
      return decodeURIComponent(route.fullPath) === item.to
    } catch {
      return route.fullPath === item.to
    }
  }
  return route.path === item.to
}
</script>

<template>
  <aside class="guide-sidebar">
    <button
      class="guide-sidebar__toggle"
      type="button"
      :aria-expanded="menuOpen"
      aria-controls="guide-sidebar-navigation"
      @click="menuOpen = !menuOpen"
    >
      <span><BookOpen :size="17" />指南目录</span>
      <ChevronDown :size="17" :class="{ 'is-open': menuOpen }" />
    </button>

    <div id="guide-sidebar-navigation" :class="['guide-sidebar__panel', { 'is-open': menuOpen }]">
      <div class="guide-sidebar__heading">
        <BookOpen :size="17" />
        <span>指南目录</span>
      </div>
      <nav aria-label="指南目录">
        <section
          v-for="group in groups"
          :key="group.label"
          :class="['guide-sidebar__group', `guide-sidebar__group--${group.kind}`]"
        >
          <p>
            <span>{{ group.label }}</span>
            <span v-if="group.kind === 'pages'" class="guide-sidebar__group-count">{{ group.items.length }} 篇</span>
          </p>
          <div :class="['guide-sidebar__links', `guide-sidebar__links--${group.kind}`]">
            <NuxtLink
              v-for="item in group.items"
              :key="item.to"
              :to="item.to"
              :class="['guide-sidebar__link', `guide-sidebar__link--${group.kind}`, { 'is-current': isCurrent(item) }]"
              :aria-current="isCurrent(item) ? 'page' : undefined"
            >
              <span v-if="item.icon" class="guide-sidebar__link-icon" aria-hidden="true">
                <component :is="item.icon" :size="17" :stroke-width="1.9" />
              </span>
              <span v-else class="guide-sidebar__link-marker" aria-hidden="true" />
              <span>{{ item.label }}</span>
            </NuxtLink>
          </div>
        </section>
      </nav>
    </div>
  </aside>
</template>
