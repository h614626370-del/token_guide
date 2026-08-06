export default defineNuxtConfig({
  compatibilityDate: '2026-08-03',
  devtools: { enabled: false },
  modules: ['@nuxt/content', '@nuxtjs/mdc'],
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
    trustedProxyIps: '127.0.0.1,::1',
    usdToCny: 6.8102,
    appVersion: process.env.NUXT_APP_VERSION || '2.1.1',
    homepageDefaultsPath: process.env.NUXT_HOMEPAGE_DEFAULTS_PATH || '',
    homepageDefaultId: process.env.NUXT_HOMEPAGE_DEFAULT_ID || 'ziyou',
    updateImageRepository: '614626370/sub2api-guide',
    updateGithubRepo: 'h614626370-del/token_guide',
    updateContainerName: 'sub2api-guide',
    dockerSocketPath: '/var/run/docker.sock',
    public: {
      siteUrl: 'https://guide.kkflow.org',
      sub2apiOrigin: 'https://kkflow.org',
      projectName: 'Token向云',
      siteName: 'Token向云指南',
      siteDescription: '会员、API 接入、模型试用与价格参考。',
      logoPath: 'https://guide.kkflow.org/logo-80.png',
      footerText: '清晰接入，稳定调用。',
      loginPath: '/login',
      registerPath: '/register',
      supportPath: '/support',
      apiPath: '/v1',
      supportWechat: '微信 kkflow520',
      supportGroupUrl: 'https://www.kdocs.cn/l/csU8ZJybJe2V',
    },
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
  },
  typescript: {
    strict: true,
    typeCheck: false,
  },
})
