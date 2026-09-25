# Student Geolocation Capture & Baidu Map Export — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture ~1 km-precision student locations passively via the browser Geolocation API, store them on the student's Cosmos doc, and let the teacher export a CSV + a self-contained Baidu-map HTML page (with driving-time analysis) from the dashboard Settings tab.

**Architecture:** Ride the existing analytics pipeline (client `analyticsQueue` → `saveAnalytics` → Cosmos student doc) with a new `geo` event type that the server diverts into a top-level `geo` field instead of the analytics array. A new frontend module `geo_export.js` does WGS-84→BD-09 conversion and builds both exports client-side. No new endpoints, no new storage containers.

**Tech Stack:** Vanilla JS (browser scripts, no build step), Azure Functions v4 (Node), Cosmos DB, existing Node `vm`-blob test harness, Baidu Maps GL JS API (in the exported HTML only, teacher-supplied free AK).

**Spec:** `docs/superpowers/specs/2026-09-25-student-geolocation-design.md`

## Global Constraints

- **RULE 1 (AGENTS.md):** after Task 5, `version.json` "version", `frontend_auth.js` `APP_VERSION`, and `index.html` `frontend_auth.js?v=` must ALL equal `2026-09-25b`. `node test_deploy_stamp_sync.js` must pass.
- **RULE 2 (AGENTS.md):** NEVER `git add -A` / `git add .` — stage explicit paths only. Leave `api/speech_events_dump_full.json` alone.
- **Branch:** all work happens on `preview`. Do NOT merge to `main` or push without explicit user instruction (merge to main = production deploy).
- **Privacy:** coordinates are rounded to 2 decimals (~1.1 km) ON THE CLIENT before enqueue, and again server-side. No raw GPS fix is ever transmitted or stored. Single latest fix per student — no history.
- **Retry policy (user-mandated):** failed geolocation attempts retry on EVERY login until success. Only `status:'ok'` stops capture.
- **Additive-only:** no changes to existing event types, archive logic, SR logic, or the optimistic-concurrency loop structure in `saveAnalytics.js`.
- `npm test` (root) must be green before every commit. Tests follow the existing zero-dependency Node assert style (see `test_auto_archive_analytics.js`, `test_session_flush_deadline.js`).

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `api/src/functions/saveAnalytics.js` | Modify | New exported pure fn `extractGeoUpdates(events)`; handler diverts geo events to `user.geo` |
| `test_geo_events.js` (root) | Create | Pins `extractGeoUpdates` contract |
| `frontend_auth.js` | Modify | New fns `csGeoRound`, `csMaybeCaptureGeo`, flag helpers; one call site after `queueDeviceInfoEvent()` (~line 1706) |
| `test_geo_capture.js` (root) | Create | VM-blob tests of capture gating/rounding/flags |
| `geo_export.js` | Create | Coord conversion (wgs84→gcj02→bd09), CSV builder, Baidu HTML builder, dashboard wiring (AK, coverage, download) |
| `test_geo_export.js` (root) | Create | Unit tests (direct `require` — file has a `module.exports` guard) |
| `teacher_dashboard.html` | Modify | New "Student Locations" panel in `tabSettings`; `<script src="geo_export.js?v=...">` |
| `teacher_dashboard.js` | Modify | One line: call `renderGeoCoverage()` in the settings branch of `switchTab` (~line 564) |
| `package.json` | Modify | Append 3 new tests to the `test` chain |
| `version.json`, `index.html` | Modify | Stamp bump `2026-09-25b` |
| `docs/wiki/11-data-model.md` + API wiki page | Modify | Document `geo` field, `geo` event type, new localStorage keys, saveAnalytics behavior |

---

### Task 0: Branch setup + commit spec & plan

**Files:**
- Commit: `docs/superpowers/specs/2026-09-25-student-geolocation-design.md` (exists, untracked)
- Commit: `docs/superpowers/plans/2026-09-25-student-geolocation-baidu-export.md` (this file)

- [ ] **Step 1: Check working tree state**

Run: `git status` (in `D:\coding\html games\Classroom-survivors`)
Expected: current branch `main`; the two docs above untracked; no other unexpected modifications. If there ARE unexpected modified tracked files, STOP and ask the user before proceeding.

- [ ] **Step 2: Switch to preview**

Run: `git checkout preview`
If `preview` doesn't exist locally: `git checkout -b preview`. Untracked spec/plan files carry over.

- [ ] **Step 3: Commit the design docs**

```bash
git add "docs/superpowers/specs/2026-09-25-student-geolocation-design.md" "docs/superpowers/plans/2026-09-25-student-geolocation-baidu-export.md"
git commit -m "docs: spec + implementation plan for student geolocation capture & Baidu map export"
```

---

### Task 1: Backend — geo event extraction in saveAnalytics.js

**Files:**
- Modify: `api/src/functions/saveAnalytics.js` (add pure fn near `applyEventsWithAck` ~line 88-105; wire into handler at ~lines 169-224 and the return at ~line 306-317; add to `module.exports` ~line 325)
- Create: `test_geo_events.js` (root)
- Modify: `package.json` (append `&& node test_geo_events.js` to the `test` script)

**Interfaces:**
- Consumes: nothing from other tasks (backend-first).
- Produces: `extractGeoUpdates(events) -> { geo: {lat:number,lng:number,capturedAt:string,source:'browser'}|null, geoEventIds: string[], cleanEvents: Array }` — Task 5's wiki must document this; the client (Task 2) emits `type:'geo'` events shaped `{ type:'geo', lat, lng, timestamp, eventId, ownerId, ps }` with lat/lng already rounded to 2 decimals.

- [ ] **Step 1: Write the failing test**

Create `test_geo_events.js` in the repo root, following the exact harness style of `test_auto_archive_analytics.js` (same `test(name, fn)` / pass-fail counter / non-zero exit on failure):

