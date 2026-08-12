<script setup lang="ts">
import { ExternalLink, Eye, EyeOff, RefreshCw, RotateCcw, Save, Send, Settings2 } from 'lucide-vue-next'
import type { ApiSuccess } from '~/types/api'
import { apiErrorMessage } from '~/types/api'
import type { InstallerPlatform, InstallerScriptDetail, InstallerScriptSummary, InstallerSettings, InstallerTool } from '~/types/install'
import type { AdminPricingSource, SourceGroup } from '~/types/admin'

definePageMeta({ layout: 'admin' })
useSeoMeta({ title: '脚本配置', robots: 'noindex, nofollow' })

const admin = useAdminSessionState()
const tool = ref<InstallerTool>('codex')
const platform = ref<InstallerPlatform>('windows')
const scripts = ref<InstallerScriptSummary[]>([])
const detail = ref<InstallerScriptDetail | null>(null)
const content = ref('')
const settings = reactive<InstallerSettings>({
  provider_id: '',
  base_url: '',
  codex_default_model: '',
  claude_default_model: '',
  codex_enabled: true,
  claude_enabled: true,
  group_models: [],
})
const pricingSource = ref<AdminPricingSource | null>(null)
const activeTab = ref<'edit' | 'diff' | 'history'>('edit')
const loading = ref(false)
const saving = ref(false)
const loaded = ref(false)
const notice = reactive({ type: 'idle' as 'idle' | 'success' | 'error', message: '' })

const selectedId = computed(() => `${tool.value}-${platform.value}`)
const diffLines = computed(() => lineDiff(detail.value?.published_content || detail.value?.default_content || '', content.value))
const openaiGroups = computed(() => (pricingSource.value?.groups || [])
  .filter(item => item.provider === 'openai')
  .sort((a, b) => a.sort_order - b.sort_order || a.source_name.localeCompare(b.source_name, 'zh-CN', { numeric: true })))

watch(() => admin.session.value?.admin, (authenticated) => {
  if (authenticated && !loaded.value) void loadAll()
}, { immediate: true })
watch([tool, platform], loadSelected)

async function loadAll() {
  loading.value = true
  notice.message = ''
  try {
    const response = await $fetch<ApiSuccess<{ scripts: InstallerScriptSummary[], settings: InstallerSettings }>>('/api/admin/installers')
    scripts.value = response.data.scripts
    Object.assign(settings, response.data.settings)
    try {
      const sourceResponse = await $fetch<ApiSuccess<AdminPricingSource>>('/api/admin/pricing/source')
      pricingSource.value = sourceResponse.data
    } catch {
      pricingSource.value = null
    }
    await loadSelected()
    loaded.value = true
  } catch (cause) {
    fail(cause, '脚本配置读取失败')
  } finally {
    loading.value = false
  }
}

async function loadSelected() {
  loading.value = true
  notice.message = ''
  try {
    const response = await $fetch<ApiSuccess<InstallerScriptDetail>>(`/api/admin/installers/${selectedId.value}`)
    applyDetail(response.data)
  } catch (cause) {
    fail(cause, '脚本内容读取失败')
  } finally {
    loading.value = false
  }
}

async function saveSettings() {
  await mutate('公共配置保存失败', async () => {
    const response = await $fetch<ApiSuccess<InstallerSettings>>('/api/admin/installers/settings', { method: 'PUT', body: settings })
    Object.assign(settings, response.data)
    await loadSelected()
    notice.message = '公共配置已保存。'
  })
}

async function saveDraft() {
  await mutate('脚本草稿保存失败', async () => {
    const response = await $fetch<ApiSuccess<InstallerScriptDetail>>(`/api/admin/installers/${selectedId.value}`, { method: 'PUT', body: { content: content.value } })
    applyDetail(response.data)
    notice.message = '脚本草稿已保存，前台仍使用已发布版本。'
  })
}

async function publishScript() {
  if (!window.confirm(`确定发布 ${detail.value?.label || selectedId.value}？发布后用户下载的脚本会立即变化。`)) return
  await mutate('脚本发布失败', async () => {
    const response = await $fetch<ApiSuccess<InstallerScriptDetail>>(`/api/admin/installers/${selectedId.value}/publish`, { method: 'POST', body: { content: content.value } })
    applyDetail(response.data)
    notice.message = '脚本已发布到前台。'
  })
}

async function publishDefault() {
  if (!window.confirm('确定恢复并发布仓库默认脚本？')) return
  await mutate('默认脚本发布失败', async () => {
    const response = await $fetch<ApiSuccess<InstallerScriptDetail>>(`/api/admin/installers/${selectedId.value}/default`, { method: 'POST' })
    applyDetail(response.data)
    notice.message = '默认脚本已发布。'
  })
}

async function restoreVersion(versionId: number) {
  await mutate('历史版本恢复失败', async () => {
    const response = await $fetch<ApiSuccess<InstallerScriptDetail>>(`/api/admin/installers/${selectedId.value}/versions/${versionId}/restore`, { method: 'POST' })
    applyDetail(response.data)
    activeTab.value = 'edit'
    notice.message = '历史版本已恢复为草稿。'
  })
}

