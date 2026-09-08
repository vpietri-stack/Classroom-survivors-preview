// Unit test for Round E (study mode sentence matching) sub-round pair selection.
//
// Rules under test (user spec):
//   1. SR due-status ALWAYS wins first — a due/failed pair on ANY page is picked
//      before new material, regardless of sub-round.
//   2. For NEW items only (nothing due):
//        - E1 favors the CURRENT page.
//        - E2/E3 AVOID the current page and review a PREVIOUS page, weighted by
//          proximity (closer = higher chance). Falls back to current page only
//          when no previous page has unseen pairs (first-page student).
//   3. A pair is never repeated within one Round E session.
//
// We load sr_engine.js + teaching_content.js in a VM with a small fixture and
// drive the sub-rounds exactly as nextRoundESubRound does.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = __dirname;
let src =
  fs.readFileSync(path.join(root, 'sr_engine.js'), 'utf8') + '\n' +
  fs.readFileSync(path.join(root, 'teaching_content.js'), 'utf8');

// teaching_content.js declares `const TEACHING_CONTENT` / `const AVAILABLE_CONTENT`.
// Populate them via appended in-scope code (vm const isn't reachable from outside).
// Book has 3 pages, each with several distinct pairs. Student is on page p3.
src += `
TEACHING_CONTENT.test = {
  u0: {
    p1: {
      vocab: ['a'], sentences: ['s.'],
      sentencePairs: [
        { a: 'p1q1', b: 'p1a1' }, { a: 'p1q2', b: 'p1a2' },
        { a: 'p1q3', b: 'p1a3' }, { a: 'p1q4', b: 'p1a4' },
        { a: 'p1q5', b: 'p1a5' }, { a: 'p1q6', b: 'p1a6' },
        { a: 'p1q7', b: 'p1a7' }, { a: 'p1q8', b: 'p1a8' },
        { a: 'p1q9', b: 'p1a9' },
      ],
    },
    p2: {
      vocab: ['b'], sentences: ['s.'],
      sentencePairs: [
        { a: 'p2q1', b: 'p2a1' }, { a: 'p2q2', b: 'p2a2' },
        { a: 'p2q3', b: 'p2a3' }, { a: 'p2q4', b: 'p2a4' },
      ],
    },
    p3: {
      vocab: ['c'], sentences: ['s.'],
      sentencePairs: [
        { a: 'p3q1', b: 'p3a1' }, { a: 'p3q2', b: 'p3a2' },
        { a: 'p3q3', b: 'p3a3' }, { a: 'p3q4', b: 'p3a4' },
      ],
    },
  },
};
AVAILABLE_CONTENT.test = { u0: ['p1', 'p2', 'p3'] };
`;

const sandbox = {
  console,
  API_BASE_URL: '',
  document: { addEventListener: () => {} },
  window: {},
  localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
  isTestMode: false,
  getCurrentSession: () => 5,   // current session index
};
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
// teaching_content.js declares `var authActiveUser = null` (attaches to context),
// so set it AFTER running via in-context assignment.
vm.runInContext(`authActiveUser = { srState: { vocab: {}, sentences: {}, sentencePairs: {} } };`, sandbox);

const { getStudySentencePairsSubRoundSR, itemKey, normMatchText } = sandbox;
sandbox.selectedClassContent = { book: 'test', unit: 'u0', page: 'p3' };

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS:', name); }
  else { fail++; console.log('FAIL:', name, extra !== undefined ? JSON.stringify(extra) : ''); }
}
function keyOf(a, b) { return itemKey({ a, b }); }

// Helper: reset SR state on the in-context user object.
function setSR(state) { sandbox.authActiveUser.srState.sentencePairs = state || {}; }

// ---------------------------------------------------------------------------
// Rule 1: a DUE pair on a previous page wins even for E1 (preferPrevious=false).
// Mark p1q1 as due (dueAfterSession <= currentSession, lastResult failure => group 1).
setSR({ [keyOf('p1q1', 'p1a1')]: { interval: 1, dueAfterSession: 5, lastSession: 4, lastResult: 'failure' } });
const due = getStudySentencePairsSubRoundSR('test', 'u0', 'p3', new Set(), false);
ok('Rule1: due pair on previous page wins E1',
  due && due.pairs.some(p => itemKey(p) === keyOf('p1q1', 'p1a1')), due && due.pairs.map(itemKey));

