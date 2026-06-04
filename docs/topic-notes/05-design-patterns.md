# Design Patterns In This Extension

Design patterns are repeatable ways to organize code. They are not magic. They help when they make responsibilities clear, reduce duplication, and keep future changes contained.

This project uses several practical patterns that are especially useful in browser extensions.

---

## 1. Composition Root

### What It Means

A composition root is the place where the application creates and wires its dependencies.

In this project:

```text
background/index.ts
```

creates repositories, services, handlers, and routers.

### Why It Helps

- You can see the system graph in one file.
- Business classes do not create their own hidden dependencies.
- Testing becomes easier because dependencies can be passed in.
- Startup order is clear.

### Example

```ts
const sessionRepo = new SessionRepo()
const screenshotRepo = new ScreenshotRepo()
const settingsRepo = new SettingsRepo()

const sessionManager = new SessionManager(sessionRepo)
const captureService = new CaptureService()
const tabInfoService = new TabInfoService()

const commandHandler = new CommandHandler(
  sessionManager,
  captureService,
  tabInfoService,
  screenshotRepo,
  settingsRepo
)
```

### Beginner Rule

If a file is mostly `new Something(...)` and listener registration, it is probably a composition root. Keep it thin.

---

## 2. Repository Pattern

### What It Means

A repository hides data storage details behind methods.

Instead of this everywhere:

```ts
const db = await getDb()
await db.put('sessions', session)
```

Use this:

```ts
await sessionRepo.create(session)
```

### Project Repositories

| Repository | Responsibility |
| --- | --- |
| `SessionRepo` | Sessions and steps |
| `ScreenshotRepo` | Screenshot blobs and screenshot payloads |
| `SettingsRepo` | Defaults and settings updates |
| `DashboardRepo` | Storage statistics |

### Why It Helps

- UI does not know database schema.
- Service layer does not repeat IndexedDB transaction code.
- Migrations have a clear home.
- Delete behavior can be made consistent.

---

## 3. Service Layer

### What It Means

A service contains business logic that is bigger than one storage operation.

Examples:

| Service | Responsibility |
| --- | --- |
| `SessionManager` | Active session lifecycle and step operations |
| `CaptureService` | Visible tab capture and image processing |
| `TabInfoService` | Active tab and browser metadata |
| `TechDataBuffer` | Network and console buffers |

### Example

Starting a session is not just `db.put`. It also needs:

- ID creation.
- Default name.
- Timestamps.
- Browser metadata.
- Status.
- Active session persistence.

That belongs in `SessionManager`.

---

## 4. Message Router Pattern

### What It Means

The message router converts runtime messages into method calls.

```text
UI sends START_SESSION -> MessageRouter -> SessionManager.startSession
```

### Why It Helps

- One API boundary between UI and background.
- All request types are handled consistently.
- Errors use the same response shape.
- UI does not call many background services directly.

### Example

```ts
switch (message.type) {
  case 'START_SESSION': {
    const session = await this.sessionManager.startSession(message.payload)
    this.notify('SESSION_STARTED', { session })
    return this.success({ session })
  }
  default:
    return this.error('Unknown message type')
}
```

---

## 5. Command Handler Pattern

### What It Means

A command handler maps user commands to workflows.

```text
chrome.commands.onCommand -> CommandHandler.handle(command)
```

### Why It Helps

Capture workflows have many steps:

- Read settings.
- Check quota.
- Ensure session.
- Read tab info.
- Capture screenshot.
- Create step.
- Save screenshot and step.
- Notify UI.

Putting all that in `background/index.ts` would make the service worker file hard to maintain.

---

## 6. Factory Pattern

### What It Means

A factory creates objects with a consistent shape.

This project uses `StepFactory`.

### Why It Helps

Different capture modes still need the same required step fields.

Without a factory, each mode may forget a field or use different defaults.

Example:

```ts
const step = stepFactory.create({
  sessionId,
  stepNumber,
  tabInfo,
  screenshotId,
  captureMode: 'silent',
})
```

The factory fills:

```text
id
timestamp
url
domain
pageTitle
browserInfo
windowSize
note
status
networkEntries
consoleEntries
annotations
```

---

## 7. Validator Pattern

### What It Means

A validator checks that an object is valid before saving.

This project uses `StepValidator`.

Example:

```ts
stepValidator.validate(step)
```

Checks:

- Step ID exists.
- Session ID exists.
- Step number is positive.
- URL exists.
- Domain exists.
- Timestamp exists.

### Why It Helps

It catches programmer errors near the source, before invalid data reaches IndexedDB.

---

## 8. Write Queue Pattern

### What It Means

A write queue serializes asynchronous write operations.

This project uses `WriteQueue` during capture.

### Why It Helps

Hotkeys can be pressed quickly. Capture writes touch screenshots, steps, and sessions. A queue keeps write order predictable.

Example shape:

```ts
await writeQueue.enqueue(async () => {
  await screenshotRepo.create(record)
  await sessionManager.appendStep(step)
})
```

### Beginner Rule

Use a queue when concurrent writes can affect ordering or shared counters.

---

## 9. Event-Driven UI Sync

### What It Means

The UI does not constantly poll storage. The background sends events after changes.

Example:

```ts
notifyUI('STEP_ADDED', { step })
```

The side panel listens:

```ts
onRuntimeEvent('STEP_ADDED', (payload) => {
  addStep(payload.step)
})
```

### Why It Helps

- Capture works even if UI is closed.
- UI updates quickly when open.
- Storage remains the source of truth.

---

## 10. Typed Contract Pattern

### What It Means

Define request and event maps in TypeScript.

```ts
interface RuntimeRequestMap {
  GET_SESSION_LIST: {
    payload: undefined
    response: { sessions: Session[]; activeSessionId: string | null }
  }
}
```

Then use a generic helper:

```ts
sendMessage('GET_SESSION_LIST', undefined)
```

TypeScript knows the payload and response shape.

### Why It Helps

- Fewer stringly typed mistakes.
- Safer UI/background communication.
- Easy to find all runtime commands.

---

## 11. Progressive Enhancement Pattern

### What It Means

Use the best capability when available, but keep a fallback.

Examples in this project:

| Feature | Best path | Fallback |
| --- | --- | --- |
| Image processing | Web Worker | Inline OffscreenCanvas |
| Screenshot capture | Screenshot blob saved | Metadata-only step saved |
| UI notification | Runtime event delivered | UI refresh reads storage later |
| Console bridge | Console entries captured | Capture still works without console data |

### Why It Helps

Browser extension environments vary. Progressive enhancement makes the product less fragile.

---

## 12. Pattern Selection Rule

Do not add patterns just to sound architectural. Add a pattern when it solves a real problem.

Good reasons:

- The same logic appears in many places.
- A file has too many responsibilities.
- Storage details leak into UI code.
- Message payloads are easy to mistype.
- Different capture modes create inconsistent objects.

Bad reasons:

- The app is tiny and direct code is clearer.
- The pattern adds indirection without reducing complexity.
- Nobody can tell where the actual behavior lives.

---

## 13. Dependency Injection

Dependency injection means a class receives its dependencies instead of creating them internally.

Less flexible:

```ts
class CommandHandler {
  private sessionManager = new SessionManager(new SessionRepo())
}
```

More flexible:

```ts
class CommandHandler {
  public constructor(private readonly sessionManager: SessionManager) {}
}
```

Why it matters:

- Tests can pass fake dependencies.
- The composition root controls object lifetime.
- Classes reveal what they need.
- You avoid hidden side effects.

This project uses constructor injection heavily in background services.

---

## 14. Boundary Pattern

A boundary is a line between two parts of the system where data must cross intentionally.

Important boundaries in an extension:

```text
UI -> runtime messages -> background
background -> repositories -> IndexedDB
background -> scripting API -> web page
background -> worker messages -> Web Worker
page main world -> postMessage -> isolated bridge
```

Boundaries are where you should:

- Validate data.
- Convert shapes.
- Catch errors.
- Avoid leaking internal details.
- Keep security rules clear.