async function mutate(fallback: string, run: () => Promise<void>) {
  saving.value = true
  notice.message = ''
  try {
    await run()
    notice.type = 'success'
  } catch (cause) {
    fail(cause, fallback)
  } finally {
    saving.value = false
  }
}

function fail(cause: unknown, fallback: string) {
  notice.type = 'error'
  notice.message = apiErrorMessage(cause, fallback)
}

function applyDetail(value: InstallerScriptDetail) {
  detail.value = value
  content.value = value.content
  const index = scripts.value.findIndex(item => item.id === value.id)
  if (index >= 0) scripts.value[index] = value
}

function formatTime(value: string | null | undefined) {
  if (!value) return '未发布'
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function groupModel(groupId: string) {
  return settings.group_models.find(item => item.tool === 'codex' && item.group_id === groupId)?.model || ''
}

function setGroupModel(groupId: string, model: string) {
  settings.group_models = settings.group_models.filter(item => !(item.tool === 'codex' && item.group_id === groupId))
  if (model) settings.group_models.push({ tool: 'codex', group_id: groupId, model })
}

function modelsForGroup(group: SourceGroup) {
  if (group.model_list_enabled) return [...group.model_names]
  const mapping = pricingSource.value?.model_group_ids_by_provider?.openai || {}
  return Object.entries(mapping)
    .filter(([, groupIds]) => groupIds.includes(group.source_id))
    .map(([model]) => model)
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
}

function lineDiff(before: string, after: string) {
  const left = before.split(/\r?\n/)
  const right = after.split(/\r?\n/)
  const rows: Array<{ type: 'same' | 'add' | 'remove', text: string }> = []
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const beforeLine = left[index]
    const afterLine = right[index]
    if (beforeLine === afterLine) rows.push({ type: 'same', text: beforeLine || '' })
    else {
      if (beforeLine !== undefined) rows.push({ type: 'remove', text: beforeLine })
      if (afterLine !== undefined) rows.push({ type: 'add', text: afterLine })
    }
  }
  return rows
}
</script>

