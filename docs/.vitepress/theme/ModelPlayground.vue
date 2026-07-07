<template>
  <div class="playground-app" :class="{ 'is-embedded': isEmbedded }">
    <header v-if="!isEmbedded" class="topbar">
      <a class="brand" href="./">
        <span class="brand-mark">T</span>
        <span>Token向云模型工作台</span>
      </a>
      <nav>
        <a href="./member">会员充值</a>
        <a href="./api">API 接入</a>
        <a href="./">指南首页</a>
      </nav>
    </header>

    <main class="shell">
      <section class="workspace">
        <header class="workspace-head">
          <div>
            <span class="eyebrow">Workbench</span>
            <h2>模型工作台</h2>
          </div>
          <div class="status-pill">
            <span :class="['status-dot', keyLoadState]"></span>
            <span>{{ statusText }}</span>
          </div>
        </header>

        <nav class="workbench-tabs" aria-label="模型工作台功能">
          <button type="button" :class="{ active: activeTab === 'text' }" @click="activeTab = 'text'">
            <span class="tab-icon">Aa</span>
            <span>
              <strong>文本模型</strong>
              <small>Responses API</small>
            </span>
          </button>
          <button type="button" :class="{ active: activeTab === 'image' }" @click="activeTab = 'image'">
            <span class="tab-icon">Im</span>
            <span>
              <strong>生图工作台</strong>
              <small>Image Generations</small>
            </span>
          </button>
        </nav>

        <div v-if="activeTab === 'text'" class="work-grid">
          <section class="panel control-panel">
            <div class="panel-title">
              <div>
                <span class="eyebrow">Request</span>
                <h3>文本请求</h3>
              </div>
              <button class="ghost-button" type="button" @click="applyTextTemplate('gateway')">示例</button>
            </div>

            <div class="section-block connection-settings">
              <div class="section-title inline-title">
                <div>
                  <h4>连接</h4>
                  <p>{{ textEndpointLabel }}</p>
                </div>
                <button class="icon-button" type="button" title="刷新 Key 列表" @click="loadKeys" :disabled="loadingKeys">
                  <span :class="{ spinning: loadingKeys }">R</span>
                </button>
              </div>

              <div class="field">
                <label for="text-base-url">
                  <span>Base URL</span>
                  <HelpTip text="对用户展示线上接口地址。独立访问或嵌入主服务时应使用 https://kkflow.org/v1；本地预览会自动走 Vite 代理。" />
                </label>
                <input id="text-base-url" v-model.trim="baseUrl" type="url" placeholder="https://kkflow.org/v1" />
              </div>

              <div class="field">
                <label>
                  <span>Key 来源</span>
                  <HelpTip text="嵌入主服务时优先读取用户自己的 Key 列表；独立打开时可以切换到自定义 Key。密钥只在当前页面请求中使用，不写入本项目。" />
                </label>
                <div class="segmented">
                  <button type="button" :class="{ active: keyMode === 'saved' }" @click="keyMode = 'saved'">我的 Key</button>
                  <button type="button" :class="{ active: keyMode === 'custom' }" @click="keyMode = 'custom'">自定义</button>
                </div>
              </div>

              <div v-if="keyMode === 'saved'" class="field">
                <label for="text-saved-key">
                  <span>API Key</span>
                  <HelpTip text="这里只展示 active 状态且属于 OpenAI 分组的 Key。选中后会作为 Authorization Bearer 发送到线上接口。" />
                </label>
                <select id="text-saved-key" v-model="selectedKeyId" :disabled="loadingKeys || selectableKeys.length === 0">
                  <option value="" disabled>{{ keySelectPlaceholder }}</option>
                  <option v-for="key in selectableKeys" :key="key.id" :value="String(key.id)">
                    {{ key.name }} · {{ maskKey(key.key) }}
                  </option>
                </select>
                <p v-if="keyError" class="note danger">{{ keyError }}</p>
                <p v-else class="note">{{ keyHelpText }}</p>
              </div>

              <div v-else class="field">
                <label for="text-custom-key">
                  <span>API Key</span>
                  <HelpTip text="手动输入的 Key 只保存在当前浏览器内存中，刷新页面后不会保留。" />
                </label>
                <input id="text-custom-key" v-model="customKey" type="password" autocomplete="off" placeholder="sk-xxxxxx" />
                <p class="note">仅本次页面使用。</p>
              </div>
            </div>

            <div class="section-block">
              <div class="section-title">
                <h4>基础</h4>
                <p>模型、系统指令和用户输入。</p>
              </div>

              <div class="field">
                <label for="text-model">
                  <span>模型</span>
                  <HelpTip text="选择要调用的 OpenAI 兼容文本模型。这里的模型名会原样写入 payload.model。" />
                </label>
                <select id="text-model" v-model="model">
                  <option v-for="item in modelOptions" :key="item.value" :value="item.value">
                    {{ item.label }}
                  </option>
                </select>
              </div>

              <div class="field">
                <label for="system-prompt">
                  <span>系统提示词</span>
                  <HelpTip text="定义模型角色、语气、边界和输出规范。会作为 system 消息发送。" />
                </label>
                <textarea id="system-prompt" v-model="systemPrompt" rows="4" placeholder="你是一个简洁、准确的中文助手。"></textarea>
              </div>

              <div class="field">
                <label for="user-prompt">
                  <span>用户提示词</span>
                  <HelpTip text="本次要模型处理的具体任务。页面会校验该字段不为空。" />
                </label>
                <textarea id="user-prompt" v-model="userPrompt" rows="7" placeholder="输入你想测试的问题、任务或业务提示词..."></textarea>
              </div>
            </div>

            <div class="section-block">
              <div class="section-title">
                <h4>采样与推理</h4>
                <p>控制稳定性、发散程度和推理倾向。</p>
              </div>

              <div class="param-grid">
                <div class="field">
                  <label for="temperature">
                    <span>Temperature</span>
                    <HelpTip text="控制随机性。越低越稳定，越高越发散；不确定时保持 0.7。" />
                  </label>
                  <input id="temperature" v-model.number="temperature" type="number" min="0" max="2" step="0.1" />
                </div>

                <div class="field">
                  <label for="top-p">
                    <span>Top P</span>
                    <HelpTip text="核采样范围。通常不要同时大幅调整 Temperature 和 Top P；默认 1 表示不过度裁剪。" />
                  </label>
                  <input id="top-p" v-model.number="topP" type="number" min="0" max="1" step="0.05" />
                </div>

                <div class="field">
                  <label for="reasoning-effort">
                    <span>推理强度</span>
                    <HelpTip text="适用于支持 reasoning 的模型。自动表示不发送该字段；选择后会发送 reasoning.effort。" />
                  </label>
                  <select id="reasoning-effort" v-model="reasoningEffort">
                    <option value="auto">自动</option>
                    <option value="minimal">minimal</option>
                    <option value="low">low</option>
                    <option value="medium">medium</option>
                    <option value="high">high</option>
                  </select>
                </div>
              </div>
            </div>

            <div class="section-block">
              <div class="section-title">
                <h4>输出</h4>
                <p>限制长度、详细程度和服务层级。</p>
              </div>

              <div class="param-grid">
                <div class="field">
                  <label for="max-output">
                    <span>Max Output Tokens</span>
                    <HelpTip text="限制模型最多输出多少 token。值越大越适合长文，但也可能增加耗时和费用。" />
                  </label>
                  <input id="max-output" v-model.number="maxOutputTokens" type="number" min="16" max="32000" step="16" />
                </div>

                <div class="field">
                  <label for="verbosity">
                    <span>详细程度</span>
                    <HelpTip text="适用于支持 text.verbosity 的模型。自动表示不发送该字段；low 更简洁，high 更展开。" />
                  </label>
                  <select id="verbosity" v-model="textVerbosity">
                    <option value="auto">自动</option>
                    <option value="low">low</option>
                    <option value="medium">medium</option>
                    <option value="high">high</option>
                  </select>
                </div>

                <div class="field">
                  <label for="service-tier">
                    <span>服务层级</span>
                    <HelpTip text="自动表示不发送 service_tier。只有确认平台支持对应层级时再手动选择。" />
                  </label>
                  <select id="service-tier" v-model="serviceTier">
                    <option value="auto">自动</option>
                    <option value="default">default</option>
                    <option value="flex">flex</option>
                    <option value="priority">priority</option>
                  </select>
                </div>
              </div>

            </div>

            <div class="action-row">
              <button class="primary-action" type="button" :disabled="!canSubmitText || sendingText" @click="sendTextRequest">
                <span v-if="sendingText" class="spinner"></span>
                {{ sendingText ? '请求中' : '发送请求' }}
              </button>
              <button class="secondary-action" type="button" :disabled="sendingText" @click="resetTextOutput">清空结果</button>
            </div>
          </section>

          <section class="panel result-panel chat-panel">
            <div class="panel-title">
              <div>
                <span class="eyebrow">Response</span>
                <h3>文本结果</h3>
              </div>
              <button class="secondary-action small" type="button" :disabled="!displayedOutputText" @click="copyTextOutput">
                {{ copiedText ? '已复制' : '复制' }}
              </button>
            </div>

            <div v-if="textErrorMessage" class="error-box">
              <strong>请求失败</strong>
              <p>{{ textErrorMessage }}</p>
              <pre v-if="textRawError">{{ textRawError }}</pre>
            </div>

            <div v-if="textMetaItems.length" class="meta-grid">
              <div v-for="item in textMetaItems" :key="item.label">
                <span>{{ item.label }}</span>
                <strong>{{ item.value }}</strong>
              </div>
            </div>

            <div class="output-box">
              <pre v-if="displayedOutputText"><span>{{ displayedOutputText }}</span><span v-if="typing" class="typing-caret"></span></pre>
              <div v-else class="empty-state">
                <strong>等待请求</strong>
                <p>发送后会以打字机效果显示模型回复。</p>
              </div>
            </div>

            <details class="raw-details debug-details">
              <summary>调试信息</summary>
              <div class="debug-tabs">
                <button type="button" :class="{ active: textDebugView === 'request' }" @click="textDebugView = 'request'">请求</button>
                <button type="button" :class="{ active: textDebugView === 'response' }" :disabled="!textRawResponse" @click="textDebugView = 'response'">响应</button>
              </div>
              <pre>{{ textDebugView === 'request' ? textPayloadPreview : (textRawResponse || '发送后显示原始响应 JSON') }}</pre>
            </details>
          </section>
        </div>

        <div v-else class="work-grid image-work-grid">
          <section class="panel control-panel">
            <div class="panel-title">
              <div>
                <span class="eyebrow">Request</span>
                <h3>生图请求</h3>
              </div>
              <button class="ghost-button" type="button" @click="applyImageTemplate('product')">示例</button>
            </div>

            <div class="section-block connection-settings">
              <div class="section-title inline-title">
                <div>
                  <h4>连接</h4>
                  <p>{{ imageEndpointLabel }}</p>
                </div>
                <button class="icon-button" type="button" title="刷新 Key 列表" @click="loadKeys" :disabled="loadingKeys">
                  <span :class="{ spinning: loadingKeys }">R</span>
                </button>
              </div>

              <div class="field">
                <label for="image-base-url">
                  <span>Base URL</span>
                  <HelpTip text="对用户展示线上接口地址。独立访问或嵌入主服务时应使用 https://kkflow.org/v1；本地预览会自动走 Vite 代理。" />
                </label>
                <input id="image-base-url" v-model.trim="baseUrl" type="url" placeholder="https://kkflow.org/v1" />
              </div>

              <div class="field">
                <label>
                  <span>Key 来源</span>
                  <HelpTip text="嵌入主服务时优先读取用户自己的 Key 列表；独立打开时可以切换到自定义 Key。密钥只在当前页面请求中使用，不写入本项目。" />
                </label>
                <div class="segmented">
                  <button type="button" :class="{ active: keyMode === 'saved' }" @click="keyMode = 'saved'">我的 Key</button>
                  <button type="button" :class="{ active: keyMode === 'custom' }" @click="keyMode = 'custom'">自定义</button>
                </div>
              </div>

              <div v-if="keyMode === 'saved'" class="field">
                <label for="image-saved-key">
                  <span>API Key</span>
                  <HelpTip text="这里只展示 active 状态且属于 OpenAI 分组的 Key。选中后会作为 Authorization Bearer 发送到线上接口。" />
                </label>
                <select id="image-saved-key" v-model="selectedKeyId" :disabled="loadingKeys || selectableKeys.length === 0">
                  <option value="" disabled>{{ keySelectPlaceholder }}</option>
                  <option v-for="key in selectableKeys" :key="key.id" :value="String(key.id)">
                    {{ key.name }} · {{ maskKey(key.key) }}
                  </option>
                </select>
                <p v-if="keyError" class="note danger">{{ keyError }}</p>
                <p v-else class="note">{{ keyHelpText }}</p>
              </div>

              <div v-else class="field">
                <label for="image-custom-key">
                  <span>API Key</span>
                  <HelpTip text="手动输入的 Key 只保存在当前浏览器内存中，刷新页面后不会保留。" />
                </label>
                <input id="image-custom-key" v-model="customKey" type="password" autocomplete="off" placeholder="sk-xxxxxx" />
                <p class="note">仅本次页面使用。</p>
              </div>
            </div>

            <div class="section-block">
              <div class="section-title">
                <h4>提示词</h4>
                <p>描述主体、场景、质感、构图和限制。</p>
              </div>

              <div class="field">
                <label for="image-model">
                  <span>模型</span>
                  <HelpTip text="默认 gpt-image-2。请求会发送到 /images/generations。" />
                </label>
                <input id="image-model" v-model.trim="imageModel" type="text" />
              </div>

              <div class="field">
                <label for="image-prompt">
                  <span>图片提示词</span>
                  <HelpTip text="越具体越稳定。建议写清楚用途、画面主体、构图、风格、光线、文字要求和不要出现的内容。" />
                </label>
                <textarea id="image-prompt" v-model="imagePrompt" rows="7" placeholder="描述你想生成的图片，包含主体、风格、构图、文字要求等。"></textarea>
              </div>

              <div class="prompt-chips">
                <button type="button" @click="applyImageTemplate('product')">产品界面</button>
                <button type="button" @click="applyImageTemplate('poster')">运营海报</button>
                <button type="button" @click="applyImageTemplate('icon')">应用图标</button>
              </div>

              <div class="field">
                <label for="image-note">
                  <span>补充约束</span>
                  <HelpTip text="这里不会作为单独 API 参数发送，而是自动追加到 prompt，适合写不要杂乱、不要水印、不要错误文字等约束。" />
                </label>
                <textarea id="image-note" v-model="imagePromptNote" rows="3" placeholder="例如：不要水印，不要多余文字，保持高级、克制、可商用。"></textarea>
              </div>
            </div>

            <div class="section-block">
              <div class="section-title">
                <h4>画布</h4>
                <p>尺寸、比例和生成数量。</p>
              </div>

              <div class="param-grid">
                <div class="field">
                  <label for="image-size-mode">
                    <span>尺寸模式</span>
                    <HelpTip text="预设尺寸更稳；自定义会按宽高拼成 size 字段，建议使用 16 的倍数。" />
                  </label>
                  <select id="image-size-mode" v-model="imageSizeMode">
                    <option value="preset">预设</option>
                    <option value="custom">自定义</option>
                  </select>
                </div>

                <div v-if="imageSizeMode === 'preset'" class="field">
                  <label for="image-size">
                    <span>Size</span>
                    <HelpTip text="输出图片尺寸。方图适合通用素材，横图适合网页首屏，竖图适合海报和移动端。" />
                  </label>
                  <select id="image-size" v-model="imageSize">
                    <option value="auto">auto</option>
                    <option value="1024x1024">1024x1024 方图</option>
                    <option value="1536x1024">1536x1024 横图</option>
                    <option value="1024x1536">1024x1536 竖图</option>
                  </select>
                </div>

                <div class="field">
                  <label for="image-count">
                    <span>数量</span>
                    <HelpTip text="一次请求生成图片张数。数量越多，耗时和费用越高。" />
                  </label>
                  <input id="image-count" v-model.number="imageCount" type="number" min="1" max="4" step="1" />
                </div>
              </div>

              <div v-if="imageSizeMode === 'custom'" class="param-grid two">
                <div class="field">
                  <label for="image-width">
                    <span>宽度</span>
                    <HelpTip text="自定义宽度，建议 16 的倍数。页面会拼接为 width x height。" />
                  </label>
                  <input id="image-width" v-model.number="imageWidth" type="number" min="512" max="2048" step="16" />
                </div>
                <div class="field">
                  <label for="image-height">
                    <span>高度</span>
                    <HelpTip text="自定义高度，建议 16 的倍数。过大尺寸可能被平台拒绝。" />
                  </label>
                  <input id="image-height" v-model.number="imageHeight" type="number" min="512" max="2048" step="16" />
                </div>
              </div>
            </div>

            <div class="section-block">
              <div class="section-title">
                <h4>质量与输出</h4>
                <p>格式、压缩、背景和安全过滤。</p>
              </div>

              <div class="param-grid">
                <div class="field">
                  <label for="image-quality">
                    <span>Quality</span>
                    <HelpTip text="控制生成质量倾向。high 更适合正式素材；low/medium 适合快速探索。" />
                  </label>
                  <select id="image-quality" v-model="imageQuality">
                    <option value="auto">auto</option>
                    <option value="low">low</option>
                    <option value="medium">medium</option>
                    <option value="high">high</option>
                  </select>
                </div>

                <div class="field">
                  <label for="image-background">
                    <span>Background</span>
                    <HelpTip text="transparent 适合透明背景素材；opaque 适合常规成图。透明背景不要搭配 jpeg。" />
                  </label>
                  <select id="image-background" v-model="imageBackground">
                    <option value="auto">auto</option>
                    <option value="transparent">transparent</option>
                    <option value="opaque">opaque</option>
                  </select>
                </div>

                <div class="field">
                  <label for="image-format">
                    <span>Output Format</span>
                    <HelpTip text="png 质量稳定且支持透明；jpeg 体积小但不支持透明；webp 体积和质量更均衡。" />
                  </label>
                  <select id="image-format" v-model="imageFormat">
                    <option value="png">png</option>
                    <option value="jpeg">jpeg</option>
                    <option value="webp">webp</option>
                  </select>
                </div>
              </div>

              <div class="param-grid two">
                <div class="field">
                  <label for="compression">
                    <span>压缩率：{{ imageCompression }}</span>
                    <HelpTip text="仅 jpeg/webp 生效。数值越低体积越小但细节损失越多；png 会自动忽略。" />
                  </label>
                  <input id="compression" v-model.number="imageCompression" type="range" min="0" max="100" step="1" :disabled="imageFormat === 'png'" />
                </div>

                <div class="field">
                  <label for="image-moderation">
                    <span>Moderation</span>
                    <HelpTip text="内容安全过滤强度。auto 为默认安全策略；low 会降低过滤强度，但仍可能被平台拒绝不合规内容。" />
                  </label>
                  <select id="image-moderation" v-model="imageModeration">
                    <option value="auto">auto</option>
                    <option value="low">low</option>
                  </select>
                </div>
              </div>

              <div class="field">
                <label for="image-user">
                  <span>User</span>
                  <HelpTip text="可选终端用户标识，用于平台侧滥用监控或审计。为空时不发送。" />
                </label>
                <input id="image-user" v-model.trim="imageUser" type="text" placeholder="可选，例如 user_123" />
              </div>

              <p v-if="imageFormatWarning" class="note danger">{{ imageFormatWarning }}</p>
            </div>

            <div class="action-row">
              <button class="primary-action" type="button" :disabled="!canSubmitImage || sendingImage" @click="sendImageRequest">
                <span v-if="sendingImage" class="spinner"></span>
                {{ sendingImage ? '生成中' : '生成图片' }}
              </button>
              <button class="secondary-action" type="button" :disabled="sendingImage" @click="resetImageOutput">清空结果</button>
            </div>
          </section>

          <section class="panel result-panel chat-panel">
            <div class="panel-title">
              <div>
                <span class="eyebrow">Response</span>
                <h3>图片结果</h3>
              </div>
              <span class="storage-note">不保存到服务器磁盘</span>
            </div>

            <div v-if="imageErrorMessage" class="error-box">
              <strong>请求失败</strong>
              <p>{{ imageErrorMessage }}</p>
              <pre v-if="imageRawError">{{ imageRawError }}</pre>
            </div>

            <div v-if="imageMetaItems.length" class="meta-grid">
              <div v-for="item in imageMetaItems" :key="item.label">
                <span>{{ item.label }}</span>
                <strong>{{ item.value }}</strong>
              </div>
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
              <strong>等待生成</strong>
              <p>图片返回后只在浏览器内展示；不会由本页面写入服务器磁盘。图片请求最长等待 5 分钟。</p>
            </div>

            <details class="raw-details debug-details">
              <summary>调试信息</summary>
              <div class="debug-tabs">
                <button type="button" :class="{ active: imageDebugView === 'request' }" @click="imageDebugView = 'request'">请求</button>
                <button type="button" :class="{ active: imageDebugView === 'response' }" :disabled="!imageRawResponse" @click="imageDebugView = 'response'">响应</button>
              </div>
              <pre>{{ imageDebugView === 'request' ? imagePayloadPreview : (imageRawResponse || '发送后显示原始响应 JSON') }}</pre>
            </details>
          </section>
        </div>
      </section>
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, onMounted, ref } from 'vue'

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
  { value: 'gpt-5.3-codex-spark', label: 'gpt-5.3-codex-spark · 代码轻量' },
]

