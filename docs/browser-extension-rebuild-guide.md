# QA Session Documenter - Browser Extension Rebuild Guide

This guide explains how to rebuild this extension from an empty folder. It is written for someone who is new to browser extension development, so it starts with the browser extension basics and then walks through the actual architecture used in this project.

The current project is a Manifest V3 Chrome/Chromium extension built with Vite, React, TypeScript, Radix UI, Zustand, IndexedDB, and a Web Worker-style image processing pipeline. Its purpose is simple: help QA testers capture browser testing steps, screenshots, notes, technical evidence, and exportable reports without leaving their testing flow.

Use this guide together with the source code. The guide explains the design, the order to build it, why each part exists, and the common mistakes to avoid.

---

## 1. What You Are Building

The product is a local-first QA session documentation extension.

User workflow:

```text
Start or auto-create a QA session
Use keyboard shortcuts while testing a website
Capture screenshot, URL, page title, browser info, and window size
Optionally attach notes, network requests, and console messages
Review steps in the side panel timeline
Edit step notes, statuses, and annotations
Export the session to DOCX, PDF, or JSON backup
```

Core extension surfaces:

| Surface | What it means | This project uses it for |
| --- | --- | --- |
| Manifest | The extension declaration file | Permissions, commands, side panel, service worker |
| Background service worker | Event-driven background runtime | Hotkeys, capture, storage, webRequest, routing |
| Side panel page | Extension UI shown beside the browser tab | React app for sessions, timeline, settings, exports |
| Injected page scripts | Code temporarily inserted into a website tab | Region selection overlay and console capture bridge |
| Web Worker | Separate thread-like runtime | Image crop and compression when available |
| IndexedDB | Browser database | Sessions, steps, screenshots, settings |
| chrome.runtime messaging | Communication bus | React UI asks background to read/write/capture |

---

## 2. Browser Extension Basics

### 2.1 What A Browser Extension Is

A browser extension is a packaged web application with extra browser permissions. Normal websites cannot capture the visible tab, listen for extension hotkeys, open side panels, or inspect browser-level network events. Extensions can do those things only when the manifest requests the correct permissions.

An extension usually contains:

```text
manifest.json        Defines the extension and its capabilities
background/*         Long-lived logic in MV2, event-driven service worker in MV3
ui/*                 Extension pages, popups, options, side panel, or full pages
content/*            Scripts that run inside matching web pages
worker/*             Web workers for CPU-heavy isolated work
types/*              Shared TypeScript contracts
messaging/*          Runtime message contracts and helpers
```

This project does not declare a permanent content script in `manifest.json`. Instead, it injects scripts on demand using `chrome.scripting.executeScript`. That keeps the extension quieter and only touches pages when needed.

### 2.2 Manifest V3 Mental Model

Chrome extensions now use Manifest V3. The most important difference from older Manifest V2 is the background runtime.

Manifest V2 used persistent background pages. Manifest V3 uses a service worker.

That means:

- The background code wakes up for events and can be stopped by the browser later.
- In-memory variables can disappear between events.
- Anything important must be persisted to storage.
- Event listeners should be registered at the top level.
- Async message handlers must call `sendResponse` and return `true` if they respond later.
- The service worker has no DOM. Do not use `document`, regular `window` DOM APIs, or React there.

This project uses the service worker for orchestration, not UI rendering.

### 2.3 Extension Runtime Types

| Runtime | Has DOM? | Good for | Bad for |
| --- | --- | --- | --- |
| Background service worker | No | Browser APIs, commands, storage, routing | UI, DOM rendering, long-running in-memory state |
| Side panel page | Yes | React UI, forms, exports, user interaction | Browser-level event listeners |
| Injected script | Yes, inside target tab | Page overlays, console patching | Trusted storage and private extension state |
| Web Worker | No | CPU-heavy work, image processing | DOM access and Chrome extension APIs |

### 2.4 Permissions Used By This Extension

From `manifest.json`:

```json
{
  "permissions": [
    "activeTab",
    "tabs",
    "commands",
    "scripting",
    "webRequest",
    "sidePanel",
    "storage"
  ],
  "host_permissions": ["<all_urls>"]
}
```

What each permission does:

| Permission | Why it is needed |
| --- | --- |
| `activeTab` | Allows temporary access to the active tab after user action |
| `tabs` | Reads active tab URL, title, ID, and window info |
| `commands` | Defines keyboard shortcuts like capture silent or capture with note |
| `scripting` | Injects region overlay and console bridge scripts |
| `webRequest` | Observes network request metadata for technical evidence |
| `sidePanel` | Registers the React side panel UI |
| `storage` | Uses `chrome.storage.local` for lightweight extension flags and active session ID |
| `<all_urls>` | Lets capture and technical tracking work across tested sites |

For a production extension, always ask if `<all_urls>` is really needed. It is convenient for a QA tool because testers may work across many domains, but it is still a broad permission.

---

## 3. Current Project Map

Important files and folders:

```text
manifest.json                         Extension declaration
vite.config.ts                        Vite + CRX plugin config
package.json                          Scripts and dependencies

background/index.ts                   Service worker composition root and listeners
background/commandHandler.ts          Hotkey and capture workflows
background/messageRouter.ts           Request/response API used by the UI
background/capture/captureService.ts  Visible tab capture, crop, compression
background/capture/tabInfoService.ts  Active tab metadata
background/capture/techDataBuffer.ts  Network and console buffer
background/session/sessionManager.ts  Session and step business rules
background/session/stepFactory.ts     Builds Step objects consistently
background/session/stepValidator.ts   Validates required Step fields
background/storage/db.ts              IndexedDB schema
background/storage/sessionRepo.ts     Session and step persistence
background/storage/screenshotRepo.ts  Screenshot blob persistence
background/storage/settingsRepo.ts    Settings persistence
background/storage/dashboardRepo.ts   Storage/dashboard statistics
background/storage/writeQueue.ts      Serializes capture writes

config/constants.ts                   Defaults and storage constants
config/hotkeys.ts                     Command name constants

messaging/types.ts                    Typed runtime request/event contracts
messaging/client.ts                   UI helper for chrome.runtime messaging

types/*.ts                            Shared data models

ui/App.tsx                            Main side panel app shell
ui/main.tsx                           React entry point
ui/store/*.ts                         Zustand stores
ui/features/session/*                 Start session and session header UI
ui/features/timeline/*                Step timeline UI
ui/features/step/*                    Step editor, annotations, diff preview
ui/features/tech/*                    Attach buffered technical data
ui/features/export/*                  DOCX, PDF, JSON backup, Jira/Slack helpers
ui/features/home/*                    IndexedDB dashboard
ui/sections/settings/*                Settings UI

worker/imageWorker.ts                 Image crop/compression worker
```

