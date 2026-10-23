import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'

const initial = {
  id: 1, name: '主力供应商', source: 'manual', account_id: null, base_url: 'https://upstream.example', resolved_base_url: 'https://upstream.example', api_key_configured: true,
  enabled: true, low_balance_enabled: true, low_balance_threshold: 10, exhausted_enabled: true, check_interval_minutes: 5,
  balance: 5, balance_unit: 'USD', last_checked_at: '2026-10-23T03:00:00Z', last_check_status: 'success', last_error: null,
  last_alert_kind: 'low', last_alert_at: '2026-10-23T03:00:00Z', notification_status: 'sent',
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/session', route => route.fulfill({ json: { ok: true, data: { authenticated: false, admin: true, user: null } } }))
})

test('upstream monitor supports create, check, edit and delete on desktop and mobile', async ({ page }, testInfo) => {
  let items = [{ ...initial }]
  let saved: any
  await page.route('**/api/admin/upstreams**', async route => {
    const request = route.request()
    const pathname = new URL(request.url()).pathname
    if (pathname.endsWith('/check')) {
      const id = Number(pathname.split('/').at(-2))
      const item = items.find(row => row.id === id)!
      item.balance = 3
      return route.fulfill({ json: { ok: true, data: item } })
    }
    if (request.method() === 'DELETE') {
      items = items.filter(item => item.id !== Number(pathname.split('/').at(-1)))
      return route.fulfill({ json: { ok: true, data: { deleted: true } } })
    }
    if (['POST', 'PUT'].includes(request.method())) {
      saved = request.postDataJSON()
      const { api_key: _, ...publicInput } = saved
      const item = { ...initial, ...publicInput, resolved_base_url: publicInput.base_url.replace(/\/v1\/?$/, ''), id: request.method() === 'POST' ? 2 : Number(pathname.split('/').at(-1)) }
      items = [...items.filter(row => row.id !== item.id), item]
      return route.fulfill({ json: { ok: true, data: item } })
    }
    return route.fulfill({ json: { ok: true, data: items } })
  })

  await page.goto('/admin/upstreams', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '上游管理', exact: true })).toBeVisible()
  await expect(page.getByText('余额不足', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'https://upstream.example', exact: true })).toHaveAttribute('href', 'https://upstream.example')
  await page.getByRole('button', { name: '添加上游', exact: true }).first().click()
  await page.getByLabel('上游名称', { exact: true }).fill('备用供应商')
  await page.getByLabel('上游地址', { exact: true }).fill('https://backup.example/v1')
  await page.getByLabel('API Key', { exact: true }).fill('sk-ui-fixture-only')
  await page.getByLabel('余额告警阈值（上游返回币种）').fill('20')
  await page.getByRole('button', { name: '保存并查询' }).click()
  const row = page.locator('.upstream-row').filter({ has: page.getByRole('heading', { name: '备用供应商', exact: true }) })
  await expect(row).toBeVisible()
  await expect(row.locator('.upstream-balance strong')).toHaveText('3.0')
  await expect(row.getByRole('link', { name: 'https://backup.example', exact: true })).toHaveAttribute('href', 'https://backup.example')
  expect(saved).toMatchObject({ name: '备用供应商', base_url: 'https://backup.example/v1', low_balance_threshold: 20 })

  await page.getByRole('button', { name: '编辑 备用供应商', exact: true }).click()
  await expect(page.getByLabel('API Key', { exact: true })).toHaveValue('')
  await page.getByRole('button', { name: '保存并查询' }).click()
  await expect(page.locator('.upstream-editor')).toHaveCount(0)
  expect(saved.api_key).toBeNull()
  await expect(page.getByRole('link', { name: '告警邮箱', exact: true })).toHaveAttribute('href', '/admin/email')

  await mkdir(join('artifacts', 'ui'), { recursive: true })
  await page.evaluate(() => { window.scrollTo(0, 0); document.querySelector('.upstream-list')?.scrollTo(0, 0) })
  await page.screenshot({ path: join('artifacts', 'ui', `${testInfo.project.name}-upstreams.png`), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true)
  await page.getByRole('button', { name: '删除 备用供应商', exact: true }).click()
  await page.getByRole('button', { name: '确认删除', exact: true }).click()
  await expect(row).toHaveCount(0)
})

