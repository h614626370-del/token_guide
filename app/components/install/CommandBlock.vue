<script setup lang="ts">
import { Check, Copy } from 'lucide-vue-next'

const props = defineProps<{
  label: string
  command: string
}>()

const copied = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

onBeforeUnmount(() => clearTimeout(timer))

async function copyCommand() {
  await navigator.clipboard.writeText(props.command)
  copied.value = true
  clearTimeout(timer)
  timer = setTimeout(() => { copied.value = false }, 1800)
}
</script>

<template>
  <div class="install-command">
    <span>{{ label }}</span>
    <div>
      <textarea :value="command" readonly spellcheck="false" :aria-label="`${label}命令`" />
      <button class="primary-command" type="button" :title="copied ? '已复制' : '复制命令'" @click="copyCommand">
        <Check v-if="copied" :size="17" />
        <Copy v-else :size="17" />
        {{ copied ? '已复制' : '复制命令' }}
      </button>
    </div>
  </div>
</template>
