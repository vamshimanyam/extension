import type { Session } from './session'
import type { Step } from './step'

export interface SessionBackupScreenshot {
  id: string
  stepId: string
  sessionId: string
  width: number
  height: number
  capturedAt: string
  sizeBytes: number
  mimeType: string
  dataUrl: string
}

export interface SessionBackup {
  version: number
  exportedAt: string
  session: Session
  steps: Step[]
  screenshots: SessionBackupScreenshot[]
}

export interface SessionBackupBundle {
  version: number
  exportedAt: string
  sessions: SessionBackup[]
}

export interface SessionImportResult {
  session: Session
  steps: Step[]
  importedStepCount: number
  merged: boolean
}