const IMAGE_REQUEST_TIMEOUT_MS = 5 * 60 * 1000

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
const userPrompt = ref('用三句话解释什么是 API 网关。')

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
const imagePrompt = ref('生成一张高级产品工作台界面宣传图，主题为 Token向云模型试用，风格克制、现代、留白充足，不要杂乱。')
const imagePromptNote = ref('不要水印，不要多余文字，保持高级、克制、可商用。')
const imageSizeMode = ref<'preset' | 'custom'>('preset')
const imageSize = ref('1024x1024')
const imageWidth = ref(1024)
const imageHeight = ref(1024)
const imageQuality = ref('high')
const imageBackground = ref('opaque')
const imageFormat = ref('png')
const imageCompression = ref(90)
const imageModeration = ref('auto')
const imageCount = ref(1)
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
    n: clampNumber(imageCount.value, 1, 4),
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

function applyTextTemplate(name: 'gateway') {
  if (name !== 'gateway') return
  systemPrompt.value = '你是 Token向云的技术顾问，回答要准确、简洁、可执行。'
  userPrompt.value = '请用面向开发者的方式解释 API 网关的作用，并给出 3 个接入 OpenAI 兼容接口时最常见的排查点。'
  temperature.value = 0.5
  topP.value = 1
  maxOutputTokens.value = 1000
}

