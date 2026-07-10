<template>
  <section class="admin-settings-board" aria-label="管理员配置中心">
    <div class="status-row">
      <span class="status-chip" :class="status.type">{{ statusLabel }}</span>
      <strong v-if="status.message" :class="status.type">{{ status.message }}</strong>
    </div>

    <section class="settings-panel">
      <div class="panel-head">
        <div>
          <h2>管理员访问 Token</h2>
          <p>这里保存本浏览器用于访问 guide-api 管理接口的 `GUIDE_API_ADMIN_TOKEN`。服务端真实 token 仍需在 `.env` 中设置。</p>
        </div>
        <span class="source-pill" :class="{ muted: !storedToken }">
          {{ storedToken ? '本机已保存' : '未保存' }}
        </span>
      </div>

      <form class="token-form" @submit.prevent="saveTokenAndValidate">
        <label>
          <span>GUIDE_API_ADMIN_TOKEN</span>
          <input
            v-model.trim="tokenForm.admin_token"
            type="password"
            autocomplete="current-password"
            placeholder="输入 guide-api 管理 token"
          />
        </label>
        <label class="remember-field">
          <input v-model="tokenForm.remember" type="checkbox" />
          <span>记住到本机浏览器</span>
        </label>
        <div class="form-actions">
          <button class="primary-btn" type="submit" :disabled="!tokenForm.admin_token || validating">
            {{ validating ? '验证中...' : '保存并验证' }}
          </button>
          <button class="soft-btn" type="button" :disabled="validating" @click="clearToken">
            清除本机 Token
          </button>
        </div>
      </form>
    </section>

    <section class="settings-panel">
      <div class="panel-head">
        <div>
          <h2>Sub2API 数据源</h2>
          <p>配置模型价格页需要读取的 sub2api 地址和管理员 x-api-key。密钥只保存到 guide-api 服务端，不会回显完整内容。</p>
        </div>
        <span class="source-pill" :class="{ muted: !settingsForm.sub2api_admin_api_key_configured }">
          {{ settingsForm.sub2api_admin_api_key_configured ? `已配置 ${settingsForm.sub2api_admin_api_key_masked}` : '未配置 key' }}
        </span>
      </div>

      <form class="runtime-form" @submit.prevent="saveRuntimeSettings">
        <label>
          <span>Sub2API 地址</span>
          <input
            v-model.trim="settingsForm.sub2api_base_url"
            type="url"
            placeholder="https://kkflow.org 或 http://127.0.0.1:端口"
            :disabled="!storedToken || savingSettings"
          />
        </label>

        <label>
          <span>Sub2API Admin x-api-key</span>
          <input
            v-model.trim="settingsForm.sub2api_admin_api_key"
            type="password"
            autocomplete="new-password"
            placeholder="留空则不修改已保存 key"
            :disabled="!storedToken || savingSettings"
          />
        </label>

        <label>
          <span>USD/CNY 汇率</span>
          <input
            v-model.number="settingsForm.usd_to_cny"
            type="number"
            min="0.0001"
            max="100"
            step="0.0001"
            :disabled="!storedToken || savingSettings"
          />
        </label>

        <fieldset class="platform-field">
          <legend>同步平台</legend>
          <label v-for="provider in availableProviders" :key="provider.value">
            <input
              v-model="settingsForm.pricing_platforms"
              type="checkbox"
              :value="provider.value"
              :disabled="!storedToken || savingSettings"
            />
            <span>{{ provider.label }}</span>
          </label>
        </fieldset>

        <fieldset class="provider-order-field">
          <legend>供应商展示排序</legend>
          <div class="field-head">
            <p>价格页左侧供应商、顶部标签和分组选项会按这里的顺序展示。</p>
            <button
              class="soft-btn small"
              type="button"
              :disabled="!storedToken || savingSettings || displayProviderOrder.length < 2"
              @click="resetProviderOrder"
            >
              恢复默认
            </button>
          </div>
          <div class="provider-order-list">
            <div v-for="(provider, index) in displayProviderOrder" :key="provider" class="provider-order-item">
              <span class="provider-rank">{{ index + 1 }}</span>
              <strong>{{ providerLabel(provider) }}</strong>
              <em>{{ provider }}</em>
              <div class="order-actions">
                <button
                  type="button"
                  :disabled="!storedToken || savingSettings || index === 0"
                  @click="moveProvider(provider, -1)"
                >
                  上移
                </button>
                <button
                  type="button"
                  :disabled="!storedToken || savingSettings || index === displayProviderOrder.length - 1"
                  @click="moveProvider(provider, 1)"
                >
                  下移
                </button>
              </div>
            </div>
          </div>
        </fieldset>

        <div class="settings-actions">
          <p>{{ storedToken ? sourceSummary : '请先保存并验证管理员 Token。' }}</p>
          <div>
            <button class="soft-btn" type="button" :disabled="!storedToken || loadingSource" @click="testSource">
              {{ loadingSource ? '检测中...' : '检测数据源' }}
            </button>
            <button class="primary-btn" type="submit" :disabled="!storedToken || savingSettings || !canSaveSettings">
              {{ savingSettings ? '保存中...' : '保存数据源配置' }}
            </button>
          </div>
        </div>
      </form>
    </section>

    <section class="settings-panel compact">
      <div class="panel-head">
        <div>
          <h2>管理入口</h2>
          <p>完成配置后，可以从顶部导航进入价格配置和反馈处理。</p>
        </div>
      </div>
      <div class="shortcut-grid">
        <a href="/guide/admin/pricing">
          <strong>价格配置</strong>
          <span>控制模型展示、分组展示、支付到账比例和排序。</span>
        </a>
        <a href="/guide/admin/feedback">
          <strong>反馈处理</strong>
          <span>查看用户反馈、回复用户并标记处理状态。</span>
        </a>
      </div>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import {
  clearAdminToken,
  isAdminTokenRemembered,
  readAdminToken,
  saveAdminToken,
} from './admin-session'

