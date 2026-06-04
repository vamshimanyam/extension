import { openDB, type IDBPDatabase } from 'idb'
import { DB_NAME, DB_VERSION } from '../../config/constants'
import type { QADatabase } from '../../types/storage'

let dbPromise: Promise<IDBPDatabase<QADatabase>> | null = null

export function getDb(): Promise<IDBPDatabase<QADatabase>> {
  if (dbPromise) {
    return dbPromise
  }

  dbPromise = openDB<QADatabase>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const sessionStore = db.createObjectStore('sessions', { keyPath: 'id' })
        sessionStore.createIndex('by-status', 'status')
        sessionStore.createIndex('by-createdAt', 'createdAt')

        const stepStore = db.createObjectStore('steps', { keyPath: 'id' })
        stepStore.createIndex('by-sessionId', 'sessionId')
        stepStore.createIndex('by-sessionId-stepNumber', ['sessionId', 'stepNumber'])

        const screenshotStore = db.createObjectStore('screenshots', { keyPath: 'id' })
        screenshotStore.createIndex('by-stepId', 'stepId')
        screenshotStore.createIndex('by-sessionId', 'sessionId')

        db.createObjectStore('settings', { keyPath: 'key' })
      }
    },
  })

  return dbPromise
}
