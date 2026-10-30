// Teacher-only incident view. Render student-supplied log text with textContent.
(function (w) {
    'use strict';
    var sequence = 0;
    var labels = { boot: 'Page opened', activity: 'Exercise step', heartbeat: 'Page running', error: 'JavaScript error',
        promise_error: 'Unhandled promise', console_error: 'Console error', console_warn: 'Console warning', console_log: 'Console message',
        resource_error: 'Resource failed', network: 'Request', visibility: 'Visibility changed', pagehide: 'Page left', pageshow: 'Page shown',
        freeze: 'Page frozen', resume: 'Page resumed', context_lost: 'Graphics context lost', speech: 'Speech engine',
        app_navigation: 'App requested navigation', long_task: 'Long main-thread task', logout: 'Logged out', practice: 'Practice lifecycle', client_report: 'Recorder health/budget' };
    function el(tag, text) { var e = document.createElement(tag); if (text != null) e.textContent = text; return e; }
    function time(s) { return s ? new Date(s).toLocaleString('en-GB', { timeZone: 'Asia/Shanghai', hour12: false }) : '—'; }
    function device(d, id) {
        var ua = d && d.ua || '';
        var name = /iPad/.test(ua) || (d && d.platform === 'MacIntel' && d.touch > 1) ? 'iPad' : /iPhone/.test(ua) ? 'iPhone' : /HUAWEI|HarmonyOS/.test(ua) ? 'Huawei tablet' : /Android/.test(ua) ? 'Android' : 'Browser';
        return name + (/baiduboxapp/i.test(ua) ? ' · Baidu' : /MicroMessenger/i.test(ua) ? ' · WeChat' : '') + ' · ' + (d && d.screen || '') + ' · ' + id.slice(-5);
    }
    function lifecycle(host, student) {
        var events = (student.analytics || []).filter(function (e) { return e.type === 'practice'; });
        host.appendChild(el('h4', 'Practice sessions · permanent tracking'));
        if (!events.length) { host.appendChild(el('p', 'No run lifecycle records in the loaded history yet. New starts are recorded after the student opens the updated app.')); return; }
        var runs = new Map(); events.forEach(function (e) {
            if (!e.runId) return;
            var r = runs.get(e.runId) || { id: e.runId, mode: e.mode, game: e.game, start: null, end: null };
            if (e.phase === 'start') r.start = e.timestamp;
            if (e.phase === 'complete' || e.phase === 'interrupted') r.end = e;
            runs.set(e.runId, r);
        });
        var list = Array.from(runs.values()).sort(function (a,b) { return String(b.start || b.end && b.end.timestamp).localeCompare(String(a.start || a.end && a.end.timestamp)); });
        host.appendChild(el('p', list.filter(function (r) { return r.start; }).length + ' recorded starts · '
            + list.filter(function (r) { return r.end && r.end.phase === 'complete'; }).length + ' completed · '
            + list.filter(function (r) { return r.end && r.end.phase === 'interrupted'; }).length + ' interrupted/exited. Unresolved runs are not proof of a crash. Counts use loaded history.'));
        var table = el('table'); table.style.cssText = 'width:100%;font-size:13px;margin-bottom:20px;';
        var head = el('tr'); ['Started (China)', 'Mode / game', 'Outcome', 'Run ID'].forEach(function (s) { head.appendChild(el('th',s)); }); table.appendChild(head);
        list.slice(0,100).forEach(function (r) {
            var row = el('tr'), outcome = r.end ? r.end.phase === 'complete' ? 'Completed' : (r.end.detail && r.end.detail.inferred ? 'Unexplained page return' : 'Exited/interrupted') + ' · ' + (r.end.detail && r.end.detail.reason || '') : 'No end record in loaded history';
            [time(r.start), (r.mode || '') + ' / ' + (r.game || ''), outcome, r.id].forEach(function (s) { var cell=el('td',s);cell.style.padding='8px';row.appendChild(cell); }); table.appendChild(row);
        });
        var wrap = el('div'); wrap.style.overflowX='auto';wrap.appendChild(table);host.appendChild(wrap);
    }
    async function load(cursor) {
        if (typeof currentStudent === 'undefined' || !currentStudent) return;
        var student = currentStudent, ticket = ++sequence, host = document.getElementById('diagnosticsLog'), status = document.getElementById('diagnosticsStatus');
        status.textContent = 'Loading diagnostics…'; host.replaceChildren();
        try {
            var response = await apiFetch(API_BASE + '/clientDiagnostics?view=events&studentId=' + encodeURIComponent(student.id)
                + (typeof cursor === 'string' ? '&cursor=' + encodeURIComponent(cursor) : ''), { cache: 'no-store' });
            if (!response.ok) throw new Error(response.status === 401 ? 'Please sign in again to view diagnostics.' : 'Diagnostics unavailable (' + response.status + '). Use Refresh to retry.');
            var data = await response.json();
            if (ticket !== sequence || currentStudent !== student) return;
            var days = data.days || [], config = data.config || {}, events = [], seen = new Set();
            days.forEach(function (day) { (day.events || []).forEach(function (e) {
                if (!seen.has(e.eventId)) { seen.add(e.eventId); events.push(Object.assign({ device: device(day.device, day.browserId), browserId: day.browserId }, e)); }
            }); });
            events.sort(function (a, b) { return b.ts.localeCompare(a.ts) || b.seq - a.seq; });
            var latest = days.reduce(function (a, d) { return !a || d.updatedAt > a ? d.updatedAt : a; }, '');
            status.textContent = (config.enabled ? 'Recording enabled until ' + time(config.endsAt) : 'Recording is off')
                + '. Last upload: ' + time(latest) + ' (China time).';
            document.getElementById('diagnosticsStop').disabled = !config.enabled;
            lifecycle(host, student);
            if (data.cursor) {
                var older=el('button','Older diagnostic uploads');older.className='dash-action-btn';older.onclick=function(){load(data.cursor);};host.appendChild(older);
            }
            var profiles = new Map(); days.forEach(function (d) { profiles.set(d.browserId, device(d.device, d.browserId)); });
            var info = el('p', profiles.size ? 'Seen profiles: ' + Array.from(profiles.values()).join(' / ') : 'Waiting for this student to open the updated game and sign in.');
            info.style.color = '#94a3b8'; host.appendChild(info);
            var measured = new Map(); events.forEach(function (e) {
                if (e.type !== 'heartbeat') return;
                try { var m = JSON.parse(e.detail).diagnostics, key=e.browserId+'/'+e.boot;
                    if (m && !measured.has(key)) measured.set(key,m); } catch (_) {}
            });
            if (measured.size) {
                var totals={uploads:0,readRU:0,writeRU:0,http429:0,maxStorageMs:0,maxLagMs:0};
                measured.forEach(function(m){['uploads','readRU','writeRU','http429'].forEach(function(k){totals[k]+=Number(m[k])||0;});['maxStorageMs','maxLagMs'].forEach(function(k){totals[k]=Math.max(totals[k],Number(m[k])||0);});});
                host.appendChild(el('p','Measured in fetched heartbeat samples: '+totals.uploads+' uploads · '+Math.round(totals.readRU+totals.writeRU)+' RU · '
                    +totals.http429+' throttled responses · max diagnostic storage write '+totals.maxStorageMs.toFixed(1)+'ms · max sampled timer delay '+totals.maxLagMs+'ms. These are partial samples, not a bill.'));
            }
            if (!events.length) return;
            var restarts = events.filter(function (e) {
                if (e.type !== 'boot') return false;
                try { var p = JSON.parse(e.detail).previous; return p && !p.clean && p.visible === 'visible'; } catch (_) { return false; }
            });
            var errors = events.filter(function (e) { return ['error', 'promise_error', 'console_error', 'context_lost', 'resource_error'].indexOf(e.type) >= 0; });
            var summary = el('p', errors.length + ' error/resource indicators · ' + restarts.length + ' page openings following an unexplained visible exit. These are clues, not confirmed crashes.');
            summary.style.margin = '12px 0'; host.appendChild(summary);
            var table = el('table'); table.style.cssText = 'width:100%;border-collapse:collapse;font-size:13px;';
            var filter=el('select');filter.setAttribute('aria-label','Filter fetched diagnostic records');filter.style.margin='12px 0';
            [['all','All fetched records'],['practice','Practice lifecycle'],['errors','Errors and warnings'],['speech','Speech and audio'],['heartbeat','Performance samples']].forEach(function(pair){var option=el('option',pair[1]);option.value=pair[0];filter.appendChild(option);});
            filter.onchange=function(){table.querySelectorAll('tr[data-diag-type]').forEach(function(row){var type=row.dataset.diagType;row.hidden=filter.value!=='all'&&(filter.value==='errors'?['error','promise_error','console_error','console_warn','context_lost','resource_error'].indexOf(type)<0:type!==filter.value);});};host.appendChild(filter);
            var head = el('tr'); ['China time / profile', 'Activity', 'Evidence'].forEach(function (s) { head.appendChild(el('th', s)); }); table.appendChild(head);
            events.slice(0, 4000).forEach(function (e) {
                var row = el('tr'); row.style.cssText = 'border-top:1px solid #334155;vertical-align:top;';
                row.dataset.diagType = e.type;
                var when = el('td', time(e.ts)); when.appendChild(el('div', e.device));
                var activity = el('td', labels[e.type] || e.type);
                var c = e.context || {};
                if (c.word || c.letter || c.round) activity.appendChild(el('div', [c.round === 'D' ? 'Handwriting' : c.round, c.word, c.letter ? 'letter ' + c.letter : ''].filter(Boolean).join(' · ')));
                var evidence = el('td');
                if (e.type === 'activity') evidence.appendChild(el('span', c.checkpoint || e.detail));
                else if (e.type === 'boot') {
                    var detail = null; try { detail = JSON.parse(e.detail); } catch (_) {}
                    var prev = detail && detail.previous;
                    evidence.appendChild(el('span', prev ? (prev.clean ? 'Previous page reported an exit.' : 'Previous page had no exit signal. Last seen: ' + time(prev.ts) + ' · ' + (prev.context && (prev.context.word || prev.context.checkpoint) || 'unknown activity')) : 'No previous-page breadcrumb.'));
                } else if (['error', 'promise_error', 'console_error', 'console_warn', 'speech', 'resource_error'].indexOf(e.type) >= 0) evidence.appendChild(el('span', (e.detail || '').slice(0, 350)));
                else evidence.appendChild(el('span', (e.detail || '').slice(0, 180)));
                var more = el('details'), title = el('summary', 'Details'); more.appendChild(title);
                var text = el('pre', 'Page: ' + e.boot + '\n' + (e.detail || '')); text.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;max-width:650px;'; more.appendChild(text); evidence.appendChild(more);
                [when, activity, evidence].forEach(function (cell) { cell.style.padding = '10px 8px'; row.appendChild(cell); }); table.appendChild(row);
            });
            var wrap = el('div'); wrap.style.overflowX = 'auto'; wrap.appendChild(table); host.appendChild(wrap);
        } catch (error) { if (ticket === sequence) status.textContent = error.message; }
    }
    async function configure(enabled) {
        if (!currentStudent) return;
        var status = document.getElementById('diagnosticsStatus');
        try {
            var response = await apiFetch(API_BASE + '/clientDiagnostics?studentId=' + encodeURIComponent(currentStudent.id), {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'configure', enabled: enabled, days: 7 })
            });
            if (!response.ok) throw new Error('Could not update diagnostics (' + response.status + ').');
            await load();
        } catch (error) { status.textContent = error.message; }
    }
    w.renderDiagnosticsTab = load;
    w.configureStudentDiagnostics = configure;
})(window);
