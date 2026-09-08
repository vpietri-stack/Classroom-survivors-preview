# Telemetry & Data Delivery

> **Last verified:** 2026-09-04 · **Part of:** [Classroom-survivors Repo Wiki](README.md)

**Owner files:** `frontend_auth.js` (queue/flush/beacon), `teaching_content.js` (persisted queue), `api/src/functions/saveAnalytics.js` (acks/archive/diagnostics), `test_session_flush_deadline.js`, `test_auto_archive_analytics.js`

Why this page exists: in this deployment **the client cannot trust the network, and the server cannot see the network**. Students play on old iPads (Safari/WeChat webviews) that kill background pages within seconds, and the Azure Static Web Apps host has **no App Insights** — a silent 200 (or a request that never arrives) leaves no server-side trace. Every mechanism below exists to make data delivery survive page death and to make failure *detectable* after the fact.

## Delivery pipeline

```mermaid
sequenceDiagram
    participant G as Game/Study widget
    participant Q as analyticsQueue (memory + localStorage csAnalyticsQueue)
    participant F as flushAnalytics (frontend_auth.js)
    participant A as saveAnalytics (Azure Function)
    participant C as Cosmos (Students container)

    G->>Q: queueExerciseEvent / queueSessionEvent (stable eventId)
    Q->>Q: persistAnalyticsQueue() — mirror to localStorage
    Note over Q: 2s debounce (scheduleAnalyticsFlush)
    F->>A: POST events (fetch + X-App-Key + X-Auth-Token)<br/>OR sendBeacon with ?appKey= & authToken in body
    A->>C: read doc (query) → apply w/ eventId dedup → IfMatch replace (≤4 attempts)
    A-->>F: 200 {addedEventIds, duplicateEventIds}
    alt response accounts for EVERY shipped eventId
        F->>Q: drain queue, clearPersistedSR
    else silent / partial / network-failed
        F->>Q: KEEP queue (beacon re-ships next launch; server dedups)
    end
```

Key rules (each pinned by tests — see [Testing](12-testing.md)):

- **Every event has a stable `eventId`** (`ex_`/`se_`/`dv_` + ts + random). Server dedup makes re-shipping idempotent; the client never clears its queue on faith.
- **Ack discipline (2026-09-03a):** the queue drains ONLY when the 200's `addedEventIds + duplicateEventIds` cover every shipped event. A "silent 200" (ok-looking response, nothing persisted) or partial ack keeps the queue. This shipped after 6 days of a student's data vanishing on exactly such silent 200s.
- **Two transports:** normal `fetch` (headers carry app key + token) and `navigator.sendBeacon` / `fetch(keepalive)` for unload-time flushes (cannot set headers → key as `?appKey=`, token in body `authToken`; server reads both and never trusts body identity). `flushAnalyticsViaBeacon` (frontend_auth.js ~387) is the beacon path; `flushAnalytics` (~459) the fetch path.
- **Completion-time flushes are awaited with a deadline:** `flushAnalyticsWithDeadline(maxMs=4000)` (~581) — end screens await it before rendering, so an iPad being recycled can't hang the UI; `flushAnalyticsOnLogin()` (~612) drains whatever the last session couldn't (crash-reload beacon). `flushAnalyticsOnGameOver()` (~557) covers game-over.
- **SR state double-bookkeeping:** `srPendingState` is persisted (`csPendingSRState`) at mutation time and cleared only on ack — an app-kill between finalize and flush can't drop spaced-repetition progress.

## Crash/kill forensics (client side)

`csPageHeartbeat` writes `{ps, state, ts}` breadcrumbs on every exercise/session; `pagehide` sets `csCleanUnload='1'`. On next launch, if there was no clean unload and the heartbeat is stale, the client synthesizes breadcrumb events describing the dead page's last activity (frontend_auth.js ~317-344, with a self-breadcrumb guard added 2026-08-26c because localStorage is shared across tabs). `ps` (page-session id) ties every event to its page load, so a hard-kill restart can be correlated with the last delivered tail.

