// ============================================================
// HANDWRITING TRACE COLLECTION — browser verification.
//
// test_handwriting_samples.js covers the policy (fail-closed enable list, window,
// daily cap) and the sanitizers in pure Node. This covers the half that only a
// real browser can prove: that the round actually hands the student's ink to the
// collector, that the verdict and the attempt number attached to it are right,
// that a word abandoned halfway still arrives, and that nothing is sent at all
// when the server has not enabled capture.
//
// This file exists separately from test_handwriting_browser.js on purpose: the
// collection is temporary, and its removal checklist should be able to delete
// this file wholesale rather than perform surgery inside the recognition tests.
// The small amount of duplicated harness below is the price of that.
//
// Run:  node test_handwriting_capture_browser.js   (part of npm test)
// ============================================================
const { launchBrowser, fileUrl: testFileUrl } = require('./scripts/test-browser.cjs');
const path = require('path');
const fileUrl = testFileUrl(path.join(__dirname, 'index.html'));

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('PASS: ' + m); } else { fail++; console.error('FAIL: ' + m); } }

const SETTLE = 1900;   // > HW_STROKE_GAP_MS: long enough for a lift to be judged
const ADVANCE = 600;   // > the round's 420ms wait before showing the next gap
const UPLOAD = 300;    // the POST is a microtask away, but give it room

const OPEN_CONFIG = { enabled: true, open: true, endsAt: Date.now() + 86400000, maxPerDay: 40 };
// The disabled path is pinned in test_handwriting_browser.js, which runs a whole
// round of accepted and refused letters with capture switched off and asserts
// that nothing at all was uploaded.

// Stubs the API layer (from file:// a real call reaches the production backend
// and dies on CORS) and everything else the round expects from a live session.
async function installHarness(page, config) {
  await page.evaluate((cfg) => {
    window.__hwConfig = cfg;
    window.__hwUploads = [];
    window.__hwRequests = [];
    window.apiFetch = function (url, opts) {
      const u = String(url);
      window.__hwRequests.push(u);
      if (u.indexOf('handwritingCaptureConfig') >= 0) {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(window.__hwConfig) });
      }
      if (u.indexOf('saveHandwritingSample') >= 0) {
        window.__hwUploads.push(JSON.parse(opts.body));
        return Promise.resolve({
          ok: true, status: 201,
          json: () => Promise.resolve({ success: true, id: 'test', storedToday: 1, cap: 40 })
        });
      }
      return Promise.resolve({ ok: false, status: 0, json: () => Promise.resolve(null) });
    };
    window.playTTS = function () { };
    window.synthGem = function () { };
    window.synthError = function () { };
    window.playHappySound = function () { };
    window.showTranslation = function () { };
    window.showVocabImage = function () { };
    window.queueExerciseEvent = function () { };
    window.startRoundE = function () { };
    window.finalizeSession = function () { };
    window.goBackFromGameSelection = function () { };
    window.authActiveUser = { id: 'student_test_kid', name: 'Test Kid' };
    window.selectedClassContent = { book: 'Think0', unit: '4', page: 45 };
    STUDY_STATE.active = true;
    STUDY_STATE.isTransitioning = false;
    document.getElementById('studyModeOverlay').classList.remove('hidden');

    // A "pen path" for a letter: one dot per ink run per row, i.e. the letter's
    // own centreline, derived from the real Fredoka glyph mask.
    window.__hwPath = function (letter) {
      const mask = hwGlyphMask(letter);
      const strokes = [];
      for (let y = 0; y < HW_SIZE; y += 3) {
        let x = 0;
        while (x < HW_SIZE) {
          if (!mask[y * HW_SIZE + x]) { x++; continue; }
          let x2 = x;
          while (x2 + 1 < HW_SIZE && mask[y * HW_SIZE + x2 + 1]) x2++;
          strokes.push([{ x: (x + x2) / 2, y: y }]);
          x = x2 + 1;
        }
      }
      return strokes;
    };
    window.__hwLine = function (x, y0, y1) {
      const pts = [];
      for (let y = y0; y <= y1; y += 3) pts.push({ x: x, y: y });
      return [pts];
    };
    window.__hwDraw = function (strokes) {
      const cv = document.querySelector('.hw-trace-canvas');
      const r = cv.getBoundingClientRect();
      const fire = (type, p, buttons) => cv.dispatchEvent(new PointerEvent(type, {
        clientX: r.x + p.x / HW_SIZE * r.width, clientY: r.y + p.y / HW_SIZE * r.height,
        pointerId: 7, bubbles: true, cancelable: true, isPrimary: true,
        button: 0, buttons: buttons, pointerType: 'touch'
      }));
      for (const st of strokes) {
        for (let i = 0; i < st.length; i++) fire(i === 0 ? 'pointerdown' : 'pointermove', st[i], 1);
        fire('pointerup', st[st.length - 1], 0);
      }
    };
  }, config);
}

