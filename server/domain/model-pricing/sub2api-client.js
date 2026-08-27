export function createModelPricingSub2apiClient(config, logger) {
  const configured = Boolean(config.sub2apiApiBase && config.sub2apiAdminApiKey)

  async function request(path, params = {}) {
    if (!configured) throw new Error('sub2api model pricing source is not configured.')
    const url = new URL(`${config.sub2apiApiBase}${path}`)
    for (const [key, value] of Object.entries(params)) {
      if (value != null && value !== '') url.searchParams.set(key, String(value))
    }
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), config.pricingFetchTimeoutMs)
    try {
      const response = await fetch(url, {
        headers: { accept: 'application/json', 'x-api-key': config.sub2apiAdminApiKey },
        signal: controller.signal,
      })
      const body = await response.json()
      if (!response.ok) throw new Error(`sub2api ${response.status}: ${messageOf(body) || response.statusText}`)
      return unwrap(body)
    } finally {
      clearTimeout(timeout)
    }
  }

  return {
    configured,
    listGroups: () => request('/admin/groups/all'),
    listSubscriptionPlans: () => request('/admin/payment/plans'),
    async listGroupModelsListCandidates(groupId, platform) {
      const result = await request(`/admin/groups/${encodeURIComponent(String(groupId))}/models-list-candidates`, { platform })
      return Array.isArray(result?.models) ? result.models : Array.isArray(result) ? result : []
    },
    async listChannels() {
      const channels = []
      let page = 1
      let pages = 1
      do {
        const result = await request('/admin/channels', {
          page,
          page_size: 1000,
          status: 'active',
          sort_by: 'id',
          sort_order: 'asc',
        })
        channels.push(...(Array.isArray(result?.items) ? result.items : []))
        pages = Math.max(1, Number(result?.pages) || 1)
        page += 1
      } while (page <= pages)
      return channels
    },
    async getModelPricing(model) {
      try {
        return await request('/admin/channels/model-pricing', { model })
      } catch (error) {
        logger?.warn?.({ model, err: error }, 'failed to fetch model pricing')
        return { found: false }
      }
    },
  }
}

function unwrap(body) {
  if (body && typeof body === 'object') {
    if ('code' in body) {
      if (body.code === 0) return body.data
      throw new Error(messageOf(body) || `sub2api code ${body.code}`)
    }
    if (body.ok === true && 'data' in body) return body.data
  }
  return body
}

function messageOf(body) {
  if (!body || typeof body !== 'object') return ''
  return body.message || body.error?.message || body.detail || body.error || ''
}
