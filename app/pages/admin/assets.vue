<script setup lang="ts">
import { ArrowRightLeft, Copy, ExternalLink, ImagePlus, RefreshCw, Replace, Trash2, Upload } from 'lucide-vue-next'
import type { ApiSuccess } from '~/types/api'
import { apiErrorMessage } from '~/types/api'

definePageMeta({ layout: 'admin' })
useSeoMeta({ title: '图片管理', robots: 'noindex, nofollow' })

interface AssetItem {
  filename: string
  url: string
  content_type: string
  size: number
  created_at: string
  kind: 'replaceable' | 'long_term'
}

const loading = ref(false)
const uploading = ref(false)
const deleting = ref('')
const replacing = ref('')
const admin = useAdminSessionState()
const loaded = ref(false)
const assets = ref<AssetItem[]>([])
const activeTab = ref<'replaceable' | 'long_term'>('replaceable')
const previewVersions = reactive<Record<string, number>>({})
const fileInput = ref<HTMLInputElement | null>(null)
const replaceInput = ref<HTMLInputElement | null>(null)
const replacingFilename = ref('')
const notice = reactive({ type: 'idle' as 'idle' | 'success' | 'error', message: '' })

watch(() => admin.session.value?.admin, (authenticated) => {
  if (authenticated && !loaded.value) void loadAssets()
}, { immediate: true })

async function loadAssets() {
  loading.value = true
  try {
    const response = await $fetch<ApiSuccess<AssetItem[]>>('/api/admin/assets')
    assets.value = response.data
    loaded.value = true
  } catch (cause) {
    notice.type = 'error'
    notice.message = apiErrorMessage(cause, '图片列表读取失败')
  } finally {
    loading.value = false
  }
}

function chooseFiles() {
  fileInput.value?.click()
}

function chooseReplacement(asset: AssetItem) {
  replacingFilename.value = asset.filename
  replaceInput.value?.click()
}

function previewUrl(asset: AssetItem) {
  // The public URL stays stable, but previews need a cache key derived from
  // the current file mtime so a reverse proxy cannot keep showing an older
  // image after replacement or a full page reload.
  const version = previewVersions[asset.filename] || Date.parse(asset.created_at)
  return version ? `${asset.url}?v=${version}` : asset.url
}

async function uploadFiles(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  input.value = ''
  if (!files.length) return

  uploading.value = true
  notice.type = 'idle'
  notice.message = ''
  let success = 0
  try {
    for (const file of files) {
      const body = new FormData()
      body.append('file', file)
      body.append('kind', activeTab.value)
      await $fetch<ApiSuccess<AssetItem>>('/api/admin/assets/upload', {
        method: 'POST',
        body,
      })
      success += 1
    }
    await loadAssets()
    notice.type = 'success'
    notice.message = `已上传 ${success} 张图片。`
  } catch (cause) {
    notice.type = 'error'
    notice.message = apiErrorMessage(cause, success ? `已上传 ${success} 张，后续图片上传失败` : '图片上传失败')
    await loadAssets()
  } finally {
    uploading.value = false
  }
}

const visibleAssets = computed(() => assets.value.filter(asset => asset.kind === activeTab.value))

async function changeKind(asset: AssetItem, kind: AssetItem['kind']) {
  try {
    await $fetch<ApiSuccess<{ filename: string; kind: AssetItem['kind'] }>>(`/api/admin/assets/${encodeURIComponent(asset.filename)}/kind`, {
      method: 'PUT',
      body: { kind },
    })
    asset.kind = kind
    notice.type = 'success'
    notice.message = kind === 'replaceable' ? '已转为可替换图片，缓存时间为 10 分钟。' : '已转为长期图片，缓存时间为 1 年。'
  } catch (cause) {
    notice.type = 'error'
    notice.message = apiErrorMessage(cause, '图片类型更新失败')
  }
}

async function replaceFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  const filename = replacingFilename.value
  replacingFilename.value = ''
  if (!file || !filename) return

  replacing.value = filename
  notice.type = 'idle'
  notice.message = ''
  try {
    const body = new FormData()
    body.append('file', file)
    const response = await $fetch<ApiSuccess<AssetItem>>(`/api/admin/assets/${encodeURIComponent(filename)}`, { method: 'PUT', body })
    const index = assets.value.findIndex(item => item.filename === filename)
    if (index >= 0) {
      assets.value[index] = {
        ...assets.value[index],
        ...response.data,
        // The API returns the replacement mtime, while the public path stays unchanged.
        created_at: response.data.created_at,
      }
    }
    previewVersions[filename] = Date.now()
    notice.type = 'success'
    notice.message = '图片已替换，公开地址保持不变。'
  } catch (cause) {
    notice.type = 'error'
    notice.message = apiErrorMessage(cause, '图片替换失败')
  } finally {
    replacing.value = ''
  }
}

async function copyUrl(asset: AssetItem) {
  try {
    await navigator.clipboard.writeText(asset.url)
    notice.type = 'success'
    notice.message = '图片地址已复制。'
  } catch {
    notice.type = 'error'
    notice.message = '复制失败，请手动复制图片地址。'
  }
}

