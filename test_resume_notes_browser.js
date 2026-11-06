'use strict';
const assert = require('node:assert/strict');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const { chromium } = require('playwright-core');
const { chromePath } = require('./scripts/test-browser.cjs');
const qa = path.join(__dirname, '.checks', 'resume-notes');
fs.mkdirSync(qa, { recursive: true });
let count = 0;
const ok = (value, label) => { assert.ok(value, label); console.log('PASS ' + label); count++; };
const server = http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/Classroom-survivors-preview/, '');
    const file = path.resolve(__dirname, '.' + pathname);
    if (!file.startsWith(__dirname + path.sep)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (error, bytes) => {
        if (error) { res.writeHead(404); res.end(); return; }
        res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css', '.json': 'application/json' })[path.extname(file)] || 'application/octet-stream');
        res.end(bytes);
    });
});
(async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + server.address().port;
    const browser = await chromium.launch({ executablePath: chromePath(), headless: true });
    try {
        const context = await browser.newContext({ viewport: { width: 592, height: 850 } });
        const errors = [];
        await context.route('**/*', route => {
            const url = route.request().url();
            if (url.includes('/api/') && !url.includes('/api/src/')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":false}' });
            return url.startsWith(base) && !url.includes('/models/') && !url.includes('/lib/wasm/') ? route.continue() : route.abort();
        });
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(base + '/Classroom-survivors-preview/index.html');
        await page.waitForFunction(() => window.PreviewNotes && window.GameRuntime && window.StudyRuntime);
        async function login({ study = null, game = null, notes = {}, placement = { book: 'PU1', unit: '5', page: '59' }, delayGame = false } = {}) {
            await page.evaluate(({ study, game, notes, placement, delayGame }) => {
                StudyRecovery.detach(); GameRecovery.detach(); PreviewNotes.close(); localStorage.clear();
                window.playTTS = window.synthGem = window.synthError = window.playHappySound = () => {};
                SpeechStatus = { isReady: () => false }; if (window.AdaptiveSpeech) AdaptiveSpeech.enabled = false;
                if (window.HWRecognition) HWRecognition.load = () => Promise.resolve();
                if (navigator.geolocation) navigator.geolocation.getCurrentPosition = () => {};
                window.__lookupDone = 0;
                window.__releaseGame = null;
                apiFetch = async (url, options = {}) => {
                    const body = options.body ? JSON.parse(options.body) : {};
                    let data = {};
                    if (/\/(studyResume|gameResume)$/.test(url)) {
                        const isGame = url.endsWith('/gameResume');
                        if (!options.body && isGame && delayGame) await new Promise(resolve => { window.__releaseGame = resolve; });
                        data = { enabled: true, version: 1, snapshot: isGame ? game : study, runId: (isGame ? game : study)?.runId, seq: body.snapshot?.seq };
                        if (!options.body) window.__lookupDone++;
                    } else if (url.endsWith('/saveAnalytics')) data = { addedEventIds: (body.events || []).map(e => e.eventId), duplicateEventIds: [], srSeq: body.srSeq };
                    return { ok: true, status: 200, json: async () => data };
                };
                setSessionToken('x.' + btoa(JSON.stringify({ sub: 'notes_resume_test' })) + '.x');
                saveUserToLocalAndStart({ id: 'notes_resume_test', role: 'student', name: 'Resume notes test', avatar: '🙂', ...placement, previewNotes: notes, sessionCount: 2, srState: { vocab: {}, sentences: {}, sentencePairs: {} }, analytics: [] });
            }, { study, game, notes, placement, delayGame });
            if (!delayGame) await page.waitForFunction(() => __lookupDone >= 2);
        }
        // Generate real resumable Study and Gomoku snapshots on an earlier page.
        await login({ placement: { book: 'PU1', unit: '1', page: '11' } });
        const study = await page.evaluate(() => {
            initStudyMode(); StudyRecovery.capture();
            const key = Object.keys(localStorage).find(key => key.startsWith('csStudyResume_v1_'));
            return JSON.parse(localStorage.getItem(key)).snapshot;
        });
        await page.evaluate(() => exitStudyMode());
        const game = await page.evaluate(() => {
            triggerGomoku('regular'); GameRecovery.capture();
            const key = Object.keys(localStorage).find(key => key.startsWith('csGameResume_v1_'));
            return JSON.parse(localStorage.getItem(key)).snapshot;
        });
        await page.evaluate(() => { exitGomokuGame(); goBackFromGameSelection(); });
        const history = { 'pu1-u7-p85': { version: 1, completedAt: '2026-11-03T01:00:00Z' } };
        async function notesOpen(label) {
            await page.locator('#preview-notes-overlay').waitFor();
            ok((await page.locator('#preview-notes-overlay iframe').getAttribute('src')).includes('pu1_u5_p59'), label);
        }
        async function ordered(label) {
            ok(await page.evaluate(() => {
                const buttons = [...document.querySelector('#preview-notes-button').parentElement.children];
                return buttons.map(b => b.id || b.getAttribute('onclick')).join('|') === 'initStudyMode()|showGameSelection()|preview-notes-button|game-resume-button|study-resume-button';
            }), label);
        }
        await login({ study, notes: history });
        await page.locator('#study-resume-dialog').waitFor();
        ok(await page.locator('#preview-notes-overlay').count() === 0 && await page.locator('#preview-notes-button').isVisible(), 'Study prompt has priority while eligible notes button is visible');
        await ordered('menu places notes directly below play, above both resume buttons');
        await page.locator('#study-resume-no').click(); await notesOpen('declining Study immediately opens assigned notes');
        await page.evaluate(() => PreviewNotes.close());
        ok(await page.locator('#study-resume-button').isVisible(), 'declining preserves Study resume button');
        await page.locator('#study-resume-button').click(); await page.waitForFunction(() => StudyRecovery.active());
        ok(await page.evaluate(() => STUDY_STATE.round === 'A' && selectedClassContent.page === '11'), 'declined Study snapshot remains resumable on its original page');
        await page.evaluate(() => exitStudyMode());
        ok(await page.locator('#preview-notes-overlay').count() === 0, 'automatic notes open only once per login');

        await login({ game, notes: history }); await page.locator('#game-resume-dialog').waitFor();
        ok(await page.locator('#preview-notes-button').isVisible() && await page.locator('#preview-notes-overlay').count() === 0, 'Game prompt also preserves eligible notes button');
        await page.locator('#game-resume-no').click(); await notesOpen('declining Game immediately opens assigned notes');
        await page.evaluate(() => PreviewNotes.close());
        ok(await page.locator('#game-resume-button').isVisible(), 'declining preserves Game resume button');

        await login({ study, game, notes: history }); await page.locator('#study-resume-dialog').waitFor();
        await page.locator('#study-resume-no').click(); await page.locator('#game-resume-dialog').waitFor();
        ok(await page.locator('#preview-notes-overlay').count() === 0, 'both saves: Game prompt follows declined Study before notes');
        await page.locator('#game-resume-no').click(); await notesOpen('both saves: notes open after both declines');
        await page.evaluate(() => PreviewNotes.close());
        ok(await page.locator('#study-resume-button').isVisible() && await page.locator('#game-resume-button').isVisible() && await page.locator('#preview-notes-button').isVisible(), 'notes and both resume buttons coexist');
        await page.screenshot({ path: path.join(qa, 'all-menu-buttons.png') });

        await login({ study, game, notes: history }); await page.locator('#study-resume-dialog').waitFor();
        await page.locator('#study-resume-yes').click(); await page.waitForFunction(() => StudyRecovery.active());
        ok(await page.locator('#preview-notes-overlay').count() === 0 && await page.locator('#game-resume-dialog').count() === 0, 'accepting Study defers notes and remaining prompt during resumed work');
        await page.evaluate(() => exitStudyMode()); await notesOpen('accepted Study opens assigned notes on main-menu return');
        ok(await page.evaluate(() => selectedClassContent.page === '59'), 'notes use assigned page after restored session placement is released');

        await login({ study, game, notes: history }); await page.locator('#study-resume-dialog').waitFor();
        await page.locator('#study-resume-no').click(); await page.locator('#game-resume-dialog').waitFor();
        await page.locator('#game-resume-yes').click(); await page.waitForFunction(() => GameRecovery.active());
        ok(await page.locator('#preview-notes-overlay').count() === 0, 'accepting Game defers notes during play');
        await page.evaluate(() => exitGomokuGame());
        ok(await page.locator('#preview-notes-overlay').count() === 0, 'Game selection screen is not the main menu');
        await page.evaluate(() => goBackFromGameSelection()); await notesOpen('accepted Game opens notes on main-menu return');

        await login({ notes: { 'pu1-u5-p59': { version: 1, completedAt: '2026-11-05T01:00:00Z' } } });
        ok(await page.locator('#preview-notes-overlay').count() === 0 && await page.locator('#preview-notes-button').isVisible(), 'completed assigned notes retain library without automatic popup');
        await login(); await notesOpen('no saved sessions retain normal automatic notes');
        await page.evaluate(() => PreviewNotes.close());
        ok(await page.locator('#preview-notes-button').isHidden(), 'existing eligibility rule still hides library until a note has been completed');

        await login({ study, game, notes: history, delayGame: true }); await page.locator('#study-resume-dialog').waitFor();
        await page.locator('#study-resume-no').click();
        ok(await page.locator('#preview-notes-overlay').count() === 0, 'declined Study waits for outstanding Game lookup');
        await page.evaluate(() => __releaseGame()); await page.locator('#game-resume-dialog').waitFor();
        await page.locator('#game-resume-no').click(); await notesOpen('delayed Game lookup retains prompt ordering');
        ok(errors.length === 0, 'no browser runtime errors: ' + errors.join(', '));
        console.log(count + ' resume/notes browser checks passed; screenshots: ' + qa);
        await context.close();
    } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); server.close(); process.exitCode = 1; });
