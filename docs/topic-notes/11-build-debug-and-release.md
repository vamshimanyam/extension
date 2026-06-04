# Build, Debug, And Release From Scratch

Building a browser extension is different from building a normal web app. You must build the extension bundle, load it into the browser, inspect service worker logs, test permissions, and verify extension-specific flows.

---

## 1. Development Scripts

This project uses these scripts:

```json
{
  "dev": "vite",
  "build": "tsc -b && vite build",
  "lint": "eslint .",
  "preview": "vite preview"
}
```

Most reliable local extension testing flow:

```bash
npm run build
```

Then load the generated `dist` folder as an unpacked extension.

---

## 2. Build Tooling

This project uses:

- Vite for bundling.
- React plugin for TSX and React transforms.
- CRX Vite plugin for extension manifest support.
- TypeScript project build for type checking.

Important config idea:

```ts
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

---

## 3. Loading The Extension Locally

Chrome:

```text
chrome://extensions
```

Edge:

```text
edge://extensions
```

Steps:

1. Run `npm run build`.
2. Open the extensions page.
3. Enable Developer Mode.
4. Click Load unpacked.
5. Select `dist`.
6. Pin or click the extension action.
7. Inspect the service worker if needed.

After code changes, rebuild and click Reload on the extension card.

---

## 4. Debugging The Service Worker

From `chrome://extensions`:

1. Find the extension.
2. Look for the service worker link.
3. Click Inspect.
4. Read console errors.

Common service worker errors:

| Error/Symptom | Likely cause |
| --- | --- |
| Service worker registration failed | Top-level exception during startup |
| `document is not defined` | DOM code imported into background |
| Message response missing | Async listener forgot `return true` |
| Hotkey does nothing | Command mismatch or shortcut conflict |
| Worker constructor fails | Web Worker not available in runtime |

---

## 5. Debugging The Side Panel

Right-click inside the side panel and inspect, or inspect the extension page from the browser's extension tools.

Check:

- React runtime errors.
- Failed runtime messages.
- Screenshot data loading failures.
- UI event listener duplication.
- CSS overflow and layout issues.

Side panel boot should call:

```text
GET_SESSION_LIST
GET_ACTIVE_SESSION
GET_SETTINGS
```

If the side panel looks empty, check those message responses first.

---

## 6. Debugging IndexedDB

Open DevTools for the extension page, then inspect Application storage.

Look for:

```text
IndexedDB
  qa-extension
    sessions
    steps
    screenshots
    settings
```

Verify:

- New captures create step records.
- Screenshot records contain blobs.
- Deleting a session removes related steps and screenshots.
- Settings are saved under the singleton key.

---

## 7. Debugging Keyboard Shortcuts

Open:

```text
chrome://extensions/shortcuts
```

Check:

- Shortcut is assigned.
- Shortcut is not conflicting with browser or OS behavior.
- Manifest command name matches code constants.
- Service worker logs command receipt.

Debug snippet:

```ts
chrome.commands.onCommand.addListener((command) => {
  console.log('Command received:', command)
})
```

---

## 8. Debugging Screenshot Capture

Capture can fail on restricted pages.

Test on a normal HTTPS page first.

Check:

- `activeTab` and `tabs` permissions exist.
- Active tab exists.
- `chrome.tabs.captureVisibleTab` is called from extension context.
- Storage quota is not critical.
- Image worker fallback is working.

Do not use `chrome://extensions` as the first capture test page.

---

## 9. Debugging Region Capture

Common issues:

- Injection fails on restricted pages.
- Overlay z-index is too low.
- Page CSS affects overlay.
- Event listeners are not cleaned up.
- Crop is offset because `devicePixelRatio` was ignored.

Test checklist:

- Drag selection works.
- Escape cancels.
- Retry clears current selection.
- Confirm returns bounds.
- Overlay disappears after every path.
- Cropped screenshot matches selected area.

---

## 10. Debugging Technical Data

Network data:

- Confirm `webRequest` permission.
- Confirm host permissions.
- Verify request is not filtered as an asset.
- Verify tab ID is not `-1`.

Console data:

- Confirm console bridge injection succeeded.
- Confirm main-world patch installed.
- Trigger console output after injection.
- Verify background receives `TRACK_CONSOLE_ENTRY`.

---

## 11. Build Validation Checklist

Run:

```bash
npm run lint
npm run build
```

Then test extension manually:

- Extension loads from `dist`.
- Service worker starts without errors.
- Side panel opens.
- Start session works.
- Silent capture works.
- Note capture selects new step.
- Tech capture opens picker.
- Region capture crops correctly.
- Settings persist.
- Exports download.
- Backup import restores screenshots.
- Delete session cleans storage.

---

## 12. Release Packaging

Typical release flow:

1. Update version in `manifest.json` and `package.json` if needed.
2. Run lint and build.
3. Load `dist` locally.
4. Run manual smoke test.
5. Zip the contents of `dist`, not the project root.
6. Upload to the extension store or distribute internally.

Zip structure should look like:

```text
manifest.json
assets/*
ui/index.html
service-worker-loader.js
```

Do not zip `node_modules` or source files unless your distribution process explicitly requires source.

---

## 13. Store Review Notes

Extension stores may review:

- Permission usage.
- Remote code usage.
- Privacy policy.
- Data collection claims.
- Host permissions.
- Screenshots and description.

For this project, be ready to explain:

- Why `<all_urls>` is needed for QA testing.
- What data is captured.
- That data is local-first.
- How users export and delete data.
- That remote code is not loaded by extension pages.

