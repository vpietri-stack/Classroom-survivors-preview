// API_BASE_URL is defined in config.js (loaded before this script)
const API_BASE = API_BASE_URL;

// ---------------------------------------------------------------------------
// APP_VERSION — single source of truth for the deployment stamp. The deploy
// script (or a manual edit) bumps this on every release; index.html appends it
// as ?v=... to every <script> so a fresh deploy breaks the browser cache, and
// the service worker uses it to know when an update is available. Bump this
// whenever you ship a fix that frontend clients must pick up immediately
// (e.g. the July-2026 stale-token / cache freeze fix).
// ---------------------------------------------------------------------------
// 🔴 DEPLOY STAMP — MUST match "version" in version.json on EVERY deploy.
// The version watchdog (startVersionWatchdog) compares this to the live
// version.json; a mismatch means stale WeChat builds never self-heal or
// permanently nag. See DEPLOY_VERSION_STAMP.md. Bump BOTH together.
const APP_VERSION = '2026-09-10a';

// --- SESSION TOKEN (c) design) ---
// The server mints a signed token on login. We store it in localStorage
// (parity with the prior savedUsers approach) and send it as a Bearer header.
// The server derives the acting identity from this token; it NEVER trusts a
// client-supplied student/creator id for scoping.
const SESSION_TOKEN_KEY = 'csSessionToken';

function getSessionToken() {
    try { return localStorage.getItem(SESSION_TOKEN_KEY) || null; } catch { return null; }
}
function setSessionToken(token) {
    try { if (token) localStorage.setItem(SESSION_TOKEN_KEY, token); else localStorage.removeItem(SESSION_TOKEN_KEY); } catch {}
}

async function apiFetch(url, options = {}) {
    const appKey = await getAppKey();
    const token = getSessionToken();
    options.headers = {
        ...options.headers,
        'X-App-Key': appKey
    };
    if (token) {
        // Azure SWA's managed-functions proxy OWNS the `Authorization` header
        // (it overwrites it with the host's own token), so we ship our session
        // token in X-Auth-Token — the only header that reaches the function
        // intact. Without this, every token-protected call returns 403.
        options.headers['X-Auth-Token'] = token;
    }
    // NOTE: we no longer append ?creatorId — the server scopes by the token.
    return fetch(url, options);
}
// --- AUTH & ANALYTICS STATE (Moved to teaching_content.js) ---

// --- TEST MODE FLAG ---
var isTestMode = false;

// --- SR STATE (set on login, finalised at session end) ---
var srPendingState = null;       // computed new srState waiting for the next flush
var srIncrementSession = false;  // whether this flush should increment sessionCount
var srPendingSeq = 0;            // monotonic seq tagging the pending SR update (2026-09-10)
var confirmedSrSeq = 0;          // highest server-confirmed srSeq (persisted)

/** Current session index = completed sessions so far (0-based). */
function getCurrentSession() {
    return (authActiveUser && authActiveUser.sessionCount) || 0;
}

// --- ONCE-PER-DAY SESSION ADVANCE ---
// SR intervals are counted in sessions, so several game runs in one afternoon
// used to burn through cooldowns (an interval-2 item could return the same
// day). The session counter now advances at most once per calendar day per
// student; extra same-day runs still record results (in-session sets give
// within-day reinforcement) but don't move the clock, making cooldowns real
// time gaps. Guard lives in localStorage — same-day runs on another device may
// still double-advance, which is acceptable.
function srSessionDayKey() {
    return 'csSRSessionDay_' + ((authActiveUser && authActiveUser.id) || 'anon');
}
function hasAdvancedSRSessionToday() {
    try { return localStorage.getItem(srSessionDayKey()) === new Date().toDateString(); } catch { return false; }
}
function markSRSessionAdvancedToday() {
    try { localStorage.setItem(srSessionDayKey(), new Date().toDateString()); } catch { /* non-fatal */ }
}

/**
 * Called by study_mode.js / game.js at the end of every session (in game mode
 * the whole run's accumulated results are finalised once at game-over).
 * Computes the new srState and marks the next analytics flush to persist it.
 *
 * SR interval + success/failure are written ONCE per session per item — at the
 * FIRST check — then locked. A session is a single finalizeSession call (one
 * game run / one study session), and its results are accumulated in
 * srGameResults / srStudyResults before this fires. We therefore collapse each
 * (type,key) to its canonical first-check outcome so a later same-session
 * prompt (fail-then-success on the same item) is recorded once, as a failure,
 * and never re-doubles an interval.
 *
 * Canonical outcome for an item's first check this session:
 *   - firstAttempt correct (firstAttempt === true)            -> success
 *   - firstAttempt wrong, later correct (firstAttempt false)  -> failure
 *   - firstAttempt wrong, never succeeded this prompt         -> failure
 *   (firstAttempt === false means "first recorded check was wrong".)
 *
 * @param {Array} sessionResults  [{ type, key, firstAttempt }, ...]
 */
function finalizeSession(sessionResults, shouldIncrementSession = true) {
    if (!authActiveUser || isTestMode || !sessionResults || sessionResults.length === 0) return;

    const currentSession = getCurrentSession();
    const currentSRState = authActiveUser.srState || { vocab: {}, sentences: {}, sentencePairs: {} };

    // Collapse each (type,key) to its canonical FIRST-check outcome.
    // First occurrence in the batch wins (fail-then-success -> recorded as failure).
    const canonical = new Map();
    for (const r of sessionResults) {
        if (!r || !r.type || r.key === undefined || r.key === null) continue;
        const id = r.type + '|' + r.key;
        if (!canonical.has(id)) canonical.set(id, r);
    }
    const merged = Array.from(canonical.values());
    if (merged.length === 0) return;

    const newSRState = updateSRStateForSession(currentSRState, merged, currentSession);

    // Eagerly update in-memory user so the next session in the same page-load gets fresh data
    authActiveUser.srState = newSRState;
    if (shouldIncrementSession && !hasAdvancedSRSessionToday()) {
        authActiveUser.sessionCount = currentSession + 1;
        srIncrementSession = true;
        markSRSessionAdvancedToday();
    }

    // Queue for next flush
    srPendingState = newSRState;
    srPendingSeq = Date.now(); // monotonic tag: server applies each seq at most once (2026-09-10)
    if (typeof persistPendingSR === 'function') persistPendingSR(); // survive app-kill between here and successful flush

    // Check if we need to auto-advance the page
    checkAndAdvancePageIfAllOnCooldown();
}

function startExerciseTracking() {
    exerciseStartTime = Date.now();
    exerciseAttempts = 1; // First attempt counts as 1
}

function incrementExerciseAttempts() {
    exerciseAttempts++;
}

function queueExerciseEvent(exerciseType, mode, itemDetails = null, customAttempts = null) {
    if (!authActiveUser || isTestMode) return;  // Skip recording in test mode
    const durationMs = Date.now() - exerciseStartTime;
    
    const event = {
        type: 'exercise',
        exerciseType: exerciseType,
        mode: mode,
        attempts: customAttempts !== null ? customAttempts : exerciseAttempts,
        durationMs: durationMs,
        timestamp: new Date().toISOString(),
        // Stable id so the server can de-duplicate if this event is flushed
        // again after a retry (tab-close + next-launch re-send).
        eventId: 'ex_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10),
        // Restart telemetry: ties this event to its page load so a hard-kill
        // restart can be correlated with the last delivered tail.
        ps: csPageSessionId
    };
    
    if (itemDetails) {
        event.itemDetails = itemDetails;
    }
    
    analyticsQueue.push(event);
    persistAnalyticsQueue();
    csPageHeartbeat({ ex: exerciseType, mode: mode });
    if (authActiveUser) {
        if (!authActiveUser.analytics) authActiveUser.analytics = [];
        authActiveUser.analytics.push(event);
        saveActiveUserToCache();
    }
    scheduleAnalyticsFlush();
}

function queueSessionEvent(sessionType, data) {
    if (!authActiveUser || isTestMode) return;  // Skip recording in test mode
    const event = {
        type: 'session',
        sessionType: sessionType,
        data: data,
        timestamp: new Date().toISOString(),
        // Stable id so the server can de-duplicate if this event is flushed
        // again after a retry (tab-close + next-launch re-send).
        eventId: 'se_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10),
        ps: csPageSessionId // restart telemetry page-session stamp
    };
    analyticsQueue.push(event);
    persistAnalyticsQueue();
    csPageHeartbeat({ sess: sessionType });
    if (authActiveUser) {
        if (!authActiveUser.analytics) authActiveUser.analytics = [];
        authActiveUser.analytics.push(event);
        saveActiveUserToCache();
    }
    scheduleAnalyticsFlush();
}

// --- DEVICE TELEMETRY (2026-07-29, one-month OS census) --------------------
// Logs one `type:'device'` event per student per device per calendar day at
// login, so we can count which OS the class actually plays on (APK/EXE
// decision). Deliberately NOT type:'exercise' (would pollute the dashboard
// exercise tables) and NOT type:'session' (would count toward weekly targets);
// both dashboards filter by type, so 'device' events are invisible to them.
// iPadOS Safari masquerades as "Macintosh" — maxTouchPoints > 1 disambiguates.
function queueDeviceInfoEvent() {
    if (!authActiveUser || isTestMode) return;
    // DRAIN REPORT first (2026-09-08, "session-1 ghost"): describe the backlog
    // BEFORE this login's own events join it — the next login after any silent
    // completion-flush failure tells us exactly what the device was holding.
    queueDrainReportEvent();
    const dayKey = 'csDeviceLogDay_' + authActiveUser.id;
    try { if (localStorage.getItem(dayKey) === new Date().toDateString()) return; } catch { /* log anyway */ }
    let uaData = null;
    try {
        const d = navigator.userAgentData;
        if (d) uaData = { platform: d.platform || '', mobile: !!d.mobile, brands: (d.brands || []).map(b => b.brand + ' ' + b.version).join(', ') };
    } catch { /* non-fatal */ }
    const event = {
        type: 'device',
        ua: (navigator.userAgent || '').slice(0, 300),
        platform: navigator.platform || '',
        maxTouchPoints: navigator.maxTouchPoints || 0,
        uaData: uaData,
        screen: (window.screen && window.screen.width) ? window.screen.width + 'x' + window.screen.height : '',
        appVersion: APP_VERSION,
        timestamp: new Date().toISOString(),
        eventId: 'dv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10),
        ps: csPageSessionId // restart telemetry page-session stamp
    };
    analyticsQueue.push(event);
    persistAnalyticsQueue();
    if (!authActiveUser.analytics) authActiveUser.analytics = [];
    authActiveUser.analytics.push(event);
    saveActiveUserToCache();
    scheduleAnalyticsFlush();
    try { localStorage.setItem(dayKey, new Date().toDateString()); } catch { /* non-fatal */ }
}

