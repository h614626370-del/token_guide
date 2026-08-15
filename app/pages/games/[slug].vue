<script setup lang="ts">
import { ArrowLeft, ExternalLink, Gamepad2, RefreshCcw, Users } from 'lucide-vue-next'
import type { ApiSuccess } from '~/types/api'
import type { GameItem } from '~/types/games'

const route = useRoute()
const slug = String(route.params.slug || '')
const sessionKey = `guide-game-presence:${slug}`
const gameSession = ref('')
const onlineCount = ref(0)
const gameFrame = ref<HTMLIFrameElement | null>(null)
const gameDifficulty = ref('standard')
const gameStatus = ref('你的回合 · 黑棋')
const gameMoveCount = ref(0)
const gameState = ref('ready')
const gameFrameVersion = ref(0)
let heartbeatTimer: ReturnType<typeof setInterval> | undefined

const { data, error } = await useAsyncData<ApiSuccess<GameItem>>(
  `game-detail-${slug}`,
  () => $fetch<ApiSuccess<GameItem>>(`/api/games/${slug}`),
)
const game = computed(() => data.value?.data || null)
const isGobang = computed(() => game.value?.slug === 'gobang')
const embedPlayPath = computed(() => {
  const path = game.value?.play_path || ''
  if (!isGobang.value) return path
  return `${path}${path.includes('?') ? '&' : '?'}embed=1&v=${gameFrameVersion.value}`
})

if (error.value || !game.value) {
  throw createError({ statusCode: 404, statusMessage: '游戏不存在或尚未上架' })
}

const categoryLabels: Record<string, string> = {
  board: '棋类对战',
  arcade: '街机休闲',
  puzzle: '益智拼图',
  training: '训练工具',
  adventure: '冒险闯关',
}

useSeoMeta({
  title: () => game.value?.name || '游戏详情',
  description: () => game.value?.summary || '中文网页小游戏',
})

onMounted(() => {
  const existing = window.localStorage.getItem(sessionKey)
  gameSession.value = existing || crypto.randomUUID().replaceAll('-', '')
  window.localStorage.setItem(sessionKey, gameSession.value)
  void sendHeartbeat()
  heartbeatTimer = setInterval(() => {
    if (document.visibilityState === 'visible') void sendHeartbeat()
  }, 30_000)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  window.addEventListener('message', handleGameMessage)
})

onBeforeUnmount(() => {
  if (heartbeatTimer) clearInterval(heartbeatTimer)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  window.removeEventListener('message', handleGameMessage)
})

function postGameCommand(message: Record<string, string>) {
  if (!isGobang.value) return
  gameFrame.value?.contentWindow?.postMessage({ source: 'gobang-host', ...message }, window.location.origin)
}

function handleGameFrameLoad() {
  if (!isGobang.value) return
  postGameCommand({ type: 'set-difficulty', value: gameDifficulty.value })
}

function handleGameMessage(event: MessageEvent) {
  if (!isGobang.value) return
  if (event.origin !== window.location.origin || event.source !== gameFrame.value?.contentWindow) return
  if (!event.data || event.data.source !== 'gobang' || event.data.type !== 'status') return
  gameStatus.value = event.data.message
  gameState.value = event.data.state || 'ready'
  gameMoveCount.value = event.data.moveCount || 0
}

function restartEmbeddedGame() {
  gameFrameVersion.value += 1
  gameStatus.value = '你的回合 · 黑棋'
  gameState.value = 'ready'
  gameMoveCount.value = 0
}

function changeGameDifficulty() {
  gameFrameVersion.value += 1
}

async function sendHeartbeat() {
  if (!game.value || !gameSession.value) return
  try {
    const response = await $fetch<ApiSuccess<{ online_count: number }>>(`/api/games/${game.value.slug}/presence`, {
      method: 'POST',
      body: { session_id: gameSession.value },
    })
    onlineCount.value = response.data.online_count
  } catch {
    // Presence is best-effort and should never interrupt gameplay.
  }
}

function handleVisibilityChange() {
  if (document.visibilityState === 'visible') void sendHeartbeat()
}
</script>

<template>
  <div v-if="game" class="game-detail-page">
    <div class="game-detail-page__inner">
      <NuxtLink class="game-detail-back" to="/games"><ArrowLeft :size="16" />返回小游戏</NuxtLink>
      <header class="game-detail-heading">
        <div class="game-detail-heading__icon"><img v-if="game.cover_url" :src="game.cover_url" :alt="`${game.name} 封面`"><span v-else><Gamepad2 :size="28" /></span></div>
        <div>
          <span class="game-detail-heading__eyebrow">{{ categoryLabels[game.category] }}</span>
          <h1>{{ game.name }}</h1>
          <p>{{ game.summary }}</p>
        </div>
        <div class="game-detail-heading__online"><Users :size="17" /><strong>{{ onlineCount || game.online_count }}</strong><span>人在线</span></div>
      </header>

      <section v-if="isGobang" class="game-host-controls" aria-label="对局控制">
        <div class="game-host-controls__actions">
          <label>难度
            <select v-model="gameDifficulty" aria-label="选择难度" @change="changeGameDifficulty">
              <option value="casual">休闲</option>
              <option value="standard">标准</option>
              <option value="challenge">挑战</option>
            </select>
          </label>
          <button type="button" @click="restartEmbeddedGame"><RefreshCcw :size="15" />重新开始</button>
        </div>
        <div class="game-host-status" :data-state="gameState" role="status" aria-live="polite">
          <strong>{{ gameStatus }}</strong>
          <span>已落子 {{ gameMoveCount }} 手</span>
        </div>
      </section>

      <section class="game-stage" :class="`game-stage--${game.slug}`" aria-label="游戏区域">
        <iframe ref="gameFrame" :src="embedPlayPath" :title="`${game.name} 游戏`" loading="eager" allow="fullscreen" @load="handleGameFrameLoad" />
      </section>

      <div class="game-detail-layout">
        <article class="game-detail-content doc-content">
          <MDC v-if="game.description_md" :value="game.description_md" />
          <p v-else>管理员还没有补充游戏介绍。</p>
        </article>
        <aside class="game-detail-meta">
          <div><span>许可证</span><strong>{{ game.license }}</strong></div>
          <div><span>作者</span><strong>{{ game.author }}</strong></div>
          <div v-if="game.compatibility"><span>适合设备</span><strong>{{ game.compatibility }}</strong></div>
          <a :href="game.official_url" target="_blank" rel="noopener noreferrer"><ExternalLink :size="15" />查看源项目</a>
        </aside>
      </div>
    </div>
  </div>
</template>
