import { defineConfig } from 'vitepress'

export default defineConfig({
  base: '/guide/',
  lang: 'zh-CN',
  title: 'Token向云指南',
  description: '会员余额充值与 API 密钥使用指南',
  cleanUrls: true,
  lastUpdated: true,
  outDir: '../dist',
  themeConfig: {
    logo: { text: 'GUIDE' },
    nav: [
      { text: '指南首页', link: '/' },
      { text: '主站登录', link: 'https://kkflow.org/login' },
      { text: '主站注册', link: 'https://kkflow.org/register' }
    ],
    sidebar: [
      {
        text: '使用流程',
        items: [
          { text: '快速入口', link: '/#快速入口' },
          { text: '注册账号', link: '/#_1-注册账号' },
          { text: '登录账号', link: '/#_2-登录账号' },
          { text: '余额充值', link: '/#_3-余额充值' },
          { text: '订阅暂未开放', link: '/#_4-订阅功能暂未开放' },
          { text: '兑换暂未开放', link: '/#_5-兑换功能暂未开放' },
          { text: '创建 API 密钥', link: '/#_6-创建-api-密钥' },
          { text: '接口测试', link: '/#_7-sub2api-接口地址与连通测试' }
        ]
      },
      {
        text: '客户端配置',
        items: [
          { text: '使用 API 密钥', link: '/#_8-使用-api-密钥' },
          { text: 'Codex CLI', link: '/#_8-1-codex-cli-macos-linux' },
          { text: 'Claude Code', link: '/#_8-3-claude-code' },
          { text: 'Gemini CLI', link: '/#_8-4-gemini-cli' },
          { text: 'OpenCode', link: '/#_8-5-opencode' },
          { text: 'OpenClaw', link: '/#_8-6-openclaw-可选' }
        ]
      },
      {
        text: '调用示例',
        items: [
          { text: 'GPT 文本调用', link: '/#_8-7-gpt-文本模型调用参数-responses' },
          { text: '文生图调用', link: '/#_8-8-gpt-image-2-调用参数-images' },
          { text: '参考图编辑', link: '/#_8-9-参考图编辑-images-edits-详细说明' },
          { text: '模型选择建议', link: '/#_9-模型选择建议' },
          { text: '订单状态说明', link: '/#_11-订单状态说明' },
          { text: '常见问题', link: '/#_12-常见问题' }
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
      message: '内容整理自会员使用指南，图片已按要求移除。',
      copyright: 'Token向云 Sub2API Guide'
    }
  }
})
