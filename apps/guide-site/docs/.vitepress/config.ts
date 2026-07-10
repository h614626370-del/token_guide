import { defineConfig } from 'vitepress'

const siteUrl = 'https://kkflow.org'
const siteBase = '/guide/'

export default defineConfig({
  base: siteBase,
  lang: 'zh-CN',
  title: 'Token向云指南',
  description: '会员余额充值与 OpenAI / Claude API 接入指南',
  cleanUrls: true,
  lastUpdated: true,
  outDir: '../../../dist/guide',
  head: [
    ['link', { rel: 'icon', type: 'image/png', href: '/guide/logo-80.png' }],
    ['link', { rel: 'apple-touch-icon', href: '/guide/logo-256.png' }],
    ['meta', { name: 'robots', content: 'index,follow' }],
    ['meta', { name: 'baiduspider', content: 'index,follow' }],
    ['meta', { name: 'applicable-device', content: 'pc,mobile' }],
    ['meta', { name: 'renderer', content: 'webkit' }],
    ['meta', { name: 'keywords', content: 'Token向云,AI API,OpenAI API,Claude API,OpenAI 兼容接口,Claude Code,Codex CLI,gpt-image-2,API 接入指南' }],
    ['meta', { property: 'og:site_name', content: 'Token向云指南' }],
    ['meta', { property: 'og:type', content: 'website' }]
  ],
  transformHead({ pageData }) {
    const path = pageData.relativePath.replace(/(^|\/)index\.md$/, '$1').replace(/\.md$/, '')
    const normalizedPath = path ? path.replace(/\/$/, '') : ''
    const canonical = normalizedPath ? `${siteUrl}${siteBase}${normalizedPath}` : `${siteUrl}${siteBase}`
    const description = pageData.description || 'Token向云文档说明，覆盖会员充值、OpenAI API、Claude API、Codex CLI、Claude Code、OpenCode 与 gpt-image-2 图片接口接入配置。'

    return [
      ['link', { rel: 'canonical', href: canonical }],
      ['meta', { property: 'og:url', content: canonical }],
      ['meta', { property: 'og:title', content: pageData.title ? `${pageData.title} | Token向云指南` : 'Token向云指南' }],
      ['meta', { property: 'og:description', content: description }]
    ]
  },
  vite: {
    server: {
      proxy: {
        '/v1': {
          target: 'https://kkflow.org',
          changeOrigin: true,
          secure: true
        },
        '/api/v1': {
          target: 'https://kkflow.org',
          changeOrigin: true,
          secure: true
        },
        '/guide-api': {
          target: 'http://127.0.0.1:8787',
          changeOrigin: true,
          secure: false
        }
      }
    }
  },
  themeConfig: {
    logo: { src: '/logo-80.png', alt: 'Token向云' },
    nav: [
      { text: '指南首页', link: '/' },
      { text: '会员充值', link: '/member' },
      { text: 'API 接入', link: '/api' },
      { text: '模型试用', link: '/playground' },
      { text: '模型价格', link: '/pricing' },
      { text: '在线反馈', link: '/feedback' },
      { text: '主站登录', link: 'https://kkflow.org/login' },
      { text: '主站注册', link: 'https://kkflow.org/register' }
    ],
    sidebar: [
      {
        text: '指南结构',
        items: [
          { text: '首页', link: '/' },
          { text: '会员充值流程', link: '/member' },
          { text: 'API 接入配置', link: '/api' },
          { text: '模型试用台', link: '/playground' },
          { text: '模型价格参考', link: '/pricing' },
          { text: '在线反馈', link: '/feedback' }
        ]
      },
      {
        text: '会员充值流程',
        items: [
          { text: '注册账号', link: '/member#_1-注册账号' },
          { text: '登录账号', link: '/member#_2-登录账号' },
          { text: '余额充值', link: '/member#_3-余额充值' },
          { text: '订阅套餐已开放', link: '/member#_4-订阅套餐已开放' },
          { text: '兑换暂未开放', link: '/member#_5-兑换功能暂未开放' },
          { text: '订单状态说明', link: '/member#_6-订单状态说明' },
          { text: '常见问题', link: '/member#_7-常见问题' }
        ]
      },
      {
        text: 'API 接入配置',
        items: [
          { text: '创建 API 密钥', link: '/api#_1-创建-api-密钥' },
          { text: '接口测试', link: '/api#_2-接口地址与连通测试' },
          { text: '客户端安装', link: '/api#_3-客户端安装' },
          { text: 'Codex CLI', link: '/api#_4-codex-cli-macos-linux' },
          { text: 'Claude Code', link: '/api#_6-claude-code' },
          { text: 'OpenCode', link: '/api#_7-opencode' },
          { text: 'OpenClaw', link: '/api#_8-openclaw-可选' },
          { text: 'GPT 文本调用', link: '/api#_9-gpt-文本模型调用参数-responses' },
          { text: '文生图调用', link: '/api#_10-gpt-image-2-调用参数-images' },
          { text: '模型选择建议', link: '/api#_12-模型选择建议' },
          { text: '错误排查', link: '/api#_13-常见错误排查' }
        ]
      },
      {
        text: '模型价格参考',
        items: [
          { text: '价格面板', link: '/pricing' }
        ]
      },
      {
        text: '站点反馈',
        items: [
          { text: '在线反馈', link: '/feedback' }
        ]
      }
    ],
    outline: {
      level: [2, 3],
      label: '页面目录'
    },
    docFooter: {
      prev: false,
      next: false
    },
    search: {
      provider: 'local'
    },
    socialLinks: [
      { icon: 'github', link: 'https://kkflow.org/guide' }
    ],
    footer: {
      message: '当前指南覆盖会员充值流程、OpenAI / Claude 协议接入、模型试用、价格参考和在线反馈。',
      copyright: 'Token向云 Sub2API Guide'
    }
  }
})