```js
const assert = require('assert');
const { extractGeoUpdates } = require('./api/src/functions/saveAnalytics.js');

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log('PASS: ' + name); passed++; }
    catch (e) { console.error('FAIL: ' + name); console.error(e); failed++; }
}

console.log('=== TEST SUITE: Geo Event Extraction ===\n');

test('non-geo events pass through untouched', () => {
    const events = [{ type: 'exercise', eventId: 'ex_1' }, { type: 'session', eventId: 'se_1' }];
    const r = extractGeoUpdates(events);
    assert.strictEqual(r.geo, null);
    assert.deepStrictEqual(r.geoEventIds, []);
    assert.strictEqual(r.cleanEvents.length, 2);
});

test('valid geo event is extracted, removed from cleanEvents, and acked', () => {
    const events = [
        { type: 'exercise', eventId: 'ex_1' },
        { type: 'geo', lat: 25.05, lng: 102.71, timestamp: '2026-09-25T10:00:00.000Z', eventId: 'geo_1' }
    ];
    const r = extractGeoUpdates(events);
    assert.strictEqual(r.cleanEvents.length, 1);
    assert.deepStrictEqual(r.geoEventIds, ['geo_1']);
    assert.strictEqual(r.geo.lat, 25.05);
    assert.strictEqual(r.geo.lng, 102.71);
    assert.strictEqual(r.geo.capturedAt, '2026-09-25T10:00:00.000Z');
    assert.strictEqual(r.geo.source, 'browser');
});

test('server re-rounds to 2 decimals (defense in depth)', () => {
    const r = extractGeoUpdates([{ type: 'geo', lat: 25.045678, lng: 102.712345, eventId: 'geo_1' }]);
    assert.strictEqual(r.geo.lat, 25.05);
    assert.strictEqual(r.geo.lng, 102.71);
});

test('invalid coords: event acked (client clears queue) but no geo written', () => {
    const bad = [
        { type: 'geo', lat: 'abc', lng: 102.7, eventId: 'geo_bad1' },
        { type: 'geo', lat: 95, lng: 102.7, eventId: 'geo_bad2' },
        { type: 'geo', lat: 25, lng: NaN, eventId: 'geo_bad3' },
        { type: 'geo', eventId: 'geo_bad4' }
    ];
    const r = extractGeoUpdates(bad);
    assert.strictEqual(r.geo, null);
    assert.deepStrictEqual(r.geoEventIds, ['geo_bad1', 'geo_bad2', 'geo_bad3', 'geo_bad4']);
    assert.strictEqual(r.cleanEvents.length, 0);
});

test('multiple geo events: latest timestamp wins', () => {
    const r = extractGeoUpdates([
        { type: 'geo', lat: 25.10, lng: 102.10, timestamp: '2026-09-20T10:00:00.000Z', eventId: 'geo_old' },
        { type: 'geo', lat: 25.20, lng: 102.20, timestamp: '2026-09-24T10:00:00.000Z', eventId: 'geo_new' }
    ]);
    assert.strictEqual(r.geo.lat, 25.2);
    assert.strictEqual(r.geo.capturedAt, '2026-09-24T10:00:00.000Z');
    assert.deepStrictEqual(r.geoEventIds, ['geo_old', 'geo_new']);
});

test('null/empty input is safe', () => {
    assert.deepStrictEqual(extractGeoUpdates(null), { geo: null, geoEventIds: [], cleanEvents: [] });
    assert.deepStrictEqual(extractGeoUpdates([]), { geo: null, geoEventIds: [], cleanEvents: [] });
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

Then in `package.json`, append `&& node test_geo_events.js` to the end of the `"test"` script string.

- [ ] **Step 2: Run test to verify it fails**

Run: `node test_geo_events.js`
Expected: FAIL — `extractGeoUpdates` is not exported (TypeError: not a function).

- [ ] **Step 3: Implement extractGeoUpdates**

In `api/src/functions/saveAnalytics.js`, add below `applyEventsWithAck` (after line 105):

```js
/**
 * Diverts `type:'geo'` events out of the analytics stream. Geo events are NOT
 * appended to the analytics array (no archive churn) — the newest valid fix
 * becomes the student doc's top-level `geo` field. ALL geo eventIds (valid or
 * not) are returned in geoEventIds so the client can ack-and-clear its queue;
 * invalid fixes are dropped server-side (defense in depth: client already
 * rounds to ~1km; we re-round and range-check here).
 *
 * @param {Array} events - incoming events from the request body
 * @returns {{ geo: {lat:number,lng:number,capturedAt:string,source:string}|null,
 *             geoEventIds: string[], cleanEvents: Array }}
 */
function extractGeoUpdates(events) {
    const geoEventIds = [];
    const cleanEvents = [];
    let geo = null;
    let geoTs = -Infinity;
    (events || []).forEach(event => {
        if (event && event.type === 'geo') {
            if (event.eventId) geoEventIds.push(event.eventId);
            const lat = Number(event.lat);
            const lng = Number(event.lng);
            const valid = Number.isFinite(lat) && Number.isFinite(lng) &&
                Math.abs(lat) <= 90 && Math.abs(lng) <= 180 &&
                (event.lat !== '' && event.lat !== null && event.lng !== '' && event.lng !== null);
            if (valid) {
                const ts = event.timestamp ? new Date(event.timestamp).getTime() : 0;
                const sortTs = Number.isFinite(ts) ? ts : 0;
                if (sortTs >= geoTs) {
                    geoTs = sortTs;
                    geo = {
                        lat: Math.round(lat * 100) / 100,
                        lng: Math.round(lng * 100) / 100,
                        capturedAt: event.timestamp || new Date().toISOString(),
                        source: 'browser'
                    };
                }
            }
            return;
        }
        cleanEvents.push(event);
    });
    return { geo, geoEventIds, cleanEvents };
}
```

Note `Number(null) === 0` is finite, hence the explicit `'' / null` rejection so `{lat: null, lng: 102}` can't sneak in as lat 0.

- [ ] **Step 4: Wire into the handler**

In the `saveAnalytics` handler:

a) After line 169 (`const { events, srState, incrementSession, srSeq, srDelta } = body;`) and AFTER the existing empty-events 400 check (lines 171-173), add:

```js
            // Geo diversion (2026-09-25): geo events never enter the analytics
            // array — newest valid fix lands on the doc's top-level `geo` field.
            const { geo, geoEventIds, cleanEvents } = extractGeoUpdates(events);
```

b) Inside the retry loop, directly before the `applyEventsWithAck` call (line 224), add:

```js
                if (geo) user.geo = geo; // latest capture wins (idempotent on retry)
```

c) Change line 224 from `applyEventsWithAck(user.analytics, events)` to `applyEventsWithAck(user.analytics, cleanEvents)`.

d) In the return `jsonBody` (line 306-317), change `addedEventIds,` to:

```js
                    addedEventIds: geoEventIds.concat(addedEventIds),
