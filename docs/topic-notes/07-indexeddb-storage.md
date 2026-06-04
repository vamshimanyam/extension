# IndexedDB Storage From Scratch

IndexedDB is the browser's built-in database for structured data and large objects like blobs. This project uses IndexedDB as the source of truth for sessions, steps, screenshots, and settings.

---

## 1. Why Not `localStorage` Or `chrome.storage.local`

`localStorage` is simple but not right for this project:

- It is string-only.
- It is synchronous.
- It is not good for blobs.
- It is not ideal for larger structured datasets.

`chrome.storage.local` is useful for small extension state, but not large screenshots.

IndexedDB is better for:

- Structured records.
- Indexes.
- Transactions.
- Blob storage.
- Larger local-first data.

---

## 2. Project Stores

This project uses one database:

```text
qa-extension
```

Object stores:

| Store | Key | Purpose |
| --- | --- | --- |
| `sessions` | `id` | Session metadata |
| `steps` | `id` | Ordered session steps |
| `screenshots` | `id` | Screenshot blobs |
| `settings` | `key` | Singleton settings record |

Indexes:

| Store | Index | Purpose |
| --- | --- | --- |
| `sessions` | `by-status` | Find active/completed/archived sessions |
| `sessions` | `by-createdAt` | Date-based listing |
| `steps` | `by-sessionId` | Load all steps for a session |
| `steps` | `by-sessionId-stepNumber` | Ordered step lookups |
| `screenshots` | `by-stepId` | Find screenshot for a step |
| `screenshots` | `by-sessionId` | Delete all screenshots for a session |

---

## 3. Using The `idb` Package

The `idb` package wraps IndexedDB with promises and TypeScript-friendly APIs.

Schema example:

```ts
import type { DBSchema } from 'idb'

interface QADatabase extends DBSchema {
  sessions: {
    key: string
    value: Session
    indexes: {
      'by-status': string
      'by-createdAt': string
    }
  }
}
```

Open database:

```ts
const db = await openDB<QADatabase>('qa-extension', 1, {
  upgrade(db, oldVersion) {
    if (oldVersion < 1) {
      const sessionStore = db.createObjectStore('sessions', { keyPath: 'id' })
      sessionStore.createIndex('by-status', 'status')
      sessionStore.createIndex('by-createdAt', 'createdAt')
    }
  },
})
```

---

## 4. Database Singleton

Do not open a new database connection everywhere. Cache the promise.

```ts
let dbPromise: Promise<IDBPDatabase<QADatabase>> | null = null

export function getDb(): Promise<IDBPDatabase<QADatabase>> {
  if (dbPromise) {
    return dbPromise
  }

  dbPromise = openDB<QADatabase>(DB_NAME, DB_VERSION, { upgrade })
  return dbPromise
}
```

This keeps access consistent and avoids repeated setup code.

---

## 5. Why Screenshots Are Separate Records

Wrong shape:

```ts
interface Step {
  id: string
  screenshotDataUrl: string
}
```

Better shape:

```ts
interface Step {
  id: string
  screenshotId: string | null
}

interface ScreenshotRecord {
  id: string
  stepId: string
  sessionId: string
  blob: Blob
  width: number
  height: number
  sizeBytes: number
}
```

Benefits:

- Session and timeline queries stay fast.
- The app loads image data only when needed.
- Blob data stays in a store designed for it.
- Deleting session screenshots is easy through `by-sessionId`.

---

## 6. Repository Pattern For Storage

Keep database details in repository files.

Example:

```ts
export class SessionRepo {
  public async create(session: Session): Promise<void> {
    const db = await getDb()
    await db.put('sessions', session)
  }
}
```

Then service code uses:

```ts
await sessionRepo.create(session)
```

Do not scatter object store names across UI components.

---

## 7. Transactions

Use a transaction when one operation touches multiple records or stores.

Appending a step touches:

- `steps` store.
- Parent `sessions` record.

Example:

```ts
const tx = db.transaction(['sessions', 'steps'], 'readwrite')
const session = await tx.objectStore('sessions').get(step.sessionId)

if (!session) {
  throw new Error(`Session not found: ${step.sessionId}`)
}

await tx.objectStore('steps').put(step)
session.stepCount += 1
session.updatedAt = new Date().toISOString()
await tx.objectStore('sessions').put(session)
await tx.done
```

Transactions keep related changes consistent.

---

## 8. Step Ordering

Steps are ordered by `stepNumber`.

When reading steps:

```ts
const steps = await db.getAllFromIndex('steps', 'by-sessionId', sessionId)
return steps.sort((a, b) => a.stepNumber - b.stepNumber)
```

