<script setup lang="ts">
import { Image, MessageSquareText } from 'lucide-vue-next'
import type { ApiSuccess } from '~/types/api'
import { apiErrorMessage } from '~/types/api'
import type { PlaygroundCredential, PlaygroundKey } from '~/types/playground'

const site = useSiteConfigState()
useSeoMeta({
  title: '模型试用台',
  description: () => `使用${site.value.project_name}账号内的 API Key 测试 Responses 和图片生成。`,
})

const { session, loading: sessionLoading, error: sessionError, refresh: refreshSession } = useGuideSessionState()
const activeTab = ref<'text' | 'image'>('text')
const keys = ref<PlaygroundKey[]>([])
const keysLoading = ref(false)
const keysError = ref('')
const credentialMode = ref<'saved' | 'custom'>('saved')
const selectedKeyId = ref<number | null>(null)
const customKey = ref('')

const credential = computed<PlaygroundCredential | null>(() => {
  if (credentialMode.value === 'custom') {
    const value = customKey.value.trim()
    return value.length >= 8 ? { type: 'custom', value } : null
  }
  return selectedKeyId.value ? { type: 'saved', id: selectedKeyId.value } : null
})

onMounted(async () => {
  const current = await refreshSession()
  if (current?.authenticated) await loadKeys()
})

async function loadKeys() {
  keysLoading.value = true
  keysError.value = ''
  try {
    const response = await $fetch<ApiSuccess<PlaygroundKey[]>>('/api/playground/keys')
    keys.value = response.data
    if (!selectedKeyId.value || !keys.value.some(item => item.id === selectedKeyId.value)) {
      selectedKeyId.value = keys.value[0]?.id || null
    }
    if (!keys.value.length) credentialMode.value = 'custom'
  } catch (cause) {
    keysError.value = apiErrorMessage(cause, 'API Key 列表读取失败')
  } finally {
    keysLoading.value = false
  }
}
</script>

<template>
  <div class="tool-page playground-page">
    <div class="tool-page__inner">
      <ToolPageHeading eyebrow="模型验证" title="模型试用台" description="账号凭据只在统一服务端使用，浏览器不会收到完整的已保存 Key。">
        <template #actions>
          <span v-if="session?.user" class="session-chip">{{ session.user.username || session.user.email || `用户 ${session.user.id}` }}</span>
        </template>
      </ToolPageHeading>

      <SessionGate v-if="sessionLoading || !session?.authenticated" :loading="sessionLoading" :message="sessionError" />

      <template v-else>
        <PlaygroundCredentialPicker
          :keys="keys"
          :loading="keysLoading"
          :mode="credentialMode"
          :selected-id="selectedKeyId"
          :custom-key="customKey"
          :error="keysError"
          @update:mode="credentialMode = $event"
          @update:selected-id="selectedKeyId = $event"
          @update:custom-key="customKey = $event"
          @refresh="loadKeys"
        />

        <div class="tool-tabs" role="tablist" aria-label="试用模式">
          <button type="button" role="tab" :aria-selected="activeTab === 'text'" :class="{ active: activeTab === 'text' }" @click="activeTab = 'text'">
            <MessageSquareText :size="18" />
            文本对话
          </button>
          <button type="button" role="tab" :aria-selected="activeTab === 'image'" :class="{ active: activeTab === 'image' }" @click="activeTab = 'image'">
            <Image :size="18" />
            图片生成
          </button>
        </div>

        <PlaygroundTextWorkbench v-if="activeTab === 'text'" :credential="credential" />
        <PlaygroundImageWorkbench v-else :credential="credential" />
      </template>
    </div>
  </div>
</template>
