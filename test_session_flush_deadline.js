// Regression tests for the 2026-08-25 "Doris forced-refresh" fix primitives:
//
//   1. flushAnalyticsWithDeadline(maxMs) — the completion-time flush that the
//      study/uno/gomoku/VS end screens AWAIT before rendering. It must:
//        a. resolve TRUE (queue drained) once the server accepts the events;
//        b. NEVER hang longer than the deadline when the network stalls —
//           an iPad whose page process is about to be recycled cannot wait
//           forever, and the UI must show the completion screen.
//   2. saveActiveUserToCache() — hardened cached-profile writer. It must:
//        a. never throw (an unguarded QuotaExceededError here used to abort
//           queueSessionEvent mid-completion);
//        b. on a quota failure, retry once with the analytics mirror trimmed
//           to the most recent 500 events, then restore the in-memory array.
//
// Background: doris_zhangyanyi (iPad 11, WeChat + Safari) lost every
// completed study session after 2026-08-21 because the completion record was
// shipped fire-and-forget; the page process restarted within ~1s of the
// completion overlay and the in-flight flush (and the just-written
// localStorage mirror) died with it.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = __dirname;
const src = fs.readFileSync(path.join(root, 'teaching_content.js'), 'utf8')
  + '\n' + fs.readFileSync(path.join(root, 'frontend_auth.js'), 'utf8');

// --- controllable localStorage stub ------------------------------------------
let store = {};
let quotaLimit = Infinity;   // max JSON bytes allowed per key
let setItemCalls = [];       // { key, size } history for assertions
const localStorageStub = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => {
    const s = String(v);
    setItemCalls.push({ key: k, size: s.length });
    if (s.length > quotaLimit) {
      const err = new Error('QuotaExceededError');
      err.name = 'QuotaExceededError';
      throw err;
    }
    store[k] = s;
  },
  removeItem: (k) => { delete store[k]; }
};

// --- controllable network stub ------------------------------------------------
// frontend_auth.js defines its own apiFetch() that calls the GLOBAL fetch, so
// the interception point is fetch itself.
let fetchBehavior = 'ok'; // 'ok' | 'hang' | 'silent200' (200 without event acks)
let posts = [];
function fetchStub(url, options = {}) {
  posts.push({ url: String(url), body: options.body });
  if (fetchBehavior === 'hang') return new Promise(() => {}); // never resolves
  // Echo the server's 2026-09-03a ack contract: list every shipped eventId as
  // added (the real saveAnalytics response now carries addedEventIds /
  // duplicateEventIds). 'silent200' simulates Doris's iPad: ok-looking 200
  // that accounts for NOTHING.
  let ack = {};
  if (fetchBehavior !== 'silent200') {
    try {
      const b = JSON.parse(options.body || '{}');
      ack = {
        addedEventIds: (b.events || []).filter(e => e && e.eventId).map(e => e.eventId),
        duplicateEventIds: []
      };
    } catch { /* body-less request */ }
  }
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ success: true, ...ack }) });
}

const sandbox = {
  console,
  API_BASE_URL: 'http://test.local/api',
  document: { addEventListener: () => {} },
  window: { addEventListener: () => {} },
  localStorage: localStorageStub,
  setTimeout, clearTimeout, setInterval, clearInterval,
  // Minimal Blob stub: the beacon path does `new Blob([payload])` then passes
  // it to navigator.sendBeacon. We capture the text synchronously so the
  // sendBeacon stub can record the POST body.
  Blob: class { constructor(parts) { this._text = Array.isArray(parts) ? parts.join('') : String(parts); } },
  URLSearchParams,          // used by the beacon path to build the query string
  navigator: {
    // sendBeacon stub: records the POST exactly like the unload flush uses it.
    // Without this, the beacon path (the real browser fast-path) is skipped and
    // only the fire-and-forget fetch fallback runs (unawaited, so posts never
    // land) — which would make the immediate-login-flush assertions flaky.
    sendBeacon: (url, blob) => {
      posts.push({ url: String(url), body: (blob && blob._text) ? blob._text : String(blob) });
      return true;
    }
  },          // real browsers provide sendBeacon
  fetch: fetchStub,
  getAppKey: () => Promise.resolve('test-key'),
  // teach-content globals that frontend_auth expects to find at module scope
  isTestMode: false,
  authActiveUser: null,
};
vm.createContext(sandbox);
vm.runInContext(src, sandbox);

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log('PASS:', name); }
  else { fail++; console.log('FAIL:', name); }
}

