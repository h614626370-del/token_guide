export interface UpdateJobView {
  phase: 'idle' | 'checking' | 'pulling' | 'recreating' | 'restarting' | 'success' | 'error'
  message: string
  target_version: string | null
  started_at: string | null
  finished_at: string | null
  logs: string[]
  error: string | null
}

export interface UpdateStatusView {
  current_version: string
  current_runtime_version: string
  current_image: string | null
  current_image_id: string | null
  current_version_source: 'image' | 'runtime' | 'image_tag' | 'unknown'
  latest_version: string | null
  latest_tag: string | null
  latest_published_at: string | null
  latest_url: string | null
  update_available: boolean
  checked_at: string | null
  image_repository: string
  github_repo: string
  container_name: string
  docker_socket: string
  docker_available: boolean
  can_apply: boolean
  can_restart: boolean
  apply_block_reason: string | null
  job: UpdateJobView
}