interface ApiResponse<T> {
  ok: boolean
  data: T
  error?: {
    message?: string
  }
}

interface RuntimeSettings {
  sub2api_base_url: string
  sub2api_admin_api_key_configured: boolean
  sub2api_admin_api_key_masked: string
  pricing_platforms: string[]
  provider_display_order: string[]
  usd_to_cny: number
}

interface AdminPricingConfig {
  settings: RuntimeSettings
  source: {
    configured: boolean
    platforms: string[]
    sub2api_api_base: string | null
  }
}

interface AdminPricingSource {
  source: {
    configured: boolean
    platforms: string[]
    sub2api_api_base: string | null
  }
  groups: unknown[]
  models_by_provider: Record<string, string[]>
}

const availableProviders = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'antigravity', label: 'Antigravity' },
  { value: 'grok', label: 'Grok' },
]

const defaultProviderOrder = availableProviders.map((provider) => provider.value)

const storedToken = ref('')
const validating = ref(false)
const savingSettings = ref(false)
const loadingSource = ref(false)
const sourceData = ref<AdminPricingSource | null>(null)
const status = reactive({
  type: 'idle' as 'idle' | 'success' | 'error' | 'warning',
  message: '',
})
const tokenForm = reactive({
  admin_token: '',
  remember: true,
})
const settingsForm = reactive({
  sub2api_base_url: '',
  sub2api_admin_api_key: '',
  sub2api_admin_api_key_configured: false,
  sub2api_admin_api_key_masked: '',
  pricing_platforms: ['openai', 'anthropic'],
  provider_display_order: ['openai', 'anthropic'],
  usd_to_cny: 6.8102,
})

const statusLabel = computed(() => {
  if (status.type === 'success') return '已配置'
  if (status.type === 'error') return '需检查'
  if (status.type === 'warning') return '待完善'
  return storedToken.value ? '已保存 Token' : '未配置'
})

const canSaveSettings = computed(() => {
  return Boolean(settingsForm.sub2api_base_url.trim())
    && settingsForm.pricing_platforms.length > 0
    && Number(settingsForm.usd_to_cny) > 0
})

const sourceSummary = computed(() => {
  if (!sourceData.value) return '保存后可检测 sub2api 数据源是否能读取模型和分组。'
  const modelCount = Object.values(sourceData.value.models_by_provider || {}).reduce((sum, items) => sum + items.length, 0)
  return `已读取 ${modelCount} 个来源模型，${sourceData.value.groups.length} 个来源分组。`
})

const displayProviderOrder = computed(() => {
  return providerOrderFor(settingsForm.provider_display_order, settingsForm.pricing_platforms)
})

onMounted(() => {
  storedToken.value = readAdminToken()
  tokenForm.admin_token = storedToken.value
  tokenForm.remember = isAdminTokenRemembered()
  if (storedToken.value) void loadSettings()
})

