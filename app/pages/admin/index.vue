<script setup lang="ts">
import { ArrowRight, BadgeDollarSign, BarChart3, Boxes, Database, FileText, Home, Images, MessageSquareText, RefreshCcw, Settings, ShieldCheck } from 'lucide-vue-next'
import { PackageOpen } from 'lucide-vue-next'

definePageMeta({ layout: 'admin' })
useSeoMeta({ title: '管理概览', robots: 'noindex, nofollow' })

const items = [
  { icon: Settings, title: '站点配置', text: '维护名称、主站地址、品牌与支持信息。', to: '/admin/settings' },
  { icon: Images, title: '图片管理', text: '上传 Logo、群二维码或内容图片，生成可公开访问的地址。', to: '/admin/assets' },
  { icon: Home, title: '首页管理', text: '应用默认首页，上传独立静态文件并在线发布。', to: '/admin/homepage' },
  { icon: FileText, title: '指南内容', text: '直接编辑首页、接入教程和会员流程文档。', to: '/admin/docs' },
  { icon: PackageOpen, title: '脚本配置', text: '维护 Codex 与 Claude 的安装脚本和公共接入参数。', to: '/admin/installers' },
  { icon: BadgeDollarSign, title: '价格配置', text: '维护数据源、展示模型、套餐和折算参数。', to: '/admin/pricing' },
  { icon: MessageSquareText, title: '反馈处理', text: '筛选用户反馈，更新状态并填写公开回复。', to: '/admin/feedback' },
  { icon: Boxes, title: '社区管理', text: '维护开源工具、Skills、MCP 与公开展示状态。', to: '/admin/community' },
  { icon: BarChart3, title: '推广统计', text: '创建主站推广直链，比较来源访问量和独立访客。', to: '/admin/promotions' },
  { icon: RefreshCcw, title: '系统更新', text: '检测新版本、下载最新镜像并立即重启服务。', to: '/admin/update' },
]
</script>

<template>
  <AdminAccessGate>
    <div class="admin-page">
      <header class="admin-page-heading">
        <span>Overview</span>
        <h1>管理概览</h1>
        <p>统一管理站点信息、价格展示和用户反馈。</p>
      </header>

      <section class="admin-status-band">
        <ShieldCheck :size="22" />
        <div><strong>管理员会话有效</strong><span>凭据不会写入浏览器存储。</span></div>
        <Database :size="20" />
        <div><strong>SQLite 持久化</strong><span>原有价格与反馈数据继续沿用。</span></div>
      </section>

      <div class="admin-destination-list">
        <NuxtLink v-for="item in items" :key="item.to" :to="item.to">
          <component :is="item.icon" :size="21" />
          <div><strong>{{ item.title }}</strong><span>{{ item.text }}</span></div>
          <ArrowRight :size="17" />
        </NuxtLink>
      </div>
    </div>
  </AdminAccessGate>
</template>
