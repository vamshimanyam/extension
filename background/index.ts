import type { RuntimeEventType, RuntimeRequestMessage, RuntimeResponse } from '../messaging/types'
import { CaptureService } from './capture/captureService'
import { TabInfoService } from './capture/tabInfoService'
import { TechDataBuffer, type ConsoleBridgePayload } from './capture/techDataBuffer'
import { CommandHandler } from './commandHandler'
import { MessageRouter } from './messageRouter'
import { SessionManager } from './session/sessionManager'
import { StepFactory } from './session/stepFactory'
import { StepValidator } from './session/stepValidator'
import { getDb } from './storage/db'
import { DashboardRepo } from './storage/dashboardRepo'
import { ScreenshotRepo } from './storage/screenshotRepo'
import { SessionRepo } from './storage/sessionRepo'
import { SettingsRepo } from './storage/settingsRepo'
import { WriteQueue } from './storage/writeQueue'

let initialized = false

const sessionRepo = new SessionRepo()
const screenshotRepo = new ScreenshotRepo()
const dashboardRepo = new DashboardRepo()
const settingsRepo = new SettingsRepo()
const writeQueue = new WriteQueue()

const sessionManager = new SessionManager(sessionRepo)
const captureService = new CaptureService()
const tabInfoService = new TabInfoService()
const stepFactory = new StepFactory()
const stepValidator = new StepValidator()
const techDataBuffer = new TechDataBuffer(settingsRepo)

const notifyUI = (type: RuntimeEventType, payload: unknown): void => {
  void chrome.runtime.sendMessage({ type, payload }).catch(() => {
    // Side panel may be closed; notification delivery is best-effort.
  })
}

const commandHandler = new CommandHandler(
  sessionManager,
  captureService,
  tabInfoService,
  stepFactory,
  stepValidator,
  screenshotRepo,
  settingsRepo,
  writeQueue,
  notifyUI
)

const messageRouter = new MessageRouter(
  sessionManager,
  screenshotRepo,
  dashboardRepo,
  settingsRepo,
  techDataBuffer,
  notifyUI
)

async function ensureConsoleBridge(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const bridgeFlag = '__qaConsoleBridgeInjected__'
      const globalWindow = window as unknown as Record<string, unknown>

      if (globalWindow[bridgeFlag]) {
        return
      }

      globalWindow[bridgeFlag] = true

      window.addEventListener('message', (event: MessageEvent) => {
        const data = event.data as
          | {
              source?: string
              payload?: ConsoleBridgePayload
            }
          | undefined

        if (event.source !== window || !data || data.source !== 'qa-console-capture' || !data.payload) {
          return
        }

        void chrome.runtime.sendMessage({
          type: 'TRACK_CONSOLE_ENTRY',
          payload: data.payload,
        })
      })
    },
  })

  await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: () => {
      const patchFlag = '__qaConsolePatchInstalled__'
      const globalWindow = window as unknown as Record<string, unknown>

      if (globalWindow[patchFlag]) {
        return
      }

      globalWindow[patchFlag] = true

      const levels = ['log', 'warn', 'error', 'info', 'debug'] as const

      const toText = (value: unknown): string => {
        if (typeof value === 'string') {
          return value
        }

        try {
          return JSON.stringify(value)
        } catch {
          return String(value)
        }
      }

      levels.forEach((level) => {
        const original = console[level].bind(console)
        console[level] = (...args: unknown[]) => {
          const message = args.map((arg) => toText(arg)).join(' ')

          window.postMessage(
            {
              source: 'qa-console-capture',
              payload: {
                level,
                message,
                source: 'page-console',
                timestamp: new Date().toISOString(),
              },
            },
            '*'
          )

          original(...args)
        }
      })
    },
  })
}

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(() => {
    // Side panel may be unavailable on older Chromium variants.
  })

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason !== 'install') {
    return
  }

  void chrome.storage.local.set({
    qaOnboardingDismissed: false,
    qaFirstCaptureTipSeen: false,
  })
})

