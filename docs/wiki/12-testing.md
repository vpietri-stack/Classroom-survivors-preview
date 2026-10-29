# Testing

`test_speech_adaptive_runtime.js` covers verified HTTP-cache hits, compressed cold/resumed WASM transfer, old-browser raw fallback and persistent byte equality. Native checks should force a runtime HTTP-cache miss and reject unplanned full-WASM downloads during session creation, so seeding model caches cannot hide the runtime's real first-use path.

`test_speech_adaptive_mirrors.js` covers the actual ModelScope package (reconstructed from exact reversible fixtures), read-only legacy migration, poisoned chunk repair, wrong same-length mirror data without exposed range headers, early route rejection, verified cache retention, pinned cold/resumed source conversion, compatibility-download failure and budget. Cold/legacy smoke checks must include the real field package, not only Git-canonical cache entries.

`test_speech_adaptive_lifecycle.js` uses a controlled worker and browser clock to cover ten hidden minutes of preparation, completion while hidden, deferred background errors and automatic saved-file recovery, stale-worker events, prepare-from-import, visible-only assessment deadlines, duplicate visibility events, BFCache, explicit Stop/unload, actual fake-device microphone shutdown and late microphone grants. No accounts, real student recordings or external requests are used.

`test_speech_collection.js` covers the public prompt inventory, confusable family split isolation, mandatory human review, multiple retained takes, durable reload, full audio backup/restore, hash corruption and ID conflicts, imitation notes, quota failure without draft loss, late mic grants, 320px layout and no external/model calls. The inspection CLI is checked against a synthetic backup and excludes reserved prompts from development manifests.


Single-word lab regressions additionally cover export during a stalled optional model, preserved audio and teacher labels, skip/cancel with partial results, fallback asset routes, resumed chunks and checksum rejection.


`test_speech_word_poc.js` verifies the standalone experiment: same clip across variants/models, recorder-equivalent trim, no automatic Moonshine use, distinct transcript/hint feedback, target invalidation, neutral errors, teacher labels and paired exports, cancellation, mobile fit, no external writes, and SHA-256 verification of pinned Moonshine assets. Native smoke testing separately exercises the actual Whisper and Moonshine workers with synthetic speech; this establishes integration, not child-reading accuracy.


`test_speech_practice.js` also covers existing Study/game tile feedback, prompt/row removal, immediate retry reset, ordered repeated words and contractions, and neutral fallback on mismatched checker output.


The required root suite also runs `test_speech_practice.js` (preview/production
gating, real shared controls and Study/game progression, retry/Continue,
permission/timeout/cancellation/late-result/account protections) and
`test_speech_engine_cancel.js` (actual unchanged Whisper/WASM, synthetic audio,
interruption, single-flight guard and reuse without model re-download).
`test_speech_hygiene.js` additionally covers discarding audio and late microphone
permission grants. These tests use no real student recordings or live accounts.
`test_speech_target.js` verifies the aggregate-only data export, positive/neutral
hints, independent exact-match preservation, silence, causal token-by-token
checking, cancellation and reuse of matching silence features. Native runtime
tests verify target-check cancellation and repeated checks with no new weights.

Cancellation regression coverage in `test_class_calendar.js` verifies +10 sessions and seven days, the 23 October–6 November example, consecutive cancellations, preserved start/manual offset, no invented target when none exists, separate group targets and idempotent cancellation retries.

23 October handwriting checks pin initial/direct-call guide gating, exclusion
of taps, automatic guides after two meaningful failures with no guide button,
per-letter reset, retained ink and the existing reveal/skip paths. The failure
that first displays guides must not unlock skip; a later guided failure does.
Session skip coverage includes initial visibility/handler locks, unguided and
tap exclusions, a real guided failure, persistence onto later words, and a new
session reset. The two eraser buttons are exercised through their rendered UI.

`test_handwriting_neural_browser.js` serves the actual preview under a repository
subpath and checks worker loading, automatic assisted guides, retained ink, undo,
unfinished dotted letters, pointerup endpoint capture, async skip/destroy races,
320px layout, offline reload, no external requests and first-download failure
with the same guide/skip locks. It is part of `npm test`. Existing handwriting/capture
browser tests cover engine 2 and assisted completion. The dotted-i fixture now
draws the actual upper dot; its former y-cut accidentally drew another stem.

