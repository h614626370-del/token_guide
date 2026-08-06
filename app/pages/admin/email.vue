<script setup lang="ts">
import { Mail, Save, Send, Server, TextQuote } from 'lucide-vue-next'
import type { ApiSuccess } from '~/types/api'
import { apiErrorMessage } from '~/types/api'
import type { AdminEmailSettings, AdminEmailSettingsDraft } from '~/types/admin'

definePageMeta({ layout: 'admin' })
useSeoMeta({ title: '邮件通知', robots: 'noindex, nofollow' })

const admin = useAdminSessionState()
const loading = ref(false)
const saving = ref(false)
const testing = ref(false)
const loaded = ref(false)
const notice = reactive({ type: 'idle' as 'idle' | 'success' | 'error', message: '' })
const form = reactive<AdminEmailSettingsDraft>({
  enabled: false,
  smtp_host: 'smtp.gmail.com',
  smtp_port: 587,
  smtp_secure: false,
  smtp_username: '',
  smtp_password: '',
  clear_smtp_password: false,
  from_name: '指南中心',
  from_email: '',
  admin_email: '',
  admin_subject_template: '[{{project_name}}反馈] {{title}}',
  admin_body_template: '',
  reply_subject_template: '[{{project_name}}] 您的反馈已有回复：{{title}}',
  reply_body_template: '',
  smtp_password_configured: false,
  smtp_password_masked: '',
})

watch(() => admin.session.value?.admin, (authenticated) => {
  if (authenticated && !loaded.value) void loadSettings()
}, { immediate: true })

async function loadSettings() {
  loading.value = true
  clearNotice()
  try {
    const response = await $fetch<ApiSuccess<AdminEmailSettings>>('/api/admin/email-settings')
    applySettings(response.data)
    loaded.value = true
  } catch (cause) {
    notice.type = 'error'
    notice.message = apiErrorMessage(cause, '邮件设置读取失败')
  } finally {
    loading.value = false
  }
}

async function saveSettings() {
  saving.value = true
  clearNotice()
  try {
    const response = await $fetch<ApiSuccess<AdminEmailSettings>>('/api/admin/email-settings', {
      method: 'PUT',
      body: {
        enabled: form.enabled,
        smtp_host: form.smtp_host,
        smtp_port: Number(form.smtp_port),
        smtp_secure: form.smtp_secure,
        smtp_username: form.smtp_username,
        smtp_password: form.smtp_password || null,
        clear_smtp_password: form.clear_smtp_password,
        from_name: form.from_name,
        from_email: form.from_email,
        admin_email: form.admin_email,
        admin_subject_template: form.admin_subject_template,
        admin_body_template: form.admin_body_template,
        reply_subject_template: form.reply_subject_template,
        reply_body_template: form.reply_body_template,
      },
    })
    applySettings(response.data)
    notice.type = 'success'
    notice.message = '邮件设置已保存。'
  } catch (cause) {
    notice.type = 'error'
    notice.message = apiErrorMessage(cause, '邮件设置保存失败')
  } finally {
    saving.value = false
  }
}

async function sendTestEmail() {
  testing.value = true
  clearNotice()
  try {
    await $fetch('/api/admin/email-settings/test', { method: 'POST' })
    notice.type = 'success'
    notice.message = '测试邮件已发送到管理员收件邮箱。'
  } catch (cause) {
    notice.type = 'error'
    notice.message = apiErrorMessage(cause, '测试邮件发送失败')
  } finally {
    testing.value = false
  }
}

function applySettings(value: AdminEmailSettings) {
  Object.assign(form, value, {
    smtp_password: '',
    clear_smtp_password: false,
  })
}

function clearNotice() {
  notice.type = 'idle'
  notice.message = ''
}
</script>

