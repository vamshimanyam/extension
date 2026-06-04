# QA Session Documenter

QA Session Documenter is a Manifest V3 browser extension for capturing, organizing, and exporting manual QA test sessions. It lets a tester use keyboard shortcuts to capture browser screenshots, page context, notes, selected technical evidence, and report-ready session timelines.

The extension is local-first: sessions, steps, screenshots, settings, and backups are stored in the browser through IndexedDB and `chrome.storage.local`.

## What It Includes

- Manifest V3 background service worker for commands, capture, routing, and technical data buffers.
- React side panel UI for sessions, timeline, step editing, settings, storage dashboard, and exports.
- IndexedDB storage split across sessions, steps, screenshots, and settings.
- Screenshot capture with optional Web Worker image processing and inline fallback.
- Region capture through on-demand script injection.
- Optional network and console evidence attachment.
- DOCX, PDF, and JSON backup export flows.

## Documentation

Start here if you are new to browser extension development:

- [Browser extension rebuild guide](docs/browser-extension-rebuild-guide.md)

Additional product and engineering reference:

- [QA extension complete docs](QA-Extension-Complete-Docs.md)

## Development

Install dependencies:

```bash
npm install
```

Run the Vite development server:

```bash
npm run dev
```

Build the extension:

```bash
npm run build
```

Lint the project:

```bash
npm run lint
```

## Loading The Extension

For the most reliable local test flow:

1. Run `npm run build`.
2. Open `chrome://extensions` or `edge://extensions`.
3. Enable Developer Mode.
4. Choose Load unpacked.
5. Select the generated `dist` folder.

Then click the extension action to open the side panel, or use the configured keyboard shortcuts.

## Main Shortcuts

| Shortcut | Mode |
| --- | --- |
| `Ctrl+Shift+S` / `Command+Shift+S` | Silent capture |
| `Ctrl+Shift+N` / `Command+Shift+N` | Capture with note |
| `Ctrl+Shift+D` / `Command+Shift+D` | Capture with technical data |
| `Ctrl+Shift+R` / `Command+Shift+R` | Region capture |

Chrome and Edge let users override shortcuts at `chrome://extensions/shortcuts`.