---

## 4. Rebuild Roadmap From Scratch

Build in phases. Do not start with every feature at once. A stable MVP is easier to extend than a large half-working extension.

Recommended build order:

1. Create Vite React TypeScript project.
2. Add Manifest V3 and CRX/Vite build setup.
3. Create shared TypeScript data models.
4. Add typed runtime messaging.
5. Add IndexedDB schema and repositories.
6. Build session management without screenshots.
7. Build the background service worker shell.
8. Build a minimal side panel that starts and lists sessions.
9. Add screenshot capture and screenshot storage.
10. Add keyboard commands.
11. Add timeline and step editor.
12. Add Web Worker image processing and fallback.
13. Add region capture overlay.
14. Add network and console buffering.
15. Add export features.
16. Add settings, storage dashboard, and cleanup tools.
17. Harden errors, quota handling, and release packaging.

Each phase below explains the goal, files, implementation notes, and acceptance check.

---

## 5. Phase 1 - Create The Project

### Goal

Create a React + TypeScript project that can be bundled as a Chrome extension.

### Commands

```bash
npm create vite@latest qa-session-documenter -- --template react-ts
cd qa-session-documenter
npm install
```

Install runtime dependencies:

```bash
npm install @crxjs/vite-plugin @radix-ui/themes docx html2canvas idb jspdf lucide-react nanoid zustand
```

Install development dependencies if they are not already present:

```bash
npm install -D @types/chrome sass eslint typescript vite @vitejs/plugin-react
```

### Why These Libraries Exist

| Package | Purpose |
| --- | --- |
| `@crxjs/vite-plugin` | Lets Vite understand Chrome extension manifests and extension entry points |
| `react`, `react-dom` | Side panel UI |
| `@radix-ui/themes` | UI primitives and styling foundation |
| `zustand` | Small client-side state stores |
| `idb` | Type-friendly IndexedDB wrapper |
| `docx` | DOCX report generation |
| `jspdf` | PDF report generation |
| `lucide-react` | Icons |
| `nanoid` | IDs, although this repo currently uses a small utility around random IDs |
| `sass` | SCSS support |
| `@types/chrome` | TypeScript types for Chrome extension APIs |

### Acceptance Check

Run:

```bash
npm run build
```

At this stage it should build as a normal React app. Extension features come next.

---

## 6. Phase 2 - Add Manifest V3

### Goal

Teach Chrome what the extension is and which browser capabilities it needs.

### Create `manifest.json`

Minimal version:

```json
{
  "manifest_version": 3,
  "name": "QA Session Documenter",
  "version": "0.1.0",
  "description": "Quickly capture, organize, and export QA test sessions without breaking your workflow.",
  "permissions": ["activeTab", "tabs", "commands", "scripting", "webRequest", "sidePanel", "storage"],
  "host_permissions": ["<all_urls>"],
  "side_panel": {
    "default_path": "ui/index.html"
  },
  "background": {
    "service_worker": "background/index.ts",
    "type": "module"
  },
  "action": {
    "default_title": "Open QA Session Documenter"
  },
  "commands": {
    "capture-silent": {
      "suggested_key": { "default": "Ctrl+Shift+S", "mac": "Command+Shift+S" },
      "description": "Capture silently (no popup)"
    }
  },
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'none'; base-uri 'none';"
  }
}
```

Then add all four commands:

| Command | Shortcut | Purpose |
| --- | --- | --- |
| `capture-silent` | `Ctrl+Shift+S` / `Command+Shift+S` | Capture step without opening a dialog |
| `capture-note` | `Ctrl+Shift+N` / `Command+Shift+N` | Capture step and open editor for note |
| `capture-tech` | `Ctrl+Shift+D` / `Command+Shift+D` | Capture step and open technical data picker |
| `capture-region` | `Ctrl+Shift+R` / `Command+Shift+R` | Let user select a viewport region before capture |

### Configure Vite

