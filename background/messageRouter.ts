import type {
  RuntimeErrorResponse,
  RuntimeRequestMessage,
  RuntimeRequestType,
  RuntimeResponse,
  RuntimeSuccessResponse,
  RuntimeEventType,
} from '../messaging/types'
import type { Step } from '../types/step'
import { TechDataBuffer } from './capture/techDataBuffer'
import { SessionManager } from './session/sessionManager'
import { DashboardRepo } from './storage/dashboardRepo'
import { ScreenshotRepo } from './storage/screenshotRepo'
import { SettingsRepo } from './storage/settingsRepo'

interface NotifyFn {
  (type: RuntimeEventType, payload: unknown): void
}

export class MessageRouter {
  private readonly sessionManager: SessionManager

  private readonly screenshotRepo: ScreenshotRepo

  private readonly dashboardRepo: DashboardRepo

  private readonly settingsRepo: SettingsRepo

  private readonly techDataBuffer: TechDataBuffer

  private readonly notify: NotifyFn

  public constructor(
    sessionManager: SessionManager,
    screenshotRepo: ScreenshotRepo,
    dashboardRepo: DashboardRepo,
    settingsRepo: SettingsRepo,
    techDataBuffer: TechDataBuffer,
    notify: NotifyFn
  ) {
    this.sessionManager = sessionManager
    this.screenshotRepo = screenshotRepo
    this.dashboardRepo = dashboardRepo
    this.settingsRepo = settingsRepo
    this.techDataBuffer = techDataBuffer
    this.notify = notify
  }

