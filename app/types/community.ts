export type CommunityCategorySlug = string
export type CommunityCategoryIcon = 'wrench' | 'box' | 'sliders-horizontal' | 'bot' | 'package' | 'database' | 'boxes' | 'folder' | 'sparkles' | 'workflow'
export type CommunityStatus = 'draft' | 'published' | 'archived'

export interface CommunityCategory {
  id: number
  slug: CommunityCategorySlug
  name: string
  icon_key: CommunityCategoryIcon
  description: string
  is_visible: boolean
  sort_order: number
  item_count: number
  published_count: number
  created_at: string
  updated_at: string
}

export interface CommunityImage {
  id?: number
  image_url: string
  title: string | null
  alt_text: string | null
  sort_order: number
}

export interface CommunityItem {
  id: number
  slug: string
  category: CommunityCategorySlug
  category_name: string
  name: string
  summary: string
  description_md: string
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
  images: CommunityImage[]
}

export type CommunityCounts = Record<string, number>
