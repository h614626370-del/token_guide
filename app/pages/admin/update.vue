<script setup lang="ts">
import {
  Download,
  RefreshCcw,
  RotateCcw,
  Server,
  ShieldAlert,
  Terminal,
} from 'lucide-vue-next'
import type { ApiSuccess } from '~/types/api'
import { apiErrorMessage } from '~/types/api'
import type { UpdateStatusView } from '~/types/update'

definePageMeta({ layout: 'admin' })
useSeoMeta({ title: '系统更新', robots: 'noindex, nofollow' })

const admin = useAdminSessionState()
const loading = ref(false)
const checking = ref(false)
const applying = ref(false)
const restarting = ref(false)
const loaded = ref(false)
const notice = reactive({ type: 'idle' as 'idle' | 'success' | 'error', message: '' })
const status = ref<UpdateStatusView | null>(null)
let pollTimer: ReturnType<typeof setInterval> | null = null

watch(() => admin.session.value?.admin, (authenticated) => {
  if (authenticated && !loaded.value) void loadStatus()
}, { immediate: true })

onBeforeUnmount(() => stopPolling())

async function loadStatus() {
  loading.value = true
  notice.type = 'idle'
  notice.message = ''
  try {
    const response = await $fetch<ApiSuccess<UpdateStatusView>>('/api/admin/update/status')
    status.value = response.data
    loaded.value = true
    syncPolling(response.data)
  } catch (cause) {
    notice.type = 'error'
    notice.message = apiErrorMessage(cause, '读取更新状态失败')
  } finally {
    loading.value = false
  }
}

async function checkUpdate() {
  checking.value = true
  notice.type = 'idle'
  notice.message = ''
  try {
    const response = await $fetch<ApiSuccess<UpdateStatusView>>('/api/admin/update/check', {
      method: 'POST',
    })
    status.value = response.data
    notice.type = 'success'
    notice.message = response.data.update_available
      ? `发现新版本 ${response.data.latest_tag}。`
      : '当前已是最新版本。'
    syncPolling(response.data)
  } catch (cause) {
    notice.type = 'error'
    notice.message = apiErrorMessage(cause, '检测更新失败')
    await loadStatus()
  } finally {
    checking.value = false
  }
}

async function applyUpdate() {
  if (!status.value?.update_available) return
  if (!window.confirm(`确认下载并更新到 ${status.value.latest_tag}？更新过程中服务会短暂中断。`)) {
    return
  }
  applying.value = true
  notice.type = 'idle'
  notice.message = ''
  try {
    const response = await $fetch<ApiSuccess<UpdateStatusView>>('/api/admin/update/apply', {
      method: 'POST',
    })
    status.value = response.data
    notice.type = 'success'
    notice.message = '已开始下载最新镜像，请查看下方进度。'
    syncPolling(response.data)
  } catch (cause) {
    notice.type = 'error'
    notice.message = apiErrorMessage(cause, '下载更新失败')
    await loadStatus()
  } finally {
    applying.value = false
  }
}

async function restartNow() {
  if (!window.confirm('确认立即重启服务？当前连接会短暂中断。')) return
  restarting.value = true
  notice.type = 'idle'
  notice.message = ''
  try {
    const response = await $fetch<ApiSuccess<UpdateStatusView>>('/api/admin/update/restart', {
      method: 'POST',
    })
    status.value = response.data
    notice.type = 'success'
    notice.message = '已发出重启指令，页面将在稍后自动刷新。'
    syncPolling(response.data)
    window.setTimeout(() => {
      window.location.reload()
    }, 4000)
  } catch (cause) {
    notice.type = 'error'
    notice.message = apiErrorMessage(cause, '重启失败')
    await loadStatus()
  } finally {
    restarting.value = false
  }
}

function syncPolling(value: UpdateStatusView) {
  const active = value.job.phase === 'pulling'
    || value.job.phase === 'recreating'
    || value.job.phase === 'restarting'
    || value.job.phase === 'checking'
  if (active) startPolling()
  else stopPolling()
}

function startPolling() {
  if (pollTimer) return
  pollTimer = setInterval(async () => {
    try {
      const response = await $fetch<ApiSuccess<UpdateStatusView>>('/api/admin/update/status')
      status.value = response.data
      syncPolling(response.data)
      if (response.data.job.phase === 'success' && response.data.job.message.includes('已更新')) {
        notice.type = 'success'
        notice.message = response.data.job.message
        window.setTimeout(() => window.location.reload(), 2500)
      }
      if (response.data.job.phase === 'error' && response.data.job.error) {
        notice.type = 'error'
        notice.message = response.data.job.error
      }
    } catch {
      // service may be restarting
    }
  }, 1500)
}

