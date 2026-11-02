// ============================================================
// HANDWRITING ROUND — browser verification.
//
// test_handwriting.js covers the pure mask maths with synthetic rings. This
// covers the half that only a real browser can: glyph masks read from actual
// Fredoka pixels, the pointer plumbing, and the round flow.
//
// Pen paths are derived FROM the glyph masks (row-centreline dots), so a
// "complete" trace really is the letter. Hand-guessed pen paths proved unable
// to represent letters faithfully.
//
// Pinned here:
//   - a complete letter is accepted, including multi-stroke letters written
//     with a real pause between strokes (t, i, x);
//   - a lift that does not complete the letter is not judged until the grace
//     window (HW_STROKE_GAP_MS) passes;
//   - letters made of separate pieces (i, j) cannot be written in one stroke;
//   - blank box first, outline after two refusals, reveal after five;
//   - a completed word queues one "handwriting" exercise event;
//   - the tuning readout (__hwLast) ships with every field the field-tuning
//     workflow needs.
//
// NOT pinned here, on purpose: refusing confusable pairs such as "l for t" or
// "c for a". In Fredoka the t crossbar is ~2% of the glyph's ink and a
// single-story a's stem sits where a c's tips flare, so no geometric bar
// refuses those without also refusing good letters. They are tunable in the
// field via ?miss= / ?recall= / ?prec= on the test site, and the readout line
// reports the numbers needed to choose the bars from real handwriting.
//
// Run:  node test_handwriting_browser.js   (part of npm test)
// ============================================================
const { launchBrowser, fileUrl: testFileUrl } = require('./scripts/test-browser.cjs');
const path = require('path');
const fileUrl = testFileUrl(path.join(__dirname, 'index.html'));

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('PASS: ' + m); } else { fail++; console.error('FAIL: ' + m); } }

const SETTLE = 1900;   // > HW_STROKE_GAP_MS: long enough for a lift to be judged
const ADVANCE = 600;   // > the round's 420ms wait before showing the next gap

