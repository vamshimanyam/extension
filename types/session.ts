export interface Session {
  id: string
  name: string
  description?: string
  status: 'active' | 'completed' | 'archived'
  createdAt: string
  updatedAt: string
  completedAt?: string
  stepCount: number
  tags: string[]
  environment?: string
  testerName?: string
  meta: {
    browserName: string
    browserVersion: string
    os: string
  }
}
