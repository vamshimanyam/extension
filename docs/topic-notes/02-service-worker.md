# Service Worker From Scratch

In Manifest V3, the background runtime is a service worker. This is one of the most important concepts in modern Chrome extension development.

This project uses the service worker as the extension's backend. It listens for browser events, captures screenshots, routes messages, stores data, and notifies the side panel UI.

---

## 1. What A Service Worker Is In An Extension

A browser extension service worker is a JavaScript runtime that runs in the background when Chrome needs it.

It is event-driven:

```text
event happens -> Chrome wakes service worker -> your listener runs -> work finishes -> Chrome may stop worker
```

It is not a permanent server. It can be stopped and restarted by the browser.

---

## 2. What It Can And Cannot Do

Good uses:

- Listen for `chrome.runtime.onMessage`.
- Listen for `chrome.commands.onCommand`.
- Listen for `chrome.tabs` events.
- Listen for `chrome.webRequest` events.
- Call `chrome.tabs.captureVisibleTab`.
- Use IndexedDB.
- Use `chrome.storage.local`.
- Send messages to extension pages.

Bad uses:

- Rendering React.
- Manipulating the DOM directly.
- Assuming global variables last forever.
- Running endless loops or permanent timers.
- Doing heavy UI-specific report rendering that needs the document.

No DOM means this will fail:

```ts
document.querySelector('body')
```

If you need DOM access in a page, inject a script into that page or do the work in the side panel.

---

## 3. Minimal Service Worker

```ts
chrome.runtime.onInstalled.addListener(() => {
  console.log('Extension installed')
})

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  sendResponse({ ok: true, received: message })
  return true
})
```

For a real extension, avoid putting all logic directly in the listener. Delegate to services.

---

## 4. This Project's Service Worker Shape

The project service worker lives in:

```text
background/index.ts
```

It creates shared services:

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

This is called the composition root pattern. One file wires the system together, while the actual logic lives in focused classes.

---

## 5. Service Worker Lifecycle

Important lifecycle facts:

- Chrome starts the worker when an event needs it.
- Chrome can stop it after work completes.
- Memory is not durable.
- Startup code runs again after restart.
- Listeners must be registered when the worker loads.

This means you should not rely on this forever:

```ts
let activeSessionId = 'abc123'
```

Instead, store important state:

```ts
await chrome.storage.local.set({ activeSessionId: 'abc123' })
```

Then restore it during initialization.

---

## 6. Initialization Pattern

Use an idempotent initializer. Idempotent means it is safe to call more than once.

```ts
let initialized = false

async function init(): Promise<void> {
  if (initialized) {
    return
  }

  await getDb()
  await settingsRepo.get()
  await sessionManager.restoreActiveSession()

  initialized = true
}
```

Then wrap event handlers:

```ts
function requireInit<Args extends unknown[]>(fn: (...args: Args) => Promise<void>) {
  return async (...args: Args): Promise<void> => {
    if (!initialized) {
      await init()
    }

    await fn(...args)
  }
}
```

Why this matters:

- A message may arrive before initialization finishes.
- A command may wake the worker after it was stopped.
- A tab event may need settings or database access.

---

## 7. Async Message Handling

Common beginner mistake: forgetting `return true`.

Wrong:

```ts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  fetchSomething().then((data) => sendResponse(data))
})
```

Right:

```ts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void fetchSomething()
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => sendResponse({ ok: false, error: String(error) }))

  return true
})
```

`return true` tells Chrome: keep the message channel open because I will respond asynchronously.

---

## 8. Command Handling

Keyboard commands are delivered to the service worker:

```ts
chrome.commands.onCommand.addListener((command) => {
  void requireInit(async () => {
    await commandHandler.handle(command)
  })()
})
```

In this project, `CommandHandler` decides what to do:

```text
capture-silent -> capture step silently
capture-note   -> capture step and select it for note editing
capture-tech   -> capture step and open technical data picker
capture-region -> inject region overlay, then capture crop
```

Keep this mapping in one place so hotkey behavior is easy to reason about.

---

## 9. UI Notifications

The background can notify the side panel after data changes:

```ts
const notifyUI = (type: RuntimeEventType, payload: unknown): void => {
  void chrome.runtime.sendMessage({ type, payload }).catch(() => {
    // Side panel may be closed.
  })
}
```

