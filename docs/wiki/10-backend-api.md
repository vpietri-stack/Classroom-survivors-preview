# Backend API: Azure Functions

> **Last verified:** 2026-09-04 · **Part of:** [Classroom-survivors Repo Wiki](README.md)

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
| `addStudent.js` | POST | `addStudent` | Create student doc (+ `bmActivity` audit log) | App key + privileged token |
| `updateStudent.js` | POST | `updateStudent` | Edit whitelisted fields (`book, unit, page, classTime, password, needsPasswordChange, fullName, login, targets, teacher, vsPromoSeen`) + audit log | App key + privileged token |
| `setTargets.js` | POST | `setTargets` | Bulk-assign practice targets `{startTime, endTime, targetSessions}` to many students; replaces fully-covered existing targets | App key + privileged token |
| `manageBms.js` | GET, POST | `manageBms` | GET `?action=list` (BM accounts) / `?action=logs` (`bmActivity` docs). POST `add` / `changePassword` (self only) / `delete` | App key + privileged token (self-scoped for `changePassword`) |
| `changePassword.js` | POST | `changePassword` | Self-service password change; stores **scrypt hash**, clears `needsPasswordChange` | App key + self-or-role token |
| `updateAvatar.js` | POST | `updateAvatar` | Set `user.avatar` (self only) | App key + self-or-role token |
| `corsHooks.js` | OPTIONS | (one per API route) | Preflight responders via `app.http('options_<route>')` loop | none |
| `corsHooks.js` (hook) | — | — | `app.hook.postInvocation` wraps every HTTP response with CORS headers (`withCors`) | — |

**Key design facts:**

- **Identity is never client-supplied when a token exists.** `saveAnalytics` parses the body first because unload-time `sendBeacon`/`keepalive` flushes cannot set headers — the token rides in `body.authToken` (and the app key in `?appKey=`), but the acting identity is `token.sub`, never `body.studentId` (saveAnalytics.js ~141-153). Legacy no-token mode (REQUIRE_AUTH off) falls back to client-supplied ids for backward compat.
- **Plaintext password policy (deliberate):** students' passwords are stored plaintext (addStudent.js ~43) so the teacher dashboard can display them for recovery — the student-facing `changePassword` endpoint stores a proper scrypt hash (`scrypt$salt$hash`, shared/auth.js ~155). On login, if a stored password is a hash or missing, the verified plaintext is transparently re-stored (`needsPlaintextRecovery`, login.js ~76). This is a conscious trade-off, not an oversight — don't "fix" it without replacing the dashboard recovery feature.
- **BM = "branch manager"** — a helper role (e.g. a parent/assistant) that can manage students; privileged roles are `['teacher', 'BM', 'admin']` (`PRIV_ROLES`).

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

Also supports `srState` (speech-recognition state) and `incrementSession` (bumps `sessionCount`, rides only with an applied SR update).

## Environment variables (names only)

| Var | Set where | Purpose |
|---|---|---|
| `COSMOS_ENDPOINT`, `COSMOS_KEY` | Function App settings | Cosmos credentials (values withheld) |
| `COSMOS_DB_NAME`, `COSMOS_CONTAINER_NAME` | optional | Override DB/container for test/staging (defaults `Val-EslApp` / `Students`) — shared/db.js |
| `APP_API_KEY` | Function App settings + repo secret `APP_CLIENT_KEY` | App key layer (browser-shipped, not secret) |
| `SESSION_SECRET` | Function App settings | HMAC secret for session tokens (per-environment) |
| `REQUIRE_AUTH` | Function App settings | `'true'` → hard-401 on missing/invalid tokens |
| `TEST_MODE` | Function App settings (local dev) | Enables password-less teacher login bypass |

## Local development & testing

- `cd api && npm install` (deps: `@azure/cosmos` ^4.9.3, `@azure/functions` ^4.0.0, dev `azure-functions-core-tools`).
- `npm start` → `func start` (Core Tools) serves on `:7072` (the Node worker child typically holds `:7072`).
- **The local func host does NOT hot-reload module edits — restart it after code changes or it serves stale code.** Killing the `func` CLI wrapper can orphan the node worker still holding the port: find the PID via `netstat -ano | findstr 7072` and `Stop-Process -Id <pid>` (Windows PowerShell), then restart.
- `cd api && npm test` runs `test_auth.js` — it **requires** the local runtime on `:7072` **and** a local Cosmos test container (env-overridable DB/container names; test harness env vars are generated by gitignored helper scripts, never committed). Local test logins differ from production.
- `api/` also contains one-off ops/forensics scripts (not in any test chain): `analyze_speech.js`, `analyze_devices.js`, `tune_scorer.js`, `whatif_scorer.js`, `test_scorer_regression.js`, `deep_dive_speech.js`, import/seed/migrate/reset scripts (`import_csv.js`, `seed_test.js`, `migrate.js`, `migrate_bm_and_teacher_field.js`, `reset_students.js`, `update_names.js`, `add_teacher.js`, `ensure_teacher.js`), and probe scripts (`check_db.js`, `test_read.js`, `test_delete.js`, `test_flow.js`, `test_e2e_client.js`, `test_dashboard_flow.js`). These talk to real Cosmos using gitignored local settings — treat as production-touching tools.

## CI/CD

One workflow: `azure-static-web-apps-brave-bush-0438ab000.yml` ("Azure Static Web Apps CI/CD"), triggered by push/PR to `main` (and historical `v2-login`). Job runs **only** on repo `vpietri-stack/Classroom-survivors` (the preview repo lacks the SWA token secret). Steps: checkout → stage minimal `swa_app/` (config + stub index) → inject `app-config.json` from secret `APP_CLIENT_KEY` → `Azure/static-web-apps-deploy@v1` with `app_location: swa_app`, `api_location: api`, `skip_app_build: true`. See [Deployment](13-deployment.md) for the full pipeline, branch model, and the GitHub Pages wedge.

## Update discipline

Any agent that changes code covered by this page must update this page in the same commit. The wiki is the single source of truth; skills/memory hold only behavior rules and point here.