function applyImageTemplate(name: 'product' | 'poster' | 'icon') {
  if (name === 'poster') {
    imagePrompt.value = '生成一张 9:16 中文运营海报，主题为 Token向云 AI API 模型工作台上线。画面应高级、现代、克制，适合移动端查看，有清晰主视觉和少量中文标题空间。'
    imagePromptNote.value = '不要水印，不要二维码，不要错误文字，不要拥挤布局。'
    imageSizeMode.value = 'preset'
    imageSize.value = '1024x1536'
    imageQuality.value = 'high'
    return
  }
  if (name === 'icon') {
    imagePrompt.value = '生成一个现代 AI API 平台应用图标，主体为抽象云端接口符号，深色石墨底，局部冷色高光，简洁、可识别、适合 1:1。'
    imagePromptNote.value = '不要文字，不要水印，边缘干净，适合裁切为应用图标。'
    imageSizeMode.value = 'preset'
    imageSize.value = '1024x1024'
    imageQuality.value = 'high'
    return
  }
  imagePrompt.value = '生成一张高级 SaaS 产品工作台界面宣传图，主题为 Token向云模型试用。画面包含左侧参数面板、右侧交互结果区，风格克制、现代、留白充足、细节精致。'
  imagePromptNote.value = '不要水印，不要杂乱按钮，不要错误中文，整体适合官网产品展示。'
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
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 7px;
  color: #fff;
  background: #1b1d24;
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
  box-shadow: 0 14px 34px rgba(16, 24, 40, 0.05);
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
  letter-spacing: 0.08em;
  line-height: 1;
  text-transform: uppercase;
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
  box-shadow: 0 12px 28px rgba(16, 24, 40, 0.2);
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
</style>
