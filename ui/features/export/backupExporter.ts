import { sendMessage } from '../../../messaging/client'
import type { SessionBackup, SessionBackupBundle, SessionBackupScreenshot, SessionImportResult } from '../../../types/backup'
import type { Session } from '../../../types/session'
import type { Settings } from '../../../types/settings'
import type { Step } from '../../../types/step'

function sanitizeFileName(name: string): string {
  return name
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)
}

function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = url
  anchor.download = fileName
  document.body.append(anchor)
  anchor.click()
  anchor.remove()

  URL.revokeObjectURL(url)
}

export async function buildSessionBackup(session: Session, steps: Step[]): Promise<SessionBackup> {
  const screenshotIds = Array.from(new Set(steps.map((step) => step.screenshotId).filter(Boolean))) as string[]
  const screenshots: SessionBackupScreenshot[] = []

  for (const screenshotId of screenshotIds) {
    const response = await sendMessage('GET_SCREENSHOT', { screenshotId })
    if (!response.screenshot) {
      continue
    }

    screenshots.push({
      id: response.screenshot.id,
      stepId: response.screenshot.stepId,
      sessionId: response.screenshot.sessionId,
      width: response.screenshot.width,
      height: response.screenshot.height,
      capturedAt: response.screenshot.capturedAt,
      sizeBytes: response.screenshot.sizeBytes,
      mimeType: response.screenshot.mimeType,
      dataUrl: response.screenshot.dataUrl,
    })
  }

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    session,
    steps,
    screenshots,
  }
}

export async function exportSessionBackup(session: Session, steps: Step[]): Promise<void> {
  const backup = await buildSessionBackup(session, steps)
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: 'application/json',
  })
  const dateSuffix = new Date().toISOString().slice(0, 10)
  const fileBase = sanitizeFileName(session.name || 'qa-session-backup') || 'qa-session-backup'
  downloadBlob(blob, `${fileBase}-${dateSuffix}.qa-session.json`)
}

export function exportSessionBackupBundle(backups: SessionBackup[]): void {
  const bundle: SessionBackupBundle = {
    version: 1,
    exportedAt: new Date().toISOString(),
    sessions: backups,
  }
  const blob = new Blob([JSON.stringify(bundle, null, 2)], {
    type: 'application/json',
  })
  const dateSuffix = new Date().toISOString().slice(0, 10)
  downloadBlob(blob, `qa-session-backups-${dateSuffix}.qa-sessions.json`)
}

export async function importSessionBackupFile(file: File): Promise<SessionImportResult> {
  const text = await file.text()
  const backup = JSON.parse(text) as SessionBackup

  if (!backup || backup.version !== 1 || !backup.session || !Array.isArray(backup.steps)) {
    throw new Error('The selected file is not a valid QA session backup.')
  }

  return sendMessage('IMPORT_SESSION_BACKUP', { backup })
}

export function buildJiraDescription(session: Session, steps: Step[]): string {
  const failedSteps = steps.filter((step) => step.status === 'fail')
  const warningSteps = steps.filter((step) => step.status === 'warning')
  const lines = [
    `QA Session: ${session.name}`,
    `Environment: ${session.environment || 'Not set'}`,
    `Tester: ${session.testerName || 'Not set'}`,
    `Steps: ${steps.length}`,
    `Failures: ${failedSteps.length}`,
    `Warnings: ${warningSteps.length}`,
    '',
    'Key findings:',
    ...(failedSteps.length > 0 ? failedSteps : warningSteps).slice(0, 10).map((step) => {
      return `- Step ${step.stepNumber} [${step.status.toUpperCase()}] ${step.note || step.pageTitle || step.url}`
    }),
  ]

  return lines.join('\n')
}

export function buildSlackSummary(session: Session, steps: Step[], channelLabel?: string): string {
  const passCount = steps.filter((step) => step.status === 'pass').length
  const failCount = steps.filter((step) => step.status === 'fail').length
  const warningCount = steps.filter((step) => step.status === 'warning').length
  const heading = channelLabel ? `${channelLabel} QA session ready` : 'QA session ready'

  return [
    `*${heading}:* ${session.name}`,
    `Status: ${session.status} | Steps: ${steps.length} | Pass: ${passCount} | Fail: ${failCount} | Warning: ${warningCount}`,
    session.environment ? `Environment: ${session.environment}` : '',
    steps.find((step) => step.status === 'fail')?.note ? `Top failure: ${steps.find((step) => step.status === 'fail')?.note}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export async function copyTextToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text)
}

export function openJiraIssue(settings: Settings, session: Session, steps: Step[]): boolean {
  const baseUrl = settings.integrations.jiraBaseUrl.trim().replace(/\/+$/, '')
  const projectKey = settings.integrations.jiraProjectKey.trim()

  if (!baseUrl || !projectKey) {
    return false
  }

  const params = new URLSearchParams({
    summary: `QA findings - ${session.name}`,
    description: buildJiraDescription(session, steps),
    pid: projectKey,
  })

  window.open(`${baseUrl}/secure/CreateIssue!default.jspa?${params.toString()}`, '_blank', 'noopener,noreferrer')
  return true
}