/**
 * DRAIN REPORT (2026-09-08, "session-1 ghost"): a self-describing backlog
 * snapshot queued at login BEFORE this login's own events. type:'device' so
 * dashboards ignore it; carries queue length, oldest queued timestamp, and
 * whether a persisted SR/session increment is still awaiting delivery.
 * Runs EVERY login (not day-capped like the census event above) — it is the
 * permanent answer to "what was the device holding when it came back?".
 */
function queueDrainReportEvent() {
    if (!authActiveUser || isTestMode) return;
    try {
        const q = (typeof analyticsQueue !== 'undefined' && Array.isArray(analyticsQueue)) ? analyticsQueue : [];
        let oldestTs = null, nSession = 0, nExercise = 0;
        for (const e of q) {
            if (!e) continue;
            if (e.type === 'session') nSession++;
            else if (e.type === 'exercise') nExercise++;
            if (e.timestamp && (!oldestTs || e.timestamp < oldestTs)) oldestTs = e.timestamp;
        }
        let pendingSR = false, pendingIncr = false;
        try {
            pendingSR = !!localStorage.getItem('csPendingSRState');
            pendingIncr = localStorage.getItem('csPendingSRIncrement') === '1';
        } catch { /* non-fatal */ }
        // Silent when there is genuinely nothing to report (keeps the diag doc quiet).
        if (q.length === 0 && !pendingSR && !pendingIncr) return;
        const event = {
            type: 'device',
            diagnostic: 'queueDrain',
            queueLen: q.length,
            nSession, nExercise,
            oldestQueuedTs: oldestTs,
            pendingSR, pendingIncr,
            appVersion: APP_VERSION,
            timestamp: new Date().toISOString(),
            eventId: 'dv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10),
            ps: (typeof csPageSessionId !== 'undefined') ? csPageSessionId : null
        };
        analyticsQueue.push(event);
        persistAnalyticsQueue();
        if (!authActiveUser.analytics) authActiveUser.analytics = [];
        authActiveUser.analytics.push(event);
        saveActiveUserToCache();
    } catch { /* telemetry must never break login */ }
}

function scheduleAnalyticsFlush() {
    if (analyticsFlushTimer) clearTimeout(analyticsFlushTimer);
    analyticsFlushTimer = setTimeout(flushAnalytics, 2000);
}

// --- RESTART TELEMETRY (2026-08-26a, "Doris mid-session reload" round 2) -----
// The mum's video proved iOS Safari kills the page's WebContent process and
// auto-reloads it ("此网页已重新载入") MID-SESSION, not only at completion.
// A process kill runs no JS at all — no pagehide, no flush — so the only way
// to learn WHEN/WHAT was running when it died is a breadcrumb that SURVIVES
// the kill (localStorage) and is interpreted by the NEXT page load.
//
// Mechanics:
//  - every queued event stamps a page-session id + updates the breadcrumb;
//  - a graceful pagehide/close sets csCleanUnload=1;
//  - on the next student login, if the breadcrumb shows a RECENT (<1h) page
//    session with no clean-unload marker and no delivered tail (i.e. the
//    flush never completed), we queue ONE type:'device' diagnostic event
//    (diagnostic:'restart') that rides the next flush to the server.
// Deliberately type:'device' + diagnostic flag: invisible to both dashboards
// and weekly targets, exactly like the OS-census events.
const CS_HB_KEY = 'csPageHeartbeat';
const CS_UNLOAD_KEY = 'csCleanUnload';
let csPageSessionId = null;
let csPageLoadTime = Date.now();
let csRestartDetectionDone = false;

function csNewPageSession() {
    csPageSessionId = 'ps_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    csPageLoadTime = Date.now();
    try { localStorage.removeItem(CS_UNLOAD_KEY); } catch { /* non-fatal */ }
}

/**
 * Update the kill-surviving breadcrumb. state is a small optional object
 * (e.g. { mode:'study', round:'D', ex:'sentenceScramble' }) merged over the
 * previous one, so callers only pass what they know.
 */
function csPageHeartbeat(state) {
    try {
        if (!csPageSessionId) csNewPageSession();
        let prev = {};
        try { prev = JSON.parse(localStorage.getItem(CS_HB_KEY) || '{}') || {}; } catch { prev = {}; }
        const hb = Object.assign({}, prev.state || {}, state || {});
        localStorage.setItem(CS_HB_KEY, JSON.stringify({
            ps: csPageSessionId,
            ts: Date.now(),
            loadTs: csPageLoadTime,
            v: APP_VERSION,
            state: hb
        }));
    } catch { /* storage unavailable — telemetry is best-effort */ }
}

// Pure decision helper (unit-tested): returns a diagnostic event descriptor
// or null. A "hard kill" = recent breadcrumb + no clean-unload marker + no
// evidence that the killed session's last events were already delivered.
function csBuildRestartDiagnostic(last, nowMs, hasRecentDeliveredEvent) {
    if (!last || !last.ps || !last.ts) return null;
    const ageMs = nowMs - last.ts;
    if (ageMs < 0 || ageMs > 3600000) return null;   // >1h stale = normal close, not a kill
    if (typeof hasRecentDeliveredEvent === 'function' && hasRecentDeliveredEvent(last.ts)) return null;
    return {
        diagnostic: 'restart',
        lastTs: new Date(last.ts).toISOString(),
        secondsSinceLastEvent: Math.round(ageMs / 1000),
        secSincePageLoad: (last.loadTs && last.ts >= last.loadTs)
            ? Math.round((last.ts - last.loadTs) / 1000) : null,
        appVersion: last.v || null,
        pageState: last.state || {},
        pageSessionId: last.ps
    };
}

function csDetectRestartAndQueueDiagnostic() {
    if (csRestartDetectionDone) return;
    csRestartDetectionDone = true;
    try {
        if (localStorage.getItem(CS_UNLOAD_KEY) === '1') return; // graceful end
        const last = JSON.parse(localStorage.getItem(CS_HB_KEY) || 'null');
        // Self-breadcrumb guard (2026-08-26c): localStorage is shared across
        // tabs of the same origin. With two Safari tabs open (seen on Doris's
        // mum's iPhone), tab B's freshly-written breadcrumb can be read by
        // tab A's detection and misreported as a kill — producing a bogus
        // diagnostic with secSinceLastEvent≈0. A TRUE kill always leaves a
        // breadcrumb from a DIFFERENT page session, so same-ps means "this
        // breadcrumb is ours" → skip.
        if (last && last.ps === csPageSessionId) return;
        const hasRecentDeliveredEvent = (lastTs) => {
            if (!authActiveUser || !Array.isArray(authActiveUser.analytics)) return false;
            // The fresh login response carries the server's current history:
            // if any event delivered AFTER the last heartbeat exists, the
            // previous page session flushed fine before it ended.
            return authActiveUser.analytics.some(e => e && e.timestamp && e.timestamp > new Date(lastTs).toISOString());
        };
        const diag = csBuildRestartDiagnostic(last, Date.now(), hasRecentDeliveredEvent);
        if (!diag) return;
        const event = Object.assign({
            type: 'device',
            timestamp: new Date().toISOString(),
            eventId: 'rs_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10)
        }, diag);
        analyticsQueue.push(event);
        persistAnalyticsQueue();
    } catch { /* non-fatal */ }
}

// Graceful exits (tab close / navigation) mark the breadcrumb as explained,
// so only TRUE hard kills (process termination runs no JS) get reported.
try {
    if (typeof window.addEventListener === 'function') {
        window.addEventListener('pagehide', () => {
            try { localStorage.setItem(CS_UNLOAD_KEY, '1'); } catch { /* non-fatal */ }
        });
    }
} catch { /* non-browser environment — telemetry is best-effort */ }

/**
 * FIX #2: fire-and-forget flush on page hide / tab close.
 *
 * Mobile Safari (iOS) and most browsers do NOT run async `fetch` started in
 * `beforeunload`/`pagehide` to completion — the request is abandoned when the
 * page unloads, which is exactly when a kid closes the app after game-over. The
 * reliable mechanism is `navigator.sendBeacon`, which is guaranteed to be
 * delivered even as the page goes away. We also try `fetch(..., {keepalive:true})`
 * as a synchronous-enough fallback.
 *
 * This is the PRIMARY writer on unload. The persisted localStorage queue (fix #3)
 * is the SECONDARY safety net: if even sendBeacon fails (e.g. offline at the
 * moment of closing), the events remain in localStorage and are retried on the
 * next launch.
 */
let _unloadFlushBound = false;
function bindUnloadAnalyticsFlush() {
    if (_unloadFlushBound) return;
    _unloadFlushBound = true;

    const sendNow = () => flushAnalyticsViaBeacon();
    // `pagehide` is the modern, reliable unload signal (covers mobile Safari).
    // `visibilitychange` -> hidden catches tab switches / app backgrounding on
    // iOS where pagehide may not fire promptly.
    window.addEventListener('pagehide', sendNow);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') sendNow();
    });
}

