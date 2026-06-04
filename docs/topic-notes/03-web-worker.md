# Web Worker From Scratch

A Web Worker is a JavaScript runtime that runs separately from the main UI thread. In this project, a worker is used for image processing: decoding screenshot data, cropping regions, and compressing images.

Do not confuse a Web Worker with a Manifest V3 service worker. They are different runtimes.

---

## 1. Service Worker vs Web Worker

| Runtime | Purpose | Has Chrome extension APIs? | Has DOM? |
| --- | --- | --- | --- |
| Extension service worker | Background extension events | Yes | No |
| Web Worker | CPU-heavy isolated work | Usually no | No |

In this project:

- `background/index.ts` is the extension service worker.
- `worker/imageWorker.ts` is the Web Worker for image processing.

---

## 2. Why Use A Web Worker

Image processing can be expensive:

- Decode a screenshot.
- Create an image bitmap.
- Crop a selected area.
- Draw to canvas.
- Convert to WebP or PNG.

Doing that directly in a UI thread can make the interface feel slow. In this project the work starts from the background capture flow, but the same idea applies: isolate image processing so the capture service stays small and can fall back when workers are unavailable.

---

## 3. Minimal Web Worker Example

Worker file:

```ts
self.onmessage = (event: MessageEvent<{ value: number }>) => {
  const doubled = event.data.value * 2
  self.postMessage({ doubled })
}
```

Main file:

```ts
const worker = new Worker(new URL('./myWorker.ts', import.meta.url), {
  type: 'module',
})

worker.addEventListener('message', (event) => {
  console.log(event.data.doubled)
})

worker.postMessage({ value: 21 })
```

With Vite, `new URL(..., import.meta.url)` lets the bundler find and build the worker file.

---

## 4. This Project's Worker Responsibility

The image worker receives this kind of request:

```ts
interface WorkerRequest {
  dataUrl: string
  format: 'webp' | 'png'
  quality: number
  region?: {
    x: number
    y: number
    width: number
    height: number
    devicePixelRatio: number
  }
}
```

It responds with:

```ts
interface WorkerResponse {
  blob: Blob
  width: number
  height: number
}
```

The worker should only process images. It should not save to IndexedDB, read settings, or call Chrome APIs.

---

## 5. Image Processing Flow

```text
Receive screenshot data URL
Fetch data URL to get Blob
Create ImageBitmap from Blob
Calculate crop area
Create OffscreenCanvas
Draw source bitmap into canvas
Convert canvas to Blob
Post Blob, width, and height back
```

Conceptual worker code:

```ts
self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { dataUrl, format, quality, region } = event.data

  const sourceResponse = await fetch(dataUrl)
  const sourceBlob = await sourceResponse.blob()
  const imageBitmap = await createImageBitmap(sourceBlob)

  const crop = getCropArea(imageBitmap.width, imageBitmap.height, region)
  const canvas = new OffscreenCanvas(crop.width, crop.height)
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('Cannot initialize image processing context')
  }

  context.drawImage(
    imageBitmap,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    crop.width,
    crop.height
  )

  imageBitmap.close()

  const mimeType = format === 'png' ? 'image/png' : 'image/webp'
  const normalizedQuality = Math.max(0.6, Math.min(1, quality / 100))
  const blob = await canvas.convertToBlob({ type: mimeType, quality: normalizedQuality })

  self.postMessage({ blob, width: canvas.width, height: canvas.height })
}
```

---

## 6. Crop Math

Region selection is usually measured in CSS pixels from the viewport. Screenshot image dimensions may be physical pixels.

Example:

```text
devicePixelRatio = 2
selected CSS x = 100
selected CSS width = 300
bitmap x = 200
bitmap width = 600
```

Use this conversion:

```ts
const ratio = Math.max(0.1, region.devicePixelRatio || 1)
const rawX = Math.round(region.x * ratio)
const rawY = Math.round(region.y * ratio)
const rawWidth = Math.round(region.width * ratio)
const rawHeight = Math.round(region.height * ratio)
```

Then clamp to source dimensions:

```ts
const x = Math.max(0, Math.min(rawX, sourceWidth - 1))
const y = Math.max(0, Math.min(rawY, sourceHeight - 1))
const width = Math.max(1, Math.min(rawWidth, sourceWidth - x))
const height = Math.max(1, Math.min(rawHeight, sourceHeight - y))
```

Clamping prevents canvas errors when the selected region touches screen edges.

---

## 7. Creating A Worker Safely In An Extension

