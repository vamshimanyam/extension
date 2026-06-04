# Content Scripts And Script Injection From Scratch

Content scripts and injected scripts let an extension interact with web pages. This project does not use a permanent content script declared in the manifest. Instead, it injects scripts only when needed for region capture and console capture.

---

## 1. What A Content Script Is

A content script is JavaScript that runs in the context of a web page selected by the extension.

It can:

- Read and modify the page DOM.
- Add overlays.
- Listen to page events.
- Send messages back to the extension.

It should not:

- Store trusted extension state directly.
- Assume every page allows injection.
- Break page behavior.

---

## 2. Permanent Content Script vs On-Demand Injection

Permanent content script in manifest:

```json
"content_scripts": [
  {
    "matches": ["https://example.com/*"],
    "js": ["content.js"]
  }
]
```

On-demand injection:

```ts
await chrome.scripting.executeScript({
  target: { tabId },
  func: () => {
    console.log('Injected only when needed')
  },
})
```

This project uses on-demand injection because region capture and console bridging are only needed during specific flows.

---

## 3. Isolated World And Main World

Chrome extensions separate injected scripts into worlds.

| World | Meaning | Project usage |
| --- | --- | --- |
| Isolated world | Extension script sees DOM but has a separate JS global scope | Bridge page messages to extension APIs |
| Main world | Same JS world as the page's own scripts | Patch the page's real `console` methods |

Default injection uses the isolated world.

Main-world injection uses:

```ts
await chrome.scripting.executeScript({
  target: { tabId },
  world: 'MAIN',
  func: () => {
    // Runs in the page's JavaScript world.
  },
})
```

---

## 4. Region Capture Overlay

Region capture needs page DOM access to draw an overlay over the viewport.

Flow:

```text
User presses region shortcut
Background gets active tab ID
Background injects overlay script
User drags selection rectangle
Injected script resolves selected bounds
Background captures visible tab
Image processor crops to selected bounds
Overlay removes itself
```

Basic overlay injection:

```ts
const [result] = await chrome.scripting.executeScript({
  target: { tabId },
  func: () => {
    return new Promise((resolve) => {
      const host = document.createElement('div')
      host.id = '__my_region_overlay__'
      Object.assign(host.style, {
        position: 'fixed',
        inset: '0',
        zIndex: '2147483647',
        cursor: 'crosshair',
      })

      document.documentElement.appendChild(host)

      host.addEventListener('click', (event) => {
        const payload = {
          x: event.clientX,
          y: event.clientY,
          width: 100,
          height: 100,
          devicePixelRatio: window.devicePixelRatio || 1,
        }

        host.remove()
        resolve({ cancelled: false, region: payload })
      })
    })
  },
})
```

The real project implementation is more complete: drag handling, dim layers, controls, Escape, Enter, retry, cancel, and cleanup.

---

## 5. Shadow Root For Overlay Isolation

Pages can have aggressive CSS. A shadow root helps isolate overlay UI styles.

```ts
const host = document.createElement('div')
const shadowRoot = host.attachShadow({ mode: 'closed' })
const overlay = document.createElement('div')
shadowRoot.appendChild(overlay)
document.documentElement.appendChild(host)
```

Why this helps:

- Page CSS is less likely to affect the overlay.
- Overlay CSS is less likely to affect the page.
- The overlay is easier to remove as one host element.

Still use inline styles for critical overlay layout because injected CSS files can add build and isolation complexity.

---

## 6. Cleanup Rules

Injected UI must clean up after itself.

Always remove:

- DOM nodes.
- Event listeners.
- Temporary flags when appropriate.

Example cleanup:

```ts
const cleanup = () => {
  window.removeEventListener('keydown', onKeyDown, true)
  overlay.removeEventListener('mousedown', onMouseDown)
  overlay.removeEventListener('mousemove', onMouseMove)
  overlay.removeEventListener('mouseup', onMouseUp)
  host.remove()
}
```

If cleanup is missing, the page can be left with stuck overlays or blocked clicks.

---