This is best-effort. If the side panel is closed, the data should still be saved. The next time the UI opens, it should read from storage.

---

## 10. Service Worker And Storage

The service worker should persist important data quickly.

Use IndexedDB for structured data:

```text
sessions
steps
screenshots
settings
```

Use `chrome.storage.local` for small extension state:

```text
activeSessionId
onboarding flags
first capture tip flags
```

Do not store large screenshots in `chrome.storage.local`. Use IndexedDB blobs.

---

## 11. Service Worker Startup Failures

If the service worker throws during startup, Chrome may show errors like service worker registration failed.

Common causes:

- Importing a file that uses `document`.
- Creating a `Worker` without checking support.
- Wrong import path.
- Syntax unsupported by the build output.
- Top-level code that assumes a tab or window exists.

Safer pattern:

```ts
void init().catch(() => {
  // Let future requests surface actionable errors.
})
```

Do not hide every error forever, but prevent optional startup work from killing registration.

---

## 12. Service Worker Rebuild Checklist

- Create `background/index.ts`.
- Instantiate repositories and services.
- Add idempotent `init()`.
- Register listeners at top level.
- Wrap async listeners with error handling.
- Return `true` from async `onMessage` listeners.
- Persist important state outside memory.
- Keep DOM code out of the service worker.
- Make notifications best-effort.
- Inspect service worker console after loading extension.

---

## 13. Small End-To-End Example

Manifest command:

```json
"commands": {
  "say-hello": {
    "suggested_key": { "default": "Ctrl+Shift+Y" },
    "description": "Say hello"
  }
}
```

Service worker:

```ts
chrome.commands.onCommand.addListener((command) => {
  if (command !== 'say-hello') {
    return
  }

  void chrome.runtime.sendMessage({
    type: 'HELLO_EVENT',
    payload: { message: 'Hello from the service worker' },
  }).catch(() => {
    // UI may be closed.
  })
})
```

UI:

```ts
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'HELLO_EVENT') {
    console.log(message.payload.message)
  }
})
```

This is the same basic event pattern used by capture events in the real project.

---

## 14. Manifest V3 Service Worker Lifecycle In Detail

The extension service worker lifecycle is the biggest adjustment for beginners coming from normal web apps or Manifest V2 background pages.

The browser controls the lifecycle:

```text
No relevant events -> worker is stopped
Event arrives -> worker starts
Listener runs -> async work completes
Idle period -> worker may be stopped again
```

You do not decide how long the worker lives. You design as if it can restart at any time between events.

### What Can Survive Restart

| Data | Survives service worker restart? | Use for |
| --- | --- | --- |
| Local variables | No | Temporary work only |
| Module-level singletons | No, recreated on restart | Service wiring, cached DB connection |
| IndexedDB | Yes | Sessions, steps, screenshots, settings |
| `chrome.storage.local` | Yes | Small extension state |
| Runtime event listeners | Re-registered on worker startup | Browser events |

If a value matters to the user, persist it.

---

## 15. Top-Level Listener Registration

Register listeners at the top level of the service worker module.

Good:

```ts
chrome.commands.onCommand.addListener(handleCommand)
chrome.runtime.onMessage.addListener(handleMessage)
```

Risky:

```ts
async function init() {
  await loadSettings()
  chrome.commands.onCommand.addListener(handleCommand)
}
```

Why risky: if initialization fails or is delayed, Chrome may not see listeners in time for events.

Practical compromise used in this project:

- Register listeners at top level.
- Inside each listener, call `requireInit` before doing real work.

---

## 16. State Management In A Service Worker

Service worker state should be divided into three categories.

### Durable State

Must be persisted:

```text
active session ID
sessions
steps
screenshots
settings
backup import results
```

### Reconstructable State

Can be rebuilt after restart:

```text
service instances
database connection promise
settings cache
active session object loaded from ID
```

### Ephemeral State

Can be lost without harming core data:

```text
in-memory network buffer
in-memory console buffer
temporary cooldown maps
current notification attempt
```

For this project, `TechDataBuffer` is ephemeral by design. It is for recent technical evidence, not permanent history until a user attaches it to a step.

---

