export interface UpstreamMonitor {
  id: number
  name: string
  source: 'manual' | 'main_site'
  account_id: number | null
  base_url: string
  resolved_base_url: string
  api_key_configured: boolean
  enabled: boolean
  low_balance_enabled: boolean
  low_balance_threshold: number
  exhausted_enabled: boolean
  check_interval_minutes: number
  balance: number | null
  balance_unit: string
  last_checked_at: string | null
  last_check_status: string
  last_error: string | null
  last_alert_kind: string | null
  last_alert_at: string | null
  notification_status: string | null
}

export interface MainSiteUpstreamAccount {
  id: number
  name: string
  platform: string
  status: string
  base_url: string
}
