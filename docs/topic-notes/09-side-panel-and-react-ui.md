# Side Panel And React UI From Scratch

The side panel is the extension's main user interface. In this project, it is a React app that lets testers start sessions, review timelines, edit steps, attach technical data, manage settings, view storage, and export reports.

---

## 1. What A Side Panel Is

A side panel is an extension page displayed beside the current browser tab.

It is useful when the user needs a persistent workspace. Unlike a popup, it does not disappear as soon as focus changes.

For a QA capture tool, this is a strong fit because testers can keep the timeline open while testing.

---

## 2. Manifest Setup

```json
"side_panel": {
  "default_path": "ui/index.html"
}
```

The side panel points to an extension page. In this project, Vite builds the React app into `ui/index.html`.

---

## 3. Open Panel On Action Click

In the service worker:

```ts
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(() => {
    // Side panel may be unavailable in some browsers.
  })
```

Always catch this because not every Chromium variant supports the API in the same way.

---

## 4. React Entry Point

The React app starts in `ui/main.tsx`.

Minimal shape:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
```

This project also wraps the app in a Radix `Theme`.

---

## 5. UI Responsibilities

The side panel owns:

- User forms.
- Session list display.
- Active timeline display.
- Step editor.
- Technical data picker dialog.
- Export buttons.
- Settings panel.
- Storage dashboard.
- Local UI banners and selection state.

It does not own:

- Screenshot capture.
- Hotkey listeners.
- Web request listeners.
- IndexedDB schema creation.
- Background service initialization.

The UI asks the background to do privileged work through runtime messages.

---

## 6. Bootstrap Flow

When the side panel opens, it should read the current state from the background.

```text
GET_SESSION_LIST
GET_ACTIVE_SESSION
GET_SETTINGS
```

React example:

```tsx
React.useEffect(() => {
  const bootstrap = async () => {
    const [sessionList, activeSession, settings] = await Promise.all([
      sendMessage('GET_SESSION_LIST', undefined),
      sendMessage('GET_ACTIVE_SESSION', undefined),
      sendMessage('GET_SETTINGS', undefined),
    ])

    setSessionData(sessionList.sessions, sessionList.activeSessionId)
    setBundle(activeSession.session, activeSession.steps)
    setSettings(settings.settings)
  }

  void bootstrap()
}, [setBundle, setSessionData, setSettings])
```

This makes the UI resilient when it missed events while closed.

---

## 7. Zustand Stores

This project uses small Zustand stores.

| Store | Purpose |
| --- | --- |
| `useActiveSessionStore` | Active session, steps, selected step |
| `useSessionListStore` | All sessions and active session ID |
| `useSettingsStore` | Loaded settings |
| `useDashboardStore` | Storage dashboard data |
| `useUiStore` | Current tab/view |

Example store:

```ts
const useActiveSessionStore = create<ActiveSessionState>((set) => ({
  session: null,
  steps: [],
  selectedStepId: null,
  setBundle: (session, steps) => set({ session, steps }),
  selectStep: (stepId) => set({ selectedStepId: stepId }),
}))
```

Keep stores focused. A giant store becomes hard to maintain.

---

## 8. Runtime Event Subscriptions

The side panel listens for background events.

```tsx
React.useEffect(() => {
  const offStepAdded = onRuntimeEvent('STEP_ADDED', (payload) => {
    addStep(payload.step)
  })

  const offStepUpdated = onRuntimeEvent('STEP_UPDATED', (payload) => {
    updateStep(payload.step)
  })

  return () => {
    offStepAdded()
    offStepUpdated()
  }
}, [addStep, updateStep])
```

Always unsubscribe on cleanup to avoid duplicate handlers.

---

## 9. Timeline UI

The timeline should show steps ordered by `stepNumber`.

Responsibilities:

- Empty state when there are no steps.
- Step card list.
- Selected step highlight.
- Drag/drop reorder.
- Thumbnail display.
- Status badge.
- Domain and note preview.

The timeline should not fetch every full screenshot if it only needs thumbnails. Load screenshot data only where needed.

---

## 10. Step Editor UI

The step editor owns user editing for one selected step.

Responsibilities:

- Load full screenshot for the selected step.
- Edit status.
- Edit note.
- Add annotation metadata.
- Delete step.
- Duplicate step.
- Save changes through `UPDATE_STEP`.

Example save:

```ts
await sendMessage('UPDATE_STEP', {
  stepId: step.id,
  updates: {
    note,
    status,
    annotations,
  },
})
```

---

## 11. Technical Data Picker

When the background sends `OPEN_TECH_POPUP`, the UI opens a dialog.

Flow:

```text
OPEN_TECH_POPUP event
UI stores stepId and tabId
Dialog calls GET_TECH_BUFFER
User selects network and console entries
Dialog calls ATTACH_TECH_DATA_TO_STEP
Background sends STEP_UPDATED
UI updates selected step
```

The picker should preselect likely useful entries such as failed network requests and console errors.

---

## 12. Export UI

Export buttons should lazy-load heavy exporter modules.

Example:

```ts
const { exportSessionToDocx } = await import('./docxExporter')
await exportSessionToDocx(session, steps, settings.export)
```

Why lazy-load:

- DOCX and PDF libraries can be large.
- The user does not need them until export time.
- Initial side panel load stays lighter.

---

## 13. UI Error Handling

Good UI behavior:

- Show a banner for recoverable errors.
- Keep the user in context.
- Avoid crashing the whole side panel for one failed screenshot load.
- Treat background capture errors as user-readable events.

Example event:

```ts
onRuntimeEvent('CAPTURE_ERROR', (payload) => {
  showBanner(payload.message)
})
```

---

## 14. Side Panel Checklist

- Declare `side_panel.default_path` in manifest.
- Configure `openPanelOnActionClick` when supported.
- Bootstrap from background on mount.
- Use runtime events for live updates.
- Keep storage as source of truth.
- Use small focused UI stores.
- Unsubscribe runtime listeners.
- Lazy-load heavy export modules.
- Show recoverable errors as banners.
- Keep privileged browser work in the background.

---

## 15. Side Panel vs Popup vs Options Page

| Surface | Lifetime | Best for | Weakness |
| --- | --- | --- | --- |
| Popup | Short, closes on blur | Quick actions | Bad for long workflows |
| Side panel | Persistent beside tab | Workspaces, timelines, assistants | Needs more layout care |
| Options page | User-opened settings | Configuration | Not ideal for daily workflow |
| Full tab page | Large workspace | Dashboards and reports | Pulls user away from target page |

QA session capture benefits from side panel because the tester can keep the target site visible while editing notes.

---

## 16. Extension UI Architecture

A good extension UI separates responsibilities:

```text
App shell
  -> bootstraps data
  -> subscribes to runtime events
  -> chooses current view