> **Last verified:** 2026-10-11 · **Part of:** [Classroom-survivors Repo Wiki](README.md)

**Owner files:** `package.json` (`test` script), `test_*.js` (root), `api/test_auth.js`, plus the out-of-chain `vs_*` test family.

`npm test` (root) is the **required-green gate before any commit**. It chains 21 Node scripts
(`package.json:7`). Verified 2026-10-12: **880 assertions, 0 failures** (counts per file below;
the stamp guard prints no summary line).

```text
test_deploy_stamp_sync.js          # GUARD — runs FIRST, fails run on stamp drift   (— )
test_widgets_regression.js         # jsdom — scramble + handwriting answer row, real scripts (82)
test_handwriting.js                # pure Node — handwriting mask maths, synthetic rings (42)
test_handwriting_browser.js        # Playwright + real Chrome — Fredoka glyph masks + trace flow (59)
test_handwriting_samples.js        # ⏳ trace collection: policy, sanitizers, compaction, wiring (145)
test_handwriting_capture_browser.js# ⏳ Playwright — traces reach the payload and replay to the same verdict (36)
test_sr_once_per_session.js        # SR spaced-repetition invariants (sr_engine)      (22)
test_round_e_dedup.js              # Round E sub-round pair selection rules           (16)
test_session_flush_deadline.js     # flush deadline + queue/SR sync contracts (vm)    (84)
test_auto_archive_analytics.js     # saveAnalytics pure helpers (archive + acks)      (15)
test_archive_merge_dashboard.js    # teacher_dashboard mergeAnalytics/getAnalyticsInRange (7)
test_speech_hygiene.js             # Recorder AudioContext teardown + sp* breadcrumbs (10)
test_speech_samples.js             # ⏳ speech sample collection: consent fail-closed, WAV guard, caps (79)
test_td_gate.js                    # Tower Defense live/preview URL gate (jsdom)      (11)
test_td_core.js                    # Tower Defense core behaviors (Playwright + real Chrome) (23)
test_asset_manifest.js             # sprite/music/sfx lists + 3-way vocab naming contract (171)
test_geo_events.js                 # saveAnalytics geo v2: diversion, samples, consensus (15)
test_geo_capture.js                # client capture gate/rounding/flags (vm)          (15)
test_geo_export.js                 # geo_export: conversion, CSV, map HTML, escaping  (23)
test_geo_map.js                    # geo_map: GCJ points, haversine, ranking, Gaode links (18)
test_dashboard_security.js         # sanitizeAvatar allowlist + authorizeClearGeo     (7)
```

Two extra aliases: `npm run test:td` = `test_td_gate.js && test_td_core.js`. The backend has its own suite: `cd api && npm test` → `api/test_auth.js` (requires the local Functions runtime on `:7072` + an isolated test container — see [Backend API](10-backend-api.md)).

## The stamp guard must stay first

`test_dashboard_non_spelling.js` runs in the root suite and separately with
`npm run test:dashboard-exercises`. It loads the real dashboard and content
catalog in Chrome with mocked read-only API responses and blocked external
traffic. It covers typed exercise labels/details, JSON and archived object
payloads, SR filters/search/popups, catalog fallback for failed-only boards,
unknown IDs, legacy rows and escaping. Screenshots use the OS temp folder
`classroom-dashboard-non-spelling`.

`test_vocab_normalization.js` also runs in `npm test`. It checks the canonical
comparison/tense/pronoun labels across PU1–3 and Think0–1, role-sensitive
exceptions, exact translations and continuity of existing image lookups. It
also pins the original beginner labels in PU1 Units 0-3 while later units retain
their normalized forms. It exercises every audited legacy SR alias, latest-record and same-session failure
resolution, non-mutating reads, interval/lapse preservation and sparse deltas.

`test_deploy_stamp_sync.js` asserts the three deploy stamps are byte-identical (`version.json` version == `frontend_auth.js` `APP_VERSION` == `index.html` `frontend_auth.js?v=`). It is intentionally the first command in the chain so drift fails the whole run. Never reorder, never bypass. (Why: red update banner for all users — see [Auth/Versioning](04-auth-versioning.md).)

