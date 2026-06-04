import { COMMANDS, type CaptureCommand } from '../config/hotkeys'
import type { RuntimeEventType } from '../messaging/types'
import { CaptureService } from './capture/captureService'
import type { RegionCaptureBounds } from './capture/captureService'
import { TabInfoService } from './capture/tabInfoService'
import { SessionManager } from './session/sessionManager'
import { StepFactory } from './session/stepFactory'
import { StepValidator } from './session/stepValidator'
import { ScreenshotRepo } from './storage/screenshotRepo'
import { SettingsRepo } from './storage/settingsRepo'
import { WriteQueue } from './storage/writeQueue'
import { createId } from './utils/idGen'

interface NotifyFn {
  (type: RuntimeEventType, payload: unknown): void
}

interface CaptureStepOptions {
  tab?: chrome.tabs.Tab
  regionBounds?: RegionCaptureBounds
  note?: string
}

export class CommandHandler {
  private readonly sessionManager: SessionManager

  private readonly captureService: CaptureService

  private readonly tabInfoService: TabInfoService

  private readonly stepFactory: StepFactory

  private readonly stepValidator: StepValidator

  private readonly screenshotRepo: ScreenshotRepo

  private readonly settingsRepo: SettingsRepo

  private readonly writeQueue: WriteQueue

  private readonly notify: NotifyFn

  private readonly smartCaptureCooldownByTab = new Map<number, number>()

  public constructor(
    sessionManager: SessionManager,
    captureService: CaptureService,
    tabInfoService: TabInfoService,
    stepFactory: StepFactory,
    stepValidator: StepValidator,
    screenshotRepo: ScreenshotRepo,
    settingsRepo: SettingsRepo,
    writeQueue: WriteQueue,
    notify: NotifyFn
  ) {
    this.sessionManager = sessionManager
    this.captureService = captureService
    this.tabInfoService = tabInfoService
    this.stepFactory = stepFactory
    this.stepValidator = stepValidator
    this.screenshotRepo = screenshotRepo
    this.settingsRepo = settingsRepo
    this.writeQueue = writeQueue
    this.notify = notify
  }

  public async handle(command: string): Promise<void> {
    switch (command as CaptureCommand) {
      case COMMANDS.captureSilent:
        await this.captureStep('silent')
        return
      case COMMANDS.captureNote:
        await this.captureStep('note')
        return
      case COMMANDS.captureTech:
        await this.captureStep('tech')
        return
      case COMMANDS.captureRegion:
        await this.captureRegionStep()
        return
      default:
        return
    }
  }

  public async captureAutomatic(reason: string, tab?: chrome.tabs.Tab): Promise<void> {
    const targetTab = tab ?? (await this.tabInfoService.getActiveTab())
    if (targetTab.id == null || targetTab.active === false) {
      return
    }

    const now = Date.now()
    const lastCaptureAt = this.smartCaptureCooldownByTab.get(targetTab.id) ?? 0
    if (now - lastCaptureAt < 5000) {
      return
    }

    this.smartCaptureCooldownByTab.set(targetTab.id, now)
    await this.captureStep('silent', {
      tab: targetTab,
      note: reason,
    })
  }

  private async captureRegionStep(): Promise<void> {
    const tab = await this.tabInfoService.getActiveTab()

    if (tab.id == null) {
      this.notify('CAPTURE_ERROR', {
        code: 'TAB_NOT_ACTIVE',
        message: 'Please focus the target tab before using region capture.',
      })
      return
    }

    const regionBounds = await this.requestRegionSelection(tab.id)
    if (!regionBounds) {
      return
    }

    await this.captureStep('region', {
      tab,
      regionBounds,
    })
  }

