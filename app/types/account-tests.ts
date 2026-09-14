export interface AccountTestAccount {
  id: number
  name: string
  status: string
  type: string
  schedulable: boolean
}

export interface AccountTestBatchCounts {
  total: number
  succeeded: number
  failed: number
}