Do not assume workers are always available in a Manifest V3 background runtime.

Safer pattern:

```ts
function createWorkerSafely(): Worker | null {
  if (typeof Worker === 'undefined') {
    return null
  }

  try {
    return new Worker(new URL('../../worker/imageWorker.ts', import.meta.url), {
      type: 'module',
    })
  } catch {
    return null
  }
}
```

Why this matters:

- Worker construction can fail in some extension contexts.
- A top-level worker construction failure can break service worker startup.
- Capture should still work through a fallback.

---

## 8. Inline Fallback

If the worker is unavailable, process the image inline:

```ts
async function processImageInline(message: WorkerRequest): Promise<WorkerResponse> {
  const sourceResponse = await fetch(message.dataUrl)
  const sourceBlob = await sourceResponse.blob()

  if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined') {
    return {
      blob: sourceBlob,
      width: 0,
      height: 0,
    }
  }

  const bitmap = await createImageBitmap(sourceBlob)
  const crop = getCropArea(bitmap.width, bitmap.height, message.region)
  const canvas = new OffscreenCanvas(crop.width, crop.height)
  const context = canvas.getContext('2d')

  if (!context) {
    bitmap.close()
    return { blob: sourceBlob, width: crop.width, height: crop.height }
  }

  context.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height)
  bitmap.close()

  const blob = await canvas.convertToBlob({
    type: message.format === 'png' ? 'image/png' : 'image/webp',
    quality: Math.max(0.6, Math.min(1, message.quality / 100)),
  })

  return { blob, width: canvas.width, height: canvas.height }
}
```

This fallback is a progressive enhancement pattern: use the worker when possible, but keep the feature usable without it.

---

## 9. Message Correlation For Advanced Workers

This project sends one capture job at a time in normal use. If you later send concurrent jobs to the same worker, add request IDs.

Request:

```ts
worker.postMessage({
  requestId: 'job-1',
  dataUrl,
  format: 'webp',
  quality: 85,
})
```

Response:

```ts
self.postMessage({
  requestId,
  blob,
  width,
  height,
})
```

Without request IDs, responses can be matched to the wrong promise when multiple jobs overlap.

---

## 10. Web Worker Checklist

- Keep worker code focused on CPU-heavy processing.
- Do not call Chrome extension APIs from the worker.
- Do not use DOM APIs like `document`.
- Use `new URL(workerPath, import.meta.url)` with Vite.
- Use `type: 'module'`.
- Guard worker creation with feature detection and try/catch.
- Add an inline fallback.
- Close `ImageBitmap` after use.
- Clamp crop bounds.
- Clamp image quality.
- Add request IDs if jobs can overlap.

---

## 11. Common Worker Mistakes

| Mistake | Symptom | Fix |
| --- | --- | --- |
| Worker created at top level without try/catch | Service worker registration fails | Create worker safely |
| Worker imports app services | Bundle errors or runtime errors | Keep worker independent |
| No fallback | Capture fails in unsupported runtime | Add inline processing path |
| No crop clamping | Canvas errors near edges | Clamp x, y, width, height |
| Forgetting `imageBitmap.close()` | Memory pressure | Close bitmap after drawing |
| Concurrent jobs without IDs | Wrong promise receives response | Add request IDs |

---

## 12. Worker Types Beyond This Project

There are multiple worker-like runtimes in web development.

| Type | Created by | Shared? | Common use |
| --- | --- | --- | --- |
| Dedicated Web Worker | `new Worker(...)` | No | CPU work for one page or script |
| Shared Worker | `new SharedWorker(...)` | Yes, across same-origin contexts | Shared computation or connection |
| Service Worker | Browser registration | Yes for origin or extension scope | Network proxy, background events |
| Worklet | API-specific | Depends | Audio, paint, layout specialized work |
| Extension service worker | Manifest V3 | Extension background | Chrome extension events |

This project's `imageWorker.ts` is a dedicated Web Worker. The Manifest V3 background is an extension service worker. They are not interchangeable.

---

## 13. Structured Clone And Transferables

Worker messages use the structured clone algorithm. Many values can be copied between threads:

- Plain objects.
- Arrays.
- Blobs.
- ArrayBuffers.
- ImageBitmaps in many contexts.
- Maps and Sets in modern browsers.

Some values cannot be sent:

- Functions.
- DOM nodes.
- Class instances with methods as behavior.
- Some platform objects.

Copying large data can be expensive. For `ArrayBuffer`, you can transfer ownership instead of copying.

