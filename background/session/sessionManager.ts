import { ACTIVE_SESSION_STORAGE_KEY } from '../../config/constants'
import { createId } from '../utils/idGen'
import { SessionRepo } from '../storage/sessionRepo'
import type { SessionBackup, SessionImportResult } from '../../types/backup'
import type { Session } from '../../types/session'
import type { Step } from '../../types/step'
import type { StepStatus } from '../../types/step'

interface StartSessionInput {
  name?: string
  description?: string
  environment?: string
  testerName?: string
}

interface ManualStepInput {
  sessionId?: string
  note?: string
  status?: StepStatus
  pageContext?: {
    url?: string
    domain?: string
    pageTitle?: string
  }
}

export class SessionManager {
  private readonly sessionRepo: SessionRepo

  private activeSessionId: string | null = null

  public constructor(sessionRepo: SessionRepo) {
    this.sessionRepo = sessionRepo
  }

  public async restoreActiveSession(): Promise<Session | null> {
    const storage = await chrome.storage.local.get(ACTIVE_SESSION_STORAGE_KEY)
    const storedId = (storage[ACTIVE_SESSION_STORAGE_KEY] as string | undefined) ?? null

    if (!storedId) {
      this.activeSessionId = null
      return null
    }

    const session = await this.sessionRepo.getById(storedId)
    if (!session || session.status !== 'active') {
      await chrome.storage.local.remove(ACTIVE_SESSION_STORAGE_KEY)
      this.activeSessionId = null
      return null
    }

    this.activeSessionId = session.id
    return session
  }

  public async recoverOrphanedSessions(inactiveMs = 30 * 60 * 1000): Promise<void> {
    const activeSessions = await this.sessionRepo.getByStatus('active')

    for (const session of activeSessions) {
      const lastStep = await this.sessionRepo.getLastStep(session.id)
      const lastActivity = lastStep?.timestamp ?? session.createdAt
      const elapsed = Date.now() - new Date(lastActivity).getTime()

      if (elapsed > inactiveMs) {
        await this.sessionRepo.update(session.id, {
          status: 'completed',
          completedAt: new Date().toISOString(),
          name: `${session.name} (auto-closed)`,
        })
      }
    }
  }

  public async startSession(input: StartSessionInput): Promise<Session> {
    const active = await this.getActiveSession()
    if (active) {
      return active
    }

    const createdAt = new Date().toISOString()
    const session: Session = {
      id: createId(),
      name: input.name?.trim() || this.createAutoName(),
      description: input.description,
      status: 'active',
      createdAt,
      updatedAt: createdAt,
      stepCount: 0,
      tags: [],
      environment: input.environment,
      testerName: input.testerName,
      meta: this.getBrowserMeta(),
    }

    await this.sessionRepo.create(session)
    await this.setActiveSessionId(session.id)
    return session
  }

  public async endSession(sessionId?: string): Promise<Session | null> {
    const active = sessionId ? await this.sessionRepo.getById(sessionId) : await this.getActiveSession()

    if (!active) {
      return null
    }

    const updated = await this.sessionRepo.update(active.id, {
      status: 'completed',
      completedAt: new Date().toISOString(),
    })

    if (this.activeSessionId === updated.id) {
      await this.setActiveSessionId(null)
    }

    return updated
  }

  public async completeRemainingSessions(): Promise<Session[]> {
    const activeSessions = await this.sessionRepo.getByStatus('active')
    const completedSessions: Session[] = []

    for (const activeSession of activeSessions) {
      const updatedSession = await this.sessionRepo.update(activeSession.id, {
        status: 'completed',
        completedAt: new Date().toISOString(),
      })
      completedSessions.push(updatedSession)
    }

    if (
      this.activeSessionId &&
      completedSessions.some((completedSession) => completedSession.id === this.activeSessionId)
    ) {
      await this.setActiveSessionId(null)
    }

    return completedSessions
  }

  public async getSessionList(): Promise<Session[]> {
    return this.sessionRepo.getAll()
  }

  public async getSession(sessionId: string): Promise<Session | null> {
    return this.sessionRepo.getById(sessionId)
  }

  public async getSessionSteps(sessionId: string): Promise<Step[]> {
    return this.sessionRepo.getSteps(sessionId)
  }

  public async getActiveSession(): Promise<Session | null> {
    if (!this.activeSessionId) {
      return null
    }

    const session = await this.sessionRepo.getById(this.activeSessionId)
    if (!session || session.status !== 'active') {
      this.activeSessionId = null
      return null
    }

    return session
  }

  public async getActiveSessionBundle(): Promise<{ session: Session | null; steps: Step[] }> {
    const session = await this.getActiveSession()
    if (!session) {
      return {
        session: null,
        steps: [],
      }
    }

    const steps = await this.sessionRepo.getSteps(session.id)
    return {
      session,
      steps,
    }
  }

