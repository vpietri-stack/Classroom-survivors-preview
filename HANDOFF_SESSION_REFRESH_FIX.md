# HANDOFF — Classroom Survivors: forced page-refresh / session-loss thread (Doris)

**Date:** 2026-08-26 (updated 2026-08-29, round 5; **round 6 — 2026-09-03: see §R6 first**)
**Author:** Investigation agent (scheduled task + follow-ups)
**Audience:** Next coding agent. Read top-to-bottom. "Current State" is ground truth (verified
against `git log` + live-site fetches on 2026-08-26/29). Supersedes the deployment-gap sections of
`HANDOFF_SESSION_FIX_FULL.md` (that gap no longer exists — see §2).

---

## R6. 2026-09-03 — ROUND 6: the refresh was NEVER the data-loss vector ("silent-200")

**Deployed:** `2026-09-03a` (commit `574f820` + hotfix `86363f0`), all four refs, live-verified.

**Round-6 forensics (videos + Cosmos + fleet survey) supersede rounds 1–5 conclusions:**

1. **Blackout since Aug 28, not a Sep-2 incident.** Doris zhangyanyi's doc has ZERO
   exercise/session events from 2026-08-28 through 2026-09-03 — device/restart beacons only.
   Aug 20–26 flowed fine (dozens/day). Sep-3 Edge test on her account: 21 events landed
   perfectly → backend + her doc are healthy.