`vite.config.ts` should import the manifest and add the CRX plugin:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json'

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
```

### Acceptance Check

Run:

```bash
npm run build
```

Then open Chrome or Edge:

```text
chrome://extensions
```

Enable Developer Mode, choose Load unpacked, and select `dist`.

---

## 7. Phase 3 - Define The Data Model

### Goal

Before building UI or storage, define what a session, step, screenshot, setting, network entry, and console entry look like.

### Session

A session is one testing run.

Important fields:

| Field | Meaning |
| --- | --- |
| `id` | Stable unique ID |
| `name` | User-facing session name |
| `status` | `active`, `completed`, or `archived` |
| `createdAt`, `updatedAt`, `completedAt` | Timeline metadata |
| `stepCount` | Fast count without reading every step |
| `environment` | Optional environment like staging or production |
| `testerName` | Optional tester name |
| `meta` | Browser and OS metadata |

### Step

A step is one captured moment.

Important fields:

| Field | Meaning |
| --- | --- |
| `id` | Stable unique ID |
| `sessionId` | Parent session |
| `stepNumber` | Ordered position inside the session |
| `timestamp` | Capture time |
| `url`, `domain`, `pageTitle` | Page context |
| `browserInfo`, `windowSize` | Browser context |
| `screenshotId` | Reference to separate screenshot blob record |
| `captureMode` | `silent`, `note`, `tech`, `region`, or `manual` |
| `note` | Tester notes |
| `status` | `pass`, `fail`, `warning`, `info`, or `unset` |
| `networkEntries`, `consoleEntries` | Optional attached technical data |
| `annotations` | Optional screenshot annotation metadata |

### Screenshot

Screenshots are intentionally stored separately from steps.

Do this:

```ts
step.screenshotId = screenshotRecord.id
```

Avoid this:

```ts
step.screenshotDataUrl = 'data:image/png;base64,...'
```

Why:

- Step list reads stay fast.
- IndexedDB does not have to load every large image when showing metadata.
- Export and thumbnail code can fetch screenshot data only when needed.
- Deleting a session can remove screenshots by `sessionId`.

### Acceptance Check

Create these shared files first:

```text
types/session.ts
types/step.ts
types/screenshot.ts
types/network.ts
types/console.ts
types/settings.ts
types/storage.ts
types/backup.ts
types/dashboard.ts
```

The rest of the app should import these types instead of creating duplicate shapes.

---

## 8. Phase 4 - Add Typed Messaging

### Goal

Make communication between the React side panel and the service worker type-safe.

The side panel cannot directly call `SessionRepo` because IndexedDB writes and Chrome APIs are centralized in the background service worker. Instead, the UI sends messages like:

```text
GET_SESSION_LIST
START_SESSION
UPDATE_STEP
GET_SCREENSHOT
```

### Design

Create one request map and one event map.

Request/response examples:

| Request | Payload | Response |
| --- | --- | --- |
| `START_SESSION` | session name/defaults | created session |
| `GET_SESSION_LIST` | none | all sessions and active session ID |
| `GET_ACTIVE_SESSION` | none | active session and steps |
| `UPDATE_STEP` | step ID and updates | updated step |
| `GET_SCREENSHOT` | screenshot ID | screenshot data URL payload |
| `UPDATE_SETTINGS` | partial settings update | merged settings |

Runtime event examples:

| Event | Why it exists |
| --- | --- |
| `SESSION_STARTED` | Side panel updates session list |
| `SESSION_ENDED` | Side panel clears active state |
| `STEP_ADDED` | Timeline updates after hotkey capture |
| `STEP_UPDATED` | Step editor stays in sync |
| `OPEN_NOTE_POPUP` | UI selects the captured step for editing |
| `OPEN_TECH_POPUP` | UI opens the technical data picker |
| `CAPTURE_ERROR` | UI shows recoverable errors |

### Client Helper Pattern

The UI should not call `chrome.runtime.sendMessage` everywhere. Use a helper:

```ts
export async function sendMessage<T extends RuntimeRequestType>(
  type: T,
  payload: RuntimeRequestMap[T]['payload']
): Promise<RuntimeRequestMap[T]['response']> {
  const response = await chrome.runtime.sendMessage({ type, payload })

  if (!response?.ok) {
    throw new Error(response?.error ?? 'Unknown message error')
  }

  return response.data
}
```

### Acceptance Check

From React, you should be able to call:

```ts
const response = await sendMessage('GET_SESSION_LIST', undefined)
```

TypeScript should know the response contains `sessions` and `activeSessionId`.

---

## 9. Phase 5 - Build IndexedDB Storage

### Goal

Persist extension data locally in the browser.

This extension is local-first. There is no server requirement for sessions, steps, screenshots, settings, or exports.

### Object Stores

Create one IndexedDB database named `qa-extension`.

Stores:

| Store | Key | Important indexes | Purpose |
| --- | --- | --- | --- |
| `sessions` | `id` | `by-status`, `by-createdAt` | Session metadata |
| `steps` | `id` | `by-sessionId`, `by-sessionId-stepNumber` | Ordered session steps |
| `screenshots` | `id` | `by-stepId`, `by-sessionId` | Screenshot blobs |
| `settings` | `key` | none | Singleton settings record |

Use the `idb` package so the schema can be typed.

### Repository Pattern

Keep raw IndexedDB calls inside repository classes:

```text
SessionRepo       sessions and steps
ScreenshotRepo    screenshot blobs and data URL conversion
SettingsRepo      settings defaults and updates
DashboardRepo     storage stats for UI
```

Why this pattern matters:

- React UI never touches IndexedDB directly.
- Business logic does not repeat database details.
- Storage migrations stay in one place.
- Deletes can be made consistent across related stores.

### Transaction Rule

When a change touches multiple stores, use one transaction.

Example: appending a step should write to `steps` and update the parent session's `stepCount` in the same transaction.

### Acceptance Check

At this phase you should be able to:

- Create a session.
- Read all sessions.
- Append a manual step.
- Read steps for a session.
- Delete a session and its steps.

Do not add screenshots yet. Keep the first storage milestone simple.

---

## 10. Phase 6 - Build Session Logic

### Goal

Centralize business rules for sessions and steps.

Use `SessionManager` as the service layer above `SessionRepo`.

### Responsibilities

`SessionManager` should handle:

- Starting a session.
- Ending a session.
- Restoring active session from `chrome.storage.local`.
- Auto-closing orphaned active sessions after inactivity.
- Creating manual steps.
- Updating, duplicating, restoring, deleting, and reordering steps.
- Importing JSON backups.

### Active Session Rule

The active session ID is stored in `chrome.storage.local`, not only in memory.

Why:

- Manifest V3 service workers can stop.
- In-memory variables can be lost.
- The side panel can close and reopen.
- Chrome can restart.

Store only the ID in `chrome.storage.local`. Store the full session in IndexedDB.

### StepFactory Pattern

Use a factory for step creation so every capture mode produces a consistent step shape.

Factory input:

```text
sessionId
stepNumber
tabInfo
screenshotId
captureMode
note
regionBounds
networkEntries
consoleEntries
```

Factory output: a complete `Step` object.

### StepValidator Pattern

Use validation before saving a generated step.

Validate required fields:

- `id`
- `sessionId`
- `stepNumber >= 1`
- `url`
- `domain`
- `timestamp`

### Acceptance Check

You should now be able to call service methods from tests or temporary code and see durable sessions and steps in IndexedDB.

---

## 11. Phase 7 - Build The Background Service Worker

### Goal

Create the background runtime that wires all services together and listens for extension events.

This is the most important architectural file in a Manifest V3 extension.

### Composition Root Pattern

`background/index.ts` should create shared services once:

```text
SessionRepo
ScreenshotRepo
DashboardRepo
SettingsRepo
WriteQueue
SessionManager
CaptureService
TabInfoService
StepFactory
StepValidator
TechDataBuffer
CommandHandler
MessageRouter
```

This file should mostly wire dependencies and register listeners. It should not contain all business logic.

### Initialization Pattern

The service worker can wake up for many reasons. Some events may arrive before storage has been initialized. Use an idempotent init function:

```ts
let initialized = false

