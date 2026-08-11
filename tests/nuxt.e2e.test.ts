import { createServer } from 'node:http'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { fetch, setup, url } from '@nuxt/test-utils/e2e'
import { SseDecoder } from '../shared/utils/sse'

const adminToken = 'integration-admin-token'
const sessionPassword = 'integration-session-password-at-least-32-characters'
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'kkflow-guide-e2e-'))
const databasePath = join(temporaryDirectory, 'guide.sqlite')
const jwt = `e30.${Buffer.from(JSON.stringify({ exp: 4_102_444_800 })).toString('base64url')}.signature`
const savedApiKey = 'sk-saved-1234567890'
const savedClaudeApiKey = 'sk-ant-saved-1234567890'
const upstreamRequests: Array<{ path: string, authorization: string, body: any }> = []

const upstream = createServer(async (request, response) => {
  const requestUrl = new URL(request.url || '/', 'http://127.0.0.1')
  const authorization = request.headers.authorization || ''
  let requestBody: any = null
  if (request.method === 'POST') {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.from(chunk))
    const raw = Buffer.concat(chunks).toString('utf8')
    requestBody = raw ? JSON.parse(raw) : null
  }
  upstreamRequests.push({ path: requestUrl.pathname, authorization, body: requestBody })
  response.setHeader('content-type', 'application/json')
  if (requestUrl.pathname === '/api/v1/auth/me' && authorization === `Bearer ${jwt}`) {
    response.end(JSON.stringify({
      code: 0,
      data: {
        id: 614,
        email: 'member@example.com',
        username: 'Integration Member',
        role: 'user',
      },
    }))
    return
  }
  if (requestUrl.pathname === '/api/v1/keys' && authorization === `Bearer ${jwt}`) {
    response.end(JSON.stringify({
      code: 0,
      data: {
        items: [
          {
            id: 7,
            key: savedApiKey,
            name: 'Integration key',
            status: 'active',
            group_id: 11,
            group: { id: 11, name: 'OpenAI', platform: 'openai' },
          },
          {
            id: 8,
            key: savedClaudeApiKey,
            name: 'Claude integration key',
            status: 'active',
            group_id: 12,
            group: { id: 12, name: 'Anthropic', platform: 'anthropic' },
          },
        ],
        total: 2,
      },
    }))
    return
  }
  if (requestUrl.pathname === '/api/v1/keys/7' && authorization === `Bearer ${jwt}`) {
    response.end(JSON.stringify({
      code: 0,
      data: {
        id: 7,
        key: savedApiKey,
        name: 'Integration key',
        status: 'active',
        group_id: 11,
      },
    }))
    return
  }
  if (requestUrl.pathname === '/api/v1/keys/8' && authorization === `Bearer ${jwt}`) {
    response.end(JSON.stringify({
      code: 0,
      data: {
        id: 8,
        key: savedClaudeApiKey,
        name: 'Claude integration key',
        status: 'active',
        group_id: 12,
      },
    }))
    return
  }
  if (requestUrl.pathname === '/v1/responses' && authorization === `Bearer ${savedApiKey}`) {
    if (requestBody?.model === 'upstream-error') {
      response.statusCode = 401
      response.end(JSON.stringify({ error: { message: `Incorrect API key provided: ${savedApiKey}` } }))
      return
    }
    if (requestBody?.stream === true) {
      response.setHeader('content-type', 'text/event-stream')
      response.flushHeaders()
      response.write(`event: response.output_text.delta\ndata: ${JSON.stringify({ type: 'response.output_text.delta', delta: 'Proxy ' })}\n\n`)
      await new Promise(resolve => setTimeout(resolve, 10))
      response.write(`event: response.output_text.delta\ndata: ${JSON.stringify({ type: 'response.output_text.delta', delta: 'response' })}\n\n`)
      response.end(`event: response.completed\ndata: ${JSON.stringify({
        type: 'response.completed',
        response: {
          id: 'resp_test',
          object: 'response',
          model: requestBody?.model,
          output_text: 'Proxy response',
        },
      })}\n\n`)
      return
    }
    response.end(JSON.stringify({
      id: 'resp_test',
      object: 'response',
      model: requestBody?.model,
      output_text: 'Proxy response',
    }))
    return
  }
  if (requestUrl.pathname === '/v1/images/generations' && authorization === 'Bearer sk-custom-abcdef') {
    response.end(JSON.stringify({
      created: 1_700_000_000,
      data: [{ url: 'https://images.example/generated.png' }],
    }))
    return
  }
  response.statusCode = 401
  response.end(JSON.stringify({ code: 401, message: 'invalid token' }))
})

await new Promise<void>((resolve, reject) => {
  upstream.once('error', reject)
  upstream.listen(0, '127.0.0.1', resolve)
})
const upstreamAddress = upstream.address()
if (!upstreamAddress || typeof upstreamAddress === 'string') {
  throw new Error('Unable to start the sub2api test server.')
}
const upstreamOrigin = `http://127.0.0.1:${upstreamAddress.port}`

