import type { DBSchema } from 'idb'
import type { Session } from './session'
import type { Settings } from './settings'
import type { ScreenshotRecord } from './screenshot'
import type { Step } from './step'

export interface QADatabase extends DBSchema {
  sessions: {
    key: string
    value: Session
    indexes: {
      'by-status': string
      'by-createdAt': string
    }
  }
  steps: {
    key: string
    value: Step
    indexes: {
      'by-sessionId': string
      'by-sessionId-stepNumber': [string, number]
    }
  }
  screenshots: {
    key: string
    value: ScreenshotRecord
    indexes: {
      'by-stepId': string
      'by-sessionId': string
    }
  }
  settings: {
    key: string
    value: Settings & { key: string }
  }
}
