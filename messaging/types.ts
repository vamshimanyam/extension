import type { Session } from '../types/session'
import type { SessionBackup, SessionImportResult } from '../types/backup'
import type { DashboardStats } from '../types/dashboard'
import type { ConsoleEntry } from '../types/console'
import type { NetworkEntry } from '../types/network'
import type { Settings } from '../types/settings'
import type { SettingsUpdate } from '../types/settings'
import type { ScreenshotImagePayload } from '../types/screenshot'
import type { Step } from '../types/step'

export interface RuntimeRequestMap {
  START_SESSION: {
    payload: {
      name?: string
      description?: string
      environment?: string
      testerName?: string
    }
    response: { session: Session }
  }
  END_SESSION: {
    payload: { sessionId?: string }
    response: { session: Session | null }
  }
  UPDATE_SESSION: {
    payload: {
      sessionId: string
      updates: Partial<Pick<Session, 'name' | 'description' | 'environment' | 'testerName' | 'tags' | 'status'>>
    }
    response: { session: Session }
  }
  GET_SESSION_LIST: {
    payload: undefined
    response: { sessions: Session[]; activeSessionId: string | null }
  }
  GET_SESSION_DETAIL: {
    payload: { sessionId: string }
    response: { session: Session | null; steps: Step[] }
  }
  GET_ACTIVE_SESSION: {
    payload: undefined
    response: { session: Session | null; steps: Step[] }
  }
  GET_DASHBOARD: {
    payload: undefined
    response: { dashboard: DashboardStats }
  }
  GET_SETTINGS: {
    payload: undefined
    response: { settings: Settings }
  }
  COMPLETE_REMAINING_SESSIONS: {
    payload: undefined
    response: { sessions: Session[] }
  }
  DELETE_SESSION: {
    payload: { sessionId: string }
    response: { sessionId: string }
  }
  DELETE_COMPLETED_SESSIONS: {
    payload: undefined
    response: { deletedCount: number }
  }
  CREATE_MANUAL_STEP: {
    payload: {
      sessionId?: string
      note?: string
      status?: Step['status']
    }
    response: { session: Session; step: Step }
  }
  DUPLICATE_STEP: {
    payload: { stepId: string }
    response: { step: Step }
  }
  RESTORE_DELETED_STEP: {
    payload: { step: Step }
    response: { step: Step }
  }
  REORDER_STEPS: {
    payload: {
      sessionId: string
      orderedStepIds: string[]
    }
    response: { steps: Step[] }
  }
  GET_TECH_BUFFER: {
    payload: { tabId: number }
    response: {
      networkEntries: NetworkEntry[]
      consoleEntries: ConsoleEntry[]
    }
  }
  ATTACH_TECH_DATA_TO_STEP: {
    payload: {
      stepId: string
      networkEntries: NetworkEntry[]
      consoleEntries: ConsoleEntry[]
    }
    response: { step: Step }
  }
  UPDATE_SETTINGS: {
    payload: { updates: SettingsUpdate }
    response: { settings: Settings }
  }
  UPDATE_STEP: {
    payload: {
      stepId: string
      updates: Partial<Pick<Step, 'note' | 'status' | 'networkEntries' | 'consoleEntries' | 'annotations'>>
    }
    response: { step: Step }
  }
  DELETE_STEP: {
    payload: { stepId: string }
    response: { stepId: string }
  }
  GET_SCREENSHOT: {
    payload: { screenshotId: string }
    response: { screenshot: ScreenshotImagePayload | null }
  }
  IMPORT_SESSION_BACKUP: {
    payload: { backup: SessionBackup }
    response: SessionImportResult
  }
}

export interface RuntimeEventMap {
  SESSION_STARTED: { session: Session }
  SESSION_ENDED: { session: Session }
  SESSION_UPDATED: { session: Session }
  SESSION_DELETED: { sessionId: string }
  SESSION_RESTORED: { session: Session }
  STEP_ADDED: { step: Step }
  STEP_UPDATED: { step: Step }
  STEP_DELETED: { stepId: string }
  OPEN_NOTE_POPUP: { stepId: string }
  OPEN_TECH_POPUP: { stepId: string; tabId: number }
  CAPTURE_ERROR: { code: string; message: string; suggestion?: string }
  STORAGE_WARNING: { message: string }
}

export type RuntimeRequestType = keyof RuntimeRequestMap
export type RuntimeEventType = keyof RuntimeEventMap

export type RuntimeRequestMessage<T extends RuntimeRequestType = RuntimeRequestType> = {
  type: T
  payload: RuntimeRequestMap[T]['payload']
}

export type RuntimeEventMessage<T extends RuntimeEventType = RuntimeEventType> = {
  type: T
  payload: RuntimeEventMap[T]
}

export interface RuntimeSuccessResponse<T> {
  ok: true
  data: T
}

export interface RuntimeErrorResponse {
  ok: false
  error: string
}

export type RuntimeResponse<T> = RuntimeSuccessResponse<T> | RuntimeErrorResponse
