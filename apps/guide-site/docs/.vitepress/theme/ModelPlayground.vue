<template>
  <div class="playground-app" :class="{ 'is-embedded': isEmbedded }">
    <header v-if="!isEmbedded" class="topbar">
      <a class="brand" href="./">
        <img class="brand-mark" :src="guideLogoSrc" width="30" height="30" alt="" aria-hidden="true" />
        <span>Token向云工作台</span>
      </a>
      <nav>
        <a href="./playground">模型试用</a>
        <a href="./member">会员充值</a>
        <a href="./api">API 接入</a>
        <a href="./">指南首页</a>
      </nav>
    </header>

    <main class="shell">
      <aside class="side-rail">
        <div class="rail-head">
          <span>UU Studio</span>
          <button class="icon-button" type="button" title="刷新 Key 列表" @click="loadKeys" :disabled="loadingKeys">
            <span :class="{ spinning: loadingKeys }">R</span>
          </button>
        </div>

        <nav class="mode-list" aria-label="模型工作台功能">
          <button type="button" :class="{ active: activeTab === 'text' }" @click="activeTab = 'text'">
            <span class="mode-mark">C</span>
            <span>
              <strong>文本对话</strong>
              <small>快速测试 Responses</small>
            </span>
          </button>
          <button type="button" :class="{ active: activeTab === 'image' }" @click="activeTab = 'image'">
            <span class="mode-mark">I</span>
            <span>
              <strong>图片生成</strong>
              <small>提示词生成图片</small>
            </span>
          </button>
        </nav>

        <div class="rail-section">
          <p class="rail-label">连接状态</p>
          <div class="status-card">
            <span :class="['status-dot', keyLoadState]"></span>
            <div>
              <strong>{{ statusText }}</strong>
              <small>{{ keyMode === 'custom' ? '使用手动输入 Key' : '使用账号内 Key' }}</small>
            </div>
          </div>
        </div>

        <div class="rail-section session-list">
          <p class="rail-label">本地会话</p>
          <button type="button" class="session-item active">
            <strong>新对话</strong>
            <small>不保存历史记录</small>
          </button>
          <button type="button" class="session-item">
            <strong>生图草稿</strong>
            <small>仅当前页面展示</small>
          </button>
        </div>
      </aside>

      <section class="workspace">
        <header class="workspace-head">
          <div>
            <p class="page-kicker">当前{{ activeTab === 'text' ? '对话' : '生成' }}</p>
            <h1>{{ activeTab === 'text' ? '新对话' : '图片生成' }}</h1>
          </div>
          <div class="head-actions">
            <span class="pill">{{ selectedKey?.name || (keyMode === 'custom' ? '自定义 Key' : '请选择 Key') }}</span>
            <span class="pill">{{ activeTab === 'text' ? model : imageModel }}</span>
            <button v-if="activeTab === 'text'" class="secondary-action" type="button" :disabled="!displayedOutputText" @click="copyTextOutput">
              {{ copiedText ? '已复制' : '复制结果' }}
            </button>
          </div>
        </header>

        <section v-if="activeTab === 'text'" class="chat-studio">
          <div class="chat-surface">
            <div v-if="textErrorMessage" class="error-box">
              <strong>请求失败</strong>
              <p>{{ textErrorMessage }}</p>
              <pre v-if="textRawError">{{ textRawError }}</pre>
            </div>

            <article v-if="displayedOutputText" class="message assistant-message">
              <div class="message-avatar">T</div>
              <div class="message-body">
                <div class="message-meta">
                  <strong>Token向云</strong>
                  <span v-if="textDurationMs !== null">{{ textDurationMs }} ms</span>
                </div>
                <pre><span>{{ displayedOutputText }}</span><span v-if="typing" class="typing-caret"></span></pre>
              </div>
            </article>

            <div v-else class="empty-chat">
              <span class="empty-icon">Aa</span>
              <strong>输入一句话，先确认模型可用</strong>
              <p>这里只保留必要项：Key、模型和提示词。采样、长度和推理参数使用推荐默认值。</p>
            </div>
          </div>

          <form class="composer" @submit.prevent="sendTextRequest">
            <div class="quick-settings">
              <label>
                <span>Key 来源</span>
                <div class="segmented">
                  <button type="button" :class="{ active: keyMode === 'saved' }" @click="keyMode = 'saved'">我的 Key</button>
                  <button type="button" :class="{ active: keyMode === 'custom' }" @click="keyMode = 'custom'">自定义</button>
                </div>
              </label>
              <label v-if="keyMode === 'saved'">
                <span>API Key</span>
                <select v-model="selectedKeyId" :disabled="loadingKeys || selectableKeys.length === 0">
                  <option value="" disabled>{{ keySelectPlaceholder }}</option>
                  <option v-for="key in selectableKeys" :key="key.id" :value="String(key.id)">
                    {{ key.name }} · {{ maskKey(key.key) }}
                  </option>
                </select>
              </label>
              <label v-else>
                <span>API Key</span>
                <input v-model="customKey" type="password" autocomplete="off" placeholder="sk-xxxxxx" />
              </label>
              <label>
                <span>模型</span>
                <select v-model="model">
                  <option v-for="item in modelOptions" :key="item.value" :value="item.value">
                    {{ item.label }}
                  </option>
                </select>
              </label>
            </div>

            <p v-if="keyError" class="note danger">{{ keyError }}</p>
            <textarea v-model="userPrompt" rows="4" placeholder="输入聊天内容，例如：周末在家招待朋友，请帮我安排菜单和采购清单。"></textarea>
            <div class="composer-foot">
              <div class="prompt-chips">
                <button type="button" @click="applyTextTemplate('dinner')">生活场景示例</button>
                <button type="button" @click="resetTextOutput">清空</button>
              </div>
              <button class="primary-action" type="submit" :disabled="!canSubmitText || sendingText">
                <span v-if="sendingText" class="spinner"></span>
                {{ sendingText ? '发送中' : '发送' }}
              </button>
            </div>

            <details class="advanced-drawer">
              <summary>高级设置与调试</summary>
              <div class="advanced-grid">
                <label>
                  <span>Base URL</span>
                  <input v-model.trim="baseUrl" type="url" placeholder="https://kkflow.org/v1" />
                </label>
                <label>
                  <span>系统提示词</span>
                  <textarea v-model="systemPrompt" rows="3"></textarea>
                </label>
              </div>
              <div class="debug-tabs">
                <button type="button" :class="{ active: textDebugView === 'request' }" @click="textDebugView = 'request'">请求</button>
                <button type="button" :class="{ active: textDebugView === 'response' }" :disabled="!textRawResponse" @click="textDebugView = 'response'">响应</button>
              </div>
              <pre>{{ textDebugView === 'request' ? textPayloadPreview : (textRawResponse || '发送后显示原始响应 JSON') }}</pre>
            </details>
          </form>
        </section>

        <section v-else class="image-studio">
          <form class="image-control" @submit.prevent="sendImageRequest">
            <div class="control-title">
              <div>
                <h2>生成控制台</h2>
                <p>选 Key、写提示词、点生成即可。</p>
              </div>
              <button class="ghost-button" type="button" @click="applyImageTemplate('breakfast')">示例</button>
            </div>

            <div class="field">
              <label>Key 来源</label>
              <div class="segmented">
                <button type="button" :class="{ active: keyMode === 'saved' }" @click="keyMode = 'saved'">我的 Key</button>
                <button type="button" :class="{ active: keyMode === 'custom' }" @click="keyMode = 'custom'">自定义</button>
              </div>
            </div>

            <div v-if="keyMode === 'saved'" class="field">
              <label for="image-saved-key">API Key</label>
              <select id="image-saved-key" v-model="selectedKeyId" :disabled="loadingKeys || selectableKeys.length === 0">
                <option value="" disabled>{{ keySelectPlaceholder }}</option>
                <option v-for="key in selectableKeys" :key="key.id" :value="String(key.id)">
                  {{ key.name }} · {{ maskKey(key.key) }}
                </option>
              </select>
            </div>
            <div v-else class="field">
              <label for="image-custom-key">API Key</label>
              <input id="image-custom-key" v-model="customKey" type="password" autocomplete="off" placeholder="sk-xxxxxx" />
            </div>

            <div class="field">
              <label for="image-prompt">提示词</label>
              <textarea id="image-prompt" v-model="imagePrompt" rows="8" placeholder="描述你想生成的图片。"></textarea>
            </div>

            <div class="prompt-chips">
              <button type="button" @click="applyImageTemplate('breakfast')">早餐桌</button>
              <button type="button" @click="applyImageTemplate('walk')">城市散步</button>
              <button type="button" @click="applyImageTemplate('reading')">阅读角</button>
            </div>

            <div class="compact-grid single">
              <div class="field">
                <label for="image-size">尺寸</label>
                <select id="image-size" v-model="imageSize">
                  <option value="1024x1024">方图 1024</option>
                  <option value="1536x1024">横图 1536</option>
                  <option value="1024x1536">竖图 1536</option>
                </select>
              </div>
            </div>

            <p v-if="imageFormatWarning" class="note danger">{{ imageFormatWarning }}</p>
            <button class="primary-action full" type="submit" :disabled="!canSubmitImage || sendingImage">
              <span v-if="sendingImage" class="spinner"></span>
              {{ sendingImage ? '生成中' : '立即生成' }}
            </button>
            <p v-if="sendingImage" class="generation-hint" role="status">
              图片正在生成，请不要离开本页面，完成后会自动显示结果。
            </p>

            <details class="advanced-drawer">
              <summary>高级设置</summary>
              <div class="advanced-grid">
                <label>
                  <span>模型</span>
                  <input v-model.trim="imageModel" type="text" />
                </label>
                <label>
                  <span>Base URL</span>
                  <input v-model.trim="baseUrl" type="url" />
                </label>
                <label>
                  <span>质量</span>
                  <select v-model="imageQuality">
                    <option value="auto">auto</option>
                    <option value="medium">medium</option>
                    <option value="high">high</option>
                  </select>
                </label>
                <label>
                  <span>格式</span>
                  <select v-model="imageFormat">
                    <option value="png">png</option>
                    <option value="jpeg">jpeg</option>
                    <option value="webp">webp</option>
                  </select>
                </label>
              </div>
            </details>
          </form>

          <section class="image-preview">
            <div class="preview-head">
              <div>
                <h2>生成结果</h2>
                <p>{{ imageEndpointLabel }}</p>
              </div>
              <span class="storage-note">只在浏览器展示</span>
            </div>

            <div v-if="imageErrorMessage" class="error-box">
              <strong>请求失败</strong>
              <p>{{ imageErrorMessage }}</p>
              <pre v-if="imageRawError">{{ imageRawError }}</pre>
            </div>

            <div v-if="generatedImages.length" class="image-results">
              <figure v-for="(image, index) in generatedImages" :key="image.src">
                <img :src="image.src" :alt="`生成图片 ${index + 1}`" />
                <figcaption>
                  <span>图片 {{ index + 1 }}</span>
                  <a :href="image.src" :download="`tokenxiangyun-image-${index + 1}.${image.downloadExt}`" target="_blank" rel="noopener noreferrer">下载</a>
                </figcaption>
              </figure>
            </div>
            <div v-else class="empty-image">
              <span class="empty-icon">Im</span>
              <strong>这里会显示生成后的图片</strong>
              <p>图片不会由本页面写入服务器磁盘。请求最长等待 5 分钟。</p>
            </div>

            <details class="advanced-drawer debug-drawer">
              <summary>调试信息</summary>
              <div class="debug-tabs">
                <button type="button" :class="{ active: imageDebugView === 'request' }" @click="imageDebugView = 'request'">请求</button>
                <button type="button" :class="{ active: imageDebugView === 'response' }" :disabled="!imageRawResponse" @click="imageDebugView = 'response'">响应</button>
              </div>
              <pre>{{ imageDebugView === 'request' ? imagePayloadPreview : (imageRawResponse || '发送后显示原始响应 JSON') }}</pre>
            </details>
          </section>
        </section>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, onMounted, ref } from 'vue'