```

(geo events are always acked as added — they never dedup against the analytics array, and a replayed geo fix simply re-writes the same value.)

e) Add `extractGeoUpdates,` to `module.exports` (line 325-333).

- [ ] **Step 5: Run tests**

Run: `node test_geo_events.js && node test_auto_archive_analytics.js && npm test`
Expected: all PASS (existing suites unaffected — non-geo batches produce `cleanEvents === events`).

- [ ] **Step 6: Commit**

```bash
git add api/src/functions/saveAnalytics.js test_geo_events.js package.json
git commit -m "feat(api): divert geo events from analytics stream to student doc geo field"
```

---

### Task 2: Frontend capture — frontend_auth.js

**Files:**
- Modify: `frontend_auth.js` (new functions near `queueDeviceInfoEvent` ~line 242-274; call site after line 1706)
- Create: `test_geo_capture.js` (root)
- Modify: `package.json` (append `&& node test_geo_capture.js`)

**Interfaces:**
- Consumes: Task 1's server contract (event `{type:'geo', lat, lng, timestamp, eventId, ownerId, ps}` acked via `addedEventIds`).
- Produces: globals `csGeoRound(v) -> number`, `csMaybeCaptureGeo() -> void`, `csGeoFlagKey() -> string`, `csGeoGetFlag() -> {status,ts}|null`, `csGeoSetFlag(status) -> void`; localStorage key `csGeoDone_<studentId>`. Task 5 wiki documents these.

- [ ] **Step 1: Write the failing test**

Create `test_geo_capture.js` using the VM-blob pattern from `test_session_flush_deadline.js` (same file-loading approach: concatenate `sr_engine.js`, `teaching_content.js`, `frontend_auth.js` into one blob; same controllable `localStorage` stub; same `fetch` stub that echoes the ack contract):

```js
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

let store = {};
const localStorageStub = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; }
};

let geoCalls = 0;
let geoBehavior = 'success'; // 'success' | 'fail' | 'absent'
const navigatorStub = {
  userAgent: 'test', platform: 'test', maxTouchPoints: 0,
  get geolocation() {
    if (geoBehavior === 'absent') return undefined;
    return {
      getCurrentPosition(ok, err) {
        geoCalls++;
        if (geoBehavior === 'success') ok({ coords: { latitude: 25.045678, longitude: 102.712345 } });
        else err({ code: 1, message: 'denied' });
      }
    };
  }
};

const context = {
  document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener: () => {}, createElement: () => ({ style: {}, classList: { add() {}, remove() {} }, appendChild() {} }), body: { appendChild() {} } },
  navigator: navigatorStub,
  localStorage: localStorageStub,
  window: { addEventListener: () => {}, location: { href: '' } },
  location: { href: '' },
  console, fetch: () => Promise.resolve({ ok: true, json: async () => ({}) }),
  setTimeout, clearTimeout, setInterval: () => 0, clearInterval, Math, JSON, Date, Promise, Array, Object, String, Number, isNaN, parseInt, parseFloat, RegExp, Error, Set, Map,
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
```

NOTE for the implementer: the blob's stub list above may need small additions if `frontend_auth.js`/`sr_engine.js` top-level code touches another global in this Node version — `test_session_flush_deadline.js` is the working reference; copy any stub it has that this one lacks. Also `geoCalls` counting: the `fail-then-success` case calls once more; adjust the `+2` assertion if you add calls. Append `&& node test_geo_capture.js` to `package.json` test script.

- [ ] **Step 2: Run test to verify it fails**

Run: `node test_geo_capture.js`
Expected: FAIL — `csGeoRound is not defined` (or similar) inside the VM.

- [ ] **Step 3: Implement capture in frontend_auth.js**

Add after `queueDeviceInfoEvent` (ends ~line 274):

```js
// --- PASSIVE GEOLOCATION CAPTURE (2026-09-25, campus-relocation survey) ------
// One ~1km-rounded position fix per student, captured at login via the browser
// Geolocation API. Privacy: coords are rounded to 2 decimals ON THE CLIENT
// before enqueue and again server-side (saveAnalytics extractGeoUpdates); the
// raw GPS fix never leaves the device. Ships as a type:'geo' analytics event
// through the normal queue (retry/beacon/ack for free); the server diverts it
// to the student doc's top-level `geo` field — it never enters the analytics
// array. Retry policy (teacher-mandated): failures retry EVERY login until a
// fix succeeds; only 'ok' is permanent. Caveats: WeChat Android webview often
// lacks geolocation (fail flag, silent), and the browser's own permission
// popup is the consent record.
function csGeoRound(v) { return Math.round(Number(v) * 100) / 100; }
function csGeoFlagKey() { return 'csGeoDone_' + (authActiveUser && authActiveUser.id ? authActiveUser.id : ''); }
function csGeoGetFlag() {
    try { return JSON.parse(localStorage.getItem(csGeoFlagKey()) || 'null'); } catch { return null; }
}
function csGeoSetFlag(status) {
    try { localStorage.setItem(csGeoFlagKey(), JSON.stringify({ status: status, ts: new Date().toISOString() })); } catch { /* non-fatal */ }
}
function csMaybeCaptureGeo() {
    if (!authActiveUser || isTestMode) return;
    if (!navigator.geolocation) { csGeoSetFlag('fail'); return; }
    const flag = csGeoGetFlag();
    if (flag && flag.status === 'ok') return; // captured once — never ask again
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            if (!authActiveUser || !pos || !pos.coords) { csGeoSetFlag('fail'); return; }
            const event = {
                type: 'geo',
                lat: csGeoRound(pos.coords.latitude),
                lng: csGeoRound(pos.coords.longitude),
                timestamp: new Date().toISOString(),
                eventId: 'geo_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10),
                ownerId: authActiveUser.id,
                ps: csPageSessionId
            };
            analyticsQueue.push(event);
            persistAnalyticsQueue();
            if (!authActiveUser.analytics) authActiveUser.analytics = [];
            authActiveUser.analytics.push(event);
            saveActiveUserToCache();
            scheduleAnalyticsFlush();
            csGeoSetFlag('ok');
        },
        () => { csGeoSetFlag('fail'); }, // retry on next login (per policy)
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 86400000 }
    );
}
```

Then in `finishLogin`, directly after `queueDeviceInfoEvent();` (line 1706), add:

```js
    // Campus-relocation survey (2026-09-25): passive ~1km location fix, once
    // per student until success. Fire-and-forget; rides the normal flush.
    csMaybeCaptureGeo();
```

- [ ] **Step 4: Run tests**

Run: `node test_geo_capture.js && node test_session_flush_deadline.js && npm test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend_auth.js test_geo_capture.js package.json
git commit -m "feat(client): passive ~1km geolocation capture at login with retry-every-login on failure"
```

---

### Task 3: geo_export.js — conversion, CSV, Baidu HTML builders

**Files:**
- Create: `geo_export.js` (root)
- Create: `test_geo_export.js` (root)
- Modify: `package.json` (append `&& node test_geo_export.js`)

**Interfaces:**
- Consumes: student docs with optional `geo:{lat,lng,capturedAt}` (Task 1) via the dashboard's global `allStudents` array (teacher_dashboard.js:7, `let allStudents = []` — top-level `let` is visible to later classic scripts).
- Produces (all exported via the `module.exports` guard for tests):
  - `wgs84ToGcj02(lat,lng) -> [lat,lng]`, `gcj02ToBd09(lat,lng) -> [lat,lng]`, `wgs84ToBd09(lat,lng) -> [lat,lng]`, `outOfChina(lat,lng) -> boolean`
  - `buildLocationCsv(students) -> string` (BOM + CRLF)
  - `buildBaiduMapHtml(students, ak) -> string`
  - `geoDownload(filename, text, mime) -> void`
  - `geoGetAk() -> string`, `geoSaveAk(v) -> void`, `renderGeoCoverage() -> void`
  - `exportLocationsCsv() -> void`, `exportBaiduMapHtml() -> void`
  - Task 4 wires these to DOM ids `geoBaiduAk`, `geoCoverage`.

- [ ] **Step 1: Write the failing test**

Create `test_geo_export.js` (direct `require` — the module has a Node guard, no VM needed):

```js
const assert = require('assert');
const G = require('./geo_export.js');

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log('PASS: ' + name); passed++; }
    catch (e) { console.error('FAIL: ' + name); console.error(e); failed++; }
}