When deleting a step, renumber later steps so the timeline stays continuous.

When reordering, validate:

- No duplicate step IDs.
- Every step ID belongs to the session.
- The provided list includes every step exactly once.

---

## 9. Settings Singleton

Settings use one fixed key:

```text
singleton
```

Settings record shape:

```ts
interface SettingsRecord extends Settings {
  key: string
}
```

Load settings with defaults:

```ts
const existing = await db.get('settings', SETTINGS_KEY)

if (existing) {
  return mergeWithDefaults(existing)
}

await save(DEFAULT_SETTINGS)
return DEFAULT_SETTINGS
```

Why merge with defaults:

- New settings may be added in future versions.
- Older saved settings should still work.

---

## 10. Backup Export And Import

JSON cannot store `Blob` directly, so backups convert screenshots to data URLs.

Backup shape:

```text
version
exportedAt
session
steps
screenshots with dataUrl
```

Import needs to:

- Convert data URLs back to blobs.
- Handle existing session IDs.
- Generate new step IDs when merging.
- Generate new screenshot IDs when merging.
- Repoint step `screenshotId` fields.

---

## 11. Storage Quota

Browsers limit origin storage. Check quota before large captures.

```ts
const estimate = await navigator.storage.estimate()
const used = estimate.usage ?? 0
const quota = estimate.quota ?? 0
const percentUsed = quota > 0 ? (used / quota) * 100 : 0
```

Project thresholds:

```text
75 percent -> warning
90 percent -> critical
```

If critical, stop capture and ask the user to export or delete old sessions.

---

## 12. IndexedDB Checklist

- Define typed schema first.
- Create stores and indexes in `upgrade`.
- Cache the database promise.
- Use repositories, not raw DB calls in UI.
- Store screenshot blobs separately.
- Use transactions for multi-store changes.
- Keep settings merged with defaults.
- Delete related screenshots when deleting sessions.
- Check storage quota before capture.
- Export backups with screenshots as data URLs.

---

## 13. Common IndexedDB Mistakes

| Mistake | Symptom | Fix |
| --- | --- | --- |
| Base64 screenshots inside step records | Slow timeline and large reads | Store screenshot blobs separately |
| No transaction for step append | Session step count can drift | Use multi-store transaction |
| Missing indexes | Slow or awkward queries | Add indexes during DB upgrade |
| Settings not merged with defaults | New fields undefined | Merge saved settings with defaults |
| Deleting only session record | Orphaned steps/screenshots | Cascade delete related records |
| No quota handling | Capture fails late | Check `navigator.storage.estimate()` |

---

## 14. IndexedDB Concepts In More Detail

IndexedDB is built around these concepts:

| Concept | Meaning |
| --- | --- |
| Database | Named container, such as `qa-extension` |
| Version | Integer schema version |
| Object store | Similar to a table, stores records |
| Key path | Field used as primary key, such as `id` |
| Index | Secondary lookup path |
| Transaction | Group of reads/writes over stores |
| Cursor | Iteration tool for large query results |

Unlike SQL, IndexedDB is object-store based. You do not write SQL queries. You design stores and indexes around access patterns.

---

## 15. Designing Stores From Access Patterns

Start by listing reads and writes.

This project needs:

```text
Read all sessions newest first
Read active sessions for recovery
Read all steps for a session
Read one screenshot by ID
Delete all screenshots for a session
Read settings singleton
```

Those needs produce these stores and indexes:

```text
sessions.by-status
sessions.by-createdAt
steps.by-sessionId
steps.by-sessionId-stepNumber
screenshots.by-stepId
screenshots.by-sessionId
settings key singleton
```

Beginner rule: do not create indexes randomly. Create indexes for queries you actually need.

---

## 16. Database Version Upgrades

IndexedDB schema changes happen in the `upgrade` callback.

Example future version:

```ts
const db = await openDB<QADatabase>(DB_NAME, 2, {
  upgrade(db, oldVersion) {
    if (oldVersion < 1) {
      // Create initial stores.
    }

    if (oldVersion < 2) {
      const stepStore = db.transaction.objectStore('steps')
      stepStore.createIndex('by-status', 'status')
    }
  },
})
```

Migration rules:

- Never delete user data casually.
- Handle every old version path.
- Keep migrations deterministic.
- Test upgrade from real old data.
- Bump `DB_VERSION` when schema changes.

If you need to transform records, do it inside the upgrade transaction carefully.

---

## 17. Compound Indexes

A compound index uses multiple fields.

This project defines:

