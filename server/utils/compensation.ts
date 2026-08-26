import type { H3Event } from 'h3'
import { createCompensationService } from '../domain/compensation/service.js'
import { getGuideConfig } from './config'
import { useGuideDatabase } from './database'
import { usePricingService } from './pricing'

type CompensationService = ReturnType<typeof createCompensationService>

export function useCompensationService(event?: H3Event) {
  return createCompensationService({
    db: useGuideDatabase(),
    config: getGuideConfig(event),
    sub2api: usePricingService().getSub2apiClient(),
    logger: console,
  }) as CompensationService
}