async function init(): Promise<void> {
  if (initialized) {
    return
  }

  await getDb()
  await settingsRepo.get()
  await techDataBuffer.syncLimits()
  await sessionManager.recoverOrphanedSessions()
  await sessionManager.restoreActiveSession()

  initialized = true
}

function requireInit<Args extends unknown[]>(fn: (...args: Args) => Promise<void>) {
  return async (...args: Args): Promise<void> => {
    if (!initialized) {
      await init()
    }

    await fn(...args)
  }
}
```

### Listener Rule

Register event listeners at the top level:

```ts
chrome.runtime.onMessage.addListener(...)
chrome.commands.onCommand.addListener(...)
chrome.webRequest.onBeforeRequest.addListener(...)
chrome.tabs.onUpdated.addListener(...)
chrome.tabs.onRemoved.addListener(...)
```

Do not register core listeners inside a button click or after a long UI flow.

### Async Message Handler Rule

For async responses, return `true`:

```ts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void requireInit(async () => {
    const response = await messageRouter.handle(message)
    sendResponse(response)
  })().catch((error) => {
    sendResponse({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    })
  })

  return true
})
```

If you forget `return true`, Chrome may close the message channel before your async code responds.

### Service Worker Debugging

Common problems:

| Symptom | Likely cause |
| --- | --- |
| Service worker registration failed, status code 15 | Top-level exception during import or startup |
| `document is not defined` | DOM code accidentally imported into service worker |
| Messages never respond | Missing `return true` in async handler |
| Hotkeys do nothing | Command name mismatch between manifest and code |
| State disappears | Storing important data only in memory |

### Acceptance Check

Load the extension and inspect the service worker from `chrome://extensions`. You should see no startup errors.

---

## 12. Phase 8 - Build MessageRouter

### Goal

Turn typed runtime requests into service calls.

`MessageRouter` is the API boundary between UI and background logic.

### Pattern

Use a `switch` on message type:

```text
START_SESSION              -> sessionManager.startSession
END_SESSION                -> sessionManager.endSession
GET_SESSION_LIST           -> sessionManager.getSessionList
GET_SESSION_DETAIL         -> sessionManager.getSession + getSessionSteps
CREATE_MANUAL_STEP         -> sessionManager.createManualStep
UPDATE_STEP                -> sessionManager.updateStep
GET_SCREENSHOT             -> screenshotRepo.getImagePayloadById
GET_SETTINGS               -> settingsRepo.get
UPDATE_SETTINGS            -> settingsRepo.update
GET_DASHBOARD              -> dashboardRepo.getStats
```

### Response Pattern

Always return one of two shapes:

```ts
{ ok: true, data }
{ ok: false, error: 'Human readable error' }
```

This keeps the UI helper simple.

### Event Pattern

After a write, notify the side panel:

```ts
this.notify('STEP_UPDATED', { step })
```

The notification is best-effort. The side panel may be closed.

### Acceptance Check

With the side panel open, starting a session from UI should call `START_SESSION`, save a session, and receive `SESSION_STARTED`.

---

## 13. Phase 9 - Build The Side Panel UI Shell

### Goal

Create a React UI that can call the background, show session data, and update when runtime events arrive.

### Side Panel Entry

Manifest points to:

```text
ui/index.html
```

Vite loads:

```text
ui/main.tsx
ui/App.tsx
```

### UI State Pattern

Use Zustand stores for client-side state:

| Store | Holds |
| --- | --- |
| `useActiveSessionStore` | Active session, steps, selected step |
| `useSessionListStore` | All sessions and active session ID |
| `useSettingsStore` | Current settings |
| `useDashboardStore` | Dashboard stats |
| `useUiStore` | Current tab/view |

Keep stores small. Do not put every possible UI concern in one global store.

### Bootstrap Pattern

When `App` mounts:

```text
GET_SESSION_LIST
GET_ACTIVE_SESSION
GET_SETTINGS
```

Then hydrate the stores.

### Event Subscription Pattern

`App` should subscribe to runtime events:

```text
SESSION_STARTED      upsert session, switch to Sessions view
SESSION_RESTORED     hydrate active session, show banner
SESSION_ENDED        clear active state
STEP_ADDED           append step to active timeline
STEP_UPDATED         replace step in store
STEP_DELETED         remove step from store
OPEN_NOTE_POPUP      select captured step
OPEN_TECH_POPUP      open technical data dialog
CAPTURE_ERROR        show banner
STORAGE_WARNING      show banner
```

### Acceptance Check

At this phase you should be able to:

- Open the side panel by clicking the extension action.
- Start a session.
- Add a manual step.
- See the session and step list update without refreshing.

---

## 14. Phase 10 - Add Screenshot Capture

### Goal

Capture the visible tab, process the image, store it as a blob, and attach only a screenshot ID to the step.

### Capture API

Use:

```ts
chrome.tabs.captureVisibleTab({ format: 'png' })
```

Chrome returns a data URL. The project then converts and compresses it to `webp` or `png`.

### Capture Pipeline

```text
Hotkey or automatic capture starts
CommandHandler checks storage quota
SessionManager returns active session or creates one
TabInfoService reads URL, domain, title, browser info, window size
CaptureService calls chrome.tabs.captureVisibleTab
CaptureService processes image in Worker or inline fallback
ScreenshotRepo stores Blob in IndexedDB screenshots store
StepFactory creates Step with screenshotId
StepValidator validates Step
SessionRepo appends Step and updates session stepCount
Background sends STEP_ADDED event
React timeline updates
```

### Storage Quota Rule

Before capturing, check:

```ts
navigator.storage.estimate()
```

Recommended thresholds from this repo:

