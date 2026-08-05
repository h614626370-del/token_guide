<script setup lang="ts">
import { Code2, Download, KeyRound, RefreshCw, ShieldAlert, Terminal } from 'lucide-vue-next'
import type { ApiSuccess } from '~/types/api'
import { apiErrorMessage } from '~/types/api'
import type { InstallerCommands, InstallerConfig, InstallerPlatform, InstallerTool } from '~/types/install'
import type { PlaygroundKey } from '~/types/playground'

const site = useSiteConfigState()
useSeoMeta({
  title: '自动安装',
  description: () => `自动安装并配置 Codex CLI 与 Claude Code，接入${site.value.project_name}。`,
})

const { session, loading: sessionLoading, error: sessionError, refresh: refreshSession } = useGuideSessionState()
const tool = ref<InstallerTool>('codex')
const platform = ref<InstallerPlatform>('windows')
const config = ref<InstallerConfig | null>(null)
const keys = ref<PlaygroundKey[]>([])
const selectedKeyId = ref<number | null>(null)
const keysLoading = ref(false)
const commandLoading = ref(false)
const commands = ref<InstallerCommands | null>(null)
const error = ref('')

const toolName = computed(() => tool.value === 'codex' ? 'Codex CLI' : 'Claude Code')
const protocolName = computed(() => tool.value === 'codex' ? 'OpenAI' : 'Anthropic')
const defaultModel = computed(() => tool.value === 'codex'
  ? config.value?.settings.codex_default_model
  : config.value?.settings.claude_default_model)

onMounted(async () => {
  await loadConfig()
  const current = await refreshSession()
  if (current?.authenticated) await loadKeys()
})

onBeforeUnmount(clearCommands)

watch(tool, async () => {
  selectedKeyId.value = null
  clearCommands()
  if (session.value?.authenticated) await loadKeys()
})

watch([selectedKeyId, platform], async () => {
  clearCommands()
  if (selectedKeyId.value) await loadCommands()
})

async function loadConfig() {
  try {
    const response = await $fetch<ApiSuccess<InstallerConfig>>('/api/install/config')
    config.value = response.data
  } catch (cause) {
    error.value = apiErrorMessage(cause, '安装配置读取失败')
  }
}

async function loadKeys() {
  keysLoading.value = true
  error.value = ''
  clearCommands()
  try {
    const response = await $fetch<ApiSuccess<PlaygroundKey[]>>('/api/install/keys', { query: { tool: tool.value } })
    keys.value = response.data
    selectedKeyId.value = keys.value[0]?.id || null
  } catch (cause) {
    keys.value = []
    selectedKeyId.value = null
    error.value = apiErrorMessage(cause, 'API Key 列表读取失败')
  } finally {
    keysLoading.value = false
  }
}

async function loadCommands() {
  if (!selectedKeyId.value) return
  commandLoading.value = true
  error.value = ''
  try {
    const response = await $fetch<ApiSuccess<InstallerCommands>>('/api/install/command', {
      method: 'POST',
      body: { tool: tool.value, platform: platform.value, key_id: selectedKeyId.value },
    })
    commands.value = response.data
  } catch (cause) {
    error.value = apiErrorMessage(cause, '安装命令生成失败')
  } finally {
    commandLoading.value = false
  }
}

function clearCommands() {
  commands.value = null
}
</script>