Example: the UI does not receive raw `ScreenshotRecord` blobs directly from IndexedDB. It asks `GET_SCREENSHOT`, and the background returns a `ScreenshotImagePayload` with a data URL.

---

## 15. Adapter Pattern

An adapter converts one interface into another interface your app prefers.

Chrome APIs can be awkward because some are callback-based and some are promise-based.

Adapter example:

```ts
function getCommands(): Promise<chrome.commands.Command[]> {
  return new Promise((resolve) => {
    chrome.commands.getAll((commands) => resolve(commands))
  })
}
```

Another adapter example is `ScreenshotRepo.getImagePayloadById`, which converts an internal Blob record into a UI-friendly data URL payload.

Use adapters when:

- External API shape is inconvenient.
- You want to isolate browser-specific code.
- You need one stable internal interface.

---

## 16. Unit Of Work Pattern

A unit of work groups related writes into one consistent operation.

IndexedDB transactions are the main unit of work in this project.

Example operation:

```text
append step
update session stepCount
update session updatedAt
commit transaction
```

This should succeed or fail together. If the step is saved but the session count is not updated, data becomes inconsistent.

Use transactions as units of work whenever related data changes together.

---

## 17. CQRS-Lite Pattern

CQRS means Command Query Responsibility Segregation. A light version is useful here:

- Commands change data.
- Queries read data.

Examples:

| Type | Message |
| --- | --- |
| Query | `GET_SESSION_LIST` |
| Query | `GET_ACTIVE_SESSION` |
| Command | `START_SESSION` |
| Command | `UPDATE_STEP` |
| Command | `DELETE_SESSION` |

Why it helps:

- Read operations should not surprise users by mutating data.
- Write operations should send events after changes.
- Router behavior becomes easier to reason about.

Do not over-engineer this into separate buses unless the app grows much larger.

---

## 18. Observer Pattern

The observer pattern means one part of the system subscribes to changes from another part.

In this project:

```text
Background sends runtime event
React side panel listens
Zustand store updates
UI re-renders
```

This is observer-style behavior.

Example:

```ts
const offStepAdded = onRuntimeEvent('STEP_ADDED', ({ step }) => {
  addStep(step)
})
```

Important rule: unsubscribe observers when they are no longer needed.

---

## 19. Strategy Pattern

The strategy pattern lets you swap algorithms behind the same interface.

Possible project examples:

| Strategy area | Options |
| --- | --- |
| Image output | WebP strategy, PNG strategy |
| Export | DOCX strategy, PDF strategy, JSON strategy |
| Capture mode | Silent, note, tech, region |
| Storage cleanup | Delete selected, delete completed, clear all |

Current exporter code is already somewhat strategy-like because each export format has its own module.

More formal shape:

```ts
interface SessionExporter {
  export(session: Session, steps: Step[]): Promise<void>
}
```

Then implementations:

```text
DocxSessionExporter
PdfSessionExporter
JsonBackupExporter
```

Add this only if exporter complexity grows.

---

## 20. Anti-Patterns To Avoid

### God Service Worker

Putting every feature directly into `background/index.ts`.

Fix: move workflows into handlers, services, and repositories.

### UI-Driven Persistence

Letting React components directly write IndexedDB for core extension data.

Fix: route writes through background services.

### Stringly Typed Messages

Sprinkling raw strings and `any` payloads everywhere.

Fix: central request and event maps.

### Hidden Global State

Important state exists only in module variables.

Fix: persist durable state and restore it.

### Blob-In-Record Bloat

Embedding base64 screenshots inside step records.

Fix: separate screenshot blob store.

---

## 21. Pattern Decision Checklist

Before adding a new abstraction, ask:

1. What concrete duplication does it remove?
2. What behavior becomes easier to test?
3. What responsibility becomes clearer?
4. What future change becomes safer?
5. How many files must someone open to understand the flow?
6. Can a simpler function solve the same problem?
7. Does the pattern match existing code style?
8. Will a beginner still be able to trace the workflow?

The best pattern is the one that makes the next change easier without making today's code mysterious.
