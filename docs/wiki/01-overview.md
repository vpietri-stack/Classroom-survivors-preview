# Classroom-survivors Repo Wiki

> **Last verified:** 2026-09-25 · **Part of:** [Classroom-survivors Repo Wiki](README.md)

**Purpose:** the single source of truth for what this project IS and HOW it works — architecture, data model, subsystems, deployment, telemetry, and history. Any agent (human or AI) working in this repo should start here.

## What is Classroom-survivors?

A **vanilla-JS + Phaser ESL (English as a Second Language) learning game** for Val's students in mainland China. No build step, no framework — `index.html` loads ~30 plain `<script>` tags. Students log in, practice vocabulary/grammar through **Study Mode rounds** and **game-mode minigames**, and every exercise/session is queued client-side and flushed to an **Azure Functions + Cosmos DB** backend. Teachers monitor progress and set targets from a separate dashboard.

- **Players:** a small class of students, mostly on iPads (Safari/WeChat webview) in China.
- **Stack:** GitHub Pages (static frontend) + Azure Static Web Apps (Functions API host) + Cosmos DB (`Val-EslApp` / `Students` container).
- **Constraint that shapes everything:** the Great Firewall (flaky GitHub connectivity) and old iPads (Safari kills background pages aggressively → the entire offline-queue/telemetry architecture exists because of this).

## Reading order for agents

| If you want to… | Read |
|---|---|
| Understand the big picture | this page, then [Project Structure](02-project-structure.md) |
| Touch `frontend_auth.js`, sessions, or version stamps | [Auth, Sessions & Version Watchdog](04-auth-versioning.md) — **and** [Deployment](13-deployment.md) if you'll deploy |
| Touch study rounds or minigame widgets | [Study Mode](05-study-mode.md), [Game Modes](06-game-modes.md) |
| Touch `vampire_survivors.js` or any `vs_*` file | [Vampire Survivors](07-vampire-survivors.md) |
| Touch speech recognition / scoring | [Speech Recognition](08-speech.md) |
| Touch the dashboards | [Dashboards](09-dashboards.md) |
| Touch `api/src/functions/*` or Cosmos | [Backend API](10-backend-api.md), [Data Model](11-data-model.md) |
| Write or run tests | [Testing](12-testing.md) |
| Understand telemetry / debug data loss | [Telemetry](14-telemetry.md) |
| Avoid re-breaking something that shipped a bug before | [Gotchas & History](15-gotchas-and-history.md) |

## The six load-bearing facts

1. **Deploy version stamps must stay in sync** — three values (`version.json`, `frontend_auth.js` `APP_VERSION`, `index.html` `?v=`) must be byte-identical or every user gets a red "cannot save progress" banner. Enforced by `test_deploy_stamp_sync.js`. See [Auth/Versioning](04-auth-versioning.md) and [Deployment](13-deployment.md).
2. **Never `git add -A` / `git add .`** — stage explicit paths. The repo has large untracked artifacts (`api/speech_events_dump_full.json`) and gitignored secrets (`app-config.json`).
3. **Branch model:** work on `preview` → merge to `main` → push `HEAD:refs/heads/main` to **both** remotes (`origin` = production Pages + SWA, `preview` = preview site). All four refs end equal. See [Deployment](13-deployment.md).
4. **Client data flow is queue → ack → flush** — events queue in localStorage with stable `eventId`s; the client only drains its queue when the server's response accounts for every shipped event (per-event acks). This exists because iPads die mid-flight constantly. See [Telemetry](14-telemetry.md).
5. **Names lie** — "Round C = Spelling" is a 10-key random keyboard; the game-mode `spelling` minigame is actually a letter-based word scramble. Always re-derive behavior from code. See [Study Mode](05-study-mode.md) and [Game Modes](06-game-modes.md).
6. **The sync path must stay bounded and small** — the queue is capped (500 events, 200-event batches, a stringify guard), SR updates travel as **per-session deltas** (a 65KB full-state packet exceeds Chromium's ~64KB keepalive cap and then *every* flush fails without server contact), and session-scoped localStorage keys are **per-student**. Any change that lets the queue or a request body grow without limit can freeze a child's page or silently poison a classmate's account. See [Telemetry](14-telemetry.md).

## System overview

```mermaid
flowchart LR
    subgraph Client ["Browser (GitHub Pages, static)"]
        UI["index.html + ~30 scripts<br/>game, study mode, minigames, speech"]
        AUTH["frontend_auth.js<br/>session + queue + flush + watchdog"]
        LS[("localStorage<br/>savedUsers, per-account event queue")]
    end
    subgraph Azure ["Azure Static Web Apps"]
        FN["Azure Functions (Node)<br/>login, getStudents, saveAnalytics,<br/>addStudent, updateStudent, ..."]
    end
    subgraph DB [("Azure Cosmos DB")]
        C["Container: Students<br/>(DB: Val-EslApp, PK /studentId)"]
    end
    UI --> AUTH
    AUTH -->|"fetch / sendBeacon<br/>X-App-Key + X-Auth-Token"| FN
    AUTH --> LS
    FN --> C
    TD["teacher_dashboard.js / admin_dashboard.js"] -->|"GET/POST same API"| FN
```

## Wikis & maintenance

- Every page ends with an **Update discipline** section: change code → update the page in the same commit. The wiki lives in-repo (`docs/wiki/`) so it travels with every clone and every agent.
- Behavioral rules, workflows, and machine-specific quirks live in **Hermes skills** (`classroom-survivors`, `classroom-survivors-dev`) — those cross-link here rather than duplicating facts.
- Historical incident write-ups live at the repo root (`*.md` handoffs) and are indexed in [Gotchas & History](15-gotchas-and-history.md). New root handoff docs should be added to that index.
- Sanitization: no credentials, keys, or real student/parent names appear in this wiki (repo is public). Operational secrets live in env vars / repo secrets / the operator's private notes.

## Update discipline

Any agent that changes architecture, data model, API surface, deploy process, or a documented subsystem must update the relevant wiki pages in the same commit. After any incident, add the root cause + fix to [Gotchas & History](15-gotchas-and-history.md). This wiki is the single source of truth for repo facts; skills/memory hold only behavior rules and point here.
