# Backend API: Azure Functions

> **Last verified:** 2026-09-27 · **Part of:** [Classroom-survivors Repo Wiki](README.md)

**Owner files:** `api/src/functions/*.js`, `api/src/functions/shared/*.js`, `api/package.json`, `api/host.json`, `staticwebapp.config.json`, `.github/workflows/azure-static-web-apps-brave-bush-0438ab000.yml`

Azure Functions v4 (Node, programming model `@azure/functions`), hosted by an Azure Static Web Apps instance whose **only job is to host `/api`** — the game itself lives on GitHub Pages. The SWA app dir is a stub (`swa_app/` staged in CI with `staticwebapp.config.json` + injected `app-config.json` + a placeholder `index.html`), because the full repo exceeds the SWA Free tier's 250 MB app limit.

## Endpoint catalog

All HTTP triggers use `authLevel: 'anonymous'` — real gating is two application-level layers: **app key** (`validateApiKey`) and **session token** (`shared/auth.js`). Routes without an explicit `route:` use the function name.

| Function | Methods | Route | Purpose | Auth |
|---|---|---|---|---|
| `login.js` | GET, POST | `login` | POST: password login → `{ user, token }`. GET: refresh session from valid token (returns fresh token + public user) | App key; POST verifies password; GET requires valid session token |
| `saveAnalytics.js` | POST | `saveAnalytics` | Persist queued analytics events, `srState`, session increments; auto-archive | App key + `requireAuth` (token or `authToken` in body for sendBeacon) |
| `getStudents.js` | GET | `getStudents` | List students (privileged: all, optional `?includeSecure=true` returns plaintext passwords for recovery). Student token: only own record, never password | App key + token (legacy no-token mode allowed when `REQUIRE_AUTH` off) |
| `getStudentArchive.js` | GET | `getStudentArchive` | Fetch a student's `student_analytics_archive` docs (older trimmed events) | App key + privileged token or self |
| `clearGeo.js` | POST | `clearGeo` | Geo v2 (2026-09-26): remove a student's `/geo` + `/geoSamples` (Cosmos patch, body or `?studentId=`). The student's next login re-captures automatically — this endpoint IS the recapture mechanism (dashboard 清除位置 button). **Non-atomic query→patch on purpose** (no `_etag`): a concurrent login-flush may re-add one sample right after a clear, which is benign — do NOT "fix" with a blind whole-doc replace (that's the lost-update hazard, rule 9 in [Gotchas](15-gotchas-and-history.md)) | App key + privileged token |
| `addStudent.js` | POST | `addStudent` | Create student doc (+ `bmActivity` audit log) | App key + privileged token |
| `updateStudent.js` | POST | `updateStudent` | Edit whitelisted fields (`book, unit, page, classTime, password, needsPasswordChange, fullName, login, targets, teacher, vsPromoSeen`) + audit log | App key + privileged token — **or** a student's own token for `book`/`unit`/`page` on its own id (self-service auto-advance, 2026-09-16a) |
| `setTargets.js` | POST | `setTargets` | Bulk-assign practice targets `{startTime, endTime, targetSessions}` to many students; replaces fully-covered existing targets | App key + privileged token |
| `manageBms.js` | GET, POST | `manageBms` | GET `?action=list` (BM accounts) / `?action=logs` (`bmActivity` docs). POST `add` / `changePassword` (self only) / `delete` | App key + privileged token (self-scoped for `changePassword`) |
| `changePassword.js` | POST | `changePassword` | Self-service password change; stores **scrypt hash**, clears `needsPasswordChange` | App key + self-or-role token |
| `updateAvatar.js` | POST | `updateAvatar` | Set `user.avatar` (self only). `sanitizeAvatar` (exported pure) rejects non-strings, >32 chars, or any `<>&"'\`` — the field renders inside the teacher dashboard's innerHTML (2026-09-27 XSS hotfix; client also escapes) | App key + self-or-role token |
| `speechSampleConsent.js` | GET | `speechSampleConsent` | ⏳ **Temporary (until 2026-10-26).** Tells the signed-in client whether it may record+upload speech samples, so audio never leaves a non-consented device. Returns `{consented, open, endsAt}`; fails closed on any error | App key + token |
| `saveSpeechSample.js` | POST | `saveSpeechSample` | ⏳ **Temporary (until 2026-10-26).** Stores one consented student's WAV + scorer metadata into the `speech_samples` container. Window-, consent-, size- and cap-enforced server-side; 410 once the window closes | App key + token (consent keyed on `token.sub`) |
| `handwritingCaptureConfig.js` | GET | `handwritingCaptureConfig` | ⏳ **Temporary (until 2027-01-31).** Tells the signed-in client whether it may record+upload handwriting traces, so a student who is not being recorded never sends anything. Returns `{enabled, open, endsAt, maxPerDay}`; fails closed on any error | App key + token |
| `saveHandwritingSample.js` | POST | `saveHandwritingSample` | ⏳ **Temporary (until 2027-01-31).** Stores one word's pen strokes + the verdicts the shipped geometry reached, into the `handwriting_samples` container. Window-, enable-, size- and daily-cap-enforced server-side; 410 once the window closes. Deliberately NOT routed through `saveAnalytics` (see [Study mode](05-study-mode.md)) | App key + token (identity from `token.sub`) |
| `corsHooks.js` | OPTIONS | (one per API route) | Preflight responders via `app.http('options_<route>')` loop | none |
| `corsHooks.js` (hook) | — | — | `app.hook.postInvocation` wraps every HTTP response with CORS headers (`withCors`) | — |

**Key design facts:**

- **Identity is never client-supplied when a token exists.** `saveAnalytics` parses the body first because unload-time `sendBeacon`/`keepalive` flushes cannot set headers — the token rides in `body.authToken` (and the app key in `?appKey=`), but the acting identity is `token.sub`, never `body.studentId` (saveAnalytics.js ~141-153). Legacy no-token mode (REQUIRE_AUTH off) falls back to client-supplied ids for backward compat.
- **Plaintext password policy (deliberate):** students' passwords are stored plaintext (addStudent.js ~43) so the teacher dashboard can display them for recovery — the student-facing `changePassword` endpoint stores a proper scrypt hash (`scrypt$salt$hash`, shared/auth.js ~155). On login, if a stored password is a hash or missing, the verified plaintext is transparently re-stored (`needsPlaintextRecovery`, login.js ~76). This is a conscious trade-off, not an oversight — don't "fix" it without replacing the dashboard recovery feature.
- **BM = "branch manager"** — a helper role (e.g. a parent/assistant) that can manage students; privileged roles are `['teacher', 'BM', 'admin']` (`PRIV_ROLES`).
- **Self-service placement is the one deliberate exception to privileged-write** (2026-09-16a). The SR auto-advance runs on the *student's* device and calls `updateStudent` with `{book, unit, page}` — which 403'd forever, so a 43→48 page move could never stick server-side (the client kept re-deriving the old page each login). A student token may now write **only** `SELF_PLACEMENT_FIELDS = ['book','unit','page']` and **only** when `token.sub === body.studentId`; the role check is skipped solely when every submitted key passes that test. Any other field, or a different `studentId`, still requires a privileged role.

## Auth layers in detail

### Layer 1 — App key (`shared/validateApiKey.js`)

Validates `X-App-Key` header (or `?appKey=` for sendBeacon) against env `APP_API_KEY`. **The key ships to the browser in `app-config.json`, so it is not a real secret** — it only deters casual direct API callers. Accepts ANY of: correct key · request Origin/Referer matching own origins (`vpietri-stack.github.io`, `*.azurestaticapps.net`) · localhost Origin without a key · no key configured (dev fallback). Note: only Origin/Referer are checked for localhost — `request.url` inside the Functions host is always the internal `http://localhost:<port>`, so trusting it would whitelist everything.

The key is injected at deploy time by the GitHub Actions workflow from repo secret `APP_CLIENT_KEY` (workflow step "Inject client app config"). `app-config.json` is gitignored and never committed.

### Layer 2 — Session token (`shared/auth.js`)

- **Format:** JWT-shaped, HMAC-SHA256 signed (`alg HS256`), TTL 30 days (`DEFAULT_TTL`). Payload `{sub, login, role, name, iat, exp}`.
- **Transport:** header `X-Auth-Token` (preferred — Azure SWA's managed-functions proxy **overwrites `Authorization`** with its own internal token, so a client `Authorization` header would be silently lost); fallback `Authorization: Bearer` for local dev; fallback `?authToken=` / body `authToken` for sendBeacon paths (`getBearer`, shared/auth.js ~71-93).
- **Secret:** env `SESSION_SECRET`, lives only in Function App settings, differs per environment (live vs test harness). Never shipped to any browser.
- **Verification is constant-time** (`crypto.timingSafeEqual`) and expiry-checked.
- **Feature-flagged enforcement:** env `REQUIRE_AUTH === 'true'` makes missing/invalid tokens 401. While off (current live state), missing tokens yield `null` and functions fall back to legacy client-supplied-id scoping — this let the API deploy before all clients sent tokens. Privileged endpoints additionally reject *unprivileged* tokens regardless of the flag.
- **Test mode:** `login?testMode=true` returns a teacher/BM token without password, only when env `TEST_MODE === 'true'` (local dev / test harness). Off in production → falls through to normal login.

### Layer 3 — CORS (`shared/cors.js`, `staticwebapp.config.json`)

Allowed origin: `https://vpietri-stack.github.io` (both production and preview repos share the origin — no path component) + `localhost`/`127.0.0.1` prefixes for dev. `corsHooks.js` registers OPTIONS handlers per route and a post-invocation hook adding CORS headers to all responses; `staticwebapp.config.json` duplicates the headers at the SWA edge for `/api/*`.

## `saveAnalytics` deep dive (the most important endpoint)

Read-modify-write of the whole student doc; carries the hardest-won concurrency lessons (full incident history in [Telemetry](14-telemetry.md) and [Gotchas](15-gotchas-and-history.md)):

1. **Parse body → auth gate** (`requireAuth(request, body.authToken)`); identity = `token.sub`.
2. **Lost-update guard (2026-09-04):** up to `MAX_ATTEMPTS = 4` rounds of read → apply → `replace` with `accessCondition: { type: 'IfMatch', condition: doc._etag }`. On a 412/precondition failure: re-read the doc, re-apply the events (eventId dedup drops what the race winner already persisted), retry. This exists because two concurrent flushes (crash-reload login beacon racing a dying page's in-flight debounced flush) used to read the same doc and last-writer-wins-erase the other's just-acked events — proven live at 33% loss (saveAnalytics.js ~160-231).
3. **PK-safe point-write:** the container's partition key is `/studentId`, but **93 legacy prod docs predate that field and live in the null-PK partition**. `container.item(id, id)` 404s them. The write uses the doc's own `studentId` field as PK when present, else the single-argument `container.item(id)` null-PK form (saveAnalytics.js ~195-222). First attempt reads via parameterized query `SELECT * FROM c WHERE c.id = @id` (cross-partition-safe); retry reads use point-read.
4. **Idempotent apply with per-event acks** (`applyEventsWithAck`, exported pure): events with an `eventId` already present are skipped and reported in `duplicateEventIds`; new ones in `addedEventIds`. The client drains its persisted queue only when the response accounts for every shipped event.
5. **Auto-archive** (`maybeArchiveAnalytics`): if the analytics array reaches `ARCHIVE_TRIGGER_COUNT = 700` events, split into retained (all `type:'session'` events from the last `RETENTION_DAYS_MS = 90 days` + the `RETENTION_MAX_RECENT_EVENTS = 500` most recent) and `toArchive`; write a `student_analytics_archive` doc (`id: archive_<studentId>_<ts>`), and only trim the live doc **if the archive create succeeded** (fail-safe against data loss).
6. **Delivery diagnostics (best-effort, never fails the save):** upserts a single-slot ring doc `delivery_diag_saveAnalytics` (`type: 'delivery_diagnostics'`) recording the last accepted request: `{ts, studentId, added, total, ua (≤120 chars), transport: 'header'|'body'}`. With no App Insights on the SWA, this doc is the only server-side trace of whether fetch-path flushes physically arrive. Absence of a device's UA here while its events keep arriving (via beacon) proves edge/network loss. It is a **single-slot** record — last request wins.
7. **Response 200:** `{success, message, addedEventIds, duplicateEventIds, sessionCount, srApplied, srSeq}` — errors: 403 (app key), 400 (no events array), 404 (student not found), 409 (etag retries exhausted), 500 (unexpected).
8. **SR newer-wins (2026-09-10):** each client SR update carries monotonic `body.srSeq` (stamped in `finalizeSession`); `shouldApplySr` (exported pure) applies only if newer than the doc's stored `user.srSeq`, so lost-response replays and beacon+fetch duplicates can never re-apply stale state or double-increment `sessionCount`. Legacy bodies without `srSeq` keep apply-always. The response confirms `srApplied` + echoes `srSeq`; the client advances its `confirmedSrSeq` watermark and suppresses anything at/below it.
9. **SR delta merge (2026-09-16c):** `body.srDelta: true` means `srState` holds only the entries touched this session, so the server **merges** it onto the stored doc (key-overwrite per `vocab`/`sentences`/`sentencePairs`) instead of replacing. Absent flag = legacy full replace, so an old client keeps working unchanged. The merge is inlined in `saveAnalytics.js` because the client-side `mergeSRDelta` helper in `sr_engine.js` is not importable from the Function. This exists because a long-enrolled student's full SR state grew to 65KB and blew Chromium's ~64KB keepalive cap — see [Telemetry](14-telemetry.md#sr-delta-sync-why-the-completion-packet-is-a-few-kb).
10. **Geo diversion (v2, 2026-09-26; v1 was 2026-09-25b):** `extractGeoUpdates` (exported pure) pulls every `type:'geo'` event out of the incoming batch **before** the analytics apply — only `cleanEvents` reach `applyEventsWithAck`, so geo events never enter the `analytics` array and are excluded from archive counting/trimming. Then `applyGeoSamples(user, geoEvents)` (also exported pure; saveAnalytics.js ~107-221) **accumulates** them inside the existing IfMatch retry loop (idempotent on concurrency retries): each fix is validated (non-finite, |lat|>90, |lng|>180 are **dropped server-side but their eventIds are still acked** — `addedEventIds` returns `geoEventIds.concat(addedEventIds)` — so the client clears junk instead of re-shipping it forever) and **re-rounded to 2 decimals** (defense in depth; the client already rounds to ~1.1 km before enqueue, raw GPS never lands in the doc) with **`capturedAt` clamped server-side** (`Date.parse`; future/garbage stamps collapse to now — 2026-09-27 review wave, so day-votes can't be forged), appended to `user.geoSamples` (dedup same ~1 km cell + same Beijing date, cap 30 oldest-trimmed, legacy v1 `user.geo` seeded as the first sample), and the top-level `user.geo` is recomputed as the **unique-day consensus** `{lat, lng, capturedAt, source:'browser', days, samples}` — most distinct Beijing days in a cell wins, ties by recency. v1's single latest-wins overwrite is gone; the client captures on every login (no `csGeoDone` gate). To wipe the data: `POST /clearGeo`. See [Data Model](11-data-model.md) for field semantics and [Gotchas](15-gotchas-and-history.md) #27 for why v1 was retired.

`srState` is the **spaced-repetition** state (`sr_engine.js`), *not* speech recognition — the abbreviation collision is a known readability trap. `incrementSession` bumps `sessionCount` and rides only with an applied SR update.

## Environment variables (names only)

### `clientDiagnostics` (temporary, 2026-10-23)

GET/POST and CORS preflight. Always requires a verified session token, including
when legacy auth enforcement is disabled. GET returns only the actor's enabled
configuration; privileged `?studentId=<id>&view=events` returns a bounded incident
history from the student's partition. POST `{action:'configure',enabled,days}`
is privileged only, capped at 14 days. Student POST batches are scoped to token
identity, require an active server trial and validated event types/ids/times,
and return explicit event acknowledgements. Bodies over 24KB / batches over 40
events are rejected. No writes touch Students; details and device metadata are
sanitized again server-side. See [Telemetry](14-telemetry.md) for retention,
queue limits, container setup and environment overrides.

| Var | Set where | Purpose |
|---|---|---|
| `COSMOS_ENDPOINT`, `COSMOS_KEY` | Function App settings | Cosmos credentials (values withheld) |
| `COSMOS_DB_NAME`, `COSMOS_CONTAINER_NAME` | optional | Override DB/container for test/staging (defaults `Val-EslApp` / `Students`) — shared/db.js |
| `APP_API_KEY` | Function App settings + repo secret `APP_CLIENT_KEY` | App key layer (browser-shipped, not secret) |
| `SESSION_SECRET` | Function App settings | HMAC secret for session tokens (per-environment) |
| `REQUIRE_AUTH` | Function App settings | `'true'` → hard-401 on missing/invalid tokens |
| `TEST_MODE` | Function App settings (local dev) | Enables password-less teacher login bypass |
| `SPEECH_SAMPLE_CONSENTED_IDS` | Function App settings | ⏳ **Temporary.** Comma/semicolon/space-separated list of `studentId`s allowed to upload speech samples. **Never put this in the repo** — it is public and IDs embed children's full pinyin names. Unset or empty ⇒ fail closed, nobody is consented |
| `SPEECH_SAMPLE_CAPTURE_ENDS` | optional | ⏳ **Temporary.** Override the collection deadline (default `2026-10-26T00:00:00+08:00`). Set to a past instant to close collection early without a redeploy |
| `COSMOS_SPEECH_SAMPLES_CONTAINER` | optional | ⏳ **Temporary.** Override the samples container name (default `speech_samples`). Must stay in `Val-EslApp` so it shares that database's 1000 RU/s autoscale pool — see [Speech](08-speech.md) §11.1 |
| `HANDWRITING_SAMPLE_IDS` | Function App settings | ⏳ **Temporary.** Who may have handwriting traces recorded. **Unset or empty ⇒ fail closed, nobody is recorded.** `*` ⇒ every signed-in student (the intended live value). Or a comma/semicolon/space-separated list of `studentId`s to narrow it — e.g. to honour a parent's objection without a redeploy. **Never put a list in the repo** — it is public and IDs embed children's full pinyin names |
| `HANDWRITING_SAMPLE_CAPTURE_ENDS` | optional | ⏳ **Temporary.** Override the collection deadline (default `2027-01-31T00:00:00+08:00`). Set a past instant to close early, or a later one to extend — the client takes the authoritative instant from `handwritingCaptureConfig`, so extending does not need a frontend redeploy |
| `COSMOS_HANDWRITING_SAMPLES_CONTAINER` | optional | ⏳ **Temporary.** Override the trace container name (default `handwriting_samples`). Must stay in `Val-EslApp` for the same shared-autoscale-pool reason as the speech container |

## Local development & testing

- `cd api && npm install` (deps: `@azure/cosmos` ^4.9.3, `@azure/functions` ^4.0.0, dev `azure-functions-core-tools`).
- `npm start` → `func start` (Core Tools) serves on `:7072` (the Node worker child typically holds `:7072`).
- **The local func host does NOT hot-reload module edits — restart it after code changes or it serves stale code.** Killing the `func` CLI wrapper can orphan the node worker still holding the port: find the PID via `netstat -ano | findstr 7072` and `Stop-Process -Id <pid>` (Windows PowerShell), then restart.
- `cd api && npm test` runs `test_auth.js` — it **requires** the local runtime on `:7072` **and** a local Cosmos test container (env-overridable DB/container names; test harness env vars are generated by gitignored helper scripts, never committed). Local test logins differ from production.
- `api/` also contains one-off ops/forensics scripts (not in any test chain): `analyze_speech.js`, `analyze_devices.js`, `tune_scorer.js`, `whatif_scorer.js`, `test_scorer_regression.js`, `deep_dive_speech.js`, import/seed/migrate/reset scripts (`import_csv.js`, `seed_test.js`, `migrate.js`, `migrate_bm_and_teacher_field.js`, `reset_students.js`, `update_names.js`, `add_teacher.js`, `ensure_teacher.js`), and probe scripts (`check_db.js`, `test_read.js`, `test_delete.js`, `test_flow.js`, `test_e2e_client.js`, `test_dashboard_flow.js`). These talk to real Cosmos using gitignored local settings — treat as production-touching tools.

## CI/CD

One workflow: `azure-static-web-apps-brave-bush-0438ab000.yml` ("Azure Static Web Apps CI/CD"), triggered by push/PR to `main` (and historical `v2-login`). Job runs **only** on repo `vpietri-stack/Classroom-survivors` (the preview repo lacks the SWA token secret). Steps: checkout → stage minimal `swa_app/` (config + stub index) → inject `app-config.json` from secret `APP_CLIENT_KEY` → `Azure/static-web-apps-deploy@v1` with `app_location: swa_app`, `api_location: api`, `skip_app_build: true`. See [Deployment](13-deployment.md) for the full pipeline, branch model, and the GitHub Pages wedge.

## Calendar endpoint (12 October 2026)

`GET /classCalendar?through=YYYY-MM-DD` materializes weekly 90-minute classes from 2026-10-12 through a bounded future horizon and returns persisted events. `POST /classCalendar` supports `action: edit` (`eventId`, `etag`, ISO `startTime`, `endTime`), `action: record` (`eventId`, `studentIds`, `status: attended|missed`), and `action: cancel` (`eventId`). App-key and privileged-role gates match the existing dashboard API, including the existing legacy mode when auth enforcement is disabled. Its OPTIONS route is registered in `corsOptions.js`.

For new cancellations, the existing target in that class group gains 10 sessions and seven days; its start, manual offset and other groups remain unchanged. Class-ID receipts ensure retries do not increment the goal again. Existing cancellation receipts are not migrated.

Recording/cancelling returns per-student `results` with updated attendance and targets; successful records are idempotent by class ID. Calendar edits/locks and student attendance+target changes use conditional patches with bounded 412 retries. Practice counts for missed-class carry-over include analytics archives, with event deduplication and short-loss filtering. Classes cannot be edited after attendance/cancellation starts, and future attendance is rejected. Per-student chronological entry is enforced server-side. Calendar documents have `role: classCalendar` so the existing getStudents query excludes them.

`updateStudent` now patches only whitelisted edited fields; `setTargets` conditionally patches targets and retries concurrency conflicts. These preserve concurrently written attendance/analytics rather than upserting a stale full student document. Legacy missing studentId partition keys remain supported.


## Speech collection preparation (2026-10-15)

`POST reserveSpeechSample` is an app-key/token protected small request. It
requires the exact consented identity, enabled switch, open window and a global
reservation. It returns an owner/sample-bound nonce or a quiet skip before audio
is encoded. `saveSpeechSample` requires that nonce and matching body/token owner.
`GET speechSampleConsent` additionally returns `maxSamples` and `maxWavBytes`.
New settings: `SPEECH_SAMPLE_CAPTURE_ENABLED` (off unless exactly true) and
`SPEECH_SAMPLE_MAX_PER_STUDENT` (1-30, default 30, invalid closes intake).
See [rollout](../speech-collection-rollout.md) for deployment and pilot checks.

## Update discipline

## Dashboard performance API (19 October 2026)

Privileged `GET getStudents?view=dashboard&includeSecure=true&since=<revision>` returns `{revision,full,students,removed}`. Stable revisions return 304 without a response body; warm instances compare bounded per-student hash maps and cold instances return full compact snapshots. Credentials remain restricted to the existing trusted includeSecure contract. Students always receive only their own sanitized record, regardless of view/studentId parameters. `GET getStudents?studentId=...` loads one complete student record for privileged callers, with `detailRevision` for conditional reloads. The legacy array response remains available without view parameters.

`classCalendar` GET accepts a `from`/`through` month range and `since` revision. It includes older scheduled classes whose completion has not been confirmed. Calendar generation persists roster-hash/horizon metadata, reconciles memberships only on change, and extends only the missing future interval. Attendance POST reads the affected group and one projected cohort, shares archive reads, locks a class once, and atomically patches each student's receipts/targets with ETag retries. Results include fresh target counts and the affected class so clients need no global reload. `attendanceComplete` is set only after all roster receipts are confirmed and is an optimization, never the idempotency source.

Target report archives are read in bounded 20-student batches rather than one request per group member; merged ranges preserve dual-group practice counting. Live/archive projections include only counting/duration fields. The response adds privileged `progressUpdates` metadata for existing roster rows; report rows remain credential/account-ID free. Report generation remains fresh and independent of roster/calendar availability.

Any agent that changes code covered by this page must update this page in the same commit. The wiki is the single source of truth; skills/memory hold only behavior rules and point here.

## Target report export

When an attended/missed-unmet class was rescheduled earlier, recording attendance closes the preceding target at the actual class start if its old deadline would overlap the new period. The other group's periods remain unchanged.

Multi-group support: `updateStudent` accepts validated `classGroups` (up to 20 `{teacher,classTime}` memberships). Membership edits bind existing targets where their group can be determined, without changing periods/goals/offsets. Target writes use conditional patches; manual edits can supply `expectedTargets` and get 409 when their snapshot is stale. `setTargets` accepts `target.groupKey`, or `target.teacher`/`target.classTime` for batches, verifies membership and replaces contained periods only within that group. Successful results include the updated targets array. Calendar generation projects all memberships; future rosters update even for rescheduled classes while times and historical rosters remain preserved. Earlier pending attendance is enforced per student **and group**. The report query includes primary and secondary teachers, then expands one row per deduplicated membership and selects only that group's target.

`GET /getTargetReports?teacher=...` is a read-only admin/BM endpoint (legacy no-token mode follows REQUIRE_AUTH). The teacher is required and parameterized. It returns `{teacher, generatedAt, groups:[{teacher,classTime,rows:[{name,avatar,teacher,classTime,completed,goal,startTime,endTime}]}]}`. No credentials, account IDs, or analytics arrays leave the endpoint. Counts include archived sessions from the student partition and the shared calendar count rules; query failures return 500 and never an incomplete successful report. It has a registered CORS preflight and `Cache-Control: no-store`.

## Preview-note completion

saveAnalytics folds valid session/study data.previewNote markers into the bounded user.previewNotes map inside its existing etag retry/write. The regular event, acknowledgements, SR delta and session counter remain the same transaction. Login returns this map through publicUser. No new endpoint or second weekly-target credit is introduced.
