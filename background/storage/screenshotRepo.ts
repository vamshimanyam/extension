import type { ScreenshotImagePayload, ScreenshotRecord } from '../../types/screenshot'
import { getDb } from './db'

export class ScreenshotRepo {
  public async create(record: ScreenshotRecord): Promise<void> {
    const db = await getDb()
    await db.put('screenshots', record)
  }

  public async getById(id: string): Promise<ScreenshotRecord | null> {
    const db = await getDb()
    const record = await db.get('screenshots', id)
    return record ?? null
  }

  public async getImagePayloadById(id: string): Promise<ScreenshotImagePayload | null> {
    const record = await this.getById(id)
    if (!record) {
      return null
    }

    const dataUrl = await this.blobToDataUrl(record.blob)

    return {
      id: record.id,
      stepId: record.stepId,
      sessionId: record.sessionId,
      width: record.width,
      height: record.height,
      capturedAt: record.capturedAt,
      sizeBytes: record.sizeBytes,
      mimeType: record.blob.type || 'application/octet-stream',
      dataUrl,
    }
  }

  public async getBySessionId(sessionId: string): Promise<ScreenshotRecord[]> {
    const db = await getDb()
    return db.getAllFromIndex('screenshots', 'by-sessionId', sessionId)
  }

  public async deleteBySessionId(sessionId: string): Promise<void> {
    const db = await getDb()
    const tx = db.transaction(['screenshots'], 'readwrite')
    const records = await tx.objectStore('screenshots').index('by-sessionId').getAll(sessionId)

    for (const record of records) {
      await tx.objectStore('screenshots').delete(record.id)
    }

    await tx.done
  }

  private async blobToDataUrl(blob: Blob): Promise<string> {
    const buffer = await blob.arrayBuffer()
    const base64 = this.arrayBufferToBase64(buffer)
    const mimeType = blob.type || 'application/octet-stream'
    return `data:${mimeType};base64,${base64}`
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer)
    const chunkSize = 0x8000
    let binary = ''

    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      const chunk = bytes.subarray(offset, offset + chunkSize)
      binary += String.fromCharCode(...chunk)
    }

    return btoa(binary)
  }
}
