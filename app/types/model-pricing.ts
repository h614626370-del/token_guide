export interface ModelPriceValues {
  input_usd_per_million: number | null
  output_usd_per_million: number | null
  cache_read_usd_per_million: number | null
  cache_write_usd_per_million: number | null
}

export interface ModelPricingTimePeriod {
  start_time: string
  end_time: string
  multiplier: number
  effective_prices: ModelPriceValues
  image_prices: ModelImagePriceTier[]
  discount_ratio: number | null
}

export interface ModelImagePriceTier {
  label: string
  base_price_usd_per_image: number
  effective_price_cny_per_image: number
  discount_ratio: number | null
}

export interface ModelImageSourcePriceTier {
  label: string
  price: number
}

export interface ModelPricingTimeSchedule {
  timezone: string
  weekdays_only: boolean
  periods: ModelPricingTimePeriod[]
}

export interface GroupModelPrice {
  id: string
  model_name: string
  display_name: string
  vendor: string
  source_order: number
  sort_order: number
  is_visible: boolean
  billing_mode: 'token' | 'image' | 'per_request'
  source_multiplier: number
  group_effective_multiplier: number
  image_rate_independent: boolean
  image_rate_multiplier: number
  image_effective_multiplier: number
  manual_multiplier: number | null
  subscription_multiplier: number | null
  effective_multiplier: number
  multiplier_source: 'source' | 'manual'
  override_enabled: boolean
  official_prices: ModelPriceValues
  group_prices: ModelPriceValues
  channel_prices: ModelPriceValues
  manual_prices: ModelPriceValues
  manual_image_prices: ModelImageSourcePriceTier[]
  manual_official_prices: ModelPriceValues
  manual_official_image_prices: ModelImageSourcePriceTier[]
  official_price_unit: 'usd' | 'rmb'
  official_display_prices: ModelPriceValues
  official_display_image_prices: ModelImageSourcePriceTier[]
  official_price_source: 'base' | 'manual'
  upstream_base_prices: ModelPriceValues
  upstream_image_prices: ModelImageSourcePriceTier[]
  base_prices: ModelPriceValues
  upstream_price_source: 'official' | 'channel' | 'group'
  base_price_source: 'official' | 'channel' | 'group' | 'manual'
  effective_prices: ModelPriceValues
  image_prices: ModelImagePriceTier[]
  discount_ratio: number | null
  time_pricing: ModelPricingTimeSchedule | null
  pricing_found: boolean
  note: string
}

export interface ModelPricingGroup {
  id: string
  name: string
  source_name: string
  display_name: string | null
  platform: string
  description: string
  source_multiplier: number
  effective_multiplier: number
  subscription_type: string
  subscription_multiplier: number | null
  subscription_plan: ModelPricingSubscriptionPlan | null
  image_rate_independent: boolean
  image_rate_multiplier: number
  channel_id: string | null
  channel_name: string | null
  sort_order: number
  models: GroupModelPrice[]
}

export interface ModelPricingSubscriptionPlan {
  id: string
  group_id: string
  name: string
  price: number
  original_price: number | null
  currency: string
  monthly_quota_usd: number | null
  validity_days: number
  for_sale: boolean
  sort_order: number
  multiplier: number | null
}

export interface ModelPricingVendor {
  id: string
  name: string
  short: string
  logo_url: string | null
  model_count: number
  sort_order: number
  groups: ModelPricingGroup[]
}

export interface ModelPricingCatalog {
  source: {
    status: 'live' | 'cached' | 'unconfigured' | 'error'
    configured: boolean
    fetched_at: string | null
    warnings: string[]
  }
  exchange: { usd_to_cny: number }
  summary: { vendors: number, groups: number, models: number }
  vendors: ModelPricingVendor[]
}

export interface GroupModelPricingOverride {
  group_id: string
  model_name: string
  is_enabled: boolean
  is_visible: boolean
  multiplier: number | null
  input_usd_per_million: number | null
  output_usd_per_million: number | null
  cache_read_usd_per_million: number | null
  cache_write_usd_per_million: number | null
  image_price_1k: number | null
  image_price_2k: number | null
  image_price_4k: number | null
  official_input_usd_per_million: number | null
  official_output_usd_per_million: number | null
  official_cache_read_usd_per_million: number | null
  official_cache_write_usd_per_million: number | null
  official_image_price_1k: number | null
  official_image_price_2k: number | null
  official_image_price_4k: number | null
  official_price_unit: 'usd' | 'rmb'
  note: string | null
}

export interface ModelPricingGroupSetting {
  group_id: string
  display_name: string | null
}

export interface ModelPricingDisplayOrderItem {
  scope: 'vendor' | 'group' | 'model'
  parent_key: string
  item_key: string
  sort_order: number
}
