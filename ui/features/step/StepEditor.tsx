import { Badge, Box, Button, Card, Flex, Select, Text, TextArea, TextField } from '@radix-ui/themes'
import * as React from 'react'
import { sendMessage } from '../../../messaging/client'
import type { Annotation, Step, StepStatus } from '../../../types/step'

interface StepEditorProps {
  step: Step | null
  previousStep?: Step | null
  onDeleteStep?: (step: Step) => Promise<void>
  onDuplicateStep?: (step: Step) => Promise<void>
  disabled?: boolean
}

const STATUS_OPTIONS: StepStatus[] = ['unset', 'pass', 'fail', 'warning', 'info']
const ANNOTATION_TYPES: Annotation['type'][] = ['rect', 'circle', 'arrow', 'text', 'blur']

function createAnnotationId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Failed to load screenshot image'))
    image.src = dataUrl
  })
}

function createSizedCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function readScaledImagePixels(image: HTMLImageElement, width: number, height: number): ImageData | null {
  const canvas = createSizedCanvas(width, height)
  const context = canvas.getContext('2d', { willReadFrequently: true })

  if (!context) {
    return null
  }

  context.drawImage(image, 0, 0, width, height)
  return context.getImageData(0, 0, width, height)
}

async function createDiffPreview(previousDataUrl: string, currentDataUrl: string): Promise<{
  percentChanged: number
  dataUrl: string
}> {
  const [previousImage, currentImage] = await Promise.all([
    loadImage(previousDataUrl),
    loadImage(currentDataUrl),
  ])
  const width = 240
  const height = 140
  const previousPixels = readScaledImagePixels(previousImage, width, height)
  const currentPixels = readScaledImagePixels(currentImage, width, height)
  const canvas = createSizedCanvas(width, height)
  const context = canvas.getContext('2d')

  if (!context || !previousPixels || !currentPixels) {
    return {
      percentChanged: 0,
      dataUrl: currentDataUrl,
    }
  }

  const diffPixels = context.createImageData(width, height)
  let changedPixels = 0

  for (let index = 0; index < currentPixels.data.length; index += 4) {
    const redDiff = Math.abs(currentPixels.data[index] - previousPixels.data[index])
    const greenDiff = Math.abs(currentPixels.data[index + 1] - previousPixels.data[index + 1])
    const blueDiff = Math.abs(currentPixels.data[index + 2] - previousPixels.data[index + 2])
    const delta = Math.max(redDiff, greenDiff, blueDiff)

    if (delta > 24) {
      changedPixels += 1
    }

    diffPixels.data[index] = Math.min(255, delta * 2)
    diffPixels.data[index + 1] = currentPixels.data[index + 1] * 0.35
    diffPixels.data[index + 2] = currentPixels.data[index + 2] * 0.35
    diffPixels.data[index + 3] = 255
  }

  context.putImageData(diffPixels, 0, 0)

  return {
    percentChanged: Math.round((changedPixels / (width * height)) * 1000) / 10,
    dataUrl: canvas.toDataURL('image/png'),
  }
}

