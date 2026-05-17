# QA Web Session Documentation Extension
## Complete Product + Engineering Reference (MVP → Scale)

---

## TABLE OF CONTENTS

1. [Product Vision & Philosophy](#1-product-vision--philosophy)
2. [Problem & Solution](#2-problem--solution)
3. [Core Concepts](#3-core-concepts)
4. [Capture System](#4-capture-system)
5. [Region Selection](#5-region-selection)
6. [Selective Technical Capture](#6-selective-technical-capture)
7. [Data Model](#7-data-model)
8. [Architecture Overview](#8-architecture-overview)
9. [Message Flow](#9-message-flow)
10. [Repository Structure](#10-repository-structure)
11. [Tech Stack](#11-tech-stack)
12. [Storage Layer](#12-storage-layer)
13. [Performance Rules](#13-performance-rules)
14. [Security Model](#14-security-model)
15. [Error States & Recovery](#15-error-states--recovery)
16. [Network Tracker](#16-network-tracker)
17. [Console Tracker](#17-console-tracker)
18. [Multi-Domain Support](#18-multi-domain-support)
19. [Session Management](#19-session-management)
20. [UI System](#20-ui-system)
21. [Export System](#21-export-system)
22. [Settings & Preferences](#22-settings--preferences)
23. [Onboarding & First Run](#23-onboarding--first-run)
24. [Keyboard Shortcut System](#24-keyboard-shortcut-system)
25. [Design Patterns](#25-design-patterns)
26. [Testing Strategy](#26-testing-strategy)
27. [Build Configuration](#27-build-configuration)
28. [MVP Roadmap](#28-mvp-roadmap)
29. [What NOT to Build](#29-what-not-to-build)
30. [Release Checklist](#30-release-checklist)

---

## 1. PRODUCT VISION & PHILOSOPHY

### What This Is

**QA Session Documentation Tool** — a browser extension that turns fragmented manual testing into structured, exportable reports without interrupting the tester's flow.

### What This Is NOT

Not a DevTools replacement. Not a debugging tool. Not a continuous tracker.

### Core Philosophy

```
Capture fast → Don't interrupt → Document later → Export clean report
```

### Design Principles (Non-Negotiable)

| Principle | Meaning |
|-----------|---------|
| Zero friction on capture | Hotkey fires in < 100ms, user never waits |
| User controls everything | Nothing is auto-captured without explicit action |
| Local first | No servers, no accounts, no data leaves the machine |
| QA-shaped, not dev-shaped | Vocabulary and flow matches how QA actually works |
| Recoverable always | No captured data is ever permanently lost due to a crash |

---

## 2. PROBLEM & SOLUTION

### Current QA Workflow (Painful)

```
Test → Screenshot → Alt-Tab to folder → Rename file → Open doc →
Paste screenshot → Write context → Switch back → Repeat 40 times per session
```

**Cost per session:** ~30–40 minutes of pure documentation overhead.

### Pains Ranked

1. Context is lost between capture and documentation
2. No standard structure across testers
3. Renaming and organizing screenshots manually
4. Writing step descriptions from memory
5. Assembling the report at the end

### Solution Summary

```
Hotkey → Screenshot + auto-context → Tagged step →
Timeline builds itself → Export one-click report
```

---

## 3. CORE CONCEPTS

### Session

A named container for one testing run. Has a start time, optional end time, and an ordered list of steps.

### Step

One meaningful moment in testing. Contains: screenshot (or region crop), URL, page title, domain, timestamp, optional note, optional technical data, and a status tag.

### Technical Data

Optional network requests and console entries attached to a specific step. Always user-selected — never auto-attached.

### Session Timeline

The visual representation of all steps in order. This is the primary working view during and after a session.

---

## 4. CAPTURE SYSTEM

### 4.1 Three Hotkey Modes

| Hotkey | Mode | What Happens |
|--------|------|--------------|
| `Ctrl+Shift+S` | Silent Capture | Screenshot + auto-context saved immediately, no popup |
| `Ctrl+Shift+N` | Capture + Note | Screenshot taken, small note input popup appears |
| `Ctrl+Shift+D` | Capture + Tech Data | Screenshot taken, tech data selection popup appears |
| `Ctrl+Shift+R` | Region Capture | Overlay appears, user selects region, then proceeds as silent capture |

> All four modes can be combined: `Ctrl+Shift+R` can optionally be followed by note/tech selection based on user preference setting.

### 4.2 Auto-Captured Context (Always, Zero User Action)

Every step, regardless of mode, automatically captures:

```typescript
{
  url: string           // Full URL of active tab
  domain: string        // Hostname only (auth.app.com)
  pageTitle: string     // document.title
  timestamp: string     // ISO 8601
  stepNumber: number    // Auto-incremented within session
  browserInfo: {
    name: string        // Chrome / Edge / Brave
    version: string
  }
  windowSize: {
    width: number
    height: number
  }
}
```

### 4.3 Capture Pipeline (Single Step)

```
Hotkey fires
    │
    ▼
Background receives command
    │
    ▼
captureVisibleTab() called          ← < 50ms target
    │
    ▼
Image transferred to offscreen canvas  ← Web Worker
    │
    ├── [Region mode] Crop to selection coords
    │
    ▼
Compress to WebP @ 85% quality      ← ~60% size reduction vs PNG
    │
    ▼
Convert to Blob, store in IndexedDB ← Blob ref stored in step, not base64
    │
    ▼
Create step record (no screenshot data inline)
    │
    ▼
Save step to IndexedDB (step record)
    │
    ▼
Notify UI → Timeline updates
    │
    ▼
[If Note mode] → Open note popup
[If Tech mode] → Open tech selection popup
[If Silent] → Done
```

### 4.4 Screenshot Storage Strategy

**Never store base64 in the step record.** At 50+ steps, base64 inline bloats IndexedDB reads and makes step list queries slow.

```typescript
// WRONG
step.screenshot = "data:image/png;base64,iVBORw0KGgo..."  // ❌

// CORRECT
const blob = new Blob([compressedBuffer], { type: 'image/webp' })
const screenshotId = await db.screenshots.add({ blob, stepId })
step.screenshotId = screenshotId  // ✅ lean reference
```

---

## 5. REGION SELECTION

> ⚠️ **Complexity Warning:** Region capture involves overlay injection, scroll offset math, devicePixelRatio scaling, crop logic, edge case handling, and keyboard interactions. This can take 2–4 days to get right if bugs appear. **Do not block MVP1a on this feature.** Region capture belongs in MVP1b. Build silent capture first, ship something working, then add region.

### 5.1 User Flow

```
Ctrl+Shift+R pressed
    │
    ▼
Full-page overlay injected into active tab
(semi-transparent dark layer, z-index: 2147483647)
    │
    ▼
User clicks and drags to select region
(selection box: white border, no fill, dimension tooltip)
    │
    ▼
User releases mouse
    │
    ▼
Confirm UI appears: [Capture] [Retry] [Cancel]
    │
    ▼
[Capture] clicked
    │
    ▼
Overlay reports selection coords to background
    │
    ▼
captureVisibleTab() captures full tab
    │
    ▼
Crop to selection coords in Web Worker
    │
    ▼
Discard full screenshot, store only crop
    │
    ▼
Overlay removed from DOM
    │
    ▼
Step created (same as silent capture)
```

### 5.2 Overlay Implementation Rules

```typescript
// Overlay must:
// 1. Cover entire viewport including scrolled content
// 2. Block all pointer events on underlying page (no accidental clicks)
// 3. Be injected as isolated shadow root (no style bleed)
// 4. Be removable by pressing Escape at any point
// 5. Show real-time selection dimensions as user drags (e.g. "412 × 228 px")
// 6. Dim everything OUTSIDE the selection, not inside it (macOS screenshot UX)

const overlay = document.createElement('div')
overlay.attachShadow({ mode: 'closed' })  // isolated from page styles

// DIM OUTSIDE, not inside — use clip-path or 4-element approach
// Dimension tooltip: follows top-right corner of selection box
```

### 5.3 Keyboard Interactions in Region Mode

| Key | Action |
|-----|--------|
| `Escape` | Cancel region capture, remove overlay |
| `Enter` | Confirm current selection |
| Arrow keys | Nudge selection bounds by 1px |
| `Shift + Arrow` | Nudge by 10px |

### 5.4 Edge Cases

- **Scrolled page**: Selection coords must account for `window.scrollX / scrollY` offset
- **Zoom level**: Account for `window.devicePixelRatio` when translating CSS coords to pixel coords
- **Minimum selection**: Reject selections smaller than 10 × 10px, show "too small" tooltip
- **Cross-iframe content**: Overlay works on top-level frame only; note this in docs

### 5.5 Privacy Benefit

Region selection is a privacy feature. Testers can deliberately exclude sensitive fields (passwords, PII, internal IDs) from screenshots. Mention this in onboarding.

---

## 6. SELECTIVE TECHNICAL CAPTURE

### 6.1 Philosophy

This is an on-demand feature, not a background monitor. The user pulls technical data when a step warrants it — never pushed automatically.

### 6.2 What Gets Buffered (Background, Always-On)

Background script maintains two circular buffers per tab:

```typescript
networkBuffer: NetworkEntry[]   // Last 20 requests
consoleBuffer: ConsoleEntry[]   // Last 20 log entries
```

These buffers exist only in memory. They are never persisted unless the user explicitly selects entries for a step.

### 6.3 Tech Data Selection Popup UI

```
┌──────────────────────────────────────────────────┐
│  Attach Technical Data to Step 7                 │
├──────────────────────────────────────────────────┤
│  NETWORK REQUESTS (last 20)                      │
│                                                  │
│  ☑  POST /api/login          500  324ms          │
│  ☑  GET  /api/user           200  88ms           │
│  ☐  GET  /assets/logo.png    200  12ms           │
│  ☐  GET  /fonts/inter.woff2  200  8ms            │
│                                                  │
│  CONSOLE (last 20)                               │
│                                                  │
│  ☑  ERROR   TypeError: Cannot read prop…         │
│  ☑  ERROR   Failed to fetch /api/data            │
│  ☐  WARN    Deprecated: componentWillMount       │
│  ☐  LOG     App initialized                      │
│                                                  │
│  [Select All Errors]  [Clear All]                │
├──────────────────────────────────────────────────┤
│             [Attach Selected]   [Skip]           │
└──────────────────────────────────────────────────┘
```

### 6.4 Network Entry Schema

```typescript
interface NetworkEntry {
  id: string
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | string
  url: string
  urlPath: string         // Path only, for display
  statusCode: number
  statusText: string
  durationMs: number
  requestBodySize: number
  responseBodySize: number
  contentType: string
  initiator: string       // 'fetch' | 'xhr' | 'script' | etc.
  timestamp: string
  tabId: number
  domain: string
}
```

### 6.5 Console Entry Schema

```typescript
interface ConsoleEntry {
  id: string
  level: 'log' | 'warn' | 'error' | 'info' | 'debug'
  message: string         // Truncated at 500 chars for display
  fullMessage: string     // Full message stored
  source: string          // File and line if available
  timestamp: string
  tabId: number
}
```

### 6.6 Buffer Management Rules

- Buffer is per-tab, not per-window
- Buffer max: 20 entries each (configurable in settings, max 50)
- Oldest entries dropped when buffer is full (circular)
- Buffer is NOT cleared between captures — entries accumulate since last hard navigation

**Navigation & Buffer Clearing:**

Clearing the buffer on every hard navigation is too aggressive for QA use. A tester often navigates *because* something failed — they need the requests that triggered the navigation.

Default behaviour: **retain entries across the last 2 navigations per tab.** Each navigation stamps a `navigationId` on buffered entries so the tester can see which page each entry came from.

```typescript
interface NetworkEntry {
  // ...existing fields
  navigationId: number    // Increments on each hard navigation for this tab
}

// Buffer clears only when navigationCount for this tab > 2
// i.e. oldest navigation's entries are dropped when a 3rd navigation occurs
```

Settings toggle (MVP2):

```
Buffer behaviour:
  ○ Keep last 2 navigations (default — recommended for QA)
  ○ Clear on every navigation
  ○ Never clear (manual clear only)
```

### 6.7 Smart Pre-Selection

When tech popup opens, auto-check:
- All network requests with status >= 400
- All console entries with level `error`

This matches what QA testers care about 90% of the time.

---

## 7. DATA MODEL

### 7.1 Session

```typescript
interface Session {
  id: string                    // nanoid(12)
  name: string                  // User-provided or auto: "Session — May 2 14:30"
  description?: string
  status: 'active' | 'completed' | 'archived'
  createdAt: string             // ISO 8601
  updatedAt: string
  completedAt?: string
  stepCount: number             // Denormalized for fast list queries
  tags: string[]                // User-assigned tags
  environment?: string          // e.g., "staging", "production"
  testerName?: string           // Optional, for export
  meta: {
    browserName: string
    browserVersion: string
    os: string
  }
}
```

### 7.2 Step

```typescript
interface Step {
  id: string                    // nanoid(12)
  sessionId: string
  stepNumber: number            // 1-based, maintained on reorder
  timestamp: string
  
  // Page context
  url: string
  domain: string
  pageTitle: string
  
  // Capture
  screenshotId: string | null   // FK to screenshots store
  captureMode: 'silent' | 'note' | 'tech' | 'region' | 'manual'
  regionBounds?: {              // Only if region capture used
    x: number
    y: number
    width: number
    height: number
  }
  
  // User-provided
  note: string                  // Editable anytime
  status: StepStatus
  
  // Technical data (only if user selected)
  networkEntries: NetworkEntry[]
  consoleEntries: ConsoleEntry[]
  
  // Annotations (MVP3)
  annotations: Annotation[]
}

type StepStatus = 'pass' | 'fail' | 'warning' | 'info' | 'unset'
```

### 7.3 Screenshot (Separate Store)

```typescript
interface ScreenshotRecord {
  id: string
  stepId: string
  sessionId: string
  blob: Blob                    // WebP compressed
  width: number                 // Original dimensions before crop
  height: number
  capturedAt: string
  sizeBytes: number             // For storage quota display
}
```

### 7.4 Annotation (MVP3)

```typescript
interface Annotation {
  id: string
  type: 'arrow' | 'rect' | 'circle' | 'text' | 'blur'
  color: string
  coords: {
    x: number
    y: number
    width?: number
    height?: number
    endX?: number
    endY?: number
  }
  text?: string                 // For type: 'text'
}
```

### 7.5 Settings

```typescript
interface Settings {
  hotkeys: {
    silent: string              // Default: "Ctrl+Shift+S"
    note: string                // Default: "Ctrl+Shift+N"
    tech: string                // Default: "Ctrl+Shift+D"
    region: string              // Default: "Ctrl+Shift+R"
  }
  capture: {
    format: 'webp' | 'png'     // Default: webp
    quality: number             // 0–100, default: 85
    regionModeDefault: 'silent' | 'ask'  // After region: auto-save or ask?
  }
  buffers: {
    networkMax: number          // Default: 20, max: 50
    consoleMax: number          // Default: 20, max: 50
  }
  session: {
    autoNameFormat: string      // Default: "Session — {date} {time}"
    defaultEnvironment: string
    defaultTesterName: string
  }
  export: {
    defaultFormat: 'docx' | 'pdf'
    includePassSteps: boolean   // Default: true
    includeTimestamps: boolean  // Default: true
    includeUrls: boolean        // Default: true
    includeTechData: boolean    // Default: true
  }
  ui: {
    theme: 'light' | 'dark' | 'system'
    timelineLayout: 'vertical' | 'grid'
    thumbnailSize: 'small' | 'medium' | 'large'
  }
}
```

---

## 8. ARCHITECTURE OVERVIEW

```
┌──────────────────────────────────────────────────────────┐
│                    BACKGROUND SERVICE WORKER             │
│                                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │CommandHandler│  │MessageRouter │  │ SessionManager │  │
│  └─────────────┘  └──────────────┘  └────────────────┘  │
│                                                          │
│  ┌──────────────────┐  ┌────────────┐  ┌─────────────┐  │
│  │  CaptureService  │  │NetworkTrack│  │StorageLayer │  │
│  │  + WebWorker     │  │   er       │  │(IndexedDB)  │  │
│  └──────────────────┘  └────────────┘  └─────────────┘  │
└──────────────────────────────────────────────────────────┘
          │  Chrome Extension Message Bus  │
          ▼                                ▼
┌─────────────────────┐      ┌──────────────────────────┐
│   CONTENT SCRIPT    │      │    SIDE PANEL / POPUP UI │
│                     │      │         (React)           │
│  ConsoleTracker     │      │  Timeline  StepEditor     │
│  OverlayManager     │      │  TechPopup ExportPanel    │
│  (Region selection) │      │  Settings  SessionList    │
└─────────────────────┘      └──────────────────────────┘
```

### Component Responsibilities

| Component | Owns | Does NOT own |
|-----------|------|--------------|
| Background | State, logic, storage writes | UI rendering |
| Content Script | Page data collection, overlay rendering | Storage |
| UI (React) | Presentation, user input | Business logic |
| Web Worker | Image processing (compress, crop) | DOM access |

### Service Worker Init Guard (Critical)

MV3 service workers are killed and restarted by Chrome at any time. A hotkey can fire while the SW is mid-initialization — before `SessionManager`, `NetworkTracker`, or `StorageLayer` are ready.

**Every entry point in `CommandHandler` and `MessageRouter` must check init before acting:**

```typescript
// background/index.ts
let initialized = false

async function init() {
  await db.open()
  await settingsRepo.loadIntoMemory()
  await sessionManager.restoreActiveSession()
  await networkTracker.start()
  initialized = true
}

// Guard used in every handler
function requireInit(fn: () => Promise<void>) {
  return async () => {
    if (!initialized) await init()
    await fn()
  }
}

chrome.commands.onCommand.addListener(requireInit(async (command) => {
  commandHandler.handle(command)
}))
```

This prevents silent failures where a hotkey press produces nothing because the SW wasn't ready yet.

---

## 9. MESSAGE FLOW

### 9.1 Silent Capture Flow

```
[User presses hotkey]
        │
[chrome.commands API] ──► [CommandHandler.ts]
                                │
                    [CaptureService.captureTab()]
                                │
                    [chrome.tabs.captureVisibleTab()]
                                │
                    [postMessage → Web Worker]
                    [compress + convert to Blob]
                                │
                    [TabInfoService.getTabInfo()]
                                │
                    [StepFactory.createStep()]
                                │
                    [SessionRepo.appendStep()]
                                │
                    [MessageRouter.notifyUI('STEP_ADDED')]
                                │
                    [React UI updates timeline]
```

### 9.2 Tech Capture Flow

```
[User presses Ctrl+Shift+D]
        │
[Background captures screenshot] ──► same as above until StepFactory
        │
[Background reads networkBuffer + consoleBuffer for that tab]
        │
[Background sends OPEN_TECH_POPUP message to UI]
        │
[UI renders TechCapture popup with buffer data]
        │
[User selects entries → clicks Attach]
        │
[UI sends TECH_DATA_SELECTED message to background]
        │
[StepFactory.createStep() with selected entries]
        │
[SessionRepo.appendStep()]
        │
[UI updates]
```

### 9.3 Region Capture Flow

```
[User presses Ctrl+Shift+R]
        │
[Background sends INJECT_OVERLAY to content script]
        │
[Content script renders overlay in shadow root]
        │
[User drags selection → releases]
        │
[Content script sends REGION_SELECTED { x, y, width, height, devicePixelRatio }]
        │
[Background calls captureVisibleTab()]
        │
[Web Worker crops + compresses]
        │
[Discard full screenshot, store only crop]
        │
[Continue as silent capture]
```

### 9.4 Message Types (Complete)

```typescript
// Background → UI
'SESSION_STARTED'
'STEP_ADDED'
'STEP_UPDATED'
'STEP_DELETED'
'STEPS_REORDERED'
'SESSION_ENDED'
'OPEN_NOTE_POPUP'
'OPEN_TECH_POPUP'
'CAPTURE_ERROR'
'STORAGE_WARNING'        // Quota approaching

// UI → Background
'START_SESSION'
'END_SESSION'
'UPDATE_STEP'
'DELETE_STEP'
'REORDER_STEPS'
'TECH_DATA_SELECTED'
'NOTE_SUBMITTED'
'EXPORT_SESSION'
'GET_SESSION_LIST'
'GET_SESSION_DETAIL'

// Background → Content Script
'INJECT_OVERLAY'
'REMOVE_OVERLAY'

// Content Script → Background
'REGION_SELECTED'
'REGION_CANCELLED'
'CONSOLE_ENTRY'          // Streamed as they happen
```

---

## 10. REPOSITORY STRUCTURE

```
qa-extension/
│
├── manifest.json
├── vite.config.ts
├── tsconfig.json
├── package.json
│
├── background/
│   ├── index.ts                    Entry point
│   ├── commandHandler.ts           Maps chrome.commands to services
│   ├── messageRouter.ts            Routes all chrome.runtime messages
│   │
│   ├── session/
│   │   ├── sessionManager.ts       Active session state, CRUD
│   │   ├── stepFactory.ts          Creates Step objects
│   │   └── stepValidator.ts        Validates before write
│   │
│   ├── capture/
│   │   ├── captureService.ts       captureVisibleTab + Worker bridge
│   │   ├── imageWorker.ts          Web Worker: compress + crop
│   │   └── tabInfoService.ts       Gets URL, title, domain
│   │
│   ├── network/
│   │   └── networkTracker.ts       webRequest listener, buffer mgmt
│   │
│   ├── storage/
│   │   ├── db.ts                   IndexedDB schema + idb setup
│   │   ├── sessionRepo.ts          Session CRUD
│   │   ├── screenshotRepo.ts       Blob CRUD
│   │   └── settingsRepo.ts         Settings CRUD
│   │
│   └── utils/
│       ├── idGen.ts                nanoid wrapper
│       └── errorHandler.ts         Standardised error types
│
├── content/
│   ├── index.ts                    Content script entry
│   ├── consoleTracker.ts           Overrides console.* methods
│   └── overlay/
│       ├── overlayManager.ts       Injects/removes overlay
│       ├── regionSelector.ts       Drag selection logic
│       └── overlay.css             Scoped styles for shadow root
│
├── worker/
│   └── imageWorker.ts              OffscreenCanvas crop + WebP encode
│
├── ui/
│   ├── main.tsx                    React entry
│   ├── App.tsx                     Root component + routing
│   │
│   ├── features/
│   │   ├── session/
│   │   │   ├── SessionList.tsx
│   │   │   ├── SessionHeader.tsx
│   │   │   └── useSession.ts
│   │   │
│   │   ├── timeline/
│   │   │   ├── Timeline.tsx
│   │   │   ├── StepCard.tsx
│   │   │   ├── StepThumbnail.tsx
│   │   │   └── useTimeline.ts
│   │   │
│   │   ├── step/
│   │   │   ├── StepEditor.tsx
│   │   │   ├── StepStatusBadge.tsx
│   │   │   ├── StepPreviewModal.tsx
│   │   │   └── useStep.ts
│   │   │
│   │   ├── capture/
│   │   │   └── NotePopup.tsx
│   │   │
│   │   ├── techCapture/
│   │   │   ├── TechCapturePopup.tsx
│   │   │   ├── NetworkEntryRow.tsx
│   │   │   └── ConsoleEntryRow.tsx
│   │   │
│   │   ├── export/
│   │   │   ├── ExportPanel.tsx
│   │   │   ├── docxExporter.ts
│   │   │   └── pdfExporter.ts
│   │   │
│   │   └── settings/
│   │       ├── SettingsPanel.tsx
│   │       └── HotkeyEditor.tsx
│   │
│   ├── store/
│   │   ├── sessionStore.ts         Zustand: sessions list
│   │   ├── activeSessionStore.ts   Zustand: current session + steps
│   │   └── settingsStore.ts        Zustand: settings
│   │
│   └── components/
│       ├── Button.tsx
│       ├── Badge.tsx
│       ├── Modal.tsx
│       ├── Tooltip.tsx
│       └── EmptyState.tsx
│
├── messaging/
│   ├── types.ts                    All message type definitions
│   ├── client.ts                   sendMessage wrapper with types
│   └── handlers.ts                 Handler registration helpers
│
├── types/
│   ├── session.ts
│   ├── step.ts
│   ├── network.ts
│   ├── console.ts
│   ├── annotation.ts
│   └── settings.ts
│
└── config/
    ├── constants.ts                Buffer sizes, limits, defaults
    └── hotkeys.ts                  Default hotkey definitions
```

---

## 11. TECH STACK

| Layer | Technology | Why |
|-------|-----------|-----|
| Extension API | Chrome MV3 | Current standard, required for webRequest |
| UI Framework | React 18 | Component model fits feature-based structure |
| Language | TypeScript | Required at this complexity level |
| State Management | Zustand | Lightweight, no boilerplate |
| Storage | IndexedDB via `idb` | Only option that handles Blobs correctly |
| Screenshot | `chrome.tabs.captureVisibleTab` | Only API with tab access |
| Image Processing | Web Worker + OffscreenCanvas | Non-blocking compression |
| Image Format | WebP @ 85% | ~60% smaller than PNG, same visual quality |
| ID Generation | `nanoid` | Short, URL-safe, fast |
| Export: Word | `docx` npm package | Best DOCX generation, no server needed |
| Export: PDF | `jspdf` + `html2canvas` | Offline PDF with screenshot embedding |
| Build | Vite + `crx` plugin | Fast HMR for extension development |
| Testing | Vitest + Playwright | Unit + E2E |

---

## 12. STORAGE LAYER

### 12.1 IndexedDB Schema (v1)

```typescript
// db.ts — idb setup

const DB_NAME = 'qa-extension'
const DB_VERSION = 1

interface QADatabase extends DBSchema {
  sessions: {
    key: string
    value: Session
    indexes: {
      'by-status': string
      'by-createdAt': string
    }
  }
  steps: {
    key: string
    value: Step
    indexes: {
      'by-sessionId': string
      'by-sessionId-stepNumber': [string, number]
    }
  }
  screenshots: {
    key: string
    value: ScreenshotRecord
    indexes: {
      'by-stepId': string
      'by-sessionId': string
    }
  }
  settings: {
    key: string           // Always 'singleton'
    value: Settings
  }
}
```

### 12.2 Schema Migration Strategy

IndexedDB uses integer versions. Each version bump runs a migration in the `upgrade` callback. Never drop stores — add new ones or transform existing ones.

```typescript
const db = await openDB<QADatabase>(DB_NAME, DB_VERSION, {
  upgrade(db, oldVersion, newVersion) {
    if (oldVersion < 1) {
      // v0 → v1: Initial schema
      const sessionStore = db.createObjectStore('sessions', { keyPath: 'id' })
      sessionStore.createIndex('by-status', 'status')
      sessionStore.createIndex('by-createdAt', 'createdAt')
      
      const stepStore = db.createObjectStore('steps', { keyPath: 'id' })
      stepStore.createIndex('by-sessionId', 'sessionId')
      stepStore.createIndex('by-sessionId-stepNumber', ['sessionId', 'stepNumber'])
      
      const screenshotStore = db.createObjectStore('screenshots', { keyPath: 'id' })
      screenshotStore.createIndex('by-stepId', 'stepId')
      screenshotStore.createIndex('by-sessionId', 'sessionId')
      
      db.createObjectStore('settings', { keyPath: 'key' })
    }
    // if (oldVersion < 2) { /* v2 migration */ }
  }
})
```

### 12.3 Storage Quota Management

IndexedDB quota is origin-based, typically 60% of free disk space but browsers enforce per-origin limits.

```typescript
// Check quota before capture
async function checkStorageQuota(): Promise<QuotaStatus> {
  const estimate = await navigator.storage.estimate()
  const used = estimate.usage ?? 0
  const quota = estimate.quota ?? Infinity
  const percentUsed = (used / quota) * 100
  
  if (percentUsed > 90) return 'critical'   // Block capture, warn user
  if (percentUsed > 75) return 'warning'    // Warn user, capture allowed
  return 'ok'
}
```

### 12.4 Session Deletion & Orphan Cleanup

When a session is deleted:
1. Delete all step records for that session
2. Delete all screenshot Blobs for that session
3. Delete the session record last

Never delete session without cascading. Run an orphan-cleanup on extension startup.

```typescript
async function deleteSession(sessionId: string) {
  const tx = db.transaction(['sessions', 'steps', 'screenshots'], 'readwrite')
  
  // 1. Get all screenshot IDs for this session
  const screenshots = await tx.objectStore('screenshots')
    .index('by-sessionId').getAll(sessionId)
  
  // 2. Delete screenshots
  for (const s of screenshots) {
    await tx.objectStore('screenshots').delete(s.id)
  }
  
  // 3. Get and delete all steps
  const steps = await tx.objectStore('steps')
    .index('by-sessionId').getAll(sessionId)
  for (const step of steps) {
    await tx.objectStore('steps').delete(step.id)
  }
  
  // 4. Delete session
  await tx.objectStore('sessions').delete(sessionId)
  await tx.done
}
```

---

## 13. PERFORMANCE RULES

### 13.1 Hard Targets

| Operation | Target | Failure Mode |
|-----------|--------|-------------|
| Hotkey to screenshot saved | < 100ms | Log warning, surface to user if > 300ms |
| UI timeline render (50 steps) | < 16ms | Virtualize list |
| Export (50 steps, Word) | < 5s | Show progress bar |
| Extension popup open | < 200ms | |
| Storage write per step | < 20ms | Use async, never block capture |

### 13.2 Web Worker for Image Processing

Image processing (compress, crop, format convert) happens in a dedicated Web Worker. The background service worker is never blocked waiting for image ops.

```typescript
// captureService.ts
const imageWorker = new Worker(new URL('../worker/imageWorker.ts', import.meta.url))

async function processImage(
  dataUrl: string,
  region?: RegionBounds,
  quality = 85
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    imageWorker.postMessage({ dataUrl, region, quality })
    imageWorker.onmessage = (e) => resolve(e.data.blob)
    imageWorker.onerror = reject
  })
}
```

### 13.3 Write Queue

All IndexedDB writes go through a write queue. Prevents concurrent write contention and ensures ordering.

```typescript
class WriteQueue {
  private queue: Array<() => Promise<void>> = []
  private running = false
  
  enqueue(task: () => Promise<void>) {
    this.queue.push(task)
    if (!this.running) this.drain()
  }
  
  private async drain() {
    this.running = true
    while (this.queue.length > 0) {
      const task = this.queue.shift()!
      await task()
    }
    this.running = false
  }
}
```

### 13.4 UI Performance

- Timeline list: use `react-window` for virtualized rendering if step count > 30
- Thumbnails: lazy-load using `IntersectionObserver`
- Screenshot preview: load Blob URL on demand, revoke after preview closes
- Zustand store: keep active session and session list in separate stores to avoid unnecessary re-renders

---

## 14. SECURITY MODEL

### 14.1 Core Principles

- **Zero network calls** — Extension never phones home
- **Local storage only** — All data lives in the user's browser
- **User-triggered only** — Nothing is captured without explicit user action
- **No external scripts** — No CDN loads, all dependencies bundled

### 14.2 Manifest Permissions (Minimal)

```json
{
  "permissions": [
    "activeTab",
    "tabs",
    "storage",
    "commands",
    "scripting",
    "webRequest"
  ],
  "host_permissions": [
    "<all_urls>"
  ]
}
```

> `<all_urls>` is required for cross-domain session support (payment.com → auth.com flows). Do not scope narrower or multi-domain sessions break. Explain this clearly in the Chrome Web Store listing.

### 14.3 Content Security Policy

```json
{
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'none'; base-uri 'none';"
  }
}
```

This blocks:
- Inline scripts (`'unsafe-inline'` not present)
- `eval` and `new Function`
- External script loads
- Object/embed injections

### 14.4 Content Script Isolation

```typescript
// content/index.ts
// Runs in ISOLATED world — no access to page's JavaScript variables
// Cannot read page's window.localStorage, React state, etc.
// Can only access DOM and postMessage bridge
```

Console interception uses the isolated world's own `console` — does not interfere with page DevTools.

### 14.5 Data Handling Rules

- Screenshots: stored as Blobs, never transmitted
- Notes: stored as plain text, never transmitted
- Network entries: stored locally, URL only (no request/response bodies)
- Console entries: message text only, truncated at 500 chars (prevents accidental credential capture from logs)
- Never capture: form field values, input contents, password fields

### 14.6 No `eval`, No Dynamic Code

```typescript
// NEVER do this
eval(userInput)
new Function(userInput)
setTimeout(userInput, 0)  // string form

// Use typed functions only
setTimeout(() => doSomething(), 0)
```

---

## 15. ERROR STATES & RECOVERY

### 15.1 Capture Failure

`captureVisibleTab` can fail for several reasons.

```typescript
async function captureWithFallback(tabId: number): Promise<string | null> {
  try {
    return await chrome.tabs.captureVisibleTab(null, { format: 'png' })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    
    if (message.includes('Cannot access')) {
      // chrome:// pages, browser internal pages — not capturable
      notifyUI('CAPTURE_ERROR', {
        code: 'RESTRICTED_PAGE',
        message: 'This page cannot be captured (browser restriction)',
        suggestion: 'Navigate to a regular web page to capture'
      })
    } else if (message.includes('active tab')) {
      // Tab not in focus
      notifyUI('CAPTURE_ERROR', {
        code: 'TAB_NOT_ACTIVE',
        message: 'Please click on the tab before capturing',
      })
    } else {
      // Generic error — create step record with no screenshot
      notifyUI('CAPTURE_ERROR', {
        code: 'UNKNOWN',
        message: 'Screenshot failed. Step saved without screenshot.',
      })
      // Still create the step — note + URL + context is still valuable
    }
    return null
  }
}
```

**Rule: Always create the step record even if screenshot fails.** The URL, title, timestamp, and any notes are still valuable documentation.

### 15.2 IndexedDB Quota Exceeded

```typescript
async function saveWithQuotaCheck(step: Step): Promise<SaveResult> {
  const quota = await checkStorageQuota()
  
  if (quota === 'critical') {
    // Show blocking UI: "Storage full. Delete old sessions to continue."
    return { success: false, reason: 'QUOTA_EXCEEDED' }
  }
  
  if (quota === 'warning') {
    // Show non-blocking toast: "Storage at 75%. Consider exporting old sessions."
    notifyUI('STORAGE_WARNING', { message: 'Storage is getting full' })
  }
  
  try {
    await sessionRepo.appendStep(step)
    return { success: true }
  } catch (err) {
    if (String(err).includes('QuotaExceededError')) {
      notifyUI('CAPTURE_ERROR', { code: 'QUOTA_EXCEEDED', message: 'Storage full' })
      return { success: false, reason: 'QUOTA_EXCEEDED' }
    }
    throw err
  }
}
```

### 15.3 Extension Crash / Service Worker Restart

Service workers can be killed by the browser at any time (MV3 constraint). Recovery strategy:

```typescript
// On every background startup:
async function recoverOrphanedSessions() {
  const activeSessions = await sessionRepo.getByStatus('active')
  
  for (const session of activeSessions) {
    const lastStep = await sessionRepo.getLastStep(session.id)
    const timeSinceLastActivity = Date.now() - new Date(lastStep?.timestamp ?? session.createdAt).getTime()
    
    if (timeSinceLastActivity > 30 * 60 * 1000) {
      // Session has been inactive > 30 min — auto-complete it
      await sessionRepo.update(session.id, {
        status: 'completed',
        completedAt: new Date().toISOString(),
        name: session.name + ' (auto-closed)'
      })
    }
    // Otherwise: session restored, user can continue
  }
}
```

### 15.4 Hotkey Already Registered

Chrome allows other extensions to claim the same shortcuts. Handle gracefully:

```typescript
// On startup, verify all hotkeys are registered
async function verifyHotkeys() {
  const commands = await chrome.commands.getAll()
  const unregistered = commands.filter(cmd => !cmd.shortcut)
  
  if (unregistered.length > 0) {
    notifyUI('HOTKEY_CONFLICT', {
      affected: unregistered.map(c => c.name),
      message: 'Some hotkeys are not registered. Go to Settings to reassign.'
    })
  }
}
```

### 15.5 Content Script Not Injected

Content script may not be present on pages that were open before extension install/update.

```typescript
async function ensureContentScript(tabId: number) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/index.js']
    })
  } catch {
    // Tab may be a chrome:// page — silently ignore
  }
}
```

### 15.6 Error UI Rules

| Error Type | Display Method | User Action Required? |
|-----------|----------------|----------------------|
| Capture failed (restricted page) | Toast (auto-dismiss 4s) | No |
| Storage warning (75%) | Toast (auto-dismiss 6s) | No |
| Storage critical (90%) | Blocking banner (persists) | Yes — delete sessions |
| Hotkey conflict | Settings badge + toast | Yes — reassign |
| Export failed | Modal with retry | Yes |
| Crash recovery | Toast "Session restored" | No |

---

## 16. NETWORK TRACKER

### 16.1 Implementation

Uses `chrome.webRequest` API in background. The API fires before any page code runs — it's a true network-level listener.

```typescript
// networkTracker.ts
const buffers = new Map<number, NetworkEntry[]>()  // tabId → entries

function startTracking() {
  chrome.webRequest.onCompleted.addListener(
    (details) => handleRequest(details),
    { urls: ['<all_urls>'] },
    ['responseHeaders']
  )
}

function handleRequest(details: chrome.webRequest.WebResponseCacheDetails) {
  const { tabId, url, method, statusCode, timeStamp, responseHeaders } = details
  
  if (tabId < 0) return  // Background requests, ignore
  if (isAsset(url)) return  // Skip images, fonts, etc. (see filter rules)
  
  const entry: NetworkEntry = {
    id: nanoid(),
    method,
    url,
    urlPath: new URL(url).pathname,
    statusCode,
    statusText: getStatusText(statusCode),
    durationMs: 0,  // Not available in onCompleted; use onBeforeRequest + onCompleted pair
    contentType: getHeader(responseHeaders, 'content-type') ?? '',
    timestamp: new Date(timeStamp).toISOString(),
    tabId,
    domain: new URL(url).hostname,
    requestBodySize: 0,
    responseBodySize: parseInt(getHeader(responseHeaders, 'content-length') ?? '0'),
    initiator: details.initiator ?? 'unknown'
  }
  
  const buffer = buffers.get(tabId) ?? []
  buffer.push(entry)
  if (buffer.length > MAX_BUFFER) buffer.shift()  // Circular
  buffers.set(tabId, buffer)
}
```

### 16.2 Asset Filtering

These URL patterns are excluded from the buffer (not useful for QA context):

```typescript
const SKIP_PATTERNS = [
  /\.(png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|ttf|eot|css|map)(\?.*)?$/i,
  /^chrome-extension:\/\//,
  /^data:/,
  /\/(favicon|robots\.txt)/i,
  /google-analytics/i,
  /analytics\./i,
  /hotjar\./i,
]

function isAsset(url: string): boolean {
  return SKIP_PATTERNS.some(p => p.test(url))
}
```

### 16.3 Request Timing

`chrome.webRequest` requires pairing `onBeforeRequest` and `onCompleted` to calculate duration:

```typescript
const pendingRequests = new Map<string, number>()  // requestId → startTime

chrome.webRequest.onBeforeRequest.addListener(
  (details) => { pendingRequests.set(details.requestId, details.timeStamp) },
  { urls: ['<all_urls>'] }
)

chrome.webRequest.onCompleted.addListener(
  (details) => {
    const start = pendingRequests.get(details.requestId)
    const durationMs = start ? details.timeStamp - start : 0
    pendingRequests.delete(details.requestId)
    // use durationMs in entry
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders']
)
```

---

## 17. CONSOLE TRACKER

### 17.1 Injection Strategy

Console interception happens in the content script (isolated world). Overrides the four main methods.

```typescript
// consoleTracker.ts
const originalConsole = {
  log: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  info: console.info.bind(console),
}

const LEVELS: Array<keyof typeof originalConsole> = ['log', 'warn', 'error', 'info']

LEVELS.forEach(level => {
  console[level] = (...args: unknown[]) => {
    originalConsole[level](...args)  // Never suppress — DevTools still sees it
    
    const message = args.map(a => safeStringify(a)).join(' ')
    chrome.runtime.sendMessage({
      type: 'CONSOLE_ENTRY',
      payload: {
        level,
        message: message.slice(0, 500),
        fullMessage: message,
        timestamp: new Date().toISOString(),
        source: getCallSite(),
      }
    })
  }
})
```

### 17.2 Safe Stringify

```typescript
function safeStringify(value: unknown): string {
  if (typeof value === 'string') return value
  if (value instanceof Error) return `${value.name}: ${value.message}`
  try {
    return JSON.stringify(value, null, 0)
  } catch {
    return String(value)
  }
}
```

### 17.3 Rules

- **Never suppress original logs** — Page DevTools must still work normally
- **Truncate at 500 chars** for buffer storage, store full in `fullMessage`
- **Skip redundant entries**: Same message + level within 100ms = deduplicate
- **Clear buffer on hard navigation** (`beforeunload`) — or follow the multi-navigation retention setting from Section 6.6

### 17.4 Known Limitations (Document, Don't Fix in MVP)

These limitations are acceptable for MVP. Document them in the extension's help text so users aren't surprised.

| Limitation | Reason | Impact |
|------------|--------|--------|
| Misses logs that fire before content script injection | `document_start` runs early but not instantaneously | Very early boot logs from some frameworks won't appear |
| Misses logs inside cross-origin iframes | Content script isolation prevents iframe access | Logs from embedded third-party widgets won't appear |
| Misses some framework-internal logs | Some frameworks (React DevTools, Angular) use patched console objects that bypass the standard `console.*` | Framework-level errors may not be captured |
| `console.debug` not tracked | Low signal-to-noise for QA context | Not a real gap for QA documentation |

These do not need to be fixed for MVP1 or MVP2. They are inherent browser extension constraints, not implementation bugs.

---

## 18. MULTI-DOMAIN SUPPORT

### 18.1 The Problem

A single test flow may cross domains:

```
app.company.com → auth.company.com → payment.stripe.com → app.company.com
```

Each page is a separate origin. Content scripts are injected per-page. The background service worker is global.

### 18.2 Solution: Background as Global Brain

The session lives entirely in the background. Content scripts report data up; background assembles it.

Each step records its domain independently:

```typescript
step.domain = new URL(tab.url).hostname  // "auth.company.com"
step.url = tab.url
```

No session logic is needed in the content script. It just reports.

### 18.3 Content Script Per-Origin Registration

In `manifest.json`:

```json
{
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content/index.js"],
      "run_at": "document_start",
      "world": "ISOLATED"
    }
  ]
}
```

`document_start` ensures console tracking starts before any page code runs.

---

## 19. SESSION MANAGEMENT

### 19.1 Session States

```
[Not started]
    │
    ▼
[active]  ←──── Steps added here
    │
    ▼
[completed]  ←── User ends session or auto-closed after 30min inactivity
    │
    ▼
[archived]  ←── User archives (hides from main list)
```

### 19.2 Session Naming

Auto-name format: `Session — May 2, 2:30 PM`

User can rename at any time, before or after completing.

### 19.3 Session List View

The main sessions list shows:
- Session name
- Status badge
- Step count
- Date + time
- Environment tag (if set)
- First screenshot thumbnail

Sort options: Newest first (default), Oldest first, Name A-Z

Filter options: Status, Environment, Date range

### 19.4 Concurrent Session Rule

Only one session can be `active` at a time. Starting a new session while one is active prompts:
> "You have an active session: 'Login Flow'. End it first, or continue adding to it?"

### 19.5 Session Import/Export

Export a session as JSON for backup or sharing with teammates:

```typescript
interface SessionExport {
  version: number           // Export schema version
  exportedAt: string
  session: Session
  steps: Step[]
  screenshots: Array<{
    id: string
    dataUrl: string         // base64 for portability in JSON export
  }>
}
```

---

## 20. UI SYSTEM

> ⚠️ **MVP UI Scope:** The full UI described here (session list, timeline, step editor, export panel, settings panel) is a full application. For MVP1a, build only **Timeline + basic Step Editor**. Session list, export panel, and settings belong in MVP1b and MVP2 respectively. Define the views, but build the minimum that makes the tool usable.

### 20.1 Extension Anatomy

The extension uses a **Side Panel** (Chrome's `chrome.sidePanel` API), not a popup.

**Why Side Panel over popup:**
- Popup closes when user clicks outside — unusable during active testing
- Side Panel persists while user browses, exactly what a QA tool needs
- Adequate width (320px default, resizable)

```json
{
  "side_panel": {
    "default_path": "ui/index.html"
  },
  "permissions": ["sidePanel"]
}
```

### 20.2 Main Views

```
Side Panel
│
├── Session List View         (no active session)
│   ├── [New Session] button
│   ├── Session cards
│   └── [Import Session] button
│
├── Active Session View       (session running)
│   ├── Session header (name, step count, [End Session])
│   ├── Timeline (step cards, scrollable)
│   └── Floating [+] add step button (manual, no screenshot)
│
├── Step Editor               (drawer/modal over timeline)
│   ├── Screenshot preview (region highlight overlay)
│   ├── Note textarea
│   ├── Status selector (pass/fail/warn/info)
│   ├── Network entries (accordion)
│   ├── Console entries (accordion)
│   └── [Delete Step] (destructive, confirm)
│
├── Export Panel              (drawer)
│   ├── Format selector (Word / PDF)
│   ├── Options (include/exclude fields)
│   ├── Preview (step count, estimated size)
│   └── [Export] button
│
└── Settings Panel            (drawer)
    ├── Hotkey editor
    ├── Capture preferences
    ├── Export defaults
    ├── Storage usage bar
    └── [Clear all data] (destructive, confirm)
```

### 20.3 Timeline Step Card

```
┌──────────────────────────────────────────────┐
│  5  [FAIL]  auth.company.com                 │
│     ┌──────────────┐  POST /api/login → 500  │
│     │ [screenshot  │  TypeError: undefined   │
│     │  thumbnail]  │  14:32:01               │
│     └──────────────┘                         │
│     "Login failed with valid credentials"    │
└──────────────────────────────────────────────┘
```

Click → opens Step Editor drawer

### 20.4 Step Status Colors

| Status | Color | Meaning |
|--------|-------|---------|
| pass | Green | Expected behaviour confirmed |
| fail | Red | Bug found / unexpected behaviour |
| warning | Amber | Behaviour needs investigation |
| info | Blue | Neutral observation |
| unset | Grey | Not yet reviewed |

### 20.5 Drag-and-Drop Reordering

Steps can be reordered via drag-and-drop in the timeline. Implementation: `@dnd-kit/core` (lightweight, accessible).

On reorder:
1. Update `stepNumber` for all affected steps in memory
2. Batch-write to IndexedDB via write queue
3. Step numbers in export reflect the new order

### 20.6 Keyboard Navigation in UI

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate between steps in timeline |
| `Enter` | Open step editor for focused step |
| `Escape` | Close any open drawer/modal |
| `Delete` | Delete focused step (with confirmation) |
| `Ctrl+Z` | Undo last action |
| `E` | Export current session |
| `N` | Start new session |

### 20.7 Undo Support

QA testers frequently delete or reorder steps accidentally. Undo is not optional — it's a trust feature. Without it, testers will be afraid to clean up their timelines.

**Scope:** Undo covers the last single action only. No undo history stack needed for MVP.

Actions that are undoable:
- Step deleted
- Step reordered
- Step note cleared

```typescript
// In activeSessionStore
lastAction: UndoableAction | null

interface UndoableAction {
  type: 'DELETE_STEP' | 'REORDER_STEPS' | 'CLEAR_NOTE'
  snapshot: Step | Step[]   // What to restore
  expiresAt: number         // Timestamp — undo expires after 10s
}
```

UI: Show a toast immediately after the action:

```
"Step 5 deleted   [Undo]"   ← auto-dismisses in 10s
```

Clicking Undo restores from snapshot and cancels the IndexedDB delete. After 10s the toast dismisses and the action is permanent.

### 20.8 Duplicate Step

Useful when testing the same screen in two different states (e.g. empty form vs filled form). Avoids recapturing.

Duplicate creates a new step with:
- Same screenshot (new screenshotId pointing to a copied Blob)
- Same note (user can edit)
- Same status
- New `id`, new `timestamp`, incremented `stepNumber`
- Inserted immediately after the source step

Available via: right-click context menu on a step card → "Duplicate step"

### 20.9 Manual Step (No Screenshot)

Sometimes the most important QA observation has no visual — a console crash, a system hang, an unexpected redirect. The tester needs to document it without a screenshot.

Trigger: `+` button in timeline footer → "Add manual step"

Creates a step with:
```typescript
{
  captureMode: 'manual',
  screenshotId: null,
  note: '',             // User fills this in — required before saving
  status: 'unset'
}
```

The step card shows a "No screenshot" placeholder thumbnail. Everything else (note, status, tech data) works identically to a captured step.

---

## 21. EXPORT SYSTEM

> ⚠️ **Export Complexity Warning:** Word export is deceptively hard to get right — image scaling, layout breaking on large sessions, and formatting consistency across Word versions are all real gotchas. **Start with a simple, working export (correct content, minimal styling) and iterate.** A plain but complete report beats a crashed or corrupted fancy one every time.

### 21.1 Export Priority

**Word (.docx) is MVP1.** QA teams paste reports into Jira, Confluence, and email — they need editable .docx, not PDF.

PDF is MVP2.

### 21.2 Word Export Structure

```
[Document Header]
  Company logo (optional)
  Report Title: "QA Session Report — Login Flow"
  Date: May 2, 2025
  Tester: [name if set]
  Environment: [staging/production if set]
  Browser: Chrome 124
  Total Steps: 12   Pass: 8   Fail: 3   Warning: 1

[Summary Table]
  Step | Status | URL | Note
  1    | PASS   | /login | Form renders correctly

[Detailed Steps]
  Step 1 — PASS
  Time: 14:30:01
  URL: https://app.company.com/login
  Page: Login Page
  [Screenshot image]
  Note: Form renders correctly

  Step 2 — FAIL
  Time: 14:31:45
  URL: https://auth.company.com/api/login
  Page: Login Page
  [Screenshot image]
  Note: Login fails with valid credentials
  Network:
    POST /api/login → 500 (324ms)
  Console:
    ERROR TypeError: Cannot read property 'token' of undefined
```

### 21.3 Export Options

```typescript
interface ExportOptions {
  format: 'docx' | 'pdf'
  includeStepStatus: ('pass' | 'fail' | 'warning' | 'info' | 'unset')[]
  includeScreenshots: boolean
  includeSummaryTable: boolean
  includeTechData: boolean
  includeTimestamps: boolean
  includeUrls: boolean
  pageSize: 'A4' | 'Letter'
  testerName?: string
  logoUrl?: string
}
```

### 21.4 Export Progress

For sessions with 20+ steps, export can take 2–5 seconds. Show a progress modal:

```
Exporting session...
[████████░░░░░░░░░░░░] 8 / 20 steps
```

### 21.5 Export Error Handling

- If a screenshot Blob is missing for a step: include placeholder "Screenshot unavailable" text
- If export library throws: show retry dialog with error detail
- Export is always non-destructive — session data unchanged

### 21.6 Session Lock During Export

Prevent steps from being added, edited, or deleted while an export is in progress. An in-flight export reads step data and screenshot Blobs sequentially — a concurrent write can produce a corrupted or inconsistent document.

```typescript
// In activeSessionStore
isExporting: boolean  // Set true when export starts, false when done or failed

// In UI: disable all capture hotkeys and step edit buttons while isExporting === true
// Show subtle "Export in progress…" banner in timeline header
// Always auto-unlock if export errors
```

This is especially important for large sessions (20+ steps) where export takes several seconds.

---

## 22. SETTINGS & PREFERENCES

### 22.1 Settings Panel Sections

**Hotkeys**
- View currently assigned hotkeys
- Click to reassign (conflict detection built in)
- Reset to defaults button

**Capture**
- Image format: WebP (default) / PNG
- Quality: slider 60–100 (default 85)
- After region capture: Save silently / Ask for note

**Buffers**
- Network buffer size: 10–50 (default 20)
- Console buffer size: 10–50 (default 20)

**Sessions**
- Default session name format
- Default environment label
- Default tester name

**Export**
- Default format
- Default options (show/hide fields)
- Page size

**Storage**
- Storage used / available (visual bar)
- List sessions with size
- [Delete selected sessions] button
- [Export all sessions as JSON backup] button
- [Clear all data] (nuclear, confirm twice)

**UI**
- Theme: Light / Dark / System
- Timeline layout: Vertical list / Grid
- Thumbnail size

---

## 23. ONBOARDING & FIRST RUN

### 23.1 First Run Flow

On first install, open the side panel automatically and show the onboarding screen:

```
Welcome to QA Session Documenter
─────────────────────────────────

You're set up. Here are your capture shortcuts:

  📸 Silent capture       Ctrl+Shift+S
  📝 Capture + note       Ctrl+Shift+N
  🔬 Capture + tech data  Ctrl+Shift+D
  ✂️  Region capture       Ctrl+Shift+R

[Start a Test Session →]
```

### 23.2 First Capture Tutorial

On the first step captured in a session, show a one-time tooltip:

> "Step 1 added! Click the card to add a note or set status."

Dismiss on click, never show again.

### 23.3 Permission Prompts

`webRequest` and `<all_urls>` host permissions trigger Chrome's "This extension can read and change all your data on all websites" warning. Prepare a short explanation for the store listing:

> "This extension reads network requests only when you press a hotkey and only for technical context you explicitly choose to attach to a step. It cannot read page content, passwords, or form data."

---

## 24. KEYBOARD SHORTCUT SYSTEM

### 24.1 Chrome Command Registration

```json
{
  "commands": {
    "capture-silent": {
      "suggested_key": { "default": "Ctrl+Shift+S", "mac": "Command+Shift+S" },
      "description": "Silent capture"
    },
    "capture-note": {
      "suggested_key": { "default": "Ctrl+Shift+N", "mac": "Command+Shift+N" },
      "description": "Capture with note"
    },
    "capture-tech": {
      "suggested_key": { "default": "Ctrl+Shift+D", "mac": "Command+Shift+D" },
      "description": "Capture with technical data"
    },
    "capture-region": {
      "suggested_key": { "default": "Ctrl+Shift+R", "mac": "Command+Shift+R" },
      "description": "Region capture"
    }
  }
}
```

### 24.2 Conflict Detection

Chrome only allows 4 commands in `manifest.json`. Additional commands can be registered via `chrome.commands` API but this is rarely needed.

If a shortcut is taken by another extension:
1. The shortcut appears unassigned in `chrome.commands.getAll()`
2. Background detects this on startup
3. UI shows a badge on the Settings tab: "1 shortcut needs reassignment"
4. User is directed to `chrome://extensions/shortcuts`

### 24.3 Shortcut Reassignment UI

The settings panel shows all four shortcuts. Clicking one starts a "press your shortcut" capture mode:

```
Capture + Note: [_________]  ← click, then press new shortcut
                Press your shortcut combination...
                (Escape to cancel)
```

Updates via `chrome.commands.update()` API.

---

## 25. DESIGN PATTERNS

### 25.1 Service Layer (Logic)

All business logic lives in service classes, not in message handlers or UI components.

```
CommandHandler.ts → receives hotkey
    → calls CaptureService.capture()
    → calls SessionManager.appendStep()
    → calls MessageRouter.notify()
```

### 25.2 Repository Pattern (Storage)

All IndexedDB access goes through repository classes. No component or service touches `db` directly.

```typescript
sessionRepo.getAll()
sessionRepo.getById(id)
sessionRepo.create(session)
sessionRepo.update(id, partial)
sessionRepo.delete(id)
```

### 25.3 Factory Pattern (Step Creation)

Step creation is centralised in `StepFactory`. Nothing else creates step objects.

```typescript
const step = StepFactory.create({
  sessionId,
  tabInfo,
  screenshotId,
  note: '',
  networkEntries: [],
  consoleEntries: [],
})
```

### 25.4 Message Router

All `chrome.runtime.onMessage` listeners are registered in one place. No scattered `addListener` calls.

```typescript
// messageRouter.ts
const handlers: Record<string, Handler> = {
  'START_SESSION': handleStartSession,
  'END_SESSION': handleEndSession,
  'TECH_DATA_SELECTED': handleTechDataSelected,
  // ...
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handler = handlers[msg.type]
  if (!handler) return
  handler(msg.payload, sender).then(sendResponse)
  return true  // keep channel open for async response
})
```

### 25.5 Zustand Store Separation

```typescript
// Separate stores to avoid re-renders from unrelated state changes
useSessionListStore   // session list, counts
useActiveSessionStore // active session + all steps
useSettingsStore      // user preferences
useUIStore            // panel open/closed, active view
```

---

## 26. TESTING STRATEGY

### 26.1 Unit Tests (Vitest)

Test all service and utility logic in isolation. No browser APIs needed.

```
captureService.test.ts      — image processing logic
stepFactory.test.ts         — step object creation
sessionManager.test.ts      — session state transitions
networkTracker.test.ts      — buffer logic, asset filtering
consoleTracker.test.ts      — stringify, deduplication
storageQuota.test.ts        — quota check logic
exportDocx.test.ts          — document structure
```

### 26.2 Integration Tests (Vitest + fake-indexeddb)

Test storage layer with a real IndexedDB in Node using `fake-indexeddb`.

```
sessionRepo.test.ts         — CRUD, cascading delete
screenshotRepo.test.ts      — Blob storage + retrieval
migration.test.ts           — Schema upgrade paths
```

### 26.3 E2E Tests (Playwright with Extension)

Playwright supports loading Chrome extensions. Test the full capture flow.

```typescript
// Load extension in Playwright
const extensionPath = path.join(__dirname, '../dist')
const context = await chromium.launchPersistentContext('', {
  headless: false,
  args: [`--load-extension=${extensionPath}`]
})

// Test: silent capture creates a step
await page.goto('https://example.com')
await page.keyboard.press('Control+Shift+S')
// Wait for step to appear in side panel
const stepCard = await page.locator('[data-testid="step-card"]').first()
await expect(stepCard).toBeVisible()
```

Tests to cover:
- Silent capture → step appears in timeline
- Note capture → note saved on step
- Region capture → overlay appears, crop saved
- Export → file downloaded
- Session end → session moves to completed state
- Crash recovery → orphaned session restored

### 26.4 Manual Test Checklist (Before Any Release)

See Section 30.

---

## 27. BUILD CONFIGURATION

### 27.1 Vite Config

```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import manifest from './manifest.json'

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest }),
  ],
  build: {
    rollupOptions: {
      input: {
        background: 'background/index.ts',
        content: 'content/index.ts',
        worker: 'worker/imageWorker.ts',
        ui: 'ui/main.tsx',
      }
    }
  },
  worker: {
    format: 'es',
  }
})
```

### 27.2 manifest.json (Complete)

```json
{
  "manifest_version": 3,
  "name": "QA Session Documenter",
  "version": "0.1.0",
  "description": "Capture, document, and export QA test sessions without interrupting your flow.",
  
  "permissions": [
    "activeTab",
    "tabs",
    "storage",
    "commands",
    "scripting",
    "webRequest",
    "sidePanel"
  ],
  
  "host_permissions": ["<all_urls>"],
  
  "background": {
    "service_worker": "background/index.js",
    "type": "module"
  },
  
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content/index.js"],
      "run_at": "document_start",
      "world": "ISOLATED"
    }
  ],
  
  "side_panel": {
    "default_path": "ui/index.html"
  },
  
  "action": {
    "default_title": "Open QA Documenter",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  
  "commands": {
    "capture-silent": {
      "suggested_key": { "default": "Ctrl+Shift+S", "mac": "Command+Shift+S" },
      "description": "Silent capture"
    },
    "capture-note": {
      "suggested_key": { "default": "Ctrl+Shift+N", "mac": "Command+Shift+N" },
      "description": "Capture with note"
    },
    "capture-tech": {
      "suggested_key": { "default": "Ctrl+Shift+D", "mac": "Command+Shift+D" },
      "description": "Capture with technical data"
    },
    "capture-region": {
      "suggested_key": { "default": "Ctrl+Shift+R", "mac": "Command+Shift+R" },
      "description": "Region capture"
    }
  },
  
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'none'; base-uri 'none';"
  },
  
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

### 27.3 tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable", "WebWorker"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "jsx": "react-jsx",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["background", "content", "worker", "ui", "messaging", "types", "config"]
}
```

### 27.4 Package Dependencies

```json
{
  "dependencies": {
    "react": "^18",
    "react-dom": "^18",
    "zustand": "^4",
    "idb": "^8",
    "nanoid": "^5",
    "docx": "^8",
    "jspdf": "^2",
    "html2canvas": "^1",
    "@dnd-kit/core": "^6",
    "@dnd-kit/sortable": "^8"
  },
  "devDependencies": {
    "@crxjs/vite-plugin": "^2",
    "@types/chrome": "^0.0.260",
    "typescript": "^5",
    "vite": "^5",
    "@vitejs/plugin-react": "^4",
    "vitest": "^1",
    "fake-indexeddb": "^5",
    "playwright": "^1"
  }
}
```

---

## 28. MVP ROADMAP

### Build Order (Day-by-Day Guide)

```
Day 1  → Extension scaffold (Vite + manifest + background + side panel shell)
Day 2–3 → Silent capture → store → show in UI timeline
Day 4–5 → Notes + session start/end + basic step editor
Day 6   → Word export (simple, no fancy formatting)
Day 7   → Error handling polish + crash recovery
--- MVP1a DONE: a real, shippable tool ---
Day 8–9 → Region capture (overlay + crop)
Day 10  → Undo + duplicate step + manual step
Day 11  → Export formatting improvements
--- MVP1b DONE ---
```

---

### MVP1a — Minimum Shippable Tool (Days 1–7)

**Goal:** A QA tester can run a session, capture steps with notes, and export a Word report. Nothing more.

> Keep this scope locked. Every temptation to add "just one more thing" here pushes the ship date and adds risk. Get this into real testers' hands first.

| Feature | Notes |
|---------|-------|
| Silent capture (Ctrl+Shift+S) | Screenshot + auto-context |
| Capture + note (Ctrl+Shift+N) | Small note input popup |
| Active session timeline | Vertical list, step cards with thumbnails |
| Step status tagging | pass/fail/warn/info |
| Step note editing | Click card → edit inline |
| Session start + end | Named sessions |
| Word export (.docx) | Simple: header + steps with screenshots. No fancy formatting. |
| Auto-save every step | To IndexedDB |
| Crash recovery | Restore orphaned active sessions |
| Capture error handling | Step saved even if screenshot fails |
| First-run onboarding | One screen, shortcuts overview |
| Side panel UI | Persistent during browsing |

### MVP1b — Complete Core Experience (Days 8–11)

**Goal:** Fill the gaps that real testers will hit in the first week.

| Feature | Notes |
|---------|-------|
| Region capture (Ctrl+Shift+R) | Overlay + crop. See complexity warning in Section 5. |
| Undo last action | Step deleted/reordered/cleared — 10s toast undo |
| Duplicate step | Right-click → duplicate, for same-screen comparisons |
| Manual step (no screenshot) | `+` button → document without capture |
| Session lock during export | Disable edits while export is in progress |
| Storage quota warning | Toast at 75%, block at 90% |
| Export formatting improvements | Better image scaling, summary table |

### MVP2 — Technical Context & Polish

| Feature | Notes |
|---------|-------|
| Capture + tech data (Ctrl+Shift+D) | Network + console selection popup |
| Network tracking | webRequest buffer, asset filtering, 2-navigation retention |
| Console tracking | Injection, deduplication, known limitations documented |
| Multi-domain support | Step records domain per step |
| PDF export | jspdf + html2canvas |
| Session list view | Sort, filter by status/date |
| Drag-and-drop step reorder | @dnd-kit |
| Step deletion | With confirmation |
| Settings panel | Hotkeys, capture prefs, buffer behaviour, export defaults |
| Hotkey conflict detection | Badge + toast |
| Storage management UI | Usage bar, delete sessions |

### MVP3 — Annotation & Organisation

| Feature | Notes |
|---------|-------|
| Step annotations | Arrow, rect, circle, text, blur |
| Session tags | User-defined labels |
| Session environment label | staging/production/dev |
| Step search / filter | Filter by status, domain, keyword |
| Session archiving | Hide from main list |
| JSON backup export | Full session with screenshots |
| JSON import | Restore from backup |
| Keyboard navigation in UI | Arrow keys, shortcuts |

### MVP4 — Smart Capture

| Feature | Notes |
|---------|-------|
| Auto-capture on error | When console error fires, silent capture automatically |
| Auto-capture on navigation | New URL = new step (user opt-in) |
| Click-to-annotate | Click element on page, highlights in screenshot |
| Screenshot diff | Compare step N to step N-1 visually |

### MVP5 — Team & Integration

| Feature | Notes |
|---------|-------|
| Jira integration | Export directly to Jira issue |
| Slack integration | Share session summary to channel |
| Report templates | Custom branding, field ordering |
| Multi-tester session merge | Combine two JSON exports |

---

## 29. WHAT NOT TO BUILD

| Temptation | Why to Resist |
|------------|--------------|
| Full network body capture | Captures passwords, tokens, PII. Security risk. |
| Continuous background recording | Kills performance, creeps users out, no need |
| Full DevTools replacement | Separate product, separate user, different job |
| Cloud sync | Account system = scope explosion. Local-first is the differentiator. |
| Video recording | FFmpeg in browser = massive bundle, complex UX, another product |
| Auto-filling test descriptions with AI | Adds latency, requires API key, trust issue |
| Cypress/Playwright integration | Dev tool territory, not QA documentation territory |
| Screenshot OCR | Complex, slow, rarely needed in documentation |

---

## 30. RELEASE CHECKLIST

### Code Quality
- [ ] TypeScript strict mode: zero errors
- [ ] No `any` types (use `unknown` + narrowing)
- [ ] No `console.log` left in production code
- [ ] All async functions have error handling
- [ ] Write queue used for all storage writes
- [ ] Web Worker used for all image processing
- [ ] SW init guard in place — all command handlers check `initialized` before acting

### Security
- [ ] CSP header in manifest
- [ ] No `eval` or `new Function` anywhere
- [ ] Content script runs in `ISOLATED` world
- [ ] No base64 in step records (Blob refs only)
- [ ] Console entries truncated to 500 chars
- [ ] No network bodies captured

### Performance
- [ ] Capture pipeline benchmarked: < 100ms p95
- [ ] Timeline renders 50 steps without jank
- [ ] Thumbnails lazy-loaded
- [ ] Blob URLs revoked after use

### Error Handling
- [ ] Capture fails gracefully (step saved without screenshot)
- [ ] Quota exceeded: block + warn
- [ ] Crash recovery tested (kill service worker manually)
- [ ] Hotkey conflict: detection + user guidance

### Manual Test Pass (Before Every Release)
- [ ] Silent capture on regular page
- [ ] Silent capture on chrome:// page (should show error toast)
- [ ] Capture + note: note saved correctly
- [ ] Region capture: selection, confirm, crop correct
- [ ] Tech capture: network entries appear, console entries appear, correct tab
- [ ] Multi-domain: capture on tab 1, navigate to different domain, capture again — both steps have correct domains
- [ ] 50-step session: no slowdown, timeline scrolls smoothly
- [ ] Export Word: file opens in Word/LibreOffice, images embedded, structure correct
- [ ] Export while session has 0 screenshots: placeholder text appears correctly
- [ ] Export while session is exporting: edit buttons disabled, banner visible
- [ ] Storage warning: manually fill to 75%, toast appears
- [ ] Service worker killed mid-session: reload extension, session restored
- [ ] Hotkey pressed immediately on browser start (SW cold start): step created correctly, no silent failure
- [ ] Extension updated: existing sessions intact
- [ ] Hotkey conflict: disable shortcut in chrome://extensions/shortcuts, badge appears
- [ ] Settings: change hotkey, new hotkey works
- [ ] Delete step → undo toast appears → click Undo → step restored
- [ ] Delete step → wait 10s → step gone permanently (no undo after expiry)
- [ ] Duplicate step: new step inserted after source, same content, different id
- [ ] Manual step: adds to timeline with no-screenshot placeholder, note required

### Chrome Web Store Submission
- [ ] Screenshots (1280×800): session view, step editor, export, tech capture popup
- [ ] Promo tile (440×280)
- [ ] Description written (plain language, no jargon)
- [ ] Privacy policy page (even if minimal: "No data collected, all local")
- [ ] Permission justification written for `<all_urls>` and `webRequest`
- [ ] Version number bumped

---

## FINAL THOUGHT

This extension wins because it makes documentation a side effect of testing, not a separate phase.

QA testers don't change how they work. The tool silently builds the report alongside them.

Every design decision traces back to one constraint: **capture must never interrupt flow.**

---

*Document version: 1.1 — Updated with architecture review: MVP split, SW init guard, undo/duplicate/manual step, export lock, buffer retention, console limitations, region complexity warning*
