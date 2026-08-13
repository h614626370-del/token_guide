export type CommunityCategory = 'tools' | 'skills' | 'mcp'
export type CommunityStatus = 'draft' | 'published' | 'archived'

export interface CommunityItem {
  id: number
  slug: string
  category: CommunityCategory
  name: string
  summary: string
  icon_url: string | null
  official_url: string
  tags: string[]
  compatibility: string | null
  status: CommunityStatus
  is_featured: boolean
  sort_order: number
  like_count: number
  liked: boolean
  created_at: string
  updated_at: string
  published_at: string | null
}

export interface CommunityCounts {
  all: number
  tools: number
  skills: number
  mcp: number
}
