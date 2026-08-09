import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'

const routes = [
  ['home', '/'],
  ['member', '/member'],
  ['integration', '/integration'],
  ['install', '/install'],
  ['playground', '/playground'],
  ['pricing', '/pricing'],
  ['feedback', '/feedback'],
  ['admin', '/admin'],
  ['admin-settings', '/admin/settings'],
  ['admin-installers', '/admin/installers'],
  ['admin-pricing', '/admin/pricing'],
  ['admin-homepage', '/admin/homepage'],
  ['admin-promotions', '/admin/promotions'],
] as const

test.beforeAll(async () => {
  await mkdir(join(process.cwd(), 'artifacts', 'ui'), { recursive: true })
})

for (const [name, route] of routes) {
  test(`${name} renders without viewport overflow`, async ({ page }, testInfo) => {
    const response = await page.goto(route, { waitUntil: 'domcontentloaded' })
    expect(response?.status()).toBe(200)
    await expect(page.locator('main').first()).toBeVisible()
    await page.waitForTimeout(250)

    const layout = await page.evaluate(() => ({
      bodyWidth: document.body.scrollWidth,
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      bodyHeight: document.body.scrollHeight,
    }))
    expect(layout.bodyWidth).toBeLessThanOrEqual(layout.viewportWidth + 1)
    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth + 1)
    expect(layout.bodyHeight).toBeGreaterThan(200)

    await page.screenshot({
      path: join('artifacts', 'ui', `${testInfo.project.name}-${name}.png`),
      fullPage: true,
    })
  })
}

test('guide pages render document content and navigation', async ({ page }, testInfo) => {
  const response = await page.goto('/member', { waitUntil: 'networkidle' })
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { level: 1, name: '会员充值流程' })).toBeVisible()
  const sidebar = page.locator('.guide-sidebar')
  await expect(sidebar).toBeVisible()

  if (testInfo.project.name === 'mobile') {
    await sidebar.getByRole('button', { name: '指南目录' }).click()
    await expect(sidebar.locator('.guide-sidebar__panel')).toHaveClass(/is-open/)
  }

  const navigation = sidebar.getByRole('navigation', { name: '指南目录' })
  await expect(navigation.getByRole('link', { name: 'API 接入配置' })).toBeVisible()
  await expect(navigation.getByRole('link', { name: '模型价格' })).toHaveCount(0)
  await expect(navigation.getByRole('link', { name: '使用工作台' })).toHaveCount(0)
  await expect(navigation.getByRole('link', { name: '反馈' })).toHaveCount(0)
  await expect(navigation.getByRole('link', { name: '注册账号', exact: true })).toHaveAttribute('href', '/member#_1-注册账号')

  await navigation.getByRole('link', { name: 'API 接入配置' }).click()
  await expect(page).toHaveURL(/\/integration$/)
  await expect(page.getByRole('heading', { level: 1, name: 'API 接入配置' })).toBeVisible()
  if (testInfo.project.name === 'mobile') {
    const sidebarToggle = sidebar.getByRole('button', { name: '指南目录' })
    await expect(sidebarToggle).toHaveAttribute('aria-expanded', 'false')
    await sidebarToggle.click()
    await expect(sidebarToggle).toHaveAttribute('aria-expanded', 'true')
  }

  const integrationNavigation = sidebar.getByRole('navigation', { name: '指南目录' })
  const windowsGuide = integrationNavigation.getByRole('link', { name: 'Codex CLI（Windows）' })
  await expect(windowsGuide).toHaveAttribute('href', '/integration#_5-codex-cliwindows')
  await windowsGuide.click()
  await expect(page.getByRole('heading', { level: 2, name: '5. Codex CLI（Windows）' })).toBeVisible()
})

