export type GameCategory = 'board' | 'arcade' | 'puzzle' | 'training' | 'adventure'
export type GameStatus = 'draft' | 'published' | 'archived'

export interface GameItem {
  id: number
  slug: string
  category: GameCategory
  name: string
  summary: string
  description_md: string
  cover_url: string | null
  official_url: string
  play_path: string
  license: string
  author: string
  tags: string[]
  compatibility: string | null
  status: GameStatus
  is_featured: boolean
  sort_order: number
  online_count: number
  created_at: string
  updated_at: string
  published_at: string | null
}

export interface GameCounts {
  all: number
  board: number
  arcade: number
  puzzle: number
  training: number
  adventure: number
}
