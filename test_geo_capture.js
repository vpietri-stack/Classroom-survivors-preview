// Tests for passive geolocation capture (2026-09-25 student-geolocation spec):
//   1. csGeoRound — client-side ~1km rounding BEFORE enqueue (privacy).
//   2. csMaybeCaptureGeo — gating: ok-flag stops capture; fail retries EVERY
//      login (user-mandated); test mode and missing geolocation are no-ops.
//   3. Success enqueues a type:'geo' event with rounded coords + eventId.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, 'sr_engine.js'), 'utf8')
  + '\n' + fs.readFileSync(path.join(__dirname, 'teaching_content.js'), 'utf8')
  + '\n' + fs.readFileSync(path.join(__dirname, 'frontend_auth.js'), 'utf8');

// Backing store for the localStorage stub. It lives ON the VM context (not in
// a Node-side `let`) because the driver's `store = {}` resets execute INSIDE
// the VM — a global rebinding there only clears the store the stub reads if
// the stub reads it back through the contextified sandbox object.
const localStorageStub = {
  getItem: (k) => (k in context.store ? context.store[k] : null),
  setItem: (k, v) => { context.store[k] = String(v); },
  removeItem: (k) => { delete context.store[k]; }
};

// geoCalls / geoBehavior live ON the context for the same reason as `store`:
// the stub (Node side) increments/reads them, and the driver (VM side) reads
// geoCalls and rebinds geoBehavior — the shared home is the sandbox object.
const navigatorStub = {
  userAgent: 'test', platform: 'test', maxTouchPoints: 0,
  // sendBeacon stub (from test_session_flush_deadline.js): the beacon flush
  // path records its POST here instead of silently skipping.
  sendBeacon: () => true,
  get geolocation() {
    if (context.geoBehavior === 'absent') return undefined;
    return {
      getCurrentPosition(ok, err) {
        context.geoCalls++;
        if (context.geoBehavior === 'success') ok({ coords: { latitude: 25.045678, longitude: 102.712345 } });
        else err({ code: 1, message: 'denied' });
      }
    };
  }
};

const context = {
  store: {}, // localStorage backing store (see localStorageStub above)
  geoCalls: 0,
  geoBehavior: 'success', // 'success' | 'fail' | 'absent'
  document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {}, createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {} }), body: { appendChild() {} } },
  navigator: navigatorStub,
  localStorage: localStorageStub,
  window: { addEventListener: () => {}, location: { href: '' } },
  location: { href: '' },
  console, fetch: () => Promise.resolve({ ok: true, json: async () => ({}) }),
  setTimeout, clearTimeout, setInterval: () => 0, clearInterval, Math, JSON, Date, Promise, Array, Object, String, Number, isNaN, parseInt, parseFloat, RegExp, Error, Set, Map,
  // Stubs copied from test_session_flush_deadline.js (the working reference for
  // this VM-blob pattern) that the brief's list lacked: frontend_auth.js reads
  // API_BASE_URL at module top (line 2), apiFetch awaits getAppKey, and the
  // beacon flush path constructs a Blob + URLSearchParams query string.
  API_BASE_URL: 'http://test.local/api',
  getAppKey: () => Promise.resolve('test-key'),
  Blob: class { constructor(parts) { this._text = Array.isArray(parts) ? parts.join('') : String(parts); } },
  URLSearchParams,
  __pass: 0, __fail: 0,
  report(name, cond) { if (cond) { context.__pass++; console.log('  PASS', name); } else { context.__fail++; console.log('  FAIL', name); } }
};
vm.createContext(context);

const driver = `
var isTestMode = false;
${src}

(function runTests() {
  // --- csGeoRound ---
  report('rounds to 2 decimals', csGeoRound(25.045678) === 25.05 && csGeoRound(102.712345) === 102.71);
  report('negative coords round symmetric', csGeoRound(-25.045678) === -25.05);

  // --- no user: no-op ---
  authActiveUser = null;
  csMaybeCaptureGeo();
  report('no active user: geolocation never called', geoCalls === 0);

  // --- test mode: no-op ---
  authActiveUser = { id: 'stu1', fullName: 'A' };
  isTestMode = true;
  csMaybeCaptureGeo();
  report('test mode: geolocation never called', geoCalls === 0);
  isTestMode = false;

  // --- success path ---
  analyticsQueue.length = 0;
  csMaybeCaptureGeo();
  var geoEvts = analyticsQueue.filter(function(e){ return e.type === 'geo'; });
  report('success: one geo event enqueued', geoEvts.length === 1);
  report('success: coords rounded BEFORE enqueue', geoEvts[0] && geoEvts[0].lat === 25.05 && geoEvts[0].lng === 102.71);
  report('success: event has eventId/ownerId/timestamp', !!(geoEvts[0] && geoEvts[0].eventId && geoEvts[0].ownerId === 'stu1' && geoEvts[0].timestamp));
  var flag = JSON.parse(localStorage.getItem('csGeoDone_stu1') || 'null');
  report('success: ok flag persisted', flag && flag.status === 'ok');

  // --- ok flag stops further capture ---
  var callsBefore = geoCalls;
  csMaybeCaptureGeo();
  report('ok flag: geolocation not called again', geoCalls === callsBefore);

  // --- failure path: flag set, retries every login ---
  store = {};
  analyticsQueue.length = 0;
  geoBehavior = 'fail';
  csMaybeCaptureGeo();
  flag = JSON.parse(localStorage.getItem('csGeoDone_stu1') || 'null');
  report('failure: fail flag persisted', flag && flag.status === 'fail');
  report('failure: nothing enqueued', analyticsQueue.filter(function(e){ return e.type === 'geo'; }).length === 0);
  csMaybeCaptureGeo(); // next "login"
  report('failure: retries on every login', geoCalls === callsBefore + 2);

  // --- fail -> later success flips flag ---
  geoBehavior = 'success';
  csMaybeCaptureGeo();
  flag = JSON.parse(localStorage.getItem('csGeoDone_stu1') || 'null');
  report('fail-then-success: flag becomes ok', flag && flag.status === 'ok');

  // --- no geolocation API: fail flag, no throw ---
  store = {};
  geoBehavior = 'absent';
  try { csMaybeCaptureGeo(); report('missing geolocation API: no throw, fail flag set',
      JSON.parse(localStorage.getItem('csGeoDone_stu1') || 'null').status === 'fail'); }
  catch (e) { report('missing geolocation API: no throw, fail flag set', false); }
})();
`;

vm.runInContext(driver, context);
console.log(`\n${context.__pass} passed, ${context.__fail} failed`);
if (context.__fail > 0) process.exit(1);