| Status | Percent used | Behavior |
| --- | --- | --- |
| `ok` | below 75 | Continue |
| `warning` | 75 or more | Continue and warn |
| `critical` | 90 or more | Stop capture and ask user to export/delete old sessions |

### Failure Rule

If screenshot capture or screenshot storage fails, save the step metadata when possible.

Why: losing the entire step is worse than saving a step with no screenshot.

### Acceptance Check

After using the silent capture command, IndexedDB should contain:

```text
1 session record
1 step record with screenshotId
1 screenshot record with Blob
```

---

## 15. Phase 11 - Add Keyboard Commands

### Goal

Connect manifest commands to capture behavior.

### Command Handler Pattern

`CommandHandler` owns hotkey workflows:

| Command | Handler flow |
| --- | --- |
| `capture-silent` | Capture and save step |
| `capture-note` | Capture, save step, send `OPEN_NOTE_POPUP` |
| `capture-tech` | Capture, save step, send `OPEN_TECH_POPUP` |
| `capture-region` | Ask page for region, capture crop, save step |

Keep command logic out of `background/index.ts`. The service worker file should delegate to `CommandHandler`.

### Auto Session Rule

If a capture happens without an active session, create one automatically using the configured auto-name format.

This keeps the user flow fast:

```text
User presses hotkey first
Extension creates session automatically
Step is saved immediately
Side panel can open later and show the session
```

### Acceptance Check

Open any normal HTTP/HTTPS tab and press each shortcut. The service worker should receive the command and produce the expected step/event.

---

## 16. Phase 12 - Build The Web Worker Image Pipeline

### Goal

Move image crop and compression away from the main service workflow when the runtime supports it.

### What A Web Worker Is

A Web Worker is a separate JavaScript execution context. It is good for expensive work because it does not block the UI thread. In this project, the worker:

- Receives screenshot data URL, target format, quality, and optional crop region.
- Converts the data URL to a blob.
- Creates an `ImageBitmap`.
- Draws it to `OffscreenCanvas`.
- Crops if region bounds exist.
- Converts the canvas to a compressed blob.
- Posts `{ blob, width, height }` back.

### Worker File Shape