async function deleteAsset(asset: AssetItem) {
  const confirmed = window.confirm(`确定删除这张图片吗？\n${asset.filename}`)
  if (!confirmed) return

  deleting.value = asset.filename
  notice.type = 'idle'
  notice.message = ''
  try {
    await $fetch<ApiSuccess<{ filename: string }>>(`/api/admin/assets/${encodeURIComponent(asset.filename)}`, {
      method: 'DELETE',
    })
    assets.value = assets.value.filter(item => item.filename !== asset.filename)
    notice.type = 'success'
    notice.message = '图片已删除。'
  } catch (cause) {
    notice.type = 'error'
    notice.message = apiErrorMessage(cause, '图片删除失败')
  } finally {
    deleting.value = ''
  }
}

function formatSize(size: number) {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(2)} MB`
  return `${Math.max(1, Math.round(size / 1024))} KB`
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}
</script>

<template>
  <AdminAccessGate>
    <div class="admin-page admin-assets-page">
      <header class="admin-page-heading">
        <span>Assets</span>
        <h1>图片管理</h1>
        <p>按使用场景管理图片缓存：二维码适合定期替换，文档配图适合长期缓存。</p>
        <div class="admin-page-heading__actions">
          <button class="secondary-command" type="button" :disabled="loading" @click="loadAssets">
            <RefreshCw :size="16" :class="{ spinning: loading }" />刷新
          </button>
          <button class="primary-command" type="button" :disabled="uploading" @click="chooseFiles">
            <Upload :size="16" />{{ uploading ? '上传中...' : `上传${activeTab === 'replaceable' ? '可替换' : '长期'}图片` }}
          </button>
        </div>
      </header>

      <div v-if="notice.message" :class="['tool-alert', notice.type === 'error' ? 'tool-alert--error' : 'tool-alert--success']">
        {{ notice.message }}
      </div>

      <nav class="admin-asset-tabs" aria-label="图片类型">
        <button type="button" :class="{ active: activeTab === 'replaceable' }" @click="activeTab = 'replaceable'">
          <RefreshCw :size="16" />可替换图片
        </button>
        <button type="button" :class="{ active: activeTab === 'long_term' }" @click="activeTab = 'long_term'">
          <ImagePlus :size="16" />长期图片
        </button>
      </nav>

      <section v-if="activeTab === 'replaceable'" class="admin-asset-explanation">
        <strong>适合微信群二维码、活动海报等需要定期更新的图片</strong>
        <span>公开地址保持不变，替换后最多等待约 10 分钟即可在各地刷新到新图片。</span>
      </section>
      <section v-else class="admin-asset-explanation admin-asset-explanation--long-term">
        <strong>适合 Markdown 指南、Scale 使用说明、Logo 和教程截图</strong>
        <span>上传后地址稳定，使用 1 年缓存。不要直接覆盖正在文档中引用的长期图片。</span>
      </section>

      <section class="admin-asset-uploader" @click="chooseFiles">
        <ImagePlus :size="28" />
        <div>
          <strong>选择图片上传</strong>
          <span>支持 PNG、JPG、WebP、GIF，单张最大 2MB。可一次选择多张。</span>
        </div>
      </section>

      <section v-if="visibleAssets.length" class="admin-asset-grid">
        <article v-for="asset in visibleAssets" :key="asset.filename" class="admin-asset-card">
          <a class="admin-asset-thumb" :href="previewUrl(asset)" target="_blank" rel="noreferrer" title="打开原图">
            <img :src="previewUrl(asset)" alt="">
          </a>
          <div class="admin-asset-meta">
            <strong>{{ asset.filename }}</strong>
            <span>{{ formatSize(asset.size) }} · {{ asset.content_type }} · {{ formatTime(asset.created_at) }}</span>
          </div>
          <div class="admin-asset-url">
            <input :value="asset.url" readonly aria-label="图片公开地址">
            <button class="icon-command" type="button" title="复制地址" @click="copyUrl(asset)">
              <Copy :size="15" />
            </button>
            <a class="icon-command" :href="previewUrl(asset)" target="_blank" rel="noreferrer" title="打开原图">
              <ExternalLink :size="15" />
            </a>
            <button v-if="asset.kind === 'replaceable'" class="icon-command" type="button" :disabled="replacing === asset.filename" :title="replacing === asset.filename ? '替换中...' : '替换图片'" @click="chooseReplacement(asset)">
              <Replace :size="15" />
            </button>
            <span v-else class="icon-command icon-command--placeholder" aria-hidden="true"></span>
            <button class="icon-command" type="button" :title="asset.kind === 'replaceable' ? '转为长期图片' : '转为可替换图片'" @click="changeKind(asset, asset.kind === 'replaceable' ? 'long_term' : 'replaceable')">
              <ArrowRightLeft :size="15" />
            </button>
            <button class="icon-command danger-command" type="button" :disabled="deleting === asset.filename" title="删除图片" @click="deleteAsset(asset)">
              <Trash2 :size="15" />
            </button>
          </div>
        </article>
      </section>

      <div v-else-if="!loading" class="empty-result admin-assets-empty">
        <ImagePlus :size="30" />
        <strong>{{ activeTab === 'replaceable' ? '还没有可替换图片' : '还没有长期图片' }}</strong>
        <p>{{ activeTab === 'replaceable' ? '上传微信群二维码或其他需要定期更换的图片。' : '上传 Markdown 和指南中长期引用的图片。' }}</p>
      </div>

      <input
        ref="fileInput"
        class="visually-hidden"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        @change="uploadFiles"
      >
      <input ref="replaceInput" class="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp,image/gif" @change="replaceFile">
    </div>
  </AdminAccessGate>
</template>