async function saveTokenAndValidate() {
  validating.value = true
  setStatus('idle', '正在验证管理员 Token...')
  try {
    saveAdminToken(tokenForm.admin_token, tokenForm.remember)
    storedToken.value = readAdminToken()
    await loadSettings()
    setStatus('success', '管理员 Token 已保存并验证通过。')
  } catch (error) {
    setStatus('error', error instanceof Error ? error.message : '管理员 Token 验证失败')
  } finally {
    validating.value = false
  }
}

function clearToken() {
  clearAdminToken()
  storedToken.value = ''
  tokenForm.admin_token = ''
  sourceData.value = null
  resetSettings()
  setStatus('idle', '本机管理员 Token 已清除。')
}

async function loadSettings() {
  const config = await adminFetch<AdminPricingConfig>('/admin/pricing/config')
  applySettings(config.settings)
  if (!config.source.configured) {
    setStatus('warning', '管理员 Token 可用，但 sub2api 数据源还未完整配置。')
  }
}

async function saveRuntimeSettings() {
  if (!canSaveSettings.value) return
  savingSettings.value = true
  setStatus('idle', '正在保存数据源配置...')
  try {
    const payload: Record<string, unknown> = {
      sub2api_base_url: settingsForm.sub2api_base_url,
      pricing_platforms: settingsForm.pricing_platforms,
      provider_display_order: displayProviderOrder.value,
      usd_to_cny: settingsForm.usd_to_cny,
    }
    if (settingsForm.sub2api_admin_api_key.trim()) {
      payload.sub2api_admin_api_key = settingsForm.sub2api_admin_api_key.trim()
    }
    const saved = await adminFetch<RuntimeSettings>('/admin/pricing/settings', {
      method: 'PUT',
      body: payload,
    })
    applySettings(saved)
    settingsForm.sub2api_admin_api_key = ''
    sourceData.value = await adminFetch<AdminPricingSource>('/admin/pricing/source?refresh=true')
    setStatus('success', `数据源配置已保存，${sourceSummary.value}`)
  } catch (error) {
    setStatus('error', error instanceof Error ? error.message : '数据源配置保存失败')
  } finally {
    savingSettings.value = false
  }
}

async function testSource() {
  loadingSource.value = true
  setStatus('idle', '正在检测 sub2api 数据源...')
  try {
    sourceData.value = await adminFetch<AdminPricingSource>('/admin/pricing/source?refresh=true')
    setStatus(
      sourceData.value.source.configured ? 'success' : 'warning',
      sourceData.value.source.configured ? '数据源检测通过。' : '数据源未配置完整。',
    )
  } catch (error) {
    setStatus('error', error instanceof Error ? error.message : '数据源检测失败')
  } finally {
    loadingSource.value = false
  }
}