test('uploaded markdown automatically builds a page table of contents', async ({ page }, testInfo) => {
  const suffix = testInfo.project.name
  const label = `Grok-API-${suffix}`
  const path = `/grok-api-${suffix}`

  await page.goto('/admin/docs', { waitUntil: 'networkidle' })
  await page.getByLabel('管理员 Token').fill('playwright-admin-token')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: '指南内容' })).toBeVisible()

  await page.getByPlaceholder('默认读取 Markdown 标题').fill(label)
  await page.getByPlaceholder('例如 /quick-start').fill(path)
  await page.locator('input[type="file"][accept*=".md"]').setInputFiles({
    name: `${label}.md`,
    mimeType: 'text/markdown',
    buffer: Buffer.from([
      `# ${label}`,
      '',
      '## 一、文本',
      '',
      '文本说明。',
      '',
      '## 五、视频',
      '',
      '视频说明。',
      '',
      '### 场景与模型',
      '',
      '场景说明。',
    ].join('\n')),
  })

  const row = page.locator('.admin-doc-list__row').filter({ hasText: label })
  await expect(row).toBeVisible()
  await page.getByRole('button', { name: '发布', exact: true }).click()
  await row.getByRole('button', { name: '启用文档' }).click()

  await page.goto(path, { waitUntil: 'networkidle' })
  await expect(page.getByRole('heading', { level: 1, name: label })).toBeVisible()
  const sidebar = page.locator('.guide-sidebar')
  if (testInfo.project.name === 'mobile') {
    await sidebar.getByRole('button', { name: '指南目录' }).click()
  }
  const navigation = sidebar.getByRole('navigation', { name: '指南目录' })
  await expect(navigation.getByRole('link', { name: '一、文本' })).toBeVisible()
  await expect(navigation.getByRole('link', { name: '五、视频' })).toBeVisible()
  await expect(navigation.getByRole('link', { name: '场景与模型' })).toBeVisible()
  const videoLink = navigation.getByRole('link', { name: '五、视频' })
  await expect(videoLink).toHaveAttribute('href', new RegExp(`^${path}#.+`))
  await videoLink.click()
  await expect(page.getByRole('heading', { level: 2, name: '五、视频' })).toBeVisible()
  await expect(page).toHaveURL(/#.+/)

  await page.goto('/admin/docs', { waitUntil: 'networkidle' })
  const cleanupRow = page.locator('.admin-doc-list__row').filter({ hasText: label })
  await cleanupRow.getByRole('button').first().click()
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: '删除覆盖' }).click()
  await expect(cleanupRow).toHaveCount(0)
})

test('guide home renders the configured contact and group QR without links', async ({ page }) => {
  await page.route('https://www.kdocs.cn/**', route => route.fulfill({
    status: 200,
    contentType: 'image/png',
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
  }))
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  const qrImage = page.getByRole('img', { name: '群二维码图片' })
  await expect(qrImage).toHaveAttribute('src', 'https://www.kdocs.cn/l/csU8ZJybJe2V')
  await expect(page.locator('.doc-content blockquote')).toContainText('添加客服 微信 kkflow520')
  await expect(page.getByRole('link', { name: '客户服务群' })).toHaveCount(0)
  await expect(page.locator('.support-group-qr > a')).toHaveCount(0)
  await expect(page.getByText('这里是群二维码图片。如果无法显示，请关闭网络代理。')).toBeVisible()
})

test('tool pages stay outside the guide sidebar', async ({ page }, testInfo) => {
  await page.goto('/pricing', { waitUntil: 'networkidle' })
  await expect(page.locator('.guide-sidebar')).toHaveCount(0)
  if (testInfo.project.name === 'mobile') {
    const menuButton = page.getByRole('button', { name: '切换导航' })
    await menuButton.click()
    await expect(menuButton).toHaveAttribute('aria-expanded', 'true')
  }

  const mainNavigation = page.getByRole('navigation', { name: '主导航' })
  await expect(mainNavigation.getByRole('link', { name: '模型价格' })).toHaveAttribute('aria-current', 'page')
  await mainNavigation.getByRole('link', { name: '使用工作台' }).click()
  await expect(page).toHaveURL(/\/playground$/)
  await expect(page.locator('.guide-sidebar')).toHaveCount(0)
})

