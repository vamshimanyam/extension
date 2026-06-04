# Manifest File From Scratch

The manifest file is the identity card and permission contract of a browser extension. Chrome reads `manifest.json` before it runs any of your code. If the manifest is wrong, the extension may not load at all.

In this project, the manifest declares a Manifest V3 extension with a side panel UI, a background service worker, keyboard commands, scripting permission, web request tracking, and local storage permission.

---

## 1. What The Manifest Does

The manifest answers these questions:

- What is the extension called?
- Which Manifest version does it use?
- Which file is the background service worker?
- Which page opens in the side panel?
- Which Chrome APIs may the extension use?
- Which websites may the extension access?
- Which keyboard shortcuts are registered?
- Which security policy applies to extension pages?

Think of it as a static configuration file that grants capabilities before runtime.

---

## 2. Minimal Manifest V3 Example

```json
{
  "manifest_version": 3,
  "name": "My First Extension",
  "version": "0.1.0",
  "description": "A small extension for learning Manifest V3.",
  "action": {
    "default_title": "Open Extension"
  },
  "background": {
    "service_worker": "background/index.js",
    "type": "module"
  },
  "permissions": ["storage"],
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'none'; base-uri 'none';"
  }
}
```

Important details:

- `manifest_version` must be `3` for Manifest V3.
- `name`, `version`, and `description` are required or strongly expected.
- `background.service_worker` points to the background entry file.
- `type: "module"` allows modern ES module imports in the service worker.
- `permissions` declares Chrome APIs the extension can use.

---

## 3. This Project's Manifest Concepts

This project uses these major manifest sections:

```json
{
  "manifest_version": 3,
  "name": "QA Session Documenter",
  "version": "0.1.0",
  "permissions": [
    "activeTab",
    "tabs",
    "commands",
    "scripting",
    "webRequest",
    "sidePanel",
    "storage"
  ],
  "host_permissions": ["<all_urls>"],
  "side_panel": {
    "default_path": "ui/index.html"
  },
  "background": {
    "service_worker": "background/index.ts",
    "type": "module"
  }
}
```

Because Vite and the CRX plugin are used, the manifest can reference TypeScript entry points during development. The build tool outputs browser-ready files into `dist`.

---

## 4. Permissions Explained

| Permission | What it unlocks | Project usage |
| --- | --- | --- |
| `activeTab` | Temporary access to active tab after user action | Capture current visible tab |
| `tabs` | Read tab metadata and query active tabs | URL, title, tab ID, window ID |
| `commands` | Keyboard shortcuts | Silent, note, tech, and region capture |
| `scripting` | Inject scripts into tabs | Region overlay and console bridge |
| `webRequest` | Observe network request metadata | Technical data buffer |
| `sidePanel` | Use Chrome side panel | React side panel app |
| `storage` | Use `chrome.storage` | Onboarding flags and active session ID |

Permissions should be as narrow as possible. This project needs broad host access because a QA tester may test many domains, but broad permissions should always be documented.

---

## 5. Host Permissions

API permissions and host permissions are different.

API permissions:

```json
"permissions": ["tabs", "scripting"]
```

Host permissions:

```json
"host_permissions": ["https://example.com/*"]
```

API permissions say what browser capability you want. Host permissions say which website URLs the capability may touch.

This project uses:

```json
"host_permissions": ["<all_urls>"]
```

That means HTTP and HTTPS pages across domains. It does not mean extension pages can run arbitrary remote code. Content Security Policy still restricts extension pages.

---

## 6. Side Panel Declaration

The side panel lets the extension show a persistent UI beside the current browser tab.

```json
"side_panel": {
  "default_path": "ui/index.html"
}
```

The path is an extension page. In this project, Vite builds the React app into that page.

To open the panel when the extension action is clicked, the service worker calls:

```ts
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
```

Common issue: some Chromium variants or older versions may not support `sidePanel`. Always catch failures.

---

## 7. Background Service Worker Declaration

```json
"background": {
  "service_worker": "background/index.ts",
  "type": "module"
}
```

The background service worker is not a page. It has no DOM. It wakes up for events like messages, commands, tab updates, and web requests.

Good service worker work:

- Listen for keyboard commands.
- Capture visible tabs.
- Read active tab info.
- Route messages from UI.
- Persist data.
- Track network metadata.

Bad service worker work:

- Render React components.
- Read or write DOM directly.
- Store important long-term state only in memory.

---

## 8. Commands And Shortcuts

Manifest commands define keyboard shortcut actions:

