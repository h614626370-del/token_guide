<script setup lang="ts">
import { KeyRound, RefreshCw } from 'lucide-vue-next'
import type { PlaygroundKey } from '~/types/playground'

const props = defineProps<{
  keys: PlaygroundKey[]
  loading: boolean
  mode: 'saved' | 'custom'
  selectedId: number | null
  customKey: string
  error?: string
}>()

const emit = defineEmits<{
  'update:mode': [value: 'saved' | 'custom']
  'update:selectedId': [value: number | null]
  'update:customKey': [value: string]
  refresh: []
}>()

function updateSelected(value: string) {
  const numeric = Number(value)
  emit('update:selectedId', Number.isInteger(numeric) && numeric > 0 ? numeric : null)
}
</script>

<template>
  <section class="credential-strip" aria-label="API Key 选择">
    <div class="credential-strip__title">
      <KeyRound :size="18" />
      <div>
        <strong>请求凭据</strong>
        <span>Key 仅用于当前模型请求</span>
      </div>
    </div>

    <div class="segmented-control" aria-label="Key 来源">
      <button type="button" :class="{ active: mode === 'saved' }" @click="emit('update:mode', 'saved')">我的 Key</button>
      <button type="button" :class="{ active: mode === 'custom' }" @click="emit('update:mode', 'custom')">自定义 Key</button>
    </div>

    <div v-if="mode === 'saved'" class="credential-input">
      <select :value="selectedId || ''" :disabled="loading" aria-label="选择 API Key" @change="updateSelected(($event.target as HTMLSelectElement).value)">
        <option value="" disabled>{{ loading ? '正在读取...' : (keys.length ? '请选择 Key' : '暂无可用 Key') }}</option>
        <option v-for="item in keys" :key="item.id" :value="item.id">
          {{ item.name }} · {{ item.masked_key }}
        </option>
      </select>
      <button class="icon-button" type="button" title="刷新 Key 列表" :disabled="loading" @click="emit('refresh')">
        <RefreshCw :size="17" :class="{ spinning: loading }" />
      </button>
    </div>

    <input
      v-else
      class="credential-custom"
      type="password"
      autocomplete="off"
      placeholder="输入 API Key"
      :value="customKey"
      aria-label="自定义 API Key"
      @input="emit('update:customKey', ($event.target as HTMLInputElement).value)"
    >

    <p v-if="error" class="inline-error">{{ error }}</p>
  </section>
</template>