// ---------------------------------------------------------------------------
// Rule 2: NEW items only (empty SR state).
setSR({});

// E1 (preferPrevious=false) -> CURRENT page is PRIORITIZED (weighted, not guaranteed).
// Over 20k trials the current page wins ~90%; use 1000 trials + 85% threshold
// (proves "prioritizes" while tolerating normal sampling variance).
let e1Current = 0, e1Trials = 1000;
for (let i = 0; i < e1Trials; i++) {
  const r = getStudySentencePairsSubRoundSR('test', 'u0', 'p3', new Set(), false);
  if (r && r.pairs.every(p => itemKey(p).startsWith('p3'))) e1Current++;
}
ok('Rule2: E1 (new items) PRIORITIZES the current page (>=85% of trials)',
  e1Current >= e1Trials * 0.85, { e1Current, e1Trials });

// E2/E3 (preferPrevious=true) -> a PREVIOUS page (p1 or p2), never p3.
// Run many times to confirm it NEVER returns the current page for new items.
let e2CurrentPageHits = 0, e2PrevHits = 0;
const closerWins = { p2: 0, p1: 0 };
for (let i = 0; i < 200; i++) {
  const r = getStudySentencePairsSubRoundSR('test', 'u0', 'p3', new Set(), true);
  if (!r) continue;
  const prefix = itemKey(r.pairs[0]).slice(0, 2);
  if (prefix === 'p3') e2CurrentPageHits++;
  else { e2PrevHits++; if (prefix === 'p2') closerWins.p2++; if (prefix === 'p1') closerWins.p1++; }
}
ok('Rule2: E2/E3 (new items) NEVER pick the current page', e2CurrentPageHits === 0, { e2CurrentPageHits });
ok('Rule2: E2/E3 pick a previous page', e2PrevHits > 0, { e2PrevHits });
ok('Rule2: closer previous page (p2) picked more often than farther (p1)',
  closerWins.p2 > closerWins.p1, closerWins);

// ---------------------------------------------------------------------------
// Rule 2 fallback: first-page student (page p1, no previous pages).
// E2/E3 with preferPrevious=true must fall back to the current page.
sandbox.selectedClassContent = { book: 'test', unit: 'u0', page: 'p1' };
setSR({});
const fb = getStudySentencePairsSubRoundSR('test', 'u0', 'p1', new Set(), true);
ok('Rule2 fallback: first-page E2 falls back to current page (p1)',
  fb && fb.pairs.every(p => itemKey(p).startsWith('p1')), fb && fb.pairs.map(itemKey));

// ---------------------------------------------------------------------------
// Rule 3: no pair repeats across sub-rounds. Drive 3 sub-rounds on p3 ONCE for
// the deterministic "no repeat" guarantee (uses the shared `used` set).
sandbox.selectedClassContent = { book: 'test', unit: 'u0', page: 'p3' };
setSR({});
const used = new Set();
const rounds = [];
for (let i = 0; i < 3; i++) {
  const r = getStudySentencePairsSubRoundSR('test', 'u0', 'p3', used, i > 0);
  if (!r || r.pairs.length === 0) break;
  r.pairs.forEach(p => used.add(itemKey(p)));
  rounds.push(r.pairs.map(itemKey));
}
const flat = rounds.flat();
ok('Rule3: no pair repeats across E1/E2/E3', new Set(flat).size === flat.length, { flat });

// Rule 3 (statistical, not flaky): E1 LEANS the current page and E2/E3 ALWAYS
// avoid it. A single E1 draw is weighted (~90% current) and may land on a
// previous page, so assert over many drives instead of one.
let e1CurrentWins = 0, e2NeverCurrent = 0, drives = 200;
for (let d = 0; d < drives; d++) {
  setSR({});
  const u = new Set();
  const r0 = getStudySentencePairsSubRoundSR('test', 'u0', 'p3', u, false); // E1
  if (r0 && r0.pairs.every(p => itemKey(p).startsWith('p3'))) e1CurrentWins++;
  r0 && r0.pairs.forEach(p => u.add(itemKey(p)));
  const r1 = getStudySentencePairsSubRoundSR('test', 'u0', 'p3', u, true);  // E2
  if (r1 && r1.pairs.every(p => !itemKey(p).startsWith('p3'))) e2NeverCurrent++;
}
ok('Rule3: E1 leans current page (>=75% of drives)', e1CurrentWins >= drives * 0.75, { e1CurrentWins, drives });
ok('Rule3: E2/E3 always avoid current page', e2NeverCurrent === drives, { e2NeverCurrent, drives });

