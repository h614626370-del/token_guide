import { expect, test } from '@playwright/test'

test('administrator can run a live batch OpenAI account test', async ({ page }) => {
  const login = await page.request.post('/api/session/admin', { data: { token: 'playwright-admin-token' } })
  expect(login.ok()).toBe(true)

  await page.route('**/api/admin/account-tests/models', route => route.fulfill({
    json: { ok: true, data: { models: ['gpt-5.4', 'gpt-5.3'] } },
  }))
  await page.route('**/api/admin/account-tests/accounts', route => route.fulfill({
    json: {
      ok: true,
      data: {
        accounts: [
          { id: 1, name: 'OpenAI Main', status: 'active', type: 'oauth', schedulable: true },
          { id: 2, name: 'OpenAI Backup', status: 'active', type: 'apikey', schedulable: false },
        ],
      },
    },
  }))
  await page.route('**/api/admin/account-tests/run', async route => {
    expect(route.request().postDataJSON()).toEqual({ model_id: 'gpt-5.4', prompt: '请回答：测试成功', account_ids: [1, 2] })
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body: [
        'event: batch.start\ndata: {"total":2,"model_id":"gpt-5.4"}\n\n',
        'event: account.start\ndata: {"account_id":1,"name":"OpenAI Main"}\n\n',
        'event: account.start\ndata: {"account_id":2,"name":"OpenAI Backup"}\n\n',
        'event: account.delta\ndata: {"account_id":1,"text":"主账号回答"}\n\n',
        'event: account.delta\ndata: {"account_id":2,"text":"备用账号回答"}\n\n',
        'event: account.complete\ndata: {"account_id":1,"name":"OpenAI Main","success":true,"answer":"主账号回答","latency_ms":120}\n\n',
        'event: account.complete\ndata: {"account_id":2,"name":"OpenAI Backup","success":true,"answer":"备用账号回答","latency_ms":240}\n\n',
        'event: batch.complete\ndata: {"total":2,"succeeded":2,"failed":0}\n\n',
      ].join(''),
    })
  })

  await page.goto('/admin/account-tests', { waitUntil: 'networkidle' })
  await expect(page.getByRole('heading', { level: 1, name: 'OpenAI 账号测试' })).toBeVisible()
  await expect(page.getByText('已选择 0 / 2 个账号')).toBeVisible()
  await page.getByLabel('认证类型').selectOption('oauth')
  await expect(page.getByText('OpenAI Main')).toBeVisible()
  await expect(page.getByText('OpenAI Backup')).toHaveCount(0)
  await page.getByRole('button', { name: '选择当前筛选' }).click()
  await page.getByRole('button', { name: '取消当前筛选' }).click()
  await page.getByRole('button', { name: '全选' }).click()
  await page.getByLabel('认证类型').selectOption('all')
  await page.getByLabel('自定义提示词').fill('请回答：测试成功')
  await page.getByRole('button', { name: '开始批量测试' }).click()
  await expect(page.getByText('主账号回答')).toBeVisible()
  await expect(page.getByText('备用账号回答')).toBeVisible()
  await expect(page.getByText('批量测试完成：成功 2 个，失败 0 个。')).toBeVisible()
})