async function flushAnalyticsViaBeacon(opts = {}) {
    // The empty-queue guard normally skips idle unloads. opts.force lets the
    // login path fire a best-effort beacon even though the debounced flush
    // hasn't run yet (2026-08-28a startup-kill blind-spot fix).
    if (!authActiveUser || (analyticsQueue.length === 0 && !opts.force)) return;

    const events = [...analyticsQueue];
    // Capture pending SR state for this final send.
    const srPayload = srPendingState;
    const incrementSession = srIncrementSession;

    const body = { studentId: authActiveUser.id, events };
    if (srPayload)        body.srState          = srPayload;
    if (incrementSession) body.incrementSession = true;

    const token = getSessionToken();
    const appKey = await getAppKey();

    // sendBeacon (and fetch keepalive) cannot set custom headers, so the auth
    // token + app key must travel in the request BODY, not headers. We keep the
    // query-param copy below for backward-compat, BUT Azure SWA's
    // managed-functions proxy does NOT populate request.query on POST — so the
    // query fallback 401s while the body is delivered reliably (exactly like the
    // X-Auth-Token header path). Ship the token in the body so the unload flush
    // authenticates even when the session is enforced.
    if (token)  body.authToken = token;
    if (appKey) body.appKey   = appKey;

    const payload = JSON.stringify(body);

    // (Legacy) query-param copy — ignored by SWA on POST, harmless elsewhere.
    const qs = new URLSearchParams();
    if (token)  qs.set('authToken', token);
    if (appKey) qs.set('appKey', appKey);

    const url = `${API_BASE}/saveAnalytics?${qs.toString()}`;
    let sent = false;
    try {
        if (navigator.sendBeacon) {
            // text/plain is the only content type sendBeacon reliably delivers.
            const blob = new Blob([payload], { type: 'text/plain;charset=UTF-8' });
            sent = navigator.sendBeacon(url, blob);
        }
    } catch { sent = false; }

    // Fallback for browsers without sendBeacon: keepalive fetch is accepted by
    // the browser even during unload.
    if (!sent && typeof fetch === 'function') {
        try {
            fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: payload,
                keepalive: true
            });
            sent = true;
        } catch { sent = false; }
    }

    // NOTE: we deliberately do NOT clear the queue here. `sendBeacon` returns
    // true the moment the browser accepts the payload for *buffering* — which
    // can happen even when the device is offline (the request is then lost if
    // connectivity never returns before the app is killed). By leaving the
    // queue persisted in localStorage, the next app launch will re-send these
    // same events; the server's eventId de-dup makes that re-send idempotent,
    // so we never double-count even on a successful beacon + retry. This trades
    // a little redundant traffic for guaranteed delivery.
    if (sent) {
        persistAnalyticsQueue(); // no-op if empty; ensures on-disk state matches
    }
}

async function flushAnalytics(opts = {}) {
    if (!authActiveUser || analyticsQueue.length === 0) return;

    const events = [...analyticsQueue];

    // Capture and clear pending SR update
    const srPayload = srPendingState;
    const incrementSession = srIncrementSession;
    const srSeqAtSend = srPendingSeq;
    srPendingState = null;
    srIncrementSession = false;
    srPendingSeq = 0;

    // SR rides ONLY when newer than server-confirmed (2026-09-10, Doris
    // stuck-flag fix): an obsolete pending update is dropped locally instead
    // of re-sent; events still ship either way. The increment is created
    // together with its state in finalizeSession, so it rides only with it —
    // sending increment without its state is what double-counted across
    // beacon+fetch duplicates.
    const sendSr = !!(srPayload && srSeqAtSend && srSeqAtSend > (confirmedSrSeq || 0));
    if (!sendSr && (srPayload || incrementSession)) persistPendingSR();

    const body = { studentId: authActiveUser.id, events };
    if (sendSr) {
        body.srState = srPayload;
        body.srSeq = srSeqAtSend;
        if (incrementSession) body.incrementSession = true;
    }

    try {
        // keepalive:true lets the browser complete the request even if the page
        // is being torn down (WeChat/iOS WebView killing the tab right after
        // game-over). This is our primary in-session delivery path; the
        // unload beacon is the backstop for events queued after the flush.
        const response = await apiFetch(`${API_BASE}/saveAnalytics`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            keepalive: true
        });

        // FIX #1: a non-2xx (e.g. 401 from an expired/invalid session token)
        // resolves fine as fetch never throws. Treat it as a hard failure so we
        // re-queue instead of silently dropping the student's data.
        if (!response.ok) {
            // FIX #4: if the server rejected our session token, try ONE silent
            // re-login with the cached credentials, then retry the flush once.
            // If that also fails, re-queue and surface a recoverable error.
            if (response.status === 401 && !opts._retried) {
                const relogged = await trySilentRelogin();
                if (relogged) {
                    // Restore pending SR state for the retry, then re-flush.
                    if (srPayload && !srPendingState) { srPendingState = srPayload; srPendingSeq = srSeqAtSend; }
                    if (incrementSession) srIncrementSession = true;
                    if (typeof persistPendingSR === 'function') persistPendingSR();
                    return await flushAnalytics({ ...opts, _retried: true });
                }
                // Even after a silent re-login we're still 401 — the running
                // client build is stale (e.g. pinned by an iOS home-screen PWA).
                // Show the reload banner so the student/teacher can self-heal.
                registerUpdateBanner('save-401');
            }
            throw new Error('saveAnalytics responded ' + response.status);
        }

        // Success: these events are now safely persisted server-side.
        // Remove only the events we just sent from the persisted queue (they may
        // have been joined by newer events during the await above).
        //
        // ACK DISCIPLINE (2026-09-03a, "Doris silent-200"): a 200 alone is no
        // longer trusted. Doris's iPad received ok-looking responses for 6 days
        // while nothing persisted server-side, so the persisted queue must only
        // drain when the response lists EVERY shipped eventId as added or
        // duplicate. Servers older than the ack contract (or proxies faking
        // 200s) fail this check -> the queue stays persisted and the proven
        // sendBeacon path re-ships it on the next launch (server de-dups).
        const resBody = await response.json().catch(() => null);
        const acked = new Set([
            ...((resBody && resBody.addedEventIds) || []),
            ...((resBody && resBody.duplicateEventIds) || [])
        ]);
        const accounted = events.every(e => !e.eventId || acked.has(e.eventId));
        // Confirm-then-clear (2026-09-10, Doris stuck-flag fix): on a fully
        // acked flush the persisted SR flag clears and the confirmed watermark
        // advances past any seq the server reports. A stale resend can never
        // loop forever because the server only ever applies newer seqs
        // (shouldApplySr) and the client drops anything at/below confirmed.
        const srvSeq = (resBody && typeof resBody.srSeq === 'number') ? resBody.srSeq : null;
        if (accounted) {
            const sentSet = new Set(events);
            analyticsQueue = analyticsQueue.filter(e => !sentSet.has(e));
            persistAnalyticsQueue();
            // Confirmed (applied, obsolete, or legacy response): clear the
            // persisted flag and advance the confirmed watermark.
            if (typeof clearPersistedSR === 'function') clearPersistedSR();
            if (srvSeq !== null && srvSeq > (confirmedSrSeq || 0)) {
                confirmedSrSeq = srvSeq;
                if (typeof persistConfirmedSrSeq === 'function') persistConfirmedSrSeq();
            }
        } else {
            // Delivered-but-unacked: leave everything queued; the next login
            // beacon / debounce re-ships it and the server de-dups by eventId.
            // SR pending state was consumed at the top of this function —
            // restore it so the SR update rides the re-send too.
            console.warn('saveAnalytics 200 without full event ack — keeping queue for re-send');
            if (srPayload && !srPendingState) { srPendingState = srPayload; srPendingSeq = srSeqAtSend; }
            if (incrementSession) srIncrementSession = true;
            persistAnalyticsQueue();
        }
    } catch (e) {
        console.warn('Failed to flush analytics:', e);
        // Re-queue failed events and restore SR pending state.
        analyticsQueue = events.concat(analyticsQueue);
        if (srPayload && !srPendingState) { srPendingState = srPayload; srPendingSeq = srSeqAtSend; }
        if (incrementSession) srIncrementSession = true;
        persistAnalyticsQueue();
    }
}

/**
 * Reliable flush for game-over / session-complete screens. Retries up to 3
 * times with short delays so transient network blips don't lose the session
 * record + SR state. Returns a promise that resolves when the flush succeeds
 * or all retries are exhausted (data remains in localStorage either way).
 */
async function flushAnalyticsOnGameOver() {
    const MAX_RETRIES = 3;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        const queueLen = analyticsQueue.length;
        if (!authActiveUser || queueLen === 0) return; // nothing to send
        await flushAnalytics();
        // If queue drained, the flush succeeded.
        if (analyticsQueue.length < queueLen || analyticsQueue.length === 0) return;
        // Still queued — wait briefly then retry.
        if (attempt < MAX_RETRIES) await new Promise(r => setTimeout(r, 800 * attempt));
    }
}

/**
 * Deadline-guaranteed completion flush (2026-08-25, "Doris refresh" fix).
 * On iPad/iOS (both Safari and WeChat's WKWebView) the page process can be
 * restarted by the OS/browser within ~1s of the session-complete overlay —
 * e.g. when the student switches away to send the result screenshot, or on a
 * WebKit process recycle. A fire-and-forget flush routinely loses the session
 * record + SR state to that restart. Callers therefore AWAIT this before
 * showing the completion screen; the deadline guarantees the UI never hangs
 * longer than maxMs (worst case the events stay in the persisted localStorage
 * queue for the next-launch drain). Returns true when the queue drained.
 */
async function flushAnalyticsWithDeadline(maxMs = 4000) {
    try {
        await Promise.race([
            flushAnalyticsOnGameOver(),
            new Promise(r => setTimeout(r, maxMs))
        ]);
    } catch (e) {
        console.warn('flushAnalyticsWithDeadline error:', e);
    }
    return (typeof analyticsQueue === 'undefined') ? false : analyticsQueue.length === 0;
}

