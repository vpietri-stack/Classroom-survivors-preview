# Testing

> **Last verified:** 2026-09-04 · **Part of:** [Classroom-survivors Repo Wiki](README.md)

**Owner files:** `package.json` (`test` script), `test_*.js` (root), `api/test_auth.js`, plus the out-of-chain `vs_*` test family.

`npm test` (root) is the **required-green gate before any commit**. It chains 10 Node scripts (`package.json` ~7):

```text
test_deploy_stamp_sync.js          # GUARD — runs FIRST, fails run on stamp drift
test_widgets_regression.js         # jsdom — scramble/spelling widgets, real scripts
test_sr_once_per_session.js        # SR spaced-repetition invariants (sr_engine)
test_round_e_dedup.js              # Round E sub-round pair selection rules
test_session_flush_deadline.js     # flush deadline + cache-writer hardening (vm)
test_auto_archive_analytics.js     # saveAnalytics pure helpers (archive + acks)
test_archive_merge_dashboard.js    # teacher_dashboard mergeAnalytics/getAnalyticsInRange
test_td_gate.js                    # Tower Defense live/preview URL gate (jsdom)
test_td_core.js                    # Tower Defense core behaviors (Playwright + real Chrome)
test_asset_manifest.js             # sprites/music/sfx on disk vs AssetCache manifests
```

Two extra aliases: `npm run test:td` = `test_td_gate.js && test_td_core.js`. The backend has its own suite: `cd api && npm test` → `api/test_auth.js` (requires the local Functions runtime on `:7072` + an isolated test container — see [Backend API](10-backend-api.md)).

## The stamp guard must stay first

`test_deploy_stamp_sync.js` asserts the three deploy stamps are byte-identical (`version.json` version == `frontend_auth.js` `APP_VERSION` == `index.html` `frontend_auth.js?v=`). It is intentionally the first command in the chain so drift fails the whole run. Never reorder, never bypass. (Why: red update banner for all users — see [Auth/Versioning](04-auth-versioning.md).)

## Harness styles (know which one you're extending)

| Harness | Files | How it works |
|---|---|---|
| **Pure Node** (no DOM) | stamp guard, auto-archive, archive-merge, sr tests (VM-loaded pure logic) | `node -e` style asserts; some load real source into a `vm` context with fixture data |
| **jsdom, real scripts** | `test_widgets_regression.js`, `test_sr_once_per_session.js`, `test_td_gate.js`, `test_round_e_dedup.js` | Loads `index.html` into JSDOM, strips remote `<script src>`, evals the REAL project scripts in index.html order into one blob (so top-level bindings are visible), stubs only externals (Phaser, Web Audio, Firebase, matchMedia). Asserts real widget behavior (placements, freezes, depleting banks). |
| **Playwright + real Chrome** | `test_td_core.js` (and the standalone `vs_*` device/gameplay tests) | `playwright-core` driving `C:\Program Files\Google\Chrome\Application\chrome.exe` against `file:///<repo>/index.html`. Network-dependent environment (jsdom can't run Phaser). |
| **HTTP integration** | `api/test_auth.js` | Starts from a running `func start` on `:7072`; exercises login/token/save flows against the test Cosmos container. |

jsdom harness details that bite: the script order list inside each test **must mirror index.html** — adding a new production script means updating the tests' `order` arrays; tests eval scripts as one concatenated blob so cross-file top-level bindings resolve; `file://` URL is used so relative asset paths resolve.

## Contract tests that pin cross-layer promises

These exist because their contracts were broken in production; treat failures as regressions, not flakiness:

- `test_session_flush_deadline.js` — the completion-time flush (`flushAnalyticsWithDeadline`) must resolve true when drained and **never hang past the deadline**; cached-profile writer must survive quota errors. Also pins the 2026-09-03a **ack discipline**: full-ack drains the queue / silent-200 keeps the queue / partial-ack keeps the queue.
- `test_auto_archive_analytics.js` — `splitAnalyticsForArchive` (700-trigger, 90-day sessions, 500-recent retention), fail-safe archive-then-trim, and `applyEventsWithAck` (added vs duplicate ack lists) — the server-side contract the client relies on.
- `test_sr_once_per_session.js` — SR state written ONCE per session at first check; failure interval rules; leech handling; 1-in-5 new material.
- `test_round_e_dedup.js` — due-status beats new material; E1 favors current page / E2-E3 avoid it; no repeat pairs in a session. Since 2026-09-08a also pins **Rule5 (cooldown floor: all-cooldown pool still serves 3 least-overdue pairs, never null)** and **Rule6 (`normMatchText` whitespace/case normalization)**.
- Since 2026-09-08a `test_session_flush_deadline.js` additionally pins the **sticky page-advance** (`csPendingPageAdvance` persists, `reapplyPendingPageAdvance()` restores pre-check, `updateStudent` re-sent until confirmed) and the **`queueDrain` login report** (backlog counts + oldest timestamp + pending SR/increment flags; silent on a clean device).

## Out-of-chain test families (not in `npm test`)

- **`vs_*` tests** (device matrix, hitbox, boss, timer, DPR, charselect, uno-transition, promo lifecycle, …): standalone Playwright/Node scripts run ad-hoc via `node vs_<name>_test.js`. They are NOT part of the required gate — the full picture is in [Vampire Survivors](07-vampire-survivors.md). When touching VS code, run the relevant ones manually.
- **`api/` forensics & regression scripts** (`test_scorer_regression.js`, `tune_scorer.js`, `whatif_scorer.js`, …): operator tools, some requiring live DB access; never wire them into the required gate. See [Backend API](10-backend-api.md).

## Conventions

- Tests live at repo root (frontend) or `api/` (backend) — no `test/` dir. Names: `test_<topic>.js`; VS tests prefix `vs_`.
- Every new regression ships with a test that fails before the fix and passes after (this is how the stamp guard, ack discipline, and widget rules got locked in).
- No test framework — plain `node` + `assert`, PASS/FAIL lines, non-zero exit on fail (that's what makes the `&&` chain a gate).
- Playwright tests need real Chrome at the hardcoded path; jsdom tests need only `npm install` at root.

## Update discipline

Any agent that adds/changes a test file, changes the `test` script chain, or changes a pinned contract must update this page in the same commit. The wiki is the single source of truth; skills/memory hold only behavior rules and point here.