  public async appendStep(step: Step): Promise<void> {
    await this.sessionRepo.appendStep(step)
  }

  public async createManualStep(input: ManualStepInput): Promise<{ session: Session; step: Step }> {
    let session = input.sessionId
      ? await this.sessionRepo.getById(input.sessionId)
      : await this.getActiveSession()

    if (!session) {
      session = await this.startSession({})
    }

    const stepNumber = await this.nextStepNumber(session.id)
    const browserMeta = this.getBrowserMeta()
    const step: Step = {
      id: createId(),
      sessionId: session.id,
      stepNumber,
      timestamp: new Date().toISOString(),
      url: input.pageContext?.url ?? 'manual://entry',
      domain: input.pageContext?.domain ?? 'manual',
      pageTitle: input.pageContext?.pageTitle ?? 'Manual Step',
      browserInfo: {
        name: browserMeta.browserName,
        version: browserMeta.browserVersion,
      },
      windowSize: {
        width: 0,
        height: 0,
      },
      screenshotId: null,
      captureMode: 'manual',
      note: input.note?.trim() ?? '',
      status: input.status ?? 'unset',
      networkEntries: [],
      consoleEntries: [],
      annotations: [],
    }

    await this.sessionRepo.appendStep(step)

    const updatedSession = (await this.sessionRepo.getById(session.id)) ?? session
    return {
      session: updatedSession,
      step,
    }
  }

  public async duplicateStep(stepId: string): Promise<Step> {
    return this.sessionRepo.duplicateStep(stepId)
  }

  public async restoreDeletedStep(step: Step): Promise<Step> {
    return this.sessionRepo.restoreDeletedStep(step)
  }

  public async updateStep(
    stepId: string,
    updates: Partial<Pick<Step, 'note' | 'status' | 'networkEntries' | 'consoleEntries' | 'annotations'>>
  ): Promise<Step> {
    return this.sessionRepo.updateStep(stepId, updates)
  }

  public async updateSession(sessionId: string, updates: Partial<Pick<Session, 'name' | 'description' | 'environment' | 'testerName' | 'tags' | 'status'>>): Promise<Session> {
    const current = await this.sessionRepo.getById(sessionId)
    if (!current) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    const completedAt = updates.status === 'completed' && current.status !== 'completed'
      ? new Date().toISOString()
      : updates.status === 'active'
        ? undefined
        : current.completedAt

    const updated = await this.sessionRepo.update(sessionId, {
      ...updates,
      completedAt,
    })

    if (updated.status !== 'active' && this.activeSessionId === updated.id) {
      await this.setActiveSessionId(null)
    }

    if (updated.status === 'active') {
      await this.setActiveSessionId(updated.id)
    }

    return updated
  }

  public async deleteStep(stepId: string): Promise<string> {
    return this.sessionRepo.deleteStep(stepId)
  }

  public async deleteSession(sessionId: string): Promise<string> {
    const session = await this.sessionRepo.getById(sessionId)

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    await this.sessionRepo.deleteSession(sessionId)

    if (this.activeSessionId === sessionId) {
      await this.setActiveSessionId(null)
    }

    return sessionId
  }

  public async deleteCompletedSessions(): Promise<number> {
    return this.sessionRepo.deleteCompletedSessions()
  }

  public async reorderSteps(sessionId: string, orderedStepIds: string[]): Promise<Step[]> {
    return this.sessionRepo.reorderSteps(sessionId, orderedStepIds)
  }

  public async importSessionBackup(backup: SessionBackup): Promise<SessionImportResult> {
    return this.sessionRepo.importBackup(backup)
  }

  public async nextStepNumber(sessionId: string): Promise<number> {
    const steps = await this.sessionRepo.getSteps(sessionId)
    return steps.length + 1
  }

  public getActiveSessionId(): string | null {
    return this.activeSessionId
  }

  private async setActiveSessionId(sessionId: string | null): Promise<void> {
    this.activeSessionId = sessionId

    if (sessionId) {
      await chrome.storage.local.set({ [ACTIVE_SESSION_STORAGE_KEY]: sessionId })
      return
    }

    await chrome.storage.local.remove(ACTIVE_SESSION_STORAGE_KEY)
  }

  private createAutoName(): string {
    const now = new Date()
    return `Session - ${now.toLocaleDateString()} ${now.toLocaleTimeString()}`
  }

  private getBrowserMeta(): Session['meta'] {
    const userAgent = navigator.userAgent
    const browserName = userAgent.includes('Edg')
      ? 'Edge'
      : userAgent.includes('Chrome')
        ? 'Chrome'
        : 'Browser'

    const browserVersionMatch = userAgent.match(/(Chrome|Edg)\/(\d+)/)
    const browserVersion = browserVersionMatch?.[2] ?? 'unknown'

    return {
      browserName,
      browserVersion,
      os: navigator.platform,
    }
  }
}