test('pricing shows official prices once and scopes plans to supported models', async ({ page }, testInfo) => {
  await page.route('**/api/pricing', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      ok: true,
      data: {
        source: { configured: true, status: 'live', fetched_at: new Date().toISOString(), warnings: [] },
        exchange: { usd_to_cny: 7 },
        display: { provider_order: ['openai'] },
        models: [
          {
            provider: 'openai', provider_label: 'OpenAI', provider_short: 'O',
            model_name: 'gpt-5.6-sol', display_name: 'gpt-5.6-sol', billing_mode: 'token', capabilities: {},
            is_featured: false, sort_order: 1, note: '', group_ids: ['20'],
            prices: { input_usd_per_million: 5, output_usd_per_million: 30, cache_read_usd_per_million: 0.5 },
          },
          {
            provider: 'openai', provider_label: 'OpenAI', provider_short: 'O',
            model_name: 'gpt-5.5', display_name: 'gpt-5.5', billing_mode: 'token', capabilities: {},
            is_featured: true, sort_order: 10, note: '', group_ids: ['20'],
            prices: { input_usd_per_million: 4, output_usd_per_million: 24, cache_read_usd_per_million: 0.4 },
          },
          {
            provider: 'openai', provider_label: 'OpenAI', provider_short: 'O',
            model_name: 'deepseek-v4-flash', display_name: 'deepseek-v4-flash', billing_mode: 'token', capabilities: {},
            is_featured: false, sort_order: 2, note: '', group_ids: ['10'],
            prices: { input_usd_per_million: 1, output_usd_per_million: 2, cache_read_usd_per_million: 0.1 },
          },
        ],
        groups: [
          {
            provider: 'openai', source_id: '10', name: 'deepseek-v4-flash 官方1折',
            display_name: 'deepseek-v4-flash 官方1折', is_exclusive: false, rate_multiplier: 0.1,
            recharge_multiplier: 1, recharge_pay_cny: 1, recharge_credit_usd: 1,
            effective_rate: 0.1, sort_order: 1, note: '',
          },
          {
            provider: 'openai', source_id: '20', name: '高速VIP通道', display_name: '高速VIP通道',
            is_exclusive: false, rate_multiplier: 1, recharge_multiplier: 5,
            recharge_pay_cny: 20, recharge_credit_usd: 100, effective_rate: 0.2,
            sort_order: 2, note: '',
          },
        ],
      },
    }),
  }))

  await page.goto('/playground', { waitUntil: 'networkidle' })
  if (testInfo.project.name === 'mobile') {
    await page.getByRole('button', { name: '切换导航' }).click()
  }
  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '模型价格' }).click()
  await page.waitForLoadState('networkidle')
  await expect(page.locator('.pricing-model__identity strong').first()).toHaveText('gpt-5.6-sol')
  const gpt = page.locator('.pricing-model').filter({ hasText: 'gpt-5.6-sol' })
  const deepseek = page.locator('.pricing-model').filter({ hasText: 'deepseek-v4-flash' })
  await expect(gpt.locator('.pricing-model__official')).toContainText('输入$5')
  await expect(gpt.locator('.pricing-model__official')).toContainText('输出$30')
  await expect(gpt).toContainText('高速VIP通道')
  await expect(gpt).not.toContainText('deepseek-v4-flash 官方1折')
  await deepseek.locator('.pricing-model__summary').click()
  await expect(deepseek).toContainText('deepseek-v4-flash 官方1折')
  await expect(page.locator('.pricing-table tbody td > small').filter({ hasText: '官方价' })).toHaveCount(0)

  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }))
  expect(overflow.body).toBeLessThanOrEqual(overflow.viewport + 1)
})

test('public interface uses the business-black accent palette', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  const colors = await page.evaluate(() => ({
    brand: getComputedStyle(document.documentElement).getPropertyValue('--brand').trim(),
    brandStrong: getComputedStyle(document.documentElement).getPropertyValue('--brand-strong').trim(),
  }))
  expect(colors).toEqual({ brand: '#24272d', brandStrong: '#111317' })
})

