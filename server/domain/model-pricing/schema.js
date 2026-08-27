import { z } from 'zod'

const optionalPrice = z.preprocess(
  value => value === '' ? null : value,
  z.coerce.number().min(0).max(1_000_000).nullable().optional(),
)
const optionalMultiplier = z.preprocess(
  value => value === '' ? null : value,
  z.coerce.number().gt(0).max(10_000).nullable().optional(),
)

export const upsertGroupModelPricingSchema = z.object({
  group_id: z.coerce.string().trim().min(1).max(100),
  model_name: z.string().trim().min(1).max(200),
  is_enabled: z.boolean().optional().default(true),
  is_visible: z.boolean().optional().default(true),
  multiplier: optionalMultiplier,
  input_usd_per_million: optionalPrice,
  output_usd_per_million: optionalPrice,
  cache_read_usd_per_million: optionalPrice,
  cache_write_usd_per_million: optionalPrice,
  image_price_1k: optionalPrice,
  image_price_2k: optionalPrice,
  image_price_4k: optionalPrice,
  official_input_usd_per_million: optionalPrice,
  official_output_usd_per_million: optionalPrice,
  official_cache_read_usd_per_million: optionalPrice,
  official_cache_write_usd_per_million: optionalPrice,
  official_image_price_1k: optionalPrice,
  official_image_price_2k: optionalPrice,
  official_image_price_4k: optionalPrice,
  official_price_unit: z.enum(['usd', 'rmb']).optional().default('usd'),
  note: z.string().trim().max(1000).optional().nullable(),
})

export const upsertGroupModelPricingBatchSchema = z.object({
  items: z.array(upsertGroupModelPricingSchema).min(1).max(1000),
})

export const updateModelPricingOrderSchema = z.object({
  items: z.array(z.object({
    scope: z.enum(['vendor', 'group', 'model']),
    parent_key: z.string().trim().max(300).default(''),
    item_key: z.string().trim().min(1).max(300),
    sort_order: z.coerce.number().int().min(0).max(1_000_000),
  })).min(1).max(2000),
})

export const updateModelPricingGroupSchema = z.object({
  group_id: z.coerce.string().trim().min(1).max(100),
  display_name: z.string().trim().max(200).nullable().optional(),
})