afterAll(async () => {
  await new Promise<void>((resolve, reject) => upstream.close(error => error ? reject(error) : resolve()))
  rmSync(temporaryDirectory, { recursive: true, force: true })
})

await setup({
  rootDir: fileURLToPath(new URL('..', import.meta.url)),
  browser: false,
  server: true,
  setupTimeout: 240_000,
  teardownTimeout: 60_000,
  env: {
    NUXT_DATABASE_PATH: databasePath,
    NUXT_ADMIN_TOKEN: adminToken,
    NUXT_SESSION_PASSWORD: sessionPassword,
    NUXT_IP_HASH_SALT: 'integration-ip-hash-salt',
    NUXT_TRUSTED_PROXY_IPS: '127.0.0.1,::1',
  },
})

function cookieFrom(response: Response) {
  const value = response.headers.get('set-cookie')
  expect(value).toBeTruthy()
  return value!.split(';', 1)[0]
}

async function json(response: Response) {
  return response.json() as Promise<any>
}

async function sseEvents(response: Response) {
  const decoder = new SseDecoder()
  const events = decoder.push(new TextEncoder().encode(await response.text()))
  events.push(...decoder.finish())
  return events
}

async function memberCookie() {
  const response = await fetch(`/auth/embed?token=${encodeURIComponent(jwt)}`, { redirect: 'manual' })
  expect(response.status).toBe(303)
  return cookieFrom(response)
}

async function administratorCookie(requestHeaders: Record<string, string> = {}) {
  const response = await fetch(url('/api/session/admin'), {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...requestHeaders },
    body: JSON.stringify({ token: adminToken }),
  })
  expect(response.status).toBe(200)
  return cookieFrom(response)
}