import { withBase } from 'vitepress'

type KeyMode = 'saved' | 'custom'
type KeyLoadState = 'idle' | 'loading' | 'ready' | 'error'
type WorkbenchTab = 'text' | 'image'
type DebugView = 'request' | 'response'

interface ApiKeyGroup {
  id: number
  name: string
  platform?: string
}

interface ApiKeyItem {
  id: number
  key: string
  name: string
  status: string
  group_id: number | null
  group?: ApiKeyGroup | null
}

interface PaginatedKeys {
  data?: ApiKeyItem[]
  items?: ApiKeyItem[]
  total?: number
}

interface GeneratedImage {
  src: string
  downloadExt: string
}

const HelpTip = defineComponent({
  name: 'HelpTip',
  props: {
    text: {
      type: String,
      required: true,
    },
  },
  setup(props) {
    return () => h('span', { class: 'help-tip' }, [
      h('button', { class: 'help-button', type: 'button', 'aria-label': props.text }, '?'),
      h('span', { class: 'tooltip', role: 'tooltip' }, props.text),
    ])
  },
})

const modelOptions = [
  { value: 'gpt-5.5', label: 'gpt-5.5 · 默认推荐' },
  { value: 'gpt-5.4', label: 'gpt-5.4 · 稳定可选' },
]

const IMAGE_REQUEST_TIMEOUT_MS = 5 * 60 * 1000

const guideLogoSrc = withBase('/logo-80.png')
const embeddedToken = ref('')
const isEmbedded = ref(false)

const activeTab = ref<WorkbenchTab>('text')
const keyMode = ref<KeyMode>('saved')
const keyLoadState = ref<KeyLoadState>('idle')
const loadingKeys = ref(false)
const keyError = ref('')
const keys = ref<ApiKeyItem[]>([])
const selectedKeyId = ref('')
const customKey = ref('')

const serviceOrigin = ref('https://kkflow.org')
const localPreview = isLocalPreview()
const baseUrl = ref(normalizeBaseUrl(defaultBaseUrl()))

const model = ref(modelOptions[0].value)
const temperature = ref(0.7)
const topP = ref(1)
const maxOutputTokens = ref(1200)
const reasoningEffort = ref('auto')
const textVerbosity = ref('auto')
const serviceTier = ref('auto')
const systemPrompt = ref('你是一个简洁、准确的中文助手。')
const userPrompt = ref('我周六想在家招待 4 位朋友吃晚饭，预算 300 元，家里只有电磁炉和空气炸锅。请帮我安排一份不太费事的菜单、采购清单和当天准备时间表。')

const sendingText = ref(false)
const fullOutputText = ref('')
const displayedOutputText = ref('')
const textRawResponse = ref('')
const textErrorMessage = ref('')
const textRawError = ref('')
const textDurationMs = ref<number | null>(null)
const copiedText = ref(false)
const typing = ref(false)
const textDebugView = ref<DebugView>('request')
let typingRunId = 0

const imageModel = ref('gpt-image-2')
const imagePrompt = ref('生成一张真实自然的生活方式照片：周末清晨的小餐桌，木质桌面上有咖啡、吐司、橙子和一本半打开的手账，窗边有柔和晨光，画面温暖、干净、有生活气。')
const imagePromptNote = ref('不要水印，不要文字，不要过度摆拍，保持真实自然的摄影质感。')
const imageSizeMode = ref<'preset' | 'custom'>('preset')
const imageSize = ref('1024x1024')
const imageWidth = ref(1024)
const imageHeight = ref(1024)
const imageQuality = ref('high')
const imageBackground = ref('opaque')
const imageFormat = ref('png')
const imageCompression = ref(90)
const imageModeration = ref('auto')
const imageUser = ref('')
const sendingImage = ref(false)
const generatedImages = ref<GeneratedImage[]>([])
const imageRawResponse = ref('')
const imageErrorMessage = ref('')
const imageRawError = ref('')
const imageDurationMs = ref<number | null>(null)
const imageDebugView = ref<DebugView>('request')

const keyApiBase = computed(() => proxiedApiBase())
const normalizedBaseUrl = computed(() => normalizeBaseUrl(baseUrl.value))
const textEndpointLabel = computed(() => `${normalizedBaseUrl.value}/responses`)
const imageEndpointLabel = computed(() => `${normalizedBaseUrl.value}/images/generations`)
const requestBaseUrl = computed(() => proxiedOpenAIBase(normalizedBaseUrl.value))

const selectableKeys = computed(() => {
  return keys.value.filter((key) => {
    if (key.status !== 'active') return false
    if (!key.key) return false
    const platform = key.group?.platform?.toLowerCase()
    return !platform || platform === 'openai'
  })
})

const selectedKey = computed(() => selectableKeys.value.find((key) => String(key.id) === selectedKeyId.value) || null)
const activeKey = computed(() => keyMode.value === 'custom' ? customKey.value.trim() : selectedKey.value?.key || '')
const canSubmitText = computed(() => !!activeKey.value && !!normalizedBaseUrl.value && !!userPrompt.value.trim() && !!model.value)
const imageFormatWarning = computed(() => {
  if (imageBackground.value === 'transparent' && imageFormat.value === 'jpeg') {
    return 'transparent 背景不能搭配 jpeg，请改用 png 或 webp。'
  }
  return ''
})
const canSubmitImage = computed(() => {
  return !!activeKey.value && !!normalizedBaseUrl.value && !!imagePrompt.value.trim() && !!imageModel.value && !imageFormatWarning.value
})

const statusText = computed(() => {
  if (keyLoadState.value === 'loading') return '正在读取 Key'
  if (keyLoadState.value === 'ready') return selectableKeys.value.length ? `已加载 ${selectableKeys.value.length} 个可用 Key` : '暂无可用 Key'
  if (keyLoadState.value === 'error') return 'Key 列表读取失败'
  return isEmbedded.value ? '等待加载' : '独立访问'
})

