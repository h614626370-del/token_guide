import { createModelPricingService } from '../domain/model-pricing/service.js'
import { getGuideConfig } from './config'
import { useGuideDatabase } from './database'

type ModelPricingService = ReturnType<typeof createModelPricingService>

declare global {
  // eslint-disable-next-line no-var
  var __guideModelPricingService: ModelPricingService | undefined
}

export function useModelPricingService() {
  if (!globalThis.__guideModelPricingService) {
    globalThis.__guideModelPricingService = createModelPricingService({
      db: useGuideDatabase(),
      config: getGuideConfig(),
      logger: console,
    })
  }
  return globalThis.__guideModelPricingService
}
