# Chrome APIs From Scratch

Chrome extension APIs are the browser capabilities exposed through the `chrome.*` namespace. They let an extension do things a normal website cannot do, such as capture tabs, listen for keyboard commands, inject scripts, open a side panel, and observe network request metadata.

This project uses Chrome APIs mostly from the background service worker and sometimes from the side panel UI.

---

## 1. The `chrome.*` Mental Model

Normal web app API:

```ts
localStorage.setItem('theme', 'dark')
```

Extension API:

```ts
await chrome.storage.local.set({ theme: 'dark' })
```

Chrome APIs are permissioned. If the manifest does not grant the required permission, the API may fail or be unavailable.

---

## 2. API Availability By Runtime

| Runtime | Can use most Chrome APIs? | Notes |
| --- | --- | --- |
| Background service worker | Yes | Best place for privileged work |
| Side panel extension page | Yes | Good for UI actions and `chrome.runtime` calls |
| Injected isolated script | Limited | Can use some extension APIs when injected by extension |
| Main-world page script | No direct extension APIs | Must communicate through page messages |
| Web Worker | Usually no | Keep worker independent from Chrome APIs |

When in doubt, call Chrome APIs from the service worker or extension pages.

---

## 3. `chrome.runtime`

Used for extension lifecycle and messaging.

Common APIs:

```ts
chrome.runtime.onInstalled.addListener((details) => {})
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {})
await chrome.runtime.sendMessage({ type: 'GET_SESSION_LIST' })
```

This project uses `chrome.runtime` to:

- Initialize first-install flags.
- Let the side panel request data from the background.
- Notify the side panel when sessions or steps change.
- Receive console bridge messages.

Example request from UI:

```ts
const response = await chrome.runtime.sendMessage({
  type: 'GET_ACTIVE_SESSION',
  payload: undefined,
})
```

Example background response:

```ts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void handleMessage(message)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => sendResponse({ ok: false, error: String(error) }))

  return true
})
```

---

## 4. `chrome.commands`

Used for keyboard shortcuts declared in `manifest.json`.

Manifest:

```json
"commands": {
  "capture-silent": {
    "suggested_key": { "default": "Ctrl+Shift+S", "mac": "Command+Shift+S" },
    "description": "Capture silently"
  }
}
```

Service worker:

```ts
chrome.commands.onCommand.addListener((command) => {
  if (command === 'capture-silent') {
    void captureStep()
  }
})
```

This project maps commands through `CommandHandler` instead of putting capture code directly in the listener.

Side panel can read configured commands:

```ts
chrome.commands.getAll((commands) => {
  console.log(commands)
})
```

This is used by settings UI to show current shortcuts.

---

## 5. `chrome.tabs`

Used for tab metadata and tab actions.

Examples:

```ts
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
```

```ts
const dataUrl = await chrome.tabs.captureVisibleTab({ format: 'png' })
```

```ts
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {})
chrome.tabs.onRemoved.addListener((tabId) => {})
```

This project uses `chrome.tabs` to:

- Find the active tab.
- Read tab URL and title.
- Capture the visible tab screenshot.
- Detect navigation for technical buffer cleanup.
- Remove tab-specific buffers when tabs close.

Common issue: Chrome internal pages like `chrome://extensions` are not normal web pages. Capture and script injection may fail on them.

---

## 6. `chrome.windows`

Used for browser window metadata.

Example:

```ts
const windowInfo = await chrome.windows.get(tab.windowId)
```

This project stores window size on each step:

```ts
windowSize: {
  width: windowInfo.width ?? 0,
  height: windowInfo.height ?? 0,
}
```

This helps reports explain the testing context.

---

## 7. `chrome.scripting`

Used to inject code into a tab.

Example:

```ts
await chrome.scripting.executeScript({
  target: { tabId },
  func: () => {
    document.body.style.outline = '4px solid red'
  },
})
```

This project uses `chrome.scripting` for:

- Region capture overlay.
- Console bridge installation.

Two worlds matter:

| World | Meaning | Use case |
| --- | --- | --- |
| Isolated world | Extension script context, separated from page JS | Bridge messages to extension APIs |
| Main world | Page's own JavaScript context | Patch page `console.*` methods |

Main-world injection example:

