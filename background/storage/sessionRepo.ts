import type { Session } from '../../types/session'
import type { SessionBackup, SessionImportResult, SessionBackupScreenshot } from '../../types/backup'
import type { ScreenshotRecord } from '../../types/screenshot'
import type { Step } from '../../types/step'
import { createId } from '../utils/idGen'
import { getDb } from './db'

export class SessionRepo {
  public async create(session: Session): Promise<void> {
    const db = await getDb()
    await db.put('sessions', session)
  }

  public async update(sessionId: string, updates: Partial<Session>): Promise<Session> {
    const db = await getDb()
    const existing = await db.get('sessions', sessionId)

    if (!existing) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    const next: Session = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    }

    await db.put('sessions', next)
    return next
  }

  public async getById(sessionId: string): Promise<Session | null> {
    const db = await getDb()
    const session = await db.get('sessions', sessionId)
    return session ?? null
  }

  public async getByStatus(status: Session['status']): Promise<Session[]> {
    const db = await getDb()
    return db.getAllFromIndex('sessions', 'by-status', status)
  }

  public async getAll(): Promise<Session[]> {
    const db = await getDb()
    const all = await db.getAll('sessions')
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  public async getSteps(sessionId: string): Promise<Step[]> {
    const db = await getDb()
    const steps = await db.getAllFromIndex('steps', 'by-sessionId', sessionId)
    return steps.sort((a, b) => a.stepNumber - b.stepNumber)
  }

  public async getLastStep(sessionId: string): Promise<Step | null> {
    const steps = await this.getSteps(sessionId)
    if (steps.length === 0) {
      return null
    }
    return steps[steps.length - 1] ?? null
  }

  public async appendStep(step: Step): Promise<void> {
    const db = await getDb()
    const tx = db.transaction(['sessions', 'steps'], 'readwrite')
    const session = await tx.objectStore('sessions').get(step.sessionId)

    if (!session) {
      throw new Error(`Session not found: ${step.sessionId}`)
    }

    await tx.objectStore('steps').put(step)

    session.stepCount += 1
    session.updatedAt = new Date().toISOString()

    await tx.objectStore('sessions').put(session)
    await tx.done
  }

  public async updateStep(
    stepId: string,
    updates: Partial<Pick<Step, 'note' | 'status' | 'networkEntries' | 'consoleEntries' | 'annotations'>>
  ): Promise<Step> {
    const db = await getDb()
    const tx = db.transaction(['sessions', 'steps'], 'readwrite')
    const existing = await tx.objectStore('steps').get(stepId)

    if (!existing) {
      throw new Error(`Step not found: ${stepId}`)
    }

    const updated: Step = {
      ...existing,
      ...updates,
    }

    await tx.objectStore('steps').put(updated)

    const session = await tx.objectStore('sessions').get(existing.sessionId)
    if (session) {
      session.updatedAt = new Date().toISOString()
      await tx.objectStore('sessions').put(session)
    }

    await tx.done
    return updated
  }

  public async deleteStep(stepId: string): Promise<string> {
    const db = await getDb()
    const tx = db.transaction(['sessions', 'steps'], 'readwrite')
    const step = await tx.objectStore('steps').get(stepId)

    if (!step) {
      throw new Error(`Step not found: ${stepId}`)
    }

    await tx.objectStore('steps').delete(stepId)

    const remainingSteps = await tx.objectStore('steps').index('by-sessionId').getAll(step.sessionId)
    for (const remainingStep of remainingSteps) {
      if (remainingStep.stepNumber > step.stepNumber) {
        remainingStep.stepNumber -= 1
        await tx.objectStore('steps').put(remainingStep)
      }
    }

    const session = await tx.objectStore('sessions').get(step.sessionId)
    if (session) {
      session.stepCount = Math.max(0, session.stepCount - 1)
      session.updatedAt = new Date().toISOString()
      await tx.objectStore('sessions').put(session)
    }

    await tx.done
    return stepId
  }

  public async duplicateStep(stepId: string): Promise<Step> {
    const db = await getDb()
    const tx = db.transaction(['sessions', 'steps'], 'readwrite')
    const stepsStore = tx.objectStore('steps')
    const sourceStep = await stepsStore.get(stepId)

    if (!sourceStep) {
      throw new Error(`Step not found: ${stepId}`)
    }

    const session = await tx.objectStore('sessions').get(sourceStep.sessionId)
    if (!session) {
      throw new Error(`Session not found: ${sourceStep.sessionId}`)
    }

    const sessionSteps = await stepsStore.index('by-sessionId').getAll(sourceStep.sessionId)
    const targetStepNumber = sourceStep.stepNumber + 1

    const stepsToShift = sessionSteps
      .filter((step) => step.stepNumber >= targetStepNumber)
      .sort((a, b) => b.stepNumber - a.stepNumber)

    for (const step of stepsToShift) {
      step.stepNumber += 1
      await stepsStore.put(step)
    }

    const duplicatedStep: Step = {
      ...sourceStep,
      id: createId(),
      stepNumber: targetStepNumber,
      timestamp: new Date().toISOString(),
    }

    await stepsStore.put(duplicatedStep)

    session.stepCount += 1
    session.updatedAt = new Date().toISOString()
    await tx.objectStore('sessions').put(session)

    await tx.done
    return duplicatedStep
  }

  public async restoreDeletedStep(snapshot: Step): Promise<Step> {
    const db = await getDb()
    const tx = db.transaction(['sessions', 'steps'], 'readwrite')
    const stepsStore = tx.objectStore('steps')

    const existingStep = await stepsStore.get(snapshot.id)
    if (existingStep) {
      await tx.done
      return existingStep
    }

    const session = await tx.objectStore('sessions').get(snapshot.sessionId)
    if (!session) {
      throw new Error(`Session not found: ${snapshot.sessionId}`)
    }

    const sessionSteps = await stepsStore.index('by-sessionId').getAll(snapshot.sessionId)
    const targetStepNumber = Math.max(1, Math.min(snapshot.stepNumber, sessionSteps.length + 1))

    const stepsToShift = sessionSteps
      .filter((step) => step.stepNumber >= targetStepNumber)
      .sort((a, b) => b.stepNumber - a.stepNumber)

    for (const step of stepsToShift) {
      step.stepNumber += 1
      await stepsStore.put(step)
    }

    const restoredStep: Step = {
      ...snapshot,
      stepNumber: targetStepNumber,
    }

    await stepsStore.put(restoredStep)

    session.stepCount += 1
    session.updatedAt = new Date().toISOString()
    await tx.objectStore('sessions').put(session)

    await tx.done
    return restoredStep
  }

  public async deleteSession(sessionId: string): Promise<void> {
    const db = await getDb()
    const tx = db.transaction(['sessions', 'steps', 'screenshots'], 'readwrite')

    const screenshots = await tx.objectStore('screenshots').index('by-sessionId').getAll(sessionId)
    for (const screenshot of screenshots) {
      await tx.objectStore('screenshots').delete(screenshot.id)
    }

    const steps = await tx.objectStore('steps').index('by-sessionId').getAll(sessionId)
    for (const step of steps) {
      await tx.objectStore('steps').delete(step.id)
    }

    await tx.objectStore('sessions').delete(sessionId)
    await tx.done
  }

  public async deleteCompletedSessions(): Promise<number> {
    const db = await getDb()
    const completedSessions = await db.getAllFromIndex('sessions', 'by-status', 'completed')

    if (completedSessions.length === 0) {
      return 0
    }

    for (const session of completedSessions) {
      await this.deleteSession(session.id)
    }

    return completedSessions.length
  }

  public async reorderSteps(sessionId: string, orderedStepIds: string[]): Promise<Step[]> {
    const db = await getDb()
    const tx = db.transaction(['sessions', 'steps'], 'readwrite')
    const stepsStore = tx.objectStore('steps')
    const session = await tx.objectStore('sessions').get(sessionId)

    if (!session) {
      throw new Error(`Session not found: ${sessionId}`)
    }

    const sessionSteps = await stepsStore.index('by-sessionId').getAll(sessionId)
    const stepMap = new Map(sessionSteps.map((step) => [step.id, step]))

    if (new Set(orderedStepIds).size !== orderedStepIds.length) {
      throw new Error('Ordered step list must not contain duplicate step IDs')
    }

    const missingStepId = orderedStepIds.find((stepId) => !stepMap.has(stepId))
    if (missingStepId) {
      throw new Error(`Step not found in session: ${missingStepId}`)
    }

    if (orderedStepIds.length !== sessionSteps.length) {
      throw new Error('Ordered step list must include every step exactly once')
    }

    const updatedSteps: Step[] = []
    for (const [index, stepId] of orderedStepIds.entries()) {
      const step = stepMap.get(stepId)
      if (!step) {
        continue
      }

      const nextStep: Step = {
        ...step,
        stepNumber: index + 1,
      }

      await stepsStore.put(nextStep)
      updatedSteps.push(nextStep)
    }

    session.updatedAt = new Date().toISOString()
    await tx.objectStore('sessions').put(session)

    await tx.done
    return updatedSteps.sort((a, b) => a.stepNumber - b.stepNumber)
  }

  public async importBackup(backup: SessionBackup): Promise<SessionImportResult> {
    const db = await getDb()
    const existingSession = await db.get('sessions', backup.session.id)
    const existingSteps = existingSession
      ? await db.getAllFromIndex('steps', 'by-sessionId', existingSession.id)
      : []
    const merged = Boolean(existingSession)
    const importedAt = new Date().toISOString()
    const sessionId = existingSession?.id ?? backup.session.id
    const sortedBackupSteps = [...backup.steps].sort((left, right) => left.stepNumber - right.stepNumber)

    const stepIdMap = new Map<string, string>()
    sortedBackupSteps.forEach((step) => {
      stepIdMap.set(step.id, merged ? createId() : step.id)
    })

    const screenshotIdMap = new Map<string, string>()
    backup.screenshots.forEach((screenshot) => {
      screenshotIdMap.set(screenshot.id, merged ? createId() : screenshot.id)
    })

    const importedSteps = sortedBackupSteps.map((step, index) => {
      const nextStepId = stepIdMap.get(step.id) ?? createId()
      return {
        ...step,
        id: nextStepId,
        sessionId,
        stepNumber: existingSteps.length + index + 1,
        screenshotId: step.screenshotId ? (screenshotIdMap.get(step.screenshotId) ?? null) : null,
      }
    })

    const screenshotRecords = await Promise.all(
      backup.screenshots.map((screenshot) =>
        this.toScreenshotRecord(screenshot, sessionId, screenshotIdMap, stepIdMap)
      )
    )

    const session: Session = existingSession
      ? {
          ...existingSession,
          tags: Array.from(new Set([...existingSession.tags, ...backup.session.tags])),
          stepCount: existingSteps.length + importedSteps.length,
          updatedAt: importedAt,
        }
      : {
          ...backup.session,
          id: sessionId,
          status: backup.session.status === 'active' ? 'completed' : backup.session.status,
          stepCount: importedSteps.length,
          updatedAt: importedAt,
        }

    const tx = db.transaction(['sessions', 'steps', 'screenshots'], 'readwrite')
    await tx.objectStore('sessions').put(session)

    for (const screenshot of screenshotRecords) {
      await tx.objectStore('screenshots').put(screenshot)
    }

    for (const step of importedSteps) {
      await tx.objectStore('steps').put(step)
    }

    await tx.done

    return {
      session,
      steps: importedSteps,
      importedStepCount: importedSteps.length,
      merged,
    }
  }

  private async toScreenshotRecord(
    screenshot: SessionBackupScreenshot,
    sessionId: string,
    screenshotIdMap: Map<string, string>,
    stepIdMap: Map<string, string>
  ): Promise<ScreenshotRecord> {
    const blob = await this.dataUrlToBlob(screenshot.dataUrl, screenshot.mimeType)

    return {
      id: screenshotIdMap.get(screenshot.id) ?? createId(),
      stepId: stepIdMap.get(screenshot.stepId) ?? screenshot.stepId,
      sessionId,
      blob,
      width: screenshot.width,
      height: screenshot.height,
      capturedAt: screenshot.capturedAt,
      sizeBytes: blob.size || screenshot.sizeBytes,
    }
  }

  private async dataUrlToBlob(dataUrl: string, fallbackMimeType: string): Promise<Blob> {
    const response = await fetch(dataUrl)
    const blob = await response.blob()

    if (blob.type) {
      return blob
    }

    return new Blob([await blob.arrayBuffer()], {
      type: fallbackMimeType || 'application/octet-stream',
    })
  }
}
