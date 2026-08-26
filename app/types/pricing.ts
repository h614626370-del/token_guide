export interface ImagePriceTiers {
  '1k': number | null
  '2k': number | null
  '4k': number | null
}

export interface PricingSource {
  configured: boolean
  status: 'live' | 'partial' | 'unconfigured'
  fetched_at: string
  warnings: string[]
  snapshot_available?: boolean
}

export interface PricingModel {
  provider: string
  provider_label: string
  provider_short: string
  model_name: string
  display_name: string
  billing_mode: string
  capabilities?: { image_generation?: boolean }
  is_featured: boolean
  sort_order: number
  note: string
  group_ids?: string[] | null
  prices: {
    input_usd_per_million: number | null
    output_usd_per_million: number | null
    cache_write_usd_per_million: number | null
    cache_read_usd_per_million: number | null
    image_output_usd_per_million: number | null
    per_request_usd: number | null
    output_cost_per_image_usd?: number | null
    default_image_prices_usd?: ImagePriceTiers
  }
}

export interface PricingGroup {
  provider: string
  provider_label: string
  provider_short: string
  source_id: string
  name: string
  display_name: string
  description?: string
  model_list_enabled?: boolean
  model_names?: string[]
  is_exclusive: boolean
  rate_multiplier: number
  recharge_multiplier: number
  recharge_pay_cny?: number
  recharge_credit_usd?: number
  equivalent_multiplier: number
  effective_rate: number
  allow_image_generation?: boolean
  image_rate_independent?: boolean
  image_rate_multiplier?: number
  image_effective_rate?: number
  image_prices_usd?: ImagePriceTiers
  default_image_prices_usd?: ImagePriceTiers
  has_image_prices?: boolean
  sort_order: number
  note: string
}

export interface PricingReference {
  source: PricingSource
  exchange: { usd_to_cny: number }
  display?: { provider_order?: string[] }
  models: PricingModel[]
  groups: PricingGroup[]
}
