<script setup lang="ts">
import { ExternalLink, LogIn } from 'lucide-vue-next'

defineProps<{
  loading?: boolean
  message?: string
}>()

const site = useSiteConfigState()
</script>

<template>
  <section class="session-gate" aria-live="polite">
    <LogIn :size="24" />
    <div>
      <h2>{{ loading ? '正在确认登录状态' : `需要${site.project_name}账号` }}</h2>
      <p>{{ loading ? '请稍候。' : (message || '请从主站用户中心的自定义菜单进入此页面。') }}</p>
    </div>
    <a v-if="!loading" class="primary-command" :href="site.main_site_url">
      返回主站
      <ExternalLink :size="16" />
    </a>
  </section>
</template>