## 7. Console Capture Bridge

Capturing page console calls is different from adding a DOM overlay.

The page's real `console` exists in the main world. Extension isolated scripts cannot simply replace it for page code.

This project uses two injected scripts:

1. Isolated-world bridge that listens for `window.postMessage` and calls `chrome.runtime.sendMessage`.
2. Main-world patch that wraps `console.log`, `console.warn`, `console.error`, `console.info`, and `console.debug`.

Flow:

```text
Page code calls console.error
Main-world patch captures arguments
Patch posts message to window
Isolated-world bridge receives message
Bridge sends runtime message to background
Background stores console entry in TechDataBuffer
```

---

## 8. Main-World Console Patch Example

```ts
await chrome.scripting.executeScript({
  target: { tabId },
  world: 'MAIN',
  func: () => {
    const patchFlag = '__consolePatchInstalled__'
    const globalWindow = window as unknown as Record<string, unknown>

    if (globalWindow[patchFlag]) {
      return
    }

    globalWindow[patchFlag] = true

    const original = console.error.bind(console)

    console.error = (...args: unknown[]) => {
      window.postMessage(
        {
          source: 'qa-console-capture',
          payload: {
            level: 'error',
            message: args.map(String).join(' '),
            timestamp: new Date().toISOString(),
          },
        },
        '*'
      )

      original(...args)
    }
  },
})
```

Important: call the original console method so the page continues working normally.

---

## 9. Isolated Bridge Example

```ts
await chrome.scripting.executeScript({
  target: { tabId },
  func: () => {
    window.addEventListener('message', (event) => {
      const data = event.data

      if (event.source !== window || data?.source !== 'qa-console-capture') {
        return
      }

      void chrome.runtime.sendMessage({
        type: 'TRACK_CONSOLE_ENTRY',
        payload: data.payload,
      })
    })
  },
})
```

Validate the message source and shape. Never trust arbitrary page messages blindly.

---

## 10. Injection Limitations

Script injection can fail on:

- Chrome internal pages.
- Extension pages from other extensions.
- Some browser-managed pages.
- Pages where permissions do not match.
- Tabs that close during injection.

Handle failures gracefully:

```ts
try {
  await chrome.scripting.executeScript({ target: { tabId }, func })
} catch {
  notifyUI('CAPTURE_ERROR', {
    code: 'SCRIPT_INJECTION_FAILED',
    message: 'This page does not allow extension script injection.',
  })
}
```

---

## 11. Script Injection Checklist

- Add `scripting` permission.
- Add host permissions for target sites.
- Use on-demand injection when the feature is occasional.
- Use a shadow root for page overlays.
- Use high z-index for capture overlays.
- Clean up DOM and event listeners.
- Use main world only when page JS must be patched.
- Use isolated world to bridge to extension APIs.
- Validate page messages before forwarding.
- Catch injection failures and continue gracefully.

---

## 12. Content Script Architecture Options

There are three common ways to interact with pages.

### Option 1: Static Manifest Content Script

Runs automatically on matching pages.

```json
"content_scripts": [
  {
    "matches": ["https://*.example.com/*"],
    "js": ["content.js"],
    "run_at": "document_idle"
  }
]
```

Best for:

- Always-on page features.
- Page annotations.
- DOM observers.
- Early instrumentation.

### Option 2: Dynamic Registered Content Script

Register scripts at runtime.

```ts
await chrome.scripting.registerContentScripts([
  {
    id: 'qa-page-listener',
    matches: ['https://*.example.com/*'],
    js: ['content/listener.js'],
    runAt: 'document_idle',
  },
])
```

Best for:

- User-configurable domains.
- Scripts that should persist after registration.
- Extensions with domain allowlists.

### Option 3: One-Time Script Injection

```ts
await chrome.scripting.executeScript({
  target: { tabId },
  func: injectedFunction,
})
```

Best for:

- User-triggered actions.
- Region selection.
- One-time DOM reads.
- Temporary overlays.

This project mainly uses option 3.

---

