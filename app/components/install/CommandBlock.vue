<script setup lang="ts">
import { Check, CircleAlert, Copy } from 'lucide-vue-next'

const props = defineProps<{
  label: string
  command: string
}>()

const copied = ref(false)
const copyFailed = ref(false)
const commandField = ref<HTMLTextAreaElement | null>(null)
const copyButton = ref<HTMLButtonElement | null>(null)
let timer: ReturnType<typeof setTimeout> | undefined

onBeforeUnmount(() => clearTimeout(timer))

async function copyCommand() {
  copied.value = false
  copyFailed.value = false
  try {
    let success = false
    if (window.isSecureContext && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(props.command)
        success = true
      } catch {
        success = false
      }
    }
    if (!success) success = copyWithSelection()
    if (!success) throw new Error('Copy command was rejected by the browser.')
    copied.value = true
  } catch {
    copyFailed.value = true
  }
  clearTimeout(timer)
  timer = setTimeout(() => {
    copied.value = false
    copyFailed.value = false
  }, 1800)
}

function copyWithSelection() {
  const field = commandField.value
  if (!field || typeof document.execCommand !== 'function') return false
  field.focus()
  field.select()
  field.setSelectionRange(0, field.value.length)
  const success = document.execCommand('copy')
  copyButton.value?.focus()
  return success
}
</script>

<template>
  <div class="install-command">
    <div class="install-command__heading">
      <span>{{ label }}</span>
      <small v-if="copied" aria-live="polite">命令已复制</small>
      <small v-else-if="copyFailed" class="copy-error" aria-live="assertive">浏览器拒绝复制，请手动选择</small>
    </div>
    <div class="install-command__body">
      <textarea ref="commandField" :value="command" readonly spellcheck="false" :aria-label="`${label}命令`" />
      <button ref="copyButton" :class="['primary-command', { 'copy-command--error': copyFailed }]" type="button" :title="copied ? '已复制' : copyFailed ? '复制失败' : '复制命令'" @click="copyCommand">
        <Check v-if="copied" :size="17" />
        <CircleAlert v-else-if="copyFailed" :size="17" />
        <Copy v-else :size="17" />
        {{ copied ? '已复制' : copyFailed ? '复制失败' : '复制命令' }}
      </button>
    </div>
  </div>
</template>