/**
 * Immediate best-effort login flush (2026-08-28a, "Doris refresh" follow-up).
 *
 * Every other flush path is debounced by 2s (scheduleAnalyticsFlush) or gated
 * behind a LATER surviving login (restart telemetry). That left a deadly blind
 * spot proven on 2026-08-27: Doris's mum ran TWO sessions that iOS WebKit
 * killed within the first ~2s — before the debounced flush fired, and with no
 * later surviving login to drain the queue. Result: a TOTAL server blackout
 * for the day, not even the login device event arrived.
 *
 * Fix: on student login, ship the queued login event RIGHT NOW via sendBeacon
 * (non-blocking, no debounce). A startup kill at least leaves its login
 * breadcrumb on the server — closing the blackout and giving the restart
 * detector a real "previous session" to compare against.
 *
 * Additive + non-blocking: a browser without sendBeacon (or a failed beacon)
 * simply no-ops here; the existing 2s debounce stays the reliable path. The
 * server's eventId de-dup makes any duplicate (beacon + later debounce) idempotent.
 */
function flushAnalyticsOnLogin() {
    // Fire-and-forget — do NOT await. The login device event must leave NOW.
    return flushAnalyticsViaBeacon({ force: true }).catch(() => {});
}

/**
 * Last-breath diagnostic beacon (2026-08-31a, "Doris forced refresh" round 3).
 *
 * Doris's iPad+WeChat (iPad|tp5|wx) lost every post-login event on 2026-08-31
 * because the iOS WKWebView killed the page between login and the 2s debounce
 * flush. ALL existing flush paths fail to capture a forensic breadcrumb for
 * that failure mode:
 *   - flushAnalyticsViaBeacon (pagehide/visibilitychange) early-returns when
 *     the queue is empty (the very state at the moment of death).
 *   - csDetectRestartAndQueueDiagnostic only fires on the NEXT page load,
 *     so it cannot tell us what the dying tab actually saw.
 *
 * Fix: on every unload/visibility-hidden/beforeunload signal, send ONE small
 * device event carrying whatever forensic context we have at the moment of
 * death (current kill-surviving breadcrumb, queue length, build stamp, and
 * WHICH signal triggered the beacon). This is independent of analyticsQueue
 * so it always fires, even if the queue is empty. Lands server-side as a
 * single `device` event with `diagnostic:'lastBreath'`, forensically
 * decodable from one event so the next failure is debuggable.
 *
 * No risk: additive, fire-and-forget, dedup-safe (single-fire flag below
 * + server eventId de-dup). NOT a fix for data loss — only makes the next
 * loss self-describing so the real fix can be designed from data.
 */
let _lastBreathFired = false;
let _lastBreathBound = false;
function csLastBreathBeacon(cause) {
    if (_lastBreathFired) return;
    _lastBreathFired = true;
    // Best-effort studentId — try active user, then localStorage mirror.
    let studentId = null;
    if (typeof authActiveUser !== 'undefined' && authActiveUser && authActiveUser.id) {
        studentId = authActiveUser.id;
    } else {
        try {
            const saved = JSON.parse(localStorage.getItem('savedUsers') || '[]');
            if (Array.isArray(saved) && saved[0] && saved[0].id) studentId = saved[0].id;
        } catch { /* storage unavailable — beacon still ships, just anonymous */ }
    }
    if (!studentId) return; // no student to attribute the death to; nothing useful to send

    // Snapshot the kill-surviving breadcrumb + queue length at the moment of death.
    let breadcrumb = null;
    try { breadcrumb = JSON.parse(localStorage.getItem(CS_HB_KEY) || 'null'); } catch {}
    const queueLen = (typeof analyticsQueue !== 'undefined' && analyticsQueue.length) || 0;

    const event = {
        type: 'device',
        diagnostic: 'lastBreath',
        appVersion: (typeof APP_VERSION !== 'undefined') ? APP_VERSION : '?',
        timestamp: new Date().toISOString(),
        eventId: 'lb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
        ps: (typeof csPageSessionId !== 'undefined' && csPageSessionId) ? csPageSessionId : undefined,
        lastBreath: {
            cause: cause || 'unknown',
            queueLenAtDeath: queueLen,
            breadcrumb: breadcrumb || undefined
        }
    };
    const body = JSON.stringify({ studentId, events: [event] });

    const url = (typeof API_BASE !== 'undefined' ? API_BASE : API_BASE_URL) + '/saveAnalytics';
    let sent = false;
    try {
        if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
            const blob = new Blob([body], { type: 'text/plain;charset=UTF-8' });
            sent = navigator.sendBeacon(url, blob);
        }
    } catch { sent = false; }
    if (!sent && typeof fetch === 'function') {
        try { fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }); }
        catch { /* truly offline at death — nothing more we can do */ }
    }
}
function bindLastBreathBeacon() {
    if (_lastBreathBound) return;
    _lastBreathBound = true;
    window.addEventListener('pagehide', () => csLastBreathBeacon('pagehide'));
    window.addEventListener('beforeunload', () => csLastBreathBeacon('beforeunload'));
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') csLastBreathBeacon('visibilitychange:hidden');
    });
}

/**
 * FIX #4: attempt a silent re-login using the cached profile credentials so an
 * expired session token doesn't lose queued analytics. Returns true only when a
 * fresh token was actually obtained and stored. Never blocks the UI or shows an
 * error — on failure the caller falls back to re-queueing.
 */
async function trySilentRelogin() {
    try {
        const savedUsers = JSON.parse(localStorage.getItem('savedUsers') || '[]');
        const me = savedUsers.find(u => authActiveUser && u.id === authActiveUser.id);
        if (!me || !me.login || !me.password) return false;

        const response = await apiFetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ login: me.login, password: me.password })
        });
        if (!response.ok) return false;
        const data = await response.json();
        if (!data || !data.token) return false;

        setSessionToken(data.token);
        // Update the in-memory user with anything the fresh login returned.
        authActiveUser.login = me.login;
        authActiveUser.password = me.password;
        if (data.fullName) authActiveUser.fullName = data.fullName;
        return true;
    } catch {
        return false;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initAuth();
    registerAppUpdateServiceWorker();
    startVersionWatchdog();
});

// ---------------------------------------------------------------------------
// APP-UPDATE BANNER + SERVICE WORKER
// ---------------------------------------------------------------------------
// If the live API rejects our save with 401 (stale client / rotated creds), the
// student's progress is saved locally but NOT synced. Rather than silently
// re-queue forever, surface a visible, tappable banner so the user (or teacher)
// knows to reload — which pulls the current build and self-heals.
let _updateBannerShown = false;
function registerUpdateBanner(reason) {
    if (_updateBannerShown) return;
    _updateBannerShown = true;
    let banner = document.getElementById('appUpdateBanner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'appUpdateBanner';
        banner.style.cssText = [
            'position:fixed', 'left:0', 'right:0', 'bottom:0', 'z-index:999998',
            'background:#b91c1c', 'color:#fff', 'font-family:system-ui,sans-serif',
            'font-size:14px', 'padding:12px 16px', 'text-align:center', 'cursor:pointer',
            'box-shadow:0 -4px 12px rgba(0,0,0,.3)'
        ].join(';');
        banner.setAttribute('role', 'alert');
        document.body.appendChild(banner);
    }
    banner.innerHTML = '⚠️ 无法保存进度 — 点击重新输入密码';
    banner.onclick = () => showReloginOverlay();
    banner.style.display = 'block';
}