describe('Nuxt application routes', () => {
  beforeAll(async () => {
    const bootstrapCookie = await administratorCookie()
    await fetch('/api/admin/site-config', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie: bootstrapCookie },
      body: JSON.stringify({
        project_name: 'Token向云',
        site_title: 'Token向云指南',
        site_description: '会员、API 接入、模型试用与价格参考。',
        logo_path: url('/logo-80.png'),
        footer_text: '清晰接入，稳定调用。',
        main_site_url: upstreamOrigin,
        login_path: '/login',
        register_path: '/register',
        support_path: '/support',
        api_path: '/v1',
        support_wechat: '微信 kkflow520',
        support_group_url: 'https://www.kdocs.cn/l/csU8ZJybJe2V',
      }),
    })
  })
  it.each(['/', '/member', '/integration', '/install', '/playground', '/pricing', '/feedback', '/admin', '/admin/assets', '/admin/email', '/admin/installers', '/admin/homepage', '/admin/promotions'])('renders %s', async (path) => {
    const response = await fetch(path)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/html')
  })

  it('does not expose the removed compatibility prefixes', async () => {
    expect((await fetch('/guide/')).status).toBe(404)
    expect((await fetch('/guide-api/health')).status).toBe(404)
  })

  it('serves health, metadata and an anonymous session from the unified server', async () => {
    const health = await fetch('/api/health')
    expect(health.status).toBe(200)
    expect(await json(health)).toMatchObject({
      ok: true,
      data: { service: 'kkflow-guide', status: 'ok' },
    })

    const meta = await fetch('/api/meta')
    expect(await json(meta)).toMatchObject({
      ok: true,
      data: {
        service: 'kkflow-guide',
        project: 'Token向云',
        features: { playground: true, pricing: true, feedback: true },
      },
    })

    const session = await fetch('/api/session')
    expect(await json(session)).toMatchObject({
      ok: true,
      data: { authenticated: false, admin: false, user: null },
    })

    const siteConfig = await fetch('/api/site-config')
    expect(await json(siteConfig)).toMatchObject({
      ok: true,
      data: {
        project_name: 'Token向云',
        site_title: 'Token向云指南',
        main_site_url: upstreamOrigin,
        api_base_url: `${upstreamOrigin}/v1`,
      },
    })
  })

  it('serves the active static homepage and protects preview selection', async () => {
    const homepageWithoutSlash = await fetch('/site-home?ref=direct', { redirect: 'manual' })
    expect(homepageWithoutSlash.status).toBe(308)
    expect(homepageWithoutSlash.headers.get('location')).toBe('/site-home/?ref=direct')

    const favicon = await fetch('/favicon.ico', { redirect: 'manual' })
    expect(favicon.status).toBe(302)
    expect(favicon.headers.get('location')).toBe('/logo-80.png')

    const faviconImage = await fetch('/favicon.ico')
    expect(faviconImage.status).toBe(200)
    expect(faviconImage.headers.get('content-type')).toContain('image/png')
    expect((await faviconImage.arrayBuffer()).byteLength).toBeGreaterThan(1000)

    const homepage = await fetch('/site-home/')
    expect(homepage.status).toBe(200)
    expect(homepage.headers.get('content-type')).toContain('text/html')
    expect(homepage.headers.get('content-security-policy')).not.toContain('sandbox')
    expect(homepage.headers.get('content-security-policy')).toContain("frame-ancestors 'self'")
    expect(homepage.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
    expect(homepage.headers.get('cross-origin-resource-policy')).toBe('cross-origin')
    const homepageHtml = await homepage.text()
    expect(homepageHtml).toContain('自由')
    expect(homepageHtml).toContain(`href="${url('/logo-80.png')}"`)

    const asset = await fetch('/site-home/assets/logo-80.png')
    expect(asset.status).toBe(200)
    expect(asset.headers.get('content-type')).toBe('image/png')
    expect(asset.headers.get('cross-origin-resource-policy')).toBe('cross-origin')

    const previewCookie = await administratorCookie()
    const xiangyunPreview = await fetch('/site-home/?default=xiangyun', {
      headers: { cookie: previewCookie },
    })
    expect(xiangyunPreview.status).toBe(200)
    const xiangyunHtml = await xiangyunPreview.text()
    expect(xiangyunHtml).toContain(`href="${url('/logo-80.png')}"`)
    expect(xiangyunHtml).not.toContain('guide.kkflow.org/site-home/assets/logo-')

    const unauthorizedPreview = await fetch('/site-home/?default=xiangyun')
    expect(unauthorizedPreview.status).toBe(401)
  })

  it('allows an administrator to stage and publish a custom homepage', async () => {
    const cookie = await administratorCookie()
    const form = new FormData()
    form.append('manifest', JSON.stringify(['index.html', 'assets/logo.png']))
    form.append('files', new Blob(['<!doctype html><title>测试首页</title><h1>测试首页</h1><img src="/assets/logo.png">'], { type: 'text/html' }), 'index.html')
    form.append('files', new Blob(['test-logo'], { type: 'image/png' }), 'assets/logo.png')
    const upload = await fetch('/api/admin/homepage/upload', { method: 'POST', headers: { cookie }, body: form })
    expect(upload.status).toBe(200)
    expect((await json(upload)).data.has_index).toBe(true)

    const publish = await fetch('/api/admin/homepage/publish', { method: 'POST', headers: { cookie } })
    expect(publish.status).toBe(200)
    const homepage = await fetch('/site-home/')
    const homepageHtml = await homepage.text()
    expect(homepageHtml).toContain('测试首页')
    expect(homepageHtml).toContain('src="/site-home/assets/logo.png"')
    expect((await fetch('/site-home/assets/logo.png')).status).toBe(200)

    const restoreDefault = await fetch('/api/admin/homepage/apply', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ default_id: 'ziyou' }),
    })
    expect(restoreDefault.status).toBe(200)
  })

  it('creates direct promotion links and records public homepage visits without redirecting', async () => {
    const cookie = await administratorCookie()
    const create = await fetch('/api/admin/promotions', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        code: 'e2e-source',
        name: 'E2E 测试来源',
        target_url: 'https://aiziyou.org',
        utm_source: 'e2e',
        utm_medium: 'referral',
      }),
    })
    expect(create.status).toBe(200)
    const source = (await json(create)).data
    expect(source.link).toBe('https://aiziyou.org/?ref=e2e-source&utm_source=e2e&utm_medium=referral')

    const landing = await fetch('/site-home/?ref=e2e-source&utm_source=e2e&utm_medium=referral', {
      headers: {
        'x-public-homepage': '1',
        'x-original-uri': '/?ref=e2e-source&utm_source=e2e&utm_medium=referral',
        referer: 'https://ads.example/article',
        'user-agent': 'E2E Browser',
      },
    })
    expect(landing.status).toBe(200)
    expect(landing.headers.get('location')).toBeNull()

    const overview = await fetch('/api/admin/promotions', { headers: { cookie } })
    expect(overview.status).toBe(200)
    const result = (await json(overview)).data
    expect(result.summary.clicks).toBe(1)
    expect(result.sources.find((item: any) => item.id === source.id).clicks).toBe(1)
    expect(result.referrals).toEqual(expect.arrayContaining([
      expect.objectContaining({ host: 'ads.example', visits: 1 }),
    ]))

    const remove = await fetch(`/api/admin/promotions/${source.id}`, { method: 'DELETE', headers: { cookie } })
    expect(remove.status).toBe(200)
  })

  it('generates robots and sitemaps for both the guide and proxied main-site host', async () => {
    const guideRobots = await fetch('/robots.txt')
    expect(guideRobots.headers.get('content-type')).toContain('text/plain')
    expect(await guideRobots.text()).toContain(`Sitemap: ${url('/').replace(/\/$/, '')}/sitemap.xml`)

    const guideSitemap = await fetch('/sitemap.xml')
    expect(guideSitemap.headers.get('content-type')).toContain('application/xml')
    expect(await guideSitemap.text()).toContain('/integration</loc>')

    const mainHeaders = {
      'x-forwarded-host': new URL(upstreamOrigin).host,
      'x-forwarded-proto': 'http',
    }
    const mainRobots = await fetch('/robots.txt', { headers: mainHeaders })
    expect(await mainRobots.text()).toContain(`Sitemap: ${upstreamOrigin}/sitemap.xml`)
    const mainSitemap = await fetch('/sitemap.xml', { headers: mainHeaders })
    const mainXml = await mainSitemap.text()
    expect(mainXml).toContain(`<loc>${upstreamOrigin}/</loc>`)
    expect(mainXml).not.toContain('/integration</loc>')
  })

  it('sends the iframe and browser security policy without an X-Frame-Options conflict', async () => {
    const response = await fetch('/playground')
    expect(response.headers.get('content-security-policy')).toMatch(/frame-ancestors 'self' https?:\/\/127\.0\.0\.1:\d+/)
    expect(response.headers.get('content-security-policy')).toContain("connect-src 'self'")
    expect(response.headers.get('content-security-policy')).toContain("script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'")
    expect(response.headers.get('content-security-policy')).not.toContain("'unsafe-eval'")
    expect(response.headers.get('x-frame-options')).toBeNull()
    expect(response.headers.get('cross-origin-resource-policy')).toBe('same-site')
  })
})