const keySelectPlaceholder = computed(() => {
  if (loadingKeys.value) return '正在加载...'
  if (!embeddedToken.value) return '未检测到嵌入登录 token'
  if (selectableKeys.value.length === 0) return '暂无可用 OpenAI Key'
  return '请选择 API Key'
})

const keyHelpText = computed(() => {
  if (!embeddedToken.value) return '从主服务自定义菜单嵌入打开时，会自动读取你的 Key 列表。'
  if (selectableKeys.value.length === 0) return '可以切换到自定义 Key 模式手动输入。'
  return '只展示 active 状态且属于 OpenAI 分组的 Key。'
})

const textMetaItems = computed(() => {
  const items: Array<{ label: string; value: string }> = []
  if (textDurationMs.value !== null) items.push({ label: '耗时', value: `${textDurationMs.value} ms` })
  if (model.value) items.push({ label: '模型', value: model.value })
  if (activeKey.value) items.push({ label: 'Key', value: maskKey(activeKey.value) })
  return items
})

const imageSizePayload = computed(() => {
  if (imageSizeMode.value === 'preset') return imageSize.value
  const width = clampNumber(imageWidth.value, 512, 2048)
  const height = clampNumber(imageHeight.value, 512, 2048)
  return `${width}x${height}`
})

const composedImagePrompt = computed(() => {
  const note = imagePromptNote.value.trim()
  if (!note) return imagePrompt.value.trim()
  return `${imagePrompt.value.trim()}\n\n补充约束：${note}`
})

const imageMetaItems = computed(() => {
  const items: Array<{ label: string; value: string }> = []
  if (imageDurationMs.value !== null) items.push({ label: '耗时', value: `${imageDurationMs.value} ms` })
  items.push({ label: '模型', value: imageModel.value })
  items.push({ label: '尺寸', value: imageSizePayload.value })
  if (activeKey.value) items.push({ label: 'Key', value: maskKey(activeKey.value) })
  return items
})

const textPayloadPreview = computed(() => JSON.stringify(buildTextPayload(), null, 2))
const imagePayloadPreview = computed(() => JSON.stringify(buildImagePayload(), null, 2))

onMounted(() => {
  const query = currentQuery()
  const srcHost = normalizeHost(query.get('src_host') || '')
  embeddedToken.value = query.get('token') || ''
  isEmbedded.value = query.get('ui_mode') === 'embedded'
  if (srcHost) {
    serviceOrigin.value = srcHost
  }
  baseUrl.value = normalizeBaseUrl(query.get('base_url') || defaultBaseUrl())

  applyEmbeddedTheme(query)
  if (embeddedToken.value) {
    loadKeys()
  } else {
    keyLoadState.value = 'idle'
    keyMode.value = 'custom'
  }
})

async function loadKeys() {
  if (!embeddedToken.value) {
    keyError.value = '当前页面没有收到主服务登录 token。'
    keyLoadState.value = 'error'
    keyMode.value = 'custom'
    return
  }

  loadingKeys.value = true
  keyLoadState.value = 'loading'
  keyError.value = ''

  try {
    const resp = await fetch(`${keyApiBase.value}/keys?page=1&page_size=100`, {
      headers: {
        Authorization: `Bearer ${embeddedToken.value}`,
        Accept: 'application/json',
      },
    })
    const data = await parseJson(resp)
    if (!resp.ok) {
      throw new Error(extractErrorMessage(data, `HTTP ${resp.status}`))
    }
    keys.value = normalizeKeyList(data)
    if (!selectedKeyId.value && selectableKeys.value[0]) {
      selectedKeyId.value = String(selectableKeys.value[0].id)
    }
    keyLoadState.value = 'ready'
  } catch (error) {
    keyError.value = error instanceof Error ? error.message : '读取 Key 列表失败'
    keyLoadState.value = 'error'
    keyMode.value = 'custom'
  } finally {
    loadingKeys.value = false
  }
}

function buildTextPayload(): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    model: model.value,
    input: [
      { role: 'system', content: systemPrompt.value || '你是一个简洁、准确的中文助手。' },
      { role: 'user', content: userPrompt.value },
    ],
    temperature: clampNumber(temperature.value, 0, 2),
    top_p: clampNumber(topP.value, 0, 1),
    max_output_tokens: clampNumber(maxOutputTokens.value, 16, 32000),
  }
  if (reasoningEffort.value !== 'auto') {
    payload.reasoning = { effort: reasoningEffort.value }
  }
  if (textVerbosity.value !== 'auto') {
    payload.text = { verbosity: textVerbosity.value }
  }
  if (serviceTier.value !== 'auto') {
    payload.service_tier = serviceTier.value
  }
  return payload
}