<template>
  <div class="tool-page install-page">
    <div class="tool-page__inner">
      <ToolPageHeading eyebrow="CLI Setup" title="自动安装" description="检测本机环境、安装命令行工具并写入当前站点配置。">
        <template #actions>
          <span v-if="session?.user" class="session-chip">{{ session.user.username || session.user.email }}</span>
        </template>
      </ToolPageHeading>

      <div class="install-tool-tabs" role="tablist" aria-label="命令行工具">
        <button type="button" role="tab" :aria-selected="tool === 'codex'" :class="{ active: tool === 'codex' }" @click="tool = 'codex'">
          <Terminal :size="19" />Codex CLI
        </button>
        <button type="button" role="tab" :aria-selected="tool === 'claude'" :class="{ active: tool === 'claude' }" @click="tool = 'claude'">
          <Code2 :size="19" />Claude Code
        </button>
      </div>

      <div class="install-warning">
        <ShieldAlert :size="20" />
        <p>生成的命令包含所选 API Key。请只在自己的可信设备运行，不要转发、截图或公开命令。</p>
      </div>

      <SessionGate v-if="sessionLoading || !session?.authenticated" :loading="sessionLoading" :message="sessionError" />

      <div v-else class="install-layout">
        <aside class="install-key-panel">
          <header><KeyRound :size="20" /><h2>选择 API Key</h2><span>{{ keys.length }} 个</span></header>
          <label>
            <span>{{ protocolName }} 协议 Key</span>
            <div>
              <select v-model.number="selectedKeyId" :disabled="keysLoading" aria-label="选择 API Key">
                <option :value="null" disabled>{{ keysLoading ? '正在读取...' : (keys.length ? '请选择 Key' : '暂无可用 Key') }}</option>
                <option v-for="item in keys" :key="item.id" :value="item.id">{{ item.name }} · {{ item.masked_key }}</option>
              </select>
              <button class="icon-button" type="button" title="刷新 Key 列表" :disabled="keysLoading" @click="loadKeys">
                <RefreshCw :size="17" :class="{ spinning: keysLoading }" />
              </button>
            </div>
          </label>
          <p>仅显示 {{ protocolName }} 协议分组中的有效 Key。</p>
          <dl v-if="config">
            <div><dt>工具</dt><dd>{{ toolName }}</dd></div>
            <div><dt>Provider</dt><dd>{{ config.settings.provider_id }}</dd></div>
            <div><dt>Base URL</dt><dd>{{ config.settings.base_url }}</dd></div>
            <div><dt>默认模型</dt><dd>{{ defaultModel || '由客户端决定' }}</dd></div>
          </dl>
        </aside>

        <main class="install-methods">
          <header>
            <div><h2>安装方式</h2><p>本地下载执行或 HTTPS 远程一键执行</p></div>
            <div class="install-os-tabs" role="tablist" aria-label="操作系统">
              <button v-for="item in ([['windows', 'Windows'], ['macos', 'macOS'], ['linux', 'Linux']] as const)" :key="item[0]" type="button" role="tab" :aria-selected="platform === item[0]" :class="{ active: platform === item[0] }" @click="platform = item[0]">{{ item[1] }}</button>
            </div>
          </header>

          <div v-if="error" class="tool-alert tool-alert--error">{{ error }}</div>
          <div v-if="commandLoading" class="install-loading">正在生成安装命令...</div>
          <div v-else-if="!selectedKeyId" class="empty-result"><strong>选择 API Key 后生成命令</strong></div>

          <template v-else-if="commands">
            <section class="install-method">
              <header><div><span>方法一</span><h3>远程一键安装</h3></div><em>推荐</em></header>
              <p>自动下载本站已发布脚本并执行，完成后清除当前进程中的 Key。</p>
              <InstallCommandBlock v-for="item in commands.remote" :key="item.label" :label="item.label" :command="item.command" />
            </section>

            <section class="install-method">
              <header><div><span>方法二</span><h3>下载脚本后执行</h3></div></header>
              <p>先保存脚本，在终端进入下载目录后运行。</p>
              <a class="secondary-command install-download" :href="commands.download_url" download><Download :size="17" />下载 {{ commands.filename }}</a>
              <InstallCommandBlock v-for="item in commands.local" :key="item.label" :label="item.label" :command="item.command" />
              <code class="install-checksum">SHA256: {{ commands.checksum }}</code>
            </section>
          </template>
        </main>
      </div>
    </div>
  </div>
</template>
