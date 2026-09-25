# Telemetry & Data Delivery

> **Last verified:** 2026-09-25 · **Part of:** [Classroom-survivors Repo Wiki](README.md)

**Owner files:** `frontend_auth.js` (queue/flush/beacon), `teaching_content.js` (persisted queue, scoped keys), `sr_engine.js` (`extractSRDelta`/`mergeSRDelta`), `api/src/functions/saveAnalytics.js` (acks/archive/diagnostics/delta-merge), `test_session_flush_deadline.js`, `test_auto_archive_analytics.js`

Why this page exists: in this deployment **the client cannot trust the network, and the server cannot see the network**. Students play on old iPads (Safari/WeChat webviews) that kill background pages within seconds, and the Azure Static Web Apps host has **no App Insights** — a silent 200 (or a request that never arrives) leaves no server-side trace. Every mechanism below exists to make data delivery survive page death and to make failure *detectable* after the fact.

## Delivery pipeline

```mermaid
sequenceDiagram
    participant G as Game/Study widget
    participant Q as analyticsQueue (memory + localStorage csAnalyticsQueue_<id>)
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
- **Events are owner-tagged (2026-09-16a):** every queued event carries `ownerId: authActiveUser.id`, and `flushAnalytics` filters out any event whose `ownerId` differs from the active login before shipping. Without this a leftover from account A flushes under account B's name (reproduced: test accounts received another student's vocab). See [Auth & Versioning](04-auth-versioning.md) for the per-account key scoping that complements it.
- **Session records jump the queue (2026-09-16b):** session events are re-sorted to the FRONT of `analyticsQueue` before batching. The session is queued last by the game but matters most, and a failed completion flush re-queues its whole batch to the front — so an unsorted session kept rejoining a pile it could never escape (~60 exercises delivered, 0 sessions confirmed in one student log). With sessions first, the session ack depends on the first small packet instead of a 60-event batch.
- **Completion retries back off fast (2026-09-16b):** `flushAnalyticsOnGameOver` waits `400 * attempt` ms (was `800 *`), capping added delay at ~1.2s. The completion screen *awaits* this function, so the old waits were exactly the "slightly longer" hang a child stares at. The 4s deadline plus next-login drain cover the rest.

## Boundedness: the queue must never be able to wedge the page

Every rule here exists because an *unbounded* queue turns a save failure into a frozen game — which is worse than losing data. Three layers, all added 2026-09-16a:

| Layer | Limit | Why |
|---|---|---|
| Enqueue backpressure | `analyticsQueue` capped at **500** events; over that, the OLDEST are shed (`splice(0, n-499)`) | When saves never succeed (content blocker, offline) the queue grows until serialization throws. Newest work + the session record matter more than a 300-event-old exercise. |
| Flush batch cap | **200** events per flush (`MAX_BATCH`), rest drains progressively via the 2s debounce | Keeps a single request body small enough to stringify and to fit keepalive limits. |
| Stringify guard | `JSON.stringify` is wrapped in its own try/catch; on `Invalid string length` it shrinks to the **oldest 50** events and `events.splice(50)`s so ack/drain accounting stays consistent with what actually shipped | The throw happens *synchronously, before* the enclosing `try`'s first `await` — so it would escape the existing catch and wedge the caller. This is the layer that makes "the page froze" impossible rather than unlikely. |

**Root cause (Val's PC log, 2026-09-16a):** a content blocker produced `ERR_BLOCKED_BY_CLIENT` on every API call → queue grew without bound → the next flush built a body so large `JSON.stringify` threw → page freeze. Detection aid added alongside: `noteFlushNetworkFailure()` counts consecutive *network* throws (fetch threw while the page itself loads fine = blocker/captive portal, not a server problem), and after 5 shows the save-blocked banner.

## SR delta sync (why the completion packet is a few KB)

`updateSRStateForSession` returns a FULL state (every entry copied), so a long-enrolled student's SR payload grows with their history. That collided with a hard transport limit:

> **The ~64KB keepalive cap (2026-09-16c).** Chromium caps `fetch(keepalive)` bodies at roughly 64KB. Over the cap the request fails with `Failed to fetch` **without ever contacting the server** — so not just the oversized flush fails, *every* flush does, because the pending SR rides along on small in-session batches too. A poisoned account hit this at 65KB of full SR state.

The fix ships a delta, not the state:

- `extractSRDelta(fullState, currentSession)` (sr_engine.js) keeps only entries with `lastSession === currentSession` — exactly the items touched this session.
- `finalizeSession` sets `srPendingDelta` + `srPendingIsDelta = true`. The **in-memory and persisted full state stay complete** (the next session in this page-load and the SR selector both need it); only the **wire payload** shrinks.
- `flushAnalytics` sends `body.srState = srWire` plus `body.srDelta = true`. **Absent flag = legacy full replace**, so an old client against a new server still works — the change is additive on both ends.
- Server-side, `saveAnalytics` merges the delta onto the stored doc by key-overwrite across `vocab`/`sentences`/`sentencePairs` (inlining the same semantics as client `mergeSRDelta`, since that helper lives client-side).
- On a failed/restore path the delta is restored alongside `srPendingState` (`srPendingDelta = srWire; srPendingIsDelta = srIsDelta`) so a retry ships the same delta rather than falling back to the oversized full state.
- Quota guard: when localStorage is near-full, the persisted pending-SR entry is stored as a **delta envelope** (`{__srDelta: true, delta}`); `loadPersistedSR` merges it onto the cached full profile state if available, else holds the delta alone.

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
| 2026-09-16a | Student's PC froze the page; another student's test accounts saw a classmate's vocab | content blocker → `ERR_BLOCKED_BY_CLIENT` on every API call → unbounded queue → `JSON.stringify` threw; localStorage keys were global, so one login inherited another's leftovers | 500-event cap + 200-event chunks + stringify guard; per-account key scoping with legacy migration + `ownerId` tags + full in-memory reset on login; save-blocked orange banner; API bypass in speech `patchedFetch`; self-service `updateStudent` placement |
| 2026-09-16b | ~60 exercises confirmed, 0 sessions confirmed for one student | session queued last, but every failed flush re-queued its batch to the front — the session could never escape the pile; the awaited 800ms-backoff retries were a visible hang | session-first ordering before batching + retry backoff 800→400ms (cap ~1.2s added delay) |
| 2026-09-16c | One long-enrolled account failed EVERY flush with `Failed to fetch`, no server contact | its 65KB full-state SR packet exceeded Chromium's ~64KB keepalive cap — and rode along on small in-session flushes too | SR delta sync (`extractSRDelta`, `srDelta` flag, server-side merge); in-memory/persisted full state untouched, only the wire payload shrinks; localStorage quota guard |

## Field-probing recipes (operator knowledge, sanitized)

- **Did a request arrive?** Query the `delivery_diag_saveAnalytics` doc (single slot = last accepted request only). Cross-reference the `type:'device'` events for that student's UA.
- **Concurrent-loss probe pattern:** N rounds × 2 parallel POSTs of unique eventIds → read back → count missing-after-ack. This is how the 33% loss was measured pre-fix.
- **Cross-partition reads:** never `container.item(id, id)` for legacy docs; enumerate ids then per-doc queries. See [Data Model](11-data-model.md).
- Forensics scripts under `api/` (`analyze_speech.js`, `analyze_devices.js`, `deep_dive_speech.js`) implement variants of these probes against live data — treat as production-touching.

## Update discipline

Any agent that changes code covered by this page must update this page in the same commit. The wiki is the single source of truth; skills/memory hold only behavior rules and point here.