```json
"commands": {
  "capture-silent": {
    "suggested_key": {
      "default": "Ctrl+Shift+S",
      "mac": "Command+Shift+S"
    },
    "description": "Capture silently (no popup)"
  }
}
```

The service worker receives the command name:

```ts
chrome.commands.onCommand.addListener((command) => {
  console.log(command)
})
```

Important rule: the string in the manifest must match the string your code handles.

Example project constants:

```ts
export const COMMANDS = {
  captureSilent: 'capture-silent',
  captureNote: 'capture-note',
  captureTech: 'capture-tech',
  captureRegion: 'capture-region',
} as const
```

Users can override extension shortcuts at:

```text
chrome://extensions/shortcuts
```

---

## 9. Content Security Policy

This project uses:

```json
"content_security_policy": {
  "extension_pages": "script-src 'self'; object-src 'none'; base-uri 'none';"
}
```

Meaning:

- Scripts must come from the extension itself.
- Plugins/objects are blocked.
- The base URL cannot be changed by a page-level `<base>` tag.

Avoid remote scripts in extension pages. Extension stores often reject risky remote-code patterns.

---

## 10. Manifest Rebuild Checklist

Use this checklist when creating a manifest from scratch:

- Add `manifest_version: 3`.
- Add name, version, and description.
- Declare a background service worker.
- Use `type: "module"` if you use imports.
- Declare side panel path if building a side panel.
- Add only required API permissions.
- Add host permissions intentionally.
- Define keyboard commands with exact command names.
- Add a restrictive content security policy.
- Build and load `dist` as an unpacked extension.
- Inspect the extension page for manifest errors.

---

## 11. Common Manifest Mistakes

| Mistake | Symptom | Fix |
| --- | --- | --- |
| Wrong service worker path | Extension fails to load or background missing | Check built `dist` manifest output |
| Missing permission | API call fails at runtime | Add required permission and reload extension |
| Command name mismatch | Hotkey does nothing | Match manifest command names to code constants |
| Missing host permission | Script injection or webRequest does not work | Add specific host pattern or `<all_urls>` |
| Too broad permissions without reason | User trust and review issues | Document why broad access is required |
| Remote script in extension page | Store rejection or CSP error | Bundle scripts locally |

---

## 12. Manifest Anatomy In Depth

A production manifest is not just a list of permissions. It is a contract between four parties:

```text
Browser
Extension runtime
Extension store reviewer
User installing the extension
```

Every field should answer one of these questions:

| Question | Manifest fields |
| --- | --- |
| What is this extension? | `name`, `version`, `description`, `icons` |
| How does it run? | `background`, `action`, `side_panel`, `options_page`, `content_scripts` |
| What can it access? | `permissions`, `host_permissions`, `optional_permissions` |
| How can the user trigger it? | `action`, `commands`, context menus through permissions |
| What files can web pages see? | `web_accessible_resources` |
| What security rules apply? | `content_security_policy` |

Beginner mistake: treating the manifest as boilerplate. In extension development, the manifest is architecture.

---

## 13. Required vs Optional Permissions

Required permissions are granted when the extension is installed.

```json
"permissions": ["storage", "tabs"]
```

Optional permissions can be requested later, usually after the user takes an action.

```json
"optional_permissions": ["downloads"],
"optional_host_permissions": ["https://*.example.com/*"]
```

Runtime request example:

```ts
const granted = await chrome.permissions.request({
  permissions: ['downloads'],
  origins: ['https://*.example.com/*'],
})

if (!granted) {
  throw new Error('Permission was not granted')
}
```

When to use optional permissions:

- A feature is not core to the extension.
- Access is needed only for specific domains.
- You want a lower-friction install prompt.
- A user should make an explicit trust decision.

When required permissions are better:

- The core product cannot work without them.
- Asking later would interrupt every normal workflow.
- The permission is fundamental to the extension identity.

For this QA extension, `tabs`, `commands`, `scripting`, `webRequest`, and `sidePanel` are core. A future Jira or Slack integration might use optional permissions if it needs domain-specific access.

---

## 14. Host Pattern Syntax

Host permissions use match patterns.

Examples:

```json
"host_permissions": [
  "https://example.com/*",
  "https://*.example.com/*",
  "http://localhost/*",
  "http://localhost:3000/*",
  "<all_urls>"
]
```

What they mean:

