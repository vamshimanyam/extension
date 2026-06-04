import { DB_NAME, DB_VERSION } from '../../config/constants'
import type { DashboardSessionStat, DashboardStats, DashboardStoreStat } from '../../types/dashboard'
import { getDb } from './db'

const textEncoder = new TextEncoder()

function estimateObjectSize(value: unknown): number {
  try {
    return textEncoder.encode(JSON.stringify(value)).length
  } catch {
    return 0
  }
}

function safePercentage(used: number, quota: number): number {
  if (!quota) {
    return 0
  }
  return Math.round((used / quota) * 10000) / 100
}

export class DashboardRepo {
  public async getStats(): Promise<DashboardStats> {
    const db = await getDb()

    const [sessions, steps, screenshots, settings] = await Promise.all([
      db.getAll('sessions'),
      db.getAll('steps'),
      db.getAll('screenshots'),
      db.getAll('settings'),
    ])

    const sessionsTotal = sessions.length
    const sessionsActive = sessions.filter((session) => session.status === 'active').length
    const sessionsCompleted = sessions.filter((session) => session.status === 'completed').length
    const sessionsArchived = sessions.filter((session) => session.status === 'archived').length

    const stepsTotal = steps.length
    const screenshotsTotal = screenshots.length
    const screenshotsBytes = screenshots.reduce((total, screenshot) => {
      return total + (screenshot.sizeBytes || screenshot.blob.size || 0)
    }, 0)

    const storeStats: DashboardStoreStat[] = [
      {
        storeName: 'sessions',
        count: sessions.length,
        sizeBytes: this.estimateCollectionSize(sessions),
      },
      {
        storeName: 'steps',
        count: steps.length,
        sizeBytes: this.estimateCollectionSize(steps),
      },
      {
        storeName: 'screenshots',
        count: screenshots.length,
        sizeBytes: screenshotsBytes,
      },
      {
        storeName: 'settings',
        count: settings.length,
        sizeBytes: this.estimateCollectionSize(settings),
      },
    ]

    const stepsBySessionId = new Map<string, typeof steps>()
    for (const step of steps) {
      const sessionSteps = stepsBySessionId.get(step.sessionId) ?? []
      sessionSteps.push(step)
      stepsBySessionId.set(step.sessionId, sessionSteps)
    }

    const screenshotBytesBySessionId = screenshots.reduce<Map<string, number>>((map, screenshot) => {
      map.set(screenshot.sessionId, (map.get(screenshot.sessionId) ?? 0) + (screenshot.sizeBytes || screenshot.blob.size || 0))
      return map
    }, new Map())

    const sessionStats: DashboardSessionStat[] = sessions
      .map((session) => {
        const sessionSteps = stepsBySessionId.get(session.id) ?? []
        return {
          id: session.id,
          name: session.name,
          status: session.status,
          updatedAt: session.updatedAt,
          stepCount: session.stepCount,
          sizeBytes:
            estimateObjectSize(session) +
            this.estimateCollectionSize(sessionSteps) +
            (screenshotBytesBySessionId.get(session.id) ?? 0),
        }
      })
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))

    const totalEstimatedBytes = storeStats.reduce((total, stat) => total + stat.sizeBytes, 0)

    const recentSessions = [...sessions]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 6)
      .map((session) => ({
        id: session.id,
        name: session.name,
        status: session.status,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        stepCount: session.stepCount,
      }))

    return {
      dbName: DB_NAME,
      dbVersion: DB_VERSION,
      storeStats,
      totalEstimatedBytes,
      sessionsTotal,
      sessionsActive,
      sessionsCompleted,
      sessionsArchived,
      stepsTotal,
      screenshotsTotal,
      screenshotsBytes,
      sessionStats,
      recentSessions,
      storageEstimate: await this.getStorageEstimate(),
    }
  }

  private estimateCollectionSize(items: unknown[]): number {
    return items.reduce<number>((total, item) => total + estimateObjectSize(item), 0)
  }

  private async getStorageEstimate(): Promise<DashboardStats['storageEstimate']> {
    if (!navigator.storage?.estimate) {
      return null
    }

    const estimate = await navigator.storage.estimate()
    const usageBytes = estimate.usage ?? 0
    const quotaBytes = estimate.quota ?? 0

    return {
      usageBytes,
      quotaBytes,
      percentUsed: safePercentage(usageBytes, quotaBytes),
    }
  }
}