test('administrator can update and restore public site branding', async ({ page }, testInfo) => {
  const defaults = {
    project_name: 'Token向云',
    site_title: 'Token向云指南',
    site_description: '会员、API 接入、模型试用与价格参考。',
    logo_path: 'https://guide.aiziyou.org/logo-80.png',
    footer_text: '清晰接入，稳定调用。',
    main_site_url: 'https://kkflow.org',
    login_path: '/login',
    register_path: '/register',
    support_path: '/support',
    api_path: '/v1',
    support_wechat: '微信 kkflow520',
    support_group_url: 'https://www.kdocs.cn/l/csU8ZJybJe2V',
  }

  await page.goto('/admin/settings', { waitUntil: 'networkidle' })
  await page.getByLabel('管理员 Token').fill('playwright-admin-token')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: '站点配置' })).toBeVisible()
  await expect(page.getByLabel('Logo 完整地址')).toHaveAttribute('type', 'url')
  await expect(page.getByLabel('群二维码图片地址')).toHaveAttribute('type', 'url')
  await expect(page.getByLabel('客服类型')).toHaveValue('微信')
  await expect(page.getByLabel('客服账号')).toHaveValue('kkflow520')

  try {
    await page.getByLabel('项目名称').fill('灵链')
    await page.getByLabel('站点标题').fill('灵链指南')
    await page.getByLabel('主站地址').fill('https://aiziyou.org')
    await page.getByLabel('客服类型').selectOption('QQ')
    await page.getByLabel('客服账号').fill('2754632844')
    await page.getByRole('button', { name: '保存配置' }).click()
    await expect(page.getByText('站点配置已保存。')).toBeVisible()
    await page.screenshot({
      path: join('artifacts', 'ui', `${testInfo.project.name}-admin-settings-authenticated.png`),
      fullPage: true,
    })

    await page.goto('/', { waitUntil: 'networkidle' })
    await expect(page.locator('.site-brand')).toContainText('灵链指南')
    await expect(page.getByRole('heading', { level: 1 })).toContainText('灵链会员与 API 接入指南')
    await expect(page.locator('.doc-content blockquote')).toContainText('添加客服 QQ 2754632844')

    await page.goto('/integration', { waitUntil: 'networkidle' })
    await expect(page.locator('.doc-content')).toContainText('model_provider = "aiziyou"')
    await expect(page.locator('.doc-content')).toContainText('[model_providers.aiziyou]')
    await expect(page.locator('.doc-content')).toContainText('name = "灵链"')
    await expect(page.locator('.doc-content')).not.toContainText('[model_providers.kkflow]')
    await page.screenshot({
      path: join('artifacts', 'ui', `${testInfo.project.name}-integration-branded.png`),
      fullPage: true,
    })
  } finally {
    const restored = await page.request.put('/api/admin/site-config', { data: defaults })
    expect(restored.ok()).toBe(true)
  }
})