| Pattern | Matches |
| --- | --- |
| `https://example.com/*` | Only HTTPS pages on exactly `example.com` |
| `https://*.example.com/*` | Subdomains such as `app.example.com` |
| `http://localhost/*` | Local HTTP pages on any localhost port in many Chrome APIs |
| `http://localhost:3000/*` | Localhost on port 3000 |
| `<all_urls>` | Broad access across supported URL schemes |

Common beginner confusion: `https://*.example.com/*` does not always mean the same as `https://example.com/*`. Include both when you need root domain and subdomains.

Safer QA-tool alternative to `<all_urls>` later:

```json
"optional_host_permissions": ["<all_urls>"]
```

Then request access only when the tester starts a capture session.

---

## 15. Action, Popup, Side Panel, Options Page

Extensions can expose UI in multiple ways.

| UI surface | Manifest field | Best for |
| --- | --- | --- |
| Toolbar action | `action` | Quick entry point, badge, click handler |
| Popup | `action.default_popup` | Small short-lived controls |
| Side panel | `side_panel.default_path` | Persistent workspace beside tab |
| Options page | `options_page` or `options_ui` | Extension configuration |
| Full extension page | Open with `chrome.tabs.create` | Dashboards, large views, onboarding |

Popup example:

```json
"action": {
  "default_title": "Open Capture Tool",
  "default_popup": "popup/index.html"
}
```

Options page example:

```json
"options_ui": {
  "page": "options/index.html",
  "open_in_tab": true
}
```

This project uses a side panel because QA documentation is not a tiny interaction. It needs a stable timeline and editor.

---

## 16. Content Scripts In Manifest

This project injects scripts on demand, but many extensions declare content scripts.

Example:

```json
"content_scripts": [
  {
    "matches": ["https://*.example.com/*"],
    "js": ["content/page-reader.js"],
    "css": ["content/overlay.css"],
    "run_at": "document_idle"
  }
]
```

`run_at` options:

| Value | Meaning |
| --- | --- |
| `document_start` | Before page DOM is fully built |
| `document_end` | After DOM is built but before subresources finish |
| `document_idle` | Browser chooses a time after page is mostly loaded |

Use manifest content scripts when:

- Your extension always needs to observe matching pages.
- You need early page instrumentation.
- You want stable content script lifecycle.

Use `chrome.scripting.executeScript` when:

- You need injection only after a user action.
- The feature is occasional.
- You want to minimize page impact.

---

## 17. Web Accessible Resources

By default, web pages cannot fetch arbitrary extension files. If a content script or page needs to load extension assets, declare them.

Example:

```json
"web_accessible_resources": [
  {
    "resources": ["assets/help-image.png", "content/injected-ui.css"],
    "matches": ["https://*.example.com/*"]
  }
]
```

Use cases:

- Images displayed inside injected overlays.
- CSS files loaded by injected UI.
- Script files used by an injected page adapter.

Security note: any file listed here can be requested by matching web pages. Do not expose private data, internal configuration, or secrets.

---

## 18. Versioning Rules

Chrome extension versions must be numeric dot-separated values.

Valid:

```json
"version": "1.2.3"
```

Invalid:

```json
"version": "1.2.3-beta"
```

If you want a human-friendly label, use `version_name`:

```json
"version": "1.2.3",
"version_name": "1.2.3 beta"
```

Practical release rule:

- Increment `version` for every packaged release.
- Keep `package.json` and `manifest.json` aligned if your project uses both.
- Do not rely on store upload tools to guess the version.

---

## 19. Cross-Browser Manifest Notes

Chrome, Edge, Brave, and other Chromium browsers are similar, but not identical.

Things to verify:

- `sidePanel` support.
- Shortcut behavior.
- WebRequest behavior.
- Extension store permission warnings.
- Manifest field support.

Firefox supports WebExtensions but has differences in Manifest V3 support and APIs. If you want Firefox later, plan a compatibility layer instead of directly calling `chrome.*` everywhere.

Example compatibility approach:

```ts
const extensionApi = globalThis.browser ?? globalThis.chrome
```

Then wrap API calls in your own small helpers.

---

## 20. Manifest Design Exercise

When designing a new extension, answer these before writing code:

1. What is the smallest UI surface that solves the problem?
2. Does the extension need background events?
3. Does it need to run code inside web pages?
4. Which Chrome APIs are truly required?
5. Which domains must it access?
6. Can any permission be optional?
7. What files should web pages be allowed to load?
8. What user action should trigger the main workflow?
9. What data could the extension capture accidentally?
10. What will the install permission warning look like?

If you cannot explain a manifest permission in one sentence, revisit the design.
