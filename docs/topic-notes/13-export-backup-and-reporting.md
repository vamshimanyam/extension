# Export, Backup, And Reporting From Scratch

The extension captures QA evidence, but the final value often comes from turning that evidence into a shareable report or portable backup. This note explains DOCX export, PDF export, JSON backups, import behavior, and reporting design.

---

## 1. Export vs Backup

Reports and backups are different.

| Type | Purpose | Human readable? | Re-importable? |
| --- | --- | --- | --- |
| DOCX | QA report for stakeholders | Yes | No |
| PDF | Fixed-format report | Yes | No |
| JSON backup | Preserve and restore session data | Not primarily | Yes |
| Jira/Slack text | Collaboration summary | Yes | No |

Do not use a report format as your only backup. Reports often lose structure needed for restore.

---

## 2. Report Data Inputs

A report usually needs:

```text
session metadata
ordered steps
screenshots
notes
statuses
annotations
network entries
console entries
export settings
```

The exporter should receive a clean data bundle, not query UI state randomly.

Example:

```ts
await exportSessionToDocx(session, steps, settings.export)
```

---

## 3. Export Settings

Useful export settings:

```text
include screenshots
include pass steps
include summary table
include timestamps
include URLs
include technical data
page size
report template
```

Why settings matter:

- Some reports should exclude passing steps.
- Some environments require URLs removed.
- Some reports should not include screenshots.
- Technical data can be noisy or sensitive.

---

## 4. DOCX Export

DOCX is editable and good for QA handoff documents.

Typical structure:

```text
Title
Session summary
Environment and tester
Pass/fail counts
Step 1
  metadata
  note
  screenshot
  technical evidence
Step 2
  ...
```

Using the `docx` package:

```ts
const documentFile = new Document({
  sections: [
    {
      children: [
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun('QA Session Report')],
        }),
      ],
    },
  ],
})

const blob = await Packer.toBlob(documentFile)
```

---

## 5. Screenshot Format For DOCX

DOCX image support can be stricter than browser display. If screenshots are stored as WebP, convert to PNG before inserting.

Concept:

```ts
async function toPngImageData(dataUrl: string): Promise<Uint8Array> {
  const response = await fetch(dataUrl)
  const blob = await response.blob()
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height

  const context = canvas.getContext('2d')
  context?.drawImage(bitmap, 0, 0)
  bitmap.close()

  const pngBlob = await new Promise<Blob>((resolve) => {
    canvas.toBlob((result) => resolve(result as Blob), 'image/png')
  })

  return new Uint8Array(await pngBlob.arrayBuffer())
}
```

---

## 6. PDF Export

PDF is good when the report should look the same everywhere.

Using `jspdf`:

```ts
const documentFile = new jsPDF({
  orientation: 'p',
  unit: 'pt',
  format: 'a4',
})

documentFile.text('QA Session Report', 40, 40)
documentFile.save('qa-session-report.pdf')
```

PDF challenges:

- Text wrapping.
- Page breaks.
- Image scaling.
- Long URLs.
- Large screenshots.
- Technical data tables.

Keep PDF layout conservative.

---

## 7. JSON Backup

JSON backup should preserve enough data to restore a session.

Backup shape:

```ts
interface SessionBackup {
  version: number
  exportedAt: string
  session: Session
  steps: Step[]
  screenshots: SessionBackupScreenshot[]
}
```

Screenshot backup record:

```ts
interface SessionBackupScreenshot {
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
```

Use data URLs because JSON cannot store `Blob` directly.

---

## 8. Import And Merge

Import is harder than export.

Cases:

```text
Session ID does not exist -> import as new session
Session ID already exists -> merge steps into existing session
Backup contains active session -> import as completed for safety
Screenshot IDs conflict -> generate new screenshot IDs
Step IDs conflict -> generate new step IDs
```

ID remapping maps:

```ts
const stepIdMap = new Map<string, string>()
const screenshotIdMap = new Map<string, string>()
```

Then rewrite imported steps:

```ts
const importedStep = {
  ...step,
  id: stepIdMap.get(step.id) ?? step.id,
  screenshotId: step.screenshotId ? screenshotIdMap.get(step.screenshotId) ?? null : null,
}
```

---

## 9. File Naming

Sanitize filenames.

```ts
function sanitizeFileName(name: string): string {
  return name
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)
}
```

Why:

- Operating systems reject certain characters.
- Long names are awkward.
- Whitespace-heavy names look messy.

Include a date suffix:

```text
my-session-2026-05-29.docx
```

---

## 10. Downloading Files

DOM anchor approach:

```ts
const url = URL.createObjectURL(blob)
const anchor = document.createElement('a')
anchor.href = url
anchor.download = fileName
document.body.append(anchor)
anchor.click()
anchor.remove()
URL.revokeObjectURL(url)
```

Chrome downloads API approach:

```ts
await chrome.downloads.download({
  url,
  filename: fileName,
  saveAs: true,
})
```

The anchor approach avoids the `downloads` permission and works well from extension pages.

---

## 11. Export Performance

Export can be heavy because screenshots are large.

Performance rules:

- Lazy-load exporter modules.
- Load screenshots only during export.
- Process steps sequentially if memory is tight.
- Limit technical entries included per step.
- Scale screenshots to report width.
- Show loading state.

Lazy import:

```ts
const { exportSessionToPdf } = await import('./pdfExporter')
```

---

## 12. Reporting Design

Good QA reports answer:

- What was tested?
- Who tested it?
- Which environment?
- What passed?
- What failed?
- What evidence supports the result?
- What needs follow-up?

Possible templates:

| Template | Best for |
| --- | --- |
| Standard | General QA session report |
| Bug report | Failure-focused output |
| Handoff | Summary for another tester or team |

---

## 13. Export Checklist

- Keep report export separate from backup export.
- Use settings to control included data.
- Convert screenshots when target format requires it.
- Sanitize filenames.
- Avoid loading all screenshots before needed.
- Version JSON backup format.
- Remap IDs on backup merge.
- Let users export before destructive cleanup.
- Treat backups as sensitive files.