async function sendTextRequest() {
  if (!canSubmitText.value || sendingText.value) return

  sendingText.value = true
  resetTextOutput()
  const startedAt = performance.now()

  try {
    const resp = await fetch(`${requestBaseUrl.value}/responses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${activeKey.value}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(buildTextPayload()),
    })
    const data = await parseJson(resp)
    textDurationMs.value = Math.round(performance.now() - startedAt)
    textRawResponse.value = JSON.stringify(data, null, 2)
    textDebugView.value = 'response'

    if (!resp.ok) {
      throw new RequestError(extractErrorMessage(data, `HTTP ${resp.status}`), data)
    }

    fullOutputText.value = extractResponsesText(data) || textRawResponse.value
    startTypewriter(fullOutputText.value)
  } catch (error) {
    textDurationMs.value = Math.round(performance.now() - startedAt)
    if (error instanceof RequestError) {
      textErrorMessage.value = error.message
      textRawError.value = JSON.stringify(error.payload, null, 2)
    } else {
      textErrorMessage.value = networkErrorMessage(error)
    }
  } finally {
    sendingText.value = false
  }
}

function buildImagePayload(): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    model: imageModel.value,
    prompt: composedImagePrompt.value,
    size: imageSizePayload.value,
    quality: imageQuality.value,
    background: imageBackground.value,
    output_format: imageFormat.value,
    moderation: imageModeration.value,
    n: 1,
  }
  if (imageFormat.value !== 'png') {
    payload.output_compression = clampNumber(imageCompression.value, 0, 100)
  }
  if (imageUser.value) {
    payload.user = imageUser.value
  }
  return payload
}

async function sendImageRequest() {
  if (!canSubmitImage.value || sendingImage.value) return

  sendingImage.value = true
  resetImageOutput()
  const startedAt = performance.now()

  try {
    const resp = await fetchWithTimeout(`${requestBaseUrl.value}/images/generations`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${activeKey.value}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(buildImagePayload()),
    }, IMAGE_REQUEST_TIMEOUT_MS)
    const data = await parseJson(resp)
    imageDurationMs.value = Math.round(performance.now() - startedAt)
    imageRawResponse.value = JSON.stringify(data, null, 2)
    imageDebugView.value = 'response'

    if (!resp.ok) {
      throw new RequestError(extractErrorMessage(data, `HTTP ${resp.status}`), data)
    }

    generatedImages.value = extractImages(data, imageFormat.value)
  } catch (error) {
    imageDurationMs.value = Math.round(performance.now() - startedAt)
    if (error instanceof RequestError) {
      imageErrorMessage.value = error.message
      imageRawError.value = JSON.stringify(error.payload, null, 2)
    } else {
      imageErrorMessage.value = networkErrorMessage(error)
    }
  } finally {
    sendingImage.value = false
  }
}

function applyTextTemplate(name: 'dinner') {
  if (name !== 'dinner') return
  systemPrompt.value = '你是一个贴近日常生活的中文助手，回答要具体、实用，优先用清单和步骤。'
  userPrompt.value = '我周六想在家招待 4 位朋友吃晚饭，预算 300 元，家里只有电磁炉和空气炸锅。请帮我安排一份不太费事的菜单、采购清单和当天准备时间表。'
  temperature.value = 0.5
  topP.value = 1
  maxOutputTokens.value = 1000
}

function applyImageTemplate(name: 'breakfast' | 'walk' | 'reading') {
  if (name === 'walk') {
    imagePrompt.value = '生成一张横向生活摄影：傍晚的城市街角，两位朋友拎着奶茶慢慢散步，路边有暖色店铺灯光和轻微雨后的地面反光，氛围轻松、真实、有电影感。'
    imagePromptNote.value = '不要水印，不要文字，不要夸张滤镜，人物表情自然，街景干净不拥挤。'
    imageSizeMode.value = 'preset'
    imageSize.value = '1536x1024'
    imageQuality.value = 'high'
    return
  }
  if (name === 'reading') {
    imagePrompt.value = '生成一张方形室内生活照片：雨天午后的居家阅读角，米白色单人沙发旁有落地灯、小边几、热茶和打开的书，窗外雨滴模糊，画面安静、舒适、温暖。'
    imagePromptNote.value = '不要水印，不要文字，不要人物正脸，保持自然光和真实家居质感。'
    imageSizeMode.value = 'preset'
    imageSize.value = '1024x1024'
    imageQuality.value = 'high'
    return
  }
  imagePrompt.value = '生成一张真实自然的生活方式照片：周末清晨的小餐桌，木质桌面上有咖啡、吐司、橙子和一本半打开的手账，窗边有柔和晨光，画面温暖、干净、有生活气。'
  imagePromptNote.value = '不要水印，不要文字，不要过度摆拍，保持真实自然的摄影质感。'
  imageSizeMode.value = 'preset'
  imageSize.value = '1536x1024'
  imageQuality.value = 'high'
}

function resetTextOutput() {
  typingRunId += 1
  typing.value = false
  fullOutputText.value = ''
  displayedOutputText.value = ''
  textRawResponse.value = ''
  textErrorMessage.value = ''
  textRawError.value = ''
  textDurationMs.value = null
  copiedText.value = false
  textDebugView.value = 'request'
}

function resetImageOutput() {
  generatedImages.value = []
  imageRawResponse.value = ''
  imageErrorMessage.value = ''
  imageRawError.value = ''
  imageDurationMs.value = null
  imageDebugView.value = 'request'
}

function startTypewriter(text: string) {
  const runId = ++typingRunId
  typing.value = true
  displayedOutputText.value = ''
  let index = 0
  const step = () => {
    if (runId !== typingRunId) return
    const chunkSize = text.length > 900 ? 8 : 3
    index = Math.min(text.length, index + chunkSize)
    displayedOutputText.value = text.slice(0, index)
    if (index < text.length) {
      window.setTimeout(step, 18)
    } else {
      typing.value = false
    }
  }
  step()
}

async function copyTextOutput() {
  if (!displayedOutputText.value) return
  await navigator.clipboard.writeText(fullOutputText.value || displayedOutputText.value)
  copiedText.value = true
  window.setTimeout(() => {
    copiedText.value = false
  }, 1400)
}

function normalizeHost(value: string): string {
  if (!value) return ''
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
    return url.origin
  } catch {
    return ''
  }
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  return trimmed.replace(/\/+$/, '')
}

function isLocalPreview(): boolean {
  if (typeof window === 'undefined') return false
  return window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost'
}

function currentQuery(): URLSearchParams {
  if (typeof window === 'undefined') return new URLSearchParams()
  return new URLSearchParams(window.location.search)
}

function defaultBaseUrl(): string {
  return `${serviceOrigin.value}/v1`
}

function proxiedApiBase(): string {
  if (localPreview && sameOrigin(serviceOrigin.value, 'https://kkflow.org')) return '/api/v1'
  return `${serviceOrigin.value}/api/v1`
}

function proxiedOpenAIBase(value: string): string {
  if (localPreview && sameOrigin(value, 'https://kkflow.org')) return '/v1'
  return value
}

function sameOrigin(value: string, expected: string): boolean {
  try {
    return new URL(value).origin === new URL(expected).origin
  } catch {
    return false
  }
}

function networkErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return '图片请求已超过 5 分钟，已自动停止。请降低尺寸、质量或稍后重试。'
  }
  const message = error instanceof Error ? error.message : ''
  if (message === 'Failed to fetch') {
    return '浏览器无法发起请求。请确认 Base URL 是 https://kkflow.org/v1，或当前域名已允许跨域访问。'
  }
  return message || '请求失败'
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    window.clearTimeout(timeout)
  }
}

function applyEmbeddedTheme(query: URLSearchParams) {
  if (typeof document === 'undefined') return
  const theme = query.get('theme')
  if (theme === 'dark') {
    document.documentElement.classList.add('dark')
  }
}

async function parseJson(resp: Response): Promise<unknown> {
  const text = await resp.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return { message: text }
  }
}

function normalizeKeyList(raw: unknown): ApiKeyItem[] {
  const body = raw as { data?: PaginatedKeys | ApiKeyItem[] }
  const data = body?.data ?? raw
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object') {
    const paginated = data as PaginatedKeys
    if (Array.isArray(paginated.data)) return paginated.data
    if (Array.isArray(paginated.items)) return paginated.items
  }
  return []
}

function extractResponsesText(raw: unknown): string {
  const data = raw as Record<string, any>
  if (typeof data?.output_text === 'string') return data.output_text
  if (Array.isArray(data?.output)) {
    const parts: string[] = []
    for (const item of data.output) {
      if (Array.isArray(item?.content)) {
        for (const content of item.content) {
          if (typeof content?.text === 'string') parts.push(content.text)
        }
      }
    }
    return parts.join('\n').trim()
  }
  return ''
}

function extractImages(raw: unknown, preferredFormat: string): GeneratedImage[] {
  const data = raw as { data?: Array<Record<string, string>> }
  const list = Array.isArray(data?.data) ? data.data : []
  return list.flatMap((item) => {
    if (typeof item.b64_json === 'string' && item.b64_json) {
      return [{ src: `data:image/${preferredFormat};base64,${item.b64_json}`, downloadExt: preferredFormat }]
    }
    if (typeof item.url === 'string' && item.url) {
      return [{ src: item.url, downloadExt: preferredFormat }]
    }
    return []
  })
}

function extractErrorMessage(raw: unknown, fallback: string): string {
  const data = raw as Record<string, any>
  if (typeof data?.message === 'string') return data.message
  if (typeof data?.error === 'string') return data.error
  if (typeof data?.error?.message === 'string') return data.error.message
  return fallback
}

function maskKey(value: string): string {
  if (!value) return ''
  if (value.length <= 14) return `${value.slice(0, 4)}...`
  return `${value.slice(0, 7)}...${value.slice(-4)}`
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

class RequestError extends Error {
  payload: unknown

  constructor(message: string, payload: unknown) {
    super(message)
    this.payload = payload
  }
}
</script>

<style scoped>
.playground-app {
  box-sizing: border-box;
  min-height: 100vh;
  color: #17181c;
  background:
    linear-gradient(180deg, #f7f8fb 0%, #eef1f6 44%, #f8fafc 100%);
  font-family: Inter, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
}

.playground-app *,
.playground-app *::before,
.playground-app *::after {
  box-sizing: border-box;
}

.playground-app.is-embedded {
  height: 100vh;
  min-height: 100%;
  overflow: hidden;
  background: transparent;
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 58px;
  padding: 0 28px;
  border-bottom: 1px solid #e1e5ec;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(14px);
}

.brand,
.topbar nav,
.status-pill,
.side-head,
.workspace-head,
.panel-title,
.action-row,
.check-row,
.image-results figcaption {
  display: flex;
  align-items: center;
}

.brand {
  gap: 10px;
  color: #17181c;
  font-size: 15px;
  font-weight: 900;
  text-decoration: none;
}

.brand-mark {
  display: block;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  border: 1px solid rgba(15, 118, 110, 0.16);
  border-radius: 7px;
  background: #fffaf3;
  object-fit: cover;
}

.topbar nav {
  gap: 18px;
}

.topbar nav a {
  color: #5e6675;
  font-size: 13px;
  font-weight: 800;
  text-decoration: none;
}

.topbar nav a:hover {
  color: #2f5fd0;
}

.shell {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  width: min(1500px, calc(100% - 36px));
  margin: 0 auto;
  padding: 22px 0 36px;
}

.is-embedded .shell {
  width: 100%;
  height: 100%;
  min-height: 0;
  align-items: stretch;
  padding: 0;
}

.sidebar {
  display: grid;
  gap: 12px;
  align-self: start;
  position: sticky;
  top: 76px;
}

.is-embedded .sidebar {
  position: static;
  top: 16px;
  align-self: stretch;
  min-height: 0;
  overflow: auto;
  padding-right: 4px;
}

.side-card,
.workspace,
.panel {
  border: 1px solid #dfe4ec;
  border-radius: 8px;
  background: #fff;
  box-shadow: none;
}

.side-card {
  padding: 16px;
}

.product-card {
  background:
    linear-gradient(135deg, rgba(47, 95, 208, 0.08), rgba(255, 255, 255, 0) 48%),
    #fff;
}

.eyebrow {
  display: block;
  color: #7a8393;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.02em;
  line-height: 1;
}

.product-card h1,
.workspace-head h2,
.side-head h2,
.panel-title h3,
.section-title h4 {
  margin: 0;
  color: #17181c;
  letter-spacing: 0;
}

.product-card h1 {
  margin-top: 6px;
  font-size: 24px;
  line-height: 1.15;
}

.product-card p,
.workspace-head p,
.section-title p,
.note,
.compact-info dd,
.tool-nav small,
.empty-state p,
.empty-image p,
.raw-details summary {
  color: #667085;
}

.product-card p {
  margin: 10px 0 14px;
  font-size: 13px;
  line-height: 1.65;
}

.status-pill {
  gap: 8px;
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid #dfe4ec;
  border-radius: 8px;
  color: #475467;
  font-size: 12px;
  font-weight: 800;
  background: #f8fafc;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #98a2b3;
}

.status-dot.loading { background: #c47b10; }
.status-dot.ready { background: #2f5fd0; }
.status-dot.error { background: #c9352b; }

.side-head,
.workspace-head,
.panel-title {
  justify-content: space-between;
  gap: 12px;
}

.side-head {
  margin-bottom: 14px;
}

.side-head h2 {
  margin-top: 5px;
  font-size: 14px;
}

.tool-nav {
  display: grid;
  gap: 7px;
}

.tool-nav button {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  min-height: 60px;
  padding: 11px 12px;
  border: 1px solid transparent;
  border-radius: 8px;
  color: #252932;
  text-align: left;
  background: transparent;
  cursor: pointer;
}

.tool-nav button::before {
  position: absolute;
  top: 12px;
  bottom: 12px;
  left: 0;
  width: 3px;
  border-radius: 0 999px 999px 0;
  background: transparent;
  content: "";
}

.tool-nav button.active {
  border-color: #b9c8e8;
  color: #111827;
  background:
    linear-gradient(90deg, rgba(47, 95, 208, 0.1), rgba(255, 255, 255, 0) 72%),
    #f3f6fb;
  box-shadow: inset 0 0 0 1px rgba(47, 95, 208, 0.05);
}

.tool-nav button.active::before {
  background: #2f5fd0;
}

.tool-icon {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 7px;
  color: #2f5fd0;
  font-size: 12px;
  font-weight: 900;
  background: #eaf0ff;
}

.tool-nav button.active .tool-icon {
  color: #fff;
  background: #2f5fd0;
}

.tool-nav strong {
  display: block;
  font-size: 14px;
}

.tool-nav small {
  display: block;
  margin-top: 2px;
  font-size: 12px;
}

.tool-nav em {
  display: none;
  margin-left: auto;
  padding: 3px 7px;
  border: 1px solid rgba(47, 95, 208, 0.18);
  border-radius: 999px;
  color: #2f5fd0;
  font-size: 11px;
  font-style: normal;
  font-weight: 900;
  background: #fff;
}

.tool-nav button.active em {
  display: inline-flex;
}

.compact-info dl {
  display: grid;
  gap: 12px;
  margin: 12px 0 0;
}

.compact-info dt {
  margin-bottom: 4px;
  color: #303542;
  font-size: 12px;
  font-weight: 900;
}

.compact-info dd {
  margin: 0;
  overflow: hidden;
  font-size: 12px;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace {
  min-width: 0;
  padding: 18px;
}

.is-embedded .workspace {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.workspace-head {
  align-items: center;
  padding-bottom: 14px;
  margin-bottom: 12px;
  border-bottom: 1px solid #edf0f5;
}

.workspace-head h2 {
  margin-top: 7px;
  font-size: 26px;
  line-height: 1.15;
}

.workspace-head p {
  max-width: 440px;
  margin: 0;
  font-size: 13px;
  text-align: right;
}

.workbench-tabs {
  display: inline-grid;
  grid-template-columns: repeat(2, minmax(160px, 1fr));
  gap: 4px;
  width: fit-content;
  max-width: 100%;
  padding: 3px;
  margin-bottom: 12px;
  border: 1px solid #dfe4ec;
  border-radius: 8px;
  background: #f4f6f9;
}

.workbench-tabs button {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  min-height: 40px;
  padding: 6px 10px;
  border: 1px solid transparent;
  border-radius: 6px;
  color: #475467;
  text-align: left;
  background: transparent;
  cursor: pointer;
}

.workbench-tabs button.active {
  border-color: #c8d4ea;
  color: #111827;
  background: #fff;
  box-shadow: 0 8px 18px rgba(16, 24, 40, 0.06);
}

.tab-icon {
  display: grid;
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 7px;
  color: #2f5fd0;
  font-size: 12px;
  font-weight: 900;
  background: #eaf0ff;
}

.workbench-tabs button.active .tab-icon {
  color: #fff;
  background: #2f5fd0;
}

.workbench-tabs strong,
.workbench-tabs small {
  display: block;
}

.workbench-tabs strong {
  font-size: 13px;
}

.workbench-tabs small {
  margin-top: 2px;
  color: #667085;
  font-size: 11px;
}

.work-grid {
  display: grid;
  grid-template-columns: minmax(360px, 0.78fr) minmax(560px, 1.22fr);
  gap: 14px;
  align-items: stretch;
  min-height: 0;
}

.is-embedded .work-grid {
  min-height: 0;
  align-items: stretch;
}

.panel {
  padding: 16px;
  box-shadow: none;
}

.control-panel,
.chat-panel {
  min-height: 0;
}

.is-embedded .panel {
  min-height: 0;
  overflow: auto;
}

.is-embedded .control-panel {
  display: flex;
  flex-direction: column;
}

.panel-title {
  margin-bottom: 16px;
}

.panel-title h3 {
  margin-top: 6px;
  font-size: 17px;
}

.section-block {
  padding: 14px;
  margin-bottom: 12px;
  border: 1px solid #edf0f5;
  border-radius: 8px;
  background: #fbfcfe;
}

.section-title {
  display: grid;
  gap: 5px;
  margin-bottom: 12px;
}

.section-title.inline-title {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.section-title h4 {
  font-size: 14px;
}

.section-title p {
  margin: 0;
  font-size: 12px;
}

.connection-settings {
  border-color: #dbe5f6;
  background:
    linear-gradient(135deg, rgba(47, 95, 208, 0.08), rgba(255, 255, 255, 0) 58%),
    #fbfcfe;
}

.field {
  display: grid;
  gap: 7px;
  min-width: 0;
  margin-bottom: 12px;
}

.field:last-child {
  margin-bottom: 0;
}

.field label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  max-width: 100%;
  color: #303542;
  font-size: 12px;
  font-weight: 900;
  line-height: 1.35;
}

.field label > span:first-child {
  min-width: 0;
  overflow-wrap: anywhere;
}

input,
select,
textarea {
  width: 100%;
  border: 1px solid #dce2eb;
  border-radius: 7px;
  color: #17181c;
  font: inherit;
  background: #fff;
}

input,
select {
  height: 36px;
  padding: 0 10px;
  font-size: 13px;
}

textarea {
  min-height: 86px;
  padding: 10px;
  font-size: 13px;
  line-height: 1.6;
  resize: vertical;
}

input[type='range'] {
  padding: 0;
}

input:focus,
select:focus,
textarea:focus {
  border-color: #2f5fd0;
  outline: 2px solid rgba(47, 95, 208, 0.14);
}

.segmented {
  display: grid;
  grid-template-columns: 1fr 1fr;
  padding: 3px;
  border: 1px solid #dce2eb;
  border-radius: 7px;
  background: #f4f6f9;
}

.segmented button {
  min-height: 30px;
  border: 0;
  border-radius: 5px;
  color: #545d6d;
  font-size: 12px;
  font-weight: 900;
  background: transparent;
  cursor: pointer;
}

.segmented button.active {
  color: #fff;
  background: #1b1d24;
}

.param-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
}

.param-grid.two {
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.check-row {
  gap: 9px;
  padding: 10px;
  border: 1px solid #e4e9f1;
  border-radius: 8px;
  background: #fff;
}

.check-row input {
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
}

.check-row strong {
  display: block;
  color: #303542;
  font-size: 12px;
}

.check-row small {
  display: block;
  margin-top: 3px;
  color: #667085;
  font-size: 12px;
  line-height: 1.45;
}

.prompt-chips,
.action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.prompt-chips {
  margin-bottom: 12px;
}

.prompt-chips button,
.ghost-button,
.primary-action,
.secondary-action,
.icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  font-weight: 900;
  cursor: pointer;
}

.prompt-chips button,
.ghost-button {
  min-height: 30px;
  padding: 0 10px;
  border: 1px solid #dce2eb;
  color: #303542;
  font-size: 12px;
  background: #fff;
}

.prompt-chips button:hover,
.ghost-button:hover,
.secondary-action:hover,
.icon-button:hover {
  border-color: #b9c5d7;
  background: #f7f9fc;
}

.action-row {
  margin-top: 14px;
}

.is-embedded .action-row {
  position: sticky;
  bottom: 0;
  z-index: 5;
  margin: auto -16px -16px;
  padding: 12px 16px 16px;
  border-top: 1px solid #edf0f5;
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(12px);
}

.primary-action {
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid #1b1d24;
  color: #fff;
  font-size: 13px;
  background: #1b1d24;
}

.primary-action:hover:not(:disabled) {
  background: #2f5fd0;
  border-color: #2f5fd0;
}

.secondary-action {
  min-height: 36px;
  padding: 0 12px;
  border: 1px solid #dce2eb;
  color: #252932;
  font-size: 13px;
  background: #fff;
}

.secondary-action.small {
  min-height: 30px;
  padding: 0 10px;
  font-size: 12px;
}

.icon-button {
  width: 30px;
  height: 30px;
  border: 1px solid #dce2eb;
  color: #303542;
  font-size: 12px;
  background: #fff;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.54;
}

:deep(.help-tip) {
  position: relative;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
}

:deep(.help-button) {
  display: inline-grid;
  width: 17px;
  height: 17px;
  place-items: center;
  border: 1px solid #c7d0df;
  border-radius: 999px;
  color: #5a6474;
  font-size: 11px;
  font-weight: 900;
  line-height: 1;
  background: #fff;
  cursor: help;
}

:deep(.tooltip) {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 8px);
  z-index: 50;
  width: 260px;
  max-width: min(260px, 70vw);
  padding: 9px 10px;
  border: 1px solid #23262f;
  border-radius: 7px;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.55;
  pointer-events: none;
  background: #17181c;
  box-shadow: 0 8px 14px rgba(16, 24, 40, 0.18);
  opacity: 0;
  transform: translate(-50%, 4px);
  transition: opacity 0.15s ease, transform 0.15s ease;
}

:deep(.help-tip:hover .tooltip),
:deep(.help-tip:focus-within .tooltip) {
  opacity: 1;
  transform: translate(-50%, 0);
}

.note {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
}

.note.danger {
  color: #bc2f27;
}

.meta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 8px;
  margin-bottom: 12px;
}

.meta-grid div {
  min-width: 0;
  padding: 9px 10px;
  border: 1px solid #e4e9f1;
  border-radius: 8px;
  background: #f8fafc;
}

.meta-grid span {
  display: block;
  color: #667085;
  font-size: 11px;
  font-weight: 800;
}

.meta-grid strong {
  display: block;
  margin-top: 4px;
  overflow: hidden;
  color: #252932;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.output-box {
  height: clamp(420px, 58vh, 680px);
  min-height: 0;
  border: 1px solid #dce2eb;
  border-radius: 8px;
  overflow: auto;
  background: #fbfcfe;
}

.chat-panel {
  display: flex;
  flex-direction: column;
  background:
    linear-gradient(180deg, #fff 0%, #f8fafc 100%);
}

.chat-panel .output-box,
.chat-panel .empty-image,
.chat-panel .image-results {
  flex: 1 1 auto;
}

.chat-panel .output-box {
  border-color: #d8e0eb;
  background:
    linear-gradient(180deg, rgba(47, 95, 208, 0.04), rgba(255, 255, 255, 0) 32%),
    #fff;
}

.empty-image,
.image-results {
  min-height: 520px;
  border: 1px solid #dce2eb;
  border-radius: 8px;
  overflow: hidden;
  background: #fbfcfe;
}

.output-box pre,
.raw-details pre,
.error-box pre {
  margin: 0;
  padding: 14px;
  overflow: auto;
  color: #252932;
  font-size: 13px;
  line-height: 1.7;
  white-space: pre-wrap;
}

.output-box pre {
  min-height: 100%;
  padding: 18px;
}

.empty-state,
.empty-image {
  display: grid;
  place-content: center;
  padding: 26px;
  text-align: center;
}

.empty-state strong,
.empty-image strong {
  color: #252932;
  font-size: 16px;
}

.empty-state p,
.empty-image p {
  max-width: 360px;
  margin: 7px auto 0;
  font-size: 13px;
  line-height: 1.6;
}

.typing-caret {
  display: inline-block;
  width: 7px;
  height: 1em;
  margin-left: 2px;
  vertical-align: -2px;
  background: #2f5fd0;
  animation: blink 0.9s steps(2, start) infinite;
}

.storage-note {
  display: inline-flex;
  min-height: 28px;
  align-items: center;
  padding: 0 10px;
  border: 1px solid #dce2eb;
  border-radius: 999px;
  color: #475467;
  font-size: 12px;
  font-weight: 900;
  background: #f8fafc;
}

.image-results {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
  min-height: 0;
  padding: 12px;
}

.image-results figure {
  margin: 0;
  overflow: hidden;
  border: 1px solid #e4e9f1;
  border-radius: 8px;
  background: #fff;
}

.image-results img {
  display: block;
  width: 100%;
  aspect-ratio: 1;
  object-fit: contain;
  background: #f4f6f9;
}

.image-results figcaption {
  justify-content: space-between;
  padding: 9px 10px;
  color: #475467;
  font-size: 12px;
  font-weight: 900;
}

.image-results a {
  color: #2f5fd0;
  text-decoration: none;
}

.error-box {
  padding: 13px;
  margin-bottom: 12px;
  border: 1px solid rgba(188, 47, 39, 0.28);
  border-radius: 8px;
  color: #9b2b25;
  background: rgba(188, 47, 39, 0.07);
}

.error-box strong {
  display: block;
  margin-bottom: 5px;
}

.error-box p {
  margin: 0;
  font-size: 13px;
  line-height: 1.55;
}

.error-box pre {
  margin-top: 10px;
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.72);
}

.raw-details {
  flex: 0 0 auto;
  margin-top: 12px;
}

.raw-details summary {
  cursor: pointer;
  font-size: 12px;
  font-weight: 900;
}

.debug-tabs {
  display: inline-flex;
  gap: 3px;
  padding: 3px;
  margin-top: 8px;
  border: 1px solid #dce2eb;
  border-radius: 7px;
  background: #f4f6f9;
}

.debug-tabs button {
  min-height: 26px;
  padding: 0 12px;
  border: 0;
  border-radius: 5px;
  color: #545d6d;
  font-size: 12px;
  font-weight: 900;
  background: transparent;
  cursor: pointer;
}

.debug-tabs button.active {
  color: #fff;
  background: #1b1d24;
}

.debug-tabs button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.raw-details pre {
  max-height: 260px;
  margin-top: 8px;
  border: 1px solid #dce2eb;
  border-radius: 8px;
  background: #fbfcfe;
}

.spinner {
  width: 14px;
  height: 14px;
  margin-right: 8px;
  border: 2px solid rgba(255, 255, 255, 0.5);
  border-top-color: #fff;
  border-radius: 999px;
  animation: spin 0.8s linear infinite;
}

.spinning {
  display: inline-flex;
  animation: spin 0.8s linear infinite;
}

.dark .playground-app {
  color: #eef2f7;
  background: #0f1117;
}

.dark .topbar,
.dark .side-card,
.dark .workspace,
.dark .panel {
  border-color: rgba(255, 255, 255, 0.08);
  background: #161922;
  box-shadow: none;
}

.dark .product-card {
  background:
    linear-gradient(135deg, rgba(78, 118, 235, 0.16), rgba(22, 25, 34, 0) 48%),
    #161922;
}

.dark .brand,
.dark .product-card h1,
.dark .workspace-head h2,
.dark .side-head h2,
.dark .panel-title h3,
.dark .section-title h4,
.dark .field label,
.dark .compact-info dt,
.dark .check-row strong,
.dark .meta-grid strong,
.dark .empty-state strong,
.dark .empty-image strong {
  color: #f4f7fb;
}

.dark .topbar nav a,
.dark .product-card p,
.dark .workspace-head p,
.dark .section-title p,
.dark .note,
.dark .compact-info dd,
.dark .tool-nav small,
.dark .empty-state p,
.dark .empty-image p,
.dark .raw-details summary,
.dark .meta-grid span {
  color: #9aa4b5;
}

.dark .section-block,
.dark .status-pill,
.dark .tool-nav button.active,
.dark .workbench-tabs,
.dark .workbench-tabs button.active,
.dark .check-row,
.dark .meta-grid div,
.dark .output-box,
.dark .empty-image,
.dark .image-results,
.dark .raw-details pre,
.dark .storage-note {
  border-color: rgba(255, 255, 255, 0.08);
  background: #10131a;
}

.dark input,
.dark select,
.dark textarea,
.dark .segmented,
.dark .debug-tabs,
.dark .prompt-chips button,
.dark .ghost-button,
.dark .secondary-action,
.dark .icon-button {
  border-color: rgba(255, 255, 255, 0.1);
  color: #f4f7fb;
  background: #10131a;
}

.dark .primary-action,
.dark .segmented button.active {
  border-color: #f4f7fb;
  color: #10131a;
  background: #f4f7fb;
}

.dark .tab-icon {
  color: #9fb7ff;
  background: #18223a;
}

.dark .workbench-tabs button.active .tab-icon {
  color: #10131a;
  background: #f4f7fb;
}

.dark .is-embedded .action-row {
  border-color: rgba(255, 255, 255, 0.08);
  background: rgba(22, 25, 34, 0.94);
}

.dark :deep(.tooltip) {
  border-color: rgba(255, 255, 255, 0.1);
  background: #06080c;
}

.dark .output-box pre,
.dark .raw-details pre,
.dark .error-box pre {
  color: #eef2f7;
}

.dark .image-results figure {
  border-color: rgba(255, 255, 255, 0.08);
  background: #161922;
}

.dark .image-results img {
  background: #0b0e14;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

@keyframes blink {
  50% { opacity: 0; }
}

@media (max-width: 1120px) {
  .shell {
    grid-template-columns: 1fr;
  }

  .is-embedded .playground-app,
  .playground-app.is-embedded {
    height: auto;
    overflow: visible;
  }

  .is-embedded .shell {
    height: auto;
  }

  .sidebar {
    position: static;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .is-embedded .sidebar,
  .is-embedded .workspace,
  .is-embedded .panel {
    overflow: visible;
  }

  .is-embedded .workspace {
    height: auto;
  }

  .is-embedded .action-row {
    position: static;
    margin: 14px 0 0;
    padding: 0;
    border-top: 0;
    background: transparent;
    backdrop-filter: none;
  }

  .product-card,
  .compact-info {
    grid-column: 1 / -1;
  }
}

@media (max-width: 920px) {
  .work-grid,
  .image-work-grid,
  .param-grid,
  .param-grid.two {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 680px) {
  .topbar {
    height: auto;
    min-height: 58px;
    align-items: flex-start;
    gap: 12px;
    padding: 14px 18px;
  }

  .topbar nav {
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 10px;
  }

  .shell {
    width: min(100% - 22px, 1360px);
    padding-top: 12px;
  }

  .sidebar {
    grid-template-columns: 1fr;
  }

  .workspace {
    padding: 14px;
  }

  .workspace-head {
    display: grid;
    align-items: start;
  }

  .workspace-head p {
    text-align: left;
  }

  .meta-grid {
    grid-template-columns: 1fr;
  }

  :deep(.tooltip) {
    left: auto;
    right: 0;
    transform: translate(0, 4px);
  }

  :deep(.help-tip:hover .tooltip),
  :deep(.help-tip:focus-within .tooltip) {
    transform: translate(0, 0);
  }
}

.playground-app {
  --studio-bg: #eef5f4;
  --studio-surface: #ffffff;
  --studio-panel: #f8fbfb;
  --studio-line: #dbe7e5;
  --studio-line-strong: #b9d8d4;
  --studio-ink: #121827;
  --studio-muted: #64748b;
  --studio-soft: #eef8f7;
  --studio-accent: #0f8b83;
  --studio-accent-strong: #08756e;
  --studio-danger: #b42318;
  --studio-shadow: 0 16px 40px rgba(15, 52, 49, 0.08);
  min-height: 100dvh;
  color: var(--studio-ink);
  background:
    linear-gradient(115deg, rgba(15, 139, 131, 0.1), rgba(255, 255, 255, 0) 40%),
    linear-gradient(180deg, #f6faf9 0%, var(--studio-bg) 100%);
  font-family: Inter, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
}

.topbar {
  height: 56px;
  border-bottom: 1px solid rgba(185, 216, 212, 0.72);
  background: rgba(255, 255, 255, 0.82);
  box-shadow: none;
}

.brand-mark {
  border-radius: 8px;
  background: #fffaf3;
}

.topbar nav a:hover {
  color: var(--studio-accent-strong);
}

.shell {
  display: grid;
  grid-template-columns: 288px minmax(0, 1fr);
  gap: 16px;
  width: min(1740px, calc(100% - 64px));
  min-height: calc(100dvh - 56px);
  margin: 0 auto;
  padding: 18px 0 28px;
}

.is-embedded .shell {
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: 0;
}

.side-rail,
.workspace,
.chat-surface,
.composer,
.image-control,
.image-preview {
  border: 1px solid var(--studio-line);
  border-radius: 28px;
  background: var(--studio-surface);
}

.side-rail {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-height: 0;
  padding: 22px;
  box-shadow: var(--studio-shadow);
}

.rail-head,
.workspace-head,
.head-actions,
.status-card,
.composer-foot,
.preview-head,
.control-title,
.image-results figcaption {
  display: flex;
  align-items: center;
}

.rail-head,
.workspace-head,
.composer-foot,
.preview-head,
.control-title,
.image-results figcaption {
  justify-content: space-between;
  gap: 14px;
}

.rail-head span {
  color: #697386;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.mode-list {
  display: grid;
  gap: 10px;
}

.mode-list button,
.session-item {
  width: 100%;
  border: 1px solid transparent;
  border-radius: 20px;
  color: var(--studio-ink);
  text-align: left;
  background: transparent;
  cursor: pointer;
}

.mode-list button {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 74px;
  padding: 12px;
}

.mode-list button.active,
.session-item.active {
  border-color: var(--studio-line-strong);
  background: linear-gradient(135deg, rgba(15, 139, 131, 0.1), rgba(255, 255, 255, 0.78));
}

.mode-mark {
  display: grid;
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 16px;
  color: var(--studio-accent-strong);
  font-size: 13px;
  font-weight: 900;
  background: var(--studio-soft);
}

.mode-list button.active .mode-mark {
  color: #fff;
  background: var(--studio-accent);
}

.mode-list strong,
.mode-list small,
.session-item strong,
.session-item small,
.status-card strong,
.status-card small {
  display: block;
}

.mode-list strong,
.session-item strong,
.status-card strong {
  font-size: 14px;
}

.mode-list small,
.session-item small,
.status-card small {
  margin-top: 4px;
  color: var(--studio-muted);
  font-size: 12px;
  line-height: 1.4;
}

.rail-section {
  display: grid;
  gap: 10px;
}

.rail-label,
.page-kicker {
  margin: 0;
  color: #697386;
  font-size: 12px;
  font-weight: 900;
}

.status-card {
  gap: 10px;
  padding: 13px;
  border: 1px solid var(--studio-line);
  border-radius: 18px;
  background: var(--studio-panel);
}

.status-dot {
  width: 10px;
  height: 10px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: #98a2b3;
}

.status-dot.loading { background: #d68a00; }
.status-dot.ready { background: var(--studio-accent); }
.status-dot.error { background: var(--studio-danger); }

.session-list {
  margin-top: auto;
}

.session-item {
  padding: 14px;
}

.workspace {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  padding: 0;
  overflow: hidden;
  box-shadow: var(--studio-shadow);
}

.workspace-head {
  min-height: 68px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--studio-line);
  background: rgba(255, 255, 255, 0.76);
}

.workspace-head h1 {
  margin: 3px 0 0;
  color: var(--studio-ink);
  font-size: 28px;
  line-height: 1.15;
  letter-spacing: 0;
}

.head-actions {
  flex-wrap: wrap;
  justify-content: flex-end;
}

.pill,
.storage-note {
  display: inline-flex;
  min-height: 34px;
  align-items: center;
  padding: 0 13px;
  border-radius: 999px;
  color: var(--studio-accent-strong);
  font-size: 12px;
  font-weight: 900;
  background: var(--studio-soft);
}

.chat-studio {
  display: grid;
  grid-template-rows: minmax(280px, 1fr) auto;
  gap: 14px;
  min-height: 0;
  padding: 16px;
  background: rgba(248, 251, 251, 0.7);
}

.chat-surface {
  min-height: 0;
  padding: 22px;
  overflow: auto;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(248, 251, 251, 0.92)),
    var(--studio-surface);
}

.message {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 12px;
  max-width: 980px;
}

.message-avatar,
.empty-icon {
  display: grid;
  place-items: center;
  color: #fff;
  font-weight: 900;
  background: var(--studio-accent);
}

.message-avatar {
  width: 42px;
  height: 42px;
  border-radius: 16px;
}

.message-body {
  min-width: 0;
  padding: 16px 18px;
  border: 1px solid var(--studio-line);
  border-radius: 22px;
  background: #fff;
}

.message-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.message-meta strong {
  font-size: 14px;
}

.message-meta span {
  color: var(--studio-muted);
  font-size: 12px;
}

.message-body pre,
.advanced-drawer pre,
.error-box pre {
  margin: 0;
  overflow: auto;
  color: #253042;
  font-size: 14px;
  line-height: 1.75;
  white-space: pre-wrap;
}

.empty-chat,
.empty-image {
  display: grid;
  min-height: 100%;
  place-content: center;
  justify-items: center;
  padding: 36px;
  text-align: center;
}

.empty-icon {
  width: 48px;
  height: 48px;
  margin-bottom: 16px;
  border-radius: 18px;
}

.empty-chat strong,
.empty-image strong {
  color: var(--studio-ink);
  font-size: 17px;
}

.empty-chat p,
.empty-image p {
  max-width: 460px;
  margin: 8px 0 0;
  color: var(--studio-muted);
  font-size: 14px;
  line-height: 1.7;
}

.composer {
  padding: 16px;
}

.quick-settings {
  display: grid;
  grid-template-columns: minmax(180px, 0.8fr) minmax(220px, 1.1fr) minmax(220px, 1fr);
  gap: 10px;
  margin-bottom: 12px;
}

.quick-settings label,
.advanced-grid label {
  display: grid;
  gap: 7px;
  min-width: 0;
}

.quick-settings span,
.advanced-grid span,
.field label {
  color: #344054;
  font-size: 12px;
  font-weight: 900;
}

.segmented {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3px;
  height: 42px;
  padding: 4px;
  border: 1px solid var(--studio-line);
  border-radius: 16px;
  background: #f4f8f7;
}

.segmented button {
  border: 0;
  border-radius: 12px;
  color: #526172;
  font-size: 13px;
  font-weight: 900;
  background: transparent;
  cursor: pointer;
}

.segmented button.active {
  color: #fff;
  background: var(--studio-accent);
}

input,
select,
textarea {
  width: 100%;
  border: 1px solid var(--studio-line);
  border-radius: 16px;
  color: var(--studio-ink);
  font: inherit;
  background: #fff;
}

input,
select {
  height: 42px;
  padding: 0 13px;
  font-size: 14px;
}

textarea {
  min-height: 104px;
  padding: 13px;
  font-size: 14px;
  line-height: 1.65;
  resize: vertical;
}

input::placeholder,
textarea::placeholder {
  color: #7b8798;
}

input:focus,
select:focus,
textarea:focus,
button:focus-visible,
a:focus-visible {
  border-color: var(--studio-accent);
  outline: 3px solid rgba(15, 139, 131, 0.18);
  outline-offset: 1px;
}

.composer > textarea {
  min-height: 112px;
  border-radius: 22px;
}

.composer-foot {
  margin-top: 12px;
}

.prompt-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.prompt-chips button,
.ghost-button,
.secondary-action,
.icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--studio-line);
  border-radius: 999px;
  color: #344054;
  font-weight: 900;
  background: #fff;
  cursor: pointer;
}

.prompt-chips button,
.ghost-button,
.secondary-action {
  min-height: 38px;
  padding: 0 14px;
  font-size: 13px;
}

.icon-button {
  width: 38px;
  height: 38px;
  font-size: 12px;
}

.prompt-chips button:hover,
.ghost-button:hover,
.secondary-action:hover,
.icon-button:hover {
  border-color: var(--studio-line-strong);
  background: #f7fbfa;
}

.primary-action {
  display: inline-flex;
  min-height: 42px;
  align-items: center;
  justify-content: center;
  padding: 0 22px;
  border: 1px solid var(--studio-accent);
  border-radius: 999px;
  color: #fff;
  font-size: 14px;
  font-weight: 900;
  background: var(--studio-accent);
  cursor: pointer;
}

.primary-action:hover:not(:disabled) {
  border-color: var(--studio-accent-strong);
  background: var(--studio-accent-strong);
}

.primary-action.full {
  width: 100%;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.spinner {
  width: 14px;
  height: 14px;
  margin-right: 8px;
  border: 2px solid rgba(255, 255, 255, 0.52);
  border-top-color: #fff;
  border-radius: 999px;
  animation: spin 0.8s linear infinite;
}

.spinning {
  display: inline-flex;
  animation: spin 0.8s linear infinite;
}

.typing-caret {
  display: inline-block;
  width: 7px;
  height: 1em;
  margin-left: 2px;
  vertical-align: -2px;
  background: var(--studio-accent);
  animation: blink 0.9s steps(2, start) infinite;
}

.note {
  margin: 0 0 10px;
  color: var(--studio-muted);
  font-size: 12px;
  line-height: 1.55;
}

.note.danger {
  color: var(--studio-danger);
}

.generation-hint {
  margin: 10px 0 0;
  border: 1px solid var(--studio-line-strong);
  border-radius: 8px;
  padding: 9px 10px;
  color: var(--studio-accent-strong);
  background: var(--studio-soft);
  font-size: 12px;
  font-weight: 800;
  line-height: 1.5;
}

.error-box {
  padding: 14px;
  margin-bottom: 14px;
  border: 1px solid rgba(180, 35, 24, 0.26);
  border-radius: 18px;
  color: var(--studio-danger);
  background: rgba(180, 35, 24, 0.06);
}

.error-box strong {
  display: block;
  margin-bottom: 5px;
}

.error-box p {
  margin: 0;
  font-size: 13px;
  line-height: 1.6;
}

.advanced-drawer {
  margin-top: 12px;
  border-top: 1px solid var(--studio-line);
  color: var(--studio-muted);
}

.advanced-drawer summary {
  padding-top: 12px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 900;
}

.advanced-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
  margin-top: 12px;
}

.debug-tabs {
  display: inline-flex;
  gap: 4px;
  padding: 4px;
  margin-top: 12px;
  border: 1px solid var(--studio-line);
  border-radius: 999px;
  background: #f4f8f7;
}

.debug-tabs button {
  min-height: 28px;
  padding: 0 12px;
  border: 0;
  border-radius: 999px;
  color: #526172;
  font-size: 12px;
  font-weight: 900;
  background: transparent;
  cursor: pointer;
}

.debug-tabs button.active {
  color: #fff;
  background: var(--studio-accent);
}

.advanced-drawer pre {
  max-height: 260px;
  padding: 12px;
  margin-top: 10px;
  border: 1px solid var(--studio-line);
  border-radius: 16px;
  background: var(--studio-panel);
}

.image-studio {
  display: grid;
  grid-template-columns: 310px minmax(0, 1fr);
  gap: 16px;
  min-height: 0;
  padding: 16px;
  background: rgba(248, 251, 251, 0.7);
}

.image-control {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-height: 0;
  padding: 16px;
  overflow: auto;
}

.control-title h2,
.preview-head h2 {
  margin: 0;
  color: var(--studio-ink);
  font-size: 16px;
  letter-spacing: 0;
}

.control-title p,
.preview-head p {
  margin: 5px 0 0;
  color: var(--studio-muted);
  font-size: 12px;
}

.field {
  display: grid;
  gap: 7px;
  min-width: 0;
  margin: 0;
}

.field label {
  display: block;
}

.compact-grid {
  display: grid;
  grid-template-columns: 1fr 90px;
  gap: 10px;
}

.image-preview {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  min-width: 0;
  min-height: 0;
  padding: 16px;
}

.image-results {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
  min-height: 0;
  padding: 14px;
  border: 1px solid var(--studio-line);
  border-radius: 24px;
  overflow: auto;
  background: var(--studio-panel);
}

.image-results figure {
  margin: 0;
  overflow: hidden;
  border: 1px solid var(--studio-line);
  border-radius: 20px;
  background: #fff;
}

.image-results img {
  display: block;
  width: 100%;
  aspect-ratio: 1;
  object-fit: contain;
  background: #eef3f3;
}

.image-results figcaption {
  padding: 10px 12px;
  color: #526172;
  font-size: 12px;
  font-weight: 900;
}

.image-results a {
  color: var(--studio-accent-strong);
  text-decoration: none;
}

.empty-image {
  min-height: 0;
  border: 1px solid var(--studio-line);
  border-radius: 24px;
  background:
    linear-gradient(135deg, rgba(15, 139, 131, 0.08), rgba(255, 255, 255, 0) 44%),
    #edf3f3;
}

.debug-drawer {
  margin-top: 12px;
}

.dark .playground-app {
  --studio-bg: #0e1717;
  --studio-surface: #161f20;
  --studio-panel: #101a1b;
  --studio-line: rgba(255, 255, 255, 0.1);
  --studio-line-strong: rgba(89, 201, 191, 0.36);
  --studio-ink: #edf7f6;
  --studio-muted: #9fb2b0;
  --studio-soft: rgba(89, 201, 191, 0.14);
  --studio-accent: #45c8bc;
  --studio-accent-strong: #6ee2d7;
  background: #0e1717;
}

.dark .topbar {
  background: rgba(16, 26, 27, 0.88);
}

.dark input,
.dark select,
.dark textarea,
.dark .message-body,
.dark .prompt-chips button,
.dark .ghost-button,
.dark .secondary-action,
.dark .icon-button {
  color: var(--studio-ink);
  background: #101a1b;
}

.dark .primary-action {
  color: #072322;
}

.dark .message-body pre,
.dark .advanced-drawer pre,
.dark .error-box pre {
  color: #dcebea;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.001ms !important;
    scroll-behavior: auto !important;
  }
}

@media (max-width: 1180px) {
  .shell {
    grid-template-columns: 240px minmax(0, 1fr);
    width: min(100% - 28px, 1740px);
  }

  .quick-settings {
    grid-template-columns: 1fr;
  }

  .image-studio {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 860px) {
  .topbar {
    display: grid;
    grid-template-columns: 1fr;
    height: auto;
    min-height: 56px;
    align-items: flex-start;
    gap: 12px;
    padding: 12px 16px;
  }

  .brand {
    white-space: nowrap;
  }

  .topbar nav {
    flex-wrap: wrap;
    justify-content: flex-start;
    gap: 10px;
    width: 100%;
  }

  .topbar nav a {
    font-size: 12px;
  }

  .shell {
    grid-template-columns: 1fr;
    width: min(100% - 20px, 760px);
    min-height: 0;
    padding: 10px 0 18px;
  }

  .side-rail {
    border-radius: 22px;
  }

  .session-list {
    display: none;
  }

  .workspace {
    border-radius: 22px;
  }

  .workspace-head {
    display: grid;
    align-items: start;
  }

  .head-actions {
    justify-content: flex-start;
  }

  .chat-studio,
  .image-studio {
    padding: 10px;
  }

  .chat-surface,
  .composer,
  .image-control,
  .image-preview {
    border-radius: 20px;
  }

  .message {
    grid-template-columns: 1fr;
  }

  .message-avatar {
    display: none;
  }
}

@media (max-width: 560px) {
  .mode-list button {
    min-height: 64px;
  }

  .workspace-head h1 {
    font-size: 24px;
  }

  .compact-grid {
    grid-template-columns: 1fr;
  }

  .composer-foot {
    display: grid;
    align-items: stretch;
  }

  .primary-action,
  .prompt-chips button {
    width: 100%;
  }

  .head-actions .secondary-action {
    width: auto;
  }
}
</style>
