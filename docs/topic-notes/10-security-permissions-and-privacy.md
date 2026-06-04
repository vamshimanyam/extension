# Security, Permissions, And Privacy From Scratch

Browser extensions can access sensitive browser and page data. A QA session documentation extension can capture screenshots, URLs, console messages, and network metadata, so security and privacy need to be designed from the start.

---

## 1. Extension Security Mental Model

An extension has more power than a normal website, but only within the permissions granted by its manifest.

Security goals:

- Request only permissions that are needed.
- Keep user data local unless explicitly exported.
- Avoid remote executable code.
- Treat page content and page messages as untrusted.
- Keep privileged work in trusted extension contexts.
- Make failures safe and recoverable.

---

## 2. Sensitive Data In This Project

Captured QA data can include:

- Page URLs.
- Page titles.
- Screenshots.
- Tester notes.
- Browser and window metadata.
- Console messages.
- Network request paths.
- HTTP status codes.
- Exported reports and backups.

This data can contain secrets or customer information. The local-first design matters.

---

## 3. Local-First Privacy

This project stores data locally in the browser:

```text
IndexedDB -> sessions, steps, screenshots, settings
chrome.storage.local -> small extension flags and active session ID
```

No server is required for the core workflow.

If future sync or upload features are added, they should require explicit user action and clear UI.

---

## 4. Permission Review

| Permission | Security note |
| --- | --- |
| `activeTab` | Safer than permanent page access for active user actions |
| `tabs` | Can expose URLs and titles |
| `commands` | Low risk, but command names must match code |
| `scripting` | Powerful because it injects code into pages |
| `webRequest` | Can observe browsing request metadata |
| `sidePanel` | UI surface permission |
| `storage` | Stores extension state |
| `<all_urls>` | Broad host access, should be justified |

For a QA tool, `<all_urls>` can be reasonable because testers may work across many domains. Still, document why it exists.

---

## 5. Content Security Policy

Extension pages should not run remote scripts.

Recommended CSP:

```json
"content_security_policy": {
  "extension_pages": "script-src 'self'; object-src 'none'; base-uri 'none';"
}
```

Meaning:

- Only scripts bundled with the extension can run.
- Object/plugin content is blocked.
- The base URL cannot be changed.

Avoid patterns like:

```html
<script src="https://example.com/remote.js"></script>
```

Bundle dependencies locally.

---

## 6. Page Messages Are Untrusted

Any page can call `window.postMessage`. If an injected bridge listens to page messages, validate them.

Bad:

```ts
window.addEventListener('message', (event) => {
  void chrome.runtime.sendMessage(event.data)
})
```

Better:

```ts
window.addEventListener('message', (event) => {
  const data = event.data

  if (event.source !== window) {
    return
  }

  if (!data || data.source !== 'qa-console-capture' || !data.payload) {
    return
  }

  void chrome.runtime.sendMessage({
    type: 'TRACK_CONSOLE_ENTRY',
    payload: data.payload,
  })
})
```

Validate both source and shape.

---

## 7. Console Capture Safety

Console patching should be careful.

Rules:

- Do not install the patch multiple times.
- Preserve original console behavior.
- Limit message size.
- Catch serialization errors.
- Treat console capture as best-effort.

Example flag:

```ts
const patchFlag = '__qaConsolePatchInstalled__'
const globalWindow = window as unknown as Record<string, unknown>

if (globalWindow[patchFlag]) {
  return
}

globalWindow[patchFlag] = true
```

---

## 8. Network Capture Safety

This project captures request metadata, not full response bodies.

Metadata includes:

- Method.
- URL path.
- Status code.
- Duration.
- Content type.
- Size estimates.

Avoid collecting full response bodies unless there is a very strong product reason and clear user consent.

Filter noisy or sensitive assets where possible.

---

## 9. Screenshot Safety

Screenshots can contain private information. Good practices:

- Store screenshots locally.
- Let users delete sessions.
- Let users export backups before cleanup.
- Consider future redaction or blur tools for sensitive regions.
- Avoid automatic upload.

If capture fails, saving metadata without a screenshot is safer than retrying aggressively or breaking the flow.

---

## 10. Export Safety

Exports move data out of browser storage.

Export types:

- DOCX report.
- PDF report.
- JSON backup.
- Jira/Slack helper text.

Rules:

- Make export user-initiated.
- Name files clearly.
- Include settings that let users exclude screenshots or technical data.
- Treat JSON backups as sensitive because they can include screenshots as data URLs.

---

## 11. Storage Cleanup

Users need control over local data.

Good cleanup tools:

- Delete selected sessions.
- Delete completed sessions.
- Clear all captured session data.
- Export backups before deletion.
- Show storage usage.

Use confirmations for destructive actions.

---

## 12. Security Checklist

