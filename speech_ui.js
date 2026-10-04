/* =========================================================================
 * speech_ui.js  —  shared WeChat-style hold-to-talk UI for speech rounds.
 * Injects the recording overlay (frozen screen + listening bubble with live
 * mic level) once, and provides a record button + transcription helper used
 * by Study Round B and Game-mode word-rec.
 * Globals: window.SpeechUI
 * Depends on: window.Recorder, window.LocalEngine, window.Scorer, window.SpeechStatus
 * ========================================================================= */
(function (global) {
  'use strict';

  const CSS_ID = 'speech-ui-css';
  const OVERLAY_ID = 'recOverlay';

  function injectAssets() {
    if (!document.getElementById(CSS_ID)) {
      const st = document.createElement('style');
      st.id = CSS_ID;
      st.textContent = `
.speech-rec-btn{user-select:none;touch-action:none;transition:transform .06s;}
.speech-rec-btn:active{transform:scale(.97);}
.heard-feedback{font-size:15px;min-height:22px;margin-top:6px;}
.heard-feedback.ok{color:#22c55e;} .heard-feedback.no{color:#ef4444;}
/* Inline recording indicator (no overlay — sentence stays visible) */
.rec-inline{display:none;flex-direction:column;align-items:center;gap:8px;margin-top:10px;}
.rec-inline.show{display:flex;}
.rec-inline-bars{display:flex;align-items:flex-end;gap:3px;height:24px;}
.rec-inline-bars span{width:4px;background:#9be89b;border-radius:2px;height:4px;
  transition:height .08s ease-out;}
.rec-inline-label{display:flex;align-items:center;gap:8px;font-size:15px;color:#fca5a5;
  background:rgba(220,38,38,.15);border:1px solid rgba(220,38,38,.4);border-radius:12px;
  padding:8px 18px;cursor:pointer;}
.rec-inline-label:active{transform:scale(.97);}
.rec-inline-label .sq{width:14px;height:14px;background:#ef4444;border-radius:3px;flex-shrink:0;}
.rec-inline-cancel{font-size:12px;color:#9ca3af;background:none;border:none;cursor:pointer;
  text-decoration:underline;padding:4px 8px;}
.rec-inline-cancel:active{color:#fff;}
`;
      document.head.appendChild(st);
    }
  }

  let _raf = null;
  let _inlineEl = null; // the inline recording indicator element
  let _onInlineStop = null;
  let _onInlineCancel = null;

  // B1 CRASH BREADCRUMB (2026-09-04): module-level speech heartbeat. Merges
  // speech-pipeline state into the kill-surviving csPageHeartbeat breadcrumb
  // so a WebContent kill reports exactly what speech was doing. Safe no-op
  // when the auth/telemetry layer isn't loaded (test mode, teacher pages).
  function spHeartbeat(extra) {
    try {
      if (typeof csPageHeartbeat === 'function') {
        csPageHeartbeat(Object.assign({ spGate: 1 }, extra || {}));
      }
    } catch (_) { /* best-effort */ }
  }

  function loop() {
    if (!_inlineEl || !_inlineEl.classList.contains('show')) { _raf = null; return; }
    const lvl = (global.Recorder && global._activeRecorder) ? global._activeRecorder.level || 0 : 0;
    const bars = _inlineEl.querySelector('.rec-inline-bars');
    if (bars) {
      const n = bars.children.length;
      for (let i = 0; i < n; i++) {
        bars.children[i].style.height = (4 + lvl * 18 * (0.5 + 0.5 * Math.abs(Math.sin(i + performance.now() / 120)))).toFixed(0) + 'px';
      }
    }
    _raf = requestAnimationFrame(loop);
  }

  function showInline(parentEl) {
    injectAssets();
    if (!_inlineEl) {
      _inlineEl = document.createElement('div');
      _inlineEl.className = 'rec-inline';
      _inlineEl.innerHTML = `
        <div class="rec-inline-bars"><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div>
        <div class="rec-inline-label" id="recInlineStop"><span class="sq"></span>正在录音，点击停止</div>
        <button class="rec-inline-cancel" id="recInlineCancel" type="button">取消</button>`;
    }
    // Insert after the parent (record button area)
    if (parentEl && parentEl.parentNode && _inlineEl.parentNode !== parentEl.parentNode) {
      parentEl.parentNode.insertBefore(_inlineEl, parentEl.nextSibling);
    }
    _inlineEl.classList.add('show');
    // Wire stop/cancel
    const stopBtn = _inlineEl.querySelector('#recInlineStop');
    const cancelBtn = _inlineEl.querySelector('#recInlineCancel');
    stopBtn.onclick = function () { if (_onInlineStop) _onInlineStop(); };
    cancelBtn.onclick = function () { if (_onInlineCancel) _onInlineCancel(); };
    if (!_raf) _raf = requestAnimationFrame(loop);
  }

  function hideInline() {
    if (_inlineEl) _inlineEl.classList.remove('show');
    _onInlineStop = null;
    _onInlineCancel = null;
  }

  // Build a tap-to-toggle record button. Tap once to start recording, tap again
  // to stop + transcribe; onResult(text) is called with the transcript.
  //
  // Why tap-to-toggle (not hold-to-talk): the FIRST tap triggers the OS mic
  // permission prompt, which steals the pointer gesture — with hold-to-talk the
  // release (pointerup) was lost, so iPad got stuck "listening" with no way out
  // and Android errored on the first try. A discrete tap has no release to lose,
  // so the permission prompt is harmless. Safety nets guarantee we can never get
  // stuck: a max-duration auto-stop and an overlay Cancel button.
  //
  // opts: { label, idleText, color, onResult, onError }
  function makeRecordButton(opts) {
    opts = opts || {};
    injectAssets();
    const MAX_RECORD_MS = 15000; // safety: auto-stop a runaway recording
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'speech-rec-btn game-btn text-xl px-8 py-4 rounded-2xl shadow-lg';
    const rec = new global.Recorder();
    global._activeRecorder = rec; // so the overlay loop can read .level
    let state = 'idle'; // 'idle' | 'recording' | 'busy'
    let safetyTimer = null;
    let recStartTs = 0; // for telemetry: how long the student actually spoke

    function updateUI() {
      if (state === 'recording') {
        btn.innerText = '⏹ 停止录音';
        btn.classList.remove('bg-red-600', 'hover:bg-red-500');
        btn.classList.add('bg-rose-600', 'hover:bg-rose-500');
        btn.disabled = false;
      } else if (state === 'busy') {
        btn.innerText = '⏳ 识别中…';
        btn.disabled = true;
      } else {
        btn.innerText = opts.idleText || '🎙️ 点击说话';
        btn.classList.remove('bg-rose-600', 'hover:bg-rose-500');
        btn.classList.add('bg-red-600', 'hover:bg-red-500');
        btn.disabled = false;
      }
    }
    function clearSafety() { if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null; } }
    function toIdle() { state = 'idle'; clearSafety(); hideInline(); updateUI(); spHeartbeat({ spRec: 0 }); }

    // Wire the inline indicator's Stop + Cancel (active while this button records).
    _onInlineStop = function () { if (state === 'recording') finishRecording(); };
    _onInlineCancel = function () { if (state === 'recording') cancelRecording(); };

    function startRecording() {
      if (state !== 'idle') return;
      if (!global.Recorder.isSupported()) {
        if (opts.onError) opts.onError(new Error('Microphone unavailable. Allow mic access in your browser/WeChat settings.'));
        else alert('Microphone unavailable. Allow mic access in your browser/WeChat settings.');
        return;
      }
      // The permission prompt may appear here; because this is a tap (not a hold),
      // there is no gesture to lose — we simply continue once permission resolves.
      rec.start().then(function () {
        state = 'recording';
        recStartTs = Date.now();
        showInline(btn);  // inline indicator, no overlay — sentence stays visible
        updateUI();
        clearSafety();
        safetyTimer = setTimeout(finishRecording, MAX_RECORD_MS);
        spHeartbeat({ spRec: 1 });
      }).catch(function (err) {
        // Permission denied / mic error -> clean, retryable reset (no stuck state).
        toIdle();
        if (isPermissionError(err) && opts.onPermissionDenied) opts.onPermissionDenied(err);
        else if (opts.onError) opts.onError(err);
        else alert('Mic error: ' + ((err && err.message) || err));
      });
    }

    function finishRecording() {
      if (state !== 'recording') return;
      state = 'busy';
      clearSafety();
      hideInline();
      updateUI();
      const audioMs = recStartTs ? Date.now() - recStartTs : null;
      rec.stop().then(function (blob) {
        if (!blob || !blob.size) {
          toIdle();
          if (opts.onGated) opts.onGated('empty', { audioMs: audioMs, durMs: 0, peak: 0 });
          return;
        }
        // Pre-transcription gate: junk audio gets instant coaching feedback
        // instead of a doomed transcription round-trip.
        return wavStats(blob).then(function (stats) {
          if (stats && stats.durMs < MIN_SPEECH_MS) {
            toIdle();
            if (opts.onGated) opts.onGated('too_short', { audioMs: audioMs, durMs: Math.round(stats.durMs), peak: stats.peak });
            return;
          }
          if (stats && stats.peak < MIN_PEAK_AMP) {
            toIdle();
            if (opts.onGated) opts.onGated('too_quiet', { audioMs: audioMs, durMs: Math.round(stats.durMs), peak: stats.peak });
            return;
          }
          const t0 = Date.now();
          return global.LocalEngine.transcribe(blob).then(function (r) {
            toIdle();
            spHeartbeat({ spLastMs: Date.now() - t0 }); // last transcribe duration
            if (opts.onResult) opts.onResult(r.text || '', {
              audioMs: audioMs,
              durMs: stats ? Math.round(stats.durMs) : null,
              peak: stats ? stats.peak : null,
              transcribeMs: Date.now() - t0,
              blobBytes: blob.size
            });
          });
        });
      }).catch(function (err) {
        toIdle();
        if (opts.onError) opts.onError(err);
      });
    }

    function cancelRecording() {
      if (state !== 'recording') return;
      clearSafety();
      // Stop the mic but discard the audio (no transcription).
      rec.stop().catch(function () {});
      toIdle();
    }

    btn.addEventListener('click', function () {
      if (state === 'idle') startRecording();
      else if (state === 'recording') finishRecording();
      // 'busy' (transcribing): ignore taps.
    });
    updateUI();
    return btn;
  }

  // --- pre-transcription audio gate ---------------------------------------
  // Field data (2026-07-27): 46 recordings <1.2s were 100% Whisper
  // hallucinations ([BLANK_AUDIO]/[Music]) and 0% passes — kids double-tap the
  // button or the mic captures nothing. Rejecting junk BEFORE transcription
  // gives instant, actionable feedback instead of a doomed 2.5s wait.
  // The recorder emits standard 44-byte-header 16-bit mono WAV, so duration
  // and peak amplitude can be read directly from the blob (post VAD-trim,
  // i.e. this measures actual speech content, not wall-clock hold time).
  const MIN_SPEECH_MS = 1000;   // shortest plausible sentence reading (NB: measured
                                // post VAD-trim — field-tested 2026-07-29: 1.5s false-
                                // rejected a normal-pace "He's my brother")
  const MIN_PEAK_AMP  = 0.02;   // below this the recording is essentially silence
  function wavStats(blob) {
    return blob.arrayBuffer().then(function (buf) {
      const dv = new DataView(buf);
      if (buf.byteLength < 44) return { durMs: 0, peak: 0 };
      const sampleRate = dv.getUint32(24, true) || 16000;
      const n = Math.floor((buf.byteLength - 44) / 2);
      let peak = 0;
      // Stride through samples (every 4th) — plenty for a peak estimate and
      // keeps worst-case (15s × 48kHz) scans fast on low-end tablets.
      for (let i = 0; i < n; i += 4) {
        const a = Math.abs(dv.getInt16(44 + i * 2, true)) / 32768;
        if (a > peak) peak = a;
      }
      return { durMs: (n / sampleRate) * 1000, peak: peak };
    }).catch(function () { return null; }); // unreadable → don't gate, let Whisper try
  }

  // --- hallucination transcript gate ----------------------------------------
  // Field data 2026-08 (3067 attempts): ~9% of attempts are Whisper junk
  // output — "[Music]", "[BLANK_AUDIO]", "[speaking in foreign language]",
  // lone "Bye!"/"You" — emitted when the model hears no clear speech. Grading
  // them as failures punishes kids for a too-quiet/too-far recording instead
  // of coaching them. Detect the pattern, coach, and DON'T grade — but DO
  // count toward Skip progress: repeated hallucinations mean a faulty mic or
  // a noisy room, and those students need the escape hatch.
  function isHallucination(text) {
    const x = (text || '').trim();
    if (!x) return true;
    // Whisper's bracketed sound-effect tags ([Music], [INAUDIBLE], …).
    if (/^\[.*\]$/.test(x) || /^\(.*\)$/.test(x)) return true;
    // The classic one-token junk outputs.
    return /^(you|bye!?|huh\?|thank you\.?|thanks for watching!?|inaudible|\.|\?)+$/i.test(x);
  }

  // --- microphone permission helpers ---------------------------------------
  // Field data: 3 students generated 142 'Permission denied' errors and ZERO
  // attempts — Chrome remembers a single "Block" click forever, so every tap
  // fails instantly with no explanation. Detect that state and teach the fix.
  function isPermissionError(err) {
    const n = (err && err.name) || '';
    return n === 'NotAllowedError' || n === 'PermissionDeniedError' || n === 'SecurityError';
  }
  // Resolves 'denied' | 'granted' | 'prompt' | null (API unavailable, e.g. Safari).
  function queryMicPermission() {
    try {
      if (navigator.permissions && navigator.permissions.query) {
        return navigator.permissions.query({ name: 'microphone' })
          .then(function (st) { return st.state; })
          .catch(function () { return null; });
      }
    } catch (_) {}
    return Promise.resolve(null);
  }
  // Per-browser "how to re-enable the mic" instructions (student/parent-facing).
  function micHelpHTML() {
    const ua = navigator.userAgent || '';
    let steps;
    if (/MicroMessenger/i.test(ua)) {
      steps = '点右上角 “…” → 设置 → 允许麦克风；如果没有这个选项，请到手机系统设置里允许微信使用麦克风，然后重新打开本页。';
    } else if (/iPad|iPhone/.test(ua)) {
      steps = '打开 设置 → Safari → 麦克风 → 允许，然后刷新本页；或点地址栏左侧的 “大小”(AA) 图标 → 网站设置 → 麦克风 → 允许。';
    } else {
      steps = '点地址栏左侧的 🔒 或 ⚙️ 图标 → 网站设置 → 麦克风 → 允许，然后刷新页面。';
    }
    return '<div class="mic-help bg-amber-900/40 border border-amber-500/50 rounded-xl px-4 py-3 mt-3 text-left text-sm text-amber-100">' +
      '<b>🎙️ 麦克风被禁用了！</b><br>' + steps +
      '</div>';
  }

  // --- Speech telemetry ----------------------------------------------------
  // Every sentence-gate attempt is logged through the existing analytics
  // pipeline (queueExerciseEvent → saveAnalytics → Cosmos DB) so we can
  // diagnose WHY students fail: the raw transcript-vs-target pair separates
  // ASR failure (garbage transcript) from scorer strictness (near-miss).
  // Defensive no-op when analytics is unavailable (logged out / test mode) —
  // telemetry must never break the exercise.
  const UA = (navigator.userAgent || '').slice(0, 160);
  function logSpeechEvent(kind, mode, data, attempts) {
    try {
      if (typeof queueExerciseEvent === 'function') {
        queueExerciseEvent('speech_' + kind, mode || 'study', data, attempts || null);
      }
    } catch (_) { /* never let telemetry break the exercise */ }
  }

  // Resolve the student's current book for scorer leniency. Priority:
  //   1. authActiveUser.book — the student's DB settings record (source of
  //      truth; also tracks auto page-advance)
  //   2. selectedClassContent.book — legacy class_config fallback (only used
  //      for non-logged-in / test sessions where no DB record exists)
  function currentBook() {
    try {
      if (typeof authActiveUser !== 'undefined' && authActiveUser && authActiveUser.book) return authActiveUser.book;
      if (typeof selectedClassContent !== 'undefined' && selectedClassContent && selectedClassContent.book) return selectedClassContent.book;
    } catch (_) {}
    return null;
  }

  // Build a self-contained "say the sentence aloud" gate (used after a correct
  // unscramble). Returns a DOM node with: prompt, hold-to-talk record button,
  // heard-feedback line, and a Skip button that appears only after 3 failed
  // attempts (so students genuinely try before they can bypass).
  // Each graded try is scored against a progressively more lenient rung of
  // Scorer.RETRY_LADDER — deliberately invisible to the student, whose feedback
  // text is identical on every try.
  // On a pass it plays the success sound, shows the score, and swaps in a
  // Continue button so the student controls when to advance.
  // Callers should only build this when SpeechStatus.isReady() is already true.
  //   opts: { target, level = 2, mode = 'study', book, onDone }
  //   mode tags telemetry events ('study' | 'game').
  //   book overrides the auto-resolved student book (scorer leniency tier);
  //   when omitted the gate reads authActiveUser.book itself via currentBook().
  //   onDone() is the single "advance" callback — fired on Continue (pass) OR Skip.
  function makeSentenceGate(opts) {
    opts = opts || {};
    injectAssets();
    const target = opts.target || '';
    const level = opts.level || 2;
    const mode = opts.mode || 'study';
    const book = opts.book || currentBook();
    const onDone = typeof opts.onDone === 'function' ? opts.onDone : function () {};

    const wrap = document.createElement('div');
    wrap.className = 'speech-sentence-gate mt-4 text-center';
    wrap.innerHTML =
      '<div class="text-lg text-white mb-2">\uD83C\uDFA4 Now say it: <b class="text-emerald-300"></b></div>' +
      '<div class="speech-gate-btns flex items-center justify-center gap-3 flex-wrap"></div>' +
      '<div class="heard-feedback"></div>';
    // Set target as text (avoids HTML-injection from content strings).
    wrap.querySelector('b').textContent = target;

    const btns = wrap.querySelector('.speech-gate-btns');
    const feedback = wrap.querySelector('.heard-feedback');
    let done = false;
    let failCount = 0;
    // Two counters, two jobs. failCount drives the Skip reveal and counts every
    // way an attempt can go wrong (graded fail, junk transcript, too quiet, mic
    // error). gradedTries counts only attempts that were actually transcribed
    // and scored, and drives the scorer's leniency ladder — a kid who
    // double-taps and gets "太短啦" three times has not spoken three times, so
    // they must not arrive at the lenient try-3 rung without ever being heard.
    let gradedTries = 0;
    const SKIP_AFTER_FAILS = 3; // let the student try 3 times before offering Skip

    spHeartbeat({ spFails: 0 }); // gate opened (module-level spHeartbeat merges state)

    // Permission-denied state: show the per-browser fix instructions ONCE and
    // reveal Skip immediately — a blocked student can do nothing else.
    // Field data 2026-08: 4 students generated 435 of 861 permission errors by
    // re-tapping after being blocked — so (a) cap telemetry at 2 error events
    // per gate, and (b) swap the record button for an explicit "已允许，重试"
    // button so the recovery path is visible instead of mystery re-taps.
    let helpShown = false;
    let permErrors = 0;
    let retryBtn = null;
    function showMicHelp(source) {
      permErrors++;
      if (permErrors <= 2) {
        logSpeechEvent('error', mode, { target: target, level: level, message: 'Permission denied (' + source + ')', ua: UA }, failCount + 1);
      } else if (permErrors === 3) {
        logSpeechEvent('error', mode, { target: target, level: level, message: 'Permission denied (repeats suppressed)', ua: UA }, failCount + 1);
      }
      if (!helpShown) {
        helpShown = true;
        wrap.insertAdjacentHTML('beforeend', micHelpHTML());
      }
      feedback.className = 'heard-feedback no';
      feedback.innerText = '\u9ea6\u514b\u98ce\u672a\u6388\u6743 \u2014 \u770b\u4e0b\u65b9\u63d0\u793a\uff0c\u6216\u70b9\u201c\u8df3\u8fc7\u201d\u7ee7\u7eed';
      skip.style.display = '';
      // Swap the record button for a visible recovery action.
      recBtn.style.display = 'none';
      if (!retryBtn) {
        retryBtn = document.createElement('button');
        retryBtn.className = 'game-btn bg-red-600 hover:bg-red-500 text-lg px-6 py-3 rounded-2xl';
        retryBtn.innerText = '\u2705 \u5df2\u5141\u8bb8\uff0c\u91cd\u8bd5';
        retryBtn.onclick = function () {
          retryBtn.style.display = 'none';
          recBtn.style.display = '';
          recBtn.click(); // re-request the mic; failure re-enters showMicHelp
        };
        btns.insertBefore(retryBtn, skip);
      }
      retryBtn.style.display = '';
    }

    const skip = document.createElement('button');
    skip.className = 'game-btn bg-slate-600 hover:bg-slate-500 text-base px-5 py-3 rounded-2xl';
    skip.innerText = '跳过 \u25B6';
    skip.style.display = 'none';
    skip.onclick = function () {
      if (!done) {
        done = true;
        // A skip after repeated fails is the strongest "recognition is broken
        // for this student" signal — record it with the fail count.
        logSpeechEvent('skip', mode, { target: target, level: level, failsBeforeSkip: failCount, ua: UA }, failCount);
        spHeartbeat({ spGate: 0, spFails: failCount }); // gate closing
        onDone();
      }
    };
    
    const recBtn = makeRecordButton({
      idleText: '\uD83C\uDF99\uFE0F \u70b9\u51fb\u8bf4\u8bdd',
      onResult: function (text, meta) {
        // Junk transcript (Whisper hallucination): coach, don't grade. Not a
        // fail — the recording itself was fine, the kid just needs to be louder.
        if (isHallucination(text)) {
          logSpeechEvent('gated', mode, {
            target: target, level: level, reason: 'hallucination', transcript: (text || '').slice(0, 60),
            audioMs: meta && meta.audioMs, ua: UA
          }, failCount + 1);
          feedback.className = 'heard-feedback no';
          feedback.innerText = '\uD83D\uDD0A \u6ca1\u542c\u6e05\u695a \u2014 \u8bf7\u5927\u58f0\u4e00\u70b9\uff0c\u79bb\u9ea6\u514b\u98ce\u8fd1\u4e00\u70b9\u518d\u8bd5';
          // Counts toward Skip (same policy as too_quiet/empty): a mic or
          // environment that keeps producing junk must not trap the student.
          failCount++;
          spHeartbeat({ spFails: failCount });
          if (failCount >= SKIP_AFTER_FAILS) skip.style.display = '';
          return;
        }
        // NOTE: feedback text is set INSIDE the pass/fail branches below —
        // pass hides transcript+score entirely (pure celebration), fail shows
        // only "heard + score" (no threshold internals).
        const tryNo = gradedTries + 1;
        gradedTries++;
        const res = global.Scorer.scoreForBook
          ? global.Scorer.scoreForBook(target, text, book, tryNo)
          : global.Scorer.score(target, text, level);
        // Log EVERY attempt (pass or fail) with the full score breakdown — the
        // transcript is the diagnostic gold for the children's-voices problem.
        logSpeechEvent('attempt', mode, {
          target: target,
          transcript: text || '',
          pass: !!res.pass,
          accuracy: Math.round((res.accuracy || 0) * 1000) / 1000,
          phoneticRatio: Math.round((res.phoneticRatio || 0) * 1000) / 1000,
          edits: typeof res.edits === 'number' ? res.edits : null,
          level: level,
          book: book,
          // Which rung of the leniency ladder graded this. Without it the
          // dashboard pass rate mixes strict and grace verdicts and
          // api/analyze_speech.js can no longer isolate scorer strictness.
          attempt: tryNo,
          details: res.details || '',
          audioMs: meta && typeof meta.audioMs === 'number' ? meta.audioMs : null,
          transcribeMs: meta && typeof meta.transcribeMs === 'number' ? meta.transcribeMs : null,
          blobBytes: meta && typeof meta.blobBytes === 'number' ? meta.blobBytes : null,
          ua: UA
        }, failCount + 1);
        if (res.pass) {
          // Passed: pure celebration — deliberately NO score and NO transcript.
          // A lower-level student passing at 70% under their book's leniency
          // should feel like a win, not read "only 70%". (Full breakdown is
          // still recorded in telemetry above for analysis.)
          feedback.className = 'heard-feedback ok';
          feedback.innerText = '\u2713 \u592a\u68d2\u4e86\uff01';
          // playHappySound is a global fn (study_mode.js) — reuse the existing
          // success sound rather than inventing a new one.
          if (typeof playHappySound === 'function') playHappySound();
          recBtn.style.display = 'none';
          skip.style.display = 'none';
          const cont = document.createElement('button');
          cont.className = 'game-btn bg-emerald-600 hover:bg-emerald-500 text-lg px-8 py-4 rounded-2xl shadow-lg';
          cont.innerText = '\u7ee7\u7eed \u25B6';
          cont.onclick = function () { if (!done) { done = true; spHeartbeat({ spGate: 0 }); onDone(); } };
          btns.appendChild(cont);
        } else {
          failCount++;
          spHeartbeat({ spFails: failCount });
          // Failed: show only what was heard + the score — no threshold
          // internals (WER/phonetic reasons stay in telemetry only).
          const pct = Math.round((res.accuracy || 0) * 100);
          feedback.className = 'heard-feedback no';
          feedback.innerText = '\u542c\u5230: \u201C' + (text || '(\u9759\u97f3)') + '\u201D  ' + pct + '%  \u2014 \u518d\u8bd5\u4e00\u6b21';
          // synthError is a global lexical fn (defined in game.js); call it the
          // same defensive way the rest of the codebase does.
          if (typeof synthError === 'function') synthError();
          // Reveal Skip only after several failed attempts so no student is
          // permanently stuck on a wonky recognition.
          if (failCount >= SKIP_AFTER_FAILS) skip.style.display = '';
        }
      },
      onError: function (err) {
        feedback.className = 'heard-feedback no';
        feedback.innerText = '\u9519\u8bef: ' + ((err && err.message) || err);
        // Mic/engine errors are logged too — they can masquerade as "the model
        // doesn't understand me" from the student's point of view.
        logSpeechEvent('error', mode, { target: target, level: level, message: String((err && err.message) || err).slice(0, 200), ua: UA }, failCount + 1);
        // A hard mic/engine error also counts toward revealing Skip.
        failCount++;
        if (failCount >= SKIP_AFTER_FAILS) skip.style.display = '';
        // No microphone at all (unsupported browser/hardware): reveal Skip
        // right away — like permission-denied, the student can't do anything.
        if (/Microphone unavailable/i.test(String((err && err.message) || err))) skip.style.display = '';
      },
      // Junk audio caught BEFORE transcription: instant, specific coaching.
      onGated: function (reason, meta) {
        logSpeechEvent('gated', mode, {
          target: target, level: level, reason: reason,
          audioMs: meta && meta.audioMs, durMs: meta && meta.durMs,
          peak: meta && typeof meta.peak === 'number' ? Math.round(meta.peak * 1000) / 1000 : null,
          ua: UA
        }, failCount + 1);
        feedback.className = 'heard-feedback no';
        feedback.innerText = reason === 'too_short'
          ? '\u23F1 \u592a\u77ed\u5566\uff01\u70b9\u51fb\u540e\u8bf7\u8bfb\u5b8c\u6574\u4e2a\u53e5\u5b50\u518d\u70b9\u505c\u6b62'
          : '\uD83D\uDD07 \u6ca1\u542c\u5230\u58f0\u97f3 \u2014 \u8bf7\u5927\u58f0\u4e00\u70b9\uff0c\u79bb\u9ea6\u514b\u98ce\u8fd1\u4e00\u70b9';
        // too_short does NOT count toward Skip — otherwise spam-tapping the
        // button three times becomes a fast bypass of the exercise. too_quiet/
        // empty DO count: that's the faulty/muted-mic path (a mic that captures
        // nothing) and those students genuinely need the Skip escape hatch.
        if (reason !== 'too_short') {
          failCount++;
          if (failCount >= SKIP_AFTER_FAILS) skip.style.display = '';
        }
      },
      onPermissionDenied: function () { showMicHelp('getUserMedia'); }
    });

    // Proactive check (Chrome/Android; Safari lacks the API): if the mic is
    // ALREADY blocked, teach the fix now instead of after a confusing failure.
    queryMicPermission().then(function (state) {
      if (state === 'denied') showMicHelp('proactive');
    });

    btns.appendChild(recBtn);
    btns.appendChild(skip);
    return wrap;
  }

  // Wait until the model is ready; call done() immediately if already ready,
  // otherwise poll SpeechStatus. Returns a cancel function.
  function ensureReady(done, tick) {
    if (global.SpeechStatus && global.SpeechStatus.isReady()) { done(); return function () {}; }
    let cancelled = false;
    const iv = setInterval(function () {
      if (cancelled) return;
      if (tick) tick(global.SpeechStatus);
      if (global.SpeechStatus && global.SpeechStatus.isReady()) {
        clearInterval(iv); done();
      } else if (global.SpeechStatus && global.SpeechStatus.state === 'error') {
        clearInterval(iv); if (tick) tick(global.SpeechStatus);
      }
    }, 400);
    return function () { cancelled = true; clearInterval(iv); };
  }

  global.SpeechUI = {
    injectAssets: injectAssets,
    makeRecordButton: makeRecordButton,
    makeSentenceGate: makeSentenceGate,
    ensureReady: ensureReady
  };
})(window);