describe('authentication and same-origin API protection', () => {
  it('rejects browser writes from an unrelated origin', async () => {
    const response = await fetch('/api/session/admin', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://attacker.example',
      },
      body: JSON.stringify({ token: adminToken }),
    })
    expect(response.status).toBe(403)
    expect(await json(response)).toMatchObject({
      error: true,
      statusCode: 403,
      data: { code: 'ORIGIN_NOT_ALLOWED' },
    })
  })

  it('keeps administrator authentication in an encrypted HttpOnly cookie', async () => {
    const invalid = await fetch('/api/session/admin', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'wrong-token' }),
    })
    expect(invalid.status).toBe(401)

    const login = await fetch('/api/session/admin', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: new URL(url('/')).origin.replace('http://', 'https://'),
        'x-forwarded-proto': 'https',
      },
      body: JSON.stringify({ token: adminToken }),
    })
    expect(login.status).toBe(200)
    const setCookie = login.headers.get('set-cookie') || ''
    expect(setCookie.toLowerCase()).toContain('httponly')
    expect(setCookie.toLowerCase()).toContain('secure')
    expect(setCookie.toLowerCase()).toContain('samesite=lax')
    const adminCookie = cookieFrom(login)

    const session = await fetch('/api/session', { headers: { cookie: adminCookie, 'x-forwarded-proto': 'https' } })
    expect(await json(session)).toMatchObject({ ok: true, data: { admin: true } })

    const pricingConfig = await fetch('/api/admin/pricing/config', { headers: { cookie: adminCookie, 'x-forwarded-proto': 'https' } })
    expect(pricingConfig.status).toBe(200)

    const logout = await fetch('/api/session/admin', {
      method: 'DELETE',
      headers: { cookie: adminCookie, 'x-forwarded-proto': 'https' },
    })
    expect(logout.status).toBe(200)
    const loggedOutCookie = cookieFrom(logout)
    const loggedOutSession = await fetch('/api/session', { headers: { cookie: loggedOutCookie, 'x-forwarded-proto': 'https' } })
    expect(await json(loggedOutSession)).toMatchObject({ ok: true, data: { admin: false } })
  })

  it('requires a member session for feedback and playground credentials', async () => {
    const feedback = await fetch('/api/feedback/quota')
    expect(feedback.status).toBe(401)
    expect(await json(feedback)).toMatchObject({
      error: true,
      statusCode: 401,
      data: { code: 'LOGIN_REQUIRED' },
    })

    const keys = await fetch('/api/playground/keys')
    expect(keys.status).toBe(401)
    expect(await json(keys)).toMatchObject({
      error: true,
      statusCode: 401,
      data: { code: 'LOGIN_REQUIRED' },
    })
  })

  it('validates the embedded JWT server-side and redirects to a token-free URL', async () => {
    const missing = await fetch('/auth/embed', { redirect: 'manual' })
    expect(missing.status).toBe(303)
    expect(missing.headers.get('location')).toBe('/auth/error?reason=missing')

    const invalid = await fetch('/auth/embed?token=invalid', { redirect: 'manual' })
    expect(invalid.status).toBe(303)
    expect(invalid.headers.get('location')).toBe('/auth/error?reason=invalid')

    const embedded = await fetch(`/auth/embed?token=${encodeURIComponent(jwt)}&redirect=/feedback&ui_mode=embedded`, {
      redirect: 'manual',
    })
    expect(embedded.status).toBe(303)
    expect(embedded.headers.get('location')).toBe('/feedback?embedded=1')
    expect(embedded.headers.get('location')).not.toContain('token')
    expect(embedded.headers.get('referrer-policy')).toBe('no-referrer')
    const memberCookie = cookieFrom(embedded)

    const session = await fetch('/api/session', { headers: { cookie: memberCookie } })
    expect(await json(session)).toMatchObject({
      ok: true,
      data: {
        authenticated: true,
        user: {
          id: '614',
          email: 'member@example.com',
          username: 'Integration Member',
        },
      },
    })
  })

  it('never returns a complete saved API key and proxies model requests server-side', async () => {
    const cookie = await memberCookie()
    const keys = await fetch('/api/playground/keys', { headers: { cookie } })
    expect(keys.status).toBe(200)
    const keysBody = await json(keys)
    expect(keysBody).toMatchObject({
      ok: true,
      data: [
        {
          id: 7,
          name: 'Integration key',
          masked_key: 'sk-save...7890',
          group: { id: 11, name: 'OpenAI', platform: 'openai' },
        },
        {
          id: 8,
          name: 'Claude integration key',
          masked_key: 'sk-ant-...7890',
          group: { id: 12, name: 'Anthropic', platform: 'anthropic' },
        },
      ],
    })
    expect(JSON.stringify(keysBody)).not.toContain(savedApiKey)
    expect(JSON.stringify(keysBody)).not.toContain(savedClaudeApiKey)

    const textResponse = await fetch('/api/playground/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        credential: { type: 'saved', id: 7 },
        request: { model: 'gpt-test', input: 'Hello from the integration test.' },
      }),
    })
    expect(textResponse.status).toBe(200)
    expect(textResponse.headers.get('content-type')).toContain('text/event-stream')
    const textEvents = await sseEvents(textResponse)
    expect(textEvents.filter(item => item.event === 'response.output_text.delta').map(item => JSON.parse(item.data).delta).join('')).toBe('Proxy response')
    expect(JSON.parse(textEvents.find(item => item.event === 'response.completed')!.data)).toMatchObject({
      response: { id: 'resp_test', model: 'gpt-test', output_text: 'Proxy response' },
    })
    expect(JSON.parse(textEvents.find(item => item.event === 'guide.done')!.data).duration_ms).toBeGreaterThanOrEqual(0)
    expect(upstreamRequests).toContainEqual(expect.objectContaining({
      path: '/v1/responses',
      authorization: `Bearer ${savedApiKey}`,
      body: { model: 'gpt-test', input: 'Hello from the integration test.', stream: true },
    }))

    const upstreamError = await fetch('/api/playground/responses', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        credential: { type: 'saved', id: 7 },
        request: { model: 'upstream-error', input: 'Do not expose the credential.' },
      }),
    })
    expect(upstreamError.status).toBe(401)
    const upstreamErrorText = await upstreamError.text()
    expect(upstreamErrorText).not.toContain(savedApiKey)
    expect(upstreamErrorText).toContain('[redacted]')

    const imageResponse = await fetch('/api/playground/images', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        credential: { type: 'custom', value: 'sk-custom-abcdef' },
        request: {
          model: 'gpt-image-2',
          prompt: 'A precise integration test image.',
          size: '1024x1024',
        },
      }),
    })
    expect(imageResponse.status).toBe(200)
    expect(await json(imageResponse)).toMatchObject({
      ok: true,
      data: { data: [{ url: 'https://images.example/generated.png' }] },
    })
    expect(upstreamRequests).toContainEqual(expect.objectContaining({
      path: '/v1/images/generations',
      authorization: 'Bearer sk-custom-abcdef',
    }))
  })

  it('supports the member feedback and administrator reply workflow', async () => {
    const userCookie = await memberCookie()
    const created = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: userCookie },
      body: JSON.stringify({
        category: 'api',
        title: 'Integration feedback',
        content: 'This feedback verifies the complete member and administrator workflow.',
        source: 'guide-test',
      }),
    })
    expect(created.status).toBe(200)
    const createdBody = await json(created)
    expect(createdBody.data.id).toMatch(/^fb_[a-f0-9]{16}$/)
    expect(createdBody.meta.quota.used).toBe(1)

    const history = await fetch('/api/feedback/me', { headers: { cookie: userCookie } })
    expect(await json(history)).toMatchObject({
      ok: true,
      data: [{ id: createdBody.data.id, title: 'Integration feedback', status: 'open' }],
    })

    const adminCookie = await administratorCookie()
    const list = await fetch('/api/admin/feedback?q=Integration%20feedback', { headers: { cookie: adminCookie } })
    expect(await json(list)).toMatchObject({
      ok: true,
      data: [{ public_id: createdBody.data.id, user_id: '614' }],
    })

    const updated = await fetch(`/api/admin/feedback/${createdBody.data.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', cookie: adminCookie },
      body: JSON.stringify({
        status: 'closed',
        admin_reply: 'The integration feedback has been handled.',
      }),
    })
    expect(updated.status).toBe(200)
    expect(await json(updated)).toMatchObject({
      ok: true,
      data: { status: 'closed', admin_reply: 'The integration feedback has been handled.' },
    })
  })

  it('persists administrator email settings without exposing the SMTP password', async () => {
    const cookie = await administratorCookie()
    const initial = await fetch('/api/admin/email-settings', { headers: { cookie } })
    expect(initial.status).toBe(200)
    const initialBody = await json(initial)
    const {
      smtp_password_configured: _passwordConfigured,
      smtp_password_masked: _passwordMasked,
      ...editable
    } = initialBody.data

    const updated = await fetch('/api/admin/email-settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        ...editable,
        enabled: false,
        smtp_host: 'smtp.example.com',
        smtp_port: 465,
        smtp_secure: true,
        smtp_username: 'notice@example.com',
        smtp_password: 'integration-smtp-secret',
        clear_smtp_password: false,
        from_name: 'Integration Guide',
        from_email: 'notice@example.com',
        admin_email: 'admin@example.com',
      }),
    })
    expect(updated.status).toBe(200)
    const updatedBody = await json(updated)
    expect(updatedBody.data).not.toHaveProperty('smtp_password')
    expect(updatedBody.data).toMatchObject({
      enabled: false,
      smtp_host: 'smtp.example.com',
      smtp_password_configured: true,
      smtp_password_masked: '********',
    })

    const cleared = await fetch('/api/admin/email-settings', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        ...editable,
        enabled: false,
        smtp_host: 'smtp.example.com',
        smtp_port: 465,
        smtp_secure: true,
        smtp_username: 'notice@example.com',
        smtp_password: null,
        clear_smtp_password: true,
        from_name: 'Integration Guide',
        from_email: 'notice@example.com',
        admin_email: 'admin@example.com',
      }),
    })
    expect(cleared.status).toBe(200)
    expect(await json(cleared)).toMatchObject({
      ok: true,
      data: { smtp_password_configured: false },
    })
  })
  it('persists administrator pricing model and group bulk updates', async () => {
    const cookie = await administratorCookie()
    const models = await fetch('/api/admin/pricing/models/bulk', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        items: [{
          provider: 'openai',
          model_name: 'integration-model',
          display_name: 'Integration Model',
          is_visible: true,
          sort_order: 9,
        }],
      }),
    })
    expect(models.status).toBe(200)

    const groups = await fetch('/api/admin/pricing/groups/bulk', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        items: [{
          provider: 'openai',
          source_id: 'integration-group',
          source_name: 'Integration Group',
          is_visible: true,
          recharge_pay_cny: 20,
          recharge_credit_usd: 100,
          sort_order: 9,
        }],
      }),
    })
    expect(groups.status).toBe(200)

    const config = await fetch('/api/admin/pricing/config', { headers: { cookie } })
    const configBody = await json(config)
    expect(configBody.data.models).toEqual(expect.arrayContaining([
      expect.objectContaining({ model_name: 'integration-model', display_name: 'Integration Model' }),
    ]))
    expect(configBody.data.groups).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source_id: 'integration-group',
        recharge_multiplier: 5,
      }),
    ]))
  })

  it('updates public branding and main-site routes from the administrator API', async () => {
    const cookie = await administratorCookie()
    const defaults = {
      project_name: 'Token向云',
      site_title: 'Token向云指南',
      site_description: '会员、API 接入、模型试用与价格参考。',
      logo_path: 'https://guide.aiziyou.org/logo-80.png',
      footer_text: '清晰接入，稳定调用。',
      main_site_url: upstreamOrigin,
      login_path: '/login',
      register_path: '/register',
      support_path: '/support',
      api_path: '/v1',
      support_wechat: '微信 kkflow520',
      support_group_url: 'https://www.kdocs.cn/l/csU8ZJybJe2V',
    }
    const custom = {
      ...defaults,
      project_name: '灵链',
      site_title: '灵链指南',
      site_description: '灵链开发者与会员接入中心。',
      logo_path: 'https://guide.kkflow.org/uploads/20260807071432-logo-80-0e8670142a.png',
      footer_text: '连接服务与开发者。',
      login_path: '/account/login',
      register_path: '/account/register',
      support_wechat: 'qq 2754632844',
      support_group_url: 'https://cdn.example/linglink-group-qr.png',
    }

    try {
      const updated = await fetch('/api/admin/site-config', {
        method: 'PUT',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify(custom),
      })
      expect(updated.status).toBe(200)
      expect(await json(updated)).toMatchObject({
        ok: true,
        data: {
          project_name: '灵链',
          site_title: '灵链指南',
          logo_path: 'https://guide.kkflow.org/uploads/20260807071432-logo-80-0e8670142a.png',
          support_wechat: 'QQ 2754632844',
          login_url: `${upstreamOrigin}/account/login`,
          api_base_url: `${upstreamOrigin}/v1`,
        },
      })

      const publicConfig = await fetch('/api/site-config')
      expect(await json(publicConfig)).toMatchObject({ ok: true, data: { project_name: '灵链' } })

      const guide = await fetch('/')
      const guideHtml = await guide.text()
      expect(guideHtml).toContain('灵链会员与 API 接入指南')
      expect(guideHtml).toContain('QQ 2754632844')
      expect(guideHtml).toContain('src="https://cdn.example/linglink-group-qr.png"')
      expect(guideHtml).not.toContain('href="https://cdn.example/linglink-group-qr.png"')
      expect(guideHtml).toContain('这里是群二维码图片。如果无法显示，请关闭网络代理。')

      const homepage = await fetch('/site-home/')
      const homepageHtml = await homepage.text()
      expect(homepageHtml).toContain(`src="${custom.logo_path}"`)
      expect(homepageHtml).not.toContain('src="/uploads/20260807071432-logo-80-0e8670142a.png"')

      const invalidLogo = await fetch('/api/admin/site-config', {
        method: 'PUT',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ ...custom, logo_path: '/logo-80.png' }),
      })
      expect(invalidLogo.status).toBe(400)
    } finally {
      await fetch('/api/admin/site-config', {
        method: 'PUT',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify(defaults),
      })
    }
  })

  it('uploads public site images from the administrator API', async () => {
    const cookie = await administratorCookie()
    const transparentPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/evp3FwAAAAASUVORK5CYII=',
      'base64',
    )
    const body = new FormData()
    body.append('file', new Blob([transparentPng], { type: 'image/png' }), 'logo test.png')

    const uploaded = await fetch('/api/admin/assets/upload', {
      method: 'POST',
      headers: { cookie },
      body,
    })
    expect(uploaded.status).toBe(200)
    const uploadedBody = await json(uploaded)
    expect(uploadedBody).toMatchObject({
      ok: true,
      data: {
        content_type: 'image/png',
        size: transparentPng.length,
      },
    })
    expect(uploadedBody.data.filename).toMatch(/\.png$/)
    expect(new URL(uploadedBody.data.url).origin).toBe(new URL(url('/')).origin)
    expect(new URL(uploadedBody.data.url).pathname).toMatch(/^\/uploads\//)

    const publicPath = new URL(uploadedBody.data.url).pathname
    const publicAsset = await fetch(publicPath)
    expect(publicAsset.status).toBe(200)
    expect(publicAsset.headers.get('content-type')).toContain('image/png')
    expect(Buffer.from(await publicAsset.arrayBuffer())).toEqual(transparentPng)

    const list = await fetch('/api/admin/assets', { headers: { cookie } })
    expect(list.status).toBe(200)
    const listBody = await json(list)
    expect(listBody).toMatchObject({
      ok: true,
      data: [expect.objectContaining({
        filename: uploadedBody.data.filename,
        url: uploadedBody.data.url,
      })],
    })

    const proxyHeaders = {
      'x-forwarded-host': 'guide.example.com',
      'x-forwarded-proto': 'https',
    }
    const proxiedCookie = await administratorCookie(proxyHeaders)
    const proxiedList = await fetch('/api/admin/assets', {
      headers: {
        cookie: proxiedCookie,
        ...proxyHeaders,
      },
    })
    expect(proxiedList.status).toBe(200)
    expect((await json(proxiedList)).data[0].url).toBe(`https://guide.example.com${publicPath}`)

    const invalidBody = new FormData()
    invalidBody.append('file', new Blob([Buffer.from('not an image')], { type: 'image/png' }), 'fake.png')
    const invalidUpload = await fetch('/api/admin/assets/upload', {
      method: 'POST',
      headers: { cookie },
      body: invalidBody,
    })
    expect(invalidUpload.status).toBe(400)

    const deleted = await fetch(`/api/admin/assets/${uploadedBody.data.filename}`, {
      method: 'DELETE',
      headers: { cookie },
    })
    expect(deleted.status).toBe(200)
    expect((await fetch(publicPath)).status).toBe(404)
  })

  it('serves classified installer scripts and generates a command from the selected member key', async () => {
    const config = await fetch('/api/install/config')
    expect(config.status).toBe(200)
    expect(await json(config)).toMatchObject({
      ok: true,
      data: {
        settings: {
          provider_id: 'custom',
          base_url: upstreamOrigin,
          codex_enabled: true,
          claude_enabled: true,
        },
        scripts: [
          { id: 'codex-windows', platform: 'windows' },
          { id: 'codex-macos', platform: 'macos' },
          { id: 'codex-linux', platform: 'linux' },
          { id: 'claude-windows', platform: 'windows' },
          { id: 'claude-macos', platform: 'macos' },
          { id: 'claude-linux', platform: 'linux' },
        ],
      },
    })

    const downloaded = await fetch('/api/install/scripts/codex/windows')
    expect(downloaded.status).toBe(200)
    expect(downloaded.headers.get('content-disposition')).toContain('setup.ps1')
    expect(downloaded.headers.get('x-content-sha256')).toMatch(/^[A-F0-9]{64}$/)
    const downloadedBytes = new Uint8Array(await downloaded.arrayBuffer())
    expect(Array.from(downloadedBytes.subarray(0, 3))).toEqual([0xEF, 0xBB, 0xBF])
    const downloadedBody = new TextDecoder().decode(downloadedBytes)
    expect(downloadedBody).toContain('$ProviderId = "custom"')
    expect(downloadedBody).toContain(`if ([string]::IsNullOrWhiteSpace($BaseUrl)) { $BaseUrl = "${upstreamOrigin}" }`)
    expect(downloadedBody).toContain('requires_openai_auth = true')
    expect(downloadedBody).toContain('$authData["OPENAI_API_KEY"] = $ApiKey')
    expect(downloadedBody).not.toContain('http_headers = { Authorization')

    const windowsSetup = await fetch('/setup.ps1')
    expect(windowsSetup.status).toBe(200)
    expect(windowsSetup.headers.get('content-disposition')).toContain('setup.ps1')
    const windowsSetupBytes = new Uint8Array(await windowsSetup.arrayBuffer())
    expect(Array.from(windowsSetupBytes.subarray(0, 3))).toEqual([0xEF, 0xBB, 0xBF])
    expect(new TextDecoder().decode(windowsSetupBytes)).toContain('$ProviderId = "custom"')

    const claudeWindowsSetup = await fetch('/api/install/scripts/claude/windows')
    expect(claudeWindowsSetup.status).toBe(200)
    const claudeWindowsSetupBytes = new Uint8Array(await claudeWindowsSetup.arrayBuffer())
    expect(Array.from(claudeWindowsSetupBytes.subarray(0, 3))).toEqual([0xEF, 0xBB, 0xBF])
    expect(new TextDecoder().decode(claudeWindowsSetupBytes)).toContain('Claude Code 一键安装与中转站配置')

    const shellSetup = await fetch('/setup.sh')
    expect(shellSetup.status).toBe(200)
    expect(shellSetup.headers.get('content-disposition')).toContain('setup.sh')
    const shellSetupBody = await shellSetup.text()
    expect(shellSetupBody).toContain(`BASE_URL="\${CODEX_BASE_URL:-${upstreamOrigin}}"`)
    expect(shellSetupBody).not.toContain('\r')

    expect((await fetch('/api/install/keys?tool=codex')).status).toBe(401)
    const cookie = await memberCookie()
    const codexKeys = await fetch('/api/install/keys?tool=codex', { headers: { cookie } })
    expect(await json(codexKeys)).toMatchObject({ ok: true, data: [{ id: 7, masked_key: 'sk-save...7890' }] })
    const claudeKeys = await fetch('/api/install/keys?tool=claude', { headers: { cookie } })
    expect(await json(claudeKeys)).toMatchObject({ ok: true, data: [{ id: 8, masked_key: 'sk-ant-...7890' }] })

    const generated = await fetch('/api/install/command', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ tool: 'codex', platform: 'windows', key_id: 7 }),
    })
    expect(generated.status).toBe(200)
    const generatedBody = await json(generated)
    expect(generatedBody.data).toMatchObject({
      filename: 'setup.ps1',
      download_url: expect.stringMatching(/\/setup\.ps1$/),
      remote: [{ label: 'Windows PowerShell 5.1 / 7+' }],
    })
    const windowsCommand = generatedBody.data.remote[0].command
    expect(windowsCommand).toContain(savedApiKey)
    expect(windowsCommand).toContain(`$env:CODEX_BASE_URL='${upstreamOrigin}'`)
    expect(windowsCommand).toMatch(/\$installerSource=irm '.*\/setup\.ps1';iex \$installerSource\.TrimStart\(\[char\]0xFEFF\)/)
    expect(windowsCommand).not.toContain('| iex')
    expect(windowsCommand).not.toContain('EncodedCommand')

    const generatedClaude = await fetch('/api/install/command', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ tool: 'claude', platform: 'windows', key_id: 8 }),
    })
    expect(generatedClaude.status).toBe(200)
    const generatedClaudeBody = await json(generatedClaude)
    expect(generatedClaudeBody.data).toMatchObject({
      filename: 'setup-claude-windows.ps1',
      download_url: expect.stringMatching(/\/api\/install\/scripts\/claude\/windows$/),
    })
    const claudeWindowsCommand = generatedClaudeBody.data.remote[0].command
    expect(claudeWindowsCommand).toContain(savedClaudeApiKey)
    expect(claudeWindowsCommand).toContain('$env:CLAUDE_API_KEY=')
    expect(claudeWindowsCommand).toMatch(/\$installerSource=irm '.*\/api\/install\/scripts\/claude\/windows';iex \$installerSource\.TrimStart\(\[char\]0xFEFF\)/)
    expect(claudeWindowsCommand).not.toContain('| iex')

    const generatedShell = await fetch('/api/install/command', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ tool: 'codex', platform: 'linux', key_id: 7 }),
    })
    const shellBody = await json(generatedShell)
    expect(shellBody.data.filename).toBe('setup.sh')
    expect(shellBody.data.remote[0].command).toContain(`CODEX_BASE_URL='${upstreamOrigin}'`)
    expect(shellBody.data.remote[0].command).toMatch(/curl -fsSL '.*\/setup\.sh' \| bash/)
  })
})