test('main-site monitors show clickable resolved upstream links before and after checking', async ({ page }, testInfo) => {
  const item = { ...initial, source: 'main_site', account_id: 136, base_url: '', resolved_base_url: 'https://upstream.example/a-long-upstream-path-that-wraps-on-mobile-screens' }
  await page.route('**/api/admin/upstreams**', route => route.fulfill({ json: { ok: true, data: route.request().url().endsWith('/check') ? { ...item, balance: 25 } : [item, { ...item, id: 2, name: '地址不可用的上游', resolved_base_url: '' }] } }))
  await page.goto('/admin/upstreams', { waitUntil: 'domcontentloaded' })
  const row = page.locator('.upstream-row').filter({ has: page.getByRole('heading', { name: item.name, exact: true }) })
  const link = row.getByRole('link', { name: item.resolved_base_url, exact: true })
  await expect(row.getByText('主站账号 #136', { exact: true })).toHaveCount(0)
  await expect(link).toBeVisible()
  await expect(link).toHaveAttribute('href', item.resolved_base_url)
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  await expect(link).toHaveText('upstream.example')
  await expect(link).toHaveAttribute('title', item.resolved_base_url)
  const unavailable = page.locator('.upstream-row').filter({ has: page.getByRole('heading', { name: '地址不可用的上游', exact: true }) })
  await expect(unavailable.getByText('地址暂不可用', { exact: true })).toBeVisible()
  await expect(unavailable.locator('a.upstream-link')).toHaveCount(0)
  await row.getByRole('button', { name: '查询余额', exact: true }).click()
  await expect(row.locator('.upstream-balance strong')).toHaveText('25.0')
  await expect(link).toBeVisible()
  await row.getByRole('button', { name: `编辑 ${item.name}`, exact: true }).click()
  await expect(page.getByLabel('上游地址（可选覆盖）', { exact: true })).toHaveValue('')
  await page.getByRole('button', { name: '关闭编辑', exact: true }).click()
  await page.evaluate(() => { window.scrollTo(0, 0); document.querySelector('.upstream-list')?.scrollTo(0, 0) })
  await page.screenshot({ path: join('artifacts', 'ui', `${testInfo.project.name}-upstream-links.png`), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true)
})

test('upstreams use compact single-line rows and one decimal balance without changing alert status', async ({ page }, testInfo) => {
  const items = [
    { ...initial, id: 1, name: '主力供应商-这是一个用于验证省略显示的长名称', source: 'main_site', account_id: 150, balance: 96.361606 },
    { ...initial, id: 2, name: '已用完的上游', balance: -0.149247, last_alert_kind: 'exhausted' },
    { ...initial, id: 3, name: '余额不足的上游', balance: 2.894387 },
    { ...initial, id: 4, name: '备用供应商', balance: 13.387427, notification_status: null },
    { ...initial, id: 5, name: '接近零但尚未用完', balance: 0.04, notification_status: 'failed' },
  ]
  await page.route('**/api/admin/upstreams', route => route.fulfill({ json: { ok: true, data: items } }))
  await page.goto('/admin/upstreams', { waitUntil: 'domcontentloaded' })
  const list = page.getByRole('region', { name: '上游账号列表' })
  await expect(list.getByRole('columnheader')).toHaveText(['上游名称', '上游地址', '余额', '状态', '告警规则', '最近检查', '操作'])
  const rows = list.locator('.upstream-row')
  await expect(rows).toHaveCount(5)
  await expect(rows.locator('.upstream-balance strong')).toHaveText(['96.4', '-0.1', '2.9', '13.4', '0.0'])
  await expect(rows.nth(4).locator('.upstream-status')).toHaveText('余额不足')
  await expect(rows.first().locator('h2')).toHaveAttribute('title', items[0]!.name)
  await expect(list.getByText(/主站账号|手动配置/)).toHaveCount(0)
  await expect(rows.first().locator('.upstream-check > span')).toHaveText(/^\d{2}:\d{2}:\d{2}$/)
  await expect(rows.first().locator('.upstream-check > span')).toHaveAttribute('title', /每 5 分钟检查/)
  await expect(rows.first().getByRole('img', { name: /已发送余额不足告警/ })).toHaveAttribute('title', /2026/)
  await expect(rows.nth(4).getByRole('img', { name: '邮件发送失败，下次检查将重试' })).toBeAttached()
  const heights = await rows.evaluateAll(elements => elements.map(element => element.getBoundingClientRect().height))
  expect(heights.every(height => height >= 48 && height <= 52)).toBe(true)
  const overflow = await list.evaluate(element => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }))
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true)
  if (testInfo.project.name === 'mobile') {
    expect(overflow.scrollWidth).toBeGreaterThan(overflow.clientWidth)
    await list.evaluate(element => { element.scrollLeft = element.scrollWidth })
    await expect(rows.first().getByRole('button', { name: `编辑 ${items[0]!.name}`, exact: true })).toBeInViewport()
    await list.evaluate(element => { element.scrollLeft = 0 })
  }
  await mkdir(join('artifacts', 'ui'), { recursive: true })
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: join('artifacts', 'ui', `${testInfo.project.name}-upstreams-compact.png`), fullPage: true })
})

