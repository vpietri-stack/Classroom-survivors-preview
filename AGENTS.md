# Classroom Survivors

Vanilla-JS ESL learning game, GitHub Pages frontend, Azure Functions/Cosmos backend.
Start at `docs/wiki/01-overview.md` and read the owning pages for the task; the wiki
is a router, not a requirement to load every page. Update a page when its documented
behavior, contract or workflow changes; avoid duplicate permanent handoff narratives.

## Isolation and staging

Use one feature branch/worktree. The shared main checkout may contain another
session's work: never switch its branch, commit in it or overwrite its changes.
Use `wt.sh new <feature> <explicit-base>` and `wt.sh where` before editing.
`wt.sh` links installed dependencies; use `wt.sh rm` to remove a worktree safely.
Do not recursively delete a worktree/junction. Stage explicit paths only; never
`git add -A` or `git add .`. Private student data, recordings, dumps and secrets
must remain untracked. Sequence integrations that touch shared files.

## Checks — approved workflow policy, 2 November 2026

During iteration use `npm run test:changed -- <base-ref>` or an explicit group:
`node scripts/checks.mjs --group content` (also handwriting, speech, dashboard,
notes, api, tower). Unknown/shared runtime changes broaden to the full suite.
Inspect the selected list with `--list` when impact is uncertain. Documentation
alone does not require application tests. Add a behavioral regression for a real
bug; do not create tests that merely mirror an obvious low-impact edit.

Before integration/release, run `npm test` on the final integrated code. It keeps
all tests and the deploy-stamp guard first; see `scripts/checks.json` for the list.
Backend mock/contract checks are portable: `npm --prefix api test`. Live backend
integration is separate: `npm --prefix api run test:integration`, with the private
helper, explicit loopback TEST_BASE and confirmed isolated Functions/Cosmos setup.
Run that integration when backend/auth/persistence contracts change. Unavailable
integration is a reported gap, never a pass and never a reason to use production.

Full logs/receipts are gitignored in `.checks/`. Optional `--reuse` is local and
valid only for identical source/tests/fixtures/dependencies/runtime; no live API
result is cached. `npm test` reruns by default. A changed merge or environment
invalidates prior evidence. Wait on the running process rather than tail-polling.

## Release roles and targets

Feature work preserves deploy stamps. The integrator updates them once on the
final approved release: `version.json`, `frontend_auth.js` APP_VERSION and the
`index.html` frontend_auth query must agree; keep dashboard auth queries aligned.
Verify the deployed stamp and changed assets after release. A mismatch previously
put the cannot-save-progress banner on students' screens.

Preview and production are separate release lines and have isolated API/data and
curriculum. Build on the named target's current base and preserve that isolation.
`preview` remote main is preview; `origin` main is production. A preview request
never authorizes production or a whole-history merge from preview to production.
Production requires the user's explicit release instruction. Integrate in a
separate worktree; do not switch the shared checkout or require unrelated refs to
be equal. See `docs/wiki/13-deployment.md` for current operations and history.

Monitor the existing Pages/Azure deployment runs through a terminal result;
retry a failed deployment only after resolving its condition. Do not push again
merely to poll. This policy supersedes historical full-suite-before-every-commit
and push-both-remotes instructions in older handoffs/wiki excerpts.

Keep queue/ack retry discipline, account isolation, SR invariants and bounded
payloads. New incidents need current evidence; historical causes do not establish
the cause of a new tablet refresh.
