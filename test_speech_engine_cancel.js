// Real unchanged Whisper/WASM runtime; synthetic tone, no student recordings.
const { chromium } = require('playwright-core');
const fs = require('fs'), path = require('path'), http = require('http'), assert = require('node:assert/strict');
(async () => {
  let browser, checks = 0;
  const server = http.createServer((req, res) => {
    const route = decodeURIComponent(req.url.split('?')[0]);
    if (route === '/') { res.setHeader('Content-Type', 'text/html'); return res.end('<script src="speech_engine.js"></script>'); }
    if (!/^\/(?:speech_engine\.js|speech_target\.js|speech_target_data\.json|lib\/(?:transformers\.min\.js|wasm\/ort-wasm-simd-threaded\.jsep\.(?:wasm|mjs))|models\/whisper-tiny\.en\/(?:[a-z_]+\.json|merges\.txt|onnx\/(?:encoder_model|decoder_model_merged)_quantized\.onnx))$/.test(route)) { res.writeHead(404); return res.end(); }
    const file = path.join(__dirname, route); if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.setHeader('Content-Type', route.endsWith('.wasm') ? 'application/wasm' : /\.m?js$/.test(route) ? 'text/javascript' : 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); const origin = 'http://127.0.0.1:' + server.address().port;
    browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
    const page = await browser.newPage(); let weights = 0;
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin === origin) { if (url.pathname.endsWith('.onnx')) weights++; return route.continue(); }
      // Exercise the production fallback to its matched local runtime pair;
      // this probe is fulfilled here, never sent to a remote service.
      return route.fulfill({ status: 404, body: '' });
    });
    await page.goto(origin); await page.evaluate(() => LocalEngine.load()); assert.equal(weights, 2); checks++;
    const result = await page.evaluate(async () => {
      const tone = new Float32Array(32000); for (let i = 0; i < tone.length; i++) tone[i] = .1 * Math.sin(i * 2 * Math.PI * 440 / 16000);
      const controller = new AbortController(), start = performance.now();
      const first = LocalEngine.transcribe(tone, { signal: controller.signal }).then(() => 'unexpected result', e => e.name);
      const second = await LocalEngine.transcribe(tone).then(() => 'unexpected result', e => e.code);
      setTimeout(() => controller.abort(), 50);
      const cancelled = await first, elapsedMs = performance.now() - start;
      const readyAfterCancel = LocalEngine.isLoaded() && !LocalEngine.isBusy();
      const next = await LocalEngine.transcribe(tone);
      const target = 'This is a short pen.', firstHints = await LocalEngine.transcribe(tone, { target }), repeatedHints = await LocalEngine.transcribe(tone, { target });
      const targetAbort = new AbortController(); window.__speechLog = function (message) { if (message.startsWith('Checking audio')) setTimeout(() => targetAbort.abort(), 30); };
      const targetCancelled = await LocalEngine.transcribe(tone, { target, signal: targetAbort.signal }).then(() => 'unexpected result', e => e.name);
      window.__speechLog = null;
      const afterTargetCancel = await LocalEngine.transcribe(tone, { target });
      return { cancelled, second, elapsedMs, readyAfterCancel, nextText: typeof next.text, busyAtEnd: LocalEngine.isBusy(),
        targetStatus: firstHints.targetStatus, words: firstHints.targetWords, repeatedWords: repeatedHints.targetWords,
        targetCancelled, afterTargetCancel: afterTargetCancel.targetStatus, targetMs: [firstHints.targetCheckMs, repeatedHints.targetCheckMs] };
    });
    assert.equal(result.cancelled, 'AbortError'); checks++; assert.equal(result.second, 'SPEECH_BUSY'); checks++;
    assert(result.readyAfterCancel && result.elapsedMs < 15000); checks++;
    assert.equal(result.nextText, 'string'); assert.equal(result.busyAtEnd, false); assert.equal(weights, 2); checks++;
    assert.equal(result.targetStatus, 'checked'); assert.equal(result.words.length, 5); assert(result.words.every(w => typeof w.heardClear === 'boolean')); checks++;
    assert.deepEqual(result.words, result.repeatedWords); assert.equal(result.afterTargetCancel, 'checked'); checks++;
    assert.equal(result.targetCancelled, 'AbortError'); assert.equal(weights, 2); checks++;
    console.log(checks + ' real Whisper cancellation checks passed; cancellation ' + Math.round(result.elapsedMs) + ' ms; weights downloaded once');
    console.log('Target-aware added checking time on this desktop (cold/warm): ' + result.targetMs.join('/') + ' ms');
  } finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(e => { console.error(e); process.exitCode = 1; });