test('query errors expand on demand while pending and unlimited balances remain distinct', async ({ page }) => {
  const error = { ...initial, id: 1, name: '查询失败的上游', last_check_status: 'error', last_error: '上游网络连接失败，请稍后重试。' }
  const items = [error, { ...initial, id: 2, name: '待查询的上游', balance: null, last_check_status: 'pending' }, { ...initial, id: 3, name: '不限额的上游', balance: null, last_check_status: 'unlimited' }]
  await page.route('**/api/admin/upstreams', route => route.fulfill({ json: { ok: true, data: items } }))
  await page.goto('/admin/upstreams', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('.upstream-balance strong')).toHaveText(['5.0', '—', '不限额'])
  await expect(page.locator('.upstream-row-error')).toHaveCount(0)
  const toggle = page.getByRole('button', { name: `查看 ${error.name} 错误详情`, exact: true })
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('alert')).toHaveText(error.last_error)
  await toggle.click()
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('main-site account selector only receives sanitized third-party accounts', async ({ page }, testInfo) => {
  await page.route('**/api/admin/upstreams', route => route.fulfill({ json: { ok: true, data: [] } }))
  await page.route('**/api/admin/upstreams/accounts?*', route => route.fulfill({ json: { ok: true, data: [{ id: 9, name: '主站三方账号', platform: 'openai', status: 'active', base_url: 'https://upstream.example' }] } }))
  await page.goto('/admin/upstreams', { waitUntil: 'domcontentloaded' })
  await page.getByRole('button', { name: '添加上游', exact: true }).first().click()
  await page.getByRole('combobox', { name: '账号来源', exact: true }).selectOption('main_site')
  await page.getByRole('combobox', { name: '主站三方 API 账号', exact: true }).selectOption('9')
  await expect(page.getByLabel('上游名称', { exact: true })).toHaveValue('主站三方账号')
  await expect(page.getByLabel('API Key（可选补充）', { exact: true })).toHaveValue('')
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: join('artifacts', 'ui', `${testInfo.project.name}-upstream-editor.png`), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true)
})

test('email settings saves multiple upstream alert recipients', async ({ page }, testInfo) => {
  let saved: any
  const settings = { enabled: true, smtp_host: 'smtp.example.com', smtp_port: 587, smtp_secure: false, smtp_username: '', from_name: '指南中心', from_email: 'notice@example.com', admin_email: 'admin@example.com', upstream_alert_emails: ['ops@example.com'], admin_subject_template: '新反馈', admin_body_template: '反馈内容', reply_subject_template: '反馈回复', reply_body_template: '回复内容', smtp_password_configured: false, smtp_password_masked: '' }
  await page.route('**/api/admin/email-settings', route => {
    if (route.request().method() === 'PUT') saved = route.request().postDataJSON()
    return route.fulfill({ json: { ok: true, data: { ...settings, ...saved } } })
  })
  await page.goto('/admin/email', { waitUntil: 'domcontentloaded' })
  await expect(page.getByLabel('上游告警收件邮箱', { exact: true })).toHaveValue('ops@example.com')
  await page.getByLabel('上游告警收件邮箱', { exact: true }).fill('ops@example.com\nfinance@example.com;owner@example.com')
  await page.getByRole('button', { name: '保存设置', exact: true }).click()
  await expect(page.getByText('邮件设置已保存。', { exact: true })).toBeVisible()
  expect(saved.upstream_alert_emails).toEqual(['ops@example.com', 'finance@example.com', 'owner@example.com'])
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: join('artifacts', 'ui', `${testInfo.project.name}-upstream-email.png`), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true)
})