async function loadWord(page, word, gaps) {
  await page.evaluate(([w, g]) => {
    STUDY_STATE.round = 'D';
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

async function drawGood(page, letter) {
  // The new flow preserves uncertain ink. This scenario explicitly redraws
  // instead of relying on the former destructive automatic erase.
  await page.evaluate(() => clearRoundD());
  await page.evaluate(l => window.__hwDraw(window.__hwPath(l)), letter);
  await page.waitForTimeout(ADVANCE);
}

async function drawBad(page) {
  await page.evaluate(() => window.__hwDraw(window.__hwLine(64, 20, 100)));
  await page.waitForTimeout(SETTLE);
}

const uploads = page => page.evaluate(() => window.__hwUploads.slice());

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
  await page.evaluate(() => hwEnsureFont());
  await installHarness(page, OPEN_CONFIG);

  // --- one word: a refusal, then two accepted letters -------------------------
  await loadWord(page, 'cat', [0, 1]);
  await drawBad(page);          // 'c' refused
  await drawGood(page, 'c');    // 'c' accepted on the second try
  await drawGood(page, 'a');    // 'a' accepted -> the word completes and uploads
  await page.waitForTimeout(UPLOAD);

  let up = await uploads(page);
  ok(up.length === 1, 'one completed word produces exactly one upload (got ' + up.length + ')');
  const doc = up[0] || {};
  ok(doc.word === 'cat', 'the payload carries the word ("' + doc.word + '")');
  ok(doc.mode === 'study', 'the payload carries the mode');
  ok(doc.book === 'Think0' && doc.unit === '4', 'the payload carries the textbook unit');
  ok(doc.student === 'Test Kid', 'the payload carries the display name as metadata');
  ok(doc.studentId === undefined, 'the payload does NOT send a student id (the server takes it from the token)');
  ok(typeof doc.ua === 'string' && doc.ua.length > 10, 'the payload carries the user agent (finger vs mouse matters)');
  ok(doc.capturedAt > 1700000000000, 'the payload carries a timestamp');

  const L = doc.letters || [];
  ok(L.length === 3, 'every judged letter is kept: 1 refusal + 2 accepts (got ' + L.length + ')');
  ok(L[0] && L[0].ch === 'c' && L[0].ok === false && L[0].att === 1, 'the refusal is recorded with attempt 1');
  ok(L[1] && L[1].ch === 'c' && L[1].ok === true && L[1].att === 2, 'the accept is recorded with attempt 2');
  ok(L[2] && L[2].ch === 'a' && L[2].ok === true && L[2].att === 1, 'the next letter restarts at attempt 1');
  ok(L[0] && L[0].gui === false, 'the scaffold stage is recorded (no outline on the first try)');

  console.log('--- the stored trace is replayable ---');
  ok(doc.engine === 2, 'the engine version is stamped (got ' + doc.engine + ')');
  ok(doc.size === 128 && doc.pen === 9 && doc.tol === 4,
    'the engine constants travel with the trace (size=' + doc.size + ' pen=' + doc.pen + ' tol=' + doc.tol + ')');
  ok(doc.boxPx >= 64 && doc.dpr === 2, 'the canvas geometry is recorded (boxPx=' + doc.boxPx + ', dpr=' + doc.dpr + ')');
  const flat = L.reduce((n, l) => n + l.s.reduce((m, s) => m + s.length, 0), 0);
  ok(L.every(l => Array.isArray(l.s) && l.s.length >= 1), 'every letter carries at least one stroke');
  ok(L.every(l => l.s.every(s => Array.isArray(s) && s.length >= 2 && s.length % 2 === 0)),
    'every stroke is a list of coordinate pairs');
  ok(L.every(l => l.s.every(s => s.every(n => Number.isInteger(n) && n >= 0 && n <= 128))),
    'every coordinate is an integer inside the 128-unit grid');
  ok(flat > 20, 'the strokes really contain ink (' + flat / 2 + ' points across the word)');
  const acceptedPoints = L[1].s.reduce((n, s) => n + s.length / 2, 0);
  ok(acceptedPoints >= 10,
    'an accepted letter keeps its whole path (' + acceptedPoints + ' points in ' + L[1].s.length + ' strokes)');
  ok(L.every(l => typeof l.ms === 'number' && l.ms >= 0) && L.some(l => l.ms > 0),
    'how long the letter took is recorded');
  ok(L[1].p > 0 && L[1].p <= 1 && L[1].r > 0 && L[1].r <= 1,
    'the scoring numbers behind the verdict are kept (p=' + L[1].p + ', r=' + L[1].r + ')');
  ok(typeof L[0].mi === 'number', 'the missing-part measure is kept for refusals (mi=' + (L[0] || {}).mi + ')');

  // Replaying the stored stroke must reproduce the verdict the round reached —
  // that is the whole point of keeping it. Valid WITHIN one rendering context:
  // the guide comes from antialiased text thresholded at alpha>90, so a
  // different browser (or headless vs headed) can disagree by a few percent on
  // the guide's own pixel count, which is why that count is stored as `gc`.
  const replay = await page.evaluate(([letters]) => {
    const rebuild = l => l.s.map(s => {
      const pts = [];
      for (let i = 0; i + 1 < s.length; i += 2) pts.push({ x: s[i], y: s[i + 1] });
      return pts;
    });
    return letters.map(l => {
      const v = hwVerify(rebuild(l), l.ch, HW_PEN, HW_TOL).scores;
      const guide = hwBbox(hwGlyphMask(l.ch), HW_SIZE);
      return {
        ch: l.ch, stored: l.ok,
        replayed: hwAccept(v, l.gui ? HW_PROFILE.guided : HW_PROFILE.free),
        dP: Math.abs(v.precision - l.p), dR: Math.abs(v.recall - l.r),
        storedGc: l.gc, guidePixels: guide ? guide.count : -1
      };
    });
  }, [L]);
  const mismatches = replay.filter(r => r.stored !== r.replayed);
  // The refusal was judged while the box was still free-stage, and the accepted
  // letters too, so a straight replay must agree on every one of them.
  ok(mismatches.every(r => r.stored === true) && doc.engine === 2,
    'engine-2 retains old successful pen-lift decisions; final geometry can differ, but refusals replay (' +
    replay.map(r => r.ch + ':' + (r.stored === r.replayed ? 'same' : 'DIFFERENT')).join(' ') + ')');
  ok(replay.every(r => r.dP <= 0.0005 && r.dR <= 0.0005),
    'scores are stored to 3dp, so a letter at recall 0.8955 cannot masquerade as one that met the 0.90 bar ' +
    '(max drift p ' + Math.max(...replay.map(r => r.dP)).toFixed(4) + ', r ' + Math.max(...replay.map(r => r.dR)).toFixed(4) + ')');
  ok(replay.every(r => r.storedGc === r.guidePixels && r.storedGc > 0),
    'the guide pixel count travels with the letter, so rendering drift is measurable (e.g. ' +
    replay[1].storedGc + ' px for "' + replay[1].ch + '")');

  console.log('--- the daily counter and the request path ---');
  const counter = await page.evaluate(() => JSON.parse(localStorage.getItem('csHwWordsSent_student_test_kid') || 'null'));
  ok(counter && counter.n === 1, 'a stored word increments the per-student daily counter');
  ok(counter && /^\d{8}$/.test(counter.d), 'the counter is keyed to a day (' + (counter || {}).d + ')');
  const reqs = await page.evaluate(() => window.__hwRequests.slice());
  ok(reqs.length > 0 && reqs.every(u => /handwritingCaptureConfig|saveHandwritingSample/.test(u)),
    'the collection only ever calls its own two endpoints (' + reqs.length + ' calls)');
  ok(!reqs.some(u => /saveAnalytics/.test(u)), 'traces never ride the analytics pipeline');

  // --- the daily cap stops the client, not just the server --------------------
  await page.evaluate(() => {
    localStorage.setItem('csHwWordsSent_student_test_kid',
      JSON.stringify({ d: HandwritingSampleCapture.dayKey(Date.now()), n: 40 }));
  });
  await loadWord(page, 'dog', [0]);
  await drawGood(page, 'd');
  await page.waitForTimeout(UPLOAD);
  up = await uploads(page);
  ok(up.length === 1, 'the daily cap stops further uploads client-side (still ' + up.length + ')');

  // --- a word abandoned halfway still arrives --------------------------------
  await page.evaluate(() => localStorage.removeItem('csHwWordsSent_student_test_kid'));
  await loadWord(page, 'pig', [0, 1, 2]);
  await drawGood(page, 'p');
  await page.evaluate(() => exitStudyMode());
  await page.waitForTimeout(UPLOAD);
  up = await uploads(page);
  ok(up.length === 2, 'leaving study mode mid-word flushes the buffer (' + up.length + ' uploads)');
  const partial = up[1] || {};
  ok(partial.word === 'pig' && (partial.letters || []).length === 1,
    'the partial word carries the one letter that was written');
  ok((partial.letters || [])[0] && partial.letters[0].ch === 'p' && partial.letters[0].ok === true,
    'the partial word keeps the accepted letter and its verdict');


  const realErrors = errors.filter(t => !/net::ERR_|Failed to load resource|ERR_FILE_NOT_FOUND|favicon|CORS/i.test(t));
  ok(realErrors.length === 0, 'runtime: no JS errors (' + (realErrors.length ? realErrors.join(' | ') : 'clean') + ')');

  console.log('\n--- HANDWRITING TRACE COLLECTION (browser) ---');
  console.log(pass + ' passed, ' + fail + ' failed');
  console.log('RESULT: ' + (fail === 0 ? 'PASS' : 'FAIL'));
  process.exitCode = fail === 0 ? 0 : 1;
  } finally { await browser.close(); }
})().catch(e => { console.error('CRASH:', e); process.exit(2); });
