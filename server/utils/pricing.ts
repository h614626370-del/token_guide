import { createPricingService } from '../domain/pricing/service.js'
import { getGuideConfig } from './config'
import { useGuideDatabase } from './database'

type PricingService = ReturnType<typeof createPricingService>

declare global {
  // eslint-disable-next-line no-var
  var __kkflowPricingService: PricingService | undefined
}

export function usePricingService() {
  if (!globalThis.__kkflowPricingService) {
    globalThis.__kkflowPricingService = createPricingService({
      db: useGuideDatabase(),
      config: getGuideConfig(),
      logger: console,
    })
  }
  return globalThis.__kkflowPricingService
}
