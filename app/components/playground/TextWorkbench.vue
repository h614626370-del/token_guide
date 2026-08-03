<script setup lang="ts">
import { Check, Copy, RotateCcw, Send } from 'lucide-vue-next'
import type { ApiSuccess } from '~/types/api'
import { apiErrorMessage } from '~/types/api'
import type { PlaygroundCredential } from '~/types/playground'

const props = defineProps<{
  credential: PlaygroundCredential | null
}>()

const model = ref('gpt-5.5')
const systemPrompt = ref('你是一个简洁、准确的中文助手。')
const prompt = ref('请用清晰的步骤说明，如何验证一个 OpenAI 兼容 API 是否配置正确。')
const temperature = ref(0.7)
const maxOutputTokens = ref(1200)
const reasoningEffort = ref('auto')
const sending = ref(false)
const output = ref('')
const rawResponse = ref('')
const errorMessage = ref('')
const durationMs = ref<number | null>(null)
const copied = ref(false)
const debugMode = ref<'request' | 'response'>('request')

const requestPayload = computed(() => {
  const request: Record<string, unknown> = {
    model: model.value.trim(),
    input: [
      { role: 'system', content: systemPrompt.value.trim() || '你是一个简洁、准确的中文助手。' },
      { role: 'user', content: prompt.value.trim() },
    ],
    temperature: Number(temperature.value),
    top_p: 1,
    max_output_tokens: Number(maxOutputTokens.value),
  }
  if (reasoningEffort.value !== 'auto') request.reasoning = { effort: reasoningEffort.value }
  return request
})

const canSend = computed(() => Boolean(
  props.credential
  && model.value.trim()
  && prompt.value.trim()
  && !sending.value,
))

async function sendRequest() {
  if (!canSend.value || !props.credential) return
  sending.value = true
  output.value = ''
  rawResponse.value = ''
  errorMessage.value = ''
  durationMs.value = null
  try {
    const response = await $fetch<ApiSuccess<any>>('/api/playground/responses', {
      method: 'POST',
      body: { credential: props.credential, request: requestPayload.value },
    })
    rawResponse.value = JSON.stringify(response.data, null, 2)
    output.value = extractText(response.data) || rawResponse.value
    durationMs.value = Number(response.meta?.duration_ms || 0)
    debugMode.value = 'response'
  } catch (cause) {
    errorMessage.value = apiErrorMessage(cause, '文本请求失败')
  } finally {
    sending.value = false
  }
}

function extractText(value: any) {
  if (typeof value?.output_text === 'string') return value.output_text
  if (!Array.isArray(value?.output)) return ''
  return value.output.flatMap((item: any) => Array.isArray(item?.content) ? item.content : [])
    .map((item: any) => typeof item?.text === 'string' ? item.text : '')
    .filter(Boolean)
    .join('\n')
}

async function copyOutput() {
  if (!output.value) return
  await navigator.clipboard.writeText(output.value)
  copied.value = true
  window.setTimeout(() => { copied.value = false }, 1200)
}

function reset() {
  output.value = ''
  rawResponse.value = ''
  errorMessage.value = ''
  durationMs.value = null
  debugMode.value = 'request'
}
</script>

<template>
  <div class="workbench-grid">
    <form class="tool-panel request-panel" @submit.prevent="sendRequest">
      <div class="panel-heading">
        <div>
          <span>Responses</span>
          <h2>文本请求</h2>
        </div>
        <button class="icon-button" type="button" title="清空结果" @click="reset">
          <RotateCcw :size="17" />
        </button>
      </div>

      <label class="form-field">
        <span>模型</span>
        <input v-model.trim="model" list="text-models" required>
        <datalist id="text-models">
          <option value="gpt-5.5" />
          <option value="gpt-5.4" />
        </datalist>
      </label>

      <label class="form-field form-field--grow">
        <span>提示词</span>
        <textarea v-model="prompt" rows="9" required />
      </label>

      <details class="settings-drawer">
        <summary>高级参数</summary>
        <div class="settings-grid">
          <label class="form-field settings-grid__wide">
            <span>系统提示词</span>
            <textarea v-model="systemPrompt" rows="3" />
          </label>
          <label class="form-field">
            <span>Temperature</span>
            <input v-model.number="temperature" type="number" min="0" max="2" step="0.1">
          </label>
          <label class="form-field">
            <span>最大输出 Token</span>
            <input v-model.number="maxOutputTokens" type="number" min="16" max="32000" step="16">
          </label>
          <label class="form-field">
            <span>推理强度</span>
            <select v-model="reasoningEffort">
              <option value="auto">自动</option>
              <option value="minimal">Minimal</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="xhigh">XHigh</option>
            </select>
          </label>
        </div>
      </details>

      <button class="primary-command panel-submit" type="submit" :disabled="!canSend">
        <Send :size="17" />
        {{ sending ? '请求中...' : '发送请求' }}
      </button>
    </form>

    <section class="tool-panel result-panel" aria-live="polite">
      <div class="panel-heading">
        <div>
          <span>Result</span>
          <h2>模型响应</h2>
        </div>
        <div class="result-actions">
          <span v-if="durationMs !== null" class="result-duration">{{ durationMs }} ms</span>
          <button class="icon-button" type="button" title="复制结果" :disabled="!output" @click="copyOutput">
            <Check v-if="copied" :size="17" />
            <Copy v-else :size="17" />
          </button>
        </div>
      </div>

      <div v-if="errorMessage" class="tool-alert tool-alert--error">{{ errorMessage }}</div>
      <pre v-if="output" class="response-output">{{ output }}</pre>
      <div v-else class="empty-result">
        <strong>{{ sending ? '正在等待模型返回' : '发送后在这里查看结果' }}</strong>
        <p>原始请求和响应可以在下方调试区查看。</p>
      </div>

      <details class="settings-drawer debug-drawer">
        <summary>调试数据</summary>
        <div class="debug-switch">
          <button type="button" :class="{ active: debugMode === 'request' }" @click="debugMode = 'request'">请求</button>
          <button type="button" :class="{ active: debugMode === 'response' }" :disabled="!rawResponse" @click="debugMode = 'response'">响应</button>
        </div>
        <pre>{{ debugMode === 'request' ? JSON.stringify(requestPayload, null, 2) : rawResponse }}</pre>
      </details>
    </section>
  </div>
</template>