function showReloginOverlay() {
    if (document.getElementById('reloginOverlay')) return;
    const overlay = document.createElement('div');
    overlay.id = 'reloginOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:999999;background:rgba(0,0,0,.85);display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif';
    overlay.innerHTML = `
      <div style="background:#1e293b;border-radius:16px;padding:28px 24px;max-width:340px;width:90%;text-align:center;color:#f1f5f9">
        <div style="font-size:36px;margin-bottom:12px">🔐</div>
        <h3 style="margin:0 0 8px;font-size:18px">需要重新登录</h3>
        <p style="margin:0 0 16px;font-size:13px;color:#94a3b8">密码可能已被老师修改，请输入当前密码</p>
        <input id="reloginPwd" type="password" placeholder="输入密码" style="width:100%;box-sizing:border-box;padding:12px;border-radius:8px;border:1px solid #475569;background:#0f172a;color:#f1f5f9;font-size:16px;margin-bottom:12px" />
        <div id="reloginError" style="color:#f87171;font-size:13px;min-height:20px;margin-bottom:8px"></div>
        <button id="reloginSubmit" style="width:100%;padding:12px;border:none;border-radius:8px;background:#3b82f6;color:#fff;font-size:16px;font-weight:600;cursor:pointer">确认登录</button>
        <button id="reloginForce" style="width:100%;padding:10px;border:none;border-radius:8px;background:transparent;color:#64748b;font-size:13px;cursor:pointer;margin-top:8px">强制刷新页面</button>
      </div>`;
    document.body.appendChild(overlay);

    const input = document.getElementById('reloginPwd');
    const errDiv = document.getElementById('reloginError');
    const submitBtn = document.getElementById('reloginSubmit');
    const forceBtn = document.getElementById('reloginForce');
    setTimeout(() => input.focus(), 100);

    submitBtn.onclick = async () => {
        const pwd = input.value.trim();
        if (!pwd) { errDiv.innerText = '请输入密码'; return; }
        submitBtn.disabled = true;
        submitBtn.innerText = '登录中...';
        errDiv.innerText = '';
        try {
            const user = authActiveUser || {};
            const resp = await apiFetch(`${API_BASE}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: user.id, login: user.login, password: pwd })
            });
            if (resp.ok) {
                const data = await resp.json();
                setSessionToken(data.token);
                // Update cached password
                if (user.id) {
                    let savedUsers = JSON.parse(localStorage.getItem('savedUsers') || '[]');
                    const idx = savedUsers.findIndex(u => u.id === user.id);
                    if (idx >= 0) { savedUsers[idx].password = pwd; localStorage.setItem('savedUsers', JSON.stringify(savedUsers)); }
                }
                if (authActiveUser) authActiveUser.password = pwd;
                // Hide overlay + banner, retry the flush
                overlay.remove();
                const banner = document.getElementById('appUpdateBanner');
                if (banner) banner.style.display = 'none';
                _updateBannerShown = false;
                _versionWatchdogSuppressed = true; // auth is fixed; stop nagging about code version
                flushAnalytics();
            } else {
                errDiv.innerText = '密码不正确，请重试或联系老师';
                submitBtn.disabled = false;
                submitBtn.innerText = '确认登录';
            }
        } catch (e) {
            errDiv.innerText = '网络错误，请检查网络后重试';
            submitBtn.disabled = false;
            submitBtn.innerText = '确认登录';
        }
    };

    forceBtn.onclick = async () => {
        // Unregister all service workers then hard-reload with cache bust
        try {
            const regs = await navigator.serviceWorker.getRegistrations();
            await Promise.all(regs.map(r => r.unregister()));
        } catch {}
        if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map(k => caches.delete(k)));
        }
        location.replace(location.origin + location.pathname + '?_cb=' + Date.now());
    };
}

// Register a service worker that force-updates the whole app (including
// index.html) on every load. This is what actually rescues iOS/Android
// home-screen "PWA" shortcuts that pin the old HTML/JS and ignore Cache-Control
// max-age. Without it, a stale build can persist indefinitely on those devices.
function registerAppUpdateServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
    try {
        navigator.serviceWorker.register('sw.js?v=' + APP_VERSION)
            .catch(e => console.warn('SW registration failed:', e));
    } catch (e) { /* SW unsupported — normal cache-busting still applies */ }
}

// ---------------------------------------------------------------------------
// VERSION WATCHDOG  (SW-independent self-heal for browsers WITHOUT service
// workers — most importantly WeChat's iOS in-app WebView, which is a WKWebView
// and has NO navigator.serviceWorker, AND aggressively caches index.html/JS
// while ignoring Cache-Control. Those clients never install our SW and can be
// pinned to a pre-July-2026 build forever, silently 401-ing to the server.)
//
// This polls a tiny version.json (fetched with cache:'no-store' so WeChat can't
// serve a cached copy) every 60s. When the live version is newer than the
// running APP_VERSION, we surface the same reload banner the SW/bad-token paths
// use. A single tap reloads index.html — and because THIS build stamps every
// <script> with ?v=APP_VERSION, the reload actually pulls fresh JS, breaking the
// stale cache. This is the only self-heal that reaches WeChat users.
// ---------------------------------------------------------------------------
let _versionWatchdogStarted = false;
let _versionWatchdogSuppressed = false; // set after successful re-login (auth fixed, code version irrelevant)
function _parseVersion(v) {
    // "2026-07-23c" -> [2026,7,23,99] (letters become a trailing minor so
    // "a"<"b"); allows simple greater-than comparison.
    const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})([a-z]?)$/);
    if (!m) return null;
    const letter = m[4] ? m[4].charCodeAt(0) - 96 : 0;
    return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10), letter];
}
function _versionGreater(live, running) {
    const a = _parseVersion(live), b = _parseVersion(running);
    if (!a || !b) return false;
    for (let i = 0; i < 4; i++) { if (a[i] !== b[i]) return a[i] > b[i]; }
    return false;
}
async function startVersionWatchdog() {
    if (_versionWatchdogStarted) return;
    _versionWatchdogStarted = true;
    const tick = async () => {
        try {
            const res = await fetch('version.json?v=' + Date.now(), { cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                if (data && data.version && _versionGreater(data.version, APP_VERSION) && !_versionWatchdogSuppressed) {
                    registerUpdateBanner('version-watchdog');
                }
            }
        } catch { /* offline / blocked — try again next tick */ }
    };
    // Check once shortly after load (catches a stale build immediately) + every 60s.
    setTimeout(tick, 5000);
    setInterval(tick, 60000);
}

function initAuth() {
    // Only run on pages that have the student UI (not teacher_dashboard.html)
    if (!document.getElementById('startScreen')) return;

    // Check for test mode (teacher testing student content)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('testMode') === 'true') {
        isTestMode = true;
        const studentName = urlParams.get('studentName') || 'Test Student';
        const studentAvatar = urlParams.get('studentAvatar') || '👤';
        const studentBook = urlParams.get('studentBook') || '';
        const studentUnit = urlParams.get('studentUnit') || '';
        const studentPage = urlParams.get('studentPage') || '';
        const studentClassTime = urlParams.get('studentClassTime') || '';

        authActiveUser = {
            id: 'test-mode',
            name: studentName,
            avatar: studentAvatar,
            role: 'student',
            classTime: studentClassTime,
            book: studentBook,
            unit: studentUnit,
            page: studentPage
        };

        // Hide start screen and go directly to greeting
        document.getElementById('startScreen').classList.add('hidden');
        selectedStudent = studentName;
        if (studentBook && studentUnit && studentPage) {
            loadContent();
        } else if (studentClassTime) {
            resolveContentFromClassTime(studentClassTime, studentName);
        }

        document.getElementById('startScreen').classList.remove('hidden');
        ['step-day', 'step-time', 'step-student', 'step-book', 'step-unit'].forEach(id => {
            document.getElementById(id).classList.add('hidden');
        });
        document.getElementById('step-greeting').classList.remove('hidden');
        document.getElementById('greeting-text').innerText = `Hello, ${studentName}!`;
        document.getElementById('greeting-avatar').innerText = studentAvatar || '👤';
        return;
    }

    // Hide start screen if it is visible
    document.getElementById('startScreen').classList.add('hidden');
    
    const savedUsers = JSON.parse(localStorage.getItem('savedUsers') || '[]');
    if (savedUsers.length > 0) {
        showProfileSelection(savedUsers);
    } else {
        showLoginScreen(true); // true means no cancel button since no profiles exist
    }
}

function hideAllAuthScreens() {
    document.getElementById('profileSelectionOverlay').classList.add('hidden');
    document.getElementById('loginOverlay').classList.add('hidden');
    document.getElementById('changePasswordOverlay').classList.add('hidden');
    document.getElementById('avatarSelectionOverlay').classList.add('hidden');
}

function showProfileSelection(users) {
    hideAllAuthScreens();
    const overlay = document.getElementById('profileSelectionOverlay');
    overlay.classList.remove('hidden');
    
    const container = document.getElementById('profile-list');
    container.innerHTML = '';
    
    users.forEach(user => {
        const btn = document.createElement('div');
        btn.className = 'profile-btn flex flex-col items-center gap-2 cursor-pointer transform hover:scale-110 transition-transform';
        btn.onclick = () => loginWithProfile(user, btn);
        
        const img = document.createElement('div');
        img.className = 'w-24 h-24 sm:w-32 sm:h-32 rounded-md flex items-center justify-center text-5xl bg-[#333] border-4 border-transparent hover:border-white transition-all shadow-lg';
        img.innerText = user.avatar || '👤';
        
        const name = document.createElement('span');
        name.className = 'text-gray-300 font-bold text-lg mt-2';
        name.innerText = user.name;
        
        btn.appendChild(img);
        btn.appendChild(name);
        container.appendChild(btn);
    });
    
    // Add "添加新用户" button
    const addBtn = document.createElement('div');
    addBtn.className = 'profile-btn flex flex-col items-center gap-2 cursor-pointer transform hover:scale-110 transition-transform';
    addBtn.onclick = () => showLoginScreen(false);
    
    const addImg = document.createElement('div');
    addImg.className = 'w-24 h-24 sm:w-32 sm:h-32 rounded-md border-4 border-gray-600 flex items-center justify-center text-5xl text-gray-500 hover:text-white hover:border-white bg-transparent transition-all shadow-lg';
    addImg.innerHTML = '+';
    
    const addText = document.createElement('span');
    addText.className = 'text-gray-300 font-bold text-lg mt-2';
    addText.innerText = '添加新用户';
    
    addBtn.appendChild(addImg);
    addBtn.appendChild(addText);
    container.appendChild(addBtn);
}

async function loginWithProfile(user, clickedBtn) {
    // Prevent double-clicks while a login is already in progress
    if (window.authLoading) return;
    window.authLoading = true;

    // --- Visual feedback: dim all profiles, show spinner on the clicked one ---
    const allProfileBtns = document.querySelectorAll('#profile-list .profile-btn');
    const originalAvatar = clickedBtn ? clickedBtn.querySelector('div')?.innerText : null;
    const originalName = clickedBtn ? clickedBtn.querySelector('span')?.innerText : null;
    allProfileBtns.forEach(b => {
        if (b !== clickedBtn) {
            b.style.opacity = '0.35';
            b.style.pointerEvents = 'none';
        }
    });
    if (clickedBtn) {
        clickedBtn.style.pointerEvents = 'none';
        const avatarDiv = clickedBtn.querySelector('div');
        const nameSpan = clickedBtn.querySelector('span');
        if (avatarDiv) avatarDiv.innerHTML = '<i class="fas fa-circle-notch fa-spin text-white"></i>';
        if (nameSpan) nameSpan.innerText = '登录中...';
    }

    // Helper to restore the profile list UI (used on failure / fallback)
    function restoreProfileUI() {
        allProfileBtns.forEach(b => {
            b.style.opacity = '';
            b.style.pointerEvents = '';
        });
        if (clickedBtn) {
            const avatarDiv = clickedBtn.querySelector('div');
            const nameSpan = clickedBtn.querySelector('span');
            if (avatarDiv) avatarDiv.innerText = originalAvatar || '👤';
            if (nameSpan) nameSpan.innerText = originalName || '';
        }
        window.authLoading = false;
    }

    // Refresh user data from API to ensure we have the latest DB fields (like book/unit/page)
    try {
        const response = await apiFetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: user.id, login: user.login, password: user.password })
        });
        if (response.status === 401) {
            // Cached password is stale — show login form instead of silent fallback
            window.authLoading = false;
            restoreProfileUI();
            showLoginScreen(false);
            const errorDiv = document.getElementById('login-error');
            errorDiv.innerText = `"${user.name}"的密码可能已被修改，请重新输入密码。`;
            errorDiv.classList.remove('hidden');
            document.getElementById('login-username').value = user.login || '';
            return;
        }
        if (response.ok) {
            const data = await response.json();
            setSessionToken(data.token); // (c) persist session token
            if (data.needsPasswordChange) {
                // Edge case: admin reset password while user was logged out
                authActiveUser = {
                    id: data.id,
                    login: user.login,
                    name: data.fullName,
                    avatar: data.avatar,
                    role: data.role,
                    classTime: data.classTime,
                    book: data.book,
                    unit: data.unit,
                    page: data.page,
                    password: user.password,
                    analytics: data.analytics || [],
                    teacher: data.teacher || null,
                    vsPromoSeen: !!data.vsPromoSeen
                };
                window.authLoading = false;
                showChangePasswordScreen(data.fullName);
                return;
            }
            authActiveUser = {
                id: data.id,
                login: user.login,
                name: data.fullName,
                avatar: data.avatar,
                role: data.role,
                classTime: data.classTime,
                book: data.book,
                unit: data.unit,
                page: data.page,
                password: user.password,
                srState: data.srState || { vocab: {}, sentences: {}, sentencePairs: {} },
                sessionCount: data.sessionCount || 0,
                targets: data.targets || [],
                analytics: data.analytics || [],
                teacher: data.teacher || null,
                vsPromoSeen: !!data.vsPromoSeen
            };
            
            // Update the local cache with the fresh data
            let savedUsers = JSON.parse(localStorage.getItem('savedUsers') || '[]');
            savedUsers = savedUsers.filter(u => u.id !== authActiveUser.id);
            savedUsers.unshift(authActiveUser);
            localStorage.setItem('savedUsers', JSON.stringify(savedUsers));
            localStorage.setItem('activeUserId', authActiveUser.id);
            
            window.authLoading = false;
            finishLogin();
            return;
        }
    } catch(e) {
        console.warn("Failed to refresh profile from server, falling back to local cache", e);
        // Network failure — mark offline so we can warn the student and retry.
        _offlineFallback = true;
    }

    // Fallback to cached user if offline or server error
    authActiveUser = user;
    window.authLoading = false;
    finishLogin();
    if (_offlineFallback) showOfflineBanner();
}

// --- OFFLINE FALLBACK BANNER (total connectivity failure) ---
let _offlineFallback = false;
let _offlineRetryTimer = null;

function showOfflineBanner() {
    let banner = document.getElementById('appUpdateBanner');
    if (!banner) {
        banner = document.createElement('div');
        banner.id = 'appUpdateBanner';
        banner.style.cssText = [
            'position:fixed', 'left:0', 'right:0', 'bottom:0', 'z-index:999998',
            'background:#b45309', 'color:#fff', 'font-family:system-ui,sans-serif',
            'font-size:14px', 'padding:12px 16px', 'text-align:center',
            'box-shadow:0 -4px 12px rgba(0,0,0,.3)'
        ].join(';');
        banner.setAttribute('role', 'alert');
        document.body.appendChild(banner);
    }
    banner.innerHTML = '⚠️ 无法连接服务器 — 进度暂时无法保存，请检查网络';
    banner.onclick = () => retryOfflineLogin();
    banner.style.display = 'block';
    // Auto-retry every 30 seconds
    if (!_offlineRetryTimer) {
        _offlineRetryTimer = setInterval(retryOfflineLogin, 30000);
    }
}

async function retryOfflineLogin() {
    if (!_offlineFallback || !authActiveUser) return;
    try {
        const res = await apiFetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: authActiveUser.id, login: authActiveUser.login, password: authActiveUser.password })
        });
        if (res.ok) {
            const data = await res.json();
            setSessionToken(data.token);
            // Merge fresh DB data into the active user
            authActiveUser.srState = data.srState || authActiveUser.srState;
            authActiveUser.sessionCount = data.sessionCount ?? authActiveUser.sessionCount;
            authActiveUser.targets = data.targets || authActiveUser.targets;
            authActiveUser.analytics = data.analytics || authActiveUser.analytics;
            _offlineFallback = false;
            clearInterval(_offlineRetryTimer);
            _offlineRetryTimer = null;
            const banner = document.getElementById('appUpdateBanner');
            if (banner) banner.style.display = 'none';
            console.log('Connection restored — re-logged in successfully');
            // Flush any events that queued up while offline
            if (analyticsQueue.length > 0) flushAnalytics();
        }
    } catch { /* still offline — keep retrying */ }
}

function showLoginScreen(isFirstTime = false) {
    hideAllAuthScreens();
    document.getElementById('loginOverlay').classList.remove('hidden');
    document.getElementById('login-error').classList.add('hidden');
    document.getElementById('login-username').value = '';
    document.getElementById('login-password').value = '';
    
    const cancelBtn = document.getElementById('login-cancel-btn');
    if (isFirstTime) {
        cancelBtn.classList.add('hidden');
    } else {
        cancelBtn.classList.remove('hidden');
    }
}

function cancelLogin() {
    const savedUsers = JSON.parse(localStorage.getItem('savedUsers') || '[]');
    if (savedUsers.length > 0) {
        showProfileSelection(savedUsers);
    }
}

async function handleLoginSubmit() {
    // Prevent double-clicks while a login is already in progress
    if (window.authLoading) return;

    const loginVal = document.getElementById('login-username').value.trim();
    const passVal = document.getElementById('login-password').value.trim();
    const errorDiv = document.getElementById('login-error');
    const submitBtn = document.querySelector('#loginOverlay .game-btn.bg-red-600');
    const cancelBtn = document.getElementById('login-cancel-btn');
    const usernameInput = document.getElementById('login-username');
    const passwordInput = document.getElementById('login-password');
    
    if (!loginVal || !passVal) {
        errorDiv.innerText = "请输入用户名和密码。";
        errorDiv.classList.remove('hidden');
        return;
    }

    // --- Visual feedback: disable form, show spinner on button ---
    window.authLoading = true;
    errorDiv.classList.add('hidden');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '登录中... <i class="fas fa-circle-notch fa-spin ml-2"></i>';
        submitBtn.classList.add('opacity-70', 'cursor-not-allowed');
    }
    if (usernameInput) usernameInput.disabled = true;
    if (passwordInput) passwordInput.disabled = true;
    if (cancelBtn) cancelBtn.classList.add('hidden');

    // Helper to restore the login form UI (used on failure)
    function restoreLoginUI() {
        window.authLoading = false;
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '登录';
            submitBtn.classList.remove('opacity-70', 'cursor-not-allowed');
        }
        if (usernameInput) usernameInput.disabled = false;
        if (passwordInput) passwordInput.disabled = false;
        // Only re-show cancel if there are saved profiles
        const hasSaved = JSON.parse(localStorage.getItem('savedUsers') || '[]').length > 0;
        if (cancelBtn && hasSaved) cancelBtn.classList.remove('hidden');
    }
    
    try {
        const response = await apiFetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ login: loginVal, password: passVal })
        });
        
        if (!response.ok) {
            const errText = await response.text();
            errorDiv.innerText = errText || "登录失败。";
            errorDiv.classList.remove('hidden');
            restoreLoginUI();
            return;
        }
        
        const data = await response.json();
        setSessionToken(data.token); // (c) persist session token
        authActiveUser = {
            id: data.id,
            login: loginVal,
            name: data.fullName,
            avatar: data.avatar,
            role: data.role,
            classTime: data.classTime,
            book: data.book,
            unit: data.unit,
            page: data.page,
            password: passVal,
            srState: data.srState || { vocab: {}, sentences: {}, sentencePairs: {} },
            sessionCount: data.sessionCount || 0,
            targets: data.targets || [],
            analytics: data.analytics || [],
            teacher: data.teacher || null,
            vsPromoSeen: !!data.vsPromoSeen
        };
        
        window.authLoading = false;
        if (data.needsPasswordChange) {
            showChangePasswordScreen(data.fullName);
        } else if (!data.avatar) {
            showAvatarSelectionScreen();
        } else {
            saveUserToLocalAndStart(authActiveUser);
        }
    } catch (e) {
        errorDiv.innerText = "连接服务器出错。";
        errorDiv.classList.remove('hidden');
        restoreLoginUI();
    }
}

function showChangePasswordScreen(name) {
    hideAllAuthScreens();
    document.getElementById('changePasswordOverlay').classList.remove('hidden');
    document.getElementById('change-pw-greeting').innerText = `你好，${name}`;
    document.getElementById('change-pw-error').classList.add('hidden');
    document.getElementById('new-password').value = '';
}

async function handleChangePasswordSubmit() {
    const newPass = document.getElementById('new-password').value.trim();
    const errorDiv = document.getElementById('change-pw-error');
    
    if (!newPass) {
        errorDiv.innerText = "请输入新密码。";
        errorDiv.classList.remove('hidden');
        return;
    }
    
    try {
        const response = await apiFetch(`${API_BASE}/changePassword`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: authActiveUser.id, newPassword: newPass })
        });
        
        if (!response.ok) {
            errorDiv.innerText = "修改密码失败。";
            errorDiv.classList.remove('hidden');
            return;
        }
        
        showAvatarSelectionScreen();
    } catch (e) {
        errorDiv.innerText = "连接服务器出错。";
        errorDiv.classList.remove('hidden');
    }
}

function showAvatarSelectionScreen() {
    hideAllAuthScreens();
    document.getElementById('avatarSelectionOverlay').classList.remove('hidden');
    document.getElementById('avatar-error').classList.add('hidden');
}

async function selectAvatar(avatarEmoji) {
    const errorDiv = document.getElementById('avatar-error');
    
    try {
        const response = await apiFetch(`${API_BASE}/updateAvatar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: authActiveUser.id, avatar: avatarEmoji })
        });
        
        if (!response.ok) {
            errorDiv.innerText = "更新头像失败。";
            errorDiv.classList.remove('hidden');
            return;
        }
        
        authActiveUser.avatar = avatarEmoji;
        saveUserToLocalAndStart(authActiveUser);
    } catch (e) {
        errorDiv.innerText = "连接服务器出错。";
        errorDiv.classList.remove('hidden');
    }
}

