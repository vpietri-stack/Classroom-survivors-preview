// Actual shared speech controls in Chrome; synthetic microphone/ASR only.
const { chromium } = require('playwright-core');
const path = require('path'), fs = require('fs'), assert = require('node:assert/strict');
let checks = 0;
async function main() {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.route('**/*', route => route.abort());
    await page.setContent('<!doctype html><html><head></head><body><main id="gate"></main></body></html>');
    await page.clock.install();
    await page.evaluate(() => {
      window.SPEECH_PRACTICE_ENABLED = true; window.kind = 'different'; window.events = []; window.scores = []; window.samples = []; window.finished = []; window.cancelled = 0;
      window.authActiveUser = { id: 'test-owner', name: 'Synthetic learner', book: 'PU2' };
      Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query: async () => ({ state: 'granted' }) } });
      window.queueExerciseEvent = (type, mode, details) => events.push({ type, mode, details });
      window.Scorer = { scoreForBook: (target, text, book, attempt) => { scores.push(attempt); return { pass: kind === 'match', accuracy: .42, phoneticRatio: .4 }; } };
      window.SpeechSampleCapture = { maybeCapture: sample => samples.push(sample) };
      window.Recorder = class {
        static isSupported() { return kind !== 'unsupported'; }
        start() { if (kind === 'permission') { const e = new Error('denied'); e.name = 'NotAllowedError'; return Promise.reject(e); } if (kind === 'pending') return new Promise(resolve => { window.allowMic = resolve; }); return Promise.resolve(); }
        cancel() { cancelled++; }
        stop() { const n = kind === 'short' ? 4000 : 20000, b = new ArrayBuffer(44 + n * 2), v = new DataView(b); v.setUint32(24, 16000, true); if (kind !== 'quiet') for (let i = 0; i < n; i++) v.setInt16(44 + i * 2, 10000, true); return Promise.resolve(new Blob([b], { type: 'audio/wav' })); }
      };
      window.LocalEngine = { isBusy: () => kind === 'busy', transcribe: (audio, opts) => {
        window.lastSignal = opts.signal;
        if (kind === 'deferred') return new Promise(resolve => { window.finishAsr = resolve; });
        if (kind === 'error') return Promise.reject(new Error('technical details should stay hidden'));
        return Promise.resolve({ text: kind === 'junk' ? '[Music]' : 'A real reading.', targetWords: kind === 'hints' ? [
          { text: 'This', heardClear: true }, { text: 'is', heardClear: true }, { text: 'a', heardClear: true }, { text: 'short', heardClear: false }, { text: 'pen', heardClear: false }
        ] : undefined, targetStatus: kind === 'hints' ? 'checked' : undefined });
      } };
    });
    await page.addScriptTag({ path: path.join(__dirname, 'speech_ui.js') });
    async function open(kind) { await page.evaluate(kind => { window.kind = kind; document.getElementById('gate').replaceChildren(SpeechUI.makeSentenceGate({ target: 'This is a short pen.', mode: 'study', onDone: s => finished.push(s) })); }, kind); }
    async function record(kind, fresh = true) {
      if (fresh) await open(kind); else await page.evaluate(k => { window.kind = k; }, kind);
      await page.locator('.speech-rec-btn').click();
      await page.waitForFunction(() => document.querySelector('.rec-inline.show'));
      await page.locator('#recInlineStop').click();
      if (kind !== 'deferred') await page.waitForFunction(() => !document.querySelector('.speech-rec-btn').disabled);
    }
    await open('different'); assert.equal(await page.locator('.speech-practice-continue').isVisible(), false); checks++;
    await record('different', false);
    assert.equal(await page.locator('.speech-practice-continue').isVisible(), true);
    assert(!/%|再试一次|错误:/.test(await page.locator('.heard-feedback').innerText())); checks++;
    await record('match', false); await record('different', false);
    assert.deepEqual(await page.evaluate(() => scores), [1, 1, 1]); checks++;
    await page.locator('.speech-practice-continue').click();
    await page.evaluate(() => document.querySelector('.speech-practice-continue').click());
    assert.equal(await page.evaluate(() => finished.length), 1); assert.equal(await page.evaluate(() => finished[0].completion), 'practised');
    assert.equal(await page.evaluate(() => 'pass' in finished[0] || 'score' in finished[0]), false); checks++;
    assert.equal(await page.evaluate(() => events.filter(e => e.type === 'speech_practice').length), 1); checks++;
    await record('hints'); assert.equal(await page.locator('.speech-target-word.heard').count(), 3);
    assert.equal(await page.locator('.speech-target-word:not(.heard)').count(), 2);
    assert(!/wrong|错误|%|不太一样/.test(await page.locator('.heard-feedback').innerText()));
    assert.equal(await page.locator('.speech-practice-continue').isEnabled(), true); checks++;
    for (const kind of ['quiet', 'short', 'junk', 'error']) {
      await record(kind); assert.equal(await page.locator('.speech-practice-continue').isVisible(), true);
      assert(!/technical details|%/.test(await page.locator('.heard-feedback').innerText()));
      await page.locator('.speech-practice-continue').click();
      assert.equal(await page.evaluate(() => finished.at(-1).completion), 'unassessed'); checks++;
    }
    for (const kind of ['permission', 'unsupported', 'busy']) {
      await open(kind); await page.locator('.speech-rec-btn').click();
      await page.waitForFunction(() => !document.querySelector('.speech-practice-continue').hidden);
      await page.locator('.speech-practice-continue').click(); assert.equal(await page.evaluate(() => finished.at(-1).matchedTarget), null); checks++;
    }
    await record('deferred'); const before = await page.evaluate(() => ({ events: events.length, samples: samples.length, done: finished.length }));
    await page.locator('.speech-practice-continue').click();
    assert(await page.evaluate(() => lastSignal.aborted));
    await page.evaluate(() => finishAsr({ text: 'late result' }));
    assert.equal(await page.evaluate(() => events.length), before.events + 1); assert.equal(await page.evaluate(() => samples.length), before.samples);
    assert.equal(await page.evaluate(() => finished.length), before.done + 1); checks++;
    await record('deferred'); await page.clock.runFor(30001);
    assert.equal(await page.locator('.speech-rec-btn').isDisabled(), false); assert(await page.evaluate(() => lastSignal.aborted));
    assert((await page.locator('.heard-feedback').innerText()).includes('等待')); await page.locator('.speech-practice-continue').click(); checks++;
    await open('pending'); await page.locator('.speech-rec-btn').click(); await page.clock.runFor(15001);
    assert.equal(await page.locator('.speech-rec-btn').isDisabled(), false); assert.equal(await page.locator('.speech-practice-continue').isVisible(), true);
    await page.evaluate(() => allowMic()); assert.equal(await page.locator('.rec-inline.show').count(), 0); checks++;
    await open('match'); await page.locator('.speech-rec-btn').click(); await page.waitForFunction(() => document.querySelector('.rec-inline.show'));
    const cancelled = await page.evaluate(() => cancelled); await page.evaluate(() => document.getElementById('gate').replaceChildren());
    await page.waitForFunction(n => cancelled > n, cancelled); assert.equal(await page.locator('.rec-inline.show').count(), 0); checks++;
    await record('deferred'); const n = await page.evaluate(() => events.length);
    await page.evaluate(() => { authActiveUser = { id: 'another-user' }; finishAsr({ text: 'old account result' }); });
    assert.equal(await page.evaluate(() => events.length), n); checks++;
    await page.evaluate(() => { authActiveUser = { id: 'test-owner', book: 'PU2' }; }); await record('different');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); checks++;
    // Dashboard labels must describe practice, not an invented reading grade.
    await page.addScriptTag({ path: path.join(__dirname, 'teacher_dashboard.js') });
    assert.equal(await page.evaluate(() => exerciseTypeLabel('speech_practice')), 'Speech practice (not graded)');
    assert((await page.evaluate(() => formatItemDetails(finished[0]))).includes('No pronunciation grade')); checks++;
    // Production retains its current gate while preview is under review.
    await page.evaluate(() => { SPEECH_PRACTICE_ENABLED = false; });
    await record('different'); assert.equal(await page.locator('.speech-practice').count(), 0);
    assert.equal(await page.locator('.speech-gate-btns > button').nth(1).isVisible(), false);
    await record('different', false); await record('different', false);
    assert.equal(await page.locator('.speech-gate-btns > button').nth(1).isVisible(), true); checks++;
    function caller(file, name) {
      const source = fs.readFileSync(path.join(__dirname, file), 'utf8'), start = source.indexOf('function ' + name + '('), end = source.indexOf('\nfunction ', start + 1);
      return source.slice(start, end < 0 ? undefined : end);
    }
    await page.addScriptTag({ content: caller('study_mode.js', 'checkRoundE') });
    await page.evaluate(() => {
      SPEECH_PRACTICE_ENABLED = true; window.SpeechStatus = { isReady: () => true }; window.kind = 'different';
      document.body.innerHTML = '<div><div id="sentence-drop-zone"></div><div id="sentence-word-bank"></div><div>controls</div></div>';
      for (const word of ['This', 'is', 'a', 'short', 'pen.']) { const slot = document.createElement('div'), tile = document.createElement('button'); slot.dataset.expected = tile.dataset.word = word; tile.innerText = word; slot.append(tile); document.getElementById('sentence-drop-zone').append(slot); }
      window.STUDY_STATE = { active: true, sentences: ['This is a short pen.'], currentSentenceIndex: 0, startTime: 123, isTransitioning: false };
      window.srStudyResults = []; window.exerciseAttempts = 1; window.itemKey = x => x; window.playHappySound = () => {}; window.startExerciseTracking = () => {};
      window.studyAdvances = 0; window.nextRoundESentence = () => { studyAdvances++; document.body.replaceChildren(); };
      checkRoundE();
    });
    assert.equal(await page.evaluate(() => srStudyResults.length), 1); checks++;
    await record('different', false); await page.locator('.speech-practice-continue').click();
    assert.equal(await page.evaluate(() => studyAdvances), 1); assert.equal(await page.evaluate(() => srStudyResults.length), 1); checks++;
    await page.addScriptTag({ content: caller('game.js', 'checkGrammar') });
    await page.evaluate(() => {
      document.body.innerHTML = '<div id="grammarGame"><div id="word-dock"></div><div id="grammar-actions"></div></div>';
      const game = document.getElementById('grammarGame'); game.dataset.targetSentence = 'This is a short pen.'; game.dataset.validOptions = JSON.stringify(['This is a short pen.']);
      for (const word of ['This', 'is', 'a', 'short', 'pen.']) { const slot = document.createElement('div'), tile = document.createElement('div'); slot.className = 'drop-zone'; slot.dataset.expected = word; tile.innerText = word; slot.append(tile); game.append(slot); }
      window.grammarGameEl = () => document.getElementById('grammarGame'); window.srGameResults = []; window.srInSessionFailures = new Set(); window.srInSessionSuccesses = new Set();
      window.rewards = 0; window.handleMinigameSuccess = () => rewards++; checkGrammar();
    });
    assert.equal(await page.evaluate(() => srGameResults.length), 1); checks++;
    await record('different', false); await page.locator('.speech-practice-continue').click();
    assert.equal(await page.evaluate(() => rewards), 1); assert.equal(await page.evaluate(() => srGameResults.length), 1); checks++;
    const config = fs.readFileSync(path.join(__dirname, 'config.js'), 'utf8');
    for (const [url, expected] of [['https://vpietri-stack.github.io/Classroom-survivors/', false], ['https://vpietri-stack.github.io/Classroom-survivors-preview/', true], ['http://127.0.0.1:8123/', true]]) {
      const probe = await browser.newPage(); await probe.route('**/*', r => r.fulfill({ contentType: 'text/html', body: '<html></html>' })); await probe.goto(url); await probe.addScriptTag({ content: config });
      assert.equal(await probe.evaluate(() => SPEECH_PRACTICE_ENABLED), expected); await probe.close(); checks++;
    }
    console.log(checks + ' optional speech practice browser checks passed');
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
