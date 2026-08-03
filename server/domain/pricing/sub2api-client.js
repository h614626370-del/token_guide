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
