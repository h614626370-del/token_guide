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
  } | null
}

export type PlaygroundCredential =
  | { type: 'saved', id: number }
  | { type: 'custom', value: string }
