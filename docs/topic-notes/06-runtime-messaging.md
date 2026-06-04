# Runtime Messaging From Scratch

Runtime messaging is how different extension contexts talk to each other. In this project, the React side panel talks to the background service worker through `chrome.runtime.sendMessage`, and the background sends events back to the UI.

---

## 1. Why Messaging Exists

The extension has multiple runtimes:

```text
Background service worker
Side panel React page
Injected page scripts
Web Worker
```

They do not share direct function calls. The side panel cannot directly call `SessionManager`. The injected page script cannot directly save to IndexedDB through the project's repositories. Messaging provides a boundary.

---

## 2. Simple One-Off Message

Sender:

```ts
const response = await chrome.runtime.sendMessage({
  type: 'PING',
  payload: { time: Date.now() },
})
```

Receiver:

```ts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PING') {
    sendResponse({ ok: true, data: { message: 'pong' } })
  }

  return true
})
```

---

## 3. Async Response Rule

If the receiver responds asynchronously, it must return `true`.

```ts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void doAsyncWork()
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => sendResponse({ ok: false, error: String(error) }))

  return true
})
```

If you forget `return true`, the sender may get no response because Chrome closes the message channel.

---

## 4. Request/Response Messaging

Use request/response messages when UI asks the background for something.

Examples:

```text
GET_SESSION_LIST
GET_ACTIVE_SESSION
GET_SESSION_DETAIL
GET_SCREENSHOT
GET_SETTINGS
UPDATE_STEP
DELETE_SESSION
```

Request messages should have:

```ts
{
  type: 'GET_SESSION_LIST',
  payload: undefined,
}
```

Responses should have one consistent shape:

```ts
{ ok: true, data: ... }
{ ok: false, error: 'Something went wrong' }
```

---

## 5. Event Messaging

Use event messages when the background tells the UI something happened.

Examples:

```text
SESSION_STARTED
SESSION_ENDED
SESSION_RESTORED
STEP_ADDED
STEP_UPDATED
STEP_DELETED
OPEN_NOTE_POPUP
OPEN_TECH_POPUP
CAPTURE_ERROR
STORAGE_WARNING
```

Event messages are best-effort:

```ts
void chrome.runtime.sendMessage({ type, payload }).catch(() => {
  // UI may be closed.
})
```

If the UI is closed, no problem. The data is already in IndexedDB. When the UI opens, it bootstraps from storage.

---

## 6. Typed Messaging Contract

This project uses `RuntimeRequestMap` and `RuntimeEventMap`.

Example:

```ts
export interface RuntimeRequestMap {
  GET_ACTIVE_SESSION: {
    payload: undefined
    response: { session: Session | null; steps: Step[] }
  }
  UPDATE_STEP: {
    payload: {
      stepId: string
      updates: Partial<Pick<Step, 'note' | 'status' | 'annotations'>>
    }
    response: { step: Step }
  }
}
```

Then define:

```ts
export type RuntimeRequestType = keyof RuntimeRequestMap
```

This makes message types discoverable and type-safe.

---

## 7. UI Messaging Helper

Instead of calling `chrome.runtime.sendMessage` directly in every component, use a helper.

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

Component usage:

```ts
const response = await sendMessage('GET_ACTIVE_SESSION', undefined)
setBundle(response.session, response.steps)
```

Benefits:

- Components stay simple.
- Error shape is centralized.
- Payload and response types are checked.

---

## 8. Event Listener Helper

```ts
export function onRuntimeEvent<T extends keyof RuntimeEventMap>(
  type: T,
  callback: (payload: RuntimeEventMap[T]) => void
): () => void {
  const listener = (message: RuntimeEventMessage) => {
    if (message.type !== type) {
      return
    }

    callback(message.payload as RuntimeEventMap[T])
  }

  chrome.runtime.onMessage.addListener(listener)
  return () => chrome.runtime.onMessage.removeListener(listener)
}
```

React usage:

