// Real preview entry/rounds/recovery/UI with controlled microphone and worker.
// Recognition decisions are fixtures; native inference is verified separately.
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const { chromium } = require('playwright-core');
const root = __dirname;
let checks = 0;
function ok(value, message) { assert.ok(value, message); checks++; console.log('PASS ' + message); }
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const file = path.resolve(root, '.' + decodeURIComponent(url.pathname).replace(/^\/Classroom-survivors-preview/, ''));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, bytes) => { if (err) { res.writeHead(404); return res.end(); }
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.html': 'text/html', '.json': 'application/json', '.css': 'text/css' })[path.extname(file)] || 'application/octet-stream'); res.end(bytes); });
});
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const errors = [], uploads = [];
    await context.route('**/*', route => {
      const r = route.request(), url = r.url();
      if (url.includes('/api/') && !url.includes('/api/src/')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ enabled: false, addedEventIds: [], duplicateEventIds: [] }), headers: { 'Access-Control-Allow-Origin': '*' } });
      if (r.method() !== 'GET') uploads.push(url);
      if (url.startsWith(base) && !url.includes('/models/') && !url.includes('/lib/wasm/')) return route.continue();
      return route.abort();
    });
    await context.addInitScript(() => {
      window.__workers = []; window.__hidden = false;
      Object.defineProperty(document, 'hidden', { get: () => window.__hidden });
      window.__visibility = value => { window.__hidden = value; document.dispatchEvent(new Event('visibilitychange')); };
      const Native = window.Worker;
      window.Worker = class {
        constructor(url, options) {
          if (!String(url).includes('speech_adaptive_worker')) return new Native(url, options);
          this.alive = true; this.requests = []; __workers.push(this);
        }
        postMessage(r) {
          this.requests.push(r);
          if (r.action === 'assess' && !window.__hold) queueMicrotask(() => this.emit({ transcript: 'an imperfect blind transcript', status: 'checked', totalMs: 15,
            targetWords: r.target.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu).map((text, i) => ({ text, heardClear: i === 0 })) }));
        }
        emit(data) { this.onmessage?.({ data: { id: this.requests.at(-1).id, ...data } }); }
        terminate() { this.alive = false; }
      };
    });
    const page = await context.newPage(); page.on('pageerror', e => { errors.push(e.message); console.log(e.stack); });
    await page.goto(base + '/Classroom-survivors-preview/index.html');
    await page.waitForFunction(() => window.StudyRuntime && window.AdaptiveSpeech && __workers.length === 1);
    await page.evaluate(() => {
      window.playTTS = () => {}; window.synthError = () => {}; window.playHappySound = () => {}; window.osc = () => {};
      window.__events = []; window.queueExerciseEvent = (...args) => __events.push(args);
      window.Recorder = class {
        constructor(options) { window.__recorderOptions = options; }
        static isSupported() { return true; }
        start() { return Promise.resolve(); }
        cancel() { window.__cancelled = (window.__cancelled || 0) + 1; }
        stop() {
          // 300ms at48kHz, including a quiet leading consonant. Must not hit
          // the legacy1000ms sentence gate, trim or repeat short words.
          const n = 14400, v = new DataView(new ArrayBuffer(44 + n * 2));
          v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint16(34, 16, true); v.setUint32(24, 48000, true);
          for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, i < 4800 ? 100 : 12000, true);
          return Promise.resolve(new Blob([v], { type: 'audio/wav' }));
        }
      };
      selectedClassContent = { book: 'PU1', unit: '1', page: '11' };
      document.getElementById('loginOverlay')?.classList.add('hidden');
      STUDY_STATE.active = true; STUDY_STATE.words = ['ice cream', 'ball']; STUDY_STATE.sentences = ['This is a pen.'];
      document.getElementById('studyModeOverlay').classList.remove('hidden'); startRoundC();
      roundCSlots().forEach((tile, i) => { tile.innerText = currentTTSWord[i]; }); checkRoundC();
    });
    ok(await page.locator('#scramble-slots .study-word-tile').count() === 2, 'Study completes spelling into whole-word tiles, with no duplicate sentence');
    ok(await page.locator('#scramble-bank .speech-practice-continue').isVisible(), 'slow first preparation offers Continue instead of blocking the child');
    ok(await page.evaluate(() => srStudyResults.length === 1 && __events.filter(e => e[0] === 'wordScramble').length === 1), 'spelling credit is recorded before speech');
    ok(await page.evaluate(() => __workers.length === 1 && AdaptiveSpeech.isBusy() === false), 'preload and word practice share one worker');
    await page.evaluate(() => __workers[0].emit({ ready: true }));
    await page.waitForFunction(() => AdaptiveSpeech.isReady());
    async function record(selector) {
      await page.locator(selector + ' .speech-rec-btn').click();
      await page.waitForFunction(s => document.querySelector(s + ' .speech-rec-btn').dataset.speechState === 'recording', selector);
      ok(await page.locator('.speech-reading-neutral').count() > 0, 'microphone start resets previous success to purple');
      await page.locator(selector + ' .speech-rec-btn').click();
      await page.waitForFunction(s => document.querySelector(s + ' .speech-rec-btn').dataset.speechState === 'idle', selector);
    }
    await record('#scramble-bank');
    ok(await page.evaluate(() => __recorderOptions.preserveOnset && __workers[0].requests.at(-1).audio.length === 4800 && __workers[0].requests.at(-1).audio[0] > 0), '300ms word reaches the adaptive checker at16kHz, with onset intact and no repetition');
    ok(await page.locator('#scramble-slots .correct').count() === 1 && await page.locator('#scramble-slots .speech-reading-neutral').count() === 1, 'multiword vocabulary receives separate green/purple word decisions');
    if (process.env.SPEECH_QA_DIR) { fs.mkdirSync(process.env.SPEECH_QA_DIR, { recursive: true }); await page.screenshot({ path: path.join(process.env.SPEECH_QA_DIR, 'study-word.png'), fullPage: true }); }
    const study = await page.evaluate(() => ({ ...StudyRuntime.capture(), createdAt: new Date().toISOString(), runId: 'fixture-study' }));
    await page.evaluate(saved => StudyRuntime.restore(saved), study);
    ok(await page.locator('#scramble-bank .speech-sentence-gate').count() === 1 && await page.locator('#scramble-slots .correct').count() === 1, 'Study word speech and feedback restore without re-awarding spelling');
    await page.locator('#scramble-bank .speech-practice-continue').click();
    ok(await page.evaluate(() => STUDY_STATE.currentWordIndex === 1 && srStudyResults.length === 1), 'Continue advances exactly one word, keeping original credit');
    // Sentence gate uses exactly the same worker, even when the blind transcript differs.
    await page.evaluate(() => {
      STUDY_STATE.isTransitioning = false; startRoundE();
      Array.from(document.querySelectorAll('#sentence-drop-zone .sentence-slot')).forEach(zone => { zone.appendChild(createWordTile(zone.dataset.expected, 0)); });
      checkRoundE();
    });
    await record('#sentence-word-bank');
    ok(await page.evaluate(() => __workers.length === 1 && __workers[0].requests.at(-1).target === 'This is a pen.'), 'Study sentences use the improved adaptive worker too');
    // Start an actual game exercise, then preserve the earned reward through speech.
    await page.evaluate(() => {
      StudyRuntime.suspend(); activeGameMode = 'Gomoku'; triggerGomoku('regular'); SPELLING_WORDS = ['ice cream', 'ball']; startSpellingGame('ice cream');
      const e = document.getElementById('spellingGame'), letters = JSON.parse(e.dataset.letters), used = new Set();
      e.dataset.placement = JSON.stringify([...e.dataset.targetWord.replace(/[ .?!-]/g, '')].map(c => { const i = letters.findIndex((v, i) => v === c && !used.has(i)); used.add(i); return i; }));
      e.dataset.usedKeys = JSON.stringify(letters.map((_, i) => used.has(i))); buildSpellingSlots(); checkSpelling();
    });
    ok(await page.locator('#spelling-speech-gate').count() === 1 && !await page.locator('#spelling-result-action').isVisible(), 'game word speech appears between correct spelling and claiming its reward');
    await record('#spelling-speech-gate');
    if (process.env.SPEECH_QA_DIR) await page.screenshot({ path: path.join(process.env.SPEECH_QA_DIR, 'game-word.png'), fullPage: true });
    const before = await page.evaluate(() => ({ sr: srGameResults.length, events: __events.filter(e => e[0] === 'spelling').length, saved: GameRuntime.capture() }));
    await page.evaluate(saved => GameRuntime.restore(saved), before.saved);
    ok(await page.locator('#spelling-speech-gate').count() === 1 && await page.locator('#spelling-input-display .correct').count() === 1, 'game word speaking restores with whole-word feedback');
    await page.locator('#spelling-speech-gate .speech-practice-continue').click();
    ok(await page.locator('#spelling-result-action').isVisible() && await page.evaluate(n => srGameResults.length === n, before.sr), 'speech Continue reveals the already earned reward without duplicate SR');
    ok(await page.evaluate(n => __events.filter(e => e[0] === 'spelling').length === n, before.events), 'restoring and continuing do not duplicate the spelling event');
    await page.evaluate(() => {
      document.getElementById('spellingGame').classList.add('hidden'); startGrammarGame('This is a pen.');
      for (const tile of Array.from(document.querySelectorAll('#word-dock > .draggable'))) tile.remove();
      for (const [i, word] of 'This is a pen.'.split(' ').entries()) {
        const tile = document.createElement('div'); tile.className = 'draggable placed'; tile.dataset.word = word; tile.textContent = word;
        document.querySelectorAll('#sentence-container .drop-zone')[i].appendChild(tile);
      }
      checkGrammar();
    });
    await record('#grammar-speech-gate');
    ok(await page.evaluate(() => __workers.length === 1 && __workers[0].requests.at(-1).target === 'This is a pen.'), 'game sentences use the same improved worker and accepted sentence');
    await page.locator('#grammar-speech-gate .speech-practice-continue').click();
    await page.evaluate(() => document.getElementById('grammarGame').classList.add('hidden'));
    // Exercise cancellation and visible-time assessment budgets.
    await page.evaluate(() => { window.__hold = true; startSpellingGame('ball'); const e = document.getElementById('spellingGame'); const letters = JSON.parse(e.dataset.letters), used = new Set(); e.dataset.placement = JSON.stringify([...'ball'].map(c => { const i = letters.findIndex((v,i) => v===c&&!used.has(i)); used.add(i); return i; })); buildSpellingSlots(); checkSpelling(); });
    await page.locator('#spelling-speech-gate .speech-rec-btn').click(); await page.waitForFunction(() => document.querySelector('#spelling-speech-gate .speech-rec-btn').dataset.speechState === 'recording');
    await page.evaluate(() => __visibility(true));
    ok(await page.evaluate(() => __cancelled > 0 && __workers[0].alive), 'hiding a live microphone stops capture and retains the prepared model');
    await page.evaluate(() => __visibility(false));
    await page.clock.install();
    await page.locator('#spelling-speech-gate .speech-rec-btn').click(); await page.waitForFunction(() => document.querySelector('#spelling-speech-gate .speech-rec-btn').dataset.speechState === 'recording');
    await page.locator('#spelling-speech-gate .speech-rec-btn').click(); await page.waitForFunction(() => AdaptiveSpeech.isBusy());
    await page.evaluate(() => __visibility(true)); await page.clock.runFor(600000);
    ok(await page.evaluate(() => __workers[0].alive), 'ten hidden minutes do not consume the warm assessment deadline');
    await page.evaluate(() => __visibility(false)); await page.clock.runFor(5100);
    ok(await page.locator('#spelling-speech-gate .speech-practice-continue').isVisible() && await page.locator('#spelling-input-display .correct').count() === 0, 'assessment timeout leaves neutral feedback and optional Continue');
    await page.locator('#spelling-speech-gate .speech-practice-continue').click();
    ok(await page.locator('#spelling-result-action').isVisible(), 'recognition timeout cannot lose the spelling reward');
    await page.goto(base + '/Classroom-survivors-preview/index.html');
    await page.waitForFunction(() => window.AdaptiveSpeech && __workers.length === 1);
    await page.clock.install();
    await page.evaluate(() => { __visibility(true); __workers[0].emit({ error: 'background interruption' }); });
    await page.clock.runFor(600000);
    await page.evaluate(() => __visibility(false));
    ok(await page.evaluate(() => __workers.length === 2 && __workers[1].alive && __workers[1].requests[0].action === 'load'), 'background preparation recovers automatically from saved files');
    await page.evaluate(() => { __workers[0].onerror(); __workers[1].emit({ ready: true }); });
    await page.waitForFunction(() => AdaptiveSpeech.isReady());
    ok(await page.evaluate(() => __workers[1].alive), 'late errors from an old worker cannot stop recovered preparation');
    assert.deepEqual(errors, []); assert.deepEqual(uploads, []);
    console.log(checks + ' adaptive app integration checks passed');
  } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); server.close(); process.exitCode = 1; });