function saveUserToLocalAndStart(user) {
    let savedUsers = JSON.parse(localStorage.getItem('savedUsers') || '[]');
    // Remove if exists
    savedUsers = savedUsers.filter(u => u.id !== user.id);
    // Add to front
    savedUsers.unshift(user);
    localStorage.setItem('savedUsers', JSON.stringify(savedUsers));
    localStorage.setItem('activeUserId', user.id);
    
    finishLogin();
}

/**
 * Updates the currently active user in the local storage cache.
 * HARDENED (2026-08-25, "Doris refresh" fix): this runs after EVERY queued
 * event and serializes the user's WHOLE analytics history, so it is the most
 * quota-hungry localStorage write in the app. An unguarded setItem throwing
 * QuotaExceededError here propagates into queueExerciseEvent/queueSessionEvent
 * and aborts the session-completion path mid-way. Never throw; on quota error
 * retry with a trimmed analytics mirror (the server remains the source of
 * truth — full history is re-fetched on every login).
 */
function saveActiveUserToCache() {
    if (!authActiveUser) return;
    try {
        let savedUsers = JSON.parse(localStorage.getItem('savedUsers') || '[]');
        savedUsers = savedUsers.filter(u => u.id !== authActiveUser.id);
        savedUsers.unshift(authActiveUser);
        try {
            localStorage.setItem('savedUsers', JSON.stringify(savedUsers));
        } catch {
            // Storage full (likely the analytics mirror): retry once with the
            // most recent 500 events only.
            const original = authActiveUser.analytics;
            if (Array.isArray(original) && original.length > 500) {
                authActiveUser.analytics = original.slice(-500);
                try {
                    savedUsers = JSON.parse(localStorage.getItem('savedUsers') || '[]')
                        .filter(u => u.id !== authActiveUser.id);
                    savedUsers.unshift(authActiveUser);
                    localStorage.setItem('savedUsers', JSON.stringify(savedUsers));
                } catch { /* still full — cached profile unavailable; non-fatal */ }
                authActiveUser.analytics = original;
            }
        }
    } catch { /* storage unavailable — non-fatal */ }
}