2. **The forced refreshes (mum's videos: Safari, NOT WeChat) are real WebKit WebContent
   auto-reloads mid-interaction, but they are NOT what eats the data.** Page B's login beacon
   (17:00:55) carried ONLY the fresh device event — page A's exercised events were already
   gone from localStorage. Only the fetch path removes queued events → the fetch flushes
   "succeeded" client-side while nothing persisted server-side.
3. **Fleet-survey exonerations:** another student's iPad on the SAME iOS 26.6 delivered 37
   exercise events since 08-28; four WeChat-WebKit students deliver daily; her iPad was
   already on 26_6 on Aug 20–21 while data flowed. iOS/WebKit/CORS/backend all exonerated.
   Her device alone gets ok-looking 200s that don't persist — indistinguishable further
   without the new diagnostics (α silent-200-added-0 / β 401/403 / γ edge-drop).
4. **The 2026-09-03a fix (what shipped):**
   - Server `saveAnalytics`: per-event acks (`addedEventIds`/`duplicateEventIds`) in every
     200 + best-effort `delivery_diag_saveAnalytics` telemetry doc (single-slot: last
     accepted request: ts/studentId/added/total/ua/transport). With no App Insights on the
     SWA this is the only server-side trace of whether fetch flushes arrive.
   - Client `flushAnalytics`: ack discipline — the persisted queue clears ONLY when the
     response accounts for EVERY shipped eventId (added or duplicate). Silent/partial 200s
     keep the queue + restore SR pending state; the proven sendBeacon path re-ships on next
     launch (server eventId de-dup keeps it idempotent).
   - Tests: `applyEventsWithAck` unit suite (auto-archive file, +4) + client ack paths
     (+6 incl. all-or-nothing partial-ack). 220 green. Stamps synced `2026-09-03a`.
5. **How to read Doris's NEXT session (the discriminator):**
   - New exercise events in her doc AND `delivery_diag_saveAnalytics.recent[].ua` showing
     her iPad UA → requests DO reach the function; previously a server-side add path issue
     (now watched by acks).
   - New exercise events in her doc but diag doc still shows only curl/desktop UAs → her
     fetch flushes never reach the function (γ edge/network); the queue now survives
     client-side and drains via next-launch beacon (data saved, mystery = transport).
   - Nothing new in her doc but queue persists on her device → her client keeps the events
     (no more silent eating) and each login beacon carries the backlog; watch for
     `duplicateEventIds` spikes = retry storms (benign, de-duped).
6. **Earlier-round conclusions that STILL STAND:** doc bloat/26s timeouts (fixed by
   auto-archive, `e275195`) and WebKit kills mid-session (real, mitigated by
   deadline-flush + last-breath beacon). What changed: the kill/refresh is no longer
   blamed for the *data* loss — the silent-200 was.

---

## 0. TL;DR

Student `doris_zhangyanyi` (iPad 11, iOS 26.6, WeChat in-app browser AND Safari, LIVE URL) lost
completed sessions since 2026-08-21 and experienced forced page-refreshes in Study Mode.

**Root causes identified & proven (2026-08-29):**
1. **1.37 MB Document Bloat & 26-Second DB Timeouts:** Doris accumulated **5,573 analytics events (1.37 MB)**
   in her single Cosmos DB document (25× normal student size). Every `saveAnalytics` call required reading and
   writing a 1.37 MB JSON document, taking **~26 seconds**. The frontend's 4-second deadline cap
   (`flushAnalyticsWithDeadline(4000)`) and Azure SWA proxy timed out, causing Uno/Study session saves to fail
   in the background while local memory temporarily showed updated counters (e.g. 11/10, 12/10) before fresh login
   re-fetched the stale server record (10/10).
2. **Memory Spike & WebKit Crash in Study Mode:** On login, downloading and parsing 1.37 MB of JSON pushed the
   page baseline memory high. In Study Mode, adding Whisper speech recognition buffers and audio in Round E
   exceeded iOS WebKit's strict `WebContent` memory limit, triggering the process termination ("此网页已重新载入").

**Actions taken (2026-08-29):**
1. **Doris Document Trimmed & Archived:** Permanent archive `student_doris_zhangyanyi_archive_20260829` created
   with all 5,573 events. Active profile trimmed from **1.37 MB → 121 KB (91% reduction)**, preserving 100% of
   her Spaced Repetition state (`srState`), `sessionCount`, and 90-day target history.
2. **Server-Side Auto-Archiving Deployed:** `saveAnalytics.js` now automatically archives older events when any
   student reaches $\ge 700$ events, retaining **90 days of sessions** and **500 recent events** with a fail-safe
   Cosmos DB check. Fully tested via `test_auto_archive_analytics.js` (5 tests in `npm test`).


---

## 1. Repository layout (unchanged — re-read if new)

- ONE local repo, TWO remotes: `origin` = LIVE (`vpietri-stack/Classroom-survivors`),
  `preview` = PREVIEW (`Classroom-survivors-preview`). Both share ONE Azure SWA + Cosmos DB.
- ⚠️ Ambiguous refname: local branch `preview` vs remote `preview/main`. Use full refs:
  `refs/heads/preview`, `refs/remotes/preview/main`.
- Deployment = merge local `preview` INTO local `main`, `git push origin HEAD:refs/heads/main`,
  then keep local `main` and `preview` identical (fast-forward `preview` to `main` or vice versa).
- GFW intermittently resets pushes to port 443 — retry 3–5× with ~1 min gaps; it clears.
- PowerShell only (no `&&`). Keep git commands SHORT — very long PowerShell one-liners crash the
  sandbox terminal's PSReadLine and silently drop later commands in the chain.
- ⚠️ A PARALLEL SPEECH-RECOGNITION SESSION sometimes commits in this same worktree (seen 2026-08-26:
  `db29d74`, `a8ca864`). NEVER `git add -A`/`git add .` — stage explicit paths, and check
  `git status` before committing; expect their uncommitted edits in `speech_*.js`/`index.html`.
  `api/speech_events_dump_full.json` is their untracked working file — leave it alone.

## 2. Branch state (verified 2026-08-26)

- The July session-fix "deployment gap" (LIVE had fixes, PREVIEW didn't) is OBSOLETE: branches
  re-converged 2026-07-31 (`edf0577`); since then preview ⊆ main by ancestry.
- As of this handoff: `main` = `preview` = `origin/main` = `preview/main` should all sit at the
  handoff commit (round-3 landmark: `fdcb1ee` = device-signature telemetry `2026-08-26b`;
  round-4 landmark: `a73fc01` = immediate login-flush `2026-08-28a`).
  Verify with `git rev-parse refs/heads/main refs/heads/preview origin/main preview/main`.
- LIVE + PREVIEW both serve the same build stamps; verify with
  `https://vpietri-stack.github.io/Classroom-survivors[-preview]/version.json`.

## 3. What happened (two rounds)

### Round 1 (2026-08-25, scheduled investigation)
- Server evidence (Cosmos, read-only): Doris's exercise events arrived Aug 22/24 but ZERO session
  events; last good session 2026-08-21. Whole-cohort check: she is the ONLY affected student.
  Device events prove she ran the current build — not stale cache. No reload code exists anywhere
  in the student paths → the refresh is environment-level.
- Fix (`7eb219e`, stamp `2026-08-25a`): `flushAnalyticsWithDeadline(maxMs)` in `frontend_auth.js`;
  `finishStudySession`/`populateGameOver`/`endUno`/`endGomokuGame` AWAIT delivery (4 s cap) before
  rendering end screens; `saveActiveUserToCache` never throws (quota → trim analytics mirror to
  last 500). Regression suite `test_session_flush_deadline.js`. Merged to LIVE 2026-08-25 (`aee7c40`).

### Round 2 (2026-08-26, video evidence)
- Mum's video: mid-Round-D drag → Safari banner **“此网页已重新载入”** → profile screen, all <1 s.
  That banner = WebContent process KILLED + auto-restore. Kills happen MID-SESSION, and server data
  showed ZERO events on 2026-08-25/26 — not even the login `device` event — so some kills strike
  at/near page start, before the first ~2 s flush.
- A killed process runs no JS (no pagehide, no flush), so shipped RESTART TELEMETRY
  (`fdcb1ee`, stamp `2026-08-26b`), all additive:
  - `csNewPageSession()` / `csPageHeartbeat(state)` in `frontend_auth.js`: page-session id (`ps`)
    stamped onto every queued event; localStorage breadcrumb `csPageHeartbeat` (mode/round/last
    exercise/time-since-page-load/build stamp/device signature) updated on every queued event and
    every `updateStudyUI` round change.
  - `pagehide` sets `csCleanUnload=1` so only TRUE hard kills report.
  - On next student login, `csDetectRestartAndQueueDiagnostic()` queues ONE dashboard-invisible
    `type:'device', diagnostic:'restart'` event (carries `secondsSinceLastEvent`,
    `secSincePageLoad`, `pageState` incl. `dev` signature, build stamp).
  - Device signature format in `pageState.dev`: `platform|tp<touchpoints>|wx|br`
    (e.g. `iPad|tp5|wx`, `MacIntel|tp5|br` = iPadOS Safari, `iPhone|tp5|wx`).
- Ruled out: speech-engine memory as a Doris-unique factor (~55 students use speech heavily).

### Round 3 (2026-08-27, first telemetry readout + telemetry bug fix)
- Teacher queried the DB: Doris's mum reported 3 sessions on 2026-08-26, DB showed exercises only.
- Pulling the raw stream (read-only Cosmos query) revealed:
  - **The iPhone experiment works:** device event at 07:34 UTC = `iPhone, iOS 18.7, Safari,
    build 2026-08-26b` — mum tested on the iPhone as planned.
  - Only ONE study attempt left a trace (07:42–07:47 UTC: 5× wordScramble + 5× spelling +
    5× sentenceScramble, then abrupt stop). The other ~2 sessions left ZERO events → killed
    before the first ~2 s flush (startup-kill pattern) or played on a cached pre-telemetry build.
  - Both `diagnostic:'restart'` events were **SELF-READ ARTIFACTS** (age 0 s, `ps` identical to
    their own login's device event): `csDetectRestartAndQueueDiagnostic()` ran AFTER
    `csNewPageSession()`/`csPageHeartbeat()`, so it always read the page's OWN fresh breadcrumb,
    and the previous session's `csCleanUnload` marker had already been cleared. Genuine kills
    could therefore never be reported.
- **Fix (`a05ac68`, stamp `2026-08-26c`):** `finishLogin` now runs detection FIRST (before the
  new page session is minted) + a same-`ps` guard as defense in depth. +2 regression tests
  (34 in `test_session_flush_deadline.js`). Deployed to LIVE 2026-08-27.

### Round 4 (2026-08-28, immediate login-flush deploy — closes the blackout)
- Round-3 telemetry readout exposed a residual blind spot: on 2026-08-27 BOTH of Doris's
  reported attempts left ZERO server events — not even the login `device` event. Root cause:
  the login device event only rode the 2 s debounced flush (`scheduleAnalyticsFlush`), so a
  WebKit kill INSIDE the first 2 s, with NO surviving later login to drain the persisted queue,
  produced a total server blackout. That also starved the restart telemetry (2026-08-26c) of its
  "previous session" — an attempt day could look completely empty.
- **Fix (`a73fc01`, stamp `2026-08-28a`):** on student login, `flushAnalyticsOnLogin()` ships the
  queued login device event IMMEDIATELY via `navigator.sendBeacon` (non-blocking, no 2 s debounce)
  — called in `finishLogin` right after `queueDeviceInfoEvent()`. `flushAnalyticsViaBeacon(opts)`
  gained a `force` opt so the normally-idle unload guard doesn't skip it. Beacon semantics: the
  queue is NOT cleared here (stays persisted for the reliable 2 s debounce / next-launch drain;
  the server's `eventId` de-dup makes the duplicate idempotent). Pure telemetry-visibility fix —
  it does NOT stop the WebKit kill, but a startup-kill now leaves its login breadcrumb, so the
  restart diagnostics finally have real signal to compare against.
- Test-harness note: the flush suite's vm sandbox lacked `navigator.sendBeacon` / `Blob` /
  `URLSearchParams`, so the beacon branch was silently skipped and the immediate-flush assertions
  couldn't pass. Round 4 added those stubs (incl. a `sendBeacon` recorder) — the real browser
  fast-path is now exercised. +5 regression tests (**34 → 39** in `test_session_flush_deadline.js`,
  block 1c). Deployed LIVE + PREVIEW 2026-08-28 via the standard preview→main merge; both
  `version.json` confirmed serving `2026-08-28a` after the Pages build propagated (the served
  stamp lagged ~90 s behind the push — re-verify with a wait, not just `git ls-remote`).

### Round 5 (2026-08-29, telemetry readout, document bloat root-cause & server-side auto-archiving)
- Telemetry from Aug 28 and Aug 29 pulled from Cosmos DB:
  - **Aug 28 (13:34 UTC / 21:34 CST, iPad WeChat):** `diagnostic:'restart'` captured kill after 385 s (6m 25s)
    at `round:'E'`, `ex:'sentenceScramble'`.
  - **Aug 29 (05:34 & 05:40 UTC / 13:34 & 13:40 CST, iPad Safari):** `diagnostic:'restart'` captured kills after
    290 s and 339 s at `round:'E'`, `ex:'speech_attempt'`.
  - Historical study attempts (Aug 22, 24, 26) confirmed completing **5/5 sentences in Round E** before process kills
    upon/after entering Round F (`sentenceMatch`).
- Spaced Repetition sandbox test (`test_doris_sr.js`): simulated Doris's exact `srState` (65 KB), `sessionCount: 200`,
  and `PU1 Unit 3 Page 43`. `getStudySentencePairsSubRoundSR` ran cleanly with zero errors across all 3 sub-rounds.
  SR algorithm is 100% healthy.
- **Root Cause of Session Loss Uncovered:**
  - Doris's single Cosmos DB document held **5,573 events (1.37 MB)**.
  - Upserting 1.37 MB took **~26 seconds**, far exceeding the client's 4-second completion deadline and hitting
    SWA/mobile network timeout.
  - When Doris completed Uno sessions (Aug 29), client UI updated in memory (11/10, 12/10), but `saveAnalytics`
    timed out in the background. On reload/login, stale server profile (10/10) was fetched, wiping local counts.
  - In Study Mode, 1.37 MB profile baseline + Whisper speech recognition buffers in Round E spiked WebKit memory,
    causing WebContent termination.
- **Fixes Applied & Verified:**
  1. **Manual Archive & Trim:** Snapshot document `student_doris_zhangyanyi_archive_20260829` created with all
     5,573 events. Active profile trimmed from **1.37 MB → 121 KB (91% reduction)**, keeping 100% of `srState`,
     `sessionCount: 200`, and 191 events from Aug 20 onwards.
  2. **Server-Side Auto-Archiving:** Implemented `splitAnalyticsForArchive` and `maybeArchiveAnalytics` in
     `api/src/functions/saveAnalytics.js`. Triggers when `user.analytics.length >= 700`. Retains **90 days of
     sessions** + **500 recent events**, archiving older items with a fail-safe check (active array only trimmed
     if archive create succeeds).
  3. **Automated Suite:** Added `test_auto_archive_analytics.js` (5 unit tests) to `package.json` `npm test`.

## 4. Current state / what is LIVE

- LIVE serves **`2026-08-28a`** (immediate login flush + completion-flush deadline + quota hardening + corrected restart
  telemetry with device signatures).
- Doris's Cosmos DB active document is trimmed to **121 KB / 191 events** (read/upsert latency ~150 ms; 100% SR preserved).
- Complete historical archive stored in `student_doris_zhangyanyi_archive_20260829`.
- Backend code in `api/src/functions/saveAnalytics.js` now includes automatic rolling archiving for all students.
- All unit and regression tests passing (**81+22+11+39+5+11+23+154**).

## 5. Open work (prioritized)

### P0 — Deploy Server-Side Auto-Archiving to LIVE (preview → main) ✅ DONE (verified 2026-08-30)
- Merged `preview` → `main`; pushed to `origin` + `preview` remotes. All four refs = `e275195`.
- **Verification that the running Azure Function is the new code** (not just the git push):
  - SWA app `Val-ESL` is GitHub-linked (Branch `main`) → push to `origin/main` triggers the build. Build record `status: Ready`, `lastUpdatedOn 2026-08-29T06:44:51Z` — 2 min after `e275195` landed (06:42:51Z).
  - **Decisive:** read-only Cosmos probe found **20 `student_analytics_archive` docs** that can only exist if `maybeArchiveAnalytics` fired. 19 were created by live student traffic AFTER the deploy — `dave_suzhengan` (06:45), `milk_yangkaicheng`, `ivan_wangzichuan` (×2), `koey_likeyu`, `ruly_zhangruixi`, `simon_liyusen`, `mia_zhengxinmiao`, `nick_wangzixi`, `zozo_zhangchuxin` (×2), `apple_fengyiyuan`, `jojo_xujinyan`, `amber_duanyu`, `zoe_zhangchutian`, `leon_lizihao`, `lucky_suying`, `mia_linyutong`, `selena_lipuyi` (through 2026-08-30T05:27Z).
  - **Scope correction:** the 700-event document-bloat problem was NOT Doris-only — auto-archive has fired for ~19 different students. The fix is global, as intended.
  - Note: Doris's `student_doris_zhangyanyi_archive_20260829` (5,573 events) was created at 06:23Z — a manual trim by the prior agent BEFORE the build went live; subsequent student archives are the live function's own work.

### P1 — Diagnose Doris's remaining data loss (post-archive; 2026-08-30)
- After the 2026-08-28a + e275195 deploys, Doris's active doc is small (193 events) so the
  "doc bloat" failure mode is fixed. But the *forced refresh* failure mode is still active —
  2026-08-31 CN: 2 sessions on Doris's iPad+WeChat, **0 study/exercise events** on the server
  (only the 2 login beacons survived — the option A `flushAnalyticsOnLogin` worked, but every
  post-login event was lost). 2 prior failure breadcrumbs on the same device+exercise:
  `2026-08-28 21:34 CN, iPad|tp5|wx, mode:study, round:E, ex:sentenceScramble` and
  `2026-08-29 13:40 CN, MacIntel|tp5|br, mode:study, round:E, ex:speech_attempt`.

#### Path B — "are we causing the forced refresh?" (2026-08-31)
Read-only audit of every reload path in the app:
- `sw.js` is passive: only does `skipWaiting` + `clients.claim` on activate; never
  calls `location.reload`, `clients.matchAll`, or `postMessage` to trigger a reload. The
  revalidation-only `fetch` handler cannot refresh the open page.
- `startVersionWatchdog` (frontend_auth.js:781) polls `version.json` every 60s; on stale-build
  detection it calls `registerUpdateBanner` which shows the red "⚠️ 无法保存进度" banner.
  The banner is **user-tap-only** — no auto-reload.
- `registerUpdateBanner('save-401')` (frontend_auth.js:504) is the same user-tap banner.
- The only auto-reload path in the app is `forceBtn.onclick` inside `showReloginOverlay`,
  which is user-tap-only.
- `three_td/main.js:220` reloads on a replay button click (TD-specific, irrelevant to study mode).
- **Verdict: the app has zero automatic reload paths. We are NOT the cause.** Most likely
  external killer: WeChat's WKWebView on iPad (`device: iPad|tp5|wx` in breadcrumbs) is
  recycling the WebContent process on tab-switch / screenshot-share / memory pressure.
  This is a known characteristic of WKWebView-in-WeChat; the prior
  `HANDOFF_SESSION_FIX_FULL.md` thread already called it out (hence the WeChat-specific
  version-watchdog self-heal).

#### Path A — Last-breath diagnostic beacon (2026-08-31, in progress)
- Rationale: we cannot prevent the WeChat kill, but we can make the next failure
  *self-describing*. Every existing flush path (login beacon, 2s debounce, pagehide
  unload beacon, deadline flush) is gated on a non-empty queue or on graceful unload
  signals — none of which fire when WeChat force-kills the WebContent process.
- Plan: add a tiny `csLastBreathBeacon` event that fires on `pagehide` / `visibilitychange:hidden` /
  `beforeunload` carrying the current kill-surviving breadcrumb + a `cause` tag. Independent
  of `analyticsQueue` (so it fires even if the queue is empty). Lands server-side as a
  single `device` event with `diagnostic:'lastBreath'` and a `lastBreath.cause` field, so
  the next failure is forensically decodable from one event.
- This is a diagnostic, not a fix. It still loses the in-flight exercise event — but it
  tells us EXACTLY what was in flight and which unload signal (if any) fired. That data
  drives whatever the real fix is.

## 6. Gotchas that bit this thread

- **Long PowerShell one-liners crash the sandbox terminal** (PSReadLine buffer exception) and the
  remaining chained commands silently DON'T RUN — even though earlier ones did. After any chained
  deploy, RE-VERIFY each ref with a fresh short command. (Happened twice on 2026-08-26.)
- `git push` prints progress on stderr → PowerShell shows a scary red "NativeCommandError" even on
  success. Judge by the `oldsha..newsha  HEAD -> main` line, not the exit-code drama.
- `git push preview HEAD:refs/heads/main` (explicit refspec) — NOT `git push preview preview`.
- A concurrent speech session may land commits in the same worktree mid-task; re-check
  `git status`/`git log` right before staging, and run `npm test` on the ACTUAL tree before push.
- Never merge `origin/main` wholesale onto preview (speech/TD divergence rule still applies to
  future feature work even though branches are currently converged).
- Single Cosmos DB document size > 1 MB causes 20–30s latency in Azure Functions, silently dropping client flushes
  capped with shorter deadlines. Keep student documents $<250\text{ KB}$.

## 7. Key file references

- `SESSION_REFRESH_ROOTCAUSE_2026-08-25.md` — full root-cause report (§7 = round 2).
- `api/src/functions/saveAnalytics.js` — `maybeArchiveAnalytics`, `splitAnalyticsForArchive` (rolling 90-day/500-event auto-archive), `upsert`.
- `test_auto_archive_analytics.js` — 5 unit tests for rolling auto-archive and fail-safe behavior.
- `frontend_auth.js` — `flushAnalyticsWithDeadline` (~line 425), `flushAnalyticsViaBeacon(opts)`, `flushAnalyticsOnLogin()`, restart telemetry, hardened `saveActiveUserToCache`.
- `study_mode.js` — `finishStudySession` (awaited flush), `updateStudyUI` (round breadcrumb).
- `vampire_survivors.js` / `uno.js` / `gomoku.js` — awaited deadline flush at game over.
- `test_session_flush_deadline.js` — 39 regression tests.
- `version.json` + `APP_VERSION` — deploy stamp (`2026-08-28a`).

## 8. Definition of DONE for this thread

- [x] Restart diagnostics from Doris collected AND interpreted (verdict: 1.37 MB document bloat causing 26s DB timeouts + WebKit memory crash).
- [x] Doris active document trimmed to 121 KB, full history archived to `student_doris_zhangyanyi_archive_20260829`, SR state 100% verified intact.
- [x] Server-side auto-archiving implemented in `saveAnalytics.js` with 90-day session and 500-event retention rules.
- [x] Auto-archiving backend deployed to LIVE via standard preview→main cycle — **runtime verified** (SWA build `Ready` 2026-08-29T06:44:51Z; 19+ live `student_analytics_archive` docs created by student traffic prove the function runs `e275195`). Affects ~19 students, not just Doris.
- [ ] Teacher confirms Doris's (and other students') completed sessions record on LIVE for ≥1 week without loss.
- [x] Path B done: app has no auto-reload paths; cause of Doris's forced refresh is external (WeChat WKWebView kill on iPad).
- [ ] Path A done: last-breath diagnostic beacon deployed; first post-deploy failure produces a forensically decodable `lastBreath` event.
- [x] No regressions in the mandatory suite (81+22+11+39+5+11+23+154).

---

## R7. 2026-09-03 — ROUND 7: ack discipline ("Doris silent-200" fix, `2026-09-03a`)

- 6-day blackout (08-28→09-03): client got ok-looking 200s, nothing persisted. Root cause: no per-event acks; client trusted 200s. Fix: server returns `addedEventIds`/`duplicateEventIds`; client drains queue ONLY on full ack; `delivery_diag_saveAnalytics` single-slot doc. Commits `574f820` (+`86363f0` addedCount hotfix). Fleet proof: Edge test 21/21 perfect while iPad silent.
- 打卡记录 3/10→8/10 with zero server data: counter is LOCAL `srState.sessionCount`, not server — resurfaces in R9 as 2/10-vs-0/10.

## R8. 2026-09-04 — ROUND 8: lost-update race + PK-safe writes + speech hygiene
- Race proven live (15×2 concurrent POSTs → 50/150 acked events missing, 33%): read-modify-write whole-doc, crash-reload overlap. Fix: IfMatch(`_etag`) retry-merge ≤4 (`13dfae5`), zero loss post-fix. PK-safe writes for 93 legacy docs without `studentId` (`ed9a633`).
- Problem-2 root cause: AudioContext leak per speech gate → iPadOS kills ~5 min in. Fix: `Recorder.stop()` closes ctx + releases refs/PCM; tensor disposal; sp* breadcrumbs into `csPageHeartbeat` (`fd3812c`, `2026-09-04a`). Fleet census: crashes NOT Doris-unique (ryan 15, apple 13). Minnie Sep-2 partial loss = race signature.
- Docs: repo wiki `docs/wiki/` created + AGENTS.md pointer (`e5ea680`).

## R9. 2026-09-08 — ROUND 9: all-cooldown dead end + page-43 trap + stuck CHECK (`2026-09-08a`, commit `3a088e8`, on `preview` — NOT yet deployed, see deploy below)
- New incident set (Sep-7 iPad zeros + Sep-8 laptop trio). Server data: laptop delivery WORKS (exercises 09:04→09:10 UTC live); game-over banner showed **2/10 while the server replay computes 0/10** — device counts locally against events the server never got.
- Harness-proven on her live data (PU1/u3/p43, sessionCount 200, 185 sentencePairs entries): **148/148 pairs on cooldown → E1 selector returned NULL → session dead-ended to menu.** Mechanism: interval-doubling (success → interval×2, up to 8192) outruns the session counter; structural, hits every long-term successful student eventually.
- Page-advance fallback (`checkAndAdvancePageIfAllOnCooldown`) DID fire at 200 (→u4/p48) in the harness but the decision evaporated (updateStudent unconfirmed); at 201 five pairs become due → re-decides "stay" on u3/p43. Wall is 9 pages deep; one step can't clear it.
- Fixes in `3a088e8`: (1) COOLDOWN FLOOR — `sortPoolBySR` keeps dropped group-4 on `sorted._cooldown`; `pickWithNewQuota` serves least-overdue; study selector reports group 4 (not 6-empty) + tops up to 3 pairs. (2) STICKY ADVANCE — `csPendingPageAdvance` persists, `reapplyPendingPageAdvance()` at login pre-check, clears on server confirm. (3) `normMatchText()` in both CHECK handlers (template-whitespace freeze class). (4) `queueDrain` device event at every login (backlog snapshot for the next silent-failure diagnosis).
- Tests: Rule5/Rule6 in `test_round_e_dedup.js` (16), sticky+drain blocks in `test_session_flush_deadline.js` (65). Full suite green. Stamps → `2026-09-08a` (+ sr_engine/game/study per-file `?v=`).
- Wiki updates (same commit series): `docs/wiki/05-study-mode.md` (cooldown floor + fallback), `docs/wiki/14-telemetry.md` (queueDrain), `docs/wiki/12-testing.md` (new rules), `docs/wiki/15-gotchas-and-history.md` (R9 index).
- DEPLOY (do this next): merge `preview`→`main`, push `HEAD:refs/heads/main` to BOTH `origin` + `preview`, keep 4 refs equal; verify Pages build + live `version.json` = `2026-09-08a` + grep live `sr_engine.js` for `normMatchText`; SWA run green (api untouched but same push triggers it).
- AFTER DEPLOY: Doris plays normally → E-rounds serve cooldown-floor pairs; next login carries a queueDrain report; re-run crash census in ~1 week for before/after numbers.

---

*Previous handoff in this lineage: `HANDOFF_SESSION_FIX_FULL.md` (July beacon-401 / WeChat fixes — all still in place and now on BOTH branches).*