## Server-side accounting

`saveAnalytics` (full walkthrough in [Backend API](10-backend-api.md)) provides the other half of the contract:

- **Lost-update guard:** IfMatch(`_etag`) optimistic concurrency, ≤4 read-apply-retry rounds; on losing a race it re-reads and re-applies (dedup drops what the race winner already wrote). Root cause context: two concurrent flushes (crash-reload login beacon racing a dying page's in-flight debounced flush) both read the same doc and last-writer-wins — proven live 2026-09-04 at 33% event loss (50/150) under a controlled 15×2 concurrent-POST probe; the fix dropped post-fix loss to zero.
- **PK-safe writes:** 93 legacy docs have no `studentId` field (null-PK partition); point-writes branch on the field's presence (see [Data Model](11-data-model.md)).
- **Auto-archive:** at 700 events, trim to (90-day sessions ∪ 500 most recent), archiving the rest to `student_analytics_archive` docs — fail-safe (no trim unless archive create succeeded). Dashboards merge archives back via `getStudentArchive`.
- **Delivery diagnostics:** every accepted request upserts the single-slot doc `delivery_diag_saveAnalytics` `{ts, studentId, added, total, ua≤120, transport:'header'|'body'}` — best-effort, never fails the save. Forensic use: if a device's fetch flushes vanish again, its UA's *absence* here (while beacon-path events keep arriving) proves requests never reached the function (edge/network loss) rather than a persistence bug.

## Incident history (the case files this architecture was built from)

Full write-ups indexed in [Gotchas & History](15-gotchas-and-history.md). Summary:

| Date | Incident | Root cause | Fix |
|---|---|---|---|
| 2026-08-21→ | A student (name withheld) loses every completed session | completion flush was fire-and-forget; page process died ~1s after the completion overlay | awaited deadline flush + hardened cache writer (test_session_flush_deadline.js) |
| 2026-08-25 | "Forced-refresh" oddities after crashes | page-restart lifecycle | deadline flush primitives + self-breadcrumb guard |
| 2026-08-28→09-03 | 6-day "silent-200" blackout: client got ok-looking 200s, nothing persisted server-side, queue drained on the lie | server had no per-event acks; client trusted 200s | per-event acks + ack discipline + delivery diagnostics (2026-09-03a) |
| 2026-09-04 | Even acked events could vanish | lost-update race on whole-doc writes (no optimistic concurrency) | IfMatch/_etag retry-merge in saveAnalytics; PK-safe point-writes for legacy docs |
| 2026-09-08 | Long-term successful student hits all-cooldown pool → session dead-ends to menu; page-advance decision evaporates; stuck CHECK on correct answers | interval-doubling outruns sessionCount; fire-and-forget `updateStudent`; strict-equality on HTML-interpolated tile text | cooldown floor (least-overdue pairs, never null) + sticky `csPendingPageAdvance` + `normMatchText` in both CHECK handlers + `queueDrain` login report (2026-09-08a) |

## Field-probing recipes (operator knowledge, sanitized)

- **Did a request arrive?** Query the `delivery_diag_saveAnalytics` doc (single slot = last accepted request only). Cross-reference the `type:'device'` events for that student's UA.
- **Concurrent-loss probe pattern:** N rounds × 2 parallel POSTs of unique eventIds → read back → count missing-after-ack. This is how the 33% loss was measured pre-fix.
- **Cross-partition reads:** never `container.item(id, id)` for legacy docs; enumerate ids then per-doc queries. See [Data Model](11-data-model.md).
- Forensics scripts under `api/` (`analyze_speech.js`, `analyze_devices.js`, `deep_dive_speech.js`) implement variants of these probes against live data — treat as production-touching.

## Update discipline

Any agent that changes code covered by this page must update this page in the same commit. The wiki is the single source of truth; skills/memory hold only behavior rules and point here.