  private async captureStep(
    mode: 'silent' | 'note' | 'tech' | 'region',
    options?: CaptureStepOptions
  ): Promise<void> {
    const settings = await this.settingsRepo.get()

    const quota = await this.captureService.checkStorageQuota()
    if (quota === 'critical') {
      this.notify('CAPTURE_ERROR', {
        code: 'QUOTA_EXCEEDED',
        message: 'Storage is full. Delete or export old sessions to continue.',
      })
      return
    }

    if (quota === 'warning') {
      this.notify('STORAGE_WARNING', {
        message: 'Storage is above 75%. Consider exporting and cleaning old sessions.',
      })
    }

    const activeSession = await this.sessionManager.getActiveSession()
    const session =
      activeSession ??
      (await this.sessionManager.startSession({
        name: this.createAutoSessionName(settings.session.autoNameFormat),
        environment: settings.session.defaultEnvironment || undefined,
        testerName: settings.session.defaultTesterName || undefined,
      }))

    const tab = options?.tab ?? (await this.tabInfoService.getActiveTab())
    const tabInfo = await this.tabInfoService.getTabInfo(tab)

    const captureResult = await this.captureService.captureVisibleTab(
      settings.capture.format,
      settings.capture.quality,
      {
        region: options?.regionBounds,
      }
    )

    const screenshotId = captureResult ? createId() : null
    const stepNumber = await this.sessionManager.nextStepNumber(session.id)

    const step = this.stepFactory.create({
      sessionId: session.id,
      stepNumber,
      tabInfo,
      screenshotId,
      captureMode: mode,
      note: options?.note,
      regionBounds: options?.regionBounds
        ? {
            x: options.regionBounds.x,
            y: options.regionBounds.y,
            width: options.regionBounds.width,
            height: options.regionBounds.height,
          }
        : undefined,
    })

    this.stepValidator.validate(step)

    let savedStep = step

    try {
      await this.writeQueue.enqueue(async () => {
        if (captureResult && screenshotId) {
          await this.screenshotRepo.create({
            id: screenshotId,
            stepId: step.id,
            sessionId: step.sessionId,
            blob: captureResult.blob,
            width: captureResult.width,
            height: captureResult.height,
            capturedAt: step.timestamp,
            sizeBytes: captureResult.sizeBytes,
          })
        }

        await this.sessionManager.appendStep(step)
      })
    } catch (error) {
      if (!captureResult) {
        throw error
      }

      savedStep = {
        ...step,
        screenshotId: null,
      }

      await this.writeQueue.enqueue(async () => {
        await this.sessionManager.appendStep(savedStep)
      })

      this.notify('CAPTURE_ERROR', {
        code: 'SCREENSHOT_SAVE_FAILED',
        message: 'Screenshot storage failed. The step was saved with metadata only.',
      })
    }

    this.notify('STEP_ADDED', { step: savedStep })

    if (!captureResult || savedStep.screenshotId === null) {
      this.notify('CAPTURE_ERROR', {
        code: 'CAPTURE_FAILED',
        message: 'Screenshot failed. The step was still saved with metadata.',
      })
    }

    if (mode === 'note' || (mode === 'region' && settings.capture.regionModeDefault === 'ask')) {
      this.notify('OPEN_NOTE_POPUP', {
        stepId: savedStep.id,
      })
      return
    }

    if (mode === 'tech' && tab.id != null) {
      this.notify('OPEN_TECH_POPUP', {
        stepId: savedStep.id,
        tabId: tab.id,
      })
    }
  }

