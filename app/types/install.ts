export type InstallerTool = 'codex' | 'claude'
export type InstallerPlatform = 'windows' | 'macos' | 'linux'

export interface InstallerGroupModel {
  tool: InstallerTool
  group_id: string
  model: string
}

export interface InstallerSettings {
  provider_id: string
  base_url: string
  codex_default_model: string
  claude_default_model: string
  codex_enabled: boolean
  claude_enabled: boolean
  group_models: InstallerGroupModel[]
}

export interface InstallerScriptSummary {
  id: string
  tool: InstallerTool
  platform: InstallerPlatform
  label?: string
  filename: string
  checksum: string
  source?: 'default' | 'published' | 'draft'
  has_draft?: boolean
  has_override?: boolean
  updated_at?: string | null
}

export interface InstallerConfig {
  settings: InstallerSettings
  scripts: InstallerScriptSummary[]
}

export interface InstallerCommandItem {
  label: string
  command: string
}

export interface InstallerCommands {
  remote: InstallerCommandItem[]
  local: InstallerCommandItem[]
  download_url: string
  filename: string
  checksum: string
  model: string
}

export interface InstallerScriptVersion {
  version_id: number
  content: string
  source: 'default' | 'published' | 'draft'
  action: string
  created_at: string
}

export interface InstallerScriptDetail extends InstallerScriptSummary {
  label: string
  content: string
  default_content: string
  published_content: string | null
  published_at: string | null
  draft_updated_at: string | null
  history: InstallerScriptVersion[]
}