// ---------------------------------------------------------------------------
// Rule 4 (explicit first-page guarantee): a student on the FIRST page has no
// previous page, so E2/E3 MUST still run and pull FRESH pairs from that same
// first page (never skip, never repeat). Drive all 3 sub-rounds on p1.
sandbox.selectedClassContent = { book: 'test', unit: 'u0', page: 'p1' };
setSR({});
const usedF = new Set();
const roundsF = [];
for (let i = 0; i < 3; i++) {
  const r = getStudySentencePairsSubRoundSR('test', 'u0', 'p1', usedF, i > 0);
  if (!r || r.pairs.length === 0) break;
  r.pairs.forEach(p => usedF.add(itemKey(p)));
  roundsF.push(r.pairs.map(itemKey));
}
const flatF = roundsF.flat();
ok('Rule4: first-page student runs all 3 sub-rounds on the SAME first page',
  roundsF.length === 3 && roundsF.every(r => r.every(k => k.startsWith('p1'))), roundsF);
ok('Rule4: first-page sub-rounds are FRESH & distinct (no repeats)',
  new Set(flatF).size === flatF.length && flatF.length === 9, { flatF });

// ---------------------------------------------------------------------------
// Rule 5 (2026-09-08, "Doris all-cooldown"): when EVERY pair up to the current
// page is on SR cooldown, the selector must NOT return null (dead session).
// It floors with the least-overdue cooldown pairs — practice beats a dead end.
function cooldownSRState() {
  const st = {};
  // every pair on every page: due far in the future (interval 128, lastSession 190).
  // Keys MUST match itemKey({a,b}) = "a | b".toLowerCase() (cf. keyOf above).
  ['p1', 'p2', 'p3'].forEach(pg => {
    for (let i = 1; i <= 9; i++) {
      st[keyOf(`${pg}q${i}`, `${pg}a${i}`)] = { interval: 128, dueAfterSession: 318, lastSession: 190, lastResult: 'success' };
    }
  });
  return st;
}
sandbox.selectedClassContent = { book: 'test', unit: 'u0', page: 'p3' };
setSR(cooldownSRState());
const usedC = new Set();
const rC = getStudySentencePairsSubRoundSR('test', 'u0', 'p3', usedC, false);
ok('Rule5: all-cooldown pool still serves 3 pairs (cooldown floor, no null)',
  rC && rC.pairs && rC.pairs.length === 3, rC && rC.pairs && rC.pairs.length);
// Cooldown floor serves the LEAST-overdue first: with EVERYTHING on cooldown,
// make one pair slightly less overdue than the rest; it must surface in E1.
setSR(Object.assign(cooldownSRState(), {
  [keyOf('p3q2', 'p3a2')]: { interval: 4, dueAfterSession: 204, lastSession: 200, lastResult: 'success' }
}));
const usedC2 = new Set();
const rC2 = getStudySentencePairsSubRoundSR('test', 'u0', 'p3', usedC2, false);
ok('Rule5: least-overdue cooldown pair is preferred',
  rC2 && rC2.pairs.some(p => itemKey(p) === keyOf('p3q2', 'p3a2')), rC2 && rC2.pairs.map(itemKey));

// Rule 6 (2026-09-08, "Doris stuck CHECK"): normMatchText collapses
// whitespace runs (incl. NBSP), trims, and lowercases — tile HTML
// interpolation artifacts must never fail a visually-correct placement.
ok('Rule6: normMatchText collapses indentation/newlines',
  normMatchText('\n   My name is Sarah.  \n') === 'my name is sarah.');
ok('Rule6: normMatchText collapses NBSP + double spaces',
  normMatchText('The\u00a0\u00a0apple  is red.') === 'the apple is red.');
ok('Rule6: symmetric use — template-indented tile matches content string',
  normMatchText('\n                        I\'m seven years old.\n                    ') ===
  normMatchText("I'm seven years old."));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
