# Screenshot Capture And Image Processing From Scratch

Screenshot capture is the core feature of this QA extension. It looks simple from the user side: press a shortcut and get a screenshot. Internally, it crosses multiple extension systems: commands, tabs, permissions, service worker logic, image processing, storage, and UI updates.

---

## 1. What Browser Screenshot Capture Means

Chrome extensions can capture the visible area of a tab using:

```ts
const dataUrl = await chrome.tabs.captureVisibleTab({ format: 'png' })
```

Important details:

- It captures the visible viewport, not the full scrollable page.
- It returns a data URL.
- It can fail on restricted pages.
- It needs extension permissions and an active tab context.
- It should be called from a privileged extension runtime.

For QA documentation, visible viewport capture is often enough because it records exactly what the tester saw.

---

## 2. Capture Pipeline

Full flow:

```text
User presses hotkey
CommandHandler starts capture
Storage quota is checked
Active session is loaded or created
Active tab metadata is collected
Visible tab screenshot is captured as PNG data URL
Image is processed to WebP or PNG Blob
Screenshot Blob is stored in IndexedDB
Step metadata is created with screenshotId
Step is saved
UI receives STEP_ADDED event
Timeline updates
```

This pipeline is intentionally split across services so no single file owns everything.

---

## 3. Why Capture PNG First

`chrome.tabs.captureVisibleTab` supports limited formats. PNG is a safe source format because it preserves screenshot quality.

Then the extension can decide storage format:

```text
Capture source -> PNG data URL
Storage output -> WebP Blob by default
Export output -> PNG conversion when required by exporter
```

This gives good quality at capture time and smaller files at storage time.

---

## 4. Data URL vs Blob

Data URL example:

```text
data:image/png;base64,iVBORw0KGgoAAA...
```

Blob example:

```ts
new Blob([bytes], { type: 'image/webp' })
```

Use data URLs for:

- Browser image `src` values.
- JSON backups when needed.
- Small temporary transport.

Use blobs for:

- IndexedDB screenshot storage.
- Large binary data.
- Export file generation.

Do not store huge data URLs inside every step record.

---

## 5. Converting Data URL To Blob

Simple approach:

```ts
const response = await fetch(dataUrl)
const blob = await response.blob()
```

Why this works: data URLs can be fetched by browser APIs, and the response body can be read as a Blob.

---

## 6. Image Processing With `createImageBitmap`

`createImageBitmap` decodes image data into a bitmap that can be drawn to canvas.

```ts
const sourceResponse = await fetch(dataUrl)
const sourceBlob = await sourceResponse.blob()
const bitmap = await createImageBitmap(sourceBlob)
```

Draw to canvas:

```ts
const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
const context = canvas.getContext('2d')

if (!context) {
  throw new Error('Canvas context unavailable')
}

context.drawImage(bitmap, 0, 0)
bitmap.close()
```

Always close the bitmap when done.

---

## 7. WebP Compression

Convert canvas to WebP:

```ts
const blob = await canvas.convertToBlob({
  type: 'image/webp',
  quality: 0.85,
})
```

Quality values are usually `0` to `1`, not `0` to `100`.

If settings store quality as a percentage, normalize:

```ts
const normalizedQuality = Math.max(0.6, Math.min(1, quality / 100))
```

Why clamp:

- Avoid extremely poor image quality.
- Avoid invalid values.
- Keep output predictable.

---

## 8. Region Crop Capture

Region capture has two parts:

1. Get selected viewport bounds from page overlay.
2. Crop the full screenshot bitmap to those bounds.

Selection is in CSS pixels:

```ts
{
  x: 100,
  y: 80,
  width: 420,
  height: 240,
  devicePixelRatio: 2
}
```

Screenshot bitmap may be physical pixels, so convert:

```ts
const ratio = region.devicePixelRatio || 1
const cropX = Math.round(region.x * ratio)
const cropY = Math.round(region.y * ratio)
const cropWidth = Math.round(region.width * ratio)
const cropHeight = Math.round(region.height * ratio)
```

Draw crop:

```ts
context.drawImage(
  bitmap,
  crop.x,
  crop.y,
  crop.width,
  crop.height,
  0,
  0,
  crop.width,
  crop.height
)
```

---

## 9. Clamping Crop Bounds

Never trust region bounds blindly.

```ts
const x = Math.max(0, Math.min(rawX, sourceWidth - 1))
const y = Math.max(0, Math.min(rawY, sourceHeight - 1))
const width = Math.max(1, Math.min(rawWidth, sourceWidth - x))
const height = Math.max(1, Math.min(rawHeight, sourceHeight - y))
```

This prevents errors when:

- User drags to the edge.
- Browser zoom changes dimensions.
- Device pixel ratio creates rounding differences.
- Screenshot size differs from expected viewport size.

---

## 10. Storage Quota Before Capture

Screenshots can fill browser storage.

Check:

```ts
const estimate = await navigator.storage.estimate()
const used = estimate.usage ?? 0
const quota = estimate.quota ?? 0
const percentUsed = quota > 0 ? (used / quota) * 100 : 0
```

Project behavior:

```text
below 75 percent -> capture
75 to 90 percent -> capture with warning
90 percent or more -> block capture and ask cleanup
```

This avoids losing data in the middle of a capture session.

---

## 11. Saving Metadata When Screenshot Fails

Capture can fail. Storage can fail. The tab can be restricted.

Good behavior:

```text
If screenshot fails but tab metadata exists, save a metadata-only step.
```

Why:

- The tester still gets timestamp, URL, note, and context.
- The session timeline remains useful.
- One failed screenshot does not destroy the workflow.

Step shape:

```ts
{
  screenshotId: null,
  captureMode: 'silent',
  url,
  domain,
  pageTitle,
}
```

---

## 12. Screenshot Storage Design

Store screenshot record:

```ts
interface ScreenshotRecord {
  id: string
  stepId: string
  sessionId: string
  blob: Blob
  width: number
  height: number
  capturedAt: string
  sizeBytes: number
}
```

Store step reference:

```ts
interface Step {
  screenshotId: string | null
}
```

This keeps session and step reads fast.

---

## 13. Advanced Capture Ideas

Possible future improvements:

- Full-page stitched screenshots.
- Thumbnail generation at capture time.
- Screenshot deduplication.
- Automatic blur/redaction before storage.
- Capture delay option after hotkey.
- Element-only capture through page selection.
- Side-by-side diff generation.

Each adds complexity. Build visible viewport capture first.

---

## 14. Capture Checklist

- Confirm active tab exists.
- Confirm page is capturable.
- Check storage quota.
- Capture visible tab as PNG data URL.
- Convert to Blob.
- Crop if region exists.
- Compress to configured format.
- Store Blob separately.
- Store step metadata with screenshot ID.
- Save metadata-only step if screenshot fails.
- Notify UI after persistence succeeds.