```ts
React.useEffect(() => {
  const offStepAdded = onRuntimeEvent('STEP_ADDED', (payload) => {
    addStep(payload.step)
  })

  return () => {
    offStepAdded()
  }
}, [addStep])
```

Always unsubscribe event listeners in React effects.

---

## 9. Message Router In Background

The background should route messages in one place.

```ts
class MessageRouter {
  public async handle(message: RuntimeRequestMessage): Promise<RuntimeResponse<unknown>> {
    try {
      switch (message.type) {
        case 'GET_ACTIVE_SESSION': {
          const bundle = await this.sessionManager.getActiveSessionBundle()
          return this.success(bundle)
        }
        default:
          return this.error('Unknown message type')
      }
    } catch (error) {
      return this.error(error instanceof Error ? error.message : String(error))
    }
  }
}
```

The router is the background API boundary.

---

## 10. Injected Script Messaging

Injected scripts sometimes need to communicate from a page back to the extension.

For console capture, this project uses:

```text
main-world page script -> window.postMessage -> isolated extension script -> chrome.runtime.sendMessage -> background
```

Why this is needed:

- Main-world code can patch the page's real `console`.
- Main-world code cannot directly call extension APIs.
- Isolated-world code can bridge messages to the extension.

Bridge example:

```ts
window.addEventListener('message', (event) => {
  if (event.source !== window) {
    return
  }

  if (event.data?.source !== 'qa-console-capture') {
    return
  }

  void chrome.runtime.sendMessage({
    type: 'TRACK_CONSOLE_ENTRY',
    payload: event.data.payload,
  })
})
```

---

## 11. Messaging Checklist

- Define request and event types centrally.
- Use one helper for UI requests.
- Use one helper for UI event subscriptions.
- Return consistent success/error responses.
- Return `true` from async message listeners.
- Keep background routing in `MessageRouter`.
- Treat event delivery as best-effort.
- Use storage as source of truth, not messages.
- Unsubscribe React listeners on cleanup.
- Validate message shape before trusting payloads from page bridges.

---

## 12. Common Messaging Mistakes

| Mistake | Symptom | Fix |
| --- | --- | --- |
| Missing `return true` | Sender never receives async response | Return `true` from listener |
| No typed contract | Payload bugs at runtime | Use request/event maps |
| UI assumes event always arrives | Closed side panel misses changes | Bootstrap from storage on open |
| Many components call raw API | Duplicated error handling | Use `sendMessage` helper |
| Listener not removed in React | Duplicate events | Return cleanup function |
| Trusting page messages blindly | Security risk | Check source and message shape |

---

## 13. One-Off Messages vs Long-Lived Ports

One-off messages are request/response.

```ts
await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' })
```

Ports are long-lived connections.

```ts
const port = chrome.runtime.connect({ name: 'session-stream' })

port.onMessage.addListener((message) => {
  console.log(message)
})

port.postMessage({ type: 'SUBSCRIBE_TO_SESSION', sessionId })
```

Use one-off messages for:

- Load current data.
- Save a form.
- Fetch a screenshot.
- Start or end a session.

Use ports for:

- Continuous streams.
- DevTools panels.
- Multi-message conversations.
- Connection lifecycle tracking.

This project mostly uses one-off messages and runtime events because capture updates are occasional and storage is the source of truth.

---

## 14. Message Versioning

As an extension grows, message payloads change. Versioning helps avoid breaking older callers or imported data.

Simple versioned message:

```ts
type RuntimeRequestMessage = {
  version: 1
  type: RuntimeRequestType
  payload: unknown
}
```

When to add explicit message versions:

- Multiple extension pages may be loaded from different builds.
- You have external pages communicating with the extension.
- You support native messaging or third-party integrations.
- You need backward compatibility across long-lived ports.

For this project, central TypeScript contracts are enough for now because UI and background ship together.

---

## 15. Message Validation

TypeScript helps at compile time, but runtime messages are still untrusted values.

