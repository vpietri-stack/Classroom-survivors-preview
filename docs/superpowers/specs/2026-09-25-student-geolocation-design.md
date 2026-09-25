# Student Geolocation Capture & Baidu Map Export — Design

Date: 2026-09-25
Status: Draft (awaiting user review)

## Problem & Goal

The teacher is choosing a new physical location for in-person classes in Kunming
and wants to minimize driving distance for the majority of students. To decide,
they need approximate home locations of students, visualized on Baidu Map, with
the ability to compute driving distances/times from candidate campuses.

Students mostly use the webapp at home, so passive browser geolocation capture
will record home neighborhoods.

## Decisions (user-approved)

- **Passive capture** — no custom consent screen; the browser's own permission
  popup serves as the consent record.
- **Neighborhood precision (~1 km)** — coordinates are rounded to 0.01° before
  leaving the device; raw GPS fixes are never transmitted or stored.
- **Baidu Map (BD-09)** is the analysis platform; WGS-84 columns retained in
  CSV for possible Google Earth use.
- **Export, not embedded dashboard map** — the dashboard gains export buttons;
  all map interaction happens in an exported standalone HTML file using the
  Baidu Maps JS API (Option A, approved).
- Teacher already has a Baidu account (Baidu Map app); will register a free
  browser-side AK at lbsyun.baidu.com with an **empty domain whitelist** so the
  local HTML file works.

## Architecture

Ride the existing analytics pipeline (queue → saveAnalytics → Cosmos student
doc). A dedicated `saveGeo` endpoint was considered and rejected: it would
duplicate queue/retry/beacon/ack machinery. All changes are additive per repo
policy.

### 1. Capture — `frontend_auth.js`

- After a successful student login/session restore, if localStorage
  `csGeoDone_<studentId>` is absent and `navigator.geolocation` exists:
  call `getCurrentPosition(success, fail, { enableHighAccuracy: false,
  timeout: 10000, maximumAge: 86400000 })`.