function finishLogin() {
    hideAllAuthScreens();

    // Redirect teachers and admins to the dashboard
    if (authActiveUser && (authActiveUser.role === 'BM' || authActiveUser.role === 'admin')) {
        window.location.href = 'teacher_dashboard.html';
        return;
    }

    // FIX #2: arm the pagehide/visibilitychange flush now that a student is
    // logged in, so a tab-close / app-background right after game-over still
    // ships the queued analytics.
    bindUnloadAnalyticsFlush();

    // FIX #5 (2026-08-31a): arm the last-breath diagnostic beacon so the NEXT
    // tab-death (WeChat WKWebView kill on iPad, app reload, OS memory pressure)
    // leaves a single forensically decodable server event — even when the
    // analytics queue is empty. Independent of bindUnloadAnalyticsFlush so a
    // kill at any time (not only mid-flush) is self-describing.
    bindLastBreathBeacon();

    // Restart telemetry — ORDER IS LOAD-BEARING (fixed 2026-08-26c after the
    // 2026-08-26 field data showed only self-reads): detection MUST run
    // BEFORE csNewPageSession()/csPageHeartbeat(). Reasons:
    //   1. csPageHeartbeat overwrites the shared breadcrumb key with THIS
    //      page's ps — a later detection would read its own breadcrumb and
    //      either self-report a bogus kill or (with the same-ps guard) never
    //      report anything at all.
    //   2. csNewPageSession clears the csCleanUnload marker set by the
    //      previous page's graceful pagehide — detection must still see it.
    // A genuine kill always leaves a breadcrumb whose ps differs from the
    // page session we are about to start.
    csDetectRestartAndQueueDiagnostic();

    // Restart telemetry (2026-08-26a): this page load is a new page-session.
    // On Doris's iPad the WebKit WebContent process is killed mid-session
    // and the browser silently reloads ("此网页已重新载入"); the breadcrumb
    // below survives the kill and lets the NEXT load report when and where
    // the previous one died. Runs BEFORE queueDeviceInfoEvent so the login
    // device event already carries this page-session id.
    csNewPageSession();
    // 2026-08-26b: stamp a compact device signature into the breadcrumb so a
    // restart diagnostic is self-describing across devices (Doris is now
    // testing iPhone vs iPad). Format: platform|tp<touchpoints>|wx/br —
    // e.g. "iPad|tp5|wx", "MacIntel|tp5|br" (iPadOS Safari spoofs Macintosh),
    // "iPhone|tp5|wx". Lands in pageState.dev of the diagnostic event.
    try {
        const ua = navigator.userAgent || '';
        csPageHeartbeat({
            dev: (navigator.platform || '?') + '|tp' + (navigator.maxTouchPoints || 0)
                + '|' + (ua.includes('MicroMessenger') ? 'wx' : 'br')
        });
    } catch { csPageHeartbeat(); }

    // OS census: record what device/OS this student logs in from (once per
    // device per day). Runs after the teacher redirect so only students count.
    queueDeviceInfoEvent();

    // 2026-08-28a: ship the login event IMMEDIATELY (beacon, non-blocking) so a
    // startup kill leaves its login breadcrumb on the server instead of a total
    // blackout. The 2s debounce below remains the reliable in-session path.
    flushAnalyticsOnLogin();

    // FIX #3: flush any events carried over in localStorage from a previous
    // session that was killed/closed before it could deliver them.
    if (typeof loadPersistedSR === 'function') loadPersistedSR(); // restore SR state that survived app-kill
    // Drain whatever is queued (backlog + any restart diagnostic queued at
    // the top of finishLogin) so it rides the first flush.
    if (analyticsQueue.length > 0) scheduleAnalyticsFlush();

    // Auto-resolve the student's class content
    if (authActiveUser) {
        selectedStudent = authActiveUser.fullName || authActiveUser.name;
        if (authActiveUser.book && authActiveUser.unit && authActiveUser.page) {
            // Priority: Directly use content assigned from DB
            // STICKY ADVANCE first (2026-09-08): a previously-decided advance
            // is applied, not re-litigated — then the normal check runs.
            if (typeof reapplyPendingPageAdvance === 'function') reapplyPendingPageAdvance();
            checkAndAdvancePageIfAllOnCooldown();
            loadContent();
        } else if (authActiveUser.classTime) {
            // Fallback: Resolve via classTime mapping
            resolveContentFromClassTime(authActiveUser.classTime, authActiveUser.name);
        }
    }

    // Show the start screen but skip directly to the greeting step
    document.getElementById('startScreen').classList.remove('hidden');

    // Hide all wizard steps
    ['step-day', 'step-time', 'step-student', 'step-book', 'step-unit'].forEach(id => {
        document.getElementById(id).classList.add('hidden');
    });

    // Show greeting directly
    document.getElementById('step-greeting').classList.remove('hidden');
    document.getElementById('greeting-text').innerText = `Hello, ${authActiveUser.name}!`;
    document.getElementById('greeting-avatar').innerText = authActiveUser.avatar || '👤';

    // Handle target banner
    const targetBanner = document.getElementById('greeting-target-banner');
    const targetText = getActiveTargetText();
    if (targetText) {
        targetBanner.innerText = targetText;
        targetBanner.classList.remove('hidden');
    } else {
        targetBanner.classList.add('hidden');
    }
}

/**
 * Maps a classTime string like "Sat 14:50" to the correct CLASS_CONFIG entry
 * and calls loadContent() so the games have the right vocab/sentences.
 */
function resolveContentFromClassTime(classTime, studentName) {
    const dayMap = {
        'Mon': '周一', 'Tue': '周二', 'Wed': '周三',
        'Thu': '周四', 'Fri': '周五', 'Sat': '周六', 'Sun': '周日'
    };

    // classTime format: "Sat 14:50" or "Mon/Thu 19:50"
    const parts = classTime.split(' ');
    if (parts.length < 2) return;

    const timeStr = parts[1]; // e.g. "14:50"
    const dayKeys = parts[0].split('/'); // e.g. ["Mon", "Thu"] or ["Sat"]

    // Try each day abbreviation until we find a matching config entry
    for (const dayAbbr of dayKeys) {
        const dayZh = dayMap[dayAbbr];
        if (!dayZh || !CLASS_CONFIG[dayZh]) continue;

        const daySlots = CLASS_CONFIG[dayZh];
        // Find the slot whose start time matches (e.g. "1450" matches "14:50")
        for (const slotKey of Object.keys(daySlots)) {
            const slotStart = slotKey.substring(0, 4); // e.g. "1450"
            const csvTime = timeStr.replace(':', '');   // e.g. "1450"
            if (slotStart === csvTime) {
                // Found the matching slot — set the wizard state variables
                selectedDay = dayZh;
                selectedTime = slotKey;
                selectedStudent = studentName;
                loadContent();
                return;
            }
        }
    }
    console.warn('Could not auto-resolve classTime:', classTime);
}

function goBackToProfiles() {
    // Hide start screen and go back to profile selection
    document.getElementById('startScreen').classList.add('hidden');
    document.getElementById('step-greeting').classList.add('hidden');
    authActiveUser = null;
    setSessionToken(null); // (c) clear session token on logout
    const savedUsers = JSON.parse(localStorage.getItem('savedUsers') || '[]');
    if (savedUsers.length > 0) {
        showProfileSelection(savedUsers);
    } else {
        showLoginScreen(true);
    }
}

/**
 * Picks the target a student should see, mirroring teacher_dashboard.js
 * getStudentTargetInfo: active first, then most-recent past, then nearest
 * upcoming. This guarantees the student's meter never silently disappears
 * (e.g. Lucas's window had ended on his device, so the old active-only check
 * returned null while the dashboard still showed 14/70).
 * Returns { target, completed, status } or null.
 */
