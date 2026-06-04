# Testing Strategy From Scratch

Testing a browser extension requires more layers than testing a normal React app. You have pure functions, React UI, background service worker logic, Chrome APIs, IndexedDB, injected scripts, and actual browser behavior.

---

## 1. Testing Pyramid For Extensions

Recommended layers:

```text
Many pure unit tests
Some service/repository integration tests
Some UI component tests
Fewer full browser extension tests
Manual smoke tests for Chrome-specific behavior
```

Do not start with only end-to-end tests. Extension E2E tests are valuable but slower and more fragile.

---

## 2. Pure Unit Tests

Best first targets:

- ID-safe object creation.
- Step validation.
- Crop math.
- URL domain parsing.
- Filename sanitization.
- Settings merging.
- Backup shape validation.
- Network filtering rules.

Example crop test:

```ts
expect(getCropArea(1000, 800, {
  x: 100,
  y: 50,
  width: 200,
  height: 100,
  devicePixelRatio: 2,
})).toEqual({
  x: 200,
  y: 100,
  width: 400,
  height: 200,
})
```

Pure tests are fast and do not need Chrome.

---

## 3. Service Tests

Test service classes by passing fake dependencies.

Example fake repo:

```ts
class FakeSessionRepo {
  public sessions = new Map<string, Session>()

  public async create(session: Session): Promise<void> {
    this.sessions.set(session.id, session)
  }
}
```

Then test:

```ts
const manager = new SessionManager(fakeSessionRepo)
const session = await manager.startSession({ name: 'Smoke Test' })
expect(session.name).toBe('Smoke Test')
```

This works because the code uses dependency injection.

---

## 4. Repository Tests

Repository tests need IndexedDB. Options:

- Test manually in browser DevTools.
- Use an IndexedDB shim in Node tests.
- Run tests in a real browser.

Test cases:

- Create session.
- Append step.
- Update step.
- Delete step and renumber.
- Delete session cascade.
- Import backup.
- Settings defaults and updates.

Repository tests protect data integrity.

---

## 5. Messaging Tests

Message router tests can use fake services.

Example:

```ts
const response = await router.handle({
  type: 'GET_SESSION_LIST',
  payload: undefined,
})

expect(response.ok).toBe(true)
```

Test:

- Known message types.
- Unknown message type.
- Service throws error.
- Write message sends notification.
- Payload validation for risky messages.

---

## 6. React UI Tests

UI tests should focus on user behavior.

Examples:

- Start session form sends `START_SESSION`.
- Timeline renders empty state.
- Step editor saves note and status.
- Tech picker preselects failed requests and console errors.
- Settings controls call `UPDATE_SETTINGS`.

Mock `sendMessage` and runtime event helpers. Do not require real Chrome APIs for every UI test.

---

## 7. Browser Extension E2E Tests

End-to-end tests should run the built extension in a real browser.

E2E scenarios:

- Load extension.
- Open side panel.
- Start session.
- Capture visible tab.
- Verify IndexedDB records.
- Edit step.
- Export backup.
- Reload extension and restore active session.

Tools that can help:

- Playwright with persistent browser context.
- Chrome extension test runners.
- Manual scripted smoke tests.

E2E tests are harder but catch integration problems unit tests cannot.

---

## 8. Manual Smoke Test

Run before every release:

```text
Build extension
Load dist as unpacked
Open normal HTTPS page
Open side panel
Start session
Silent capture
Capture with note
Capture with tech
Region capture
Edit step note/status
Export DOCX
Export PDF
Export JSON backup
Delete session
Check service worker console
```

Keep this checklist short enough that you actually run it.

---

## 9. Failure Path Testing

Do not only test happy paths.

Important failure paths:

- Capture on restricted page.
- Screenshot storage failure.
- Side panel closed during capture.
- Service worker restart mid-session.
- Storage quota warning.
- Import invalid backup file.
- Delete session with screenshots.
- Console bridge injection failure.

Good products are defined by failure behavior as much as happy behavior.

---

## 10. Test Data Design

Create realistic test sessions:

```text
Session with zero steps
Session with one step and no screenshot
Session with 20 steps
Session with failed and warning statuses
Session with technical data
Session with annotations
Session with missing screenshot record
Imported backup with conflicting IDs
```

These cases reveal UI and storage assumptions.

---

## 11. Regression Testing

When fixing a bug, add a test or manual checklist item that would have caught it.

Examples:

| Bug | Regression test |
| --- | --- |
| Duplicate step numbers after rapid capture | Simulate two append operations |
| Worker unavailable breaks startup | Mock `Worker` as undefined |
| Settings lose new fields | Merge old settings with new defaults |
| Delete session leaves screenshots | Assert screenshots removed |
| Missing `return true` breaks messages | Async message handler test/manual check |

---

## 12. Testing Checklist

- Test pure logic first.
- Mock Chrome APIs for unit tests.
- Test repositories with IndexedDB support.
- Test message router separately from UI.
- Test UI behavior with mocked messaging.
- Run manual browser smoke tests.
- Include failure paths.
- Keep realistic test data.
- Add regression tests for fixed bugs.
- Verify service worker restart behavior.