test('administrator can manage classified installer scripts', async ({ page }, testInfo) => {
  await page.goto('/admin/installers', { waitUntil: 'domcontentloaded' })
  await page.getByLabel('管理员 Token').fill('playwright-admin-token')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByRole('heading', { level: 1, name: '脚本配置' })).toBeVisible()
  await expect(page.getByLabel('工具分类').getByRole('button', { name: 'Codex CLI' })).toBeVisible()
  await expect(page.getByLabel('系统分类').getByRole('button', { name: 'Windows' })).toBeVisible()
  await expect(page.getByLabel('系统分类').getByRole('button', { name: 'macOS' })).toBeVisible()
  await expect(page.getByLabel('系统分类').getByRole('button', { name: 'Linux' })).toBeVisible()

  const originalResponse = await page.request.get('/api/admin/installers')
  expect(originalResponse.ok()).toBe(true)
  const original = (await originalResponse.json()).data.settings
  await expect(page.getByLabel('PROVIDER_ID')).toHaveValue(original.provider_id)
  await expect(page.getByLabel('BASE_URL')).toHaveValue(original.base_url)

  await page.route('**/api/admin/pricing/source', route => route.fulfill({
    json: {
      ok: true,
      data: {
        source: { configured: true, platforms: ['openai'], sub2api_api_base: 'https://example.com/api/v1' },
        groups: [{
          provider: 'openai', provider_label: 'OpenAI', provider_short: 'O', source_id: '27',
          source_name: 'deepseek-v4-flash 官方1折', description: '', subscription_type: 'standard',
          is_exclusive: false, rate_multiplier: 0.1, daily_limit_usd: null, weekly_limit_usd: null,
          monthly_limit_usd: null, default_validity_days: 30, allow_image_generation: false,
          image_rate_independent: false, image_rate_multiplier: 1, image_price_1k: null,
          image_price_2k: null, image_price_4k: null, default_image_prices_usd: {},
          peak_rate_enabled: false, peak_start: '', peak_end: '', peak_rate_multiplier: 1,
          status: 'active', sort_order: 1,
        }],
        models_by_provider: { openai: ['deepseek-v4-flash'] },
        model_group_ids_by_provider: { openai: { 'deepseek-v4-flash': ['27'] } },
        model_group_scope_by_provider: { openai: true },
        warnings: [], fetched_at: new Date().toISOString(),
      },
    },
  }))
  await page.getByRole('button', { name: '刷新' }).click()
  const deepseekGroupModel = page.getByRole('combobox', { name: 'deepseek-v4-flash 官方1折 自动安装模型' })
  await expect(deepseekGroupModel.locator('option')).toHaveText(['跟随默认：gpt-5.6-sol', 'deepseek-v4-flash'])

  const editorMetrics = await page.getByLabel('安装脚本内容').evaluate((element) => {
    const style = getComputedStyle(element)
    return { height: Number.parseFloat(style.height), resize: style.resize, scrollbarWidth: style.scrollbarWidth }
  })
  expect(editorMetrics.height).toBe(testInfo.project.name === 'mobile' ? 620 : 760)
  expect(editorMetrics.resize).toBe('none')
  expect(editorMetrics.scrollbarWidth).toBe('none')

  try {
    const claudeToggle = page.getByRole('checkbox', { name: /Claude Code/ })
    const claudeToggleControl = page.locator('label.installer-visibility-toggle').filter({ hasText: 'Claude Code' })
    await expect(claudeToggle).toBeChecked()
    await claudeToggleControl.click()
    await expect(claudeToggle).not.toBeChecked()
    const savedResponse = page.waitForResponse(response => response.url().includes('/api/admin/installers/settings') && response.request().method() === 'PUT')
    await page.getByRole('button', { name: '保存安装器设置' }).click()
    expect((await savedResponse).ok()).toBe(true)
    await expect(page.getByText('公共配置已保存。')).toBeVisible()
    const updatedResponse = await page.request.get('/api/admin/installers')
    expect((await updatedResponse.json()).data.settings.claude_enabled).toBe(false)
  } finally {
    const restoreClaudeToggle = page.getByRole('checkbox', { name: /Claude Code/ })
    if (await restoreClaudeToggle.isChecked() !== original.claude_enabled) {
      await page.locator('label.installer-visibility-toggle').filter({ hasText: 'Claude Code' }).click()
    }
    const restoredResponse = page.waitForResponse(response => response.url().includes('/api/admin/installers/settings') && response.request().method() === 'PUT')
    await page.getByRole('button', { name: '保存安装器设置' }).click()
    expect((await restoredResponse).ok()).toBe(true)
  }

  await page.getByLabel('工具分类').getByRole('button', { name: 'Claude Code' }).click()
  await page.getByLabel('系统分类').getByRole('button', { name: 'Linux' }).click()
  await expect(page.getByLabel('安装脚本内容')).toHaveValue(/Claude Code/)
  await page.screenshot({
    path: join('artifacts', 'ui', `${testInfo.project.name}-admin-installers-authenticated.png`),
    fullPage: true,
  })

  await page.route('**/api/install/config', route => route.fulfill({
    json: {
      ok: true,
      data: {
        settings: { ...original, provider_id: 'custom', codex_enabled: true, claude_enabled: false },
        scripts: [],
      },
    },
  }))
  await page.route('**/api/session', route => route.fulfill({ json: { ok: true, data: { authenticated: false, admin: false, user: null, token_expires_at: null } } }))
  await page.goto('/install', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('tab', { name: 'Codex CLI' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Claude Code' })).toHaveCount(0)
})

test('administrator can inspect group model scopes from the source snapshot', async ({ page }, testInfo) => {
  const login = await page.request.post('/api/session/admin', { data: { token: 'playwright-admin-token' } })
  expect(login.ok()).toBe(true)

  await page.route('**/api/admin/pricing/config', route => route.fulfill({
    json: {
      ok: true,
      data: {
        models: [],
        groups: [],
        settings: {
          sub2api_base_url: 'https://kkflow.org',
          sub2api_admin_api_key_configured: true,
          sub2api_admin_api_key_masked: 'admin...key',
          pricing_platforms: ['openai'],
          provider_display_order: ['openai'],
          usd_to_cny: 6.8102,
        },
        source: { configured: true, platforms: ['openai'], sub2api_api_base: 'https://kkflow.org/api/v1' },
      },
    },
  }))
  await page.route('**/api/admin/pricing/source?refresh=false', route => route.fulfill({
    json: {
      ok: true,
      data: {
        source: { configured: true, platforms: ['openai'], sub2api_api_base: 'https://kkflow.org/api/v1' },
        groups: [{
          provider: 'openai',
          provider_label: 'OpenAI',
          source_id: '11',
          source_name: 'DeepSeek Flash',
          model_list_enabled: true,
          model_names: ['deepseek-v4-flash'],
          description: '',
          is_exclusive: false,
          rate_multiplier: 1,
          sort_order: 10,
        }],
        models_by_provider: { openai: ['deepseek-v4-flash'] },
        warnings: [],
        fetched_at: '2026-08-10T00:00:00.000Z',
        snapshot_available: true,
      },
    },
  }))

  await page.goto('/admin/pricing', { waitUntil: 'networkidle' })
  await expect(page.getByText('模型来源快照已就绪')).toBeVisible()
  await page.getByRole('button', { name: '分组 1' }).click()
  await expect(page.getByText('1 个白名单模型')).toBeVisible()
  await expect(page.getByText('deepseek-v4-flash')).toBeVisible()
  const tableLayout = await page.locator('.admin-table-scroll').evaluate(element => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }))
  expect(tableLayout.scrollWidth).toBeGreaterThanOrEqual(tableLayout.clientWidth)
  await page.screenshot({
    path: join('artifacts', 'ui', `${testInfo.project.name}-admin-pricing-authenticated.png`),
    fullPage: true,
  })
})

