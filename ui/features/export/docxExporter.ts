import {
  AlignmentType,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  TextRun,
} from 'docx'
import { sendMessage } from '../../../messaging/client'
import { DEFAULT_SETTINGS } from '../../../config/constants'
import type { Session } from '../../../types/session'
import type { Settings } from '../../../types/settings'
import type { ScreenshotImagePayload } from '../../../types/screenshot'
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

function makeParagraph(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun(text)],
    spacing: {
      after: 120,
    },
  })
}

async function getStepScreenshot(screenshotId: string | null): Promise<ScreenshotImagePayload | null> {
  if (!screenshotId) {
    return null
  }

  const response = await sendMessage('GET_SCREENSHOT', { screenshotId })
  return response.screenshot
}

async function createScreenshotParagraph(step: Step, options: ReportExportOptions): Promise<Paragraph | null> {
  if (!options.includeScreenshots) {
    return null
  }

  const screenshot = await getStepScreenshot(step.screenshotId)
  if (!screenshot) {
    return null
  }

  const imageData = await toPngImageData(screenshot.dataUrl, screenshot.mimeType)

  const sourceWidth = screenshot.width > 0 ? screenshot.width : 1280
  const sourceHeight = screenshot.height > 0 ? screenshot.height : 720
  const targetWidth = 560
  const targetHeight = Math.max(160, Math.round((sourceHeight / sourceWidth) * targetWidth))

  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new ImageRun({
        type: 'png',
        data: imageData,
        transformation: {
          width: targetWidth,
          height: targetHeight,
        },
      }),
    ],
    spacing: {
      after: 180,
    },
  })
}

async function toPngImageData(dataUrl: string, mimeType: string): Promise<Uint8Array> {
  const sourceResponse = await fetch(dataUrl)
  const sourceBlob = await sourceResponse.blob()

  if (mimeType === 'image/png' || sourceBlob.type === 'image/png') {
    return new Uint8Array(await sourceBlob.arrayBuffer())
  }

  if (typeof createImageBitmap === 'undefined') {
    return new Uint8Array(await sourceBlob.arrayBuffer())
  }

  const bitmap = await createImageBitmap(sourceBlob)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height

  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    return new Uint8Array(await sourceBlob.arrayBuffer())
  }

  context.drawImage(bitmap, 0, 0)
  bitmap.close()

  const pngBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (convertedBlob) => {
        if (!convertedBlob) {
          reject(new Error('Failed to convert screenshot to PNG for export'))
          return
        }
        resolve(convertedBlob)
      },
      'image/png',
      0.95
    )
  })

  return new Uint8Array(await pngBlob.arrayBuffer())
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

function buildSummaryParagraphs(session: Session, steps: Step[], options: ReportExportOptions): Paragraph[] {
  if (!options.includeSummaryTable) {
    return []
  }

  const passCount = steps.filter((step) => step.status === 'pass').length
  const failCount = steps.filter((step) => step.status === 'fail').length
  const warningCount = steps.filter((step) => step.status === 'warning').length
  const infoCount = steps.filter((step) => step.status === 'info').length

  return [
    makeParagraph(`Session: ${session.name}`),
    makeParagraph(`Status: ${session.status}`),
    makeParagraph(`Created: ${new Date(session.createdAt).toLocaleString()}`),
    makeParagraph(`Steps: ${steps.length}`),
    ...(session.testerName ? [makeParagraph(`Tester: ${session.testerName}`)] : []),
    ...(session.environment ? [makeParagraph(`Environment: ${session.environment}`)] : []),
    makeParagraph(`Pass: ${passCount} | Fail: ${failCount} | Warning: ${warningCount} | Info: ${infoCount}`),
  ]
}

async function buildStepParagraphs(step: Step, options: ReportExportOptions): Promise<Paragraph[]> {
  const screenshotParagraph = await createScreenshotParagraph(step, options)
  const headingText = step.pageTitle.trim() ? `Step ${step.stepNumber} - ${step.pageTitle}` : `Step ${step.stepNumber}`
  const noteText = step.note.trim()

  const paragraphs: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun(headingText)],
      spacing: {
        before: 240,
        after: 120,
      },
    }),
    makeParagraph(`Status: ${step.status.toUpperCase()}`),
    makeParagraph(`Domain: ${step.domain}`),
  ]

  if (options.includeTimestamps) {
    paragraphs.push(makeParagraph(`Time: ${new Date(step.timestamp).toLocaleString()}`))
  }

  if (options.includeUrls) {
    paragraphs.push(makeParagraph(`URL: ${step.url}`))
  }

  if (noteText) {
    paragraphs.push(makeParagraph(`Note: ${noteText}`))
  }

  if (screenshotParagraph) {
    paragraphs.push(screenshotParagraph)
  } else if (options.includeScreenshots) {
    paragraphs.push(makeParagraph('Screenshot: unavailable'))
  }

  if (step.annotations.length > 0) {
    paragraphs.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_3,
        children: [new TextRun('Annotations')],
      })
    )
    step.annotations.forEach((annotation) => {
      paragraphs.push(makeParagraph(`${annotation.type.toUpperCase()}: ${annotation.text || annotation.color}`))
    })
  }

  if (options.includeTechData && step.networkEntries.length > 0) {
    paragraphs.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_3,
        children: [new TextRun('Network Entries')],
      })
    )
    step.networkEntries.slice(0, 20).forEach((entry) => {
      paragraphs.push(
        makeParagraph(`${entry.method} ${entry.urlPath} - ${entry.statusCode} (${entry.durationMs}ms)`)
      )
    })
  }

  if (options.includeTechData && step.consoleEntries.length > 0) {
    paragraphs.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_3,
        children: [new TextRun('Console Entries')],
      })
    )
    step.consoleEntries.slice(0, 20).forEach((entry) => {
      paragraphs.push(makeParagraph(`${entry.level.toUpperCase()}: ${entry.message}`))
    })
  }

  return paragraphs
}

export async function exportSessionToDocx(
  session: Session,
  steps: Step[],
  options: ReportExportOptions = DEFAULT_SETTINGS.export
): Promise<void> {
  const exportSteps = options.includePassSteps ? steps : steps.filter((step) => step.status !== 'pass')
  const templateLabel = options.reportTemplate === 'standard' ? 'QA Session Report' : `QA ${options.reportTemplate} Report`
  const sectionsChildren: Paragraph[] = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun(`${templateLabel} - ${session.name}`)],
      spacing: {
        after: 240,
      },
    }),
    ...buildSummaryParagraphs(session, exportSteps, options),
  ]

  for (const step of exportSteps) {
    const stepParagraphs = await buildStepParagraphs(step, options)
    sectionsChildren.push(...stepParagraphs)
  }

  const documentFile = new Document({
    sections: [
      {
        children: sectionsChildren,
      },
    ],
  })

  const blob = await Packer.toBlob(documentFile)
  const dateSuffix = new Date().toISOString().slice(0, 10)
  const fileBase = sanitizeFileName(session.name || 'qa-session-report') || 'qa-session-report'
  const fileName = `${fileBase}-${dateSuffix}.docx`

  downloadBlob(blob, fileName)
}