  private async requestRegionSelection(tabId: number): Promise<RegionCaptureBounds | null> {
    try {
      const injectionResult = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          return new Promise((resolve) => {
            const overlayId = '__qa_region_capture_overlay__'
            const existingOverlay = document.getElementById(overlayId)
            if (existingOverlay) {
              existingOverlay.remove()
            }

            const host = document.createElement('div')
            host.id = overlayId
            Object.assign(host.style, {
              position: 'fixed',
              inset: '0',
              zIndex: '2147483647',
            })

            const shadowRoot = host.attachShadow({ mode: 'closed' })
            const overlay = document.createElement('div')
            Object.assign(overlay.style, {
              position: 'fixed',
              inset: '0',
              cursor: 'crosshair',
              background: 'transparent',
              userSelect: 'none',
            })

            const createDimLayer = (): HTMLDivElement => {
              const layer = document.createElement('div')
              Object.assign(layer.style, {
                position: 'fixed',
                background: 'rgba(15, 15, 20, 0.48)',
                pointerEvents: 'none',
              })
              return layer
            }

            const dimTop = createDimLayer()
            const dimRight = createDimLayer()
            const dimBottom = createDimLayer()
            const dimLeft = createDimLayer()

            const selectionBox = document.createElement('div')
            Object.assign(selectionBox.style, {
              position: 'fixed',
              border: '2px solid #ffffff',
              background: 'transparent',
              display: 'none',
              pointerEvents: 'none',
            })

            const sizeTooltip = document.createElement('div')
            Object.assign(sizeTooltip.style, {
              position: 'fixed',
              display: 'none',
              padding: '4px 6px',
              borderRadius: '6px',
              background: 'rgba(0, 0, 0, 0.72)',
              color: '#ffffff',
              fontSize: '11px',
              fontFamily: 'monospace',
              pointerEvents: 'none',
            })

            const controls = document.createElement('div')
            Object.assign(controls.style, {
              position: 'fixed',
              display: 'none',
              gap: '6px',
              padding: '6px',
              borderRadius: '8px',
              background: 'rgba(20, 20, 25, 0.88)',
              border: '1px solid rgba(255, 255, 255, 0.22)',
              zIndex: '2147483647',
            })

            type SelectionPayload = {
              cancelled: boolean
              region?: {
                x: number
                y: number
                width: number
                height: number
                devicePixelRatio: number
              }
            }

            const createButton = (label: string, background: string): HTMLButtonElement => {
              const button = document.createElement('button')
              button.type = 'button'
              button.textContent = label
              Object.assign(button.style, {
                border: 'none',
                borderRadius: '6px',
                padding: '6px 10px',
                color: '#ffffff',
                fontSize: '12px',
                cursor: 'pointer',
                background,
              })
              return button
            }

            const captureButton = createButton('Capture', '#2f7d32')
            const retryButton = createButton('Retry', '#455a64')
            const cancelButton = createButton('Cancel', '#b23c3c')

            controls.append(captureButton, retryButton, cancelButton)
            overlay.append(dimTop, dimRight, dimBottom, dimLeft, selectionBox, sizeTooltip, controls)
            shadowRoot.appendChild(overlay)
            document.documentElement.appendChild(host)

            let dragging = false
            let hasSelection = false
            let startX = 0
            let startY = 0
            let left = 0
            let top = 0
            let width = 0
            let height = 0

            const cleanup = (payload: SelectionPayload) => {
              window.removeEventListener('keydown', onKeyDown, true)
              overlay.removeEventListener('mousedown', onMouseDown)
              overlay.removeEventListener('mousemove', onMouseMove)
              overlay.removeEventListener('mouseup', onMouseUp)
              host.remove()
              resolve(payload)
            }

            const renderDimLayers = () => {
              if (width < 1 || height < 1) {
                Object.assign(dimTop.style, {
                  left: '0px',
                  top: '0px',
                  width: `${window.innerWidth}px`,
                  height: `${window.innerHeight}px`,
                })
                ;[dimRight, dimBottom, dimLeft].forEach((layer) => {
                  Object.assign(layer.style, {
                    left: '0px',
                    top: '0px',
                    width: '0px',
                    height: '0px',
                  })
                })
                return
              }

              Object.assign(dimTop.style, {
                left: '0px',
                top: '0px',
                width: `${window.innerWidth}px`,
                height: `${Math.max(0, top)}px`,
              })
              Object.assign(dimRight.style, {
                left: `${left + width}px`,
                top: `${top}px`,
                width: `${Math.max(0, window.innerWidth - left - width)}px`,
                height: `${height}px`,
              })
              Object.assign(dimBottom.style, {
                left: '0px',
                top: `${top + height}px`,
                width: `${window.innerWidth}px`,
                height: `${Math.max(0, window.innerHeight - top - height)}px`,
              })
              Object.assign(dimLeft.style, {
                left: '0px',
                top: `${top}px`,
                width: `${Math.max(0, left)}px`,
                height: `${height}px`,
              })
            }

            const hideSelectionUi = () => {
              selectionBox.style.display = 'none'
              sizeTooltip.style.display = 'none'
              controls.style.display = 'none'
              hasSelection = false
              width = 0
              height = 0
              renderDimLayers()
            }

            const renderSelection = () => {
              if (width < 1 || height < 1) {
                selectionBox.style.display = 'none'
                sizeTooltip.style.display = 'none'
                renderDimLayers()
                return
              }

              selectionBox.style.display = 'block'
              selectionBox.style.left = `${left}px`
              selectionBox.style.top = `${top}px`
              selectionBox.style.width = `${width}px`
              selectionBox.style.height = `${height}px`

              sizeTooltip.style.display = 'block'
              sizeTooltip.textContent = `${Math.round(width)} x ${Math.round(height)}`

              const tooltipX = Math.min(window.innerWidth - 90, Math.max(8, left + width + 8))
              const tooltipY = Math.min(window.innerHeight - 28, Math.max(8, top - 6))
              sizeTooltip.style.left = `${tooltipX}px`
              sizeTooltip.style.top = `${tooltipY}px`
              renderDimLayers()
            }

            const updateSelection = (x: number, y: number) => {
              left = Math.min(startX, x)
              top = Math.min(startY, y)
              width = Math.abs(x - startX)
              height = Math.abs(y - startY)

              renderSelection()
            }

            const nudgeSelection = (deltaX: number, deltaY: number) => {
              if (!hasSelection) {
                return
              }

              left = Math.max(0, Math.min(window.innerWidth - width, left + deltaX))
              top = Math.max(0, Math.min(window.innerHeight - height, top + deltaY))
              renderSelection()
              showControls()
            }

            const showControls = () => {
              controls.style.display = 'flex'
              controls.style.left = `${Math.max(8, Math.min(window.innerWidth - 220, left))}px`
              controls.style.top = `${Math.max(8, Math.min(window.innerHeight - 42, top + height + 8))}px`
            }

            const confirmSelection = () => {
              if (!hasSelection || width < 10 || height < 10) {
                return
              }

              cleanup({
                cancelled: false,
                region: {
                  x: left,
                  y: top,
                  width,
                  height,
                  devicePixelRatio: window.devicePixelRatio || 1,
                },
              })
            }

            const onMouseDown = (event: MouseEvent) => {
              if (event.button !== 0) {
                return
              }

              if (event.target instanceof HTMLElement && controls.contains(event.target)) {
                return
              }

              event.preventDefault()
              dragging = true
              startX = event.clientX
              startY = event.clientY
              hideSelectionUi()
              updateSelection(event.clientX, event.clientY)
            }

            const onMouseMove = (event: MouseEvent) => {
              if (!dragging) {
                return
              }

              event.preventDefault()
              updateSelection(event.clientX, event.clientY)
            }

            const onMouseUp = (event: MouseEvent) => {
              if (!dragging) {
                return
              }

              dragging = false
              event.preventDefault()
              updateSelection(event.clientX, event.clientY)

              hasSelection = width >= 10 && height >= 10
              if (hasSelection) {
                showControls()
              } else {
                sizeTooltip.style.display = 'block'
                sizeTooltip.textContent = 'Selection too small (min 10 x 10)'
              }
            }

            const onKeyDown = (event: KeyboardEvent) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                cleanup({ cancelled: true })
                return
              }

              if (event.key === 'Enter') {
                event.preventDefault()
                confirmSelection()
                return
              }

              if (event.key.startsWith('Arrow') && hasSelection) {
                event.preventDefault()

                const stepSize = event.shiftKey ? 10 : 1
                if (event.key === 'ArrowLeft') {
                  nudgeSelection(-stepSize, 0)
                } else if (event.key === 'ArrowRight') {
                  nudgeSelection(stepSize, 0)
                } else if (event.key === 'ArrowUp') {
                  nudgeSelection(0, -stepSize)
                } else if (event.key === 'ArrowDown') {
                  nudgeSelection(0, stepSize)
                }
              }
            }

            captureButton.addEventListener('click', (event: MouseEvent) => {
              event.preventDefault()
              event.stopPropagation()
              confirmSelection()
            })

            retryButton.addEventListener('click', (event: MouseEvent) => {
              event.preventDefault()
              event.stopPropagation()
              hideSelectionUi()
            })

            cancelButton.addEventListener('click', (event: MouseEvent) => {
              event.preventDefault()
              event.stopPropagation()
              cleanup({ cancelled: true })
            })

            renderDimLayers()
            overlay.addEventListener('mousedown', onMouseDown)
            overlay.addEventListener('mousemove', onMouseMove)
            overlay.addEventListener('mouseup', onMouseUp)
            window.addEventListener('keydown', onKeyDown, true)
          })
        },
      })

      const selectionResult = injectionResult[0]?.result as
        | {
            cancelled: boolean
            region?: RegionCaptureBounds
          }
        | undefined

      if (!selectionResult || selectionResult.cancelled || !selectionResult.region) {
        return null
      }

      return selectionResult.region
    } catch {
      this.notify('CAPTURE_ERROR', {
        code: 'REGION_SELECTION_FAILED',
        message: 'Region capture is not available on this page.',
      })
      return null
    }
  }

  private createAutoSessionName(format: string): string {
    const now = new Date()
    const date = now.toLocaleDateString()
    const time = now.toLocaleTimeString()
    return (format || 'Session - {date} {time}')
      .replaceAll('{date}', date)
      .replaceAll('{time}', time)
      .trim()
  }
}
