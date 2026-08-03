<script setup lang="ts">
import { AlertCircle, ArrowLeft } from 'lucide-vue-next'

const route = useRoute()
const site = useSiteConfigState()
const reason = computed(() => route.query.reason === 'invalid'
  ? `主站登录凭据已失效，请返回${site.value.project_name}重新登录。`
  : `没有收到主站登录凭据，请从${site.value.project_name}会员中心进入。`)

useSeoMeta({ title: '登录连接失败', robots: 'noindex,nofollow' })
</script>

<template>
  <div class="page-shell auth-error-page">
    <AlertCircle :size="28" />
    <h1>无法连接主站会话</h1>
    <p>{{ reason }}</p>
    <a class="primary-command" :href="site.login_url">
      <ArrowLeft :size="17" />
      返回主站登录
    </a>
  </div>
</template>
