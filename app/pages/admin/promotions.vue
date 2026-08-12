<script setup lang="ts">
import { BarChart3, Copy, Info, Link2, Plus, Power, Trash2 } from 'lucide-vue-next'
import type { ApiSuccess } from '~/types/api'
import { apiErrorMessage } from '~/types/api'

definePageMeta({ layout: 'admin' })
useSeoMeta({ title: '推广统计', robots: 'noindex, nofollow' })

interface PromotionSource {
  id: number
  code: string
  name: string
  target_url: string
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_content: string | null
  enabled: boolean
  link: string
  clicks: number
  unique_visitors: number
  clicks_today: number
  clicks_7d: number
  clicks_30d: number
}

interface PromotionOverview {
  summary: { clicks: number; unique_visitors: number; clicks_today: number; clicks_7d: number; clicks_30d: number; direct_visits: number; automatic_referrals: number }
  trend: Array<{ day: string; clicks: number; unique_visitors: number }>
  referrals: Array<{ host: string; visits: number; unique_visitors: number }>
  sources: PromotionSource[]
}

const site = useSiteConfigState()
const admin = useAdminSessionState()
const overview = ref<PromotionOverview | null>(null)
const loading = ref(false)
const saving = ref(false)
const loaded = ref(false)
const notice = reactive({ type: 'idle' as 'idle' | 'success' | 'error', message: '' })
const form = reactive({ code: '', name: '', target_url: site.value.main_site_url, utm_source: '', utm_medium: 'referral', utm_campaign: '', utm_content: '' })

watch(() => site.value.main_site_url, (value) => {
  if (!form.target_url) form.target_url = value
})

watch(() => admin.session.value?.admin, (authenticated) => {
  if (authenticated && !loaded.value) void load()
}, { immediate: true })

async function load() {
  loading.value = true
  try {
    overview.value = (await $fetch<ApiSuccess<PromotionOverview>>('/api/admin/promotions')).data
    loaded.value = true
  } catch (cause) { showError(cause, '推广统计读取失败。') } finally { loading.value = false }
}

async function createSource() {
  saving.value = true; clearNotice()
  try {
    await $fetch<ApiSuccess<PromotionSource>>('/api/admin/promotions', { method: 'POST', body: form })
    Object.assign(form, { code: '', name: '', target_url: site.value.main_site_url, utm_source: '', utm_medium: 'referral', utm_campaign: '', utm_content: '' })
    await load(); showSuccess('推广链接已创建。')
  } catch (cause) { showError(cause, '推广链接创建失败。') } finally { saving.value = false }
}

async function toggle(source: PromotionSource) {
  try { await $fetch(`/api/admin/promotions/${source.id}`, { method: 'PUT', body: { enabled: !source.enabled } }); await load() } catch (cause) { showError(cause, '推广链接状态更新失败。') }
}

async function remove(source: PromotionSource) {
  if (!window.confirm(`确定删除“${source.name}”吗？历史统计也会删除。`)) return
  try { await $fetch(`/api/admin/promotions/${source.id}`, { method: 'DELETE' }); await load(); showSuccess('推广链接已删除。') } catch (cause) { showError(cause, '推广链接删除失败。') }
}

async function copyLink(source: PromotionSource) {
  try { await navigator.clipboard.writeText(source.link); showSuccess('推广链接已复制。') } catch { showError(null, '复制失败，请手动复制。') }
}

function showSuccess(message: string) { notice.type = 'success'; notice.message = message }
function showError(cause: unknown, fallback: string) { notice.type = 'error'; notice.message = apiErrorMessage(cause, fallback) }
function clearNotice() { notice.type = 'idle'; notice.message = '' }
function percent(value: number, total: number) { return total ? `${Math.round(value / total * 1000) / 10}%` : '0%' }
</script>