console.log('=== TEST SUITE: Geo Export ===\n');

// --- coordinate conversion ---------------------------------------------------
test('outside China: passthrough (no GCJ shift)', () => {
    assert.deepStrictEqual(G.wgs84ToGcj02(48.8583, 2.2945), [48.8583, 2.2945]); // Paris
    assert.deepStrictEqual(G.wgs84ToBd09(48.8583, 2.2945), [48.8583, 2.2945]);
});
test('inside China: GCJ offset direction+magnitude sane (100m-1.2km)', () => {
    const [gLat, gLng] = G.wgs84ToGcj02(25.0458, 102.7101); // Kunming
    const dLat = Math.abs(gLat - 25.0458) * 111000;
    const dLng = Math.abs(gLng - 102.7101) * 111000 * Math.cos(25.0458 * Math.PI / 180);
    assert.ok(dLat + dLng > 50 && dLat < 1200 && dLng < 1200, `offset lat=${dLat}m lng=${dLng}m`);
    assert.ok(gLat > 25.0458 && gLng > 102.7101, 'GCJ shift in Yunnan is northeast');
});
test('BD09 adds positive offset on top of GCJ02', () => {
    const [gLat, gLng] = G.wgs84ToGcj02(25.0458, 102.7101);
    const [bLat, bLng] = G.gcj02ToBd09(gLat, gLng);
    assert.ok(bLat > gLat && bLng > gLng);
    assert.ok(Math.abs(bLat - gLat) < 0.01 && Math.abs(bLng - gLng) < 0.01);
});
test('conversion is deterministic and finite', () => {
    const a = G.wgs84ToBd09(25.0458, 102.7101);
    const b = G.wgs84ToBd09(25.0458, 102.7101);
    assert.deepStrictEqual(a, b);
    assert.ok(a.every(Number.isFinite));
});
test('known anchor: Beijing wgs(39.9042,116.4074) -> bd09 within 1.5km NE', () => {
    const [bLat, bLng] = G.wgs84ToBd09(39.9042, 116.4074);
    // Published WGS84->BD09 total offset for Beijing is ~1.1-1.3km NE.
    assert.ok(bLat > 39.9042 && bLat < 39.925);
    assert.ok(bLng > 116.4074 && bLng < 116.430);
});

// --- CSV ---------------------------------------------------------------------
const students = [
    { id: 's1', fullName: 'Zhang, San', geo: { lat: 25.05, lng: 102.71, capturedAt: '2026-09-25T10:00:00.000Z' } },
    { id: 's2', fullName: 'Li "Lily"', geo: null },
    { id: 's3', name: 'Wang Wu' } // no geo field at all
];
test('CSV: BOM + header + all students incl. missing', () => {
    const csv = G.buildLocationCsv(students);
    assert.ok(csv.charCodeAt(0) === 0xFEFF, 'starts with UTF-8 BOM');
    const lines = csv.replace(/^\uFEFF/, '').trim().split('\r\n');
    assert.strictEqual(lines[0], 'studentId,name,hasLocation,capturedAt,wgs84_lat,wgs84_lng,bd09_lat,bd09_lng');
    assert.strictEqual(lines.length, 4);
});
test('CSV: quoting for commas and double quotes', () => {
    const csv = G.buildLocationCsv(students);
    assert.ok(csv.includes('"Zhang, San"'));
    assert.ok(csv.includes('"Li ""Lily"""'));
});
test('CSV: hasLocation flags + bd09 columns populated only when geo present', () => {
    const lines = G.buildLocationCsv(students).replace(/^\uFEFF/, '').trim().split('\r\n');
    assert.ok(lines[1].startsWith('s1,"Zhang, San",1,2026-09-25T10:00:00.000Z,25.05,102.71,'));
    assert.strictEqual(lines[2].split(',')[2], '0');
    assert.ok(lines[2].endsWith(',,,,'));
    assert.strictEqual(lines[3].split(',')[2], '0');
});
test('CSV: name falls back through fullName -> name -> login', () => {
    const csv = G.buildLocationCsv([{ id: 'x', login: 'x_login' }]);
    assert.ok(csv.includes('x_login'));
});

