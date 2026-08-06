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
    logo_path: 'https://guide.kkflow.org/logo-80.png',
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
        },
        scripts: [],
      },
    },
  }))
  await page.route('**/api/session', route => route.fulfill({ json: { ok: true, data: { authenticated: true, admin: false, user: { id: '1', username: 'Tester', email: 'tester@example.com', role: 'user' }, token_expires_at: null } } }))
  await page.route('**/api/install/keys?tool=codex', route => route.fulfill({ json: { ok: true, data: [{ id: 7, name: 'Codex', masked_key: 'sk-test...key', group: { platform: 'openai' } }] } }))
  await page.route('**/api/install/command', route => route.fulfill({ json: { ok: true, data: { remote: [{ label: 'Linux Terminal', command }], local: [{ label: 'Linux Terminal', command: './setup.sh' }], download_url: '/setup.sh', filename: 'setup.sh', checksum: 'ABC' } } }))

  await page.goto('/install', { waitUntil: 'networkidle' })
  await page.getByRole('tab', { name: 'Linux' }).click()
  const copyButton = page.locator('.install-command button').first()
  await copyButton.click()
  await expect(copyButton).toHaveText('已复制')
  expect(await page.evaluate(() => (window as typeof window & { __copiedCommand?: string }).__copiedCommand)).toBe(command)
})
test('embedded mode removes the site chrome', async ({ page }) => {
  const response = await page.goto('/playground?embedded=1', { waitUntil: 'domcontentloaded' })
  expect(response?.status()).toBe(200)
  await expect(page.locator('.site-header')).toHaveCount(0)
  await expect(page.locator('.site-footer')).toHaveCount(0)
  await expect(page.locator('main')).toBeVisible()
})