<template>
  <AdminAccessGate>
    <div class="admin-page admin-promotions-page">
      <header class="admin-page-heading"><span>Promotion</span><h1>推广统计</h1><p>为外部广告和友情链接生成可追踪地址，查看不同来源带来的访问量。</p></header>
      <div v-if="notice.message" class="admin-notice" :class="`admin-notice--${notice.type}`">{{ notice.message }}</div>

      <section v-if="overview" class="promotion-metric-grid">
        <article><span>累计访问</span><strong>{{ overview.summary.clicks }}</strong><small>所有落地页访问记录</small></article>
        <article><span>独立访客</span><strong>{{ overview.summary.unique_visitors }}</strong><small>按匿名访客标识去重</small></article>
        <article><span>今日访问</span><strong>{{ overview.summary.clicks_today }}</strong><small>按服务器时间统计</small></article>
        <article><span>近 30 天</span><strong>{{ overview.summary.clicks_30d }}</strong><small>可用于来源比较</small></article>
      </section>

      <section class="admin-section promotion-create-section">
        <header class="admin-section__heading"><div><span>New source</span><h2>创建推广来源</h2><p>生成的链接直接指向主站，首页返回时由 guide 在服务端记录来源，不经过中转跳转。</p></div></header>
        <div class="promotion-quick-guide">
          <Info :size="20" aria-hidden="true" />
          <div>
            <strong>最简单的用法：只填写前三项，后面的 UTM 信息都可以留空。</strong>
            <ol>
              <li><b>创建链接</b><span>填写来源代码、来源名称和主站落地地址。</span></li>
              <li><b>复制投放</b><span>生成的地址是带 <code>ref</code> 和 UTM 参数的主站直链，可直接放到广告位。</span></li>
              <li><b>查看统计</b><span>访问主站首页时自动记录参数和 Referer，不改变用户地址。</span></li>
            </ol>
          </div>
        </div>
        <form class="promotion-create-form" @submit.prevent="createSource">
          <label class="form-field"><span>来源代码（必填）</span><input v-model="form.code" required pattern="[a-zA-Z0-9][a-zA-Z0-9_-]{1,47}" placeholder="site-a"><small>主站直链中的唯一标识，例如 <code>?ref=site-a</code>。只能使用字母、数字、短横线和下划线。</small></label>
          <label class="form-field"><span>来源名称（必填）</span><input v-model="form.name" required maxlength="80" placeholder="网站 A 首页广告"><small>仅在后台显示，写清楚投放网站和位置，例如“少数派首页横幅”。</small></label>
          <label class="form-field promotion-target-field"><span>目标地址（必填）</span><input v-model="form.target_url" required type="url" placeholder="https://aiziyou.org"><small>访客点击推广链接后最终打开的页面，通常填写主站首页或活动落地页。</small></label>
          <label class="form-field"><span>UTM 来源（可选）</span><input v-model="form.utm_source" placeholder="site-a"><small>投放渠道的英文标识，例如 <code>shaoshupai</code>、<code>google</code>。</small></label>
          <label class="form-field"><span>UTM 媒介（可选）</span><input v-model="form.utm_medium" placeholder="referral"><small>渠道类型：友情链接可填 <code>referral</code>，横幅广告可填 <code>banner</code>。</small></label>
          <label class="form-field"><span>活动名称（可选）</span><input v-model="form.utm_campaign" placeholder="launch-2026-08"><small>同一轮推广使用相同名称，方便区分活动，例如 <code>launch-2026-08</code>。</small></label>
          <label class="form-field"><span>广告位置（可选）</span><input v-model="form.utm_content" placeholder="header-banner"><small>区分同一网站上的不同入口，例如顶部横幅、文章底部或侧边栏。</small></label>
          <button class="primary-command" type="submit" :disabled="saving"><Plus :size="16" />{{ saving ? '创建中...' : '创建链接' }}</button>
        </form>
      </section>

      <section class="admin-section">
        <header class="admin-section__heading"><div><span>Traffic sources</span><h2>已配置来源</h2><p>统计由主站首页的服务端响应完成；机器人和 30 分钟内的重复刷新不会计入。</p></div></header>
        <div class="promotion-source-list">
          <article v-for="source in overview?.sources" :key="source.id" class="promotion-source-row">
            <div class="promotion-source-main"><div class="promotion-source-title"><strong>{{ source.name }}</strong><code>{{ source.code }}</code><span :class="source.enabled ? 'promotion-enabled' : 'promotion-disabled'">{{ source.enabled ? '启用' : '停用' }}</span></div><a :href="source.link" target="_blank" rel="noreferrer">{{ source.link }}</a><small>目标：{{ source.target_url }}</small></div>
            <div class="promotion-source-stats"><div><strong>{{ source.clicks_30d }}</strong><span>近30天</span></div><div><strong>{{ source.unique_visitors }}</strong><span>独立访客</span></div><div><strong>{{ percent(source.clicks_30d, overview?.summary.clicks_30d || 0) }}</strong><span>占比</span></div></div>
            <div class="promotion-source-actions"><button class="icon-button" type="button" title="复制推广链接" @click="copyLink(source)"><Copy :size="16" /></button><button class="icon-button" type="button" :title="source.enabled ? '停用' : '启用'" @click="toggle(source)"><Power :size="16" /></button><button class="icon-button icon-button--danger" type="button" title="删除来源" @click="remove(source)"><Trash2 :size="16" /></button></div>
          </article>
          <div v-if="!overview?.sources.length && !loading" class="empty-result"><Link2 :size="20" />还没有推广来源，先创建一个链接。</div>
        </div>
      </section>

      <section class="admin-section">
        <header class="admin-section__heading"><div><span>HTTP Referer</span><h2>自动发现的来源站点</h2><p>即使广告链接没有参数，也会尽可能根据浏览器提供的 Referer 统计来源域名；隐私策略可能导致 Referer 缺失。</p></div></header>
        <div class="promotion-referral-list">
          <div v-for="item in overview?.referrals" :key="item.host" class="promotion-referral-row"><strong>{{ item.host }}</strong><span>{{ item.visits }} 次访问</span><span>{{ item.unique_visitors }} 位访客</span></div>
          <div v-if="!overview?.referrals.length && !loading" class="empty-result"><Link2 :size="20" />还没有可识别的外部 Referer。</div>
        </div>
        <div v-if="overview" class="promotion-referral-summary"><span>无已配置来源的自动引荐：<strong>{{ overview.summary.automatic_referrals }}</strong></span><span>直接访问或来源不可用：<strong>{{ overview.summary.direct_visits }}</strong></span></div>
      </section>

      <section v-if="overview?.trend.length" class="admin-section">
        <header class="admin-section__heading"><div><span>Last 30 days</span><h2>访问趋势</h2><p>按天汇总落地访问量和独立访客。</p></div><BarChart3 :size="22" /></header>
        <div class="promotion-trend-list"><div v-for="item in overview.trend" :key="item.day" class="promotion-trend-row"><time>{{ item.day }}</time><div class="promotion-trend-bar"><i :style="{ width: `${Math.max(4, item.clicks / Math.max(...overview.trend.map(row => row.clicks), 1) * 100)}%` }" /></div><strong>{{ item.clicks }}</strong><span>{{ item.unique_visitors }} 人</span></div></div>
      </section>
    </div>
  </AdminAccessGate>
</template>