`worker/imageWorker.ts` should look conceptually like this:

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

  context.drawImage(imageBitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, crop.width, crop.height)
  imageBitmap.close()

  const mimeType = format === 'png' ? 'image/png' : 'image/webp'
  const normalizedQuality = Math.max(0.6, Math.min(1, quality / 100))
  const blob = await canvas.convertToBlob({ type: mimeType, quality: normalizedQuality })

  self.postMessage({ blob, width: canvas.width, height: canvas.height })
}
```

### Creating The Worker

In `CaptureService`:

```ts
new Worker(new URL('../../worker/imageWorker.ts', import.meta.url), {
  type: 'module',
})
```

### Important MV3 Caveat

Do not hard-require `new Worker()` at service worker startup.

Some extension service worker runtimes may not expose `Worker`, or worker construction may fail depending on browser/version/build tooling. A startup exception can make Chrome report service worker registration failure.

Use capability detection:

```ts
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
```

Then fall back to inline `OffscreenCanvas` processing when the worker is unavailable.

### Cropping Rule

Region selection uses viewport CSS pixels. Screenshot bitmap dimensions may be physical pixels. Multiply region bounds by `devicePixelRatio` before cropping.

```text
bitmapX = region.x * devicePixelRatio
bitmapY = region.y * devicePixelRatio
bitmapWidth = region.width * devicePixelRatio
bitmapHeight = region.height * devicePixelRatio
```

Clamp crop bounds so they never exceed source image dimensions.

### Production Note

If you allow multiple image jobs to run concurrently through one worker, add a request ID to each worker message and match responses by request ID. This repo keeps the capture path simple, but request IDs are the safer long-term pattern.

### Acceptance Check

Capture a page and verify:

- Screenshot is stored as `image/webp` by default.
- Width and height are saved.
- Region capture saves only the selected crop.
- If worker creation fails, capture still works through the inline fallback.

---

## 17. Phase 13 - Build Region Capture

### Goal

Let the user drag a rectangle on the page and capture only that visible area.

### Why Region Capture Is Harder Than It Looks

Region capture touches several tricky browser details:

- Injecting UI into arbitrary pages.
- Avoiding page CSS conflicts.
- Handling pointer events.
- Handling Escape, Enter, retry, and cancel.
- Converting viewport CSS pixels to screenshot bitmap pixels.
- Respecting `devicePixelRatio`.
- Cleaning up injected DOM every time.

Build regular silent capture first. Add region capture after the rest is stable.

### Injection Pattern

Use:

```ts
chrome.scripting.executeScript({
  target: { tabId },
  func: () => {
    return new Promise((resolve) => {
      // Create overlay, let user drag, resolve bounds or cancellation.
    })
  },
})
```

### Overlay Rules

The overlay should:

- Use a very high z-index.
- Cover the viewport.
- Use a shadow root to avoid CSS bleed.
- Dim the area outside the selection.
- Show a visible selection box.
- Show width and height while dragging.
- Provide Capture, Retry, and Cancel controls.
- Remove itself on completion or cancellation.
- Return `null` to the background if cancelled.

### Region Payload

Return:

```ts
{
  x: number,
  y: number,
  width: number,
  height: number,
  devicePixelRatio: number
}
```

Store the step's `regionBounds` without `devicePixelRatio`; the ratio is a capture-time detail for cropping.

### Acceptance Check

Use the region shortcut on a normal web page. You should be able to drag a box, confirm, and see only the selected region in the step screenshot.

---

## 18. Phase 14 - Add Technical Data Buffering

### Goal

Let QA attach relevant network requests and console logs to a step without automatically dumping everything into every step.

### Design Principle

Technical data is buffered automatically, but attached manually.

Why:

- Capturing every request into every step creates noise.
- Users should control what evidence goes into a report.
- Local buffers are lightweight and can be trimmed.

### Network Buffer

Use `chrome.webRequest` listeners:

```text
onBeforeRequest    capture method, URL, body size, start time
onCompleted        create successful NetworkEntry
onErrorOccurred    create failed NetworkEntry
```

Keep a pending request map by `requestId`, then produce final entries when completed or errored.

Filter out assets like images, fonts, CSS, source maps, analytics noise, and favicons.

### Console Buffer

Capturing page console calls requires a bridge because extension isolated world code cannot simply replace the page's real console for the page runtime.

This project uses two injected scripts:

1. An isolated-world listener that receives `window.postMessage` from the page and forwards data to `chrome.runtime.sendMessage`.
2. A main-world patch that wraps `console.log`, `console.warn`, `console.error`, `console.info`, and `console.debug`.

Flow:

```text
Page calls console.error(...)
Main-world injected patch serializes the message
Patch calls window.postMessage({ source: 'qa-console-capture', payload })
Isolated-world bridge receives message
Bridge calls chrome.runtime.sendMessage({ type: 'TRACK_CONSOLE_ENTRY', payload })
Background stores entry in TechDataBuffer for sender tab
```

### Buffer Limits

Use settings:

```text
networkMax: 10 to 50, default 20
consoleMax: 10 to 50, default 20
```

Trim buffers with newest entries first.

### Navigation Handling

When a tab starts loading, increment a navigation ID. Keep only recent navigation entries so the picker does not show stale requests from long ago.

### Attach Flow

```text
User captures with tech mode
Background saves the step
Background sends OPEN_TECH_POPUP with stepId and tabId
React opens TechDataPicker
Picker calls GET_TECH_BUFFER
User selects entries
Picker calls ATTACH_TECH_DATA_TO_STEP
Background updates the step
Background sends STEP_UPDATED
```

### Acceptance Check

Open a test page, cause one failed request or console error, capture with tech mode, and confirm the picker shows selectable technical entries.

---

## 19. Phase 15 - Build Timeline And Step Editor

### Goal

Give testers a clear place to review, edit, annotate, and organize captured steps.

### Timeline Responsibilities

The timeline should:

- Show steps ordered by `stepNumber`.
- Highlight selected step.
- Show screenshot thumbnail.
- Show status badge.
- Show domain and note preview.
- Support drag/drop reorder.
- Auto-scroll selected step into view.

### Step Editor Responsibilities

The editor should:

- Load full screenshot only for selected step.
- Edit note and status.
- Save annotations.
- Delete step.
- Duplicate step.
- Show a simple visual diff from previous step when both screenshots exist.

### Annotation Data Model

Annotations are metadata, not burned into the image.

Each annotation has:

```text
id
type: arrow, rect, circle, text, or blur
color
coords
optional text
```

This is flexible because export/UI can decide how to render annotations later.

### Acceptance Check

Capture multiple steps. You should be able to select each step, edit notes/status, reorder, duplicate, delete, and restore recent deletes.

---

## 20. Phase 16 - Add Exports And Backups

### Goal

Turn captured steps into useful external artifacts.

### DOCX Export

Use the `docx` package.

DOCX export should include:

- Report title.
- Session summary.
- Step headings.
- Status, domain, timestamp, URL.
- Notes.
- Screenshots.
- Annotation summaries.
- Optional technical data.

### PDF Export

Use `jspdf`.

PDF export should include the same core data, but be careful with page height and image scaling.

### JSON Backup

JSON backup is for portability and restore.

Include:

```text
version
exportedAt
session
steps
screenshots as data URLs
```

Screenshots are converted from blobs to data URLs for the backup file because JSON cannot store Blob objects directly.

### Import Rule

When importing a backup into an existing session ID:

- Merge into the existing session.
- Generate new step IDs if needed.
- Generate new screenshot IDs if needed.
- Repoint step `screenshotId` values.
- Append imported steps after existing steps.

### Acceptance Check

Export one session to DOCX, PDF, and JSON backup. Import the backup and verify the steps and screenshots appear.

---

## 21. Phase 17 - Add Settings And Dashboard

### Goal

Let users control extension behavior and understand stored data.

### Settings Sections

Recommended sections:

| Section | Settings |
| --- | --- |
| Keyboard shortcuts | Read current Chrome commands and link to `chrome://extensions/shortcuts` |
| Capture | image format, quality, region behavior |
| Buffers | network and console max entries |
| Session defaults | auto-name format, default environment, default tester |
| Export | report format, screenshots, tech data, page size, template |
| Smart capture | auto-capture console errors, auto-capture navigation |
| Integrations | Jira base URL, Jira project key, Slack channel label |
| UI | theme, timeline layout, thumbnail size |
| Storage | dashboard, export backups, delete sessions, clear data |

### Dashboard Data

The dashboard should show:

- Database name and version.
- Total estimated data size.
- Store counts.
- Session counts by status.
- Step count.
- Screenshot count and bytes.
- Browser storage estimate if available.
- Recent sessions.

### Acceptance Check

Changing settings should update IndexedDB and affect future captures. Storage dashboard should update after captures and deletes.

---

## 22. Full Capture Flow In Detail

This is the most important end-to-end flow in the project.

```text
1. User presses Command+Shift+S.
2. Chrome fires chrome.commands.onCommand with 'capture-silent'.
3. background/index.ts wraps handler in requireInit.
4. CommandHandler.handle routes command to captureStep('silent').
5. SettingsRepo loads capture settings.
6. CaptureService checks storage quota.
7. SessionManager returns active session or starts a new one.
8. TabInfoService reads active tab info.
9. CaptureService calls chrome.tabs.captureVisibleTab.
10. CaptureService sends image work to worker or inline fallback.
11. CommandHandler creates screenshotId.
12. SessionManager calculates next step number.
13. StepFactory creates Step metadata.
14. StepValidator validates required fields.
15. WriteQueue serializes the write.
16. ScreenshotRepo stores screenshot blob.
17. SessionManager appends step through SessionRepo.
18. SessionRepo updates step store and session stepCount in a transaction.
19. Background sends STEP_ADDED event.
20. React App receives event and updates Zustand stores.
21. Timeline selects and displays the new step.
```

Key design point: the user does not wait for the side panel. The background can capture even if the UI is closed.

---

## 23. Service Worker From Scratch