<template>
  <AdminAccessGate>
    <div class="admin-page email-settings-page">
      <header class="admin-page-heading">
        <span>Email</span>
        <h1>邮件通知</h1>
        <p>配置反馈提醒、回复通知和 SMTP 发件账户。</p>
        <div class="admin-page-heading__actions">
          <button class="secondary-command" type="button" :disabled="loading || saving || testing || !form.enabled" @click="sendTestEmail">
            <Send :size="16" />{{ testing ? '发送中...' : '发送测试邮件' }}
          </button>
          <button class="primary-command" type="button" :disabled="loading || saving || testing" @click="saveSettings">
            <Save :size="16" />{{ saving ? '保存中...' : '保存设置' }}
          </button>
        </div>
      </header>

      <div v-if="notice.message" :class="['tool-alert', notice.type === 'error' ? 'tool-alert--error' : 'tool-alert--success']">
        {{ notice.message }}
      </div>
      <div v-if="loading && !loaded" class="loading-band">正在读取邮件设置...</div>

      <form v-else class="admin-settings-grid email-settings-form" @submit.prevent="saveSettings">
        <section class="admin-section">
          <header><h2>SMTP 服务器</h2><Server :size="18" /></header>
          <label class="check-line email-enabled-toggle">
            <input v-model="form.enabled" type="checkbox">
            启用反馈邮件通知
          </label>
          <label class="form-field"><span>SMTP 服务器</span><input v-model.trim="form.smtp_host" maxlength="255" placeholder="smtp.gmail.com" :required="form.enabled"></label>
          <div class="email-server-row">
            <label class="form-field"><span>端口</span><input v-model.number="form.smtp_port" type="number" min="1" max="65535" required></label>
            <label class="check-line"><input v-model="form.smtp_secure" type="checkbox"> SSL/TLS</label>
          </div>
          <label class="form-field"><span>SMTP 用户名</span><input v-model.trim="form.smtp_username" maxlength="320" autocomplete="username"></label>
          <label class="form-field">
            <span>SMTP 密码</span>
            <input v-model="form.smtp_password" type="password" maxlength="1024" autocomplete="new-password" :placeholder="form.smtp_password_configured ? form.smtp_password_masked : '输入 SMTP 密码或授权码'">
          </label>
          <label v-if="form.smtp_password_configured" class="check-line"><input v-model="form.clear_smtp_password" type="checkbox"> 清除已保存的 SMTP 密码</label>
        </section>

        <section class="admin-section">
          <header><h2>发件与收件</h2><Mail :size="18" /></header>
          <label class="form-field"><span>发件人名称</span><input v-model.trim="form.from_name" maxlength="120" placeholder="指南中心"></label>
          <label class="form-field"><span>发件邮箱</span><input v-model.trim="form.from_email" type="email" maxlength="320" autocomplete="email" :required="form.enabled" placeholder="notice@example.com"></label>
          <label class="form-field"><span>管理员收件邮箱</span><input v-model.trim="form.admin_email" type="email" maxlength="320" autocomplete="email" :required="form.enabled" placeholder="admin@example.com"></label>
        </section>

        <section class="admin-section email-template-section">
          <header><h2>通知模板</h2><TextQuote :size="18" /></header>
          <div class="email-template-grid">
            <div>
              <h3>新反馈提醒</h3>
              <label class="form-field"><span>邮件主题</span><input v-model="form.admin_subject_template" maxlength="500" required></label>
              <label class="form-field"><span>邮件正文</span><textarea v-model="form.admin_body_template" rows="14" maxlength="20000" required /></label>
            </div>
            <div>
              <h3>管理员回复通知</h3>
              <label class="form-field"><span>邮件主题</span><input v-model="form.reply_subject_template" maxlength="500" required></label>
              <label class="form-field"><span>邮件正文</span><textarea v-model="form.reply_body_template" rows="14" maxlength="20000" required /></label>
            </div>
          </div>
          <small class="email-template-variables">可用变量：&#123;&#123;project_name&#125;&#125;、&#123;&#123;feedback_id&#125;&#125;、&#123;&#123;category&#125;&#125;、&#123;&#123;title&#125;&#125;、&#123;&#123;content&#125;&#125;、&#123;&#123;user_name&#125;&#125;、&#123;&#123;user_email&#125;&#125;、&#123;&#123;reply_email&#125;&#125;、&#123;&#123;admin_reply&#125;&#125;、&#123;&#123;feedback_url&#125;&#125;、&#123;&#123;admin_url&#125;&#125;</small>
        </section>
      </form>
    </div>
  </AdminAccessGate>
</template>