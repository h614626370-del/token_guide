export default defineNuxtConfig({
  compatibilityDate: '2026-08-03',
  devtools: { enabled: false },
  modules: ['@nuxt/content', '@nuxtjs/mdc'],
  components: [{ path: '~/components', global: true }],
  mdc: {
    components: {
      map: {
        'support-group-qr': 'SupportGroupQr',
      },
    },
  },
  css: ['~/assets/css/main.css', '~/assets/css/tools.css', '~/assets/css/install.css'],
  runtimeConfig: {
    sessionPassword: '',
    adminToken: '',
    ipHashSalt: '',
    databasePath: 'data/guide.sqlite',
    sub2apiAdminApiKey: '',
    pricingPlatforms: 'openai,anthropic,gemini,antigravity,grok',
    pricingCacheTtlMs: 300000,
    upstreamTimeoutMs: 8000,
    playgroundTextTimeoutMs: 120000,
    playgroundImageTimeoutMs: 300000,
    feedbackDailyLimit: 5,
    rateWindowMs: 600000,
    rateMax: 5,
    communityLikeWindowMs: 60000,
    communityLikeMax: 30,
    trustedProxyIps: '127.0.0.1,::1',
    usdToCny: 6.8102,
    appVersion: process.env.NUXT_APP_VERSION || '2.2.22',
    updateImageRepository: '614626370/sub2api-guide',
    updateGithubRepo: 'h614626370-del/token_guide',
    updateContainerName: 'sub2api-guide',
    dockerSocketPath: '/var/run/docker.sock',
    public: {},
  },
  app: {
    head: {
      htmlAttrs: { lang: 'zh-CN' },
      titleTemplate: '%s | 指南中心',
      meta: [
        { name: 'description', content: '会员、API 接入、模型试用与价格参考。' },
        { name: 'referrer', content: 'strict-origin-when-cross-origin' },
        { name: 'theme-color', content: '#ffffff' },
      ],
      // 默认占位；实际图标由 app.vue 根据站点配置 logo_path 覆盖
      link: [
        { rel: 'icon', type: 'image/png', href: '/logo-80.png' },
        { rel: 'apple-touch-icon', href: '/logo-80.png' },
      ],
    },
  },
  nitro: {
    preset: 'node-server',
    externals: {
      external: ['better-sqlite3'],
    },
  },
  routeRules: {
    '/auth/embed': {
      headers: {
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
        'x-robots-tag': 'noindex, nofollow',
      },
    },
    '/admin/**': {
      headers: {
        'cache-control': 'no-store',
        'x-robots-tag': 'noindex, nofollow',
      },
    },
    '/api/**': {
      headers: {
        'cache-control': 'no-store',
      },
    },
    '/games-static/**': {
      headers: {
        'cache-control': 'public, max-age=86400',
      },
    },
  },
  typescript: {
    strict: true,
    typeCheck: false,
  },
})
