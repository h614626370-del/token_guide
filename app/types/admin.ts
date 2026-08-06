export interface ModelSetting {
  id?: number
  provider: string
  model_name: string
  display_name: string | null
  is_visible: boolean
  is_featured: boolean
  sort_order: number
  note: string | null
}

export interface GroupSetting {
  id?: number
  provider: string
  source_id: string
  source_name: string | null
  display_name: string | null
  is_visible: boolean | null
  recharge_multiplier: number
  recharge_pay_cny?: number | null
  recharge_credit_usd?: number | null
  sort_order: number
  note: string | null
}

export interface RuntimeSettings {
  sub2api_base_url: string
  sub2api_admin_api_key_configured: boolean
  sub2api_admin_api_key_masked: string
  pricing_platforms: string[]
  provider_display_order: string[]
  usd_to_cny: number
}

export interface AdminPricingConfig {
  models: ModelSetting[]
  groups: GroupSetting[]
  settings: RuntimeSettings
  source: { configured: boolean, platforms: string[], sub2api_api_base: string | null }
}

export interface SourceGroup {
  provider: string
  provider_label: string
  source_id: string
  source_name: string
  description: string
  is_exclusive: boolean
  rate_multiplier: number
  recharge_reference?: { source: string, plan_name?: string | null, pay_cny: number, credit_usd: number } | null
  sort_order: number
}

export interface AdminPricingSource {
  source: { configured: boolean, platforms: string[], sub2api_api_base: string | null }
  groups: SourceGroup[]
  models_by_provider: Record<string, string[]>
  warnings: string[]
  fetched_at: string
}

export interface ModelDraft extends ModelSetting {
  key: string
  display_name: string
  note: string
  source_available: boolean
}

export interface GroupDraft extends Omit<GroupSetting, 'display_name' | 'note' | 'is_visible'> {
  key: string
  display_name: string
  note: string
  is_visible: boolean
  source_available: boolean
  provider_label: string
  rate_multiplier: number
  recharge_pay_cny: number | null
  recharge_credit_usd: number | null
}

export interface AdminEmailSettings {
  enabled: boolean
  smtp_host: string
  smtp_port: number
  smtp_secure: boolean
  smtp_username: string
  from_name: string
  from_email: string
  admin_email: string
  admin_subject_template: string
  admin_body_template: string
  reply_subject_template: string
  reply_body_template: string
  smtp_password_configured: boolean
  smtp_password_masked: string
}

export interface AdminEmailSettingsDraft extends AdminEmailSettings {
  smtp_password: string
  clear_smtp_password: boolean
}