```ts
const buffer = new ArrayBuffer(1024)
worker.postMessage({ buffer }, [buffer])
```

After transfer, the sender no longer owns that buffer.

For screenshots, this project sends and receives `Blob` values. That is convenient and clear. For extremely high-performance image pipelines, `ArrayBuffer` or `ImageBitmap` transfer may be worth exploring.

---

## 14. Worker Lifecycle

A dedicated worker lives while something references it or until it is terminated.

Create:

```ts
const worker = new Worker(new URL('./imageWorker.ts', import.meta.url), {
  type: 'module',
})
```

Terminate:

```ts
worker.terminate()
```

In a long-lived web page, remember to terminate workers that are no longer needed. In a Manifest V3 service worker, lifecycle is already controlled by the browser, but still avoid creating unnecessary workers repeatedly.

Worker reuse pattern:

```ts
class ImageProcessor {
  private worker: Worker | null = null

  private getWorker(): Worker | null {
    if (!this.worker) {
      this.worker = createWorkerSafely()
    }

    return this.worker
  }
}
```

---

## 15. Worker Error Handling

There are two types of worker errors:

1. Worker construction errors.
2. Job execution errors.

Construction:

```ts
try {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
} catch {
  // Use fallback.
}
```

Job errors:

```ts
worker.addEventListener('error', (error) => {
  reject(error)
})

worker.addEventListener('messageerror', () => {
  reject(new Error('Worker message could not be deserialized'))
})
```

Inside the worker, wrap known failure points if you want structured error responses:

```ts
self.onmessage = async (event) => {
  try {
    const result = await processImage(event.data)
    self.postMessage({ ok: true, result })
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
```

This is more verbose but better for advanced worker pipelines.

---

## 16. Worker Pools

If many CPU-heavy jobs are queued, a worker pool can process jobs in parallel.

Concept:

```text
Job queue
Worker 1 -> job A
Worker 2 -> job B
Worker 3 -> job C
```

Use a pool when:

- Jobs are independent.
- There are many jobs.
- Each job is CPU-heavy.
- Parallelism is worth memory cost.

Avoid a pool when:

- Jobs are rare.
- The browser runtime is constrained.
- One worker is enough.
- You need strict ordering.

For this extension, one worker is enough because captures are user-driven and usually sequential.

---

## 17. OffscreenCanvas In Detail

`OffscreenCanvas` is canvas without a DOM element. It is designed for workers and non-DOM runtimes.

Normal canvas:

```ts
const canvas = document.createElement('canvas')
```

Offscreen canvas:

```ts
const canvas = new OffscreenCanvas(width, height)
```

Convert to blob:

```ts
const blob = await canvas.convertToBlob({
  type: 'image/webp',
  quality: 0.85,
})
```

Benefits:

- No DOM needed.
- Works in worker-like environments when supported.
- Good fit for image processing.

Fallback concern: not every runtime supports every image API. This is why the project checks both `OffscreenCanvas` and `createImageBitmap`.

---

## 18. Choosing Image Formats

Common browser image formats:

| Format | Strengths | Weaknesses |
| --- | --- | --- |
| PNG | Lossless, sharp UI text | Larger files |
| WebP | Smaller, good browser support | Lossy by default, older tooling may struggle |
| JPEG | Small photos | Bad for UI text and sharp edges |

For QA screenshots:

- PNG is safest for exact pixels.
- WebP is smaller and usually good enough.
- JPEG is usually a poor fit for UI-heavy screenshots.

This project defaults to WebP with quality around 85 because long QA sessions can contain many screenshots.

---

## 19. Advanced Image Pipeline Ideas

Future improvements could include:

- Generate separate thumbnails during capture.
- Store original and compressed versions.
- Add blur/redaction directly into exported screenshots.
- Use perceptual hashing to detect duplicate screenshots.
- Use pixel diff to auto-detect meaningful changes.
- Add worker request IDs for concurrent processing.
- Transfer `ArrayBuffer` instead of passing data URLs for lower overhead.

Each improvement has a cost. For a beginner rebuild, first make capture reliable, then optimize.

---

## 20. Worker Design Exercise

Before adding a worker to any app, answer:

1. Is the work CPU-heavy enough to justify a worker?
2. What exact request and response shapes are needed?
3. Can the data be cloned or transferred efficiently?
4. What happens if worker creation fails?
5. Can jobs overlap?
6. Do responses need request IDs?
7. How will errors be reported?
8. Is a single worker enough?
9. Does the worker need a termination strategy?
10. Can the same logic run inline as a fallback?