```ts
await chrome.scripting.executeScript({
  target: { tabId },
  world: 'MAIN',
  func: () => {
    const original = console.error.bind(console)
    console.error = (...args) => {
      window.postMessage({ source: 'my-extension-console', args }, '*')
      original(...args)
    }
  },
})
```

---

## 8. `chrome.webRequest`

Used to observe network request metadata.

Listeners:

```ts
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {},
  { urls: ['<all_urls>'] },
  ['requestBody']
)

chrome.webRequest.onCompleted.addListener(
  (details) => {},
  { urls: ['<all_urls>'] },
  ['responseHeaders']
)

chrome.webRequest.onErrorOccurred.addListener(
  (details) => {},
  { urls: ['<all_urls>'] }
)
```

This project uses it to build a per-tab buffer of network entries. It stores metadata like method, path, status code, duration, content type, and size estimates.

It does not store full response bodies.

---

## 9. `chrome.sidePanel`

Used to configure the extension side panel.

Manifest:

```json
"side_panel": {
  "default_path": "ui/index.html"
}
```

Service worker:

```ts
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch(() => {
    // Side panel may be unavailable.
  })
```

Side panel is useful for tools that need persistent workspace UI, unlike a popup that closes easily.

---

## 10. `chrome.storage`

Used for small extension-owned key/value state.

Example:

```ts
await chrome.storage.local.set({ activeSessionId: session.id })
const storage = await chrome.storage.local.get('activeSessionId')
await chrome.storage.local.remove('activeSessionId')
```

This project uses `chrome.storage.local` for:

- Active session ID.
- Onboarding flags.
- First capture tip flag.

Do not store large screenshot data here. Use IndexedDB for blobs and larger structured records.

---

## 11. Chrome API Error Handling

Many Chrome API operations can fail because:

- The tab is closed.
- The page is restricted.
- Permission is missing.
- The side panel is closed.
- The service worker restarted.

Use defensive code:

```ts
try {
  const dataUrl = await chrome.tabs.captureVisibleTab({ format: 'png' })
  return dataUrl
} catch {
  return null
}
```

For best-effort notifications:

```ts
void chrome.runtime.sendMessage(message).catch(() => {
  // Receiver may not be open.
})
```

---

## 12. Chrome API Rebuild Checklist

- Add required permissions to manifest.
- Add host permissions for page/tab access.
- Call privileged APIs from service worker or extension pages.
- Treat page injection as unreliable on restricted URLs.
- Return `true` from async message listeners.
- Catch side panel notification failures.
- Keep large data out of `chrome.storage.local`.
- Use `chrome://extensions/shortcuts` for shortcut conflicts.

---

## 13. Callback APIs vs Promise APIs

Many modern Chrome APIs support promises in Manifest V3, but older examples online often use callbacks.

Callback style:

```ts
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  console.log(tabs[0])
})
```

Promise style:

```ts
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
```

Prefer promise style when available because it composes naturally with TypeScript and async workflows.

Some APIs still use callbacks or have browser differences. If an API does not return a promise, wrap it:

```ts
function getCommands(): Promise<chrome.commands.Command[]> {
  return new Promise((resolve) => {
    chrome.commands.getAll((commands) => resolve(commands))
  })
}
```

This project does that for `chrome.commands.getAll` in the settings hook.

---

## 14. `chrome.permissions`

Use `chrome.permissions` when some capabilities should be requested later.

Manifest:

```json
"optional_permissions": ["downloads"],
"optional_host_permissions": ["https://*.example.com/*"]
```

Runtime request:

```ts
const granted = await chrome.permissions.request({
  permissions: ['downloads'],
  origins: ['https://*.example.com/*'],
})
```

Check permission:

```ts
const hasPermission = await chrome.permissions.contains({
  permissions: ['downloads'],
})
```

Use optional permissions for:

- Rare export destinations.
- Specific integrations.
- Power-user features.
- Domain-specific automation.

Do not ask for optional permissions before the user understands why they are needed.

---

## 15. `chrome.action`

The action API controls the toolbar extension button.

Manifest:

```json
"action": {
  "default_title": "Open QA Session Documenter"
}
```

Useful methods:

```ts
await chrome.action.setBadgeText({ text: '3' })
await chrome.action.setBadgeBackgroundColor({ color: '#d97706' })
await chrome.action.setTitle({ title: '3 steps captured' })
```

