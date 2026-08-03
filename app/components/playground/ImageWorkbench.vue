<script setup lang="ts">
import { Download, ImagePlus, RotateCcw } from 'lucide-vue-next'
import type { ApiSuccess } from '~/types/api'
import { apiErrorMessage } from '~/types/api'
import type { PlaygroundCredential } from '~/types/playground'

interface GeneratedImage {
  src: string
  extension: string
}

const props = defineProps<{
  credential: PlaygroundCredential | null
}>()

const model = ref('gpt-image-2')
const prompt = ref('生成一张真实自然的生活方式照片：周末清晨的小餐桌，木质桌面上有咖啡、吐司和一本半打开的手账，窗边有柔和晨光。不要水印，不要文字。')
const size = ref('1024x1024')
const quality = ref('high')
const format = ref('png')
const background = ref('opaque')
const sending = ref(false)
const images = ref<GeneratedImage[]>([])
const rawResponse = ref('')
const errorMessage = ref('')
const durationMs = ref<number | null>(null)

const requestPayload = computed(() => ({
  model: model.value.trim(),
  prompt: prompt.value.trim(),
  size: size.value,
  quality: quality.value,
  background: background.value,
  output_format: format.value,
  ...(format.value === 'png' ? {} : { output_compression: 90 }),
  moderation: 'auto',
  n: 1,
}))

const canSend = computed(() => Boolean(props.credential && model.value.trim() && prompt.value.trim() && !sending.value))

async function sendRequest() {
  if (!canSend.value || !props.credential) return
  sending.value = true
  images.value = []
  rawResponse.value = ''
  errorMessage.value = ''
  durationMs.value = null
  try {
    const response = await $fetch<ApiSuccess<any>>('/api/playground/images', {
      method: 'POST',
      body: { credential: props.credential, request: requestPayload.value },
    })
    rawResponse.value = JSON.stringify(response.data, null, 2)
    durationMs.value = Number(response.meta?.duration_ms || 0)
    images.value = extractImages(response.data)
    if (!images.value.length) errorMessage.value = '请求成功，但响应中没有可显示的图片。'
  } catch (cause) {
    errorMessage.value = apiErrorMessage(cause, '图片生成失败')
  } finally {
    sending.value = false
  }
}

function extractImages(value: any): GeneratedImage[] {
  const list = Array.isArray(value?.data) ? value.data : []
  return list.flatMap((item: any) => {
    if (typeof item?.b64_json === 'string' && item.b64_json) {
      return [{ src: `data:image/${format.value};base64,${item.b64_json}`, extension: format.value }]
    }
    if (typeof item?.url === 'string' && item.url) return [{ src: item.url, extension: format.value }]
    return []
  })
}

function applyTemplate(name: 'breakfast' | 'street' | 'reading') {
  const templates = {
    breakfast: '生成一张真实自然的生活方式照片：周末清晨的小餐桌，木质桌面上有咖啡、吐司和一本半打开的手账，窗边有柔和晨光。不要水印，不要文字。',
    street: '生成一张横向生活摄影：傍晚的城市街角，两位朋友慢慢散步，路边有暖色店铺灯光和雨后地面反光，人物表情自然，不要文字和水印。',
    reading: '生成一张方形室内生活照片：雨天午后的居家阅读角，单人沙发旁有落地灯、小边几、热茶和打开的书，画面安静温暖，不要文字和水印。',
  }
  prompt.value = templates[name]
  size.value = name === 'street' ? '1536x1024' : '1024x1024'
}

function reset() {
  images.value = []
  rawResponse.value = ''
  errorMessage.value = ''
  durationMs.value = null
}
</script>

<template>
  <div class="workbench-grid image-workbench">
    <form class="tool-panel request-panel" @submit.prevent="sendRequest">
      <div class="panel-heading">
        <div>
          <span>Images</span>
          <h2>图片生成</h2>
        </div>
        <button class="icon-button" type="button" title="清空结果" @click="reset">
          <RotateCcw :size="17" />
        </button>
      </div>

      <label class="form-field">
        <span>模型</span>
        <input v-model.trim="model" required>
      </label>
      <label class="form-field form-field--grow">
        <span>提示词</span>
        <textarea v-model="prompt" rows="10" required />
      </label>
      <div class="prompt-presets" aria-label="提示词模板">
        <button type="button" @click="applyTemplate('breakfast')">早餐桌</button>
        <button type="button" @click="applyTemplate('street')">城市街景</button>
        <button type="button" @click="applyTemplate('reading')">阅读角</button>
      </div>
      <div class="settings-grid">
        <label class="form-field">
          <span>尺寸</span>
          <select v-model="size">
            <option value="1024x1024">1024 x 1024</option>
            <option value="1536x1024">1536 x 1024</option>
            <option value="1024x1536">1024 x 1536</option>
          </select>
        </label>
        <label class="form-field">
          <span>质量</span>
          <select v-model="quality">
            <option value="auto">Auto</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </label>
        <label class="form-field">
          <span>格式</span>
          <select v-model="format">
            <option value="png">PNG</option>
            <option value="jpeg">JPEG</option>
            <option value="webp">WebP</option>
          </select>
        </label>
        <label class="form-field">
          <span>背景</span>
          <select v-model="background">
            <option value="opaque">不透明</option>
            <option value="auto">自动</option>
            <option value="transparent" :disabled="format === 'jpeg'">透明</option>
          </select>
        </label>
      </div>

      <button class="primary-command panel-submit" type="submit" :disabled="!canSend">
        <ImagePlus :size="17" />
        {{ sending ? '生成中...' : '生成图片' }}
      </button>
    </form>

    <section class="tool-panel result-panel image-result-panel" aria-live="polite">
      <div class="panel-heading">
        <div>
          <span>Preview</span>
          <h2>生成结果</h2>
        </div>
        <span v-if="durationMs !== null" class="result-duration">{{ durationMs }} ms</span>
      </div>

      <div v-if="errorMessage" class="tool-alert tool-alert--error">{{ errorMessage }}</div>
      <div v-if="images.length" class="generated-image-grid">
        <figure v-for="(item, index) in images" :key="item.src">
          <img :src="item.src" :alt="`生成图片 ${index + 1}`">
          <figcaption>
            <span>图片 {{ index + 1 }}</span>
            <a :href="item.src" :download="`tokenxiangyun-${index + 1}.${item.extension}`" target="_blank" rel="noopener noreferrer" title="下载图片">
              <Download :size="17" />
            </a>
          </figcaption>
        </figure>
      </div>
      <div v-else class="empty-result empty-result--image">
        <ImagePlus :size="30" />
        <strong>{{ sending ? '正在生成图片' : '图片会显示在这里' }}</strong>
        <p>生成期间请保持页面打开，最长等待 5 分钟。</p>
      </div>

      <details class="settings-drawer debug-drawer">
        <summary>调试数据</summary>
        <strong>请求</strong>
        <pre>{{ JSON.stringify(requestPayload, null, 2) }}</pre>
        <strong v-if="rawResponse">响应</strong>
        <pre v-if="rawResponse">{{ rawResponse }}</pre>
      </details>
    </section>
  </div>
</template>