<template>
  <AdminAccessGate>
    <div class="admin-page admin-installers-page">
      <header class="admin-page-heading">
        <span>Installer scripts</span>
        <h1>脚本配置</h1>
        <p>分类维护 Codex CLI 与 Claude Code 的三平台安装脚本。</p>
        <div class="admin-page-heading__actions">
          <button class="secondary-command" type="button" :disabled="loading || saving" @click="loadAll"><RefreshCw :size="16" :class="{ spinning: loading }" />刷新</button>
          <button class="secondary-command" type="button" :disabled="loading || saving || !detail" @click="saveDraft"><Save :size="16" />保存草稿</button>
          <button class="primary-command" type="button" :disabled="loading || saving || !detail" @click="publishScript"><Send :size="16" />发布</button>
        </div>
      </header>

      <div v-if="notice.message" :class="['tool-alert', notice.type === 'error' ? 'tool-alert--error' : 'tool-alert--success']">{{ notice.message }}</div>

      <section class="admin-section installer-settings">
        <header><h2><Settings2 :size="18" />安装器设置</h2><span>控制前台工具入口与公共参数</span></header>
        <form class="admin-settings-grid" @submit.prevent="saveSettings">
          <div class="installer-model-policy">
            <strong>模型选择规则</strong>
            <span>分组开启模型白名单时，安装器只会使用白名单模型；下面的分组模型和默认模型用于未启用白名单的分组。</span>
          </div>
          <fieldset class="installer-visibility-settings">
            <legend>前台显示</legend>
            <label :class="['installer-visibility-toggle', { active: settings.codex_enabled }]">
              <input v-model="settings.codex_enabled" type="checkbox">
              <span class="installer-toggle-track" aria-hidden="true"><i /></span>
              <span><strong>Codex CLI</strong><small>{{ settings.codex_enabled ? '在自动安装页显示' : '已从自动安装页隐藏' }}</small></span>
              <Eye v-if="settings.codex_enabled" :size="18" />
              <EyeOff v-else :size="18" />
            </label>
            <label :class="['installer-visibility-toggle', { active: settings.claude_enabled }]">
              <input v-model="settings.claude_enabled" type="checkbox">
              <span class="installer-toggle-track" aria-hidden="true"><i /></span>
              <span><strong>Claude Code</strong><small>{{ settings.claude_enabled ? '在自动安装页显示' : '已从自动安装页隐藏' }}</small></span>
              <Eye v-if="settings.claude_enabled" :size="18" />
              <EyeOff v-else :size="18" />
            </label>
          </fieldset>
          <label class="form-field"><span>PROVIDER_ID</span><input v-model.trim="settings.provider_id" maxlength="80" required></label>
          <label class="form-field"><span>BASE_URL</span><input v-model.trim="settings.base_url" type="url" maxlength="500" required></label>
          <label class="form-field"><span>Codex 回退模型</span><input v-model.trim="settings.codex_default_model" maxlength="120"></label>
          <label class="form-field"><span>Claude 回退模型</span><input v-model.trim="settings.claude_default_model" maxlength="120" placeholder="留空则由 Claude Code 决定"></label>
          <fieldset class="installer-group-models">
            <legend>Codex 分组模型</legend>
            <p>白名单分组会自动限定可选项；未指定的分组使用 Codex 回退模型。</p>
            <div v-if="openaiGroups.length" class="installer-group-model-list">
              <label v-for="group in openaiGroups" :key="group.source_id">
                <span><strong>{{ group.source_name }}</strong><small>分组 ID {{ group.source_id }}</small></span>
                <select :value="groupModel(group.source_id)" :aria-label="`${group.source_name} 自动安装模型`" :disabled="group.model_list_enabled && !group.model_names.length" @change="setGroupModel(group.source_id, ($event.target as HTMLSelectElement).value)">
                  <option value="">{{ group.model_list_enabled ? (group.model_names.length ? '由白名单自动选择' : '白名单为空，无法安装') : `跟随默认：${settings.codex_default_model || '由客户端决定'}` }}</option>
                  <option v-for="model in modelsForGroup(group)" :key="model" :value="model">{{ model }}</option>
                  <option v-if="groupModel(group.source_id) && !modelsForGroup(group).includes(groupModel(group.source_id))" :value="groupModel(group.source_id)">{{ groupModel(group.source_id) }}（已保存）</option>
                </select>
              </label>
            </div>
            <div v-else class="empty-result"><strong>暂无 OpenAI 协议分组</strong></div>
          </fieldset>
          <button class="primary-command admin-save-command" type="submit" :disabled="saving"><Save :size="16" />{{ saving ? '保存中...' : '保存安装器设置' }}</button>
        </form>
      </section>

      <section class="admin-section installer-editor">
        <div class="installer-classification">
          <div class="segmented-control" aria-label="工具分类">
            <button type="button" :class="{ active: tool === 'codex' }" @click="tool = 'codex'">Codex CLI</button>
            <button type="button" :class="{ active: tool === 'claude' }" @click="tool = 'claude'">Claude Code</button>
          </div>
          <div class="segmented-control" aria-label="系统分类">
            <button type="button" :class="{ active: platform === 'windows' }" @click="platform = 'windows'">Windows</button>
            <button type="button" :class="{ active: platform === 'macos' }" @click="platform = 'macos'">macOS</button>
            <button type="button" :class="{ active: platform === 'linux' }" @click="platform = 'linux'">Linux</button>
          </div>
        </div>

        <template v-if="detail">
          <div class="admin-doc-status-grid">
            <span>脚本：{{ detail.filename }}</span>
            <span>来源：{{ detail.source }}</span>
            <span>发布时间：{{ formatTime(detail.published_at) }}</span>
            <span>草稿时间：{{ formatTime(detail.draft_updated_at) }}</span>
            <span>SHA256：{{ detail.checksum }}</span>
            <a :href="`/api/install/scripts/${tool}/${platform}`" target="_blank"><ExternalLink :size="14" />打开已发布脚本</a>
          </div>

          <div class="admin-tabs">
            <button type="button" :class="{ active: activeTab === 'edit' }" @click="activeTab = 'edit'">编辑</button>
            <button type="button" :class="{ active: activeTab === 'diff' }" @click="activeTab = 'diff'">差异</button>
            <button type="button" :class="{ active: activeTab === 'history' }" @click="activeTab = 'history'">历史</button>
          </div>

          <div v-show="activeTab === 'edit'" class="installer-code-editor">
            <textarea v-model="content" maxlength="200000" spellcheck="false" aria-label="安装脚本内容" />
            <small>{{ content.length }} / 200000 · 必须保留模板变量</small>
          </div>

          <pre v-show="activeTab === 'diff'" class="admin-doc-diff"><code><span v-for="(line, index) in diffLines" :key="index" :class="`diff-${line.type}`">{{ line.type === 'add' ? '+ ' : line.type === 'remove' ? '- ' : '  ' }}{{ line.text }}
</span></code></pre>

          <div v-show="activeTab === 'history'" class="admin-doc-history">
            <article v-for="version in detail.history" :key="version.version_id">
              <header><div><strong>#{{ version.version_id }} · {{ version.action }}</strong><span>{{ version.source }} · {{ formatTime(version.created_at) }}</span></div><button class="secondary-command" type="button" :disabled="saving" @click="restoreVersion(version.version_id)"><RotateCcw :size="16" />恢复为草稿</button></header>
            </article>
            <div v-if="!detail.history.length" class="empty-result"><strong>暂无历史版本</strong></div>
          </div>

          <div class="admin-doc-footer-actions">
            <button class="secondary-command" type="button" :disabled="saving" @click="publishDefault"><RotateCcw :size="16" />发布默认脚本</button>
            <button class="secondary-command" type="button" :disabled="saving" @click="saveDraft"><Save :size="16" />保存草稿</button>
            <button class="primary-command" type="button" :disabled="saving" @click="publishScript"><Send :size="16" />发布到前台</button>
          </div>
        </template>
      </section>
    </div>
  </AdminAccessGate>
</template>
