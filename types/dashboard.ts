import type { Session } from './session'

export interface DashboardStoreStat {
  storeName: 'sessions' | 'steps' | 'screenshots' | 'settings'
  count: number
  sizeBytes: number
}

export interface DashboardSessionStat {
  id: string
  name: string
  status: Session['status']
  updatedAt: string
  stepCount: number
  sizeBytes: number
}

export interface DashboardStats {
  dbName: string
  dbVersion: number
  storeStats: DashboardStoreStat[]
  totalEstimatedBytes: number
  sessionsTotal: number
  sessionsActive: number
  sessionsCompleted: number
  sessionsArchived: number
  stepsTotal: number
  screenshotsTotal: number
  screenshotsBytes: number
  sessionStats: DashboardSessionStat[]
  recentSessions: Array<
    Pick<Session, 'id' | 'name' | 'status' | 'createdAt' | 'updatedAt' | 'stepCount'>
  >
  storageEstimate: {
    usageBytes: number
    quotaBytes: number
    percentUsed: number
  } | null
}
