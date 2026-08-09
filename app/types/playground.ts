export interface PlaygroundKey {
  id: number
  name: string
  status: string
  masked_key: string
  group_id: number | null
  group: {
    id: number | null
    name: string
    platform: string
    model_policy?: {
      mode: 'allowlist' | 'unrestricted' | 'unknown'
      models: string[]
    } | null
  } | null
}

export type PlaygroundCredential =
  | { type: 'saved', id: number }
  | { type: 'custom', value: string }
