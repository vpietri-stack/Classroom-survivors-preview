# AGENTS.md — READ THIS FIRST (any agent touching this repo)

You are working in **Classroom-survivors** (a vanilla-JS ESL web game + Azure
Static Web Apps Functions backend, deployed to GitHub Pages). Before editing
code, shipping a fix, or running a deploy, internalize the two hard rules below.
They are enforced by tests, but the tests only catch you *after* you drift — read
this so you don't drift in the first place.

---

## 📚 REPO WIKI — `docs/wiki/` (load before ANY work)

`docs/wiki/` is the **single source of truth** for what this project is and how
it works: architecture, subsystems, data model, API, telemetry, testing,
deployment, and the don't-re-break-it gotchas/history page. **Start with
`docs/wiki/01-overview.md`** (it routes you to the right page per task).

**Update discipline:** any agent that changes code covered by a wiki page must
update that page in the same commit. Architecture changes, new API endpoints,
new localStorage keys, new event types, new tests, deploy-process changes, and
post-incident lessons all belong there. Root-level `*_HANDOFF*.md` write-ups
must be indexed in `docs/wiki/15-gotchas-and-history.md` and ideally distilled
into the wiki (the root should not accumulate undying docs).

---

## ⛔ RULE 1 — Deploy version stamps MUST stay in sync (or ALL users get a red banner)

There are **THREE** stamps that must be byte-identical after every deploy:

| File | Field | Example |
|------|-------|---------|
| `version.json` | `"version"` | `"2026-08-30a"` |
| `frontend_auth.js` | `const APP_VERSION = '...'` | `'2026-08-30a'` |
| `index.html` | `<script src="frontend_auth.js?v=...">` | `?v=2026-08-30a` |

**Why:** `startVersionWatchdog()` (frontend_auth.js) polls `version.json` every
60s; if the live version is **greater** than the running `APP_VERSION`, it shows
`registerUpdateBanner()` → a **red bottom banner** ("⚠️ 无法保存进度 — 点击重新输入密码")
to **every** user (students + teacher). A mismatch = everyone sees the banner and
can't self-heal. This was broken on 2026-08-30 (version.json bumped, the other
two forgotten) and took a full GitHub-Pages-deploy unstick to recover.

**Do this on every version bump:**
1. Pick a new stamp: `YYYY-MM-DD` + optional lowercase letter.
2. Set **all three** to the same value.
3. `npm test` must pass (the guard `test_deploy_stamp_sync.js` runs first and
   exits non-zero on any drift — so you literally cannot commit a mismatch via
   the normal test gate).
4. Deploy, then verify live: curl the served `frontend_auth.js` and confirm
   `APP_VERSION` matches `version.json`.

See `DEPLOY_VERSION_STAMP.md` for the full root-cause writeup.

---

## ⛔ RULE 2 — Never `git add -A` / `git add .` here

Stage specific paths only (`git add <file> <file>`). The repo has a large
untracked `api/speech_events_dump_full.json` and other artifacts that must NOT
be committed. The workspace instruction forbids blanket adds; respect it.

---

## Deploy pipeline (preview-first, additive)

- Source branch for GitHub Pages **and** the SWA Functions is `main`.
- `preview` is your working/local integration branch; `main` is what ships.
- Standard cycle: work on `preview` → `git checkout main && git merge preview`
  → push `main` to **both** `origin` (GitHub Pages + SWA via Actions) **and**
  `preview` remote (`git push origin HEAD:refs/heads/main` and
  `git push preview HEAD:refs/heads/main`). Keep all four refs equal before
  finishing.
- **GitHub Pages wedges easily**: a prior "in progress" deployment blocks the
  next one with `Deployment request failed ... due to in progress deployment.
  Please cancel <sha> first`. The modern Pages Settings UI has NO cancel button
  — it self-resolves in ~30–90 min, or `gh run rerun <pages-run-id>` after the
  lock rolls forward. Don't thrash with repeated pushes; one rerun after the
  wedge clears is enough.
- The SWA Functions deploy (`Azure Static Web Apps CI/CD` workflow) and the
  Pages deploy are **separate** Actions runs triggered by the same push.

## Tests (REQRED green before any commit)
- `npm test` (root) — runs the whole suite (currently 11 files, 440 assertions).
  `test_deploy_stamp_sync.js` is first; it fails the whole run on stamp drift.
- `cd api && npm test` — backend Functions tests.

## Key files
- `frontend_auth.js` — auth, session tokens, **version watchdog**, flush logic.
- `index.html` — entry; every `<script>` carries a `?v=<APP_VERSION>` cache-buster.
- `teacher_dashboard.js/.html/.css` — admin/teacher view (archive-merge lives here).
- `api/src/functions/` — Azure Functions (getStudents, saveAnalytics w/ auto-archive,
  getStudentArchive, login, etc.).
- `DEPLOY_VERSION_STAMP.md`, `HANDOFF_SESSION_REFRESH_FIX.md` — discipline + state.

## Conventions
- KISS/DRY; match surrounding style; additive changes preferred.
- Bump the deploy stamps (all three) whenever you ship a fix clients must pick up.
- Leave `api/speech_events_dump_full.json` (untracked) alone.