```ts
stepStore.createIndex('by-sessionId-stepNumber', ['sessionId', 'stepNumber'])
```

Use compound indexes when queries naturally depend on multiple fields.

Example lookup range concept:

```ts
const range = IDBKeyRange.bound([sessionId, 1], [sessionId, Infinity])
const steps = await db.getAllFromIndex('steps', 'by-sessionId-stepNumber', range)
```

Even if you sort in memory today, a compound index gives you a path to efficient ordered queries later.

---

## 18. Cursor Basics

For small collections, `getAll` is fine. For large stores, cursors are more memory-friendly.

Example cursor pattern:

```ts
const tx = db.transaction('steps')
const index = tx.store.index('by-sessionId')
let cursor = await index.openCursor(sessionId)

while (cursor) {
  const step = cursor.value
  console.log(step.id)
  cursor = await cursor.continue()
}
```

Use cursors when:

- You may process thousands of records.
- You want pagination.
- You want early exit.
- You want to avoid loading everything at once.

For this extension's normal session sizes, `getAllFromIndex` is simpler and acceptable.

---

## 19. Blob Storage Tradeoffs

Storing blobs in IndexedDB is convenient, but there are tradeoffs.

Benefits:

- Local-first.
- Works offline.
- Avoids file system permissions.
- Keeps screenshot data with session data.

Costs:

- Browser storage quota applies.
- Large databases can be slower to backup.
- Exporting requires blob-to-data URL conversion.
- Users may need cleanup tools.

Alternative storage options:

| Option | Pros | Cons |
| --- | --- | --- |
| IndexedDB blobs | Local and simple | Quota and backup size |
| File System Access API | User-visible files | Permissions and browser support |
| Remote storage | Sync across devices | Privacy and backend complexity |
| Chrome downloads only | Simple export | Not queryable as app state |

IndexedDB is the right default for this project.

---

## 20. Data Integrity Rules

The app should preserve these invariants:

```text
Every step belongs to an existing session.
Every screenshot belongs to an existing step and session.
Session stepCount matches number of steps.
Step numbers are positive and ordered within a session.
Settings always have all default fields after loading.
```

Ways to protect invariants:

- Use transactions.
- Use validators.
- Use repositories for delete cascades.
- Use import remapping for IDs.
- Use startup repair for orphaned active sessions.

IndexedDB does not enforce foreign keys for you. Your code must enforce relationships.

---

## 21. Pagination And Large Sessions

If sessions grow to hundreds or thousands of steps, loading all steps at once may become slow.

Pagination idea:

```ts
interface GetStepsPageInput {
  sessionId: string
  afterStepNumber?: number
  limit: number
}
```

Possible query:

```text
Get steps where sessionId matches and stepNumber is greater than last loaded step.
```

UI strategy:

- Load first 50 steps.
- Use virtualized timeline.
- Load screenshots lazily.
- Fetch older steps on scroll.

This project can start simple, but the data model supports future optimization.

---

## 22. Backup Format Versioning

Backups should have their own version separate from database version.

```ts
interface SessionBackup {
  version: number
  exportedAt: string
  session: Session
  steps: Step[]
  screenshots: SessionBackupScreenshot[]
}
```

Why separate versions:

- Database schema can change without changing exported backup format.
- Backup import may support older backup files.
- You can write migration logic for imported backups.

Future import pattern:

```ts
switch (backup.version) {
  case 1:
    return importV1Backup(backup)
  case 2:
    return importV2Backup(backup)
  default:
    throw new Error('Unsupported backup version')
}
```

---

## 23. Storage Testing Ideas

Unit/integration tests should cover:

- Creating sessions.
- Appending steps increments `stepCount`.
- Deleting a step renumbers later steps.
- Deleting a session deletes steps and screenshots.
- Duplicating a step shifts later steps.
- Importing backup remaps IDs when merging.
- Settings merge with defaults.
- Screenshot blob converts to data URL.

Manual browser tests should cover:

- IndexedDB stores exist after extension load.
- Screenshot records are blobs.
- Storage dashboard estimates size.
- Clear all data removes captured session data.
- Exported backup can be imported into a fresh browser profile.

---

## 24. IndexedDB Design Exercise

For any new feature, answer:

1. What records need to be persisted?
2. Which record owns the relationship?
3. What are the primary reads?
4. What indexes support those reads?
5. What writes must happen together?
6. What deletes need cascading cleanup?
7. Does this data belong in IndexedDB or `chrome.storage.local`?
8. Does it contain blobs or sensitive data?
9. Does it need backup/export support?
10. How will old data migrate when the schema changes?
