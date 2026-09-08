# Gotchas & Project History

> **Last verified:** 2026-09-04 · **Part of:** [Classroom-survivors Repo Wiki](README.md)

**Purpose:** the "don't re-break this" page. Every entry here cost a real bug, a lost deploy, or lost student data. Subsystem-specific gotchas live on their pages ([Study Mode](05-study-mode.md), [Game Modes](06-game-modes.md), [Backend API](10-backend-api.md), [Telemetry](14-telemetry.md)); this page holds the cross-cutting rules, the deploy/process discipline, and the index of historical write-ups.

## Process gotchas

1. **Deploy stamps (THE big one).** Three values must stay byte-identical: `version.json` version, `frontend_auth.js` `APP_VERSION`, `index.html` `frontend_auth.js?v=`. Drift ⇒ red "cannot save progress" banner for every user, no self-heal. Broken once (2026-08-30): `version.json` bumped, the other two forgotten; took a full Pages-deploy unstick to recover. Now enforced by `test_deploy_stamp_sync.js` (first in `npm test`) — you cannot commit drift through the normal gate. Never bump stamps for docs-only changes. See [Deployment](13-deployment.md).
2. **Never `git add -A` / `git add .`.** Stage explicit paths only. The repo carries large untracked artifacts (`api/speech_events_dump_full.json`) and gitignored secrets (`app-config.json` holds the browser app key; `api/local.settings.json`-style files hold Cosmos credentials).
3. **Ambiguous `preview` refname.** A local branch `preview` AND remote `preview/main` both exist; git warns "refname 'preview' is ambiguous". Disambiguate: `refs/heads/preview`, `refs/remotes/preview/main`.
4. **GitHub Pages wedges.** A prior 'in progress' Pages deployment blocks the next (`Deployment request failed ... due to in progress deployment. Please cancel <sha> first`). The modern Pages settings UI has NO cancel button (do NOT click "Unpublish site"). It self-resolves in ~30–90 min, or `gh run rerun <pages-run-id>` after the lock rolls forward. Don't thrash with repeated pushes. The SWA Functions deploy is a SEPARATE Actions run from the same push. See [Deployment](13-deployment.md).
5. **GFW reality.** GitHub 443 from mainland China drops connections in 1–3s; deploys and clones need retry loops (verify with `git ls-remote origin` before assuming failure). npm/pip need China mirrors (Tsinghua's was stale; Alibaba mirror works for pip).
6. **MSYS path trap (this machine).** In the git-bash environment, a `/d/coding/...` path resolves to `D:\d\coding\...` (extra `d`) and breaks tooling. Use Windows-style absolute paths.
7. **Local func host staleness.** `npx func start` does NOT hot-reload module edits — restart after code changes or it serves stale code; killing the CLI wrapper orphans the node worker holding `:7072` (free it via netstat PID → Stop-Process). See [Backend API](10-backend-api.md).
8. **Local test container ≠ prod container.** The api test suite passes against the test container, whose docs carry `studentId`; 93 legacy PROD docs don't have that field — a prod-only failure mode that local tests cannot catch. See [Data Model](11-data-model.md).

## Code-level cross-cutting gotchas

9. **Whole-doc read-modify-write is a lost-update hazard.** Any new write path to the student doc must use the IfMatch/_etag retry-merge pattern (and PK-safe point-writes) as in saveAnalytics — not bare upserts of a doc read earlier.
10. **`STUDY_STATE.active` must be reset on study-mode exit**, or the game-mode global keydown listener early-returns and physical-keyboard typing dies in minigames. See [Study Mode](05-study-mode.md).
11. **Menu hierarchy:** `startScreen` is the main dashboard; `gameSelectionOverlay` is a submenu; the study-exit X must land on the dashboard via `goBackFromGameSelection()`. Wrong directions have shipped as real bugs twice. See [Study Mode](05-study-mode.md).
12. **Depleting banks:** any code that removes a placed tile from a depleting source (Round B bank, Round D bank, game `#word-dock`) must restore the tile — a bare `.remove()` loses it forever once the dock depletes. And grammar widgets bind click handlers via delegated listeners only. See [Game Modes](06-game-modes.md).
13. **Names lie:** Round B = word scramble; Round C = spelling (10-key); game `spelling` minigame = letter-based word scramble; game `scramble` = sentence reorder. Re-derive from code. See [Study Mode](05-study-mode.md)/[Game Modes](06-game-modes.md).
14. **Tailwind CDN console warning is harmless** (local `lib/tailwind.js`); **iPadOS Safari masquerades as Macintosh** — use `maxTouchPoints > 1` to disambiguate (device events already do).
15. **`?v=` cache busters:** every `<script src>` carries one; the auth stamp uses the deploy version, others use per-file counters/dates. When shipping a JS fix users must pick up, bump that file's `?v=` (and the three stamps per rule 1 for `frontend_auth.js`).
16. **A null selector pool must never dead-end a session.** Success doubles SR intervals, so long-term students eventually put everything on cooldown — serve least-overdue cooldown items (the floor in `sortPoolBySR`/`pickWithNewQuota`) instead of returning null. See [Study Mode](05-study-mode.md).
17. **CHECK handlers compare display text with `normMatchText`, never strict equality.** Tile HTML interpolation adds invisible whitespace; strict `===` can fail a visually-correct placement forever with no error shown. See [Study Mode](05-study-mode.md).

## Historical write-ups (repo root)

Context-rich incident documents. The wiki distills their conclusions; read the originals for full detail.

| File | Topic |
|---|---|
| `DEPLOY_VERSION_STAMP.md` | Root-cause writeup of the 2026-08-30 stamp-drift banner incident + bump discipline |
| `HANDOFF_SESSION_REFRESH_FIX.md` / `HANDOFF_SESSION_FIX_FULL.md` / `SESSION_REFRESH_ROOTCAUSE_2026-08-25.md` | 2026-08 session-refresh / forced-refresh saga (login beacon, flush primitives) |
| `HANDOFF_SESSION_REFRESH_FIX.md` R7–R9 | 2026-09 silent-200 → lost-update race → all-cooldown/page-43/stuck-CHECK incident set (per-event acks, IfMatch retry, cooldown floor, sticky advance, `normMatchText`, `queueDrain`) |
| `PROJECT_STATE_HANDOFF.md` / `PROJECT_HANDOFF_2026-07-29.md` | Point-in-time project state snapshots (July 2026) |
| `SECURITY_AUDIT_HANDOFF.md` | Security audit: token transport, plaintext-password trade-off, app-key threat model |
| `TD_HANDOFF_QODERCN.md` | Tower Defense handoff (modes, gating, timers) |
| `docs/superpowers/specs/2026-07-25-three-td-poc-design.md` | Tower Defense PoC design spec |
| `MINIGAME_TIMER_FEATURES.md` | Minigame timer features spec |
| `TEACHING_CONTENT_RESTRUCTURE.md` / `TEACHING_CONTENT_CHANGES.md` | Content-pack restructure history |
| `boot_refactor_plan.md` | Boot sequence refactor plan (gitignored scratch, may be absent) |
| `HANDOFF_SESSION_REFRESH_FIX.md` round 6+ | Telemetry forensics handoffs (silent-200, ack discipline) |

> Adding a new root handoff doc? Add it to this table in the same commit, and put its durable lesson on the relevant subsystem page. Aim to *close out* handoffs by distilling them into wiki pages — the root should not accumulate undying docs.

## Research archaeology (for archaeologists only)

The repo also contains one-off experiment/test scripts preserved for archaeology: `vs_transition_repro.js`, `vs_bat_check.js`, `vs_antiflee_check` family, `api/check_db*.js`, `api/test_flow.js` etc. They are not production code and not in the test gate; check [Vampire Survivors](07-vampire-survivors.md) and [Backend API](10-backend-api.md) indexes before deleting or imitating them.

## Update discipline

Any agent that discovers a new cross-cutting gotcha, ships a fix for something documented here, or adds a root handoff doc must update this page in the same commit. The wiki is the single source of truth; skills/memory hold only behavior rules and point here.
