<script setup lang="ts">
import { KeyRound, LogIn } from 'lucide-vue-next'

const admin = useAdminSessionState()
const token = ref('')

onMounted(() => { void admin.ensureLoaded() })

async function submit() {
  if (!token.value.trim()) return
  const success = await admin.login(token.value)
  if (success) token.value = ''
}
</script>

<template>
  <section v-if="!admin.initialized.value" class="admin-login-panel">
    <div class="admin-login-panel__mark"><KeyRound :size="24" /></div>
    <div>
      <span>Administrator</span>
      <h1>正在确认登录状态</h1>
      <p>请稍候。</p>
    </div>
  </section>
  <slot v-else-if="admin.session.value?.admin" />
  <section v-else class="admin-login-panel">
    <div class="admin-login-panel__mark"><KeyRound :size="24" /></div>
    <div>
      <span>Administrator</span>
      <h1>管理员登录</h1>
      <p>管理员凭据验证后只保存在加密 HttpOnly 会话中。</p>
    </div>
    <form @submit.prevent="submit">
      <label class="form-field">
        <span>管理员 Token</span>
        <input v-model="token" type="password" autocomplete="current-password" required autofocus>
      </label>
      <div v-if="admin.loginError.value" class="tool-alert tool-alert--error">{{ admin.loginError.value }}</div>
      <button class="primary-command" type="submit" :disabled="admin.busy.value || !token.trim()">
        <LogIn :size="17" />
        {{ admin.busy.value ? '验证中...' : '登录' }}
      </button>
    </form>
  </section>
</template>