- Request only needed permissions.
- Document broad host permissions.
- Keep captured data local by default.
- Use strict extension page CSP.
- Never load remote scripts in extension pages.
- Validate page messages.
- Keep privileged work in background or extension pages.
- Preserve original page behavior when patching console.
- Bound console and network buffer sizes.
- Make exports user-initiated.
- Provide storage cleanup controls.

---

## 13. Common Security Mistakes

| Mistake | Risk | Fix |
| --- | --- | --- |
| Trusting any `postMessage` | Page can spoof extension messages | Validate source and shape |
| Remote scripts in extension UI | Store rejection and supply-chain risk | Bundle locally |
| Unbounded console capture | Memory growth and sensitive data sprawl | Trim buffers and limit message length |
| Automatic upload | Privacy issue | Require explicit user action |
| No delete tools | Users cannot control stored data | Add storage management UI |
| Broad permissions undocumented | User trust issue | Explain why permissions are needed |

---

## 14. Threat Modeling Basics

Threat modeling means asking what can go wrong before it happens.

For a QA capture extension, think about these actors:

| Actor | Possible risk |
| --- | --- |
| Normal user | Accidentally captures sensitive information |
| Malicious web page | Sends fake `postMessage` data |
| Compromised dependency | Runs unwanted code in extension page |
| Another extension | Tries to communicate through external APIs |
| Shared browser profile user | Reads local extension data |

Questions:

1. What data is sensitive?
2. Where is it stored?
3. Who can trigger capture?
4. Who can read exports?
5. Can a page influence extension messages?
6. Can data leave the machine automatically?

Threat modeling does not need to be formal to be useful.

---

## 15. Least Privilege In Practice

Least privilege means granting only the access needed for a feature.

Examples:

- Use `activeTab` when user-triggered tab access is enough.
- Use optional host permissions for domain-specific features.
- Avoid `downloads` permission if an anchor download works.
- Avoid persistent content scripts if on-demand injection works.
- Avoid full network body capture if metadata is enough.

This project's broadest permission is `<all_urls>`. The product reason is cross-domain QA testing. If the extension later supports project-level domain allowlists, that could reduce permission scope.

---

## 16. Data Classification

Classify captured data so product choices are clearer.

| Data | Sensitivity | Notes |
| --- | --- | --- |
| Session name | Medium | May include feature or client names |
| URL | High | Can include IDs or query tokens |
| Screenshot | High | Can contain personal or business data |
| Note | High | User may type sensitive details |
| Console message | Medium to high | Can include errors, tokens, payload snippets |
| Network path | Medium to high | Can include IDs or query strings |
| Browser version | Low | Useful metadata |

High-sensitivity data should be local by default, exportable by user action, and deletable.

---

## 17. Sanitization And Redaction

This project already has annotation metadata including `blur`, which can become a redaction feature.

Future redaction options:

- Blur selected screenshot area.
- Draw solid boxes over sensitive regions.
- Strip query strings from exported URLs.
- Exclude technical data from reports.
- Exclude screenshots from reports.

Example URL sanitization option:

```ts
function stripQueryString(url: string): string {
  try {
    const parsed = new URL(url)
    parsed.search = ''
    parsed.hash = ''
    return parsed.toString()
  } catch {
    return url
  }
}
```

Do not silently redact data unless the user understands it. Reports should make export settings clear.

---

## 18. Dependency Security

Extension pages are privileged, so dependencies matter.

Good practices:

- Keep dependencies minimal.
- Use lockfiles.
- Run dependency audits.
- Avoid packages that load remote code.
- Lazy-load heavy libraries only when needed.
- Review export libraries because they process user data.

Commands:

```bash
npm audit
npm outdated
```

Audit results still require judgment. Not every advisory affects extension runtime behavior, but you should understand what ships in `dist`.

---

## 19. External Integrations

This project has settings for Jira and Slack style workflows. Integrations can create privacy risk if they send captured data out of the browser.

Safer integration pattern:

```text
Build user-visible summary
Copy to clipboard or open prefilled URL
User reviews before submitting
```

Riskier pattern:

```text
Automatically upload screenshots and logs to external service
```

If automatic upload is ever added:

- Require explicit setup.
- Show destination clearly.
- Let users choose included data.
- Provide delete/revoke controls.
- Document data handling.

---

## 20. Incident Recovery And User Control

Users should be able to recover from accidental capture.

Controls to provide:

- Delete step.
- Undo recent delete when possible.
- Delete session.
- Delete completed sessions.
- Clear all captured data.
- Export backup before cleanup.

Destructive actions should use confirmation dialogs. Very destructive actions can use two confirmations, as this project does for clearing all data.

---

## 21. Security Design Exercise

For every new feature, answer:

1. What new data does it collect?
2. Is the data sensitive?
3. Does it leave the browser?
4. Which permission enables it?
5. Can the permission be optional?
6. Can a web page spoof input to it?
7. What happens on failure?
8. Can users delete the data?
9. Can users exclude it from export?
10. How would you explain it in a privacy policy?
