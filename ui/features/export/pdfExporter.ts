import { jsPDF } from 'jspdf'
import { sendMessage } from '../../../messaging/client'
import { DEFAULT_SETTINGS } from '../../../config/constants'
import type { Session } from '../../../types/session'
import type { Settings } from '../../../types/settings'
import type { Step } from '../../../types/step'

type ReportExportOptions = Settings['export']

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

async function getScreenshotDataUrl(screenshotId: string | null): Promise<{
  dataUrl: string
  width: number
  height: number
  mimeType: string
} | null> {
  if (!screenshotId) {
    return null
  }

  const response = await sendMessage('GET_SCREENSHOT', { screenshotId })
  if (!response.screenshot) {
    return null
  }

  return {
    dataUrl: response.screenshot.dataUrl,
    width: response.screenshot.width,
    height: response.screenshot.height,
    mimeType: response.screenshot.mimeType,
  }
}

async function toPngDataUrl(dataUrl: string, mimeType: string): Promise<string> {
  if (mimeType === 'image/png' || dataUrl.startsWith('data:image/png')) {
    return dataUrl
  }

  const response = await fetch(dataUrl)
  const blob = await response.blob()
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const context = canvas.getContext('2d')

  if (!context) {
    bitmap.close()
    return dataUrl
  }

  context.drawImage(bitmap, 0, 0)
  bitmap.close()
  return canvas.toDataURL('image/png', 0.95)
}

export async function exportSessionToPdf(
  session: Session,
  steps: Step[],
  options: ReportExportOptions = DEFAULT_SETTINGS.export
): Promise<void> {
  const exportSteps = options.includePassSteps ? steps : steps.filter((step) => step.status !== 'pass')
  const documentFile = new jsPDF({
    orientation: 'p',
    unit: 'pt',
    format: options.pageSize === 'Letter' ? 'letter' : 'a4',
  })

  const pageWidth = documentFile.internal.pageSize.getWidth()
  const pageHeight = documentFile.internal.pageSize.getHeight()
  const margin = 40
  const contentWidth = pageWidth - margin * 2

  documentFile.setFont('helvetica', 'bold')
  documentFile.setFontSize(18)
  const templateLabel = options.reportTemplate === 'standard' ? 'QA Session Report' : `QA ${options.reportTemplate} Report`
  documentFile.text(`${templateLabel} - ${session.name}`, margin, margin)

  documentFile.setFont('helvetica', 'normal')
  documentFile.setFontSize(11)
  if (options.includeSummaryTable) {
    documentFile.text(`Status: ${session.status}`, margin, margin + 24)
    documentFile.text(`Created: ${new Date(session.createdAt).toLocaleString()}`, margin, margin + 40)
    documentFile.text(`Steps: ${exportSteps.length}`, margin, margin + 56)
  }

  for (const step of exportSteps) {
    documentFile.addPage()

    let cursorY = margin

    documentFile.setFont('helvetica', 'bold')
    documentFile.setFontSize(14)
    const stepTitle = step.pageTitle.trim() ? `Step ${step.stepNumber} - ${step.pageTitle}` : `Step ${step.stepNumber}`
    documentFile.text(stepTitle, margin, cursorY)

    cursorY += 22
    documentFile.setFont('helvetica', 'normal')
    documentFile.setFontSize(10)

    const metadataLines = [
      `Status: ${step.status.toUpperCase()}`,
      `Domain: ${step.domain}`,
    ]

    if (options.includeTimestamps) {
      metadataLines.push(`Time: ${new Date(step.timestamp).toLocaleString()}`)
    }

    if (options.includeUrls) {
      metadataLines.push(`URL: ${step.url}`)
    }

    metadataLines.forEach((line) => {
      const wrapped = documentFile.splitTextToSize(line, contentWidth)
      documentFile.text(wrapped, margin, cursorY)
      cursorY += wrapped.length * 12 + 2
    })

    if (step.note.trim()) {
      const noteLines = documentFile.splitTextToSize(`Note: ${step.note.trim()}`, contentWidth)
      documentFile.text(noteLines, margin, cursorY)
      cursorY += noteLines.length * 12 + 8
    }

    const screenshot = options.includeScreenshots ? await getScreenshotDataUrl(step.screenshotId) : null
    if (screenshot) {
      const sourceWidth = screenshot.width > 0 ? screenshot.width : 1280
      const sourceHeight = screenshot.height > 0 ? screenshot.height : 720
      const ratio = sourceHeight / sourceWidth
      const imageWidth = contentWidth
      const imageHeight = Math.min(pageHeight - cursorY - margin, imageWidth * ratio)

      if (imageHeight > 40) {
        const pngDataUrl = await toPngDataUrl(screenshot.dataUrl, screenshot.mimeType)
        documentFile.addImage(pngDataUrl, 'PNG', margin, cursorY, imageWidth, imageHeight)
        cursorY += imageHeight + 10
      }
    }

    if (step.annotations.length > 0 && cursorY < pageHeight - margin - 40) {
      documentFile.setFont('helvetica', 'bold')
      documentFile.text('Annotations', margin, cursorY)
      cursorY += 14
      documentFile.setFont('helvetica', 'normal')

      for (const annotation of step.annotations.slice(0, 8)) {
        const line = `${annotation.type.toUpperCase()}: ${annotation.text || annotation.color}`
        const wrapped = documentFile.splitTextToSize(line, contentWidth)
        documentFile.text(wrapped, margin, cursorY)
        cursorY += wrapped.length * 11 + 2
      }
    }

    if (options.includeTechData && step.networkEntries.length > 0 && cursorY < pageHeight - margin - 40) {
      documentFile.setFont('helvetica', 'bold')
      documentFile.text('Network Entries', margin, cursorY)
      cursorY += 14
      documentFile.setFont('helvetica', 'normal')

      for (const entry of step.networkEntries.slice(0, 8)) {
        const line = `${entry.method} ${entry.urlPath} - ${entry.statusCode} (${entry.durationMs}ms)`
        const wrapped = documentFile.splitTextToSize(line, contentWidth)
        documentFile.text(wrapped, margin, cursorY)
        cursorY += wrapped.length * 11 + 2
        if (cursorY > pageHeight - margin - 20) {
          break
        }
      }
    }

    if (options.includeTechData && step.consoleEntries.length > 0 && cursorY < pageHeight - margin - 40) {
      documentFile.setFont('helvetica', 'bold')
      documentFile.text('Console Entries', margin, cursorY)
      cursorY += 14
      documentFile.setFont('helvetica', 'normal')

      for (const entry of step.consoleEntries.slice(0, 8)) {
        const line = `${entry.level.toUpperCase()}: ${entry.message}`
        const wrapped = documentFile.splitTextToSize(line, contentWidth)
        documentFile.text(wrapped, margin, cursorY)
        cursorY += wrapped.length * 11 + 2
        if (cursorY > pageHeight - margin - 20) {
          break
        }
      }
    }
  }

  const blob = documentFile.output('blob')
  const dateSuffix = new Date().toISOString().slice(0, 10)
  const fileBase = sanitizeFileName(session.name || 'qa-session-report') || 'qa-session-report'
  downloadBlob(blob, `${fileBase}-${dateSuffix}.pdf`)
}