function StepEditor({ step, previousStep = null, onDeleteStep, onDuplicateStep, disabled = false }: StepEditorProps) {
  const [note, setNote] = React.useState(step?.note ?? '')
  const [status, setStatus] = React.useState<StepStatus>(step?.status ?? 'unset')
  const [annotations, setAnnotations] = React.useState<Annotation[]>(step?.annotations ?? [])
  const [annotationType, setAnnotationType] = React.useState<Annotation['type']>('rect')
  const [annotationColor, setAnnotationColor] = React.useState('#ef4444')
  const [annotationText, setAnnotationText] = React.useState('')
  const [screenshotSrc, setScreenshotSrc] = React.useState<string | null>(null)
  const [screenshotSize, setScreenshotSize] = React.useState({ width: 0, height: 0 })
  const [diffPreview, setDiffPreview] = React.useState<{ percentChanged: number; dataUrl: string } | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [duplicating, setDuplicating] = React.useState(false)

  React.useEffect(() => {
    let active = true

    const loadScreenshot = async () => {
      if (!step?.screenshotId) {
        setScreenshotSrc(null)
        setScreenshotSize({ width: 0, height: 0 })
        return
      }

      const response = await sendMessage('GET_SCREENSHOT', { screenshotId: step.screenshotId })
      if (!active || !response.screenshot) {
        return
      }

      setScreenshotSrc(response.screenshot.dataUrl)
      setScreenshotSize({
        width: response.screenshot.width || 1280,
        height: response.screenshot.height || 720,
      })
    }

    void loadScreenshot().catch(() => {
      if (active) {
        setScreenshotSrc(null)
      }
    })

    return () => {
      active = false
    }
  }, [step?.screenshotId])

  React.useEffect(() => {
    let active = true

    const loadDiff = async () => {
      if (!step?.screenshotId || !previousStep?.screenshotId) {
        setDiffPreview(null)
        return
      }

      const [currentResponse, previousResponse] = await Promise.all([
        sendMessage('GET_SCREENSHOT', { screenshotId: step.screenshotId }),
        sendMessage('GET_SCREENSHOT', { screenshotId: previousStep.screenshotId }),
      ])

      if (!active || !currentResponse.screenshot || !previousResponse.screenshot) {
        return
      }

      const preview = await createDiffPreview(previousResponse.screenshot.dataUrl, currentResponse.screenshot.dataUrl)
      if (active) {
        setDiffPreview(preview)
      }
    }

    void loadDiff().catch(() => {
      if (active) {
        setDiffPreview(null)
      }
    })

    return () => {
      active = false
    }
  }, [previousStep?.screenshotId, step?.screenshotId])

  if (!step) {
    return (
      <Card>
        <Text size="2" color="gray">
          Select a step to edit note and status.
        </Text>
      </Card>
    )
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await sendMessage('UPDATE_STEP', {
        stepId: step.id,
        updates: {
          note,
          status,
          annotations,
        },
      })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    const confirmed = globalThis.confirm('Delete this step? This action cannot be undone.')
    if (!confirmed) {
      return
    }

    if (onDeleteStep) {
      await onDeleteStep(step)
      return
    }

    await sendMessage('DELETE_STEP', { stepId: step.id })
  }

  const handleDuplicate = async () => {
    setDuplicating(true)
    try {
      if (onDuplicateStep) {
        await onDuplicateStep(step)
        return
      }

      await sendMessage('DUPLICATE_STEP', { stepId: step.id })
    } finally {
      setDuplicating(false)
    }
  }

  const handleAddAnnotationFromClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!screenshotSrc || screenshotSize.width <= 0 || screenshotSize.height <= 0 || disabled) {
      return
    }

    const bounds = event.currentTarget.getBoundingClientRect()
    const x = Math.round(((event.clientX - bounds.left) / bounds.width) * screenshotSize.width)
    const y = Math.round(((event.clientY - bounds.top) / bounds.height) * screenshotSize.height)
    const baseSize = Math.max(40, Math.round(screenshotSize.width * 0.08))
    const annotation: Annotation = {
      id: createAnnotationId(),
      type: annotationType,
      color: annotationColor,
      coords: {
        x,
        y,
        width: annotationType === 'text' || annotationType === 'arrow' ? undefined : baseSize,
        height: annotationType === 'text' || annotationType === 'arrow' ? undefined : baseSize,
        endX: annotationType === 'arrow' ? Math.min(screenshotSize.width, x + baseSize * 2) : undefined,
        endY: annotationType === 'arrow' ? Math.min(screenshotSize.height, y + baseSize) : undefined,
      },
      text: annotationText.trim() || undefined,
    }

    setAnnotations((current) => [...current, annotation])
  }

  const removeAnnotation = (annotationId: string) => {
    setAnnotations((current) => current.filter((annotation) => annotation.id !== annotationId))
  }

  return (
    <Card>
      <Flex direction="column" gap="3">
        <Flex justify="between" align="center">
          <Text size="2" weight="bold">
            Edit Step {step.stepNumber}
          </Text>
          <Badge color="gray" variant="soft">
            {step.captureMode}
          </Badge>
        </Flex>

        <Box>
          <Text as="label" size="1" color="gray">
            Status
          </Text>
          <Box mt="1">
            <Select.Root value={status} onValueChange={(value) => setStatus(value as StepStatus)} disabled={disabled}>
              <Select.Trigger />
              <Select.Content>
                {STATUS_OPTIONS.map((option) => (
                  <Select.Item key={option} value={option}>
                    {option.toUpperCase()}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select.Root>
          </Box>
        </Box>

        <Box>
          <Text as="label" size="1" color="gray">
            Note
          </Text>
          <Box mt="1">
            <TextArea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={6}
              placeholder="Describe what happened in this step..."
              disabled={disabled}
            />
          </Box>
        </Box>

        <Box>
          <Text as="label" size="1" color="gray">
            Screenshot Annotations
          </Text>
          <Flex direction="column" gap="2" mt="1">
            <Flex gap="2" align="center" wrap="wrap">
              <Select.Root value={annotationType} onValueChange={(value) => setAnnotationType(value as Annotation['type'])} disabled={disabled}>
                <Select.Trigger />
                <Select.Content>
                  {ANNOTATION_TYPES.map((type) => (
                    <Select.Item key={type} value={type}>
                      {type.toUpperCase()}
                    </Select.Item>
                  ))}
                </Select.Content>
              </Select.Root>
              <input
                type="color"
                value={annotationColor}
                aria-label="Annotation color"
                onChange={(event) => setAnnotationColor(event.target.value)}
                disabled={disabled}
              />
              <TextField.Root
                value={annotationText}
                onChange={(event) => setAnnotationText(event.target.value)}
                placeholder="Optional label"
                disabled={disabled}
              />
            </Flex>

            {screenshotSrc ? (
              <Box className="annotation-preview" onClick={handleAddAnnotationFromClick}>
                <img src={screenshotSrc} alt="Annotate screenshot" />
                {annotations.map((annotation) => (
                  <AnnotationOverlay
                    key={annotation.id}
                    annotation={annotation}
                    screenshotSize={screenshotSize}
                  />
                ))}
              </Box>
            ) : (
              <Text size="2" color="gray">
                No screenshot available for annotation.
              </Text>
            )}

            {annotations.length > 0 && (
              <Flex direction="column" gap="1">
                {annotations.map((annotation) => (
                  <Flex key={annotation.id} justify="between" align="center" gap="2" className="annotation-row">
                    <Text size="1">
                      {annotation.type.toUpperCase()} {annotation.text ? `- ${annotation.text}` : ''}
                    </Text>
                    <Button size="1" variant="ghost" color="red" onClick={() => removeAnnotation(annotation.id)} disabled={disabled}>
                      Remove
                    </Button>
                  </Flex>
                ))}
              </Flex>
            )}
          </Flex>
        </Box>

        {diffPreview && (
          <Box>
            <Text as="label" size="1" color="gray">
              Diff From Previous Step
            </Text>
            <Flex gap="2" align="center" mt="1" wrap="wrap">
              <img className="diff-preview" src={diffPreview.dataUrl} alt="Screenshot diff" />
              <Text size="2" color="gray">
                {diffPreview.percentChanged}% changed
              </Text>
            </Flex>
          </Box>
        )}

        <Flex justify="between" gap="2" wrap="wrap">
          <Flex gap="2" align="center" wrap="wrap">
            <Button variant="soft" onClick={() => void handleDuplicate()} loading={duplicating} disabled={disabled}>
              Duplicate
            </Button>
            <Button color="red" variant="soft" onClick={() => void handleDelete()} disabled={disabled}>
              Delete Step
            </Button>
          </Flex>
          <Button onClick={() => void handleSave()} loading={saving} disabled={disabled}>
            Save Changes
          </Button>
        </Flex>
      </Flex>
    </Card>
  )
}

function AnnotationOverlay({
  annotation,
  screenshotSize,
}: {
  annotation: Annotation
  screenshotSize: { width: number; height: number }
}) {
  const left = `${(annotation.coords.x / Math.max(1, screenshotSize.width)) * 100}%`
  const top = `${(annotation.coords.y / Math.max(1, screenshotSize.height)) * 100}%`
  const width = annotation.coords.width
    ? `${(annotation.coords.width / Math.max(1, screenshotSize.width)) * 100}%`
    : 'auto'
  const height = annotation.coords.height
    ? `${(annotation.coords.height / Math.max(1, screenshotSize.height)) * 100}%`
    : 'auto'

  if (annotation.type === 'text') {
    return (
      <span className="annotation-overlay annotation-text" style={{ left, top, color: annotation.color }}>
        {annotation.text || 'Note'}
      </span>
    )
  }

  if (annotation.type === 'arrow') {
    return (
      <span
        className="annotation-overlay annotation-arrow"
        style={{ left, top, borderColor: annotation.color }}
      />
    )
  }

  return (
    <span
      className={`annotation-overlay annotation-${annotation.type}`}
      style={{
        left,
        top,
        width,
        height,
        borderColor: annotation.color,
        backgroundColor: annotation.type === 'blur' ? `${annotation.color}33` : 'transparent',
      }}
    />
  )
}

export default StepEditor
