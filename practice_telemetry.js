/* Permanent, low-volume run lifecycle. Completion/target credit remains in the
 * existing session events. All calls fail open for gameplay and contain no ink,
 * audio, answers, form values or console objects. */
(function (w) {
    'use strict';
    var owner = '', emit = null, run = null, tab = '', timer = null, errorCount = 0;
    var boot = uid(), scope = location.pathname.replace(/[^a-z0-9]/gi, '_');
    function uid() { return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10); }
    function clean(s, max) { return String(s == null ? '' : s)
        .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[token]')
        .replace(/((?:password|authToken|authorization|x-auth-token|x-app-key|appKey|token)["']?\s*[:=]\s*["']?)[^\s,"'&}]+/gi, '$1[redacted]')
        .replace(/(https?:\/\/[^\s?#)]+)[?#][^\s)]*/g, '$1').slice(0, max || 600); }
    function key() { return 'csPractice_' + scope + '_' + owner + '_' + tab; }
    function save() {
        clearTimeout(timer); timer = null;
        if (!owner || !tab) return;
        try { if (run) localStorage.setItem(key(), JSON.stringify(run)); else localStorage.removeItem(key()); } catch (_) {}
    }
    function event(phase, detail) {
        if (!owner || !emit) return;
        try { emit({ phase: phase, runId: run && run.id || null, mode: run && run.mode || null,
            game: run && run.game || null, startedAt: run && run.startedAt || null,
            lastActivityAt: run && run.lastActivityAt || null,
            checkpoint: run && run.checkpoint || {}, detail: detail || {} }); } catch (_) {}
    }
    function interrupt(reason, inferred) {
        if (!run) return;
        event('interrupted', { reason: reason, inferred: !!inferred, previousExit: run.exit || null });
        run = null; save();
    }
    function attach(user, callback) {
        try {
            if (!user || !user.id || (user.role && user.role !== 'student')) { detach('account_changed'); return; }
            if (owner === user.id && emit) { emit = callback; return; }
            detach('account_changed'); owner = user.id; emit = callback; errorCount = 0;
            var tabKey = 'csPracticeTab_' + scope;
            try { tab = sessionStorage.getItem(tabKey) || uid(); sessionStorage.setItem(tabKey, tab); } catch (_) { tab = uid(); }
            var old; try { old = JSON.parse(localStorage.getItem(key()) || 'null'); } catch (_) {}
            if (old && old.id && old.boot !== boot && Date.parse(old.startedAt) > Date.now() - 14 * 86400000) {
                run = old; interrupt('returned_to_unfinished_page', true);
            }
        } catch (_) {}
    }
    function detach(reason) { try { interrupt(reason || 'logout', false); save(); } catch (_) {} owner = ''; emit = null; run = null; }
    function start(mode, game) {
        try {
            if (!owner || !emit) return null;
            interrupt('another_run_started', false); errorCount = 0;
            run = { id: 'pr_' + uid(), boot: boot, mode: mode === 'study' ? 'study' : 'game', game: clean(game, 50),
                startedAt: new Date().toISOString(), lastActivityAt: new Date().toISOString(), checkpoint: {} };
            event('start'); save(); return run.id;
        } catch (_) { return null; }
    }
    function complete(game) {
        if (!run || (run.game && game && run.game !== game)) return null;
        var id = run.id; event('complete'); run = null; save(); return id;
    }
    function checkpoint(state) {
        if (!run || !state) return;
        try {
            ['round', 'ex', 'spGate', 'spRec', 'audioPhase'].forEach(function (k) { if (state[k] !== undefined) run.checkpoint[k] = clean(state[k], 50); });
            run.lastActivityAt = new Date().toISOString(); run.exit = null;
            if (!timer) timer = setTimeout(save, 3000);
        } catch (_) {}
    }
    function error(message) { if (!owner || errorCount++ >= 5) return; event('error', { message: clean(message) }); save(); }
    w.PracticeTelemetry = { attach: attach, detach: detach, start: start, complete: complete,
        interrupt: interrupt, checkpoint: checkpoint, current: function (game) { return run && (!game || run.game === game) ? run.id : null; } };
    w.addEventListener('error', function (e) { if (e.target === w) error(e.message + '\n' + (e.error && e.error.stack || '')); }, true);
    w.addEventListener('unhandledrejection', function (e) { var r = e.reason; error(r && typeof r.message === 'string' ? r.message : typeof r === 'string' ? r : 'Unhandled promise rejection'); });
    w.addEventListener('webglcontextlost', function () { error('Graphics context lost'); }, true);
    w.addEventListener('pagehide', function (e) { if (run) { run.exit = { at: new Date().toISOString(), persisted: !!e.persisted }; save(); } });
    w.addEventListener('pageshow', function () { if (run) { run.exit = null; save(); } });
})(window);