test('installer uses only the selected key group model allowlist', async ({ page }, testInfo) => {
  const command = "export CODEX_MODEL='deepseek-v4-flash'; bash setup.sh"
  await page.route('**/api/install/config', route => route.fulfill({
    json: {
      ok: true,
      data: {
        settings: {
          provider_id: 'custom',
          base_url: 'https://llapi.org/v1',
          codex_default_model: 'gpt-5.6-sol',
          claude_default_model: '',
          codex_enabled: true,
          claude_enabled: false,
        },
        scripts: [],
      },
    },
  }))
  await page.route('**/api/session', route => route.fulfill({
    json: {
      ok: true,
      data: {
        authenticated: true,
        admin: false,
        user: { id: '1', username: 'Tester', email: 'tester@example.com', role: 'user' },
        token_expires_at: null,
      },
    },
  }))
  await page.route('**/api/install/keys?tool=codex', route => route.fulfill({
    json: {
      ok: true,
      data: [{
        id: 7,
        name: 'DeepSeek Key',
        masked_key: 'sk-test...key',
        group_id: 11,
        group: {
          id: 11,
          name: 'DeepSeek Flash',
          platform: 'openai',
          model_policy: { mode: 'allowlist', models: ['deepseek-v4-flash'] },
        },
      }],
    },
  }))
  await page.route('**/api/install/command', route => route.fulfill({
    json: {
      ok: true,
      data: {
        remote: [{ label: 'Linux Terminal', command }],
        local: [{ label: 'Linux Terminal', command: './setup.sh' }],
        download_url: '/setup.sh',
        filename: 'setup.sh',
        checksum: 'ABC',
        install_model: 'deepseek-v4-flash',
        model_source: 'group_allowlist',
        allowed_models: ['deepseek-v4-flash'],
        model_policy_mode: 'allowlist',
      },
    },
  }))

  await page.goto('/install', { waitUntil: 'networkidle' })
  await page.getByRole('tab', { name: 'Linux' }).click()
  await expect(page.getByText('DeepSeek Flash')).toBeVisible()
  await expect(page.getByText('deepseek-v4-flash', { exact: true })).toBeVisible()
  await expect(page.getByText('当前分组白名单')).toBeVisible()
  await expect(page.getByLabel('Linux Terminal命令').first()).toHaveValue(command)
  await expect(page.getByText('gpt-5.6-sol', { exact: true })).toHaveCount(0)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({
    path: join('artifacts', 'ui', `${testInfo.project.name}-install-group-allowlist.png`),
    fullPage: true,
  })
})