---

## 14. Debugging Checklist

- Rebuild after code changes.
- Reload the unpacked extension.
- Inspect service worker console.
- Inspect side panel console.
- Test on normal HTTPS pages first.
- Check `chrome://extensions/shortcuts` for hotkeys.
- Check IndexedDB records after capture.
- Treat restricted pages as expected failures.
- Keep service worker startup code safe.
- Verify fallback paths, not only happy paths.

---

## 15. Development Server vs Built Extension

Vite dev server is useful for normal web apps, but browser extensions often need built output for reliable testing.

Dev server advantages:

- Fast UI iteration.
- Hot module replacement for extension pages in some setups.
- Easier CSS/React debugging.

Built extension advantages:

- Matches packaged extension more closely.
- Service worker paths are final.
- Manifest output can be inspected.
- Store-like behavior is easier to test.

For beginner debugging, prefer:

```bash
npm run build
```

Then reload unpacked `dist`.

---

## 16. Inspecting Built Output

After build, inspect:

```text
dist/manifest.json
dist/ui/index.html
dist/assets/*
dist/service-worker-loader.js
```

Check:

- Manifest has expected permissions.
- Background service worker file exists.
- Side panel path exists.
- Worker chunks exist.
- No source-only paths remain broken.

Useful commands:

```bash
find dist -maxdepth 2 -type f | sort
cat dist/manifest.json
```

Do not edit files in `dist` manually. Fix source files and rebuild.

---

## 17. Source Maps

Source maps help debug bundled code.

Vite config option:

```ts
export default defineConfig({
  build: {
    sourcemap: true,
  },
})
```

Use source maps for local debugging. Decide carefully before shipping public source maps because they expose source structure.

For internal enterprise distribution, source maps may be acceptable. For public store release, many teams disable them or upload them only to private error tooling.

---

## 18. Extension Profiles For Testing

Use a separate browser profile for extension testing.

Benefits:

- Clean IndexedDB state.
- No shortcut conflicts from personal extensions.
- Easier permission reset.
- Safer testing with captured screenshots.

Testing profiles to consider:

```text
Clean profile
Profile with many tabs
Profile with large existing session data
Profile in Edge or Brave
```

Cross-browser testing matters because Chromium variants can differ around side panel and service worker behavior.

---

## 19. Logging Strategy

During development, logs help. In production, too many logs can expose data or slow workflows.

Useful development logs:

- Service worker initialization.
- Command received.
- Capture started/failed.
- Message router unknown message.
- Database migration version.

Avoid logging:

- Full screenshot data URLs.
- Full console messages containing secrets.
- Request bodies.
- Large backup payloads.

Simple debug flag pattern:

```ts
const DEBUG = false

function debugLog(...args: unknown[]): void {
  if (DEBUG) {
    console.log('[qa-extension]', ...args)
  }
}
```

---

## 20. Manual Test Matrix

Test across page types:

| Page type | Expected behavior |
| --- | --- |
| Normal HTTPS page | Full capture support |
| HTTP localhost | Capture for local testing |
| SPA route changes | Manual capture still works |
| Page with iframes | Visible tab capture works, injection may need care |
| `chrome://` page | Capture/injection may fail gracefully |
| PDF viewer | Some APIs may be limited |
| Very tall page | Visible viewport capture only |

Test across user workflows:

- Start session before capture.
- Capture before starting session.
- Capture with side panel closed.
- Capture rapidly multiple times.
- Delete step after capture.
- Export after many screenshots.
- Reload extension mid-session.

---

## 21. Automated Testing Roadmap

Start with pure logic tests:

```text
StepFactory
StepValidator
URL/domain parsing
filename sanitization
settings merge
crop math
backup validation
```

Then repository tests:

```text
create session
append step
delete session cascade
import backup
settings defaults
```

Then browser integration tests:

```text
load extension
open side panel
send runtime message
capture active tab
verify IndexedDB records
```

Browser extension E2E testing is harder than normal web testing, so get unit and integration coverage around pure logic first.

---

## 22. Performance Checks

Before release, test:

- Capture time for a normal page.
- Capture time for a large viewport.
- Timeline with 50+ steps.
- Export with 50+ screenshots.
- Storage dashboard with many sessions.
- Side panel initial load time.

Performance warning signs:

- Session list fetch loads screenshot data.
- Export blocks UI for too long.
- Large data URLs are logged.
- Timeline renders full screenshots for every step.
- IndexedDB queries read all stores unnecessarily.

---

## 23. Release Readiness Checklist

Code:

- `npm run lint` passes.
- `npm run build` passes.
- No service worker startup errors.
- No obvious console errors in side panel.

Product:

- Core capture flow works.
- Export outputs open correctly.
- Settings persist.
- Storage cleanup works.
- Permission purpose is documented.

Package:

- Version updated.
- `dist` contains expected files.
- Zip contains built files, not project root.
- Privacy notes are ready if publishing.

Support:

- Known limitations documented.
- Debug steps documented.
- User can reset data if needed.

---

## 24. Release Design Exercise

Before shipping, answer:

1. What is the smallest smoke test that proves the extension works?
2. What browser versions are supported?
3. What permissions will users see?
4. What data is stored locally?
5. How does a user delete captured data?
6. What happens if storage is full?
7. What happens if screenshot capture fails?
8. Can a user export before deleting?
9. How will you debug a service worker startup failure?
10. How will you reproduce a user bug report?