function selectStudentTarget(student) {
    if (!student || !student.targets || student.targets.length === 0) return null;
    const now = new Date();

    // 1. Active target (now within range)
    for (const t of student.targets) {
        const start = new Date(t.startTime);
        const end = new Date(t.endTime);
        if (now >= start && now <= end) {
            return {
                target: t,
                completed: countCompletedSessionsForTarget(student, t.startTime, t.endTime) + (t.manualOffset || 0),
                status: 'active'
            };
        }
    }

    // 2. Most recent past target
    const past = student.targets
        .filter(t => new Date(t.endTime) < now)
        .sort((a, b) => new Date(b.endTime) - new Date(a.endTime));
    if (past.length > 0) {
        const t = past[0];
        return {
            target: t,
            completed: countCompletedSessionsForTarget(student, t.startTime, t.endTime) + (t.manualOffset || 0),
            status: 'past'
        };
    }

    // 3. Nearest upcoming target
    const upcoming = student.targets
        .filter(t => new Date(t.startTime) > now)
        .sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
    if (upcoming.length > 0) {
        return { target: upcoming[0], completed: 0, status: 'upcoming' };
    }

    return null;
}

/**
 * Returns a formatted string for the greeting-screen meter, or null.
 * Now mirrors the teacher dashboard: shows active, most-recent-past, or
 * nearest-upcoming target so the student's meter always matches what the
 * teacher sees.
 */
function getActiveTargetText(studentOverride) {
    const student = studentOverride || authActiveUser;
    const sel = selectStudentTarget(student);
    if (!sel) return null;

    const { target, completed, status } = sel;

    // Format dates for display (e.g., 2026/05/14)
    const startStr = new Date(target.startTime).toLocaleString('en-GB', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' });
    const endStr = new Date(target.endTime).toLocaleString('en-GB', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' });

    const prefix = status === 'active' ? '打卡记录'
                 : status === 'past'   ? '上阶段'
                 : '未开始';

    return `${startStr} - ${endStr} ${prefix}: ${completed}/${target.targetSessions}`;
}

/**
 * Counts completed sessions in a time range for a student. MUST match the
 * teacher dashboard's countTargetSessions (teacher_dashboard.js) exactly.
 * Both sides now EXCLUDE short game-mode losses (see isUncountedShortLoss):
 * from 27 Jul 2026 on, a loss under 2 minutes never counts toward the weekly
 * target, matching the in-game "用时不到2分钟且挑战失败，本次练习不计入每周目标"
 * warning.
 */
function countCompletedSessionsForTarget(student, startTimeStr, endTimeStr) {
    if (!student.analytics || !Array.isArray(student.analytics)) return 0;
    const start = new Date(startTimeStr).getTime();
    const end = new Date(endTimeStr).getTime();

    return student.analytics.filter(e => {
        if (e.type !== 'session') return false;
        if (isUncountedShortLoss(e)) return false;
        const ts = new Date(e.timestamp).getTime();
        return ts >= start && ts <= end;
    }).length;
}

// A game-mode loss shorter than 2 minutes does not count toward targets
// (anti-cheat: stops students losing on purpose to farm sessions).
// NOT retroactive: sessions played before TWO_MIN_RULE_START were recorded
// under the old "1分钟" warning, so for those we only honor the `ignored`
// flag the game wrote at play time (the student WAS told it wouldn't count).
// From the start date on, we also judge by duration + result so stale cached
// clients (still flagging only <60s) can't sneak 1-2 minute losses through.
// Shared with teacher_dashboard.js / admin_dashboard.js (which load this
// file first) so all meters always agree.
const TARGET_MIN_LOSS_SEC = 120;
const TWO_MIN_RULE_START = new Date('2026-07-27T00:00:00+08:00').getTime();
function isUncountedShortLoss(e) {
    if (e.type !== 'session' || !e.data) return false;
    if (e.sessionType === 'study') return false; // study sessions always count
    // Classroom Survivors: only survival (fighting) time counts for the 2-min
    // rule. Question/minigame time is excluded so students can't idle on a
    // question overlay to rack up "session time".
    if (e.sessionType === 'vampireSurvivors' || e.sessionType === 'vampire') {
        if (e.data.won) return false; // wins always count (boss requires 10 min)
        if (new Date(e.timestamp).getTime() < TWO_MIN_RULE_START) return false;
        const sec = e.data.survivalTimeSec || 0;
        return sec < TARGET_MIN_LOSS_SEC;
    }
    if (e.data.ignored === true) return true;    // flagged by the game itself (uno/gomoku)
    if (new Date(e.timestamp).getTime() < TWO_MIN_RULE_START) return false;
    let sec = null, loss = false;
    if (e.sessionType === 'gomoku') {
        sec = e.data.totalTimeSec;
        loss = e.data.result !== 'win';
    } else if (e.sessionType === 'uno') {
        sec = e.data.totalTimeSec;
        loss = e.data.winner !== 0;
    }
    return loss && typeof sec === 'number' && sec < TARGET_MIN_LOSS_SEC;
}

/**
 * Checks if the user's content is entirely on SR cooldown and advances their assigned page if so.
 */
function checkAndAdvancePageIfAllOnCooldown() {
    if (!authActiveUser || !authActiveUser.srState) return false;
    
    if (!authActiveUser.book || !authActiveUser.unit || !authActiveUser.page) return false;

    let book = authActiveUser.book;
    let unit = authActiveUser.unit.toString();
    let page = authActiveUser.page.toString();
    
    let advanced = false;
    const currentSession = getCurrentSession();

    while (true) {
        const sortedPages = getSortedPagesForBook(book);
        const activePageIndex = sortedPages.findIndex(
            p => p.book === book && p.unit === unit && p.page === page
        );
        
        if (activePageIndex === -1) break;

        const candidatePages = sortedPages.slice(0, activePageIndex + 1);
        
        const vocabPool = buildItemPool(candidatePages, 'vocab').flatPool;
        const sentencesPool = buildItemPool(candidatePages, 'sentences').flatPool;
        const pairsPool = buildItemPool(candidatePages, 'sentencePairs').flatPool;

        let vocabAllCooldown = false;
        if (vocabPool.length > 0) {
            const vocabSR = authActiveUser.srState.vocab || {};
            vocabAllCooldown = vocabPool.every(e => {
                const priority = getSRPriority(e.key, vocabSR, currentSession, null, null);
                return priority.group === 4;
            });
        }
        
        let sentencesAllCooldown = false;
        if (sentencesPool.length > 0) {
            const sentencesSR = authActiveUser.srState.sentences || {};
            sentencesAllCooldown = sentencesPool.every(e => {
                const priority = getSRPriority(e.key, sentencesSR, currentSession, null, null);
                return priority.group === 4;
            });
        }
        
        let pairsAllCooldown = false;
        if (pairsPool.length > 0) {
            const pairsSR = authActiveUser.srState.sentencePairs || {};
            pairsAllCooldown = pairsPool.every(e => {
                const priority = getSRPriority(e.key, pairsSR, currentSession, null, null);
                return priority.group === 4;
            });
        }
        
        if ((vocabPool.length > 0 && vocabAllCooldown) || 
            (sentencesPool.length > 0 && sentencesAllCooldown) || 
            (pairsPool.length > 0 && pairsAllCooldown)) {
            
            if (activePageIndex + 1 < sortedPages.length) {
                const nextPage = sortedPages[activePageIndex + 1];
                book = nextPage.book;
                unit = nextPage.unit;
                page = nextPage.page;
                advanced = true;
            } else {
                break; // No more pages in this series
            }
        } else {
            break; // Content is available, stay on this page
        }
    }
    
    if (advanced) {
        authActiveUser.book = book;
        authActiveUser.unit = unit;
        authActiveUser.page = page;
        saveActiveUserToCache();

        // STICKY ADVANCE (2026-09-08, "Doris page-43 trap"): the in-memory
        // advance used to evaporate when the fire-and-forget updateStudent
        // below failed — then the next finalizeSession re-ran the check at an
        // incremented sessionCount, saw a trickle of newly-due items, and
        // re-decided "stay". Persist the pending page alongside the SR state
        // so it survives app-kill AND re-applies on next login until the
        // server confirms it.
        try {
            localStorage.setItem('csPendingPageAdvance', JSON.stringify({ book, unit, page }));
        } catch { /* non-fatal */ }

        // Fire-and-forget update to backend
        apiFetch(`${API_BASE}/updateStudent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                studentId: authActiveUser.id,
                fields: { book, unit, page }
            })
        }).then(res => {
            if (res && res.ok) {
                try { localStorage.removeItem('csPendingPageAdvance'); } catch { /* non-fatal */ }
            } else {
                console.warn('auto page-advance not confirmed — will retry on next login');
            }
        }).catch(e => console.warn("Failed to auto-update student page (will retry on next login)", e));

        return true;
    }

    return false;
}

/**
 * Re-applies a pending page-advance that never reached the server (2026-09-08,
 * "Doris page-43 trap"). Called at login after the user record loads, BEFORE
 * the login-time checkAndAdvancePageIfAllOnCooldown, so a previously-decided
 * advance isn't re-litigated against a newer sessionCount — it is applied and
 * re-sent until confirmed.
 */
function reapplyPendingPageAdvance() {
    try {
        const raw = localStorage.getItem('csPendingPageAdvance');
        if (!raw || !authActiveUser) return false;
        const pending = JSON.parse(raw);
        if (!pending || !pending.book) return false;
        authActiveUser.book = pending.book;
        authActiveUser.unit = pending.unit;
        authActiveUser.page = pending.page;
        saveActiveUserToCache();
        apiFetch(`${API_BASE}/updateStudent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                studentId: authActiveUser.id,
                fields: { book: pending.book, unit: pending.unit, page: pending.page }
            })
        }).then(res => {
            if (res && res.ok) {
                try { localStorage.removeItem('csPendingPageAdvance'); } catch { /* non-fatal */ }
            }
        }).catch(() => {}); // stays pending; retried next login
        return true;
    } catch { return false; }
}