async function adminFetch<T>(path: string, options: { method?: string; body?: unknown } = {}) {
  const response = await fetch(`/guide-api${path}`, {
    method: options.method || 'GET',
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${storedToken.value || tokenForm.admin_token}`,
      'x-admin-token': storedToken.value || tokenForm.admin_token,
      ...(options.body ? { 'content-type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })
  const body = await response.json() as ApiResponse<T>
  if (!response.ok || !body.ok) {
    throw new Error(body.error?.message || 'guide-api 请求失败')
  }
  return body.data
}

function applySettings(settings?: RuntimeSettings) {
  if (!settings) return
  settingsForm.sub2api_base_url = settings.sub2api_base_url || ''
  settingsForm.sub2api_admin_api_key = ''
  settingsForm.sub2api_admin_api_key_configured = Boolean(settings.sub2api_admin_api_key_configured)
  settingsForm.sub2api_admin_api_key_masked = settings.sub2api_admin_api_key_masked || ''
  settingsForm.pricing_platforms = settings.pricing_platforms?.length ? [...settings.pricing_platforms] : ['openai', 'anthropic']
  settingsForm.provider_display_order = providerOrderFor(settings.provider_display_order || [], settingsForm.pricing_platforms)
  settingsForm.usd_to_cny = Number(settings.usd_to_cny || 6.8102)
}

function resetSettings() {
  settingsForm.sub2api_base_url = ''
  settingsForm.sub2api_admin_api_key = ''
  settingsForm.sub2api_admin_api_key_configured = false
  settingsForm.sub2api_admin_api_key_masked = ''
  settingsForm.pricing_platforms = ['openai', 'anthropic']
  settingsForm.provider_display_order = ['openai', 'anthropic']
  settingsForm.usd_to_cny = 6.8102
}

function providerOrderFor(order: string[], selectedProviders: string[]) {
  const selected = selectedProviders.filter((provider) => defaultProviderOrder.includes(provider))
  const ordered: string[] = []
  for (const provider of order) {
    if (selected.includes(provider) && !ordered.includes(provider)) ordered.push(provider)
  }
  for (const provider of defaultProviderOrder) {
    if (selected.includes(provider) && !ordered.includes(provider)) ordered.push(provider)
  }
  return ordered
}

function providerLabel(value: string) {
  return availableProviders.find((provider) => provider.value === value)?.label || value
}

function moveProvider(provider: string, direction: -1 | 1) {
  const current = [...displayProviderOrder.value]
  const index = current.indexOf(provider)
  const nextIndex = index + direction
  if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return
  const [item] = current.splice(index, 1)
  current.splice(nextIndex, 0, item)
  settingsForm.provider_display_order = current
}

function resetProviderOrder() {
  settingsForm.provider_display_order = defaultProviderOrder.filter((provider) => {
    return settingsForm.pricing_platforms.includes(provider)
  })
}

function setStatus(type: 'idle' | 'success' | 'error' | 'warning', message: string) {
  status.type = type
  status.message = message
}
</script>

<style scoped>
.admin-settings-board {
  display: grid;
  gap: 12px;
  color: #102033;
}

.settings-panel {
  border: 1px solid #d5e0ec;
  border-radius: 8px;
  padding: 16px;
  background: #ffffff;
}

.settings-panel.compact {
  padding-bottom: 14px;
}

.panel-head,
.settings-actions,
.status-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.status-row {
  align-items: center;
  justify-content: flex-start;
  min-height: 34px;
}

.panel-head {
  margin-bottom: 14px;
}

.panel-head h2 {
  margin: 0;
  color: #102033;
  font-size: 18px;
  line-height: 1.35;
}

.panel-head p,
.settings-actions p,
.status-row strong,
.shortcut-grid span {
  margin: 0;
  color: #516882;
  font-size: 13px;
  line-height: 1.58;
}

.token-form,
.runtime-form {
  display: grid;
  gap: 12px;
}

.token-form {
  grid-template-columns: minmax(260px, 1fr) auto auto;
  align-items: end;
}

.runtime-form {
  grid-template-columns: minmax(240px, 1.2fr) minmax(240px, 1.2fr) 160px minmax(240px, 1fr);
  align-items: start;
}

.runtime-form .settings-actions {
  grid-column: 1 / -1;
  align-items: center;
}

.settings-actions div,
.form-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.token-form label,
.runtime-form label,
.platform-field,
.provider-order-field {
  display: grid;
  gap: 6px;
}

.token-form label span,
.runtime-form label span,
.platform-field legend,
.provider-order-field legend {
  color: #24364b;
  font-size: 12px;
  font-weight: 800;
}

.token-form input[type="password"],
.runtime-form input[type="url"],
.runtime-form input[type="password"],
.runtime-form input[type="number"] {
  width: 100%;
  min-height: 38px;
  border: 1px solid #c7d4e4;
  border-radius: 8px;
  padding: 0 10px;
  color: #18283b;
  background: #ffffff;
  font: inherit;
}

.token-form input:focus,
.runtime-form input:focus {
  border-color: #238b8d;
  outline: 0;
  box-shadow: 0 0 0 3px rgba(35, 139, 141, 0.14);
}

.remember-field {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 38px;
  color: #24364b;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
}

.remember-field input,
.platform-field input {
  width: 16px;
  height: 16px;
  accent-color: #146c6f;
}

.platform-field {
  min-width: 0;
  margin: 0;
  border: 0;
  padding: 0;
}

.provider-order-field {
  grid-column: 1 / -1;
  min-width: 0;
  margin: 0;
  border: 1px solid #d5e0ec;
  border-radius: 8px;
  padding: 12px;
  background: #f8fafc;
}

.field-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.field-head p {
  margin: 0;
  color: #516882;
  font-size: 13px;
  line-height: 1.5;
}

.provider-order-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 8px;
  margin-top: 6px;
}

.provider-order-item {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  min-height: 54px;
  border: 1px solid #dbe5ef;
  border-radius: 8px;
  padding: 8px;
  background: #ffffff;
}

.provider-rank {
  display: inline-flex;
  width: 26px;
  height: 26px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  color: #0b6765;
  background: #dff4f1;
  font-size: 12px;
  font-weight: 900;
}

.provider-order-item strong,
.provider-order-item em {
  min-width: 0;
}

.provider-order-item strong {
  overflow: hidden;
  color: #102033;
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.provider-order-item em {
  grid-column: 2;
  margin-top: -6px;
  color: #617085;
  font-size: 11px;
  font-style: normal;
  font-weight: 700;
}

.order-actions {
  grid-column: 3;
  grid-row: 1 / span 2;
  display: flex;
  gap: 4px;
}

.order-actions button {
  min-height: 30px;
  border: 1px solid #d0dbe8;
  border-radius: 8px;
  padding: 0 8px;
  color: #27384b;
  background: #f5f8fb;
  font: inherit;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
}

.order-actions button:hover:not(:disabled) {
  border-color: #7ab8b1;
  color: #0b6765;
  background: #eef8f7;
}

.order-actions button:disabled {
  cursor: not-allowed;
  opacity: 0.46;
}

.platform-field label {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 24px;
  color: #27384b;
  font-size: 13px;
  font-weight: 700;
}

.primary-btn,
.soft-btn {
  display: inline-flex;
  min-height: 38px;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  padding: 0 13px;
  font: inherit;
  font-weight: 800;
  cursor: pointer;
  transition: background 160ms ease, border-color 160ms ease, color 160ms ease, opacity 160ms ease;
  white-space: nowrap;
}

.primary-btn {
  border: 1px solid #146c6f;
  color: #ffffff;
  background: #146c6f;
}

.soft-btn {
  border: 1px solid #d0dbe8;
  color: #27384b;
  background: #f5f8fb;
}

.soft-btn.small {
  min-height: 32px;
  padding: 0 10px;
  font-size: 12px;
}

.primary-btn:hover:not(:disabled) {
  border-color: #0f5c5f;
  background: #0f5c5f;
}

.soft-btn:hover:not(:disabled) {
  border-color: #aec0d4;
  background: #eef4f8;
}

.primary-btn:disabled,
.soft-btn:disabled {
  cursor: not-allowed;
  opacity: 0.56;
}

.status-chip,
.source-pill {
  display: inline-flex;
  min-height: 26px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 0 10px;
  color: #526982;
  font-size: 12px;
  font-weight: 800;
  white-space: nowrap;
  background: #edf2f7;
}

.status-chip.success {
  color: #04743b;
  background: #dff9e9;
}

.status-chip.error {
  color: #a23124;
  background: #ffe6e1;
}

.status-chip.warning {
  color: #8a4b05;
  background: #fff1d8;
}

.source-pill {
  color: #04743b;
  background: #dff9e9;
}

.source-pill.muted {
  color: #617085;
  background: #eef2f7;
}

.status-row strong.success {
  color: #04743b;
}

.status-row strong.error {
  color: #a23124;
}

.status-row strong.warning {
  color: #8a4b05;
}

.shortcut-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.shortcut-grid a {
  display: grid;
  gap: 6px;
  min-height: 86px;
  align-content: center;
  border: 1px solid #d5e0ec;
  border-radius: 8px;
  padding: 14px;
  color: #102033;
  text-decoration: none;
  background: #f8fafc;
}

.shortcut-grid a:hover {
  border-color: #7ab8b1;
  background: #eef8f7;
}

.shortcut-grid strong {
  font-size: 15px;
}

@media (max-width: 1080px) {
  .token-form,
  .runtime-form {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 720px) {
  .token-form,
  .runtime-form,
  .shortcut-grid {
    grid-template-columns: 1fr;
  }

  .panel-head,
  .field-head,
  .settings-actions,
  .settings-actions div,
  .form-actions,
  .status-row {
    align-items: stretch;
    flex-direction: column;
  }

  .primary-btn,
  .soft-btn {
    width: 100%;
  }

  .provider-order-item {
    grid-template-columns: 28px minmax(0, 1fr);
  }

  .order-actions {
    grid-column: 1 / -1;
    grid-row: auto;
  }

  .order-actions button {
    flex: 1 1 0;
  }
}
</style>
