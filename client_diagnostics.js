/* Account-enabled remote incident recorder. No ink/audio, screen recording,
 * request bodies, headers, passwords or console object dumps. Never awaited by
 * gameplay. Queues, storage, detail lengths, retries and retention are bounded. */
(function (w) {
    'use strict';
    var nativeFetch = w.fetch && w.fetch.bind(w), boot = uid(), seq = 0, owner = '', version = '';
    var scope = location.pathname.replace(/[^a-z0-9]/gi, '_'), config = null, browserId = '', tabId = '';
    var queue = [], context = {}, enabled = false, busy = false, attached = false, suspended = false;
    var timer = null, uploadTimer = null, saveTimer = null, refreshTimer = null, delay = 30000;
    var lastTick = Date.now(), lastLongTask = 0, observer = null, consoleOriginals = {}, lastConsole = {};
    var loadAt = performance.now(), configGeneration = 0;
    var burstStart = Date.now(), ordinaryCount = 0, errorCount = 0, suppressed = 0;
    var encoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
    var budgetUntil = 0, budgetDay = '', dailyEvents = 0, budgetSavedAt = 0;
    var metrics = { uploads: 0, failures: 0, http429: 0, dailyBudgetStops: 0, readRU: 0, writeRU: 0,
        uploadBytes: 0, storageWrites: 0, storageMs: 0, maxStorageMs: 0, maxLagMs: 0, queueDropped: 0 };
    function jsonBytes(value) { var json = JSON.stringify(value); return encoder ? encoder.encode(json).length : new Blob([json]).size; }
    function uid() { return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 11); }
    function key(name) { return 'csDiag_' + scope + '_' + owner + '_' + name; }
    function read(k) { try { return localStorage.getItem(k); } catch (_) { return null; } }
    function put(k, v) {
        var since = performance.now();
        try { localStorage.setItem(k, v); } catch (_) {}
        var ms = performance.now() - since; metrics.storageWrites++; metrics.storageMs += ms;
        metrics.maxStorageMs = Math.max(metrics.maxStorageMs, ms);
    }
    function remove(k) { try { localStorage.removeItem(k); } catch (_) {} }
    function live() { return enabled && config && Date.parse(config.endsAt) > Date.now(); }
    function redact(value, max) {
        return String(value == null ? '' : value)
            .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[token]')
            .replace(/((?:password|authToken|authorization|x-auth-token|x-app-key|appKey|APP_API_KEY|token)["']?\s*[:=]\s*["']?)[^\s,"'&}]+/gi, '$1[redacted]')
            .replace(/(https?:\/\/[^\s?#)]+)[?#][^\s)]*/g, '$1').slice(0, max || 900);
    }
    function simple(value) {
        if (value instanceof Error) return redact(value.message + '\n' + (value.stack || ''));
        if (value == null || ['string', 'number', 'boolean'].indexOf(typeof value) >= 0) return redact(value);
        return '[object omitted]';
    }
    function path(url) { try { var u = new URL(String(url), location.href); return u.origin + u.pathname; } catch (_) { return '[resource]'; } }
    function save() {
        clearTimeout(saveTimer); saveTimer = null;
        if (!owner || !tabId) return;
        while (queue.length > 200 || (queue.length && JSON.stringify(queue).length > 60000)) { queue.shift(); metrics.queueDropped++; }
        put(key('queue_' + tabId), JSON.stringify({ owner: owner, endsAt: config && config.endsAt, events: queue }));
        if (Date.now() - budgetSavedAt >= 10000 || dailyEvents >= 15000) {
            put(key('budget'), JSON.stringify({ day: budgetDay, events: dailyEvents })); budgetSavedAt = Date.now();
        }
    }
    function record(type, detail, urgent) {
        try {
            if (!live()) return;
            var day = new Date().toISOString().slice(0, 10);
            if (budgetDay !== day) { budgetDay = day; dailyEvents = 0; }
            if (Date.now() < budgetUntil || dailyEvents >= 15000) return;
            if (dailyEvents === 14999) { type = 'client_report'; detail = 'Daily diagnostic event budget reached; permanent session tracking continues.'; urgent = true; metrics.dailyBudgetStops++; }
            var now = Date.now(), critical = ['error', 'promise_error', 'console_error', 'resource_error', 'context_lost'].indexOf(type) >= 0;
            if (now - burstStart >= 10000) { burstStart = now; ordinaryCount = 0; errorCount = 0; }
            if (critical ? errorCount++ >= 8 : ordinaryCount++ >= 80) { suppressed++; return; }
            dailyEvents++;
            if (w.PracticeTelemetry) context.practiceRunId = w.PracticeTelemetry.current() || '';
            queue.push({ boot: boot, seq: ++seq, ts: new Date().toISOString(), elapsedMs: Math.round(performance.now() - loadAt),
                type: type, context: Object.assign({}, context), detail: redact(typeof detail === 'string' ? detail : JSON.stringify(detail || {})) });
            if (queue.length > 200) { queue.shift(); metrics.queueDropped++; }
            if (urgent) save();
            else if (!saveTimer) saveTimer = setTimeout(save, 750);
        } catch (_) {} // diagnostics must never throw into the exercise
    }
    function checkpoint(name, state) {
        if (!live()) return;
        try {
            if (state && ((state.round && state.round !== context.round) || (state.mode && state.mode !== context.mode))) { context.word = ''; context.letter = ''; }
            if (state && state.ex) context.active = true;
            if (state && state.sess) context.active = false;
            if (state && state.ex) context.exercise = redact(state.ex, 100);
            if (state) ['mode', 'round', 'word', 'letter', 'exercise', 'active'].forEach(function (k) {
                if (state[k] !== undefined) context[k] = typeof state[k] === 'boolean' ? state[k] : redact(state[k], 100);
            });
            context.checkpoint = redact(name, 100);
            record('activity', name);
        } catch (_) {}
    }
    function device() {
        var d = { ua: navigator.userAgent, platform: navigator.platform, touch: navigator.maxTouchPoints || 0,
            screen: screen.width + 'x' + screen.height, viewport: innerWidth + 'x' + innerHeight,
            dpr: devicePixelRatio || 1, timezoneOffset: new Date().getTimezoneOffset(), version: version };
        try { if (performance.memory) d.heapMB = Math.round(performance.memory.usedJSHeapSize / 1048576); } catch (_) {}
        return d;
    }
    function snapshot() {
        var out = { visible: document.visibilityState, online: navigator.onLine, lagMs: Math.max(0, Date.now() - lastTick - 15000),
            canvases: 0, canvasPixels: 0, images: document.images.length, viewport: innerWidth + 'x' + innerHeight, suppressed: suppressed };
        try {
            document.querySelectorAll('canvas').forEach(function (c) { out.canvases++; out.canvasPixels += c.width * c.height; });
            if (w.SpeechStatus) out.speech = w.SpeechStatus.state;
            if (w.HWRecognition && typeof w.HWRecognition.isReady === 'function') out.handwritingReady = w.HWRecognition.isReady();
            if (w.HWRecognition && typeof w.HWRecognition.status === 'function') out.handwritingStatus = w.HWRecognition.status();
            if (performance.memory) out.heapMB = Math.round(performance.memory.usedJSHeapSize / 1048576);
        } catch (_) {}
        metrics.maxLagMs = Math.max(metrics.maxLagMs, out.lagMs);
        out.diagnostics = Object.assign({}, metrics);
        ['storageMs', 'maxStorageMs', 'readRU', 'writeRU'].forEach(function (k) { out.diagnostics[k] = Math.round(out.diagnostics[k] * 100) / 100; });
        return out;
    }
    function heartbeat(end) {
        if (!live()) return;
        put(key('heartbeat_' + tabId), JSON.stringify({ boot: boot, ts: new Date().toISOString(), clean: !!end,
            visible: document.visibilityState, context: context }));
    }
    function scheduleUpload(ms) {
        clearTimeout(uploadTimer);
        if (live()) uploadTimer = setTimeout(flush, ms || delay);
    }
    function tokenOwner() {
        try { var t = read('csSessionToken'); return t && JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub; }
        catch (_) { return null; }
    }
    async function request(method, body) {
        if (!nativeFetch || typeof API_BASE_URL === 'undefined' || tokenOwner() !== owner) throw new Error('diagnostics unavailable');
        var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null, timeout;
        try {
            var operation = nativeFetch(API_BASE_URL + '/clientDiagnostics', { method: method, cache: 'no-store',
                headers: { 'Content-Type': 'application/json', 'X-Auth-Token': read('csSessionToken') || '' },
                body: body ? JSON.stringify(body) : undefined, signal: ctrl ? ctrl.signal : undefined });
            var r = await Promise.race([operation, new Promise(function (_, reject) {
                timeout = setTimeout(function () { if (ctrl) ctrl.abort(); reject(new Error('diagnostic timeout')); }, 4000);
            })]);
            var result; try { result = await r.json(); } catch (_) { result = {}; }
            if (result.metrics) { metrics.readRU += Number(result.metrics.readRU) || 0; metrics.writeRU += Number(result.metrics.writeRU) || 0; }
            if (!r.ok) { var failure = new Error('diagnostic status ' + r.status); failure.status = r.status; failure.kind = result.kind; failure.retryAfterMs = result.retryAfterMs; throw failure; }
            return result;
        } finally { clearTimeout(timeout); }
    }
    async function flush() {
        if (!live() || busy || suspended || Date.now() < budgetUntil || !queue.length || navigator.onLine === false || tokenOwner() !== owner) { scheduleUpload(); return; }
        busy = true;
        var generation = configGeneration;
        var batch = queue.slice(0, 32), payload = { browserId: browserId, device: device(), events: batch };
        while (batch.length > 1 && jsonBytes(payload) > 16000) batch.pop();
        try {
            var result = await request('POST', payload);
            if (generation !== configGeneration) return;
            if (result.enabled === false) { stop(true); return; }
            var ack = new Set(result.ack || []);
            metrics.uploads++; metrics.uploadBytes += jsonBytes(payload);
            queue = queue.filter(function (e) { return !ack.has(e.boot + ':' + e.seq); });
            save(); delay = 30000;
        } catch (error) {
            metrics.failures++; if (error.status === 429) metrics.http429++;
            if (error.kind === 'daily_budget') { metrics.dailyBudgetStops++; budgetUntil = Date.now() + (Number(error.retryAfterMs) || 3600000); }
            delay = Math.min(Math.max(delay * 2, Number(error.retryAfterMs) || 0), 300000);
        }
        finally { busy = false; if (generation === configGeneration) scheduleUpload(queue.length && delay === 30000 ? 3000 : delay); }
    }
    function installConsole() {
        ['warn', 'error', 'log', 'info'].forEach(function (level) {
            var original = console[level]; consoleOriginals[level] = original;
            console[level] = function () {
                try {
                    if (live()) {
                        var now = Date.now(), rate = lastConsole[level] || { start: now, count: 0 };
                        if (now - rate.start >= 10000) rate = { start: now, count: 0 };
                        if (rate.count++ < 8) {
                            var message = Array.prototype.slice.call(arguments, 0, 4).map(simple).join(' ');
                            record(level === 'error' ? 'console_error' : level === 'warn' ? 'console_warn' : 'console_log', message, level === 'error');
                        }
                        lastConsole[level] = rate;
                    }
                } catch (_) {}
                return original.apply(console, arguments);
            };
        });
    }
    function start(cfg) {
        if (enabled) { config = cfg; put(key('config'), JSON.stringify(cfg)); return; }
        config = cfg; enabled = true; put(key('config'), JSON.stringify(cfg));
        browserId = read(key('browser')) || uid(); put(key('browser'), browserId);
        try { var savedBudget = JSON.parse(read(key('budget')) || 'null'); if (savedBudget) { budgetDay = savedBudget.day; dailyEvents = savedBudget.events || 0; } } catch (_) {}
        try { tabId = sessionStorage.getItem(key('tab')) || uid(); sessionStorage.setItem(key('tab'), tabId); } catch (_) { tabId = uid(); }
        // Recover queues from the same owner/deployment, including tabs closed yesterday.
        var prefix = key('queue_'), keys = [];
        try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k.indexOf(prefix) === 0) keys.push(k); } } catch (_) {}
        keys.slice(-12).forEach(function (k) {
            try {
                var raw = read(k); if (!raw || raw.length > 100000) { remove(k); return; }
                var saved = JSON.parse(raw);
                if (saved.owner === owner && Date.parse(saved.endsAt) > Date.now() && Array.isArray(saved.events))
                    queue = queue.concat(saved.events.filter(function (e) { return Date.parse(e.ts) > Date.now() - 7 * 86400000; }));
                if (k !== key('queue_' + tabId)) remove(k);
            } catch (_) { remove(k); }
        });
        var previous = null;
        try { previous = JSON.parse(read(key('heartbeat_' + tabId)) || 'null'); } catch (_) {}
        context = { version: version };
        installConsole();
        record('boot', { navigation: (performance.getEntriesByType('navigation')[0] || {}).type || 'unknown',
            wasDiscarded: typeof document.wasDiscarded === 'boolean' ? document.wasDiscarded : 'unsupported',
            previous: previous }, true);
        (w.__csDiagEarly || []).slice(0, 8).forEach(function (e) { record('error', e, true); });
        w.__csDiagEarly = [];
        heartbeat(false); lastTick = Date.now();
        timer = setInterval(function () {
            if (!live()) { stop(true); return; }
            if (document.visibilityState !== 'hidden') { record('heartbeat', snapshot()); heartbeat(false); }
            lastTick = Date.now();
        }, 15000);
        try {
            if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes.indexOf('longtask') >= 0) {
                observer = new PerformanceObserver(function (list) {
                    list.getEntries().forEach(function (e) {
                        if (e.duration >= 250 && Date.now() - lastLongTask > 15000) { lastLongTask = Date.now(); record('long_task', { ms: Math.round(e.duration) }); }
                    });
                });
                observer.observe({ entryTypes: ['longtask'] });
            }
        } catch (_) {}
        save(); scheduleUpload(2000);
    }
    function stop(discard) {
        if (enabled && !discard) { record('logout', 'account changed', true); heartbeat(true); }
        enabled = false; configGeneration++;
        clearInterval(timer); clearTimeout(uploadTimer); clearTimeout(saveTimer); clearTimeout(refreshTimer);
        if (observer) observer.disconnect(); observer = null;
        Object.keys(consoleOriginals).forEach(function (level) { console[level] = consoleOriginals[level]; }); consoleOriginals = {};
        if (discard && owner) { remove(key('config')); remove(key('queue_' + tabId)); }
        queue = []; context = {}; attached = false;
    }
    function attach(user, v) {
        if (!user || !user.id || (user.role && user.role !== 'student')) { stop(false); return; }
        if (attached && owner === user.id) return;
        if (enabled) stop(false);
        if (owner !== user.id) {
            Object.keys(metrics).forEach(function (k) { metrics[k] = 0; });
            budgetUntil = 0; budgetDay = ''; dailyEvents = 0; suppressed = 0;
        }
        owner = user.id; version = v || ''; attached = true;
        var generation = ++configGeneration;
        try { var cached = JSON.parse(read(key('config')) || 'null'); if (cached && cached.enabled && Date.parse(cached.endsAt) > Date.now()) start(cached); } catch (_) {}
        async function refresh() {
            if (generation !== configGeneration || !attached) return;
            try {
                var cfg = await request('GET');
                if (generation !== configGeneration) return;
                if (cfg.enabled && Date.parse(cfg.endsAt) > Date.now()) start(cfg);
                else { stop(true); return; }
            } catch (_) {} // leave bounded cached configuration until its own expiry
            if (generation === configGeneration) refreshTimer = setTimeout(refresh, 300000);
        }
        refresh();
    }
    w.ClientDiagnostics = { attach: attach, stop: stop, record: record, checkpoint: checkpoint, flush: flush,
        enabled: live, network: function (url, status, ms, error) {
            if (String(url).indexOf('clientDiagnostics') >= 0) return;
            record('network', { path: path(url), status: status, ms: Math.round(ms), error: error ? simple(error) : '' });
        } };
    w.addEventListener('error', function (e) {
        if (e.target && e.target !== w) record('resource_error', path(e.target.src || e.target.href || ''), true);
        else record('error', redact((e.message || '') + '\n' + (e.error && e.error.stack || path(e.filename || '') + ':' + e.lineno)), true);
    }, true);
    w.addEventListener('unhandledrejection', function (e) { record('promise_error', simple(e.reason), true); });
    w.addEventListener('pagehide', function (e) { record('pagehide', { persisted: e.persisted }, true); heartbeat(true); suspended = true; });
    w.addEventListener('pageshow', function (e) { suspended = false; record('pageshow', { persisted: e.persisted }); heartbeat(false); scheduleUpload(2000); });
    document.addEventListener('visibilitychange', function () { record('visibility', document.visibilityState, true); heartbeat(false); if (document.visibilityState === 'visible') { lastTick = Date.now(); scheduleUpload(2000); } });
    document.addEventListener('freeze', function () { record('freeze', '', true); });
    document.addEventListener('resume', function () { record('resume'); });
    document.addEventListener('webglcontextlost', function () { record('context_lost', 'webgl', true); }, true);
    w.addEventListener('online', function () { scheduleUpload(1000); });
    // Async loading must never delay DOMContentLoaded/login. If login already
    // finished while this file downloaded, attach to that student now.
    try { if (typeof authActiveUser !== 'undefined' && authActiveUser && typeof isTestMode !== 'undefined' && !isTestMode)
        attach(authActiveUser, typeof APP_VERSION !== 'undefined' ? APP_VERSION : ''); } catch (_) {}
})(window);