function makeUser() {
  return {
    id: 'student_doris_test', login: 'doris_test', name: 'Doris',
    role: 'student', srState: { vocab: {}, sentences: {}, sentencePairs: {} },
    sessionCount: 3, analytics: []
  };
}

(async () => {
  // ---- 1a. deadline flush delivers the session event and reports success ----
  fetchBehavior = 'ok';
  sandbox.authActiveUser = makeUser();
  sandbox.analyticsQueue = [];
  vm.runInContext('authActiveUser = __user; analyticsQueue = [];', Object.assign(sandbox, { __user: sandbox.authActiveUser }));
  // Simulate the completion path: finalize-style SR pending + session event.
  vm.runInContext(`
    srPendingState = { vocab: { cat: { interval: 2 } } };
    srIncrementSession = true;
    queueSessionEvent('study', { durationMs: 300000, durationFormatted: '5m 0s' });
  `, sandbox);
  ok('completion event queued before flush', sandbox.analyticsQueue.length === 1);
  const t0 = Date.now();
  const drained = await sandbox.flushAnalyticsWithDeadline(4000);
  const elapsed = Date.now() - t0;
  ok('deadline flush resolves true when server accepts', drained === true);
  ok('deadline flush drains the queue', sandbox.analyticsQueue.length === 0);
  ok('deadline flush is fast on a good network (<1.5s)', elapsed < 1500);
  ok('flush POSTed saveAnalytics', posts.some(p => p.url.includes('/saveAnalytics')));
  const body = JSON.parse(posts.filter(p => p.url.includes('/saveAnalytics')).pop().body);
  ok('session event carried srState + incrementSession', !!body.srState && body.incrementSession === true);
  ok('queue mirror cleared after server ack', !('csAnalyticsQueue' in store));

  // ---- 1b. deadline flush NEVER hangs past the deadline on a dead network ----
  fetchBehavior = 'hang';
  posts = [];
  sandbox.authActiveUser = makeUser();
  vm.runInContext('authActiveUser = __user; analyticsQueue = [];', Object.assign(sandbox, { __user: sandbox.authActiveUser }));
  vm.runInContext(`queueSessionEvent('study', { durationMs: 1000 });`, sandbox);
  const t1 = Date.now();
  const drained2 = await sandbox.flushAnalyticsWithDeadline(600); // short deadline for test speed
  const waited = Date.now() - t1;
  ok('deadline flush returns false when network stalls', drained2 === false);
  ok('deadline flush respects the deadline (<=1.5s for a 600ms cap)', waited <= 1500);
  ok('stalled events remain in the queue for next-login drain', sandbox.analyticsQueue.length === 1);
  ok('stalled events stay persisted in localStorage', typeof store['csAnalyticsQueue'] === 'string');
  fetchBehavior = 'ok';

  // ---- 1c. immediate login flush (2026-08-28a, startup-kill blind-spot) ----
  // Before this fix, the login device event only rode the 2s debounced flush,
  // so an iOS WebKit kill inside the first 2s + no surviving later login left a
  // TOTAL server blackout (proven on 2026-08-27: zero Doris events all day).
  // flushAnalyticsOnLogin() must ship the queued login event RIGHT NOW (beacon),
  // non-blocking, without waiting for the debounce.
  posts = [];
  store = {};
  sandbox.authActiveUser = makeUser();
  vm.runInContext('authActiveUser = __user; analyticsQueue = [];', Object.assign(sandbox, { __user: sandbox.authActiveUser }));
  // Simulate the login path: the device event is queued (day-key + isTestMode
  // guards are already satisfied in the harness).
  vm.runInContext(`queueDeviceInfoEvent();`, sandbox);
  ok('login device event queued before immediate flush', sandbox.analyticsQueue.length === 1);
  const loginT0 = Date.now();
  await sandbox.flushAnalyticsOnLogin();    // must resolve WITHOUT the 2s debounce
  const loginElapsed = Date.now() - loginT0;
  ok('immediate login flush fires a POST without the 2s debounce', loginElapsed < 1000);
  ok('immediate login flush POSTs to /saveAnalytics', posts.some(p => p.url.includes('/saveAnalytics')));
  const loginBody = JSON.parse(posts.filter(p => p.url.includes('/saveAnalytics')).pop().body);
  ok('immediate login flush carries the device event', loginBody.events.some(e => e.type === 'device'));
  // Beacon semantics: the queue is NOT cleared here (it stays persisted for the
  // reliable 2s debounce / next-launch drain; server eventId de-dups duplicates).
  ok('immediate login flush does NOT clear the queue (beacon, not the clearing flush)',
     sandbox.analyticsQueue.length === 1);

  // ---- 1c-2. ACK DISCIPLINE (2026-09-03a, "Doris silent-200") ----
  // For 6 days (2026-08-28 → 09-03) Doris's iPad received ok-looking 200s from
  // saveAnalytics while NOTHING persisted server-side — the old client trusted
  // response.ok and drained its persisted queue on a lie. New contract: the
  // persisted queue only clears when the response lists EVERY shipped eventId
  // as added or duplicate. Silent-200s keep the queue (the sendBeacon path
  // re-ships it on the next launch; the server de-dups by eventId).
  // Case A: honest 200 with a full ack -> queue drains (the normal path).
  fetchBehavior = 'ok';
  posts = []; store = {};
  sandbox.authActiveUser = makeUser();
  vm.runInContext('authActiveUser = __user; analyticsQueue = []; srPendingState = null; srIncrementSession = false;', sandbox);
  vm.runInContext(`queueSessionEvent('study', { durationMs: 2000 });`, sandbox);
  const drainedAck = await sandbox.flushAnalytics();
  ok('full-ack 200 drains the queue', drainedAck !== false && sandbox.analyticsQueue.length === 0);
  ok('full-ack 200 clears the localStorage queue mirror', !('csAnalyticsQueue' in store));

  // Case B: Doris's silent-200 — 200 ok, response accounts for NOTHING.
  fetchBehavior = 'silent200';
  posts = []; store = {};
  sandbox.authActiveUser = makeUser();
  vm.runInContext('authActiveUser = __user; analyticsQueue = []; srPendingState = null; srIncrementSession = false;', sandbox);
  vm.runInContext(`
    srPendingState = { vocab: { cat: { interval: 2 } } };
    srIncrementSession = true;
    queueSessionEvent('study', { durationMs: 3000 });
  `, sandbox);
  const qBefore = sandbox.analyticsQueue.length;
  await sandbox.flushAnalytics();
  ok('silent-200 (no acks) does NOT drain the queue', sandbox.analyticsQueue.length === qBefore);
  ok('silent-200 keeps events persisted for the next-launch beacon re-send',
     typeof store['csAnalyticsQueue'] === 'string');
  ok('silent-200 restores pending SR state so it rides the re-send',
     sandbox.srPendingState !== null && sandbox.srIncrementSession === true);

  // Case C: partial ack — server acked only one of two shipped events.
  posts = []; store = {};
  sandbox.authActiveUser = makeUser();
  vm.runInContext('authActiveUser = __user; analyticsQueue = []; srPendingState = null; srIncrementSession = false;', sandbox);
  vm.runInContext(`queueExerciseEvent('spelling', 'study'); queueSessionEvent('study', {});`, sandbox);
  const twoIds = sandbox.analyticsQueue.map(e => e.eventId);
  sandbox.fetch = function (url, options = {}) { // one-off partial-ack server
    posts.push({ url: String(url), body: options.body });
    return Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve({ success: true, addedEventIds: [twoIds[0]], duplicateEventIds: [] })
    });
  };
  await sandbox.flushAnalytics();
  ok('partial-ack 200 does NOT drain the queue (all-or-nothing)',
     sandbox.analyticsQueue.length === 2);
  sandbox.fetch = fetchStub; // restore the echoing stub

  // ---- 1d. last-breath diagnostic beacon (2026-08-31a, Doris forced-refresh round 3) ----
  // The key gap: flushAnalyticsViaBeacon early-returns when analyticsQueue is empty,
  // so a tab that dies AFTER the 2s debounce has already drained the queue
  // (or BEFORE any post-login event is queued) leaves NO server trace. Doris's
  // iPad+WeChat failure on 2026-08-31 is exactly this state. csLastBreathBeacon
  // fires INDEPENDENTLY of the analytics queue and ships one small device event
  // carrying the in-flight breadcrumb, queue length, and triggering signal —
  // enough to decode the next failure from a single event.
  posts = [];
  store = {};
  // Pre-condition: NO active user, NO queue — exactly the state when the
  // WeChat WKWebView kills the tab between login-beacon and first exercise event.
  sandbox.authActiveUser = null;
  vm.runInContext('authActiveUser = null; analyticsQueue = []; _lastBreathFired = false; _lastBreathBound = false;', sandbox);
  // But we DO have a saved user in localStorage (the WeChat case: a previous
  // login left the profile cached, but the active session just got killed).
  store['savedUsers'] = JSON.stringify([{ id: 'student_doris_wechat', login: 'doris_zhangyanyi' }]);
  // A kill-surviving breadcrumb from the dying tab is present.
  store['csPageHeartbeat'] = JSON.stringify({
    ps: 'ps_dying', ts: Date.now() - 5000, loadTs: Date.now() - 60000, v: '2026-08-31a',
    state: { mode: 'study', round: 'E', ex: 'sentenceScramble', dev: 'iPad|tp5|wx' }
  });
  sandbox.csLastBreathBeacon('pagehide');
  ok('lastBreath fires with NO authActiveUser and empty queue', posts.some(p => p.url.includes('/saveAnalytics')));
  const lbBody = JSON.parse(posts.filter(p => p.url.includes('/saveAnalytics')).pop().body);
  ok('lastBreath is exactly one event', lbBody.events.length === 1);
  ok('lastBreath event is type=device', lbBody.events[0].type === 'device');
  ok('lastBreath event carries diagnostic:lastBreath', lbBody.events[0].diagnostic === 'lastBreath');
  ok('lastBreath event carries the cause (pagehide)', lbBody.events[0].lastBreath.cause === 'pagehide');
  ok('lastBreath event carries the dying-tab breadcrumb',
     lbBody.events[0].lastBreath.breadcrumb.state.ex === 'sentenceScramble'
     && lbBody.events[0].lastBreath.breadcrumb.state.dev === 'iPad|tp5|wx');
  ok('lastBreath event records queueLenAtDeath=0 (empty queue case)',
     lbBody.events[0].lastBreath.queueLenAtDeath === 0);
  ok('lastBreath event carries the running app version',
     lbBody.events[0].appVersion === (src.match(/const\s+APP_VERSION\s*=\s*'([^']+)'/) || [])[1]);
  ok('lastBreath attributed to the saved user (no active session)',
     lbBody.studentId === 'student_doris_wechat');
  // Dedup: a second call must be a no-op (single-fire flag).
  posts = [];
  sandbox._lastBreathFired = false; // reset to test the dedup property itself
  vm.runInContext('_lastBreathFired = false;', sandbox);
  sandbox.csLastBreathBeacon('pagehide');
  sandbox.csLastBreathBeacon('beforeunload');
  sandbox.csLastBreathBeacon('visibilitychange:hidden');
  const dedupCount = posts.filter(p => p.url.includes('/saveAnalytics')).length;
  ok('lastBreath is single-fire across all causes (pagehide/beforeunload/visibilitychange)', dedupCount === 1);
  // No studentId -> silent no-op (anonymous death).
  store = {};
  posts = [];
  vm.runInContext('_lastBreathFired = false;', sandbox);
  sandbox.csLastBreathBeacon('pagehide');
  ok('lastBreath no-ops when there is no studentId to attribute to', posts.length === 0);
  // Reset for downstream tests.
  vm.runInContext('_lastBreathFired = false; _lastBreathBound = false;', sandbox);

  // ---- 2a. saveActiveUserToCache never throws, even when storage is full ----
  sandbox.authActiveUser = makeUser();
  vm.runInContext('authActiveUser = __user;', Object.assign(sandbox, { __user: sandbox.authActiveUser }));
  // Simulate a big analytics mirror (600 events) + a quota smaller than the
  // full serialization but bigger than the trimmed one.
  sandbox.authActiveUser.analytics = Array.from({ length: 600 }, (_, i) => ({
    type: 'exercise', exerciseType: 'spelling', mode: 'study', attempts: 1,
    durationMs: 5000, timestamp: new Date().toISOString(), eventId: 'ex_' + i,
    itemDetails: 'word: ' + 'x'.repeat(40)
  }));
  vm.runInContext('authActiveUser = __user;', Object.assign(sandbox, { __user: sandbox.authActiveUser }));
  const fullSize = JSON.stringify([sandbox.authActiveUser]).length;
  quotaLimit = fullSize - 5000; // just below full size
  setItemCalls = [];
  let threw = false;
  try { sandbox.saveActiveUserToCache(); } catch { threw = true; }
  ok('saveActiveUserToCache never throws on quota error', !threw);
  const savedUserCalls = setItemCalls.filter(c => c.key === 'savedUsers');
  ok('quota failure triggers exactly one trimmed retry', savedUserCalls.length === 2);
  ok('trimmed retry is smaller than the full mirror', savedUserCalls[1].size < savedUserCalls[0].size);
  const cached = JSON.parse(store['savedUsers']);
  ok('trimmed mirror keeps the most recent 500 events', cached[0].analytics.length === 500
     && cached[0].analytics[499].eventId === 'ex_599');
  ok('in-memory analytics restored after the trim-retry', sandbox.authActiveUser.analytics.length === 600);
  quotaLimit = Infinity;

  // ---- 2b. storage totally unavailable -> still silent, app keeps working ----
  store = {};
  quotaLimit = -1; // every setItem throws
  threw = false;
  try { sandbox.saveActiveUserToCache(); } catch { threw = true; }
  ok('saveActiveUserToCache silent when storage is unusable', !threw);
  quotaLimit = Infinity;

  // ---- 3. restart telemetry (2026-08-26a, mid-session WebKit kill) ----
  const buildDiag = sandbox.csBuildRestartDiagnostic;
  const now = Date.now();

  // Hard kill: fresh breadcrumb, nothing delivered after it -> diagnostic.
  let d = buildDiag({ ps: 'ps_1', ts: now - 90000, loadTs: now - 400000, v: '2026-08-26a', state: { mode: 'study', round: 'D' } }, now, () => false);
  ok('hard kill -> diagnostic produced', !!d && d.diagnostic === 'restart');
  ok('diagnostic carries time-since-page-load (5-7 min range)', d.secSincePageLoad >= 309 && d.secSincePageLoad <= 311);
  ok('diagnostic carries last page state', d.pageState.mode === 'study' && d.pageState.round === 'D');
  ok('diagnostic carries the build stamp', d.appVersion === '2026-08-26a');

  // Graceful close already delivered the tail -> NO diagnostic.
  d = buildDiag({ ps: 'ps_1', ts: now - 90000 }, now, () => true);
  ok('delivered tail suppresses the diagnostic', d === null);

  // Stale breadcrumb (>1h, student simply stopped) -> NO diagnostic.
  d = buildDiag({ ps: 'ps_1', ts: now - 3700000 }, now, () => false);
  ok('stale breadcrumb (>1h) suppressed', d === null);

  // Missing/malformed breadcrumb -> NO diagnostic.
  d = buildDiag(null, now, () => false);
  ok('missing breadcrumb suppressed', d === null);
  d = buildDiag({ ts: now - 1000 }, now, () => false); // no ps
  ok('breadcrumb without page-session id suppressed', d === null);

  // ---- 3b. heartbeat + queue stamping integration ----
  // Mirrors the REAL kill flow: page session #1 runs and dies without a
  // pagehide marker; page session #2 starts (csNewPageSession) and detects.
  // The 2026-08-26c ordering fix makes detection run BEFORE the new
  // heartbeat write — simulated here by detecting right after the new
  // page-session id is minted.
  store = {};
  sandbox.authActiveUser = makeUser();
  vm.runInContext('authActiveUser = __user; analyticsQueue = [];', Object.assign(sandbox, { __user: sandbox.authActiveUser }));
  vm.runInContext(`
    csNewPageSession();
    csPageHeartbeat({ mode: 'study', round: 'D' });
    queueExerciseEvent('sentenceScramble', 'study');
  `, sandbox);
  const hb = JSON.parse(store['csPageHeartbeat']);
  ok('heartbeat written with page-session + state', !!hb.ps && hb.state.round === 'D' && hb.state.ex === 'sentenceScramble');
  ok('queued exercise event carries the page-session stamp', sandbox.analyticsQueue[0].ps === hb.ps);
  // Simulate the kill: no csCleanUnload marker; next page load begins.
  vm.runInContext(`
    authActiveUser.analytics = []; // server never saw the tail
    analyticsQueue = [];
    csNewPageSession();            // NEW page load (kill survivor)
    csRestartDetectionDone = false;
    csDetectRestartAndQueueDiagnostic();
  `, sandbox);
  const restartEvents = sandbox.analyticsQueue.filter(e => e.diagnostic === 'restart');
  ok('next load queues exactly one restart diagnostic after a kill', restartEvents.length === 1);
  ok('restart diagnostic is dashboard-invisible type device', restartEvents[0].type === 'device');
  ok('diagnostic references the KILLED page session, not the new one',
     restartEvents[0].pageSessionId === hb.ps);
  // Self-breadcrumb regression (2026-08-26c): if detection ever reads THIS
  // page's own breadcrumb (same ps), it must NOT report a kill — that was
  // the 2026-08-26 field artifact (two bogus diagnostics with 0-second ages).
  vm.runInContext(`
    analyticsQueue = [];
    csPageHeartbeat({ mode: 'study' }); // this page's own breadcrumb
    csRestartDetectionDone = false;
    csDetectRestartAndQueueDiagnostic();
  `, sandbox);
  ok('self-breadcrumb (same ps) never reports a kill',
     sandbox.analyticsQueue.filter(e => e.diagnostic === 'restart').length === 0);
  // Graceful close path: pagehide marker set -> no diagnostic.
  vm.runInContext(`
    analyticsQueue = [];
    localStorage.setItem('csCleanUnload', '1');
    csRestartDetectionDone = false;
    csDetectRestartAndQueueDiagnostic();
  `, sandbox);
  ok('graceful unload (pagehide marker) yields no diagnostic',
     sandbox.analyticsQueue.filter(e => e.diagnostic === 'restart').length === 0);

  // ---- 3c. device signature (2026-08-26b, iPhone-vs-iPad experiment) ----
  // The login heartbeat stamps platform|touchpoints|browser into the
  // breadcrumb; a later kill must carry it in the diagnostic's pageState.dev
  // so iPad vs iPhone vs WeChat data separates without joining events.
  store = {};
  sandbox.authActiveUser = makeUser();
  vm.runInContext('authActiveUser = __user; analyticsQueue = [];', Object.assign(sandbox, { __user: sandbox.authActiveUser }));
  vm.runInContext(`
    csNewPageSession();
    csPageHeartbeat({ dev: 'iPhone|tp5|wx' });
    csPageHeartbeat({ mode: 'study', round: 'D' }); // later merges must keep dev
    queueExerciseEvent('spelling', 'study');
  `, sandbox);
  const hb2 = JSON.parse(store['csPageHeartbeat']);
  ok('device signature survives later heartbeat merges', hb2.state.dev === 'iPhone|tp5|wx' && hb2.state.round === 'D');
  vm.runInContext(`
    authActiveUser.analytics = [];
    analyticsQueue = [];
    csNewPageSession(); // simulate the NEXT page load after the kill
    csRestartDetectionDone = false;
    csDetectRestartAndQueueDiagnostic();
  `, sandbox);
  const diag2 = sandbox.analyticsQueue.find(e => e.diagnostic === 'restart');
  ok('restart diagnostic carries the device signature', !!diag2 && diag2.pageState.dev === 'iPhone|tp5|wx');

  // ---- 4. sticky page-advance (2026-09-08, "Doris page-43 trap") ----
  // The in-memory advance evaporated when updateStudent failed; the next
  // finalizeSession re-ran the check at an incremented sessionCount, saw a
  // trickle of newly-due items, and re-decided "stay". Now the pending page
  // persists in localStorage and re-applies at login until confirmed.
  store = {};
  posts = [];
  sandbox.authActiveUser = makeUser();
  vm.runInContext('authActiveUser = __user; analyticsQueue = [];', Object.assign(sandbox, { __user: sandbox.authActiveUser }));
  // Directly exercise the persist/confirm contract: simulate an advance that
  // the server never confirms (fetch hang), then a fresh login.
  vm.runInContext(`
    authActiveUser.book = 'PU1'; authActiveUser.unit = '3'; authActiveUser.page = '43';
    localStorage.setItem('csPendingPageAdvance', JSON.stringify({ book: 'PU1', unit: '4', page: '48' }));
  `, sandbox);
  ok('pending page-advance persists across page loads', store['csPendingPageAdvance'] !== undefined);
  // Fresh login: reapply must restore the advanced page BEFORE the normal check.
  vm.runInContext(`
    authActiveUser.book = 'PU1'; authActiveUser.unit = '3'; authActiveUser.page = '43';
    reapplyPendingPageAdvance();
  `, sandbox);
  ok('reapply restores the pending page (not re-litigated)',
     sandbox.authActiveUser.unit === '4' && sandbox.authActiveUser.page === '48');
  // reapply fires updateStudent fire-and-forget (async apiFetch chain resolves
  // after getAppKey); flush microtasks before asserting the POST landed.
  await new Promise(r => setTimeout(r, 50));
  ok('reapply re-sends updateStudent until confirmed',
     posts.some(p => p.url.includes('/updateStudent') && String(p.body).includes('"page":"48"')));

  // ---- 5. drain report (2026-09-08, "session-1 ghost") ----
  // At login, before this login's own events, a queueDrain snapshot describes
  // the backlog (queue length, oldest timestamp, pending SR/increment) so the
  // next login after any silent completion-flush failure is self-describing.
  store = {};
  posts = [];
  sandbox.authActiveUser = makeUser();
  vm.runInContext('authActiveUser = __user; analyticsQueue = [];', Object.assign(sandbox, { __user: sandbox.authActiveUser }));
  // Backlog from a killed session: 1 session event + 2 exercises + pending SR.
  vm.runInContext(`
    queueSessionEvent('study', { durationMs: 425000, durationFormatted: '7m 5s' });
    queueExerciseEvent('wordScramble', 'study');
    queueExerciseEvent('spelling', 'study');
    srPendingState = { vocab: {} }; srIncrementSession = true;
    localStorage.setItem('csPendingSRState', JSON.stringify({ vocab: {} }));
    localStorage.setItem('csPendingSRIncrement', '1');
  `, sandbox);
  const backlogLen = sandbox.analyticsQueue.length;
  vm.runInContext('queueDrainReportEvent();', sandbox);
  const drain = sandbox.analyticsQueue.find(e => e.diagnostic === 'queueDrain');
  ok('drain report queued at login', !!drain);
  ok('drain report counts the backlog (session + exercises)',
     !!drain && drain.queueLen === backlogLen && drain.nSession === 1 && drain.nExercise === 2);
  ok('drain report carries the oldest queued timestamp',
     !!drain && typeof drain.oldestQueuedTs === 'string');
  ok('drain report flags pending SR state + session increment',
     !!drain && drain.pendingSR === true && drain.pendingIncr === true);
  ok('drain report is dashboard-invisible (type device)', !!drain && drain.type === 'device');
  // Clean device: no backlog, no pending SR -> silent (no noise in the diag doc).
  vm.runInContext('analyticsQueue = []; srPendingState = null; srIncrementSession = false;', sandbox);
  try { delete store['csPendingSRState']; delete store['csPendingSRIncrement']; } catch { /* noop */ }
  const lenBefore = sandbox.analyticsQueue.length;
  vm.runInContext('queueDrainReportEvent();', sandbox);
  ok('drain report stays silent on a clean device',
     sandbox.analyticsQueue.length === lenBefore);

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(1); });