## 17. Long-Running Work And Keepalive Reality

Service workers are not designed for endless work. Long operations may be interrupted if the browser decides the worker is idle or unhealthy.

Avoid:

```ts
while (true) {
  await syncForever()
}
```

Prefer event-triggered chunks:

```text
command event -> capture one step
message event -> export one backup
alarm event -> run one cleanup batch
```

If you need scheduled work, use `chrome.alarms` instead of `setInterval`.

Manifest permission:

```json
"permissions": ["alarms"]
```

Example:

```ts
chrome.alarms.create('cleanup', { periodInMinutes: 60 })

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'cleanup') {
    void runCleanup()
  }
})
```

This project does not need alarms for the core capture flow, but alarms are useful in extensions that need periodic maintenance.

---

## 18. Ports vs One-Off Messages

This project mostly uses one-off messages. Extensions can also use long-lived ports.

One-off message:

```ts
await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' })
```

Long-lived port:

```ts
const port = chrome.runtime.connect({ name: 'live-session' })
port.postMessage({ type: 'SUBSCRIBE' })
port.onMessage.addListener((message) => console.log(message))
```

Use one-off messages when:

- UI asks for data.
- A command returns a result.
- Events are occasional.

Use ports when:

- You need a stream of messages.
- DevTools panels need continuous communication.
- You want to know when a page disconnects.

Beginner warning: do not use ports just to keep a service worker alive. Design for restart instead.

---

## 19. Offscreen Documents

Some extension tasks need DOM APIs but should not appear as UI. Manifest V3 provides offscreen documents for certain use cases.

Examples where offscreen documents can help:

- Audio processing.
- Clipboard operations.
- DOM parsing.
- Canvas APIs if unavailable elsewhere.

Conceptual setup:

```ts
await chrome.offscreen.createDocument({
  url: 'offscreen.html',
  reasons: ['DOM_PARSER'],
  justification: 'Parse exported HTML into a document fragment',
})
```

This project currently uses `OffscreenCanvas` and worker fallback for images, not an offscreen document. But if future export rendering needs DOM in background, offscreen documents may be a better fit than trying to use `document` in the service worker.

---

## 20. Error Boundaries For Background Work

Every service worker operation should decide how failure is reported.

Examples:

| Operation | Failure behavior |
| --- | --- |
| UI request | Return `{ ok: false, error }` |
| Capture command | Notify `CAPTURE_ERROR` if UI is open |
| Screenshot save | Save metadata-only step if possible |
| Console tracking | Swallow failure because it is best-effort |
| Startup restore | Catch failure and let future requests surface errors |

Avoid one generic catch-all strategy for every operation. Some failures are user-visible; others are optional telemetry.

---

## 21. Service Worker Concurrency

Even though JavaScript is single-threaded, async operations can interleave.

Example problem:

```text
User presses capture twice quickly
Both captures read current step count as 3
Both create step number 4
Timeline now has duplicate step numbers
```

This is why the project uses a write queue around capture persistence.

Other concurrency tools:

- IndexedDB transactions.
- In-memory mutexes for short-lived operations.
- Unique IDs independent of ordering.
- Re-read state inside the transaction.

For highly sensitive ordering, calculate the next step number inside the same transaction that writes the step.

---

## 22. Service Worker Testing Strategy

Test service worker logic in layers:

1. Pure functions: URL parsing, filename sanitizing, crop math.
2. Service classes with mocked repositories.
3. Message router with fake payloads.
4. Manual browser tests for real Chrome APIs.

Chrome APIs are hard to unit test directly. Wrap them behind small services like `TabInfoService` and `CaptureService` so most business logic can be tested without the browser.

Manual smoke tests:

- Worker starts with no console errors.
- Message requests return responses.
- Hotkeys trigger command handler.
- Service worker restart restores active session.
- Capture still works with side panel closed.

---

## 23. Service Worker Design Rules

Use these rules when building any extension service worker:

- Store durable user data outside memory.
- Keep startup safe and fast.
- Register listeners at top level.
- Treat browser APIs as fallible.
- Keep DOM work out of the service worker.
- Split workflows into services.
- Use typed messages for UI communication.
- Make optional features best-effort.
- Design every flow to survive UI being closed.
- Design every flow to survive worker restart between events.
