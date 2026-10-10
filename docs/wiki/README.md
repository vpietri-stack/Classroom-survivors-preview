# Classroom-survivors Repo Wiki

> **Last verified:** 2026-10-05 · Maintained by every agent that works here. **Start:** [01-overview.md](01-overview.md)

The single source of truth for this repository: what the project is, how each subsystem works, where the bodies are buried, and how to deploy without breaking things. Committed in-repo so every tool and clone gets it.

## Pages

| # | Page | Read when… |
|---|---|---|
| 01 | [Overview](01-overview.md) | Always first — big picture + per-task routing table |
| 02 | [Project Structure & File Map](02-project-structure.md) | Finding where anything lives; script load order |
| 03 | [Frontend Core](03-frontend-core.md) | Boot sequence, config, content packs, asset cache |
| 04 | [Auth, Sessions & Version Watchdog](04-auth-versioning.md) | Touching `frontend_auth.js`, sessions, flush, stamps |
| 05 | [Study Mode](05-study-mode.md) | Study rounds (A/B/C/D/Match), widgets, SR wiring |
| 06 | [Game Modes & Minigames](06-game-modes.md) | `game.js` minigames, Tower Defense, Gomoku, UNO |
| 07 | [Vampire Survivors](07-vampire-survivors.md) | `vampire_survivors.js` and the `vs_*` family |
| 08 | [Speech Recognition & Scoring](08-speech.md) | Speech pipeline, Whisper model, scoring, recorder |
| 09 | [Teacher & Admin Dashboards](09-dashboards.md) | Dashboards, targets/manualOffset, archive merge, BMs |
| 10 | [Backend API](10-backend-api.md) | Azure Functions, auth layers, saveAnalytics |
| 11 | [Data Model](11-data-model.md) | Cosmos docs, event shapes, localStorage keys |
| 12 | [Testing](12-testing.md) | The required-green gate, harness styles, contract tests |
| 13 | [Deployment](13-deployment.md) | Branch model, dual remotes, worktrees, Pages wedge, stamp trio |
| 14 | [Telemetry & Data Delivery](14-telemetry.md) | Queue/ack/flush, crash forensics, diagnostics |
| 15 | [Gotchas & Project History](15-gotchas-and-history.md) | Don't-re-break-it list + handoff doc index |

## Rules

1. **Update discipline:** change code → update the covering page in the same commit. The wiki is the source of truth; Hermes skills/memory hold only behavior rules and point here.
2. **New root handoff docs** (`*_HANDOFF*.md`) must be indexed in [15-gotchas-and-history](15-gotchas-and-history.md) and ideally distilled into a wiki page.
3. **Sanitization:** no credentials, keys, connection strings, or real student/parent names in this wiki (both GitHub repos are public). Values live in env vars / repo secrets / the operator's private notes.
4. New agents start at [01-overview](01-overview.md), which routes to the right page per task.
