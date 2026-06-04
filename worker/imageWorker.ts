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

interface WorkerResponse {
  blob: Blob
  width: number
  height: number
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const { dataUrl, format, quality, region } = event.data

  const sourceResponse = await fetch(dataUrl)
  const sourceBlob = await sourceResponse.blob()
  const imageBitmap = await createImageBitmap(sourceBlob)

  const crop = getCropArea(imageBitmap.width, imageBitmap.height, region)
  const width = crop.width
  const height = crop.height

  const canvas = new OffscreenCanvas(width, height)
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

  const payload: WorkerResponse = {
    blob,
    width,
    height,
  }

  self.postMessage(payload)
}

function getCropArea(
  sourceWidth: number,
  sourceHeight: number,
  region?: {
    x: number
    y: number
    width: number
    height: number
    devicePixelRatio: number
  }
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