Possible project enhancement:

- Show active session step count as badge text.
- Clear badge when session ends.
- Change badge color when capture fails.

Keep badges short. Browser toolbar space is tiny.

---

## 16. `chrome.contextMenus`

Context menus add right-click actions.

Manifest permission:

```json
"permissions": ["contextMenus"]
```

Create menu:

```ts
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'capture-selection-note',
    title: 'Capture QA note for this page',
    contexts: ['page', 'selection'],
  })
})
```

Handle click:

```ts
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'capture-selection-note') {
    void captureWithNote(tab, info.selectionText)
  }
})
```

This project does not currently need context menus, but they are useful for user-triggered page actions.

---

## 17. `chrome.downloads`

This project downloads files using DOM anchor clicks from the side panel. Another approach is `chrome.downloads`.

Manifest permission:

```json
"permissions": ["downloads"]
```

Example:

```ts
const url = URL.createObjectURL(blob)

await chrome.downloads.download({
  url,
  filename: 'qa-session-report.pdf',
  saveAs: true,
})
```

When to use `chrome.downloads`:

- You need download shelf/history integration.
- You want `saveAs` behavior.
- You need more control over filename conflict behavior.

When DOM anchor is enough:

- Export happens from a visible extension page.
- You want fewer permissions.
- The browser accepts normal download behavior.

---

## 18. `chrome.alarms`

Alarms are scheduled events for service workers.

Manifest permission:

```json
"permissions": ["alarms"]
```

Create alarm:

```ts
chrome.alarms.create('close-stale-sessions', {
  periodInMinutes: 30,
})
```

Handle alarm:

```ts
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'close-stale-sessions') {
    void sessionManager.recoverOrphanedSessions()
  }
})
```

Use alarms instead of `setInterval` in service workers. Service workers are not guaranteed to stay alive for intervals.

---

## 19. `chrome.notifications`

Notifications can show OS-level messages.

Manifest permission:

```json
"permissions": ["notifications"]
```

Example:

```ts
chrome.notifications.create({
  type: 'basic',
  iconUrl: 'icons/icon-128.png',
  title: 'Capture failed',
  message: 'Screenshot could not be saved. Metadata was captured.',
})
```

Use carefully. Too many notifications feel noisy. For this project, side panel banners are usually better, but OS notifications could help when the side panel is closed.

---

## 20. `chrome.declarativeNetRequest` vs `chrome.webRequest`

`webRequest` observes request metadata. `declarativeNetRequest` is for rule-based blocking/modifying without imperative request handlers.

| API | Best for |
| --- | --- |
| `webRequest` | Observing request metadata for QA evidence |
| `declarativeNetRequest` | Blocking, redirecting, or modifying requests by rules |

This project uses `webRequest` because it wants to record metadata, not block traffic.

Example declarative rule concept:

```json
{
  "id": 1,
  "priority": 1,
  "action": { "type": "block" },
  "condition": { "urlFilter": "tracker", "resourceTypes": ["script"] }
}
```

Do not use request-blocking APIs unless the product actually needs request blocking.

---

## 21. API Design Wrapper Pattern

Instead of calling Chrome APIs throughout the app, wrap related APIs in small services.

Examples from this project:

```text
TabInfoService -> chrome.tabs and chrome.windows
CaptureService -> chrome.tabs.captureVisibleTab and image processing
MessageRouter -> chrome.runtime request handling
Settings hook -> chrome.commands.getAll and runtime settings requests
```

Benefits:

- Easier testing.
- Easier browser compatibility changes.
- Easier error handling.
- UI code stays cleaner.

Example wrapper:

```ts
export class TabInfoService {
  public async getActiveTab(): Promise<chrome.tabs.Tab> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })

    if (!tab?.id || !tab.url) {
      throw new Error('No active tab is available')
    }

    return tab
  }
}
```

---

## 22. API Failure Design Exercise

For every Chrome API call, ask:

1. What permission enables this call?
2. Which runtime is allowed to call it?
3. Can the target tab close before it completes?
4. Does it fail on browser internal pages?
5. What should the user see if it fails?
6. Should the operation be retried?
7. Is failure fatal or best-effort?
8. Does the result need to be persisted?
9. Can the side panel be closed?
10. Can the service worker restart before the next step?

Answering those questions makes extension behavior much more reliable.