- On success: round lat/lng to 2 decimal places (~1.1 km lat, ~1.0 km lng at
  Kunming's latitude), enqueue an analytics event
  `{ type: 'geo', lat, lng, timestamp, eventId, ps, ownerId }` via the existing
  `analyticsQueue` (inherits persistence, debounce, beacon, ack handling).
  Set `csGeoDone_<studentId>` = `{ status: 'ok', ts }`.
- On failure (denied/unavailable/timeout): set
  `csGeoDone_<studentId>` = `{ status: 'fail', ts }`. Failed attempts **retry
  on every login** until a fix succeeds (teacher needs data within days; a
  cooldown would defeat the purpose). Accepted trade-off: students who deny
  will see the browser popup again at next login. On success the flag becomes
  `{ status: 'ok', ts }` and no further capture is attempted.
- Known limitations (accepted): geolocation frequently fails in WeChat's
  built-in browser on Android; coverage will be partial. Export lists missing
  students so the teacher can chase coverage manually.

### 2. Backend — `api/src/functions/saveAnalytics.js`

- In the per-event processing loop, events with `type === 'geo'` are handled
  separately from regular analytics events:
  - Validate `lat`/`lng` are finite numbers, `|lat| ≤ 90`, `|lng| ≤ 180`.
    Invalid → ack as duplicate/skip (never written).
  - Re-round to 2 decimals server-side (defense in depth).
  - Set top-level field on the student doc:
    `geo: { lat, lng, capturedAt: <event timestamp>, source: 'browser' }`.
    Latest capture wins (overwrite).
  - The event is NOT appended to the `analytics` array (avoids archive
    churn); its `eventId` is returned in `addedEventIds` as usual.
- The existing optimistic-concurrency read-modify-write and archive logic are
  untouched. `getStudents` needs no change: `auth.publicUser`
  (shared/auth.js:189) strips only `password` + Cosmos metadata, so `geo`
  flows to the teacher dashboard automatically. A student fetching their own
  record sees only their own `geo`.

### 3. Coordinate conversion — new shared frontend module

- `geo_convert.js` (new file, loaded only by `teacher_dashboard.html` with a
  `?v=` cache-buster; the capture path needs rounding only, no conversion):
  - `wgs84ToGcj02(lat, lng)` and `gcj02ToBd09(lat, lng)` — standard published
    algorithms (eviltransform), pure functions, unit-testable.
  - Guard: coordinates outside China bounds are returned unconverted (GCJ-02
    shift does not apply).

### 4. Teacher dashboard exports — `teacher_dashboard.js` / `.html`

Settings tab (`tabSettings`) gains a "学生位置" section with:

- **AK input**: password-style field for the Baidu browser-side AK, persisted
  to teacher-browser localStorage (`csBaiduAk`). Never sent to the server.
- **Coverage line**: "N/M students have location data" computed from the
  already-loaded students array.
- **导出 CSV** button → downloads `student_locations_YYYY-MM-DD.csv`
  (UTF-8 with BOM for Excel):
  `studentId, name, hasLocation, capturedAt, wgs84_lat, wgs84_lng, bd09_lat, bd09_lng`
  (students without geo included with `hasLocation=0`).
- **导出百度地图 HTML** button → downloads `student_map_YYYY-MM-DD.html`:
  a self-contained page with student data (name + BD-09 coords) embedded as a
  JS array and the stored AK injected into the Baidu JS API script tag
  (`https://api.map.baidu.com/api?v=3.0&ak=<AK>&callback=...`). Page features:
  - Labeled markers for every student (name on hover/click).
  - Click-to-add candidate campus pins (with a name prompt), stored in the
    page's localStorage so they survive refresh.
  - "计算驾车时间" button: for each campus pin → each student, calls Baidu
    `DrivingRoute` (JS API, client-side, within free quota), serialized with a
    small delay to respect rate limits; renders a sortable table of
    campus / student / distance / duration, plus per-campus average & median
    driving time. Results exportable via a copy-to-clipboard CSV button.
  - If AK is missing when exporting, the dashboard shows a one-line hint on how
    to get one (lbsyun.baidu.com → 浏览器端 → empty whitelist).
- CSV/HTML built client-side with Blob + `URL.createObjectURL` + temporary
  `<a download>` (no existing export helper in repo; this is the first).

## Privacy & compliance notes

- Only ~1 km-rounded coordinates are transmitted/stored; no addresses, no
  movement history (single latest fix per student).
- Data lives in the existing Cosmos `Students` container under the teacher's
  existing access model.
- PIPL: location of minors is sensitive personal information. The browser
  permission prompt is the consent mechanism chosen by the teacher (passive
  option). The teacher should inform parents (e.g., class announcement) — the
  spec records this as the teacher's responsibility, outside the codebase.
- Deletion: a student's `geo` field can be cleared by removing the field in
  Cosmos (documented in wiki); no UI for this in v1.

## Repo discipline

- Bump ALL THREE deploy stamps (`version.json`, `APP_VERSION` in
  frontend_auth.js, `?v=` in index.html + teacher_dashboard.html script tags)
  to the same new value.
- Update `docs/wiki/11-data-model.md` (new `geo` field, new `geo` event type,
  new localStorage keys `csGeoDone_<studentId>`, `csBaiduAk`) and the API wiki
  page (saveAnalytics behavior) in the same commit.
- Work happens on the `preview` branch; merging to `main` = production deploy
  and requires explicit instruction.

## Testing

- `api` tests: saveAnalytics geo-event validation (bad coords skipped),
  rounding, overwrite semantics, geo events excluded from analytics array.
- Frontend tests (existing Node test harness style):
  - `geo_convert.js`: known WGS-84 → GCJ-02 → BD-09 fixture pairs; outside-
    China passthrough.
  - CSV builder: BOM present, missing-location rows, escaping of names with
    commas/quotes.
  - HTML builder: embedded data array, AK injection, no AK → hint path.
  - Capture gating logic: flag set on success/failure, retry-every-login until
    success, rounding applied before enqueue.
- `npm test` (root) and `cd api && npm test` green before commit.

## Out of scope (YAGNI)

- Embedded map inside the dashboard.
- Historical location tracking / multiple fixes per student.
- Reverse geocoding (coordinates → addresses).
- IP-geolocation fallback.
- Deletion/consent-management UI.
