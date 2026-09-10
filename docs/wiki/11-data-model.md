# Data Model: Cosmos DB & Client Persistence

> **Last verified:** 2026-09-04 · **Part of:** [Classroom-survivors Repo Wiki](README.md)

**Owner files:** `api/src/functions/shared/db.js`, `api/src/functions/saveAnalytics.js`, `teaching_content.js`, `frontend_auth.js`, `api/src/functions/shared/auth.js`

One Cosmos DB (`Val-EslApp`), one main container (`Students`) holding **everything**: students, teachers, BMs, activity logs, analytics archives, diagnostics docs — discriminated by `role` / `type` fields. Names are env-overridable (`COSMOS_DB_NAME` / `COSMOS_CONTAINER_NAME`) so the test harness points at an isolated container without code edits.

## Container layout

| | Value |
|---|---|
| Database | `Val-EslApp` (prod; test container is a separate env-configured DB) |
| Container | `Students` (prod) |
| **Partition key** | **`/studentId`** — NOT `/id` |
| Throughput | serverless (verify in Azure portal if it matters) <!-- VERIFY: throughput setting not in repo --> |

## ⚠️ Partition-key gotchas (read before ANY point operation)

1. **Reads:** `container.item(id, id)` (point-read with PK=id) **404s every legacy doc that has no `studentId` field** — 93 prod docs (all real pre-migration students) live in the **null-PK partition**. Always read by **parameterized cross-partition query**: `SELECT * FROM c WHERE c.id = @id` (this is what every function does — keep it that way). Bulk cross-partition `SELECT *` fetches have also been flaky ("Error reading response as text"); the robust pattern is enumerating ids then per-doc queries.
2. **Writes:** use the doc's **own** `studentId` as PK when the field exists; for legacy docs use the single-arg `container.item(id)` (null-PK partition form). `saveAnalytics` implements exactly this branch (saveAnalytics.js ~195-222) — copy that pattern for any new point-write.
3. **Writes to docs whose `studentId` field exists but differs from `id`** would land in a different partition — new docs created via `addStudent` set both fields equal, which is the invariant to preserve.
4. Cross-partition writes/reads cost more and are rate-limitable; queries above filter by `id`/`login`/`role` and are small in this deployment's scale (~100 docs).

## Document types in the `Students` container

| Discriminator | id pattern | Produced by | Consumed by |
|---|---|---|---|
| **Student** — `role:'student'` (legacy docs may lack `role`) | `student_<name/hash>` | `addStudent`, import scripts | login, getStudents, dashboards |
| **Teacher / BM / admin** — `role:'teacher'/'BM'/'admin'` | chosen id | `manageBms`, `add_teacher` | login, manageBms, dashboards |
| **Analytics archive** — `type:'student_analytics_archive'` | `archive_<studentId>_<ts>` | saveAnalytics auto-archive | getStudentArchive, dashboard merge |
| **Delivery diagnostics** — `type:'delivery_diagnostics'`, id `delivery_diag_saveAnalytics` | fixed | saveAnalytics (best-effort) | forensics tooling |
| **Activity log** — `role:'bmActivity'` | `activity_<ts>_<rand>` | addStudent/updateStudent audit | manageBms `?action=logs` |

`getStudents` excludes archive docs from the student list (`NOT IS_DEFINED(c.role)` would otherwise surface them as phantom students — getStudents.js ~53). Cosmos metadata (`_rid`, `_self`, `_etag`, `_attachments`, `_ts`) is stripped by `auth.publicUser()` before any doc reaches a browser — **except** the raw `_etag` used server-side for IfMatch concurrency.

## Student document shape

Fields written by the API (addStudent.js ~40-57 + later mutations). Client-visible fields only — `password` handling noted separately.

```jsonc
{
  "id": "student_xxx",              // document id == studentId for new docs
  "studentId": "student_xxx",       // partition key (LEGACY DOCS LACK THIS — see gotchas)
  "login": "xxx",                   // unique login name
  "password": "…",                  // students: PLAINTEXT (teacher recovery feature); BMs/admin: scrypt hash
  "needsPasswordChange": true,      // cleared by changePassword
  "fullName": "…",
  "role": "student",
  "teacher": "Val",
  "classTime": "…", "book": "PU2", "unit": 3, "page": 12,   // teaching placement
  "avatar": null,                    // avatar id/url via updateAvatar
  "vsPromoSeen": false,              // Vampire Survivors promo dialog shown
  "sessionCount": 7,                 // incremented via saveAnalytics incrementSession (rides only with an applied SR update, 2026-09-10)
  "srSeq": 1789040382646,             // monotonic seq of last applied SR update; server applies only newer (shouldApplySr), client watermark confirmedSrSeq (2026-09-10)
  "analytics": [ /* event array — see below; auto-trimmed at 700 */ ],
  "srState": { "vocab": {}, "sentences": {}, "sentencePairs": {} },  // spaced-repetition state
  "targets": [
    { "id": "t_<ts>_<rand>", "startTime": "ISO", "endTime": "ISO",
      "targetSessions": 5, "manualOffset": 0 }   // manualOffset: teacher-adjusted counter delta
  ]
}
```

