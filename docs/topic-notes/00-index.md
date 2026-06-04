# Browser Extension Topic Notes

These notes are standalone learning files for rebuilding and understanding a browser extension from scratch. They are separate from the existing rebuild guide and can be read one topic at a time.

Recommended order:

1. [Manifest File](01-manifest-file.md)
2. [Service Worker](02-service-worker.md)
3. [Web Worker](03-web-worker.md)
4. [Chrome APIs](04-chrome-apis.md)
5. [Design Patterns](05-design-patterns.md)
6. [Runtime Messaging](06-runtime-messaging.md)
7. [IndexedDB Storage](07-indexeddb-storage.md)
8. [Content Scripts And Script Injection](08-content-scripts-and-script-injection.md)
9. [Side Panel And React UI](09-side-panel-and-react-ui.md)
10. [Security, Permissions, And Privacy](10-security-permissions-and-privacy.md)
11. [Build, Debug, And Release](11-build-debug-and-release.md)
12. [Screenshot Capture And Image Processing](12-screenshot-capture-and-image-processing.md)
13. [Export, Backup, And Reporting](13-export-backup-and-reporting.md)
14. [Testing Strategy](14-testing-strategy.md)

How to use these notes:

- Read one file, then find the related source files in the project.
- Copy only the small examples when experimenting. The real project code has more error handling.
- Treat each checklist as a rebuild milestone.
- Keep service worker, UI, injected script, and worker responsibilities separate.
- Do not stop at the project-specific examples. Each note also explains broader browser-extension concepts you can reuse in future extensions.

Project source map:

```text
manifest.json                         Manifest V3 declaration
background/index.ts                   Service worker composition root
background/commandHandler.ts          Keyboard command workflows
background/messageRouter.ts           Runtime request router
background/capture/captureService.ts  Screenshot and image processing bridge
background/capture/techDataBuffer.ts  Network and console evidence buffer
background/storage/*                  IndexedDB repositories
messaging/*                           Runtime message contracts
types/*                               Shared data models
ui/*                                  React side panel application
worker/imageWorker.ts                 Image processing worker
```