test('install command copy falls back on an insecure origin', async ({ page }) => {
  const command = "export CODEX_API_KEY='test-key'; curl -fsSL 'http://127.0.0.1/setup.sh' | bash"
  await page.addInitScript(() => {
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: false })
    Object.defineProperty(Document.prototype, 'execCommand', {
      configurable: true,
      value(action: string) {
        if (action !== 'copy') return false
        const field = document.activeElement as HTMLTextAreaElement | null
        ;(window as typeof window & { __copiedCommand?: string }).__copiedCommand = field?.value || ''
        return Boolean(field?.value)
      },
    })
  })
  await page.route('**/api/install/config', route => route.fulfill({
    json: {
      ok: true,
      data: {
        settings: {
          provider_id: 'custom',
          base_url: 'https://llapi.org/v1',
          codex_default_model: 'gpt-5.6-sol',
          claude_default_model: '',
          codex_enabled: true,
          claude_enabled: false,
          group_models: [{ tool: 'codex', group_id: '27', model: 'deepseek-v4-flash' }],
        },
        scripts: [],
      },
    },
  }))
  await page.route('**/api/session', route => route.fulfill({ json: { ok: true, data: { authenticated: true, admin: false, user: { id: '1', username: 'Tester', email: 'tester@example.com', role: 'user' }, token_expires_at: null } } }))
  await page.route('**/api/install/keys?tool=codex', route => route.fulfill({ json: { ok: true, data: [{ id: 7, name: 'Codex', masked_key: 'sk-test...key', group_id: 27, group: { id: 27, name: 'DeepSeek 官方1折', platform: 'openai' } }] } }))
  await page.route('**/api/install/command', route => route.fulfill({ json: { ok: true, data: { remote: [{ label: 'Linux Terminal', command }], local: [{ label: 'Linux Terminal', command: './setup.sh' }], download_url: '/setup.sh', filename: 'setup.sh', checksum: 'ABC', model: 'deepseek-v4-flash' } } }))

  await page.goto('/install', { waitUntil: 'networkidle' })
  await expect(page.locator('.install-key-panel')).toContainText('DeepSeek 官方1折')
  await expect(page.locator('.install-key-panel')).toContainText('deepseek-v4-flash')
  await page.getByRole('tab', { name: 'Linux' }).click()
  const copyButton = page.locator('.install-command button').first()
  await copyButton.click()
  await expect(copyButton).toHaveText('已复制')
  expect(await page.evaluate(() => (window as typeof window & { __copiedCommand?: string }).__copiedCommand)).toBe(command)
})

test('playground renders streamed text responses', async ({ page }) => {
  let submittedBody: any = null
  await page.route('**/api/session', route => route.fulfill({
    json: {
      ok: true,
      data: {
        authenticated: true,
        admin: false,
        user: { id: '1', username: 'Tester', email: 'tester@example.com', role: 'user' },
        token_expires_at: null,
      },
    },
  }))
  await page.route('**/api/playground/keys', route => route.fulfill({
    json: { ok: true, data: [{ id: 7, name: 'Test Key', masked_key: 'sk-test...key', status: 'active', group_id: null, group: null }] },
  }))
  await page.route('**/api/playground/responses', async (route) => {
    submittedBody = route.request().postDataJSON()
    await new Promise(resolve => setTimeout(resolve, 100))
    await route.fulfill({
      contentType: 'text/event-stream',
      body: [
        'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"流式"}\n\n',
        'event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"返回成功"}\n\n',
        'event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp_ui","output_text":"流式返回成功"}}\n\n',
        'event: guide.done\ndata: {"duration_ms":108}\n\n',
      ].join(''),
    })
  })

  await page.goto('/playground', { waitUntil: 'networkidle' })
  await expect(page.getByRole('note')).toHaveText('试用工作台主要用于确认模型和 API Key 能否正常调用。功能比较基础，对话不会保存，不建议用于正式工作。')
  const modelSelect = page.getByRole('combobox', { name: '模型' })
  const textModels = page.locator('#text-models option')
  await expect(textModels).toHaveCount(2)
  await expect(textModels.nth(0)).toHaveAttribute('value', 'gpt-5.6-sol')
  await expect(textModels.nth(1)).toHaveAttribute('value', 'gpt-5.5')
  await expect(modelSelect).toHaveValue('gpt-5.6-sol')
  await page.getByRole('button', { name: '发送请求' }).click()
  await expect(page.getByRole('button', { name: '停止生成' })).toBeVisible()
  await expect(page.locator('.response-output')).toHaveText('流式返回成功')
  await expect(page.locator('.result-duration')).toHaveText('108 ms')
  expect(submittedBody.request.stream).toBe(true)
  expect(submittedBody.request.model).toBe('gpt-5.6-sol')
})

test('embedded mode removes the site chrome', async ({ page }) => {
  const response = await page.goto('/playground?embedded=1', { waitUntil: 'domcontentloaded' })
  expect(response?.status()).toBe(200)
  await expect(page.locator('.site-header')).toHaveCount(0)
  await expect(page.locator('.site-footer')).toHaveCount(0)
  await expect(page.locator('main')).toBeVisible()
})