Feature components
  -> render workflows
  -> call message helpers
  -> own local form state

Stores
  -> hold shared UI state
  -> avoid deeply passing common data

Background
  -> owns privileged logic and persistence
```

Avoid putting all behavior into `App.tsx`. It is acceptable for `App.tsx` to wire global event handlers, but feature details should live in feature folders.

---

## 17. Data Loading Strategies

Common strategies:

| Strategy | Example | Good for |
| --- | --- | --- |
| Bootstrap load | Load sessions on mount | Initial app state |
| Event update | Add step after `STEP_ADDED` | Live background updates |
| Lazy load | Fetch screenshot only when visible | Large blobs |
| Dynamic import | Import exporter on click | Heavy libraries |
| Refresh after mutation | Reload session after update | Avoiding stale derived data |

This project uses all of these.

Beginner rule: do not fetch large screenshot data in the same request as the session list. Keep list data light.

---

## 18. React Effects With Extension APIs

React effects often call async extension APIs.

Pattern:

```tsx
React.useEffect(() => {
  let active = true

  const load = async () => {
    const response = await sendMessage('GET_SETTINGS', undefined)

    if (active) {
      setSettings(response.settings)
    }
  }

  void load().catch((error) => {
    if (active) {
      setError(String(error))
    }
  })

  return () => {
    active = false
  }
}, [setSettings])
```

Why the `active` flag matters:

- Component may unmount before request finishes.
- You avoid setting state on unmounted components.
- Switching selected steps quickly can trigger overlapping loads.

---

## 19. Screenshot Rendering Strategy

Screenshots are large. Render them carefully.

Recommended approach:

```text
Timeline card -> load thumbnail or small data URL only when needed
Step editor -> load full screenshot only for selected step
Exporter -> load screenshots sequentially during export
Dashboard -> count screenshots without loading image data URLs
```

If performance becomes an issue later:

- Store generated thumbnails separately.
- Use object URLs instead of data URLs for display.
- Revoke object URLs after use.
- Virtualize long timelines.
- Cache recently viewed screenshots in memory.

---

## 20. Drag And Drop Reordering

Step reordering must update both UI order and persisted `stepNumber` values.

UI flow:

```text
drag step
drop before/after another step
build ordered step ID list
send REORDER_STEPS
background validates list
repository rewrites stepNumber values
UI updates with returned steps
```

Validation should happen in background, not only UI:

- No duplicate IDs.
- Every ID belongs to the session.
- No missing steps.

Never trust drag/drop UI alone for data integrity.

---

## 21. Accessibility Basics For Extension UI

Extension UI should still follow normal web accessibility rules.

Checklist:

- Buttons should be real `<button>` elements or accessible component buttons.
- Icon buttons need `aria-label`.
- Dialogs should trap focus through a reliable dialog component.
- Form controls need labels or clear accessible names.
- Status messages should be readable, not only color-coded.
- Keyboard navigation should work.
- Text should not overflow fixed panels.

Radix UI helps with many primitives, but you still need good labels and layout.

---

## 22. Side Panel Layout Constraints

Side panels can be narrow. Design for constrained width.

Rules:

- Use flexible wrapping for action bars.
- Avoid huge horizontal tables.
- Keep long URLs wrapped or truncated.
- Make the main app content scroll, not the whole body when possible.
- Keep editor actions reachable.
- Test with narrow side panel widths.

For QA workflows, dense but readable UI is better than a marketing-style layout.

---

## 23. UI State Design Exercise

When adding a UI feature, answer:

1. Is the state local to one component?
2. Is the state shared across views?
3. Does the state need to persist after reload?
4. Does the background own this state?
5. Which runtime message loads or mutates it?
6. Which runtime event updates it live?
7. What happens if the side panel was closed during the change?
8. Does it include large data like screenshots?
9. Can two async loads overlap?
10. What is the empty state?
