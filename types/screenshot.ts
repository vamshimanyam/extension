export interface ScreenshotRecord {
  id: string
  stepId: string
  sessionId: string
  blob: Blob
  width: number
  height: number
  capturedAt: string
  sizeBytes: number
}

export interface ScreenshotImagePayload {
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