Notes:
- `targets.manualOffset` exists because teachers manually adjust a student's practice counter (offline sessions reported out-of-band). Completion = server-counted `type:'session'` events in range **+** `manualOffset` (admin_dashboard.js ~234-236, teacher_dashboard.js ~359-361, frontend_auth.js ~1608).
- `srState` shape is owned by `sr_engine.js` (spaced repetition); `saveAnalytics` overwrites the whole object from the client payload when present.
- `updateStudent` whitelists editable fields (add new fields there or they silently don't persist).

## Analytics event shapes (client-queued)

All events are created in `frontend_auth.js` and share: `timestamp` (ISO), `eventId` (stable, prefix + ts + random — the dedup key), `ps` (page-session id for restart correlation). Enrichment: `itemDetails` may carry `ua` (device UA captured with speech events — used for fleet delivery surveys).

| type | Emitted by | Payload |
|---|---|---|
| `exercise` | `queueExerciseEvent(exerciseType, mode, itemDetails?, customAttempts?)` (frontend_auth.js ~146) | `exerciseType`, `mode`, `attempts`, `durationMs`, `itemDetails?` (word/sentence + exercise-specific fields, may include `ua`) |
| `session` | `queueSessionEvent(sessionType, data)` (~180) | `sessionType`, `data` — counts toward weekly targets (dashboards filter on this type) |
| `device` | `queueDeviceInfoEvent()` (~210) — once per student/device/calendar day | `ua` (≤300ch), `platform`, `maxTouchPoints`, `uaData`, `screen`, `appVersion` — OS census; invisible to dashboards' exercise/session tables by design |
| (crash breadcrumb) | `csPageHeartbeat` on next launch detecting a dirty kill (~317) | synthesized `exercise`/session events describing the previous page's last activity |

Target-counting only ever uses `type:'session'` events in a date range; exercise tables use `type:'exercise'`.

## Client persistence (localStorage keys)

| Key | Owner | Contents |
|---|---|---|
| `csAnalyticsQueue` | `teaching_content.js` (`PERSISTED_QUEUE_KEY`, ~40) | The unsent event queue, mirrored on every enqueue/failed flush; removed when the server's ack accounts for every event. Hydrated at script load (`loadPersistedAnalyticsQueue`) — deliberately NOT reset on load. |
| `csSessionToken` | `frontend_auth.js` (`SESSION_TOKEN_KEY`, ~23) | Current session token (JWT-shaped) |
| `savedUsers` | `frontend_auth.js` | Array of cached user profiles (incl. plaintext password for quick re-login); `activeUserId` selects |
| `csPendingSRState` / `csPendingSRIncrement` | `teaching_content.js` (~65-66) | SR state in flight to the server — survives an app-kill between finalize and flush; cleared on ack |
| `csPageHeartbeat` | `frontend_auth.js` (`CS_HB_KEY`, ~261) | `{ps, state, ts}` breadcrumb of last activity — used to detect hard kills and emit crash breadcrumbs |
| `csCleanUnload` | `frontend_auth.js` (`CS_UNLOAD_KEY`, ~262) | `'1'` on graceful `pagehide` — absence + stale heartbeat = dirty kill |
| `csDeviceLogDay_<id>` | `frontend_auth.js` (~212) | Day-key de-dup for `device` events |

Queue lifecycle: enqueue → `persistAnalyticsQueue()` → 2s debounced `flushAnalytics()` → on response, drain only if acked fully (see [Telemetry](14-telemetry.md)). `saveActiveUserToCache()` (frontend_auth.js ~1402) is the hardened profile writer (quota-failure path trims the analytics mirror to 500, retries once).

## Client-side schema care

- The client hydrates `analyticsQueue` from localStorage **without validating** event shape — treat queue contents as untrusted input; server dedup tolerates re-ships.
- Any **new top-level student field** must be added to `updateStudent`'s `allowedFields` if dashboards should edit it, and dashboards must tolerate its absence on legacy docs (`|| 0` / `|| []` patterns everywhere).

## Update discipline

Any agent that changes code covered by this page must update this page in the same commit. The wiki is the single source of truth; skills/memory hold only behavior rules and point here.