### 23.1 What The Service Worker Should Own

The service worker owns browser-level operations:

- Keyboard commands.
- Visible tab capture.
- Active tab metadata.
- IndexedDB writes.
- Runtime message routing.
- Network request buffering.
- Console bridge messages.
- Side panel notifications.
- Active session recovery.

### 23.2 What It Should Not Own

Avoid putting these in the service worker:

- React UI.
- DOM overlays, except code passed to `chrome.scripting.executeScript`.
- Long-lived in-memory app state that cannot be reconstructed.
- Large report layout rendering that needs DOM APIs.
- User form state.

### 23.3 Lifecycle Notes

The service worker can be started, stopped, and restarted by Chrome.

Consequences:

- `let activeSessionId = ...` can be lost.
- Open ports or timers are not reliable as permanent storage.
- `init()` must be safe to call more than once.
- Startup code must avoid throwing.
- User-visible operations should persist data quickly.

### 23.4 Top-Level Listener Template

Use this structure:

```ts
const sessionRepo = new SessionRepo()
const settingsRepo = new SettingsRepo()
const sessionManager = new SessionManager(sessionRepo)
const messageRouter = new MessageRouter(...)
const commandHandler = new CommandHandler(...)

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void requireInit(async () => {
    const response = await messageRouter.handle(message)
    sendResponse(response)
  })().catch((error) => {
    sendResponse({ ok: false, error: String(error) })
  })

  return true
})

chrome.commands.onCommand.addListener((command) => {
  void requireInit(async () => {
    await commandHandler.handle(command)
  })()
})

void init().catch(() => {
  // Requests and commands will surface failures later.
})
```

### 23.5 Event Notifications

Notify the UI like this:

```ts
const notifyUI = (type: RuntimeEventType, payload: unknown): void => {
  void chrome.runtime.sendMessage({ type, payload }).catch(() => {
    // Side panel may be closed.
  })
}
```

Do not treat a failed notification as a capture failure.

### 23.6 Service Worker Safety Checklist

- Keep all listeners at top level.
- Wrap initialization in try/catch or `.catch`.
- Return `true` from async `onMessage` handlers.
- Never import UI code into background code.
- Never use `document` in background code.
- Persist important state to IndexedDB or `chrome.storage.local`.
- Use capability detection for optional APIs like `Worker`, `OffscreenCanvas`, and `createImageBitmap`.
- Make repeated initialization safe.
- Make notifications best-effort.

---

## 24. Web Worker From Scratch

### 24.1 What The Web Worker Owns

The image worker owns image processing only:

- Decode screenshot data URL.
- Crop if needed.
- Compress to desired format.
- Return blob and dimensions.

It should not access Chrome APIs, IndexedDB repositories, React state, or DOM nodes.

### 24.2 Why Use A Worker

Image processing can be expensive. A worker keeps image work isolated from UI code and keeps the capture service simpler.

### 24.3 Worker Request Shape

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

### 24.4 Worker Response Shape

```ts
interface WorkerResponse {
  blob: Blob
  width: number
  height: number
}
```

### 24.5 Fallback Implementation

If the worker is unavailable, do the same work inline inside `CaptureService`:

```text
fetch data URL
convert to blob
if OffscreenCanvas or createImageBitmap is unavailable, return original blob
create bitmap
crop
draw to OffscreenCanvas
convert to blob
return blob and dimensions
```

The fallback is important because a broken worker should not break the whole extension.

### 24.6 Worker Safety Checklist

- Use `new URL(..., import.meta.url)` so Vite can bundle the worker.
- Use `type: 'module'`.
- Guard worker creation with `typeof Worker` and try/catch.
- Close `ImageBitmap` after drawing.
- Clamp quality to a safe range.
- Clamp crop bounds.
- Add request IDs if concurrent worker jobs become possible.
- Keep worker code independent from app services.

---

## 25. Design Patterns Used In This Project

### 25.1 Composition Root

`background/index.ts` creates and connects services. This makes dependencies obvious and avoids hidden globals.

### 25.2 Repository Pattern

Repositories hide storage details:

```text
SessionRepo -> IndexedDB sessions and steps
ScreenshotRepo -> IndexedDB screenshots
SettingsRepo -> settings singleton
DashboardRepo -> aggregate stats
```

### 25.3 Service Layer

`SessionManager`, `CaptureService`, `TabInfoService`, and `TechDataBuffer` contain business logic that is bigger than one database call.

### 25.4 Command Handler Pattern

`CommandHandler` maps extension commands to workflows. It protects `background/index.ts` from becoming a large file full of capture details.

### 25.5 Message Router Pattern

`MessageRouter` is the background API for the UI. The UI sends typed commands. The router validates command type and delegates to services.

### 25.6 Factory Pattern

`StepFactory` creates consistent `Step` objects. This prevents every capture mode from hand-building slightly different step shapes.

### 25.7 Validator Pattern

`StepValidator` catches broken step data before persistence.

### 25.8 Write Queue Pattern

`WriteQueue` serializes capture writes. Screenshot capture and hotkeys can happen quickly; serializing writes reduces transaction overlap and ordering surprises.

### 25.9 Event-Driven UI Sync

The UI does not poll constantly. Background sends events after important changes. React updates stores when those events arrive.

### 25.10 Typed Messaging Contract

`RuntimeRequestMap` and `RuntimeEventMap` make background/UI contracts explicit. This is one of the most valuable TypeScript patterns in an extension.

### 25.11 Local-First Storage

All user data stays in browser storage unless the user exports it. This lowers backend complexity and improves privacy.

### 25.12 Blob Reference Pattern

Large binary data is stored as separate screenshot records. Step records hold lightweight references.

### 25.13 Capability Detection

Optional APIs are checked before use. This makes the extension robust across Chromium variants.

### 25.14 Progressive Enhancement

The product still works if an advanced feature fails:

- Screenshot fails: save metadata step.
- Worker fails: process inline.
- Side panel closed: background capture still works.
- Notification fails: data remains saved.
- Console bridge unavailable: network and screenshot capture still work.

---

## 26. Security And Privacy Notes

### Local Data

Captured data can contain sensitive information:

