<script setup lang="ts">
import { ExternalLink, Image, Save, Settings } from 'lucide-vue-next'
import type { ApiSuccess } from '~/types/api'
import { apiErrorMessage } from '~/types/api'
import type { PublicSiteConfig } from '~/types/site'

definePageMeta({ layout: 'admin' })
useSeoMeta({ title: '站点配置', robots: 'noindex, nofollow' })

const admin = useAdminSessionState()
const site = useSiteConfigState()
const loading = ref(false)
const saving = ref(false)
const loaded = ref(false)
const notice = reactive({ type: 'idle' as 'idle' | 'success' | 'error', message: '' })
const form = reactive({ ...site.value })

watch(() => admin.session.value?.admin, (authenticated) => {
  if (authenticated && !loaded.value) void loadSettings()
}, { immediate: true })

async function loadSettings() {
  loading.value = true
  notice.type = 'idle'
  notice.message = ''
  try {
    const response = await $fetch<ApiSuccess<PublicSiteConfig>>('/api/admin/site-config')
    apply(response.data)
    loaded.value = true
  } catch (cause) {
    notice.type = 'error'
    notice.message = apiErrorMessage(cause, '站点配置读取失败')
  } finally {
    loading.value = false
  }
}

async function saveSettings() {
  saving.value = true
  notice.type = 'idle'
  notice.message = ''
  try {
    const payload = {
      project_name: form.project_name,
      site_title: form.site_title,
      site_description: form.site_description,
      logo_path: form.logo_path,
      footer_text: form.footer_text,
      main_site_url: form.main_site_url,
      login_path: form.login_path,
      register_path: form.register_path,
      support_path: form.support_path,
      api_path: form.api_path,
      support_wechat: form.support_wechat,
      support_group_url: form.support_group_url,
    }
    const response = await $fetch<ApiSuccess<PublicSiteConfig>>('/api/admin/site-config', {
      method: 'PUT',
      body: payload,
    })
    apply(response.data)
    site.value = { ...response.data }
    notice.type = 'success'
    notice.message = '站点配置已保存。'
  } catch (cause) {
    notice.type = 'error'
    notice.message = apiErrorMessage(cause, '站点配置保存失败')
  } finally {
    saving.value = false
  }
}

function apply(value: PublicSiteConfig) {
  Object.assign(form, value)
}
</script>

<template>
  <AdminAccessGate>
    <div class="admin-page site-settings-page">
      <header class="admin-page-heading">
        <span>Site settings</span>
        <h1>站点配置</h1>
        <p>维护公开品牌、主站路由和支持入口。</p>
        <div class="admin-page-heading__actions">
          <button class="primary-command" type="button" :disabled="loading || saving" @click="saveSettings">
            <Save :size="16" />{{ saving ? '保存中...' : '保存配置' }}
          </button>
        </div>
      </header>

      <div v-if="notice.message" :class="['tool-alert', notice.type === 'error' ? 'tool-alert--error' : 'tool-alert--success']">
        {{ notice.message }}
      </div>

      <section class="site-config-preview">
        <img :src="form.logo_path" width="48" height="48" alt="">
        <div><strong>{{ form.site_title }}</strong><span>{{ form.site_description }}</span></div>
        <a :href="form.main_site_url" target="_blank" rel="noreferrer" title="打开主站"><ExternalLink :size="18" /></a>
      </section>

      <form class="admin-settings-grid" @submit.prevent="saveSettings">
        <section class="admin-section">
          <header><h2>品牌信息</h2><Image :size="18" /></header>
          <label class="form-field"><span>项目名称</span><input v-model.trim="form.project_name" maxlength="40" required></label>
          <label class="form-field"><span>站点标题</span><input v-model.trim="form.site_title" maxlength="80" required></label>
          <label class="form-field"><span>站点简介</span><textarea v-model.trim="form.site_description" rows="3" maxlength="240" required /></label>
          <label class="form-field">
            <span>Logo 完整地址</span>
            <input v-model.trim="form.logo_path" type="url" maxlength="500" placeholder="https://example.com/logo.png" required>
          </label>
          <label class="form-field"><span>页脚文案</span><input v-model.trim="form.footer_text" maxlength="120" required></label>
        </section>

        <section class="admin-section">
          <header><h2>主站与路由</h2><Settings :size="18" /></header>
          <label class="form-field"><span>主站地址</span><input v-model.trim="form.main_site_url" type="url" maxlength="500" placeholder="https://example.com" required></label>
          <div class="site-route-grid">
            <label class="form-field"><span>登录路由</span><input v-model.trim="form.login_path" maxlength="160" required></label>
            <label class="form-field"><span>注册路由</span><input v-model.trim="form.register_path" maxlength="160" required></label>
            <label class="form-field"><span>支持路由</span><input v-model.trim="form.support_path" maxlength="160" required></label>
            <label class="form-field"><span>API 路由</span><input v-model.trim="form.api_path" maxlength="160" required></label>
          </div>
          <label class="form-field"><span>客服标识</span><input v-model.trim="form.support_wechat" maxlength="80"></label>
          <label class="form-field">
            <span>群二维码图片地址</span>
            <input v-model.trim="form.support_group_url" type="url" maxlength="500" placeholder="https://example.com/group-qr.png">
            <small>填写可直接访问的图片完整地址</small>
          </label>
        </section>
      </form>
    </div>
  </AdminAccessGate>
</template>