function stopPolling() {
  if (!pollTimer) return
  clearInterval(pollTimer)
  pollTimer = null
}

const busy = computed(() => loading.value || checking.value || applying.value || restarting.value || Boolean(status.value?.job.phase === 'pulling' || status.value?.job.phase === 'recreating'))
</script>

<template>
  <AdminAccessGate>
    <div class="admin-page admin-update-page">
      <header class="admin-page-heading">
        <span>System update</span>
        <h1>系统更新</h1>
        <p>检测 GitHub / 镜像仓库新版本，下载最新镜像并重建容器。</p>
        <div class="admin-page-heading__actions">
          <button class="secondary-command" type="button" :disabled="busy" @click="checkUpdate">
            <RefreshCcw :size="16" />
            {{ checking ? '检测中…' : '检测更新' }}
          </button>
          <button
            class="primary-command"
            type="button"
            :disabled="busy || !status?.can_apply"
            @click="applyUpdate"
          >
            <Download :size="16" />
            {{ applying ? '更新中…' : '下载最新并更新' }}
          </button>
          <button class="secondary-command" type="button" :disabled="busy || !status?.can_restart" @click="restartNow">
            <RotateCcw :size="16" />
            {{ restarting ? '重启中…' : '立即重启' }}
          </button>
        </div>
      </header>

      <div v-if="notice.message" :class="['tool-alert', notice.type === 'error' ? 'tool-alert--error' : 'tool-alert--success']">
        {{ notice.message }}
      </div>

      <section v-if="status" class="admin-update-grid">
        <article class="admin-section">
          <header><h2>当前版本</h2><Server :size="18" /></header>
          <dl class="admin-update-meta">
            <div><dt>运行版本</dt><dd>{{ status.current_version }}</dd></div>
            <div><dt>容器名称</dt><dd>{{ status.container_name }}</dd></div>
            <div><dt>镜像仓库</dt><dd>{{ status.image_repository }}</dd></div>
            <div><dt>发布仓库</dt><dd>{{ status.github_repo }}</dd></div>
          </dl>
        </article>

        <article class="admin-section">
          <header><h2>最新版本</h2><Download :size="18" /></header>
          <dl class="admin-update-meta">
            <div><dt>最新标签</dt><dd>{{ status.latest_tag || '尚未检测' }}</dd></div>
            <div><dt>最新版本</dt><dd>{{ status.latest_version || '—' }}</dd></div>
            <div><dt>检测时间</dt><dd>{{ status.checked_at ? new Date(status.checked_at).toLocaleString() : '—' }}</dd></div>
            <div>
              <dt>更新状态</dt>
              <dd>
                <span :class="['source-status', status.update_available ? 'source-status--partial' : 'source-status--live']">
                  {{ status.update_available ? '有可用更新' : '已是最新' }}
                </span>
              </dd>
            </div>
          </dl>
          <p v-if="status.latest_url" class="admin-update-link">
            <a :href="status.latest_url" target="_blank" rel="noreferrer">查看发布说明</a>
          </p>
        </article>

        <article class="admin-section admin-update-runtime">
          <header><h2>运行环境</h2><ShieldAlert :size="18" /></header>
          <dl class="admin-update-meta">
            <div>
              <dt>Docker Socket</dt>
              <dd>
                <span :class="['source-status', status.docker_available ? 'source-status--live' : 'source-status--partial']">
                  {{ status.docker_available ? '可用' : '不可用' }}
                </span>
              </dd>
            </div>
            <div><dt>Socket 路径</dt><dd>{{ status.docker_socket }}</dd></div>
          </dl>
          <p class="admin-update-hint">
            「下载最新并更新」需要容器可访问 Docker Socket（安装脚本默认挂载
            <code>/var/run/docker.sock</code>）。仅重启在无 Docker 时会回退为进程退出，依赖
            <code>restart: unless-stopped</code>。
          </p>
        </article>

        <article class="admin-section admin-update-log">
          <header><h2>任务进度</h2><Terminal :size="18" /></header>
          <div class="admin-update-job">
            <div>
              <strong>{{ status.job.phase }}</strong>
              <span>{{ status.job.message || '暂无任务' }}</span>
            </div>
            <div v-if="status.job.target_version">目标版本：{{ status.job.target_version }}</div>
          </div>
          <pre class="admin-update-console">{{ status.job.logs.length ? status.job.logs.join('\n') : '暂无日志。' }}</pre>
        </article>
      </section>

      <div v-else-if="loading" class="admin-update-loading">正在读取更新状态…</div>
    </div>
  </AdminAccessGate>
</template>
