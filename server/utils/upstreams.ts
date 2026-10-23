import { createUpstreamService } from '../domain/upstreams/service'
import { getGuideConfig } from './config'
import { useGuideDatabase } from './database'
import { sendUpstreamBalanceAlert } from './email'
import { usePricingService } from './pricing'

export function useUpstreamService() {
  return createUpstreamService({
    db: useGuideDatabase(),
    getClient: () => usePricingService().getSub2apiClient(),
    sendAlert: sendUpstreamBalanceAlert,
    timeoutMs: getGuideConfig().pricingFetchTimeoutMs,
  })
}

export function startUpstreamMonitoring() {
  let closed = false
  let pending: Promise<void> | undefined
  let timer: ReturnType<typeof setTimeout>
  const run = () => {
    pending = Promise.resolve().then(() => useUpstreamService().checkDue()).catch(() => {
      console.error('[upstreams] scheduled balance check failed')
    }).finally(() => {
      if (!closed) { timer = setTimeout(run, 30_000); timer.unref() }
    })
  }
  timer = setTimeout(run, 5000)
  timer.unref()
  return async () => {
    closed = true
    clearTimeout(timer)
    await pending
  }
}