## Harness styles (know which one you're extending)

| Harness | Files | How it works |
|---|---|---|
| **Pure Node** (no DOM) | stamp guard, auto-archive, archive-merge, sr tests (VM-loaded pure logic), `test_handwriting.js`, `test_speech_samples.js`, `test_handwriting_samples.js` | `node -e` style asserts; some load real source into a `vm` context with fixture data. `test_handwriting.js` `require`s `handwriting.js` (it exports its pure functions under a `module.exports` guard that is inert in the browser) and drives the mask maths with synthetic rings. The two ⏳ collection tests `require` their endpoint module (which logs an `@azure/functions` "test mode" warning and registers nothing) plus the shared policy, and load the browser-only capture module in a `vm` sandbox with a fake `localStorage`. |
| **jsdom, real scripts** | `test_widgets_regression.js`, `test_sr_once_per_session.js`, `test_td_gate.js`, `test_round_e_dedup.js` | Loads `index.html` into JSDOM, strips remote `<script src>`, evals the REAL project scripts in index.html order into one blob (so top-level bindings are visible), stubs only externals (Phaser, Web Audio, Firebase, matchMedia). Asserts real widget behavior (placements, freezes, depleting banks). **jsdom has no 2D canvas**, so the handwriting trace box cannot run there — only its answer row can. |
| **Playwright + real Chrome** | `test_td_core.js`, `test_handwriting_browser.js`, `test_handwriting_capture_browser.js` (and the standalone `vs_*` device/gameplay tests) | `playwright-core` driving `C:\Program Files\Google\Chrome\Application\chrome.exe` against `file:///<repo>/index.html`. Network-dependent environment (jsdom can't run Phaser, and only a real browser can rasterise the Fredoka glyph masks). |
| **HTTP integration** | `api/test_auth.js` | Starts from a running `func start` on `:7072`; exercises login/token/save flows against the test Cosmos container. |

jsdom harness details that bite: the script order list inside each test **must mirror index.html** — adding a new production script means updating the tests' `order` arrays; tests eval scripts as one concatenated blob so cross-file top-level bindings resolve; `file://` URL is used so relative asset paths resolve.

**Any page code that calls the API must have `apiFetch` stubbed in the Playwright harnesses.** From `file://` a real call goes to the production Functions app and dies on CORS (the allowlist is `vpietri-stack.github.io` / `azurestaticapps.net`), which surfaces as a `runtime: no JS errors` failure — and worse, the test has just talked to live infrastructure. This bit when the handwriting round started asking `/api/handwritingCaptureConfig`; both handwriting harnesses now install a stub that records the requests instead of sending them, which is also how the collection's "nothing leaves the device when capture is off" and "traces never ride `saveAnalytics`" assertions are proven.

## Contract tests that pin cross-layer promises

`test_handwriting_browser.js` also checks per-word skipping through the real button: untouched and partially written words, a fresh skip on the next word, double-tap protection, final-word continuation, cancellation of pen-lift/accepted-letter/reveal timers, exit during the skip delay, and no completed-handwriting event or SR result for skipped words.

These exist because their contracts were broken in production; treat failures as regressions, not flakiness:

- `test_session_flush_deadline.js` — the completion-time flush (`flushAnalyticsWithDeadline`) must resolve true when drained and **never hang past the deadline**; cached-profile writer must survive quota errors. Also pins the 2026-09-03a **ack discipline**: full-ack drains the queue / silent-200 keeps the queue / partial-ack keeps the queue.
- `test_auto_archive_analytics.js` — `splitAnalyticsForArchive` (700-trigger, 90-day sessions, 500-recent retention), fail-safe archive-then-trim, and `applyEventsWithAck` (added vs duplicate ack lists) — the server-side contract the client relies on.
- `test_sr_once_per_session.js` — SR state written ONCE per session at first check; failure interval rules; leech handling; 1-in-5 new material.
- `test_round_e_dedup.js` — due-status beats new material; E1 favors current page / E2-E3 avoid it; no repeat pairs in a session. Since 2026-09-08a also pins **Rule5 (cooldown floor: all-cooldown pool still serves 3 least-overdue pairs, never null)** and **Rule6 (`normMatchText` whitespace/case normalization)**.
- Since 2026-09-08a `test_session_flush_deadline.js` additionally pins the **sticky page-advance** (`csPendingPageAdvance` persists, `reapplyPendingPageAdvance()` restores pre-check, `updateStudent` re-sent until confirmed) and the **`queueDrain` login report** (backlog counts + oldest timestamp + pending SR/increment flags; silent on a clean device).
- `test_session_flush_deadline.js` is numbered by **block**, and blocks 7–9 pin the three 2026-09-16 sync rounds (test file :597, :639, :659):
  - **Block 7 — blocker-era hardening:** the 500-event backpressure cap, the 200-event flush chunk, the stringify guard, foreign-`ownerId` dropping, and the save-blocked banner trigger.
  - **Block 8 — session-first ordering:** session events must reach the head of the batch so a session ack never starves behind an exercise pile (two assertions).
  - **Block 9 — SR delta sync:** `extractSRDelta` selects only `lastSession === currentSession` entries, the `srDelta` flag rides the body, and a single-entry delta survives — the guard against the 64KB keepalive failure returning.
- `test_auto_archive_analytics.js` gained the **delta-merge contract** in 2026-09-16c (server merges a flagged delta onto stored state; an absent flag still means full replace).
- `test_speech_hygiene.js` (2026-09-04) pins that `Recorder.stop()` closes its `AudioContext` and releases references — each sentence gate builds a fresh Recorder, and leaked contexts hit iPadOS Safari's hard limit, killing the WebContent process ~5 min into a session (the "forced refresh" that looked like a network bug). Also pins `csPageHeartbeat` merging `sp*` speech breadcrumbs and carrying them through the restart diagnostic.
- **Three-way vocab filename contract** (added 2026-09-25a, in `test_asset_manifest.js`): the vocab-image naming rule exists as three *independent copies* that never call each other — `slice_vocab_sheet.js` `fileFor()` (the generator, which decides what is on disk), `asset_cache.js` `vocabImagePath()` (the prefetcher), and `game.js` `showVocabImage()` (the display). The block extracts all three expressions, evaluates them over every vocab string in the content packs, and fails if any disagrees with the generator. It exists because 2026-09-16a patched only the display copy and silently broke two images that worked.

## Preview-note integration tests

The registered-note integration is covered by `test_preview_notes_state.js`,
`test_preview_notes_api.js` and `test_preview_notes_browser.js` in the root test
chain. They pin exact existing p111 M1-M8/F1-F14 data, random page-only sampling,
durable/archival/idempotent completion, actual save-handler etag retry and SR
delta, automatic/manual placement, the iframe Chinese action, full regular
Study progression through all four non-spelling types, ordinary target credit,
partial exits, account isolation and review-library access. The browser harness
uses a loopback static server and mocked network/handwriting-recognition outcomes;
it never sends student data to live or preview APIs.

## Out-of-chain test families (not in `npm test`)

- `test_interactive_notes_poc.js` and `test_interactive_notes_poc_browser.js`
  cover the listening-only PU3 U9 p111 original four-page note. They verify every
  hotspot and its word/sentence audio, all 31 MP3 decodes, natural audio playback,
  stop/replay/speed/error handling, page zoom and 320px layout, and no model,
  microphone, progress writes or API/external calls. Browser tests expect a root
  static server at `127.0.0.1:8093`; an explicit page URL can be passed. See
  [test boundaries](../interactive-notes-poc.md). The earlier speech-specific POC
  tests were removed with that superseded interface.

- `test_new_exercises_poc_browser.js` — standalone POC browser checks. Run
  `node test_new_exercises_poc_browser.js` to use the local HTML file, or pass a
  served URL as its first argument. Uses installed Chrome and Playwright. Covers
  two-M-then-two-F sampling in Study followed by the same pattern in Game, with no
  duplicates within a presentation, reusable keys, empty-check nudges,
  per-position grading, first-failure retention, full reset, independent find/fix
  selection/spelling feedback, bin dragging, stale-timer cancellation, complete
  eight-board touch-only sessions, 320px layout and landscape. It also compares
  shell styles against the real index.html markup, verifies game reward actions
  and Study auto-advance, and checks green/red feedback in the kid-friendly theme.
  It also checks the default kid-friendly appearance, sentence font weight and
  balanced phone keyboard rows, raised feedback gradients with readable white
  letters, completion badges, independent bin check/cross states beside the icon,
  green/red bin colours, neutral crossed-out words swallowed on correct selection,
  word visibility after animation/reset and reduced-motion removal, compact bin
  touch targets, undo, reduced-motion feedback and reward clearance on short
  phones. Desktop/dark checks seed a dark
  preference so styling comparisons use the same theme as their reference.
  Screenshots go to the OS temp
  directory under `classroom-new-exercises-poc`; no production APIs are contacted.

- **`vs_*` tests** (device matrix, hitbox, boss, timer, DPR, charselect, uno-transition, promo lifecycle, …): standalone Playwright/Node scripts run ad-hoc via `node vs_<name>_test.js`. They are NOT part of the required gate — the full picture is in [Vampire Survivors](07-vampire-survivors.md). When touching VS code, run the relevant ones manually.
- **`api/` forensics & regression scripts** (`test_scorer_regression.js`, `tune_scorer.js`, `whatif_scorer.js`, …): operator tools, some requiring live DB access; never wire them into the required gate. See [Backend API](10-backend-api.md).

## Conventions

- Tests live at repo root (frontend) or `api/` (backend) — no `test/` dir. Names: `test_<topic>.js`; VS tests prefix `vs_`.
- Every new regression ships with a test that fails before the fix and passes after (this is how the stamp guard, ack discipline, and widget rules got locked in).
- No test framework — plain `node` + `assert`, PASS/FAIL lines, non-zero exit on fail (that's what makes the `&&` chain a gate).
- Playwright tests need real Chrome at the hardcoded path; jsdom tests need only `npm install` at root.

## Calendar regression suite (12 October 2026)

`npm run test:calendar` (also appended to `npm test`) runs `test_class_calendar.js`: pure schedule/target/rate rules, an in-memory Cosmos contract with snapshot reads and conditional patches, real HTTP handlers with stubbed auth/database dependencies, and jsdom running the real combined dashboard scripts. It covers 90-minute weekly classes, Beijing dates, the attended/missed target examples, manual offsets, deduplicated archived sessions, short losses, cancellation retry receipts, concurrency preserving analytics/attendance, legacy partition keys, role gating, roster changes, reschedule persistence, and repeat batch submissions including HTTP/network failures. It does not require a live database. `node test_class_calendar_browser.js` separately checks the real dashboard in Chrome against a fully intercepted mock API (no production traffic), including unchecked students remaining after a batch save, attendance rates, the profile and a mobile viewport. It writes the gitignored `screenshot_admin_calendar.png` for visual inspection.

Backend HTTP integration still requires the private `api/test_auth.js` helper and isolated local Functions/Cosmos configuration; that helper is intentionally gitignored and is absent from a fresh worktree.


## Speech collection validation (2026-10-15)

`test_speech_collection_runtime.js` covers 100 competing reservations, atomic
quota races, duplicate requests, account switching, consent refresh, skipped
acknowledgements and hung-network cleanup during the approved extension week.
The speech policy/client boundary checks reopen after the original October 19
cutoff, reject exactly at October 26 00:00 China time and still reject an
app-setting override beyond that approved date. `test_speech_capture_browser.js`
drives actual Record/Stop UI in Chrome using synthetic WAVs and checks rejected
clips without changing grading rungs. Both run in root `npm test`. The optional
real-Cosmos operator probe refuses production and cleans up only its own uniquely
named records. It measures test-container behavior, not production peak load.
See [runbook](../speech-collection-rollout.md).

## Update discipline

`test_dashboard_efficiency.js` (in `npm test`) covers compact projections, malformed legacy sessions, reduction of large exercise/SR payloads, 304 responses, changed/removed rows, unknown-revision fallback, secure-field isolation, per-student role boundaries, bounded archive batches, live/archive dedup and exact report counts. Calendar tests verify unchanged membership/horizon reads perform no generation writes and normal attendance saves do not rebuild calendars. Chrome uses the compact/delta protocol and covers conditional refreshes, lazy profile loading, no overview/archive downloads during report generation, fresh progress updates, retained filters, failure recovery and all existing report/attendance workflows.

Any agent that adds/changes a test file, changes the `test` script chain, or changes a pinned contract must update this page in the same commit. The wiki is the single source of truth; skills/memory hold only behavior rules and point here.

## Target report coverage

`test_target_reports.js` covers period choice, archive/live dedup, offsets, short losses, server cutoff, mixed-period messages, safe fields, error propagation and authorization. `test_target_reports_browser.js` runs the real dashboard in Chrome with an isolated API and exercises teacher selection, failed-fetch retry, PNG/text clipboard payloads, editable messages across navigation, ZIP/PNG downloads and mobile layout. Reminder coverage verifies all ten choices, allowed repeats, one draw per group per generation, stable copying/navigation/ZIP content, and fresh draws on regeneration. Both run in `npm test`. Browser artifacts use ignored `screenshot_*.png` names; downloads are written to the OS temp directory.

Target-report pace coverage checks all four thresholds (including exact 1/2/3), completed/over-target/expired/unset targets, fractional days and upcoming windows. Chrome verifies real canvas pixels for all bands and that report colours remain identical after time advances and the user navigates away and back.

Chrome report tests also cover manual dashboard refresh, failed-refresh retention and retry, coalesced concurrent refreshes, calendar reload, filter/sort preservation, and generation refreshing visible progress before report creation. A failed dashboard refresh must not request/export reports.

Multi-group coverage checks membership deduplication, unambiguous legacy-target binding, ambiguous periods remaining unassigned, independent attendance chronology, cancellation/carry-over isolation, cross-group overlap preservation in batch/manual targets, stale target edits, student-role denial, shared practice counts with independent offsets, and secondary-teacher reports. Chrome edits one profile to add a second group, verifies group-labelled existing targets, saves a target binding, checks the filtered roster, and confirms distinct counts in both generated group messages.

## Required mixed-exercise checks (2026-10-13)

test_non_spelling_content.js samples 400 rounds, checking variety, unique boards
and pairs, cooldown shortage fallback, future-page exclusion, proximity, unchanged
vocab, compatible SR deltas and preview/production gating.
test_non_spelling_integration_browser.js loads the actual index and all scripts,
covering five-board Study completion, native scramble/match dispatch, independent
typed grading, first-failure persistence, partial exit, stale timers, API wire
deltas, real claimReward bridging and restoration of legacy UI. Remote service
and model requests are blocked; API replies use a fake account/ack fixture, with
no student or production data accessed. Both are in npm test and may be run with
npm run test:non-spelling. Screenshots go to the OS temp folder
classroom-non-spelling-integrated. The legacy widget regression loads new scripts
in index order with ?nonspelling=0 to retain its original round scope.

Unit 1 expansion coverage checks 20/22 authored counts, exact page placement,
exclusion of rejected boards, unique scoped SR IDs and no future-page leakage.
The browser integration solves all 42 approved boards at 319px width, including
capitalized original mistakes, contractions via physical/on-screen keys, and
smart-apostrophe normalization. Unit 2 coverage adds 16/20 authored counts,
the three specifically edited M2/F9/F11 sentences, page-scoped keys and future
exclusion. Chrome solves all 36 Unit 2 boards, including three-blank boards,
at 319px width alongside all 42 Unit 1 boards. Unit 3 adds count/dedup checks for
22 M/27 F boards and a four-blank board. Chrome solves all 49 additions at 319px,
and F28 must reject replacing an already-correct "the" even when "than" is spelled
correctly, then accept its intended final token. Unit 4 coverage is described below.
Forced game fixtures cool all original sentence pairs, including leftovers from
random three-pair grouping, so a regrouped fresh board cannot displace the
intended typed exercise. Fixture IDs also include the authored unit/page scope.

Unit 4 adds 16 M/20 F boards and Chrome now solves all 163 Unit 1-4 authored boards at 319px. Study/game prefix tests cover suffix-only physical and on-screen input, immutable initials, empty submissions, CLEAR/backspace, failure feedback and timed reset, plus the second c in catch.

Unit 5 coverage checks exact per-page 3/4, 4/6 and 9/10 counts, prefix hints, distinct scoped keys, and future-page exclusion. Chrome solves all 199 Unit 1-5 authored boards at 319px, including the hinted apostrophe in let's. Unit 6 remains review-only.

Unit 6 tests enforce the 26/34 totals, per-page counts, future-page exclusion, unique SR keys and specifically approved content edits. Chrome solves all 259 Unit 1-6 authored boards at 319px, including CTRL shortcuts as sentence text, contractions, long vocabulary repair sentences and locked initials. Unit 7 remains review-only.

Unit 7 tests enforce 26/32 totals, per-page placement, future exclusion, mixed hinted/unhinted M5 blanks and the approved unhinted if/when additions. Chrome solves all 317 Unit 1-7 authored boards at 319px, including the 12-letter photographer target and longer contextual connector exercises. Unit 8 remains review-only.

Unit 8 tests enforce 23/32 totals, page placement, future exclusion, M10 removal, contracted M5/M6 answers, the edited M15 wording and three-blank M16. Chrome solves all 372 Unit 1-8 authored boards at 319px. Dedicated Study/game checks verify both contraction endings remain beside their pronouns, accept on-screen apostrophes, solve correctly and fit the phone viewport.

Unit 9 tests enforce page counts/availability, first-letter hints, the single-row Chinese New Year board, approved edits, future-page exclusion and exact Chinese translation coverage for 31 vocabulary entries plus 22 sentence scrambles. Chrome solves all 432 Unit 1-9 added boards at 319px and checks the real app translation lookup. Original page 109 fixtures remain covered separately.

test_non_spelling_startup.js reproduces the PU1 pages 24/25 crash, exercises selection on every available page of every loaded book, and covers synthetic missing book/unit/page entries without collapsing proximity indexes. Chrome presses the real Study button on PU1 U2 pages 23/24/25/26 and U9 page 111 at desktop and 319px, then renders the mixed round. External HTTP/API/model traffic is blocked. The regression runs in both npm test and npm run test:non-spelling.

The startup regression now asserts that every advertised real page has content, the exact corrected PU1/PU2 page lists, PU2 p47 selection and future-page exclusion at p46. Missing PU1 pages 24/25 are reintroduced only inside isolated test contexts to retain the crash regression. Real Study-button tests include PU2 p47 on desktop and 319px.

PU2 Unit 1 coverage enforces the approved 22 M/24 F totals and per-page counts, excluded planet items, school-clothes/rocks edits, prefix validity, unique SR keys and future-page exclusion. Chrome solves each of the 46 boards through the real widget at 319px, alongside the existing PU3 coverage.

PU2 Unit 2 tests cover the 24/28 totals, page placement, approved weekday wording/answers, locked initials, unique SR keys, future-page exclusion and the Tuesday/Monday matching correction. Chrome solves all 52 additional boards at 319px alongside PU2 Unit 1 and PU3.

PU2 Unit 3 tests enforce the 24/27 totals and page placement, M16 helmet dialogue, F5 exclusion, edited F22 sentence, prefix validity, scoped SR keys and future-page exclusion. Chrome solves all 51 additional boards through the real widget at 319px alongside earlier PU2/PU3 boards.

PU2 Unit 4 coverage checks 30 M/40 F totals and per-page placement, approved M25-M27 blanks/answers, floor/roof boards without prefixes, final-token F19-F23 repairs, valid prefixes, distinct SR keys, future-page exclusion and varied rounds. Chrome solves all 70 additions at 319px through the real widget alongside existing PU2/PU3 content.

PU2 Unit 5 coverage checks 28 M/34 F and per-page totals, revised animal/diet wording and answers, initial hints, intended repeated-token repair, unique scoped identities, future-page exclusion and round variety. All 62 additions are solved in Chrome through the real widget at 319px alongside previous boards.

PU2 Unit 6 coverage checks 23 M/29 F and per-page totals, excluded M5/F5, exact edited M13/M14 wording/full contractions, prefix validity, repeated possessive targets, unique scoped identities, future-page exclusion and round variety. Chrome solves all 52 additions at 319px alongside previous boards.

PU2 Unit 7 coverage checks 28 M/36 F and per-page totals, M1 exact edited wording/answers and two-letter prefixes, prefix validity, unique scoped identities, future-page exclusion and round variety. Chrome solves all 64 additions at 319px alongside previous boards.

PU2 Unit 8 coverage checks 29 M/39 F and per-page totals, all edited sentences/answers/prefixes, excluded M30/F40, unique scoped identities, future-page exclusion and varied rounds. Chrome solves all 68 additions at 319px alongside previous boards.

PU2 Unit 9 coverage checks 28 M/34 F, per-page totals, exact edited grammar targets/prefixes, seven-blank M14, single-sentence M13, revised feedback prompts, excluded F22/F23, unique identities, future-page exclusion and varied rounds. Chrome solves all 62 additions at 319px alongside earlier PU2/PU3 content.

PU1 Units 0-1 coverage checks all 69 approved boards, per-page totals, prefix validity, unique SR identities, varied five-board rounds, future-page exclusion and the exact M12 blanks. The real-app Chrome integration solves each added board at 319px alongside all earlier PU2/PU3 boards.

PU1 Unit 2 checks cover all 62 boards, exact per-page counts, complete unique IDs, mixed four-blank prefixes, senses grouping under page 26, contraction targets, scoped SR identities, future-page exclusion and varied rounds. All 62 additions are solved through the real app widget at 319px alongside earlier boards.

PU1 Unit 3 checks cover all 64 boards, per-page placement, complete unique IDs, prefix validity, exact inline emotion symbols, alpaca facts, product/come-comes contrasts, scoped SR identities, future-page exclusion and varied rounds. All additions are solved through the real app widget at 319px alongside earlier boards.

PU1 Unit 4 checks enforce 54 boards and per-page totals, M21/M23 exclusions, complete retained IDs, exact M16 breakfast wording with no hot-dog symbols, exact F22 grapeballs repair, three-blank and mixed-prefix boards, unique SR keys, round variety and future-page exclusion. Chrome solves every addition through the real app widget at 319px alongside earlier content.

PU1 Unit 5 checks enforce 28 M/36 F and per-page counts, complete IDs, prefix validity, simple contextual clues, the revised plurals, unique scoped SR keys, round variety and future-page exclusion. Chrome solves every addition at 319px. Dedicated Study/game checks exercise M14's longer ballo/heli prefixes, the exact suffix-only keyboard, prefix retention through backspace/CLEAR and on-screen completion.

PU1 Unit 6 checks enforce 32 M/46 F and per-page counts, exact revised M4/M6/M11/M12 wording, excluded habitat IDs, complete retained IDs, valid locked prefixes, distinct SR keys, future-page exclusion and round variety. All 78 additions solve through the real widget at 319px. Dedicated Study/game checks reject there/their/they're in the wrong grammatical roles, retain unhinted boxes and the apostrophe key, then accept the intended answers from on-screen input.

PU1 Unit 7 checks enforce 28 M/36 F and per-page counts, complete IDs, exact teacher-edited M1/M3/M4/M17 answers and hints, valid suffixes, scoped SR identities and future-page exclusion. Chrome solves all additions at 319px. Study/game suffix checks cover visible locked ming, editable-only keyboard letters, empty-check nudges, per-letter failure feedback, timed retry, backspace/CLEAR and successful full-word grading from on-screen input.


## Remote incident diagnostics (2026-10-23)

Remote diagnostics: test_client_diagnostics.js verifies strict token scoping, opt-in/expiry, sanitizing, ack/dedup, concurrency and storage bounds. test_client_diagnostics_browser.js verifies console capture, recovery after reload/delayed return, network failures, account switching, disabled behaviour and the UTF-8 payload budget. Both run in npm test.

Preview-note browser checks also verify that the library button stays hidden for
students with no completed preview, appears immediately after first completion,
and remains hidden when switching to a student on another page with no completion.

## Optional speech in notes (preview, 2026-10-28d)

`test_notes_speech_browser.js` covers the notes microphone toggle, exact target passed to the existing checker, selective green feedback, recording playback, retry, cancellation/stale results, permission denial, close disposal and 320px layout. Recognition is mocked in this UI suite; the existing target-model/recorder suites test their implementation. The regular notes integration suite also checks iframe microphone permission.

Notes recording now requires at least two lexical words (preview 2026-10-28e). Single-word selection cancels recording/checking, clears the previous recording, and disables both microphone and own-recording playback while preserving example listening. Punctuation and contractions do not create extra words. Browser coverage includes the exact two-word boundary and switching back to a multiword phrase.
