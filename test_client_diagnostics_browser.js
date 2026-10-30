const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), assert = require('assert');
const script = fs.readFileSync(__dirname + '/client_diagnostics.js', 'utf8');
const token = id => 'x.' + Buffer.from(JSON.stringify({ sub: id })).toString('base64url') + '.x';
let enabled = true, fail = false, throttle = false, ack = true, uploads = [], checks = 0;
function check(value, name) { assert.ok(value, name); checks++; console.log('PASS: ' + name); }
const server = http.createServer((req, res) => {
    if (req.url.startsWith('/api/clientDiagnostics')) {
        if (req.method === 'GET') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ enabled, endsAt: new Date(Date.now() + 86400000).toISOString() })); return; }
        let raw = ''; req.on('data', c => raw += c); req.on('end', () => {
            if (fail) { res.writeHead(503); res.end('{}'); return; }
            if (throttle) { throttle=false;res.writeHead(429,{'Content-Type':'application/json'});res.end(JSON.stringify({kind:'cosmos_throttle',retryAfterMs:100}));return; }
            const p = JSON.parse(raw); uploads.push(p); res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ enabled, ack: ack ? p.events.map(e => e.boot + ':' + e.seq) : [], metrics: {readRU:2,writeRU:7,serverMs:3} }));
        }); return;
    }
    if (req.url.startsWith('/client_diagnostics.js')) { res.setHeader('Content-Type', 'application/javascript'); res.end(script); return; }
    res.end('<!doctype html><meta charset="utf-8"><script>const API_BASE_URL="/api";window.__originalWarn=console.warn;</script><script src="/client_diagnostics.js"></script><div id="exercise">Exercise remains usable</div>');
});
(async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
    const page = await browser.newPage(); const url = 'http://127.0.0.1:' + server.address().port;
    async function login(id = 'student_test_diag') {
        await page.evaluate(({ id, token }) => { localStorage.setItem('csSessionToken', token); ClientDiagnostics.attach({ id }, 'test'); }, { id, token: token(id) });
        await page.waitForTimeout(120);
    }
    try {
        await page.goto(url); await login();
        check(await page.evaluate(() => ClientDiagnostics.enabled()), 'account config enables the recorder');
        await page.evaluate(() => { ClientDiagnostics.checkpoint('handwriting-target-ready', { word: 'want', letter: 'a', round: 'D', active: true }); console.warn('password=secret', { password: 'object-secret' }); console.error(new Error('diagnostic test error')); });
        await page.evaluate(() => {
            dispatchEvent(new ErrorEvent('error', { message: 'runtime probe', error: new Error('runtime probe') }));
            dispatchEvent(new PromiseRejectionEvent('unhandledrejection', { reason: new Error('promise probe'), promise: Promise.resolve() }));
        });
        await page.evaluate(() => ClientDiagnostics.flush());
        const events = uploads.flatMap(p => p.events);
        check(events.some(e => e.type === 'console_warn') && events.some(e => e.type === 'console_error'), 'console warnings and error stacks upload automatically');
        check(events.some(e => e.type === 'error') && events.some(e => e.type === 'promise_error'), 'runtime errors and unhandled promise rejections captured');
        check(!JSON.stringify(uploads).includes('object-secret') && !JSON.stringify(uploads).includes('password=secret'), 'browser strips credentials and omits console objects');
        check(events.some(e => e.context.word === 'want' && e.context.letter === 'a'), 'events carry current handwriting context');
        fail = true;
        await page.evaluate(() => ClientDiagnostics.record('error', 'pending-before-reload', true));
        await page.evaluate(() => ClientDiagnostics.flush());
        check(await page.locator('#exercise').textContent() === 'Exercise remains usable', 'failed diagnostics do not block the exercise');
        // Simulate a missing exit callback and return on a later day. Do not use
        // page.reload(), which would deliberately write a clean pagehide marker.
        const saved = await page.evaluate(() => {
            const data = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); data[k] = localStorage.getItem(k); }
            const tab = {}; for (let i = 0; i < sessionStorage.length; i++) { const k = sessionStorage.key(i); tab[k] = sessionStorage.getItem(k); }
            Object.keys(data).filter(k => k.includes('heartbeat_')).forEach(k => { const v = JSON.parse(data[k]); v.clean = false; v.ts = new Date(Date.now() - 7200000).toISOString(); data[k] = JSON.stringify(v); });
            return { data, tab };
        });
        const recovered = await browser.newPage();
        await recovered.addInitScript(({ data, tab }) => { Object.keys(data).forEach(k => localStorage.setItem(k, data[k])); Object.keys(tab).forEach(k => sessionStorage.setItem(k, tab[k])); }, saved);
        await recovered.goto(url); fail = false;
        await recovered.evaluate(({ id, token }) => { localStorage.setItem('csSessionToken', token); ClientDiagnostics.attach({ id }, 'test'); }, { id: 'student_test_diag', token: token('student_test_diag') });
        await recovered.waitForTimeout(120); await recovered.evaluate(() => ClientDiagnostics.flush());
        check(uploads.flatMap(p => p.events).some(e => e.detail === 'pending-before-reload'), 'persisted errors survive a new document and retry');
        check(uploads.flatMap(p => p.events).filter(e => e.type === 'boot').some(e => { const p = JSON.parse(e.detail).previous; return p && !p.clean && Date.parse(p.ts) < Date.now() - 3600000; }), 'restart breadcrumb older than one hour is retained');
        await recovered.close();
        ack = false; fail = false;
        await page.evaluate(() => ClientDiagnostics.record('error', 'requires-ack', true));
        await page.evaluate(() => ClientDiagnostics.flush());
        check(await page.evaluate(() => Object.keys(localStorage).filter(k => k.includes('queue_')).some(k => localStorage.getItem(k).includes('requires-ack'))), 'unacknowledged events remain persisted');
        enabled = false; await login('student_other_diag');
        const before = uploads.length;
        await page.evaluate(() => { console.warn('not-captured'); ClientDiagnostics.checkpoint('other-account'); });
        await page.waitForTimeout(150);
        check(!await page.evaluate(() => ClientDiagnostics.enabled()) && uploads.length === before, 'other account is disabled and cannot inherit recording');
        check(await page.evaluate(() => console.warn === window.__originalWarn), 'disabled recording restores original console');
        enabled = true; ack = true; await login();
        const cost = await page.evaluate(() => {
            const t = performance.now();
            for (let i = 0; i < 1000; i++) ClientDiagnostics.checkpoint('budget-check', { word: '中'.repeat(80), letter: 'a' });
            return performance.now() - t;
        });
        await page.waitForTimeout(800); await page.evaluate(() => ClientDiagnostics.flush());
        check(cost < 200, '1000 lightweight checkpoints take under 200ms on the test browser (' + Math.round(cost) + 'ms)');
        check(uploads.every(p => Buffer.byteLength(JSON.stringify(p), 'utf8') <= 16000), 'Chinese text batches obey the UTF-8 byte budget');
        check(await page.evaluate(() => Object.keys(localStorage).filter(k => k.includes('queue_')).every(k => JSON.parse(localStorage.getItem(k)).events.length <= 200)), 'client queues remain bounded during event bursts');
        await page.evaluate(() => { for (let i = 0; i < 1000; i++) ClientDiagnostics.record('error', 'error-flood-probe', true); });
        check(await page.evaluate(() => Object.keys(localStorage).filter(k => k.includes('queue_')).every(k => JSON.parse(localStorage.getItem(k)).events.filter(e => e.detail === 'error-flood-probe').length <= 8)), 'an error flood cannot force unlimited synchronous log writes');
        await page.evaluate(()=>ClientDiagnostics.flush());
        throttle=true;await page.evaluate(()=>{ClientDiagnostics.record('activity','throttle probe');return ClientDiagnostics.flush();});
        await page.waitForTimeout(15100);await page.evaluate(()=>ClientDiagnostics.flush());
        const health=uploads.flatMap(p=>p.events).filter(e=>e.type==='heartbeat').map(e=>{try{return JSON.parse(e.detail).diagnostics;}catch(_){return null;}}).filter(Boolean);
        check(health.some(m=>m.readRU>0&&m.writeRU>0&&m.storageWrites>0),'heartbeats upload measured RU and synchronous storage timing');
        check(health.some(m=>m.http429>=1&&m.failures>=1),'throttling and failed uploads are measured without breaking exercises');
        console.log('Remote diagnostics browser: ' + checks + ' checks passed.');
    } finally { await browser.close(); await new Promise(r => server.close(r)); }
})().catch(e => { console.error(e); server.close(); process.exitCode = 1; });