- URLs.
- Page titles.
- Screenshots.
- Console messages.
- Network paths.
- Request/response metadata.

Keep it local by default. Do not add automatic upload without explicit user consent.

### Host Permissions

`<all_urls>` is powerful. For a QA utility it may be acceptable, but document why it is required and consider domain allowlists later.

### Console Capture

Console patching is invasive. Make sure it is best-effort and avoids breaking the page:

- Preserve original console behavior.
- Catch serialization problems.
- Avoid double-injecting patches.
- Keep payload sizes bounded.

### Network Capture

This implementation captures metadata, not full response bodies. That is safer and lighter.

### Content Security Policy

Keep extension pages restricted:

```json
"content_security_policy": {
  "extension_pages": "script-src 'self'; object-src 'none'; base-uri 'none';"
}
```

Avoid remote scripts in extension pages.

---

## 27. Performance Notes

### Keep Capture Fast

Capture should feel instant. The user should be able to press a hotkey and continue testing.

Rules:

- Avoid opening UI for silent capture.
- Save screenshot blobs separately.
- Use WebP by default.
- Keep buffer sizes small.
- Use a write queue for save ordering.
- Defer heavy export work until user asks for export.

### Avoid Loading Every Screenshot

The timeline should load thumbnails as needed. Session list and dashboard should not fetch every screenshot data URL.

### Keep Step Records Small

Avoid embedding base64 image data in `Step`.

### Trim Technical Buffers

Network and console buffers are per-tab and should stay bounded.

---

## 28. Testing Strategy

### Manual Extension Smoke Test

After `npm run build`, load `dist` as unpacked extension and test:

1. Action click opens side panel.
2. Start session works.
3. Silent capture creates a step.
4. Capture with note selects the new step.
5. Capture with tech opens picker.
6. Region capture crops correctly.
7. End session works.
8. Delete session removes steps and screenshots.
9. DOCX export downloads.
10. PDF export downloads.
11. JSON backup exports and imports.
12. Settings persist after closing/reopening side panel.
13. Service worker restart restores active session.

### Service Worker Tests To Do Manually

From `chrome://extensions`, inspect the service worker console and test:

- No startup errors.
- No `document is not defined` errors.
- Messages return responses.
- Hotkey command names match manifest command names.
- Reloading the extension does not lose stored sessions.

### Storage Tests

Use DevTools Application tab for the extension:

- Check IndexedDB store names.
- Verify step count increments.
- Verify screenshots are blobs.
- Verify deleting a session deletes screenshots.
- Verify settings record is a singleton.

### Suggested Automated Tests Later

Start with unit tests for pure logic:

- `StepFactory`
- `StepValidator`
- `TechDataBuffer` filtering and trimming
- `SessionManager` step numbering
- file name sanitization in exporters
- backup import ID remapping

Then add integration tests around repository behavior using an IndexedDB test shim.

---

## 29. Debugging Guide

### Extension Does Not Load

Check:

- `npm run build` completed.
- `dist/manifest.json` exists.
- Background service worker path is valid.
- No top-level exception in background imports.

### Service Worker Registration Failed

Likely causes:

- Import path typo.
- Top-level DOM usage.
- Worker construction failed at startup.
- Syntax error from unsupported TypeScript/bundler output.

Fix approach:

1. Open `chrome://extensions`.
2. Click service worker Inspect.
3. Read first error.
4. Remove top-level risky code.
5. Put optional APIs behind capability checks.

### Hotkey Does Not Work

Check:

- Command exists in `manifest.json`.
- Command string matches `config/hotkeys.ts`.
- Shortcut is not already claimed by browser or OS.
- Visit `chrome://extensions/shortcuts`.

### Screenshot Capture Fails

Check:

- Active tab is a normal web page.
- Chrome internal pages like `chrome://extensions` cannot be captured like normal pages.
- Extension has `activeTab` and `tabs` permissions.
- Storage quota is not critical.

### Region Capture Fails

Check:

- Page allows script injection.
- Tab ID exists.
- Overlay cleanup runs on Escape and Cancel.
- Crop math uses `devicePixelRatio`.

### Technical Data Missing

Check:

- `webRequest` permission and host permissions exist.
- The request is not filtered as an asset.
- Tab ID is not `-1`.
- Console bridge was injected after page load.
- Console messages happened after bridge injection.

### UI Does Not Update

Check:

- Background sent the runtime event.
- `App` subscribed to that event.
- The active session ID matches the step's `sessionId`.
- Zustand store update preserves sorting by `stepNumber`.

---

## 30. Release Checklist

Before publishing or sharing the extension:

- Build passes.
- Extension loads from `dist`.
- Service worker starts without errors.
- All shortcuts are registered or documented as configurable.
- Capture works on HTTP and HTTPS pages.
- Capture failure saves metadata when possible.
- Region overlay cleans up on cancel and Escape.
- IndexedDB delete flows remove related screenshots.
- Export files open correctly.
- Backup import restores screenshots.
- Settings persist across reloads.
- Storage warning and critical states are handled.
- Permissions are reviewed and documented.
- README points to the beginner rebuild guide.

---

## 31. Minimal MVP If You Rebuild Again

If rebuilding under time pressure, ship in this order:

1. Manifest, side panel, service worker.
2. Sessions and manual steps in IndexedDB.
3. Silent screenshot capture.
4. Timeline and step editor.
5. Export JSON backup.
6. DOCX/PDF export.
7. Region capture.
8. Technical data picker.
9. Dashboard and cleanup tools.
10. Smart capture and integrations.

The smallest useful product is not region capture or technical data. The smallest useful product is fast silent capture plus a session timeline.

---

## 32. Final Mental Model

Think of the extension as four cooperating systems:

```text
Browser events
  -> background service worker
  -> services and repositories
  -> IndexedDB
  -> runtime events
  -> React side panel
```

The background is the reliable worker that captures and saves. The side panel is the user workspace. IndexedDB is the source of truth. Runtime messages are the contract between them. The Web Worker is an optional helper for image processing.

If you keep those boundaries clear, you can rebuild, debug, and extend the extension without the code turning into one large script.