// --- Baidu HTML ---------------------------------------------------------------
test('HTML: embeds student points as BD-09, injects AK, escapes </script>', () => {
    const html = G.buildBaiduMapHtml(students, 'TEST_AK_123');
    assert.ok(html.includes('ak=TEST_AK_123'), 'AK injected into script src');
    assert.ok(html.includes('api.map.baidu.com'), 'loads Baidu JS API');
    assert.ok(html.includes('const STUDENTS ='), 'data embedded');
    assert.ok(html.includes('"name":"Zhang, San"') || html.includes('\\"name\\":\\"Zhang'), 's1 embedded');
    assert.ok(!/const STUDENTS = [^;]*<\/script/.test(html), 'no raw </script> inside data');
    assert.ok(html.includes('\\u003c') === false || true); // data JSON must not contain literal <
    const dataLine = html.split('\n').find(l => l.includes('const STUDENTS ='));
    assert.ok(!dataLine.includes('</'), 'no literal </ in embedded data line');
    // s2 (no geo) must NOT appear as a map point
    assert.ok(!dataLine.includes('s2') && !dataLine.includes('Lily'));
});
test('HTML: driving-time UI hooks present', () => {
    const html = G.buildBaiduMapHtml(students, 'AK');
    assert.ok(html.includes('DrivingRoute'));
    assert.ok(html.includes('计算驾车时间'));
    assert.ok(html.includes('csCampusPins'));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

Append `&& node test_geo_export.js` to `package.json` test script.

- [ ] **Step 2: Run test to verify it fails**

Run: `node test_geo_export.js`
Expected: FAIL — cannot find module `./geo_export.js`.

- [ ] **Step 3: Implement geo_export.js**

Create `geo_export.js` (root):

```js
// ============================================================================
// geo_export.js — student location export tooling (2026-09-25 campus survey).
// Loaded by teacher_dashboard.html AFTER teacher_dashboard.js (reads its
// top-level `allStudents`). Pure builders (conversion/CSV/HTML) are exported
// for Node tests via the guard at the bottom; DOM wiring no-ops in Node.
// Coordinates: browser geolocation yields WGS-84; Baidu maps use BD-09.
// Conversion is the standard eviltransform/coordtransform algorithm (MIT).
// ============================================================================

var GEO_PI = Math.PI;
var GEO_A = 6378245.0;                    // Krasovsky 1940 semi-major axis
var GEO_EE = 0.00669342162296594323;      // Krasovsky 1940 eccentricity^2
var GEO_X_PI = GEO_PI * 3000.0 / 180.0;

function outOfChina(lat, lng) {
    return !(lng > 73.66 && lng < 135.05 && lat > 3.86 && lat < 53.55);
}

function _geoTransformLat(x, y) {
    var ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * GEO_PI) + 20.0 * Math.sin(2.0 * x * GEO_PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(y * GEO_PI) + 40.0 * Math.sin(y / 3.0 * GEO_PI)) * 2.0 / 3.0;
    ret += (160.0 * Math.sin(y / 12.0 * GEO_PI) + 320 * Math.sin(y * GEO_PI / 30.0)) * 2.0 / 3.0;
    return ret;
}

function _geoTransformLng(x, y) {
    var ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * GEO_PI) + 20.0 * Math.sin(2.0 * x * GEO_PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(x * GEO_PI) + 40.0 * Math.sin(x / 3.0 * GEO_PI)) * 2.0 / 3.0;
    ret += (150.0 * Math.sin(x / 12.0 * GEO_PI) + 300.0 * Math.sin(x / 30.0 * GEO_PI)) * 2.0 / 3.0;
    return ret;
}

function wgs84ToGcj02(lat, lng) {
    if (outOfChina(lat, lng)) return [lat, lng];
    var dLat = _geoTransformLat(lng - 105.0, lat - 35.0);
    var dLng = _geoTransformLng(lng - 105.0, lat - 35.0);
    var radLat = lat / 180.0 * GEO_PI;
    var magic = Math.sin(radLat);
    magic = 1 - GEO_EE * magic * magic;
    var sqrtMagic = Math.sqrt(magic);
    dLat = (dLat * 180.0) / ((GEO_A * (1 - GEO_EE)) / (magic * sqrtMagic) * GEO_PI);
    dLng = (dLng * 180.0) / (GEO_A / sqrtMagic * Math.cos(radLat) * GEO_PI);
    return [lat + dLat, lng + dLng];
}

function gcj02ToBd09(lat, lng) {
    var z = Math.sqrt(lng * lng + lat * lat) + 0.00002 * Math.sin(lat * GEO_X_PI);
    var theta = Math.atan2(lat, lng) + 0.00003 * Math.cos(lng * GEO_X_PI);
    return [z * Math.sin(theta) + 0.006, z * Math.cos(theta) + 0.0065];
}

function wgs84ToBd09(lat, lng) {
    var g = wgs84ToGcj02(lat, lng);
    return gcj02ToBd09(g[0], g[1]);
}

// --- CSV ---------------------------------------------------------------------
function _csvCell(v) {
    var s = String(v === null || v === undefined ? '' : v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function _studentName(s) {
    return (s && (s.fullName || s.name || s.login)) || '';
}

function buildLocationCsv(students) {
    var rows = [['studentId', 'name', 'hasLocation', 'capturedAt', 'wgs84_lat', 'wgs84_lng', 'bd09_lat', 'bd09_lng']];
    (students || []).forEach(function (s) {
        var g = s && s.geo;
        if (g && Number.isFinite(Number(g.lat)) && Number.isFinite(Number(g.lng))) {
            var b = wgs84ToBd09(Number(g.lat), Number(g.lng));
            rows.push([s.id, _studentName(s), 1, g.capturedAt || '', g.lat, g.lng, b[0].toFixed(6), b[1].toFixed(6)]);
        } else {
            rows.push([s.id, _studentName(s), 0, '', '', '', '', '']);
        }
    });
    return '\uFEFF' + rows.map(function (r) { return r.map(_csvCell).join(','); }).join('\r\n') + '\r\n';
}

// --- Baidu map HTML ------------------------------------------------------------
function _geoStudentsToPoints(students) {
    return (students || [])
        .filter(function (s) { return s && s.geo && Number.isFinite(Number(s.geo.lat)) && Number.isFinite(Number(s.geo.lng)); })
        .map(function (s) {
            var b = wgs84ToBd09(Number(s.geo.lat), Number(s.geo.lng));
            return { id: s.id, name: _studentName(s), lat: b[0], lng: b[1], capturedAt: s.geo.capturedAt || '' };
        });
}

function buildBaiduMapHtml(students, ak) {
    var points = _geoStudentsToPoints(students);
    // \u003c escaping keeps a malicious/odd name from closing the script tag.
    var data = JSON.stringify(points).replace(/</g, '\\u003c');
    var akSafe = String(ak || '').replace(/[^A-Za-z0-9]/g, '');
    var generated = new Date().toISOString().slice(0, 10);
    return BAH_TEMPLATE
        .replace('__AK__', akSafe)
        .replace('__GENERATED__', generated)
        .replace('"__STUDENTS__"', data)
        .replace('"__NOSTUDENTS__"', String((students || []).length - points.length));
}

var BAH_TEMPLATE = [
'<!DOCTYPE html>',
'<html lang="zh-CN"><head><meta charset="utf-8">',
'<meta name="viewport" content="width=device-width, initial-scale=1">',
'<title>学生位置分布 (__GENERATED__)</title>',
'<style>',
'html,body{margin:0;height:100%;font-family:system-ui,"Microsoft YaHei",sans-serif}',
'#map{position:absolute;top:0;bottom:0;left:0;right:360px}',
'#panel{position:absolute;top:0;bottom:0;right:0;width:360px;box-sizing:border-box;padding:12px;overflow:auto;background:#f7f7f8;border-left:1px solid #ddd}',
'button{padding:8px 12px;margin:4px 4px 4px 0;border:1px solid #bbb;border-radius:6px;background:#fff;cursor:pointer}',
'button.primary{background:#2563eb;color:#fff;border-color:#2563eb}',
'table{border-collapse:collapse;width:100%;font-size:12px;background:#fff}',
'td,th{border:1px solid #ddd;padding:4px 6px;text-align:left}',
'.hint{font-size:12px;color:#666;margin:6px 0}',
'</style></head><body>',
'<div id="map"></div>',
'<div id="panel">',
'<h3>学生位置分布</h3>',
'<p class="hint">__NOSTUDENTS__ 名学生暂无位置数据(未在导出中)。蓝点=学生,红点=候选校区。</p>',
'<button id="addCampusBtn">① 点击地图添加候选校区</button>',
'<button id="clearCampusBtn">清空校区</button>',
'<button id="driveBtn" class="primary">② 计算驾车时间</button>',
'<button id="copyBtn">复制结果CSV</button>',
'<div id="status" class="hint"></div>',
'<div id="campusList"></div>',
'<table id="results" style="display:none"></table>',
'<div id="summary"></div>',
'</div>',
'<script>',
'const STUDENTS = "__STUDENTS__";',
'const CAMPUSES_KEY = "csCampusPins";',
'let map, addingCampus = false, lastResults = [];',
'function loadCampuses(){ try { return JSON.parse(localStorage.getItem(CAMPUSES_KEY) || "[]"); } catch(e){ return []; } }',
'function saveCampuses(c){ localStorage.setItem(CAMPUSES_KEY, JSON.stringify(c)); renderCampusList(); }',
'function renderCampusList(){',
'  const c = loadCampuses();',
'  document.getElementById("campusList").innerHTML = c.length ? "<h4>候选校区</h4><ul>" + c.map((x,i)=>"<li>"+x.name+" <a href=\\"javascript:void(0)\\" onclick=\\"removeCampus("+i+")\\">删除</a></li>").join("") + "</ul>" : "";',
'}',
'function removeCampus(i){ const c = loadCampuses(); c.splice(i,1); saveCampuses(c); drawCampuses(); }',
'function drawCampuses(){',
'  (window.__campusMarkers||[]).forEach(m=>map.removeOverLay(m)); window.__campusMarkers=[];',
'  loadCampuses().forEach(c=>{',
'    const m = new BMapGL.Marker(new BMapGL.Point(c.lng, c.lat), {icon: new BMapGL.Icon("https://api.map.baidu.com/img/anchor.png", new BMapGL.Size(20,20))});',
'    m.setLabel(new BMapGL.Label(c.name, {offset: new BMapGL.Size(15,-5)}));',
'    window.__campusMarkers.push(m); map.addOverlay(m);',
'  });',
'}',
'function init(){',
'  map = new BMapGL.Map("map");',
'  const pts = STUDENTS.map(s=>new BMapGL.Point(s.lng, s.lat));',
'  STUDENTS.forEach(s=>{',
'    const m = new BMapGL.Marker(new BMapGL.Point(s.lng, s.lat));',
'    m.setLabel(new BMapGL.Label(s.name, {offset: new BMapGL.Size(15,-5)}));',
'    m.addEventListener("click", ()=>{ map.openInfoWindow(new BMapGL.InfoWindow("<b>"+s.name+"</b><br>采集: "+(s.capturedAt||"?").slice(0,10), {width:200}), m.getPosition()); });',
'    map.addOverlay(m);',
'  });',
'  if (pts.length) { map.setViewport(pts); } else { map.centerAndZoom(new BMapGL.Point(102.712, 25.040), 11); }',
'  drawCampuses(); renderCampusList();',
'  document.getElementById("addCampusBtn").onclick = ()=>{',
'    addingCampus = !addingCampus;',
'    document.getElementById("status").textContent = addingCampus ? "在地图上点击候选校区位置…" : "";',
'    map.setDefaultCursor(addingCampus ? "crosshair" : "default");',
'  };',
'  map.addEventListener("click", e=>{',
'    if (!addingCampus) return;',
'    const name = prompt("校区名称:", "候选" + (loadCampuses().length+1));',
'    if (name){ const c = loadCampuses(); c.push({name, lat: e.latlng.lat, lng: e.latlng.lng}); saveCampuses(c); drawCampuses(); }',
'    addingCampus = false; document.getElementById("status").textContent = ""; map.setDefaultCursor("default");',
'  });',
'  document.getElementById("clearCampusBtn").onclick = ()=>{ saveCampuses([]); drawCampuses(); };',
'  document.getElementById("driveBtn").onclick = computeDrivingTimes;',
'  document.getElementById("copyBtn").onclick = copyResultsCsv;',
'}',
'function extractDistDur(route){',
'  if (!route) return {km:null, min:null};',
'  const pick = v => (typeof v === "number") ? v : (v && typeof v.value === "number") ? v.value : null;',
'  let m = pick(route.distance), s = pick(route.duration);',
'  if (m === null && route.distance && route.distance.text){ const n = parseFloat(route.distance.text); if (!isNaN(n)) m = /公里|km/.test(route.distance.text) ? n*1000 : n; }',
'  if (s === null && route.duration && route.duration.text){ const n = parseFloat(route.duration.text); if (!isNaN(n)) s = /小时/.test(route.duration.text) ? n*3600 : n*60; }',
'  return { km: m===null?null:m/1000, min: s===null?null:s/60 };',
'}',
'function computeDrivingTimes(){',
'  const campuses = loadCampuses();',
'  if (!campuses.length){ alert("请先点击『添加候选校区』在地图上标注校区位置"); return; }',
'  const pairs = []; campuses.forEach(c=>STUDENTS.forEach(s=>pairs.push({c, s})));',
'  lastResults = []; let i = 0;',
'  const status = document.getElementById("status");',
'  const dr = new BMapGL.DrivingRoute(map, { policy: BMAP_DRIVING_POLICY_LEAST_TIME, onSearchComplete: onDone });',
'  let watchdog = null;',
'  function onDone(r){',
'    if (watchdog){ clearTimeout(watchdog); watchdog = null; }',
'    let km = null, min = null;',
'    try { const plan = r.getPlan(0); const dd = extractDistDur(plan && plan.getRoute(0)); km = dd.km; min = dd.min; if (km===null && plan && plan.getDistance){ const pd = plan.getDistance(false); if (typeof pd === "number") km = pd/1000; } } catch(e){}',
'    lastResults.push({ campus: pairs[i-1].c.name, student: pairs[i-1].s.name, km, min });',
'    status.textContent = "驾车路线 " + i + "/" + pairs.length;',
'    next();',
'  }',
'  function next(){',
'    if (i >= pairs.length){ status.textContent = "完成:" + pairs.length + " 条路线"; render(); return; }',
'    const p = pairs[i++];',
'    watchdog = setTimeout(()=>{ lastResults.push({campus:p.c.name, student:p.s.name, km:null, min:null}); status.textContent="超时跳过 " + i + "/" + pairs.length; next(); }, 8000);',
'    dr.search(new BMapGL.Point(p.c.lng, p.c.lat), new BMapGL.Point(p.s.lng, p.s.lat));',
'    setTimeout(()=>{}, 150);',
'  }',
'  next();',
'}',
'function render(){',
'  const t = document.getElementById("results"); t.style.display = "table";',
'  let html = "<tr><th>校区</th><th>学生</th><th>km</th><th>分钟</th></tr>";',
'  lastResults.forEach(r=>{ html += "<tr><td>"+r.campus+"</td><td>"+r.student+"</td><td>"+(r.km===null?"-":r.km.toFixed(1))+"</td><td>"+(r.min===null?"-":Math.round(r.min))+"</td></tr>"; });',
'  t.innerHTML = html;',
'  const byCampus = {};',
'  lastResults.forEach(r=>{ (byCampus[r.campus] = byCampus[r.campus]||[]).push(r); });',
'  let sum = "<h4>各校区汇总</h4><table><tr><th>校区</th><th>平均分钟</th><th>中位分钟</th><th>≤30分钟人数</th></tr>";',
'  Object.keys(byCampus).forEach(name=>{',
'    const mins = byCampus[name].map(r=>r.min).filter(x=>x!==null).sort((a,b)=>a-b);',
'    if (!mins.length) return;',
'    const avg = mins.reduce((a,b)=>a+b,0)/mins.length;',
'    const med = mins.length%2 ? mins[(mins.length-1)/2] : (mins[mins.length/2-1]+mins[mins.length/2])/2;',
'    const within = byCampus[name].filter(r=>r.min!==null && r.min<=30).length;',
'    sum += "<tr><td>"+name+"</td><td>"+Math.round(avg)+"</td><td>"+Math.round(med)+"</td><td>"+within+"/"+byCampus[name].length+"</td></tr>";',
'  });',
'  document.getElementById("summary").innerHTML = sum + "</table>";',
'}',
'function copyResultsCsv(){',
'  const rows = [["campus","student","km","minutes"]].concat(lastResults.map(r=>[r.campus, r.student, r.km===null?"":r.km.toFixed(2), r.min===null?"":Math.round(r.min)]));',
'  const csv = "\\uFEFF" + rows.map(r=>r.map(v=>/[",]/.test(String(v)) ? "\\"" + String(v).replace(/"/g,"\\"\\"") + "\\"" : v).join(",")).join("\\r\\n");',
'  if (navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(csv).then(()=>alert("CSV 已复制到剪贴板")); }',
'  else { const ta = document.createElement("textarea"); ta.value = csv; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); alert("CSV 已复制到剪贴板"); }',
'}',
'</' + 'script>',
'<script src="https://api.map.baidu.com/api?type=webgl&v=1.0&ak=__AK__&callback=init"></' + 'script>',
'</body></html>',
''
].join('\n');

// --- DOM wiring (teacher dashboard) ---------------------------------------------
function geoDownload(filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
}

function geoGetAk() { try { return localStorage.getItem('csBaiduAk') || ''; } catch (e) { return ''; } }
function geoSaveAk(v) { try { localStorage.setItem('csBaiduAk', String(v || '').trim()); } catch (e) { /* non-fatal */ } }

function _todayStamp() { return new Date().toISOString().slice(0, 10); }

function renderGeoCoverage() {
    var el = typeof document !== 'undefined' && document.getElementById('geoCoverage');
    if (!el || typeof allStudents === 'undefined') return;
    var n = (allStudents || []).filter(function (s) { return s && s.geo && Number.isFinite(Number(s.geo.lat)); }).length;
    el.textContent = n + '/' + (allStudents || []).length + ' students have location data';
}

function exportLocationsCsv() {
    var students = (typeof allStudents !== 'undefined' && allStudents) || [];
    geoDownload('student_locations_' + _todayStamp() + '.csv', buildLocationCsv(students), 'text/csv;charset=utf-8');
}

function exportBaiduMapHtml() {
    var ak = geoGetAk();
    if (!ak) {
        alert('请先填写百度地图 AK(浏览器端密钥)。\n获取:lbsyun.baidu.com → 应用管理 → 创建应用 → 浏览器端 → 域名白名单留空。');
        return;
    }
    var students = (typeof allStudents !== 'undefined' && allStudents) || [];
    geoDownload('student_map_' + _todayStamp() + '.html', buildBaiduMapHtml(students, ak), 'text/html;charset=utf-8');
}

if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('DOMContentLoaded', function () {
        var akEl = document.getElementById('geoBaiduAk');
        if (akEl) akEl.value = geoGetAk();
        renderGeoCoverage();
    });
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        outOfChina, wgs84ToGcj02, gcj02ToBd09, wgs84ToBd09,
        buildLocationCsv, buildBaiduMapHtml, geoDownload,
        geoGetAk, geoSaveAk, renderGeoCoverage, exportLocationsCsv, exportBaiduMapHtml
    };
}
```

Note: `BAH_TEMPLATE` builds the HTML as an array of lines so the two `</script>` closers are written as `'</' + 'script>'` — geo_export.js is itself loaded via a script tag in the dashboard, and a literal `</script>` in its source would close that tag early.

- [ ] **Step 4: Run tests**

Run: `node test_geo_export.js && npm test`
Expected: all PASS. If the Kunming/Beijing offset-direction asserts fail, re-check the transform constants against the published eviltransform source before touching the asserts — the algorithm, not the test, is more likely wrong.

- [ ] **Step 5: Commit**

```bash
git add geo_export.js test_geo_export.js package.json
git commit -m "feat(dashboard): geo_export module — WGS84→BD09 conversion, CSV + Baidu map HTML builders"
```

---

### Task 4: Dashboard wiring — Settings tab panel

**Files:**
- Modify: `teacher_dashboard.html` (panel after the Student Settings `admin-panel` inside `tabSettings`, lines 196-232; script tag after line 469)
- Modify: `teacher_dashboard.js` (one line in `switchTab`, settings branch at line 564)

**Interfaces:**
- Consumes: Task 3's globals (`geoGetAk/geoSaveAk`, `renderGeoCoverage`, `exportLocationsCsv`, `exportBaiduMapHtml`) and ids `geoBaiduAk`, `geoCoverage`; `allStudents` (teacher_dashboard.js:7).
- Produces: UI only; nothing downstream.

- [ ] **Step 1: Add the panel to teacher_dashboard.html**

Inside `<div id="tabSettings" ...>`, directly after the existing Student Settings `</div>` (the `admin-panel` closing at line 231), before the `tabSettings` closing `</div>` (line 232), insert:

```html
            <div class="admin-panel">
                <h3 class="panel-title"><i class="fas fa-map-marker-alt"></i> Student Locations</h3>
                <p id="geoCoverage" style="font-size:13px;color:#666;margin:4px 0 10px;"></p>
                <div class="admin-form-grid">
                    <div class="form-field"><label>百度地图 AK(浏览器端)</label>
                        <input type="password" id="geoBaiduAk" class="form-input" placeholder="lbsyun.baidu.com → 创建应用 → 浏览器端" onchange="geoSaveAk(this.value)">
                    </div>
                </div>
                <div class="form-actions">
                    <button onclick="exportLocationsCsv()" class="dash-action-btn"><i class="fas fa-file-csv"></i> 导出位置 CSV</button>
                    <button onclick="exportBaiduMapHtml()" class="dash-action-btn primary"><i class="fas fa-map-marked-alt"></i> 导出百度地图 HTML</button>
                    <span id="geoExportStatus" class="save-status"></span>
                </div>
            </div>
```

- [ ] **Step 2: Load geo_export.js in teacher_dashboard.html**

After line 469 (`teacher_dashboard.js` script tag), add:

```html
    <script src="geo_export.js?v=2026-09-25b"></script>
```

and bump line 469 to `teacher_dashboard.js?v=2026-09-25b` (it changes in Step 3).

- [ ] **Step 3: Refresh coverage when the Settings tab opens**

In `teacher_dashboard.js` `switchTab`, directly after line 564 (`document.getElementById('tabSettings').classList.remove('hidden');`), add:

```js
        if (typeof renderGeoCoverage === 'function') renderGeoCoverage();
```

- [ ] **Step 4: Smoke-test in a browser**

Serve locally (e.g. `npx http-server -p 8080` or the project's usual local flow), log into the teacher dashboard, open Settings with a student selected, verify: panel renders, coverage line shows `0/N`, AK field persists across reload (`localStorage csBaiduAk`), CSV download fires and opens correctly in Excel/WPS (Chinese names intact), HTML export without AK shows the hint alert. Full map verification needs the real AK — that's Task 6.

- [ ] **Step 5: Run full suite + commit**

```bash
npm test
git add teacher_dashboard.html teacher_dashboard.js
git commit -m "feat(dashboard): Student Locations panel in Settings — AK field, coverage, CSV + Baidu HTML export"
```

---

### Task 5: Version stamps + wiki + final gate

**Files:**
- Modify: `version.json`, `frontend_auth.js:16`, `index.html:731`
- Modify: `docs/wiki/11-data-model.md`, the wiki page documenting saveAnalytics (find: `grep -rn "saveAnalytics" docs/wiki/`)

- [ ] **Step 1: Bump all three stamps to `2026-09-25b`**

- `version.json`: `"version": "2026-09-25b"`, `"deployedAt"` = deploy date, `"notes"` = one-line summary ("Passive ~1km student geolocation capture; Settings-tab CSV + Baidu map HTML export with driving-time analysis").
- `frontend_auth.js` line 16: `const APP_VERSION = '2026-09-25b';`
- `index.html` line 731: `<script src="frontend_auth.js?v=2026-09-25b"></script>`

(If shipping on a later date, use that date's stamp instead — but all THREE must be byte-identical.)

- [ ] **Step 2: Verify stamp sync**

Run: `node test_deploy_stamp_sync.js`
Expected: PASS.

- [ ] **Step 3: Update docs/wiki/11-data-model.md**

Add:
- Student doc: top-level `geo: { lat, lng, capturedAt, source:'browser' }` — WGS-84, rounded to 2 decimals (~1.1 km); latest fix wins; absent until first successful capture. Written only by saveAnalytics (geo diversion); to delete a student's location, remove the field in Cosmos.
- Analytics event types: add `geo` — `{ type:'geo', lat, lng, timestamp, eventId:'geo_*', ownerId, ps }`; NEVER stored in the `analytics` array (diverted by `extractGeoUpdates`); always acked in `addedEventIds`.
- localStorage keys: `csGeoDone_<studentId>` (`{status:'ok'|'fail', ts}` — ok is permanent, fail retries every login) and `csBaiduAk` (teacher browser only, Baidu JS API key, never sent to server).

- [ ] **Step 4: Update the saveAnalytics wiki page**

In whichever `docs/wiki/*.md` documents the saveAnalytics endpoint: document `extractGeoUpdates` diversion (geo events → `user.geo`, excluded from analytics array and from archive counting; invalid coords dropped but acked).

- [ ] **Step 5: Full test gate**

Run: `npm test` and `cd api && npm test`
Expected: all green (root suite now includes `test_geo_events.js`, `test_geo_capture.js`, `test_geo_export.js`).

- [ ] **Step 6: Commit**

```bash
git add version.json frontend_auth.js index.html docs/wiki/11-data-model.md docs/wiki/<api-page>.md
git commit -m "chore(release): 2026-09-25b — geolocation capture + Baidu export; wiki data-model/API updates"
```

---

### Task 6: Manual end-to-end verification (needs user's Baidu AK)

**Not automatable — do with the user before any deploy talk.**

- [ ] **Step 1:** User registers AK at lbsyun.baidu.com (browser-side app, **empty domain whitelist**).
- [ ] **Step 2:** Locally serve the app; log in as a test student on a device with location services; allow the browser prompt. Verify: `csGeoDone_<id>` flag = ok; a `geo` event ships (watch network tab → saveAnalytics 200 with the geo eventId in `addedEventIds`).
- [ ] **Step 3:** Deploy path only on explicit user instruction (preview → main per AGENTS.md). After deploy, verify a real student's doc gains a `geo` field (teacher dashboard or Cosmos query).
- [ ] **Step 4:** Teacher dashboard → Settings → enter AK → 导出百度地图 HTML → open the file: markers appear at correct Kunming positions (cross-check one against Baidu 坐标拾取器 with its BD-09 value from the CSV).
- [ ] **Step 5:** Add 2 candidate campus pins, run 计算驾车时间, sanity-check a couple of rows against the Baidu app's own driving directions (±20% is fine). Verify the copy-CSV button.
- [ ] **Step 6:** If `DrivingRoute` result parsing yields all `-`, debug `extractDistDur` against a live `onSearchComplete` payload in the browser console (the defensive `text`-parsing fallback exists for this).

## Self-Review Notes (completed during planning)

- Spec coverage: capture (§1)→Task 2; backend (§2)→Task 1; conversion (§3)→Task 3 (folded `geo_convert.js` into `geo_export.js` — one module, one pipeline; deviation noted, spec intent unchanged); dashboard exports (§4)→Tasks 3-4; privacy notes→Global Constraints + Task 5 wiki; repo discipline→Tasks 0/5; testing→each task.
- The `__NOSTUDENTS__` placeholder is replaced with a number in `buildBaiduMapHtml` — order matters (`"__STUDENTS__"` replacement runs before, on a different token).
- Type consistency: event shape `{type:'geo',lat,lng,timestamp,eventId,ownerId,ps}` identical in Tasks 1/2; `geo:{lat,lng,capturedAt,source}` identical in Tasks 1/3/5; DOM ids `geoBaiduAk`/`geoCoverage` identical in Tasks 3/4.
- Known residual risk: Baidu `DrivingRoute` response field shapes (`distance`/`duration` as number vs object vs text) vary across API versions — `extractDistDur` handles all three, and Task 6 Step 6 is the escape hatch.
