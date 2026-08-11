<script setup lang="ts">
import { Check, Copy, RotateCcw, Send, Square } from 'lucide-vue-next'
import type { PlaygroundCredential } from '~/types/playground'
import { SseDecoder } from '#shared/utils/sse'

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
const requestController = shallowRef<AbortController | null>(null)

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
    stream: true,
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
  const controller = new AbortController()
  const startedAt = performance.now()
  requestController.value = controller
  sending.value = true
  output.value = ''
  rawResponse.value = ''
  errorMessage.value = ''
  durationMs.value = null
  try {
    const response = await fetch('/api/playground/responses', {
      method: 'POST',
      headers: {
        accept: 'text/event-stream',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ credential: props.credential, request: requestPayload.value }),
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(await responseErrorMessage(response))
    await consumeResponseStream(response)
  } catch (cause) {
    if (controller.signal.aborted) {
      errorMessage.value = output.value ? '已停止生成。' : '请求已取消。'
    } else {
      errorMessage.value = cause instanceof Error ? cause.message : '文本请求失败'
    }
  } finally {
    if (durationMs.value === null) durationMs.value = Math.round(performance.now() - startedAt)
    if (requestController.value === controller) requestController.value = null
    sending.value = false
  }
}

async function consumeResponseStream(response: Response) {
  if (!response.body) throw new Error('浏览器未收到可读取的流式响应。')
  const reader = response.body.getReader()
  const decoder = new SseDecoder()
  let terminalError = ''

  const consume = (events: ReturnType<SseDecoder['push']>) => {
    for (const event of events) {
      terminalError ||= applyStreamEvent(event.event, event.data)
    }
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      consume(decoder.push(value))
    }
    consume(decoder.finish())
  } finally {
    reader.releaseLock()
  }

  if (terminalError) throw new Error(terminalError)
  if (!rawResponse.value && output.value) {
    rawResponse.value = JSON.stringify({ output_text: output.value }, null, 2)
    debugMode.value = 'response'
  }
  if (!output.value) throw new Error('流式响应中没有可显示的文本。')
}

function applyStreamEvent(eventName: string, data: string) {
  let payload: any
  try {
    payload = JSON.parse(data)
  } catch {
    return eventName === 'guide.error' ? data : ''
  }

  const type = typeof payload?.type === 'string' ? payload.type : eventName
  if (type === 'response.output_text.delta' && typeof payload?.delta === 'string') {
    output.value += payload.delta
    return ''
  }
  if (type === 'response.output_text.done' && !output.value && typeof payload?.text === 'string') {
    output.value = payload.text
    return ''
  }
  if (type === 'response.completed') {
    const completed = payload?.response ?? payload
    rawResponse.value = JSON.stringify(completed, null, 2)
    if (!output.value) output.value = extractText(completed) || rawResponse.value
    debugMode.value = 'response'
    return ''
  }
  if (type === 'guide.done') {
    durationMs.value = Number(payload?.duration_ms || 0)
    return ''
  }
  if (type === 'guide.error' || type === 'error' || type === 'response.failed') {
    return streamErrorMessage(payload)
  }
  return ''
}

function streamErrorMessage(payload: any) {
  return payload?.error?.message
    || payload?.response?.error?.message
    || payload?.message
    || '模型流式响应失败。'
}

async function responseErrorMessage(response: Response) {
  const payload = await response.json().catch(() => null) as any
  return payload?.statusMessage
    || payload?.message
    || payload?.data?.message
    || `文本请求失败（HTTP ${response.status}）`
}

function cancelRequest() {
  requestController.value?.abort()
}

onBeforeUnmount(cancelRequest)

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
        <button class="icon-button" type="button" title="清空结果" :disabled="sending" @click="reset">
          <RotateCcw :size="17" />
        </button>
      </div>

      <label class="form-field">
        <span>模型</span>
        <input v-model.trim="model" list="text-models" required>
        <datalist id="text-models">
          <option value="gpt-5.5" />
          <option value="gpt-5.6-sol" />
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

      <button v-if="sending" class="primary-command panel-submit panel-submit--stop" type="button" @click="cancelRequest">
        <Square :size="16" />
        停止生成
      </button>
      <button v-else class="primary-command panel-submit" type="submit" :disabled="!canSend">
        <Send :size="17" />
        发送请求
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