At minimum, validate the envelope:

```ts
function isRuntimeRequestMessage(message: unknown): message is RuntimeRequestMessage {
  if (!message || typeof message !== 'object') {
    return false
  }

  const candidate = message as { type?: unknown }
  return typeof candidate.type === 'string'
}
```

For higher-risk messages, validate payload fields too:

```ts
function isUpdateStepPayload(payload: unknown): payload is { stepId: string } {
  return Boolean(
    payload &&
      typeof payload === 'object' &&
      typeof (payload as { stepId?: unknown }).stepId === 'string'
  )
}
```

Use stronger validation for messages from pages, external extensions, or native hosts.

---

## 16. External Messaging

Extensions can allow messages from other extensions or web pages using external messaging APIs.

Example listener:

```ts
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (sender.id !== 'trusted-extension-id') {
    sendResponse({ ok: false, error: 'Unauthorized sender' })
    return true
  }

  sendResponse({ ok: true })
  return true
})
```

External messaging is not needed for this project right now. If added later, treat it as a public API:

- Authenticate sender.
- Validate payloads.
- Version messages.
- Document supported commands.
- Never expose sensitive local data casually.

---

## 17. Native Messaging

Native messaging lets an extension talk to an installed native application.

Use cases:

- Local desktop automation.
- File system workflows beyond downloads.
- Enterprise integrations.
- Connecting to test runner tools.

Conceptual extension code:

```ts
const port = chrome.runtime.connectNative('com.example.qa_tool')
port.postMessage({ type: 'EXPORT_SESSION', payload: backup })
```

Native messaging requires native host installation and manifest configuration outside the extension. It is powerful but much more complex than normal runtime messaging.

For this project, JSON export is simpler and more portable.

---

## 18. Message Flow Diagrams

### Start Session

```text
React StartSessionCard
  -> sendMessage('START_SESSION')
  -> background onMessage
  -> MessageRouter
  -> SessionManager.startSession
  -> SessionRepo.create
  -> notifyUI('SESSION_STARTED')
  -> React event listener
  -> Zustand stores update
```

### Hotkey Capture

```text
User hotkey
  -> chrome.commands.onCommand
  -> CommandHandler.captureStep
  -> repositories save data
  -> notifyUI('STEP_ADDED')
  -> React timeline updates if open
```

### Console Bridge

```text
Page console.error
  -> main-world patch
  -> window.postMessage
  -> isolated bridge
  -> chrome.runtime.sendMessage('TRACK_CONSOLE_ENTRY')
  -> background tech buffer
```

---

## 19. Message Naming Conventions

Good message names are action-oriented and specific.

Queries:

```text
GET_SESSION_LIST
GET_ACTIVE_SESSION
GET_SCREENSHOT
GET_SETTINGS
```

Commands:

```text
START_SESSION
UPDATE_STEP
DELETE_SESSION
IMPORT_SESSION_BACKUP
```

Events:

```text
SESSION_STARTED
STEP_ADDED
CAPTURE_ERROR
STORAGE_WARNING
```

Avoid vague names:

```text
DO_THING
SAVE
DATA
EVENT
```

Naming pattern rule:

- Queries start with `GET`.
- Commands use imperative verbs.
- Events use past tense or state-change names.
- Error events include the domain, such as `CAPTURE_ERROR`.

---

## 20. Messaging Design Exercise

When adding a new feature, define messages before writing UI.

Example feature: tag a step.

Questions:

1. Is this a command, query, or event?
2. What is the payload?
3. What is the response?
4. Which service owns the behavior?
5. Which repository writes data?
6. Which UI stores update after success?
7. Does the background need to notify other UI views?
8. What happens if the side panel is closed?
9. What errors should be user-visible?
10. Does the payload need runtime validation?

Possible contract:

```ts
TAG_STEP: {
  payload: { stepId: string; tag: string }
  response: { step: Step }
}

STEP_UPDATED: { step: Step }
```
