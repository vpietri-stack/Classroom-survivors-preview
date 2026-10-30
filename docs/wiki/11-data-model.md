# Data Model: Cosmos DB & Client Persistence

> **Last verified:** 2026-09-27 · **Part of:** [Classroom-survivors Repo Wiki](README.md)

**Owner files:** `api/src/functions/shared/db.js`, `api/src/functions/saveAnalytics.js`, `api/src/functions/clearGeo.js`, `teaching_content.js`, `frontend_auth.js`, `api/src/functions/shared/auth.js`

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

### Preview-note completion (2026-10-27, preview API)

`previewNotes` is a small catalog-bounded map, currently
`{"pu3-u9-p111":{"version":1,"completedAt":"ISO"}}`. The normal `saveAnalytics`
IfMatch retry loop derives it from valid completed Study events with
`data.previewNote:{id,version,book,unit,page,wordCount:5,exerciseCount:5}`.
`shared/previewNotesCore.js` accepts only registered lesson IDs and the matching
location/version/counts; duplicates merge idempotently. It writes alongside the
ordinary session/SR changes in the same student-document replace and survives
analytics archival. `publicUser` already returns it on login. No new endpoint,
container, throughput or raw recording is introduced.

The preview frontend mirrors this bounded map under
`csPreviewNotes:preview:<studentId>` (or `csPreviewNotes:local:<studentId>` in dev)
after queueing the completed session. It merges fresh server progress and recent
session markers on login, without sharing state between accounts/environments.

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
  "geo": { "lat": 31.23, "lng": 121.47, "capturedAt": "ISO", "source": "browser", "days": 5, "samples": 12 },  // consensus home (geo v2, 2026-09-26)
  "geoSamples": [ { "lat": 31.23, "lng": 121.47, "capturedAt": "ISO" } ],  // capped raw sample list the consensus is derived from
  "srState": { "vocab": {}, "sentences": {}, "sentencePairs": {} },  // spaced-repetition state (server holds the FULL state; client ships per-session deltas)
  "targets": [
    { "id": "t_<ts>_<rand>", "startTime": "ISO", "endTime": "ISO",
      "targetSessions": 5, "manualOffset": 0 }   // manualOffset: teacher-adjusted counter delta
  ]
}
```

Notes:
- `targets.manualOffset` exists because teachers manually adjust a student's practice counter (offline sessions reported out-of-band). Completion = server-counted `type:'session'` events in range **+** `manualOffset` (admin_dashboard.js ~234-236, teacher_dashboard.js ~359-361, frontend_auth.js ~1608).
- `srState` shape is owned by `sr_engine.js` (spaced repetition). `saveAnalytics` **replaces** the whole object from the client payload when `srDelta` is absent (legacy), but **merges it key-by-key** onto the stored state when `body.srDelta === true` (2026-09-16c) — which is what the current client always sends. Each entry records `lastSession`, and the client's `extractSRDelta` ships only entries whose `lastSession === currentSession`. Consequence for readers: the server copy is the authoritative *full* state, so never assume a delta-only write lost the untouched entries.
- A per-item entry carries lapse counts too — at `SR_LEECH_LAPSES = 4` an item becomes a "leech" and returns every other session instead of every session, so long-lived docs accumulate items with irregular cadence by design ([SR engine](05-study-mode.md)).
- `updateStudent` whitelists editable fields (add new fields there or they silently don't persist).
- `geo` (geo v2, 2026-09-26; replaced the v1 "last known location" field) is the student's **consensus home**: WGS-84 coords rounded to 2 decimals (~1.1 km precision — the raw GPS fix never leaves the device, and the server re-rounds). It is **no longer latest-wins** — it is recomputed from `geoSamples` on every accepted capture: samples are grouped by ~1 km cell and the cell seen on the **most distinct Beijing calendar days** wins, ties broken by the latest `capturedAt` (a 20-login trip day is still 1 day-vote and can never outvote a spread of home days). `days` = distinct day-votes of the winning cell, `samples` = total kept samples (across **all** cells — the dashboard column is labelled `Samples (all)` for exactly that reason). **Treat `days` as a LOWER bound:** a day-vote only accumulates when a stable place re-bins into the same ~1 km cell, and low-accuracy network (WiFi/IP) fixes can scatter one physical spot across 2–4 neighbouring cells — so undercounting is possible, overcounting is not. **Absent until the first accepted capture**; every consumer that existed before v2 (dashboard coverage, CSV, map HTML) was written for the v1 `lat`/`lng`/`capturedAt` triple and tolerates `days`/`samples` being absent, so the two counters are additive — and the v2 CSV/map now read `days` as well.
- `geoSamples` (geo v2) is the raw list the consensus derives from: `{lat, lng, capturedAt}` entries appended by `saveAnalytics`'s geo diversion (`applyGeoSamples`), **deduped by same cell + same Beijing date** (first fix of a day per cell is kept; different cells on the same day are both kept — home+school diversity), **cap 30** (oldest trimmed). `capturedAt` is **never the client's string**: `_validGeoFix` re-parses it and re-serialises a server-made ISO stamp clamped to `min(Date.parse(timestamp), now)` (unparsable/absent → now), so garbage, future-dated and oversized stamps can't poison the day-votes while an offline queue replay still lands with its real past time. A legacy v1 `geo` on a doc without `geoSamples` is **seeded** as the first sample so old captures count as one day-vote instead of vanishing. Like `geo`, written **only** by the geo diversion — `updateStudent` whitelists neither. To wipe a student's location: **`POST /api/clearGeo`** (privileged; removes `/geo` + `/geoSamples` — the dashboard Settings-tab 清除位置 button calls it), after which the student's next login re-captures automatically (v2 captures every login). See [Backend API](10-backend-api.md) and the trip-contamination incident in [Gotchas](15-gotchas-and-history.md).

## Analytics event shapes (client-queued)

All events are created in `frontend_auth.js` and share: `timestamp` (ISO), `eventId` (stable, prefix + ts + random — the dedup key), `ps` (page-session id for restart correlation), **`ownerId`** (the `authActiveUser.id` that queued it — added 2026-09-16a; `flushAnalytics` drops foreign-owned events rather than shipping them under the wrong login). Enrichment: `itemDetails` may carry `ua` (device UA captured with speech events — used for fleet delivery surveys).

| type | Emitted by | Payload |
|---|---|---|
| `exercise` | `queueExerciseEvent(exerciseType, mode, itemDetails?, customAttempts?)` (frontend_auth.js :164) | `exerciseType`, `mode`, `attempts`, `durationMs`, `itemDetails?` (word/sentence + exercise-specific fields, may include `ua`) |
| `session` | `queueSessionEvent(sessionType, data)` (:211) | `sessionType`, `data` — counts toward weekly targets (dashboards filter on this type). Sorted to the **front** of the queue at flush time (2026-09-16b) so its ack never starves behind an exercise pile. |
| `device` | `queueDeviceInfoEvent()` (~210) — once per student/device/calendar day | `ua` (≤300ch), `platform`, `maxTouchPoints`, `uaData`, `screen`, `appVersion` — OS census; invisible to dashboards' exercise/session tables by design |
| `geo` | `csMaybeCaptureGeo()` (~295) — passive browser-geolocation capture, **every login** (v2, 2026-09-26; the client no longer gates on a previous success) | `lat`, `lng` (both rounded to 2 decimals **client-side before enqueue**), `timestamp`, `eventId:'geo_*'`, `ownerId`, `ps`. **NEVER stored in the `analytics` array** — `saveAnalytics`'s geo diversion (`extractGeoUpdates` → `applyGeoSamples`) accumulates it into `geoSamples` and recomputes the consensus `geo`; its eventId is always acked in `addedEventIds` so the client clears its queue |
| (crash breadcrumb) | `csPageHeartbeat` on next launch detecting a dirty kill (~317) | synthesized `exercise`/session events describing the previous page's last activity |

Target-counting only ever uses `type:'session'` events in a date range; exercise tables use `type:'exercise'`.

## Client persistence (localStorage keys)

| Key | Owner | Contents |
|---|---|---|
| `csAnalyticsQueue_<id>` | `teaching_content.js` (`persistedQueueKey()`) | The unsent event queue, mirrored on every enqueue/failed flush; removed when the server's ack accounts for every event. Hydrated at script load (`loadPersistedAnalyticsQueue`) — deliberately NOT reset on load. **Per-student since 2026-09-16a** (the global `csAnalyticsQueue` was how one login flushed another student's data); `loadPersistedAnalyticsQueue` still reads the legacy key when the scoped one is absent. Capped at **500** events in memory (oldest shed). |
| `csSessionToken` | `frontend_auth.js` (`SESSION_TOKEN_KEY`, ~23) | Current session token (JWT-shaped). Device-wide by design, not scoped. |
| `savedUsers` | `frontend_auth.js` | Array of cached user profiles (incl. plaintext password for quick re-login); `activeUserId` selects. Device-wide by design — it *is* the profile picker. |
| `csPendingSRState_<id>` | `teaching_content.js` (`persistPendingSR`) | SR state in flight to the server — survives an app-kill between finalize and flush; cleared on ack. Under **quota pressure** this may instead hold a delta envelope `{__srDelta:true, delta:{…}}`, which `loadPersistedSR` merges onto the cached full profile state (or holds alone). |
| `csPendingSRIncrement_<id>` | `teaching_content.js` | `'1'` when the pending SR update should also bump `sessionCount` |
| `csPendingSRSeq_<id>` / `csConfirmedSrSeq_<id>` | `teaching_content.js` | Monotonic seq of the pending SR update / highest server-confirmed seq (newer-wins gate, 2026-09-10) |
| `csPageHeartbeat` | `frontend_auth.js` (`CS_HB_KEY`) | `{ps, state, ts}` breadcrumb of last activity — used to detect hard kills and emit crash breadcrumbs. Page-lifecycle, not per-account. |
| `csCleanUnload` | `frontend_auth.js` (`CS_UNLOAD_KEY`) | `'1'` on graceful `pagehide` — absence + stale heartbeat = dirty kill |
| `csDeviceLogDay_<id>` | `frontend_auth.js` | Day-key de-dup for `device` events |
| `csGeoDone_<id>` | `frontend_auth.js` (`csGeoFlagKey()`, 2026-09-25b) | `{status:'ok'\|'fail', ts}` geolocation-capture flag. **Diagnostic-only since geo v2 (2026-09-26)** — it no longer gates anything; capture runs on **every** login regardless (v1's permanent `ok` gate froze trip captures in as "home"; see [Gotchas](15-gotchas-and-history.md)). Still useful when a student reports prompting issues: `ok` with no server sample means the flush was lost, not the fix. Scoped by id via its own helper, not `scopedKey()`. |
| `csBaiduAk` | `geo_export.js` (teacher dashboard) | Baidu Maps JS API key for the HTML map export. **Teacher browser only — never sent to the server.** Not id-scoped (one key per browser). |

All `_<id>` keys are produced by `scopedKey(base)` and adopted from the legacy global name by
`migrateScopedKey(base)` (copy once, then delete the global) — exception: `csGeoDone_<id>` builds
its own key (`csGeoFlagKey()`, 2026-09-25b) and has no legacy global to migrate. On every login
`saveUserToLocalAndStart()` calls `resetInMemorySessionState()` → assigns `authActiveUser` →
`reloadAnalyticsQueueForActiveUser()` + `loadPersistedSR()`, in that order — the order matters,
because the scoped-key helpers resolve the suffix from `authActiveUser`. See
[Auth & Versioning](04-auth-versioning.md).

Queue lifecycle: enqueue → `persistAnalyticsQueue()` → 2s debounced `flushAnalytics()` → on response, drain only if acked fully (see [Telemetry](14-telemetry.md)). `saveActiveUserToCache()` (frontend_auth.js ~1402) is the hardened profile writer (quota-failure path trims the analytics mirror to 500, retries once).

## Client-side schema care

- The client hydrates `analyticsQueue` from localStorage **without validating** event shape — treat queue contents as untrusted input; server dedup tolerates re-ships.
- Any **new top-level student field** must be added to `updateStudent`'s `allowedFields` if dashboards should edit it, and dashboards must tolerate its absence on legacy docs (`|| 0` / `|| []` patterns everywhere).

## Attendance and calendar (12 October 2026)

Students may also store `classGroups: [{teacher,classTime}]` for additional weekly groups; the legacy `teacher`/`classTime` remain primary. Shared `memberships()` combines/deduplicates both. Targets gain optional `groupKey = JSON.stringify([teacher,classTime])` to isolate each group's periods, goals and offsets. New automatic/manual targets are explicitly bound. Legacy single-group periods retain compatibility; multi-group legacy targets match a unique Beijing end weekday/time or remain unassigned until reviewed. Membership changes persist determinable bindings, and existing explicit bindings remain on former-group history. Practice events have no group ownership: each eligible session counts independently in all overlapping target windows. Attendance receipts already identify the teacher/class time/class occurrence, so one profile records attendance in both groups without duplicate accounts.

Students gain optional `attendance: [{classId, startTime, endTime, classTime, teacher, status, recordedAt, recordedBy}]`. Status is `attended`, `missed`, or `cancelled`; cancelled entries are idempotency receipts for target updates (+10 sessions and seven days per newly cancelled class), not absences. The original target start and manual offset remain unchanged. Existing receipts are not replayed or migrated. A student's attendance array and targets are updated together in one conditional patch. Absence of the array is valid for legacy students. Practice targets retain their existing shape; automatic targets use deterministic `attendance_<classId>` IDs. No new localStorage keys are introduced.

Each persisted class is a separate `role: classCalendar` document with `id = studentId = class_<32 hex characters>`, a teacher/classTime `groupKey`, `startTime`, `endTime`, a roster snapshot `studentIds`, `status: scheduled|cancelled|retired`, optional `manual`, and `attendanceStarted`. Generated IDs hash the group plus the original Beijing date, so rescheduling and calendar reloads cannot create duplicate classes. Calendar documents are excluded from roster queries by their role. Separate class documents bound item size and allow independent ETag-protected edits; future unedited rosters update on calendar load, historic rosters remain snapshots. Future defaults for groups with no remaining students are retired and hidden; they do not create absences or cancellation target extensions.


## Speech research documents (prepared 2026-10-15)

The existing `speech_samples` container holds three document types. Audio clips
use `type: speech_sample`, `schemaVersion: 2`, stable `sampleId`, and `outcome`
(graded/too_short/too_quiet/hallucination/empty). Ungraded `pass` and score values
are null. Legacy untyped clips remain readable and count toward the cap.
`speech_sample_quota` documents share the student's partition and are updated
in the same transaction as a clip create. One `speech_sample_control` document
in a reserved non-student partition coordinates short leases, cooldowns, and
bounded last-write statistics. Export/count code must exclude control records.

## Update discipline

Calendar generation metadata is stored separately as `{id: 'class_calendar_state', studentId: 'class_calendar_state', role: 'classCalendarState', rosterHash, generatedThrough, groupKeys}`. It tracks generated weekly occurrences without storing a stale calendar snapshot. Membership signatures use sorted groups/student IDs, preventing ordering-only writes. Class documents may gain `attendanceComplete: true` after all roster receipts are confirmed; student attendance remains authoritative. Both document roles remain excluded from student queries.

Dashboard summaries are transient read models, not student writes: `_summary`, `sessionDays` (`[UTC date, sessions, study sessions, study duration ms]` tuples), representative `targets` and `targetCounts`. Complete student records remain unchanged and available on demand. Client-only revision/progress caches are in memory; no new localStorage keys or retained copies of private history are introduced.

Any agent that changes code covered by this page must update this page in the same commit. The wiki is the single source of truth; skills/memory hold only behavior rules and point here.

## Preview non-spelling exercise identities (2026-10-13)

Missing-word/find-fix outcomes use non-spelling:<type>:<book>:<unit>:<page>:<id>
keys inside srState.sentences. They add independent histories without a new bucket
or API schema. Old scramble string keys and matching a | b keys stay unchanged.
New events are missingWord/findAndFix; itemDetails includes stable ID/key,
curriculum location, sentences, authored answers and submitted response.


## Practice lifecycle and diagnostic chunks (2026-10-30)

Permanent practice analytics use phase, runId, mode, game, stage/checkpoint metadata and explicit/inferred exit details. They follow normal event acknowledgement and archiving, carry no session credit, and link exercise/completion records through practiceRunId. Existing type guards keep targets unchanged.

The separate client_diagnostics container now stores immutable client_diagnostics_chunk uploads and atomic client_diagnostics_usage daily quota reservations with 14-day TTL. Chunk IDs hash browser plus event IDs. Existing daily documents remain readable. A non-expiring _global/config policy has scope: all_students, enabled, paused and a hard endsAt; per-account opt-outs win. No container/throughput provisioning is part of this rollout.