async function init(): Promise<void> {
  if (initialized) {
    return
  }

  await getDb()
  await settingsRepo.get()
  await techDataBuffer.syncLimits()
  await sessionManager.recoverOrphanedSessions()

  const restoredSession = await sessionManager.restoreActiveSession()
  if (restoredSession) {
    notifyUI('SESSION_RESTORED', { session: restoredSession })
  }

  const tabs = await chrome.tabs.query({})
  for (const tab of tabs) {
    if (tab.id != null && tab.url?.startsWith('http')) {
      await ensureConsoleBridge(tab.id)
    }
  }

  initialized = true
}

function isConsoleBridgeMessage(
  message: unknown
): message is { type: 'TRACK_CONSOLE_ENTRY'; payload: ConsoleBridgePayload } {
  if (!message || typeof message !== 'object') {
    return false
  }

  const candidate = message as { type?: unknown; payload?: unknown }
  return candidate.type === 'TRACK_CONSOLE_ENTRY'
}

function isRuntimeRequestMessage(message: unknown): message is RuntimeRequestMessage {
  if (!message || typeof message !== 'object') {
    return false
  }

  const candidate = message as { type?: unknown }
  return typeof candidate.type === 'string'
}

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (isConsoleBridgeMessage(message)) {
    const senderTabId = sender.tab?.id

    if (senderTabId != null) {
      void requireInit(async () => {
        techDataBuffer.trackConsoleEntry(senderTabId, message.payload)

        if (message.payload.level !== 'error') {
          return
        }

        const settings = await settingsRepo.get()
        if (!settings.smartCapture.autoCaptureConsoleErrors || sender.tab?.active === false) {
          return
        }

        await commandHandler.captureAutomatic(
          `Auto-captured console error: ${message.payload.message.slice(0, 160)}`,
          sender.tab
        )
      })().catch(() => {
        // Console capture is best-effort and must never interrupt request handling.
      })
    }

    sendResponse({ ok: true, data: { tracked: true } })
    return true
  }

  if (!isRuntimeRequestMessage(message)) {
    sendResponse({
      ok: false,
      error: 'Unsupported runtime message shape',
    })
    return true
  }

  void requireInit(async () => {
    const response = (await messageRouter.handle(message)) as RuntimeResponse<unknown>
    sendResponse(response)
  })().catch((error: unknown) => {
    sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })
  })

  return true
})
 
function requireInit<Args extends unknown[]>(fn: (...args: Args) => Promise<void>) {
  return async (...args: Args): Promise<void> => {
    if (!initialized) {
      await init()
    }

    await fn(...args)
  }
}

chrome.commands.onCommand.addListener((command) => {
  void requireInit(async () => {
    await commandHandler.handle(command)
  })()
})

chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    void requireInit(async () => {
      techDataBuffer.trackBeforeRequest(details)
    })()
  },
  { urls: ['<all_urls>'] },
  ['requestBody']
)

chrome.webRequest.onCompleted.addListener(
  (details) => {
    void requireInit(async () => {
      techDataBuffer.trackRequestCompleted(details)
    })()
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders']
)

chrome.webRequest.onErrorOccurred.addListener(
  (details) => {
    void requireInit(async () => {
      techDataBuffer.trackRequestError(details)
    })()
  },
  { urls: ['<all_urls>'] }
)

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading') {
    void requireInit(async () => {
      techDataBuffer.markNavigation(tabId)
    })()
  }

  if (changeInfo.status === 'complete' && tab.url?.startsWith('http')) {
    void requireInit(async () => {
      await ensureConsoleBridge(tabId)

      const settings = await settingsRepo.get()
      if (settings.smartCapture.autoCaptureNavigation && tab.active !== false) {
        await commandHandler.captureAutomatic(`Auto-captured navigation: ${tab.url ?? 'page loaded'}`, tab)
      }
    })()
  }
})

chrome.tabs.onRemoved.addListener((tabId) => {
  void requireInit(async () => {
    techDataBuffer.removeTab(tabId)
  })()
})

void init().catch(() => {
  // Service worker init failures are surfaced via request/command handlers.
})
