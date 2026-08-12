export function createSub2apiClient(config, logger) {
  const configured = Boolean(config.sub2apiApiBase && config.sub2apiAdminApiKey)

  async function request(path, params = {}) {
    if (!configured) {
      throw new Error('sub2api admin source is not configured.')
    }

    const url = new URL(`${config.sub2apiApiBase}${path}`)
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value))
      }
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), config.pricingFetchTimeoutMs)
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          accept: 'application/json',
          'x-api-key': config.sub2apiAdminApiKey,
        },
        signal: controller.signal,
      })

      const text = await response.text()
      const body = text ? JSON.parse(text) : null
      if (!response.ok) {
        throw new Error(`sub2api ${response.status}: ${extractMessage(body) || response.statusText}`)
      }
      return unwrapSub2apiResponse(body)
    } finally {
      clearTimeout(timeout)
    }
  }

  return {
    configured,

    async listGroups() {
      return request('/admin/groups/all')
    },

    async listSubscriptionPlans() {
      return request('/admin/payment/plans')
    },

    async listModelNames(provider) {
      const data = await request('/admin/channels/pricing/sync-models', { platform: provider })
      return Array.isArray(data?.models) ? data.models : []
    },

    async listAccountModelAccess(provider) {
      const accounts = []
      let page = 1
      let pages = 1

      do {
        const data = await request('/admin/accounts', {
          platform: provider,
          status: 'active',
          page,
          page_size: 1000,
        })
        const items = Array.isArray(data?.items) ? data.items : []
        for (const account of items) {
          if (account?.schedulable === false) continue
          const groupIds = accountGroupIds(account)
          if (!groupIds.length) continue
          accounts.push({
            group_ids: groupIds,
            model_patterns: modelMappingPatterns(account?.credentials?.model_mapping),
          })
        }
        pages = positiveInteger(data?.pages, 1)
        page += 1
      } while (page <= pages)

      return accounts
    },

    async getModelPricing(model) {
      try {
        return await request('/admin/channels/model-pricing', { model })
      } catch (error) {
        logger?.warn({ model, err: error }, 'failed to fetch sub2api model pricing')
        return { found: false }
      }
    },
  }
}

function accountGroupIds(account) {
  const direct = Array.isArray(account?.group_ids) ? account.group_ids : []
  const bindings = Array.isArray(account?.account_groups)
    ? account.account_groups.map((binding) => binding?.group_id)
    : []
  return Array.from(new Set([...direct, ...bindings]
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)))
}

function modelMappingPatterns(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  return Array.from(new Set(Object.keys(value)
    .map((name) => String(name || '').trim())
    .filter(Boolean)))
}

function positiveInteger(value, fallback) {
  const number = Number(value)
  return Number.isInteger(number) && number > 0 ? number : fallback
}

function unwrapSub2apiResponse(body) {
  if (body && typeof body === 'object') {
    if ('code' in body) {
      if (body.code === 0) return body.data
      throw new Error(extractMessage(body) || `sub2api code ${body.code}`)
    }
    if (body.ok === true && 'data' in body) return body.data
  }
  return body
}

function extractMessage(body) {
  if (!body || typeof body !== 'object') return ''
  return body.message || body.error?.message || body.detail || body.error || ''
}