  public async handle(message: RuntimeRequestMessage): Promise<RuntimeResponse<unknown>> {
    try {
      switch (message.type as RuntimeRequestType) {
        case 'START_SESSION': {
          const payload =
            (message.payload as {
              name?: string
              description?: string
              environment?: string
              testerName?: string
            } | null) ?? {}
          const session = await this.sessionManager.startSession(payload)
          this.notify('SESSION_STARTED', { session })
          return this.success({ session })
        }

        case 'END_SESSION': {
          const payload = message.payload as { sessionId?: string } | undefined
          const session = await this.sessionManager.endSession(payload?.sessionId)

          if (session) {
            this.notify('SESSION_ENDED', { session })
          }

          return this.success({ session })
        }

        case 'UPDATE_SESSION': {
          const payload = message.payload as {
            sessionId: string
            updates: Parameters<SessionManager['updateSession']>[1]
          }
          const session = await this.sessionManager.updateSession(payload.sessionId, payload.updates)
          this.notify('SESSION_UPDATED', { session })
          return this.success({ session })
        }

        case 'GET_SESSION_LIST': {
          const sessions = await this.sessionManager.getSessionList()
          return this.success({
            sessions,
            activeSessionId: this.sessionManager.getActiveSessionId(),
          })
        }

        case 'GET_SESSION_DETAIL': {
          const payload = message.payload as { sessionId: string }
          const session = await this.sessionManager.getSession(payload.sessionId)
          const steps = session ? await this.sessionManager.getSessionSteps(payload.sessionId) : []
          return this.success({ session, steps })
        }

        case 'GET_ACTIVE_SESSION': {
          const bundle = await this.sessionManager.getActiveSessionBundle()
          return this.success(bundle)
        }

        case 'GET_DASHBOARD': {
          const dashboard = await this.dashboardRepo.getStats()
          return this.success({ dashboard })
        }

        case 'GET_SETTINGS': {
          const settings = await this.settingsRepo.get()
          return this.success({ settings })
        }

        case 'COMPLETE_REMAINING_SESSIONS': {
          const sessions = await this.sessionManager.completeRemainingSessions()
          return this.success({ sessions })
        }

        case 'DELETE_SESSION': {
          const payload = message.payload as { sessionId: string }
          const sessionId = await this.sessionManager.deleteSession(payload.sessionId)
          this.notify('SESSION_DELETED', { sessionId })
          return this.success({ sessionId })
        }

        case 'DELETE_COMPLETED_SESSIONS': {
          const deletedCount = await this.sessionManager.deleteCompletedSessions()
          return this.success({ deletedCount })
        }

        case 'CREATE_MANUAL_STEP': {
          const payload = message.payload as {
            sessionId?: string
            note?: string
            status?: Step['status']
          }

          const hadActiveSession = Boolean(this.sessionManager.getActiveSessionId())
          const pageContext = await this.getActivePageContext()

          const { session, step } = await this.sessionManager.createManualStep({
            sessionId: payload.sessionId,
            note: payload.note,
            status: payload.status,
            pageContext,
          })

          if (!hadActiveSession && session.status === 'active') {
            this.notify('SESSION_STARTED', { session })
          }

          this.notify('STEP_ADDED', { step })
          return this.success({ session, step })
        }

        case 'DUPLICATE_STEP': {
          const payload = message.payload as { stepId: string }
          const step = await this.sessionManager.duplicateStep(payload.stepId)
          this.notify('STEP_ADDED', { step })
          return this.success({ step })
        }

        case 'RESTORE_DELETED_STEP': {
          const payload = message.payload as { step: Step }
          const step = await this.sessionManager.restoreDeletedStep(payload.step)
          this.notify('STEP_ADDED', { step })
          return this.success({ step })
        }

        case 'REORDER_STEPS': {
          const payload = message.payload as {
            sessionId: string
            orderedStepIds: string[]
          }

          const steps = await this.sessionManager.reorderSteps(payload.sessionId, payload.orderedStepIds)
          return this.success({ steps })
        }

        case 'GET_TECH_BUFFER': {
          const payload = message.payload as { tabId: number }
          const buffer = this.techDataBuffer.getBuffer(payload.tabId)
          return this.success(buffer)
        }

        case 'ATTACH_TECH_DATA_TO_STEP': {
          const payload = message.payload as {
            stepId: string
            networkEntries: Step['networkEntries']
            consoleEntries: Step['consoleEntries']
          }

          const step = await this.sessionManager.updateStep(payload.stepId, {
            networkEntries: payload.networkEntries,
            consoleEntries: payload.consoleEntries,
          })

          this.notify('STEP_UPDATED', { step })
          return this.success({ step })
        }

        case 'UPDATE_SETTINGS': {
          const payload = message.payload as { updates: Parameters<SettingsRepo['update']>[0] }
          const settings = await this.settingsRepo.update(payload.updates)
          await this.techDataBuffer.syncLimits()
          return this.success({ settings })
        }

        case 'UPDATE_STEP': {
          const payload = message.payload as {
            stepId: string
            updates: {
              note?: string
              status?: 'pass' | 'fail' | 'warning' | 'info' | 'unset'
              annotations?: Step['annotations']
            }
          }

          const step = await this.sessionManager.updateStep(payload.stepId, payload.updates)
          this.notify('STEP_UPDATED', { step })
          return this.success({ step })
        }

        case 'DELETE_STEP': {
          const payload = message.payload as { stepId: string }
          const stepId = await this.sessionManager.deleteStep(payload.stepId)
          this.notify('STEP_DELETED', { stepId })
          return this.success({ stepId })
        }

        case 'GET_SCREENSHOT': {
          const payload = message.payload as { screenshotId: string }
          const screenshot = await this.screenshotRepo.getImagePayloadById(payload.screenshotId)
          return this.success({ screenshot })
        }

        case 'IMPORT_SESSION_BACKUP': {
          const payload = message.payload as Parameters<SessionManager['importSessionBackup']>[0] extends infer Backup
            ? { backup: Backup }
            : never
          const result = await this.sessionManager.importSessionBackup(payload.backup)
          this.notify('SESSION_UPDATED', { session: result.session })
          return this.success(result)
        }

        default:
          return this.error('Unknown message type')
      }
    } catch (error) {
      return this.error(error instanceof Error ? error.message : String(error))
    }
  }

  private success<T>(data: T): RuntimeSuccessResponse<T> {
    return {
      ok: true,
      data,
    }
  }

  private error(message: string): RuntimeErrorResponse {
    return {
      ok: false,
      error: message,
    }
  }

  private async getActivePageContext(): Promise<{
    url?: string
    domain?: string
    pageTitle?: string
  }> {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

      if (!tab?.url) {
        return {}
      }

      const domain = this.getSafeDomain(tab.url)
      return {
        url: tab.url,
        domain,
        pageTitle: tab.title ?? 'Manual Step',
      }
    } catch {
      return {}
    }
  }

  private getSafeDomain(url: string): string {
    try {
      return new URL(url).hostname
    } catch {
      return 'manual'
    }
  }
}
