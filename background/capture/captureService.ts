import { CAPTURE_LIMITS } from '../../config/constants'

export type QuotaStatus = 'ok' | 'warning' | 'critical'

export interface CaptureResult {
  blob: Blob
  width: number
  height: number
  sizeBytes: number
}

export interface RegionCaptureBounds {
  x: number
  y: number
  width: number
  height: number
  devicePixelRatio: number
}

interface CaptureOptions {
  region?: RegionCaptureBounds
}

interface WorkerRequest {
  dataUrl: string
  format: 'webp' | 'png'
  quality: number
  region?: RegionCaptureBounds
}

interface WorkerResponse {
  blob: Blob
  width: number
  height: number
}

export class CaptureService {
  private imageWorker: Worker | null

  public constructor() {
    this.imageWorker = this.createWorkerSafely()
  }

  public async captureVisibleTab(
    format: 'webp' | 'png',
    quality: number,
    options?: CaptureOptions
  ): Promise<CaptureResult | null> {
    let dataUrl: string

    try {
      dataUrl = await chrome.tabs.captureVisibleTab({ format: 'png' })
    } catch {
      return null
    }

    let processed: WorkerResponse

    try {
      processed = await this.processImage({
        dataUrl,
        format,
        quality,
        region: options?.region,
      })
    } catch {
      return null
    }

    return {
      blob: processed.blob,
      width: processed.width,
      height: processed.height,
      sizeBytes: processed.blob.size,
    }
  }

  public async checkStorageQuota(): Promise<QuotaStatus> {
    if (!navigator.storage?.estimate) {
      return 'ok'
    }

    const estimate = await navigator.storage.estimate()
    const used = estimate.usage ?? 0
    const quota = estimate.quota ?? 0

    if (quota === 0) {
      return 'ok'
    }

    const percentUsed = (used / quota) * 100

    if (percentUsed >= CAPTURE_LIMITS.criticalQuotaPercent) {
      return 'critical'
    }

    if (percentUsed >= CAPTURE_LIMITS.warningQuotaPercent) {
      return 'warning'
    }

    return 'ok'
  }

  private processImage(message: WorkerRequest): Promise<WorkerResponse> {
    if (!this.imageWorker) {
      return this.processImageInline(message)
    }

    return new Promise((resolve, reject) => {
      const onMessage = (event: MessageEvent<WorkerResponse>) => {
        cleanup()
        resolve(event.data)
      }

      const onError = (error: ErrorEvent) => {
        cleanup()
        reject(error)
      }

      const cleanup = () => {
        this.imageWorker?.removeEventListener('message', onMessage)
        this.imageWorker?.removeEventListener('error', onError)
      }

      this.imageWorker?.addEventListener('message', onMessage)
      this.imageWorker?.addEventListener('error', onError)
      this.imageWorker?.postMessage(message)
    })
  }

  private createWorkerSafely(): Worker | null {
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

  private async processImageInline(message: WorkerRequest): Promise<WorkerResponse> {
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
    const crop = this.getCropArea(bitmap.width, bitmap.height, message.region)
    const canvas = new OffscreenCanvas(crop.width, crop.height)
    const context = canvas.getContext('2d')

    if (!context) {
      bitmap.close()
      return {
        blob: sourceBlob,
        width: crop.width,
        height: crop.height,
      }
    }

    context.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height)
    bitmap.close()

    const mimeType = message.format === 'png' ? 'image/png' : 'image/webp'
    const normalizedQuality = Math.max(0.6, Math.min(1, message.quality / 100))

    const blob = await canvas.convertToBlob({
      type: mimeType,
      quality: normalizedQuality,
    })

    return {
      blob,
      width: canvas.width,
      height: canvas.height,
    }
  }

  private getCropArea(
    sourceWidth: number,
    sourceHeight: number,
    region?: RegionCaptureBounds
  ): { x: number; y: number; width: number; height: number } {
    if (!region) {
      return {
        x: 0,
        y: 0,
        width: sourceWidth,
        height: sourceHeight,
      }
    }

    const ratio = Math.max(0.1, region.devicePixelRatio || 1)
    const rawX = Math.round(region.x * ratio)
    const rawY = Math.round(region.y * ratio)
    const rawWidth = Math.round(region.width * ratio)
    const rawHeight = Math.round(region.height * ratio)

    const x = Math.max(0, Math.min(rawX, sourceWidth - 1))
    const y = Math.max(0, Math.min(rawY, sourceHeight - 1))
    const width = Math.max(1, Math.min(rawWidth, sourceWidth - x))
    const height = Math.max(1, Math.min(rawHeight, sourceHeight - y))

    return {
      x,
      y,
      width,
      height,
    }
  }
}