(async () => {
  const browser = await launchBrowser({
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--allow-file-access-from-files', '--font-render-hinting=none']
  });
  try {
  const page = await browser.newPage({ viewport: { width: 480, height: 900 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  await page.goto(fileUrl, { waitUntil: 'load' });
  await page.waitForTimeout(600);

  // --- glyph masks come from real Fredoka pixels -----------------------------
  const glyph = await page.evaluate(async () => {
    await hwEnsureFont();
    const out = {};
    for (const ch of ['a', 'o', 'l', 'i', 't', 'x', 'z', 'A', 'Q']) {
      const b = hwBbox(hwGlyphMask(ch), HW_SIZE);
      out[ch] = b ? b.count : 0;
    }
    out._fontLoaded = !!(document.fonts && document.fonts.check('10px Fredoka'));
    out._iPieces = hwGuideComponents('i');
    out._tPieces = hwGuideComponents('t');
    return out;
  });
  ok(glyph._fontLoaded, 'font: Fredoka is actually loaded before the masks are built');
  for (const ch of ['a', 'o', 'l', 'i', 't', 'x', 'z', 'A', 'Q']) {
    ok(glyph[ch] > 100, 'glyph: ' + ch + ' renders ink (' + glyph[ch] + ' px)');
  }
  ok(glyph._iPieces === 2, 'glyph: "i" is two separate pieces (dot + stem), so it needs two strokes');
  ok(glyph._tPieces === 1, 'glyph: "t" is one piece, so stroke count does not gate it');

  // --- harness ----------------------------------------------------------------
  await page.evaluate(() => {
    // The round asks the server whether it may keep traces (see
    // handwriting_sample_capture.js). Stub the API layer: from file:// a real
    // call goes to the production backend and dies on CORS, and a test must
    // never touch live infrastructure. Disabled by default — the capture
    // scenarios live in test_handwriting_capture_browser.js.
    window.__hwConfig = { enabled: false, open: false, endsAt: 0, maxPerDay: 0 };
    window.__hwUploads = [];
    window.apiFetch = function (url, opts) {
      const u = String(url);
      if (u.indexOf('handwritingCaptureConfig') >= 0) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(window.__hwConfig) });
      }
      if (u.indexOf('saveHandwritingSample') >= 0) {
        window.__hwUploads.push(JSON.parse(opts.body));
        return Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve({ success: true }) });
      }
      return Promise.resolve({ ok: false, status: 0, json: () => Promise.resolve(null) });
    };
    window.playTTS = function () { };
    window.synthGem = function () { };
    window.synthError = function () { };
    window.queueExerciseEvent = function () { (window.__events = window.__events || []).push([].slice.call(arguments)); };
    window.showTranslation = function () { };
    window.showVocabImage = function () { };
    // The harness never selects content, and a completed word would otherwise
    // fall through into Round E and throw, leaving isTransitioning stuck true.
    window.selectedClassContent = { book: 1, unit: 1, page: 1 };
    window.startRoundE = function () { };
    STUDY_STATE.active = true;
    document.getElementById('studyModeOverlay').classList.remove('hidden');

    // A "pen path" for a letter: one dot per ink run per row, i.e. the letter's
    // own centreline. `skip` is DATA (functions cannot cross into the page):
    //   { xGt } / { xLt } / { yLt }   omit one side of a cut line
    window.__hwPath = function (letter, skip, tf) {
      const omit = (p) => {
        if (!skip) return false;
        if (skip.xGt !== undefined) return p.x > skip.xGt;
        if (skip.xLt !== undefined) return p.x < skip.xLt;
        if (skip.yLt !== undefined) return p.y < skip.yLt;
        if (skip.yGt !== undefined) return p.y > skip.yGt;
        return false;
      };
      const mask = hwGlyphMask(letter);
      const strokes = [];
      for (let y = 0; y < HW_SIZE; y += 3) {
        let x = 0;
        while (x < HW_SIZE) {
          if (!mask[y * HW_SIZE + x] || omit({ x, y })) { x++; continue; }
          let x2 = x;
          while (x2 + 1 < HW_SIZE && mask[y * HW_SIZE + x2 + 1] && !omit({ x: x2 + 1, y })) x2++;
          strokes.push([{ x: (x + x2) / 2, y: y }]);
          x = x2 + 1;
        }
      }
      if (skip && skip.mirrorX) {
        for (const st of strokes) for (const p of st) p.x = HW_SIZE - 1 - p.x;
      }
      // tf = { sc, dx, dy }: scale about the box centre, then shift, in box units.
      if (tf) {
        for (const st of strokes) for (const p of st) {
          p.x = 64 + (p.x - 64) * tf.sc + tf.dx * HW_SIZE;
          p.y = 81 + (p.y - 81) * tf.sc + tf.dy * HW_SIZE;
        }
      }
      return strokes;
    };
    // One unbroken vertical stroke, for the stroke-count rule.
    window.__hwLine = function (x, y0, y1) {
      const pts = [];
      for (let y = y0; y <= y1; y += 3) pts.push({ x: x, y: y });
      return [pts];
    };
    // Dispatch strokes as real pointer events, each stroke a down/move.../up.
    window.__hwDraw = function (strokes) {
      const r = document.querySelector('.hw-trace-canvas').getBoundingClientRect();
      const at = (p) => [r.x + p.x / HW_SIZE * r.width, r.y + p.y / HW_SIZE * r.height];
      const fire = (type, p, buttons) => {
        const c = at(p);
        document.querySelector('.hw-trace-canvas').dispatchEvent(new PointerEvent(type, {
          clientX: c[0], clientY: c[1], pointerId: 7, bubbles: true, cancelable: true,
          isPrimary: true, button: 0, buttons: buttons, pointerType: 'touch'
        }));
      };
      for (const st of strokes) {
        for (let i = 0; i < st.length; i++) fire(i === 0 ? 'pointerdown' : 'pointermove', st[i], 1);
        fire('pointerup', st[st.length - 1], 0);
      }
    };
  });

  async function loadWord(word, gaps) {
    await page.evaluate(([w, g]) => {
      STUDY_STATE.round = 'D';   // the harness skips startRoundD, which sets this
      STUDY_STATE.words = [w];
      STUDY_STATE.currentWordIndex = 0;
      STUDY_STATE.isTransitioning = false;
      nextRoundDWord();
      roundDGapOrder.forEach(i => { roundDSlots[i].gap = false; });
      roundDGapOrder = g.slice();
      roundDGapOrder.forEach(i => { roundDSlots[i].gap = true; });
      roundDCursor = 0;
      renderRoundDSlots();
      roundDShowTarget();
    }, [word, gaps]);
    await page.waitForTimeout(250);
  }

  // Draw a whole letter in one synchronous burst; judgement lands ~1.5s later.
  async function drawLetter(letter, skip) {
    await page.evaluate(([l, k]) => window.__hwDraw(window.__hwPath(l, k)), [letter, skip || null]);
    await page.waitForTimeout(SETTLE);
  }

  const state = () => page.evaluate(() => ({
    slots: roundDSlots.map(s => s.type === 'fixed' ? '#' : (s.filled ? (s.given ? '?' : s.char.toUpperCase()) : '_')).join(''),
    cursor: roundDCursor,
    attempts: roundDAttempts,
    guided: roundDGuided,
    target: roundDCursor < roundDGapOrder.length ? roundDSlots[roundDGapOrder[roundDCursor]].char : null,
    last: window.__hwLast || null,
    events: window.__events || []
  }));

  // --- the entry point production actually calls ------------------------------
  // Everything below drives nextRoundDWord() directly. This is the real door:
  // the previous round's completion calls startRoundD(), which waits for Fredoka
  // before the first glyph mask is built.
  await page.evaluate(() => {
    STUDY_STATE.words = ['cat'];
    STUDY_STATE.currentWordIndex = 0;
    STUDY_STATE.isTransitioning = false;
    startRoundD();
  });
  await page.waitForTimeout(600);
  const entry = await page.evaluate(() => {
    const cv = document.querySelector('.hw-trace-canvas');
    return {
      round: STUDY_STATE.round,
      title: document.getElementById('study-title').innerText,
      subtitle: document.getElementById('study-instruction').innerText,
      gaps: roundDGapOrder.length,
      target: roundDCursor < roundDGapOrder.length ? roundDSlots[roundDGapOrder[roundDCursor]].char : null,
      canvas: !!cv,
      boxPx: cv ? Math.round(cv.getBoundingClientRect().width) : 0,
      backingStore: cv ? cv.width : 0
    };
  });
  ok(entry.round === 'D', 'entry: startRoundD() leaves the round in the handwriting state');
  ok(/Round C/.test(entry.title) && /Handwriting/i.test(entry.title),
    'entry: the child is told "Round C: Handwriting" (got "' + entry.title + '")');
  ok(/missing letters/i.test(entry.subtitle), 'entry: the instruction explains the task ("' + entry.subtitle + '")');
  ok(entry.canvas && entry.boxPx >= 64, 'entry: the writing box is on screen and sized (' + entry.boxPx + 'px)');
  ok(entry.backingStore >= entry.boxPx, 'entry: the canvas backing store is scaled for the device');
  ok(entry.gaps >= 1 && typeof entry.target === 'string',
    'entry: a gap is offered straight away (target "' + entry.target + '")');
  ok(await page.locator('#handwriting-skip').isHidden(), 'entry: skip is hidden before any guided failure');

  // --- skip applies to this word only, including while a letter is pending ---
  await page.evaluate(() => {
    STUDY_STATE.words = ['cat', 'dog', 'bird'];
    STUDY_STATE.currentWordIndex = 0;
    window.__events = [];
    window.__skipSRBefore = JSON.stringify(srStudyResults);
    window.__roundEStarts = 0;
    window.startRoundE = function () { window.__roundEStarts++; STUDY_STATE.round = 'E'; };
    // The neural browser suite drives real pen events to unlock this flag.
    // These fixtures cover the subsequent skip lifecycle and timer races.
    roundDSkipUnlocked = true;
    nextRoundDWord();
  });
  const skipButton = page.locator('#handwriting-skip');
  ok(await skipButton.isVisible() && await skipButton.innerText() === '跳过这个词的书写' &&
    await skipButton.getAttribute('aria-label') === '跳过这个词的书写',
    'skip: each word offers the simplified-Chinese skip-writing button and accessible label');
  await page.evaluate(() => {
    const b = document.getElementById('handwriting-skip');
    b.click();
    b.click();
    skipRoundDWord();
  });
  const locked = await page.evaluate(() => ({
    disabled: document.getElementById('handwriting-skip').disabled,
    index: STUDY_STATE.currentWordIndex,
    canvas: !!document.querySelector('.hw-trace-canvas')
  }));
  ok(locked.disabled && locked.index === 0 && !locked.canvas,
    'skip: repeated taps are locked and the abandoned canvas is destroyed');
  await page.waitForTimeout(350);
  ok(await page.evaluate(() => STUDY_STATE.currentWordIndex === 1 && roundDWord === 'dog' &&
    !STUDY_STATE.isTransitioning && !document.getElementById('handwriting-skip').disabled),
    'skip: advances exactly one word and gives the next word its own skip');

  // Accept a letter, then skip during its 420ms advance. That old callback must
  // not reset the next word's target/attempt counter after it appears.
  await page.evaluate(() => {
    roundDAcceptLetter(roundDSlots[roundDGapOrder[roundDCursor]].char);
    document.getElementById('handwriting-skip').click();
  });
  await page.waitForTimeout(350);
  await page.evaluate(() => { roundDAttempts = 1; });
  await page.waitForTimeout(150);
  ok(await page.evaluate(() => STUDY_STATE.currentWordIndex === 2 && roundDWord === 'bird' &&
    roundDCursor === 0 && roundDAttempts === 1 && !roundDSlots.some(s => s.filled)),
    'skip: works after partial handwriting and cancels the old letter advance');

  // Leave incomplete ink in the pen-lift grace window, then skip the final word.
  await page.evaluate(() => {
    window.__hwDraw(window.__hwLine(15, 15, 25));
    document.getElementById('handwriting-skip').click();
  });
  await page.waitForTimeout(SETTLE);
  ok(await page.evaluate(() => STUDY_STATE.currentWordIndex === 3 && STUDY_STATE.round === 'E' &&
    window.__roundEStarts === 1 && roundDTrace === null),
    'skip: the last word continues to the next round once, with no late ink callback');
  ok(await page.evaluate(() => window.__events.length === 0 && JSON.stringify(srStudyResults) === window.__skipSRBefore),
    'skip: skipped words earn no completed handwriting events or SR results');

  // The reveal delay is longer than the skip delay, so exercise that path too.
  await loadWord('cat', [0, 1, 2]);
  await page.evaluate(() => {
    roundDAttempts = ROUND_D_GIVE_UP_AFTER - 1;
    roundDEffortAttempts = ROUND_D_GIVE_UP_AFTER;
    roundDRejectLetter();
    document.getElementById('handwriting-skip').click();
  });
  await page.waitForTimeout(1100);
  ok(await page.evaluate(() => window.__roundEStarts === 2 && window.__events.length === 0),
    'skip: cancels the reveal delay without reporting a completed word');

  // Leaving during the skip delay must cancel the pending word advance.
  await loadWord('cat', [0, 1, 2]);
  await page.evaluate(() => {
    window.__savedBack = window.goBackFromGameSelection;
    window.goBackFromGameSelection = function () {};
    document.getElementById('handwriting-skip').click();
    exitStudyMode();
  });
  await page.waitForTimeout(400);
  ok(await page.evaluate(() => !STUDY_STATE.active && STUDY_STATE.currentWordIndex === 0 && window.__roundEStarts === 2),
    'skip: exiting during the advance cannot start another word or round');
  await page.evaluate(() => {
    window.goBackFromGameSelection = window.__savedBack;
    window.startRoundE = function () {};
    STUDY_STATE.active = true;
    document.getElementById('studyModeOverlay').classList.remove('hidden');
  });

  // --- a complete letter is accepted -----------------------------------------
  await loadWord('cat', [0, 1, 2]);
  let s = await state();
  ok(s.target === 'c' && s.slots === '___', 'round: three gaps, first target "c"');
  await drawLetter('c');
  s = await state();
  ok(s.cursor === 1 && s.slots === 'C__', 'accept: a complete "c" is accepted (slots="' + s.slots + '")');
  ok(s.last && s.last.strokes !== undefined && s.last.width !== undefined && s.last.minStrokes !== undefined,
    'readout: the tuning readout reports strokes, minStrokes and extent ratios');

  await loadWord('log', [0]);
  await drawLetter('l');
  s = await state();
  ok(s.cursor === 1 && s.slots === 'L__', 'accept: a drawn "l" fills an "l" gap');

  // Good letters across shapes still accept with the narrow pen.
  for (const [word, gap, letter, shown] of [
    ['dig', 0, 'd', 'D'], ['pig', 2, 'g', 'G'], ['box', 0, 'b', 'B'], ['tap', 0, 't', 'T']
  ]) {
    await loadWord(word, [gap]);
    await drawLetter(letter);
    s = await state();
    ok(s.cursor === 1 && s.slots.indexOf(shown) !== -1,
      'accept: a drawn "' + letter + '" fills its gap in "' + word + '"');
  }

  // --- the slips the classroom reported, now refused ---------------------------
  for (const [draw, mirror, word, gap, target] of [
    ['l', false, 'tap', 0, 't'],        // bare stem offered for t
    ['c', false, 'cat', 1, 'a'],        // open c offered for a
    ['c', false, 'dig', 0, 'd'],        // open c offered for d
    ['a', false, 'pig', 2, 'g'],        // a offered for g (no descender)
    ['c', true, 'box', 0, 'b']          // backwards c offered for b
  ]) {
    await loadWord(word, [gap]);
    await drawLetter(draw, mirror ? { mirrorX: true } : null);
    s = await state();
    ok(s.cursor === 0,
      'refuse: a drawn "' + (mirror ? 'backwards ' : '') + draw + '" is refused for "' + target +
      '" (missing=' + (s.last ? s.last.missing : '?') + ')');
  }

  // --- shape, not place: shifted and resized letters still pass ---------------
  // The classroom rule: an "a" written like an "a" passes wherever it lands on
  // the paper and at whatever size, as long as the shape is right.
  for (const tf of [
    { sc: 1, dx: 0, dy: 0 },
    { sc: 1, dx: 0.15, dy: -0.10 },
    { sc: 1, dx: -0.12, dy: 0.10 },
    { sc: 1, dx: 0.18, dy: 0.14 },
    { sc: 0.85, dx: -0.10, dy: 0.12 },
    { sc: 1.15, dx: 0.05, dy: 0.05 }
  ]) {
    await loadWord('cot', [1]);
    await page.evaluate(([l, t]) => window.__hwDraw(window.__hwPath(l, null, t)), ['o', tf]);
    await page.waitForTimeout(SETTLE);
    s = await state();
    ok(s.cursor === 1,
      'shape: an "o" at scale ' + tf.sc + ' shifted (' + tf.dx + ', ' + tf.dy + ') is still accepted');
  }

  // --- letters in separate pieces need separate strokes -----------------------
  const iDotCut = await page.evaluate(() => hwBbox(hwGlyphMask('i'), HW_SIZE).y0 + 16);
  await loadWord('tip', [1]);
  await page.evaluate((d) => window.__hwDraw(window.__hwLine(64, d.from, d.to)), { from: iDotCut + 4, to: 102 });
  await page.waitForTimeout(SETTLE);
  s = await state();
  ok(s.cursor === 0,
    'refuse: one unbroken stroke is refused for "i" (strokes=' + (s.last ? s.last.strokes : '?') +
    ', needed=' + (s.last ? s.last.minStrokes : '?') + ')');

  // --- the pen may leave the paper between strokes ----------------------------
  await loadWord('tip', [1]);
  await page.evaluate((d) => window.__hwDraw(window.__hwLine(64, d.from, d.to)), { from: iDotCut + 4, to: 102 });
  await page.waitForTimeout(400);
  s = await state();
  ok(s.attempts === 0 && s.cursor === 0,
    'strokes: lifting the pen after the stem is NOT judged as a failed attempt');
  await page.evaluate((d) => window.__hwDraw(window.__hwPath('i', { yGt: d.cut })), { cut: iDotCut });  // the actual dot, after a real pause
  await page.waitForTimeout(SETTLE);
  s = await state();
  ok(s.cursor === 1,
    'strokes: the dot after a pause completes the "i" and is accepted (slots="' + s.slots + '")');

  // --- scaffold: blank, then the outline, then the reveal ---------------------
  await loadWord('in', [0, 1]);
  s = await state();
  ok(s.target === 'i' && s.slots === '__', 'round: both letters of "in" are gaps');

  await page.evaluate((d) => window.__hwDraw(window.__hwLine(64, d.from, d.to)), { from: iDotCut + 4, to: 102 });
  await page.waitForTimeout(SETTLE);
  s = await state();
  ok(s.attempts === 1 && !s.guided, 'scaffold: still no outline after one refusal');

  await page.evaluate((d) => window.__hwDraw(window.__hwLine(64, d.from, d.to)), { from: iDotCut + 4, to: 102 });
  await page.waitForTimeout(SETTLE);
  s = await state();
  ok(s.guided === true && s.attempts === 2 && await page.locator('#handwriting-hint').count() === 0, 'scaffold: guides appear automatically after two writing failures with no guide button');

  const painted = await page.evaluate(() => {
    const cv = document.querySelector('.hw-trace-canvas');
    const marked = () => {
      const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      let n = 0;
      for (let p = 0; p < d.length; p += 4) {
        if (d[p + 3] > 10 && (Math.abs(d[p] - 255) > 20 || Math.abs(d[p + 1] - 253) > 20 || Math.abs(d[p + 2] - 247) > 20)) n++;
      }
      return n;
    };
    const withGuide = marked();
    roundDTrace.setGuided(false);
    const without = marked();
    roundDTrace.setGuided(true);
    return { withGuide, without };
  });
  ok(painted.withGuide - painted.without > 500,
    'scaffold: the outline is actually painted, and visible against the paper (+' +
    (painted.withGuide - painted.without) + ' px)');

  await page.evaluate(() => clearRoundD());
  await drawLetter('i');
  s = await state();
  ok(s.cursor === 1 && s.slots === 'I_', 'scaffold: tracing the outline completes the letter (slots="' + s.slots + '")');
  await page.waitForTimeout(ADVANCE);
  s = await state();
  ok(s.target === 'n' && s.attempts === 0 && !s.guided,
    'accept: the round advances to "n" with the attempts and the outline reset');

  const giveUp = await page.evaluate(async () => {
    roundDAttempts = ROUND_D_GIVE_UP_AFTER - 1;   // one more refusal triggers the reveal
    roundDEffortAttempts = ROUND_D_GIVE_UP_AFTER;
    roundDRejectLetter();
    return new Promise(res => setTimeout(() => res({
      slots: roundDSlots.map(x => x.type === 'fixed' ? '#' : (x.filled ? (x.given ? '?' : x.char.toUpperCase()) : '_')).join(''),
      given: roundDSlots[roundDGapOrder[1]].given === true,
      events: window.__events || []
    }), 1400));
  });
  ok(giveUp.given && giveUp.slots === 'I?', 'dead end: the last letter is revealed rather than blocking the child');
  ok(giveUp.events.length >= 1 && giveUp.events[giveUp.events.length - 1][0] === 'handwritingAssisted',
    'telemetry: a reveal is counted as assisted handwriting instead of independent completion (' +
    JSON.stringify(giveUp.events.map(e => e[2])) + ')');

  // --- a long word is capped, and ERASE is free ------------------------------
  const cap = await page.evaluate(() => new Promise(res => {
    STUDY_STATE.words = ['angry - angrier than'];
    STUDY_STATE.currentWordIndex = 0;
    STUDY_STATE.isTransitioning = false;
    nextRoundDWord();
    setTimeout(() => {
      const before = roundDAttempts;
      clearRoundD();
      res({
        letters: roundDSlots.filter(x => x.type === 'letter').length,
        gaps: roundDGapOrder.length,
        given: roundDSlots.filter(x => x.type === 'letter' && !x.gap).length,
        fixed: roundDSlots.filter(x => x.type === 'fixed').length,
        eraseCostAnAttempt: roundDAttempts !== before
      });
    }, 250);
  }));
  ok(cap.letters === 16 && cap.fixed === 4, 'layout: "angry - angrier than" keeps its 3 spaces + dash visible');
  ok(cap.gaps === 6, 'pacing: a 16-letter item is capped at 6 handwritten letters (got ' + cap.gaps + ')');
  ok(cap.given === 10, 'pacing: the other 10 letters are given as context');
  ok(!cap.eraseCostAnAttempt, 'erase: wiping a slip does not count as a failed attempt');

  // --- nothing leaves the device unless the server enabled capture ------------
  // The whole round above ran with the stubbed config saying "disabled", so this
  // is the privacy property proven against the real flow, not a unit test.
  const uploadsWhileOff = await page.evaluate(() => (window.__hwUploads || []).length);
  ok(uploadsWhileOff === 0,
    'privacy: with capture disabled, a full round of accepted and rejected letters uploaded nothing (' +
    uploadsWhileOff + ' payloads)');


  const realErrors = errors.filter(t => !/net::ERR_|Failed to load resource|ERR_FILE_NOT_FOUND|favicon/i.test(t));
  ok(realErrors.length === 0, 'runtime: no JS errors (' + (realErrors.length ? realErrors.join(' | ') : 'clean') + ')');

  console.log('\n--- HANDWRITING (browser) ---');
  console.log(pass + ' passed, ' + fail + ' failed');
  console.log('RESULT: ' + (fail === 0 ? 'PASS' : 'FAIL'));
  process.exitCode = fail === 0 ? 0 : 1;
  } finally { await browser.close(); }
})().catch(e => { console.error('CRASH:', e); process.exit(2); });
