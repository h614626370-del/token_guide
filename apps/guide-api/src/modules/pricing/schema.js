import { z } from 'zod'

export const providers = ['openai', 'anthropic', 'gemini', 'antigravity', 'grok']

export const providerSchema = z.enum(providers)

const optionalText = z.string().trim().max(200).optional().nullable()

export const upsertModelSettingSchema = z.object({
  provider: providerSchema,
  model_name: z.string().trim().min(1).max(200),
  display_name: optionalText,
  is_visible: z.boolean().optional(),
  is_featured: z.boolean().optional(),
  sort_order: z.coerce.number().int().min(0).max(100000).optional(),
  note: z.string().trim().max(1000).optional().nullable(),
})

export const upsertModelSettingsSchema = z.object({
  items: z.array(upsertModelSettingSchema).min(1).max(1000),
})

export const upsertGroupSettingSchema = z.object({
  provider: providerSchema,
  source_id: z.string().trim().min(1).max(80),
  source_name: z.string().trim().max(200).optional().nullable(),
  display_name: optionalText,
  is_visible: z.boolean().optional().nullable(),
  recharge_multiplier: z.coerce.number().positive().max(100).optional(),
  recharge_pay_cny: z.coerce.number().positive().max(100000).optional().nullable(),
  recharge_credit_usd: z.coerce.number().positive().max(1000000).optional().nullable(),
  sort_order: z.coerce.number().int().min(0).max(100000).optional(),
  note: z.string().trim().max(1000).optional().nullable(),
})

export const upsertGroupSettingsSchema = z.object({
  items: z.array(upsertGroupSettingSchema).min(1).max(1000),
})

export const listSourceQuerySchema = z.object({
  refresh: z.coerce.boolean().default(false),
})

export const updateRuntimeSettingsSchema = z.object({
  sub2api_base_url: z.string().trim().max(500).optional().nullable(),
  sub2api_admin_api_key: z.string().trim().max(500).optional().nullable(),
  clear_sub2api_admin_api_key: z.boolean().optional(),
  pricing_platforms: z.array(providerSchema).min(1).max(providers.length).optional(),
  provider_display_order: z.array(providerSchema).max(providers.length).optional(),
  usd_to_cny: z.coerce.number().positive().max(100).optional(),
})