## 13. Isolated World Limitations

Isolated scripts can access the DOM, but they do not share JavaScript variables with the page.

Page:

```html
<script>
  window.appState = { userId: 123 }
</script>
```

Isolated content script:

```ts
console.log(window.appState) // Often unavailable or not the same object
```

This isolation is a security feature. It prevents page scripts from directly tampering with extension variables and prevents extension scripts from accidentally colliding with page variables.

If you need to interact with page JavaScript, inject into the main world and communicate through `window.postMessage`.

---

## 14. DOM Observation

Content scripts often watch page changes with `MutationObserver`.

Example:

```ts
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    console.log(mutation.type)
  }
})

observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
})
```

Cleanup:

```ts
observer.disconnect()
```

Use cases:

- Detect app route changes in single-page apps.
- Watch for specific UI elements.
- Add helper UI when target elements appear.

Avoid expensive observers over huge pages without filtering. Mutation observers can become performance problems.

---

## 15. SPA Navigation Problems

Modern apps often change routes without full page reloads.

Content script implications:

- `document_idle` may run only once.
- URL can change via History API.
- DOM may be replaced after your script runs.

Common solutions:

- Use `chrome.tabs.onUpdated` in background for full navigations.
- Inject a History API patch in main world for SPA route changes.
- Use `MutationObserver` to detect UI changes.
- Ask the user to trigger capture manually rather than auto-detect everything.

For this QA extension, manual hotkeys are the primary flow, so SPA route complexity is lower.

---

## 16. CSS Isolation For Injected UI

Options for injected UI styling:

| Approach | Pros | Cons |
| --- | --- | --- |
| Inline styles | Self-contained, no extra files | Verbose |
| Shadow DOM | Strong isolation | More code |
| CSS file injection | Cleaner styles | Can be affected by load timing/build paths |
| Iframe overlay | Strongest isolation | More complex sizing and messaging |

For region capture, inline styles plus shadow DOM is a practical combination.

Advanced iframe approach:

```ts
const iframe = document.createElement('iframe')
iframe.src = chrome.runtime.getURL('overlay/index.html')
document.documentElement.appendChild(iframe)
```

This requires `web_accessible_resources` and message passing. It is useful for large injected UIs, but too heavy for a simple selection overlay.

---

## 17. Handling Cross-Origin Frames

Pages may contain iframes. Script injection can target frames too.

Inject into all frames:

```ts
await chrome.scripting.executeScript({
  target: { tabId, allFrames: true },
  files: ['content/frame-listener.js'],
})
```

Inject into specific frame IDs:

```ts
await chrome.scripting.executeScript({
  target: { tabId, frameIds: [frameId] },
  func: () => console.log('Specific frame'),
})
```

This project's region overlay targets the top-level viewport, so injecting into all frames is not needed.

Frame complexity matters for extensions that inspect page content deeply.

---

## 18. Script Injection Security Rules

- Never inject user-provided strings as executable code.
- Prefer `func` or bundled `files` over string evaluation.
- Validate messages from page to extension.
- Avoid exposing secrets to page context.
- Keep main-world code minimal.
- Preserve original page behavior.

Bad pattern:

```ts
await chrome.scripting.executeScript({
  target: { tabId },
  func: (code) => eval(code),
  args: [userProvidedCode],
})
```

Good pattern:

```ts
await chrome.scripting.executeScript({
  target: { tabId },
  func: (label) => {
    const element = document.createElement('div')
    element.textContent = label
    document.body.appendChild(element)
  },
  args: [safeLabel],
})
```

Use data, not code, as arguments.

---

## 19. Page Injection Design Exercise

Before injecting code into a page, answer:

1. Does this need to run on every page or only after user action?
2. Does it need DOM access, page JS access, or both?
3. Should it run in isolated world or main world?
4. What permissions and host patterns are required?
5. How will it clean up?
6. What happens on restricted pages?
7. Can it affect page performance?
8. Can page CSS break it?
9. Can page messages spoof it?
10. Is there a simpler browser API that avoids injection?
