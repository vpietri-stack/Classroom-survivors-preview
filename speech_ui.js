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
.speech-practice [hidden]{display:none!important;}
.speech-practice .heard-feedback{color:inherit;line-height:1.6;}
.speech-practice-instruction{font-size:14px;margin:8px 0 14px;line-height:1.6;}
.speech-practice details{font-size:13px;margin-top:10px;overflow-wrap:anywhere;}
.speech-practice summary{cursor:pointer;}
.speech-target-words{display:flex;flex-wrap:wrap;justify-content:center;gap:7px;margin:12px 0;}
.speech-target-word{display:inline-block;padding:7px 11px;border-radius:10px;background:rgba(100,116,139,.08);color:inherit;font-size:19px;}
.speech-target-word.heard{background:#e1f3e3;color:#24663e;}
.speech-reading-tile.speech-reading-neutral{background:linear-gradient(180deg,#818cf8,#6366f1)!important;color:white!important;border-color:#4338ca!important;box-shadow:0 3px 0 #4338ca!important;animation:none!important;}
.speech-target-note{font-size:12px;margin:6px 0;}
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
  const _controls = new Set();
  let _controlObserver = null;
  function watchControl(btn, dispose) {
    const entry = { btn: btn, seen: btn.isConnected, dispose: dispose };
    _controls.add(entry);
    if (!_controlObserver && typeof MutationObserver !== 'undefined') {
      _controlObserver = new MutationObserver(function () {
        _controls.forEach(function (item) {
          if (item.btn.isConnected) item.seen = true;
          else if (item.seen) item.dispose();
        });
      });
      _controlObserver.observe(document.documentElement, { childList: true, subtree: true });
    }
    return function () { _controls.delete(entry); if (!_controls.size && _controlObserver) { _controlObserver.disconnect(); _controlObserver = null; } };
  }

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
    let state = 'idle'; // 'idle' | 'starting' | 'recording' | 'busy'
    let safetyTimer = null;
    let waitTimer = null;
    let generation = 0, disposed = false, assessment = null;
    let recStartTs = 0; // for telemetry: how long the student actually spoke
    let recordingOwnerId = null;

    function updateUI() {
      if (state === 'recording') {
        btn.innerText = '⏹ 停止录音';
        btn.classList.remove('bg-red-600', 'hover:bg-red-500');
        btn.classList.add('bg-rose-600', 'hover:bg-rose-500');
        btn.disabled = false;
      } else if (state === 'busy' || state === 'starting') {
        btn.innerText = state === 'starting' ? '🎙️ 正在打开麦克风…' : '⏳ 正在听…';
        btn.disabled = true;
      } else {
        btn.innerText = opts.idleText || '🎙️ 点击说话';
        btn.classList.remove('bg-rose-600', 'hover:bg-rose-500');
        btn.classList.add('bg-red-600', 'hover:bg-red-500');
        btn.disabled = false;
      }
    }
    function clearSafety() { if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null; } }
    function clearWait() { if (waitTimer) { clearTimeout(waitTimer); waitTimer = null; } }
    function notify() { if (!disposed && opts.onStateChange) opts.onStateChange(state); }
    function toIdle() { state = 'idle'; clearSafety(); clearWait(); if (global._activeRecorder === rec) { hideInline(); global._activeRecorder = null; } if (!disposed) { updateUI(); notify(); } spHeartbeat({ spRec: 0 }); }
    function stopRecorder() { try { const p = typeof rec.cancel === 'function' ? rec.cancel() : rec.stop(); if (p && p.catch) p.catch(function () {}); } catch (_) {} }
    function current(ticket) {
      let owner = null; try { owner = typeof authActiveUser !== 'undefined' && authActiveUser ? authActiveUser.id : null; } catch (_) {}
      if (!disposed && ticket === generation && (!btn.isConnected || owner !== recordingOwnerId)) btn.disposeSpeech();
      return !disposed && ticket === generation && btn.isConnected && owner === recordingOwnerId;
    }
    function limitWait(ms, message) {
      const ticket = generation;
      clearWait(); waitTimer = setTimeout(function () {
        if (!current(ticket)) return;
        generation++; if (assessment) assessment.abort(); stopRecorder(); toIdle();
        const error = new Error(message); error.code = 'SPEECH_TIMEOUT'; if (opts.onError) opts.onError(error);
      }, ms);
    }
    const unwatch = watchControl(btn, function () { btn.disposeSpeech(); });
    btn.disposeSpeech = function () {
      if (disposed) return; disposed = true; generation++; clearWait(); clearSafety();
      if (assessment) assessment.abort(); stopRecorder();
      if (global._activeRecorder === rec) { hideInline(); global._activeRecorder = null; }
      btn.disabled = true; unwatch(); if (opts.onDispose) opts.onDispose();
    };
    btn.setSpeechIdleText = function (text) { opts.idleText = text; if (!disposed && state === 'idle') updateUI(); };

    // Wire the inline indicator's Stop + Cancel (active while this button records).
    _onInlineStop = function () { if (state === 'recording') finishRecording(); };
    _onInlineCancel = function () { if (state === 'recording') cancelRecording(); };

    function startRecording() {
      if (disposed || state !== 'idle') return;
      try { recordingOwnerId = typeof authActiveUser !== 'undefined' && authActiveUser ? authActiveUser.id : null; }
      catch (_) { recordingOwnerId = null; }
      if (!global.Recorder.isSupported()) {
        if (opts.onError) opts.onError(new Error('Microphone unavailable. Allow mic access in your browser/WeChat settings.'));
        else alert('Microphone unavailable. Allow mic access in your browser/WeChat settings.');
        return;
      }
      if (global.LocalEngine && global.LocalEngine.isBusy && global.LocalEngine.isBusy()) {
        const error = new Error('Previous recording is still finishing'); error.code = 'SPEECH_BUSY'; if (opts.onError) opts.onError(error); return;
      }
      const ticket = ++generation;
      state = 'starting'; updateUI(); notify();
      limitWait(15000, 'Microphone permission timed out');
      // The permission prompt may appear here; because this is a tap (not a hold),
      // there is no gesture to lose — we simply continue once permission resolves.
      rec.start().then(function () {
        if (!current(ticket)) { stopRecorder(); return; }
        clearWait(); global._activeRecorder = rec;
        state = 'recording';
        recStartTs = Date.now();
        _onInlineStop = function () { if (state === 'recording') finishRecording(); };
        _onInlineCancel = function () { if (state === 'recording') cancelRecording(); };
        showInline(btn);  // inline indicator, no overlay — sentence stays visible
        updateUI();
        notify();
        clearSafety();
        safetyTimer = setTimeout(finishRecording, MAX_RECORD_MS);
        spHeartbeat({ spRec: 1 });
      }).catch(function (err) {
        if (!current(ticket)) return;
        // Permission denied / mic error -> clean, retryable reset (no stuck state).
        toIdle();
        if (isPermissionError(err) && opts.onPermissionDenied) opts.onPermissionDenied(err);
        else if (opts.onError) opts.onError(err);
        else alert('Mic error: ' + ((err && err.message) || err));
      });
    }

    function finishRecording() {
      if (disposed || state !== 'recording') return;
      const ticket = ++generation;
      assessment = new AbortController();
      state = 'busy';
      clearSafety();
      hideInline();
      updateUI();
      notify(); limitWait(30000, 'Speech assessment timed out');
      const audioMs = recStartTs ? Date.now() - recStartTs : null;
      rec.stop().then(function (blob) {
        if (!current(ticket)) return;
        if (!blob || !blob.size) {
          toIdle();
          if (opts.onGated) opts.onGated('empty', { audioMs: audioMs, durMs: 0, peak: 0 });
          return;
        }
        if (opts.onRecorded) opts.onRecorded({ audioMs: audioMs });
        // Pre-transcription gate: junk audio gets instant coaching feedback
        // instead of a doomed transcription round-trip.
        return wavStats(blob).then(function (stats) {
          if (!current(ticket)) return;
          if (stats && stats.durMs < MIN_SPEECH_MS) {
            toIdle();
            if (opts.onGated) opts.onGated('too_short', { audioMs: audioMs, durMs: Math.round(stats.durMs), peak: stats.peak, blob: blob, sampleRate: stats.sampleRate, ownerId: recordingOwnerId });
            return;
          }
          if (stats && stats.peak < MIN_PEAK_AMP) {
            toIdle();
            if (opts.onGated) opts.onGated('too_quiet', { audioMs: audioMs, durMs: Math.round(stats.durMs), peak: stats.peak, blob: blob, sampleRate: stats.sampleRate, ownerId: recordingOwnerId });
            return;
          }
          const t0 = Date.now();
          return global.LocalEngine.transcribe(blob, { signal: assessment.signal, ...(opts.assessmentTarget ? { target: opts.assessmentTarget } : {}) }).then(function (r) {
            if (!current(ticket)) return;
            toIdle();
            spHeartbeat({ spLastMs: Date.now() - t0 }); // last transcribe duration
            if (opts.onResult) opts.onResult(r.text || '', {
              audioMs: audioMs,
              durMs: stats ? Math.round(stats.durMs) : null,
              peak: stats ? stats.peak : null,
              transcribeMs: Date.now() - t0,
              blobBytes: blob.size,
              // The exact WAV the recogniser received, plus its true sample rate
              // (the recorder does not force 16 kHz — devices give 44.1/48 kHz
              // and the engine resamples). Consumed only by the temporary
              // speech-sample research collection; ignored otherwise.
              blob: blob,
              ownerId: recordingOwnerId,
              sampleRate: stats ? stats.sampleRate : null,
              targetWords: r.targetWords, targetStatus: r.targetStatus, targetCheckMs: r.targetCheckMs
            });
          });
        });
      }).catch(function (err) {
        if (!current(ticket)) return;
        toIdle();
        if (opts.onError) opts.onError(err);
      });
    }

    function cancelRecording() {
      if (state !== 'recording') return;
      generation++;
      clearSafety();
      // Stop the mic but discard the audio (no transcription).
      stopRecorder();
      toIdle();
      if (opts.onCancel) opts.onCancel();
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
      return { durMs: (n / sampleRate) * 1000, peak: peak, sampleRate: sampleRate };
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
    if (typeof SPEECH_PRACTICE_ENABLED !== 'undefined' && SPEECH_PRACTICE_ENABLED) return makePracticeGate(opts);
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
    
    function captureSample(text, meta, result, outcome, attempt) {
      if (!global.SpeechSampleCapture || typeof global.SpeechSampleCapture.maybeCapture !== 'function') return;
      try { global.SpeechSampleCapture.maybeCapture({
        blob: meta && meta.blob, ownerId: meta && meta.ownerId,
        target: target, transcript: text || '', outcome: outcome,
        student: (function () { try { return authActiveUser && authActiveUser.name || ''; } catch (_) { return ''; } })(),
        pass: result ? !!result.pass : null,
        accuracy: result ? result.accuracy : null, phoneticRatio: result ? result.phoneticRatio : null,
        attempt: attempt, level: level, book: book, mode: mode,
        audioMs: meta && meta.audioMs, durMs: meta && meta.durMs, peak: meta && meta.peak,
        sampleRate: meta && meta.sampleRate, transcribeMs: meta && meta.transcribeMs,
        details: result && result.details || '', ua: UA, capturedAt: Date.now(),
      }); } catch (_) { /* research must never interrupt the exercise */ }
    }
    const recBtn = makeRecordButton({
      idleText: '\uD83C\uDF99\uFE0F \u70b9\u51fb\u8bf4\u8bdd',
      onResult: function (text, meta) {
        // Junk transcript (Whisper hallucination): coach, don't grade. Not a
        // fail — the recording itself was fine, the kid just needs to be louder.
        if (isHallucination(text)) {
          captureSample(text, meta, null, 'hallucination', gradedTries + 1);
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
        // TEMPORARY research collection (consented students only; closes 2026-10-19).
        // The module is inert unless the server confirms consent for this exact
        // student AND the capture window is still open; it queues the upload and
        // returns immediately, so it cannot slow the attempt or throw into it.
        // Remove this block with speech_sample_capture.js once the calibration
        // set is built.
        captureSample(text, meta, res, 'graded', tryNo);
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
        captureSample('', meta, null, reason, gradedTries + 1);
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

  // Practice progression is independent of the recogniser's match decision.
  // No learner-facing percentage, word grades, retry leniency or mastery claim.
  function makePracticeGate(opts) {
    opts = opts || {}; injectAssets();
    const target = opts.target || '', level = opts.level || 2, mode = opts.mode || 'study', book = opts.book || currentBook();
    const wordTiles = Array.from(opts.wordTiles || []).filter(Boolean);
    const onDone = typeof opts.onDone === 'function' ? opts.onDone : function () {};
    let done = false, disposed = false, recordings = 0, gradedTries = 0, errors = 0, outcome = 'not_recorded', hintedWords = 0;
    const wrap = document.createElement('div');
    wrap.className = 'speech-sentence-gate speech-practice mt-4 text-center';
    wrap.innerHTML = '<div class="text-lg mb-2">🎙️ 朗读练习：<b class="text-emerald-300" lang="en"></b></div>' +
      '<p class="speech-practice-instruction">点击录音，读完后点击停止。可以再练一次，也可以继续。</p>' +
      '<div class="speech-gate-btns flex items-center justify-center gap-3 flex-wrap"></div>' +
      '<div class="heard-feedback" role="status" aria-live="polite"></div>' +
      '<div class="speech-target-words" hidden aria-label="听到的目标词"></div><p class="speech-target-note" hidden>绿色是这次听到的词；其他词不判对错。</p>' +
      '<details hidden><summary>查看识别到的内容</summary><p></p></details>';
    if (wordTiles.length) {
      wrap.querySelector('b').parentElement.remove();
      wrap.querySelector('.speech-target-words').remove();
      wrap.querySelector('.speech-target-note').remove();
    } else wrap.querySelector('b').textContent = target;
    const buttons = wrap.querySelector('.speech-gate-btns'), feedback = wrap.querySelector('.heard-feedback'), transcript = wrap.querySelector('details');
    const cont = document.createElement('button'); cont.type = 'button';
    cont.className = 'speech-practice-continue game-btn bg-emerald-600 hover:bg-emerald-500 text-lg px-8 py-4 rounded-2xl shadow-lg';
    cont.textContent = '继续 ▶'; cont.hidden = true;
    const alive = function () { return !done && !disposed && wrap.isConnected; };
    function clearHints() {
      hintedWords = 0;
      if (wordTiles.length) {
        wordTiles.forEach(tile => {
          tile.classList.remove('!bg-green-500', '!bg-red-500', 'correct', 'wrong');
          tile.classList.add('speech-reading-tile', 'speech-reading-neutral');
          tile.setAttribute('aria-label', tile.textContent + '：未判断');
        });
      } else {
        wrap.querySelector('.speech-target-words').hidden = true;
        wrap.querySelector('.speech-target-note').hidden = true;
      }
    }
    function showHints(meta) {
      clearHints(); if (!meta || !Array.isArray(meta.targetWords) || !meta.targetWords.length) return;
      if (wordTiles.length) {
        // Match in sentence order, including repeated words and punctuation.
        // A tile containing several words is green only if each word was heard.
        const tokens = text => (String(text).match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu) || []).map(w => w.toLowerCase().replace(/’/g, "'"));
        const expected = wordTiles.flatMap(tile => tokens(tile.dataset.word || tile.textContent));
        const actual = meta.targetWords.flatMap(w => tokens(w.text));
        if (expected.length !== actual.length || expected.some((w, i) => w !== actual[i])) return;
        let offset = 0;
        wordTiles.forEach(tile => {
          const n = tokens(tile.dataset.word || tile.textContent).length;
          const heard = n > 0 && meta.targetWords.slice(offset, offset + n).every(w => w.heardClear);
          if (heard) {
            tile.classList.remove('speech-reading-neutral');
            tile.classList.add('!bg-green-500', 'correct');
            tile.setAttribute('aria-label', tile.textContent + '：这次听清了');
          }
          hintedWords += meta.targetWords.slice(offset, offset + n).filter(w => w.heardClear).length;
          offset += n;
        });
        return;
      }
      const list = wrap.querySelector('.speech-target-words'); list.replaceChildren();
      for (const word of meta.targetWords.slice(0, 40)) { const chip = document.createElement('span'); chip.className = 'speech-target-word' + (word.heardClear ? ' heard' : ''); chip.textContent = word.text; list.appendChild(chip); if (word.heardClear) hintedWords++; }
      list.hidden = false; wrap.querySelector('.speech-target-note').hidden = false;
    }
    function offer(message) {
      if (!alive()) return;
      feedback.textContent = message; cont.hidden = false;
      recBtn.setSpeechIdleText('🎙️ 再读一次');
    }
    function technicalError(err, permission) {
      if (!alive()) return; outcome = 'unassessed'; transcript.hidden = true;
      if (++errors <= 2) logSpeechEvent('error', mode, { target: target, level: level, flow: 'optional_practice_v1', message: String(err && err.message || err).slice(0, 200), ua: UA }, recordings || 1);
      if (permission && !wrap.querySelector('.mic-help')) wrap.insertAdjacentHTML('beforeend', micHelpHTML());
      offer(permission ? '麦克风还没有打开。可以按下方提示设置，也可以继续。' :
        err && err.code === 'SPEECH_TIMEOUT' ? '这次等待有点久。可以继续，稍后再练。' :
        err && err.code === 'SPEECH_BUSY' ? '上一段录音还在结束处理中。可以稍后再练，也可以继续。' :
        '这次没能完成识别。可以再试一次，也可以继续。');
    }
    function capture(text, meta, result, name) {
      if (!global.SpeechSampleCapture || typeof global.SpeechSampleCapture.maybeCapture !== 'function') return;
      try { global.SpeechSampleCapture.maybeCapture({
        blob: meta && meta.blob, ownerId: meta && meta.ownerId, target: target, transcript: text || '', outcome: name,
        student: (function () { try { return authActiveUser && authActiveUser.name || ''; } catch (_) { return ''; } })(),
        pass: result ? !!result.pass : null, accuracy: result ? result.accuracy : null, phoneticRatio: result ? result.phoneticRatio : null,
        attempt: gradedTries || 1, level: level, book: book, mode: mode, audioMs: meta && meta.audioMs,
        durMs: meta && meta.durMs, peak: meta && meta.peak, sampleRate: meta && meta.sampleRate,
        transcribeMs: meta && meta.transcribeMs, details: result && result.details || '', ua: UA, capturedAt: Date.now()
      }); } catch (_) { /* existing consent/quota/date policy owns research capture */ }
    }
    const recBtn = makeRecordButton({
      idleText: '🎙️ 开始朗读',
      assessmentTarget: target,
      onStateChange: function (state) {
        if (!alive()) return;
        if (state === 'starting') { clearHints(); transcript.hidden = true; cont.hidden = false; feedback.textContent = '正在打开麦克风…'; }
        if (state === 'recording') { cont.hidden = true; transcript.hidden = true; feedback.textContent = ''; clearHints(); }
        if (state === 'busy') { cont.hidden = false; outcome = 'unassessed'; feedback.textContent = '正在听你的录音…也可以直接继续。'; }
      },
      onRecorded: function () { if (alive()) recordings++; },
      onCancel: function () { offer('录音已取消。可以重新录音，也可以继续。'); },
      onDispose: function () { disposed = true; if (!done) spHeartbeat({ spGate: 0, spRec: 0 }); },
      onResult: function (text, meta) {
        if (!alive()) return;
        showHints(meta);
        if (isHallucination(text)) {
          outcome = 'unassessed'; transcript.hidden = true; capture(text, meta, null, 'hallucination');
          logSpeechEvent('gated', mode, { target: target, level: level, reason: 'hallucination', flow: 'optional_practice_v1', ua: UA }, recordings);
          if (hintedWords) { gradedTries++; outcome = 'target_heard'; }
          offer(hintedWords ? '有些词已经听清了，谢谢你认真朗读！可以再练一次，也可以继续。' : '谢谢你练习！这次没有听清楚，可以再读一次，也可以继续。'); return;
        }
        gradedTries++;
        // Retrying never changes the match threshold. These are transcription
        // diagnostics, not a calibrated pronunciation score or earned mastery.
        const result = global.Scorer.scoreForBook ? global.Scorer.scoreForBook(target, text, book, 1) : global.Scorer.score(target, text, level);
        outcome = result.pass ? 'matched' : 'different';
        logSpeechEvent('attempt', mode, {
          target: target, transcript: String(text || '').slice(0, 1000), pass: !!result.pass,
          accuracy: Math.round((result.accuracy || 0) * 1000) / 1000, phoneticRatio: Math.round((result.phoneticRatio || 0) * 1000) / 1000,
          edits: typeof result.edits === 'number' ? result.edits : null, attempt: 1, practiceAttempt: gradedTries,
          level: level, book: book, flow: 'optional_practice_v1', details: result.details || '',
          audioMs: meta && meta.audioMs, transcribeMs: meta && meta.transcribeMs, blobBytes: meta && meta.blobBytes, ua: UA,
          targetHintCount: hintedWords, targetStatus: meta && meta.targetStatus, targetCheckMs: meta && meta.targetCheckMs
        }, recordings);
        capture(text, meta, result, 'graded');
        transcript.querySelector('p').textContent = '我听到的可能是：“' + String(text || '').slice(0, 1000) + '”'; transcript.hidden = false;
        offer(hintedWords ? '谢谢你认真朗读！这次已经听到了这些词。可以再练一次，也可以继续。' :
          '谢谢你练习！想再练一次可以重新录音，也可以继续。');
      },
      onGated: function (reason, meta) {
        if (!alive()) return; outcome = 'unassessed'; transcript.hidden = true; capture('', meta, null, reason);
        logSpeechEvent('gated', mode, { target: target, level: level, reason: reason, flow: 'optional_practice_v1', audioMs: meta && meta.audioMs, durMs: meta && meta.durMs, ua: UA }, recordings || 1);
        offer(reason === 'too_short' ? '录音有点短。可以读完句子再点停止，也可以继续。' :
          '没有听清声音。可以靠近麦克风再读一次，也可以继续。');
      },
      onError: function (err) { technicalError(err, isPermissionError(err)); },
      onPermissionDenied: function (err) { technicalError(err || new Error('Permission denied'), true); }
    });
    cont.onclick = function () {
      if (!alive()) return; done = true; cont.disabled = true;
      const summary = { target: target, level: level, book: book, flow: 'optional_practice_v1', recordings: recordings,
        assessedAttempts: gradedTries, completion: gradedTries ? 'practised' : 'unassessed',
        matchedTarget: outcome === 'matched' ? true : outcome === 'different' ? false : null,
        assessment: 'target_aware_hints', targetHintCount: hintedWords, ua: UA };
      recBtn.disposeSpeech(); spHeartbeat({ spGate: 0, spRec: 0 });
      logSpeechEvent('practice', mode, summary, recordings || null); onDone(summary);
    };
    buttons.appendChild(recBtn); buttons.appendChild(cont); spHeartbeat({ spGate: 1, spFails: 0 });
    queryMicPermission().then(function (state) { if (alive() && state === 'denied') technicalError(new Error('Permission denied'), true); });
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
