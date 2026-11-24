// Preview app bridge to the frozen, device-local adaptive speech worker.
// One worker/model per page; preparation survives exercise changes and tab hiding.
(function (w) {
  'use strict';
  const enabled = typeof SPEECH_PRACTICE_ENABLED !== 'undefined' && SPEECH_PRACTICE_ENABLED;
  let worker, pending, loading, ready = false, sequence = 0, preferLocal = false, assessing = false;
  const listeners = new Set();
  function error(message, code) { const e = new Error(message); e.code = code; return e; }
  function emit(pct, file) { listeners.forEach(fn => fn(pct, file)); }
  function pause() {
    if (!pending) return;
    if (pending.action === 'load' && document.hidden) pending.backgroundRecovery = true;
    if (pending.startedAt === null) return;
    clearTimeout(pending.timer);
    pending.remaining -= performance.now() - pending.startedAt;
    pending.startedAt = null;
  }
  function arm() {
    const p = pending;
    if (!p || document.hidden || p.startedAt !== null || p.backgroundError) return;
    p.startedAt = performance.now();
    p.timer = setTimeout(() => reset(error(p.action === 'load' ? 'Speech preparation timed out; saved files can resume.' : 'Speech assessment timed out', 'SPEECH_TIMEOUT')), Math.max(0, p.remaining));
  }
  function reset(reason) {
    worker?.terminate(); worker = null; ready = false;
    const p = pending; pending = null;
    if (p) { clearTimeout(p.timer); p.reject(reason || error('Speech stopped', 'SPEECH_ABORTED')); }
  }
  function recover(message) {
    const p = pending;
    if (!p || p.action !== 'load' || (!document.hidden && !p.backgroundRecovery)) return false;
    pause(); p.backgroundRecovery = false; p.backgroundError = message;
    worker?.terminate(); worker = null; ready = false;
    if (!document.hidden) resume();
    return true;
  }
  function startWorker() {
    if (worker) return;
    const instance = new Worker('speech_adaptive_worker.js?v=8' + (preferLocal ? '&local=1' : ''), { type: 'module' });
    worker = instance;
    instance.onmessage = e => {
      if (worker !== instance || !pending || e.data.id !== pending.id) return;
      const r = e.data, p = pending;
      if (r.progress !== undefined) { emit(Math.min(99, r.progress), '正在准备朗读功能'); return; }
      if (r.log) { emit(99, '正在启动朗读功能'); return; }
      if (r.error && recover(r.error)) return;
      clearTimeout(p.timer); pending = null;
      if (r.error) p.reject(error(r.error, 'SPEECH_PREPARATION'));
      else p.resolve(r);
    };
    instance.onerror = () => { if (worker === instance && !recover('Speech worker stopped')) reset(error('Speech could not start in this browser', 'SPEECH_ENGINE')); };
  }
  function request(action, data, ms) {
    if (pending) return Promise.reject(error('Previous speech work is still finishing', 'SPEECH_BUSY'));
    return new Promise((resolve, reject) => {
      try {
        startWorker(); pending = { id: ++sequence, action, data, resolve, reject, remaining: ms, startedAt: null, backgroundRecovery: document.hidden };
        arm(); worker.postMessage({ id: pending.id, action, ...data });
      } catch (e) { if (pending) reset(e); else reject(e); }
    });
  }
  function resume() {
    if (!pending) return;
    if (pending.backgroundError) {
      const p = pending; preferLocal = true; p.backgroundError = null; p.backgroundRecovery = false; p.id = ++sequence;
      try { startWorker(); arm(); worker.postMessage({ id: p.id, action: p.action, ...p.data }); } catch (e) { reset(e); }
    } else arm();
  }
  function load(progress) {
    if (!enabled) return Promise.reject(error('Adaptive speech is preview only', 'SPEECH_DISABLED'));
    if (progress) listeners.add(progress);
    if (ready) { if (progress) progress(100, ''); listeners.delete(progress); return Promise.resolve(); }
    if (!loading) loading = request('load', {}, 300000).then(() => { ready = true; emit(100, ''); }).catch(e => { preferLocal = true; reset(e); throw e; }).finally(() => { loading = null; });
    return loading.finally(() => { listeners.delete(progress); });
  }
  function abortable(promise, signal) {
    if (!signal) return promise;
    return new Promise((resolve, reject) => {
      const abort = () => reject(error('Speech cancelled', 'SPEECH_ABORTED'));
      if (signal.aborted) return abort();
      signal.addEventListener('abort', abort, { once: true });
      promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    });
  }
  // Recorder's own WAV format: preserve every sample, including quiet consonants.
  async function pcm(blob) {
    const view = new DataView(await blob.arrayBuffer());
    if (view.byteLength < 44 || view.getUint16(20, true) !== 1 || view.getUint16(22, true) !== 1 || view.getUint16(34, true) !== 16) throw error('Unsupported recording format', 'SPEECH_AUDIO');
    const count = (view.byteLength - 44) / 2, input = new Float32Array(count);
    for (let i = 0; i < count; i++) input[i] = view.getInt16(44 + i * 2, true) / 32768;
    const { resample } = await import('./speech_word_core.js?v=1');
    return resample(input, view.getUint32(24, true));
  }
  async function transcribe(blob, options = {}) {
    if (assessing) throw error('Previous speech work is still finishing', 'SPEECH_BUSY');
    assessing = true;
    const signal = options.signal;
    let abort;
    try {
      // Cancelling a gate detaches its wait but leaves reusable preparation running.
      await abortable(load(options.onProgress), signal);
      const audio = await pcm(blob);
      const initialFocus = options.assessmentProfile === 'phonics1-initial';
      const phonics = options.assessmentProfile === 'phonics1' || initialFocus
        ? await import('./phonics_speech_evidence.js?v=3') : null;
      if (signal?.aborted) throw error('Speech cancelled', 'SPEECH_ABORTED');
      if (phonics) {
        const quiet = phonics.verifyPhonics({ text: '', targetStatus: 'unassessed' }, audio, options.target);
        if (!quiet.phonicsAudioDetected) return quiet;
      }
      if (signal?.aborted) throw error('Speech cancelled', 'SPEECH_ABORTED');
      abort = () => reset(error('Speech cancelled', 'SPEECH_ABORTED'));
      signal?.addEventListener('abort', abort, { once: true });
      const r = await request('assess', { audio, target: options.target, assessmentProfile: options.assessmentProfile }, 10000);
      const result = { text: r.transcript, targetWords: r.targetWords, targetStatus: r.status, pronunciation: r.pronunciation, targetCheckMs: r.totalMs, configuration: r.configuration };
      if (!phonics) return result;
      const verified = phonics.verifyPhonics({ ...result, phonicsInitials: r.phonicsInitials, phonicsWordTranscript: r.phonicsWordTranscript, phonicsWordInitials: r.phonicsWordInitials, phonicsAlternatives: r.phonicsAlternatives }, audio, options.target, initialFocus);
      return r.phonicsSoundUnassessed ? { ...verified, targetStatus: 'unavailable', phonicsSoundUnassessed: true } : verified;
    } finally { signal?.removeEventListener('abort', abort); assessing = false; }
  }
  if (enabled) {
    document.addEventListener('visibilitychange', () => document.hidden ? pause() : resume());
    w.addEventListener('pagehide', e => { if (e.persisted) pause(); else reset(); });
    w.addEventListener('pageshow', e => { if (e.persisted && !document.hidden) resume(); });
  }
  w.AdaptiveSpeech = { enabled, load, transcribe, isBusy: () => assessing, isReady: () => ready,
    resetLoad: () => { if (!assessing && !loading) reset(); } };

  let starAudioCtx = null, starOverlayTimer = null, starCleanupTimer = null;
  function starSvg(filled, size) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', 'M12 2.2l2.92 6.08 6.7.92-4.88 4.7 1.18 6.66L12 17.36 6.08 20.56l1.18-6.66L2.38 9.2l6.7-.92L12 2.2z');
    path.setAttribute('fill', filled ? '#fbbf24' : 'rgba(148,163,184,0.22)');
    path.setAttribute('stroke', filled ? '#d97706' : '#64748b');
    path.setAttribute('stroke-width', '1.4');
    path.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(path);
    return svg;
  }
  function renderInlineStars(stars) {
    const s = Math.max(0, Math.min(3, Math.round(Number(stars) || 0)));
    const wrap = document.createElement('span');
    wrap.className = 'speech-stars-inline';
    wrap.style.cssText = 'display:inline-flex;align-items:center;gap:2px;vertical-align:-3px;';
    wrap.setAttribute('aria-label', s + '颗星');
    for (let i = 0; i < 3; i++) wrap.appendChild(starSvg(i < s, 18));
    return wrap;
  }
  function unlockAudio() {
    try {
      const AC = w.AudioContext || w.webkitAudioContext;
      if (!AC) return null;
      if (!starAudioCtx) starAudioCtx = new AC();
      if (starAudioCtx.state === 'suspended') starAudioCtx.resume().catch(() => {});
      return starAudioCtx;
    } catch (_) { return null; }
  }
  function isSfxMuted() {
    try { return (typeof w.sfxMuted !== 'undefined' && !!w.sfxMuted) || localStorage.getItem('sfxMuted') === '1'; }
    catch (_) { return false; }
  }
  function playChimes(stars) {
    if (isSfxMuted()) return;
    const ctx = unlockAudio();
    if (!ctx) return;
    const freqs = [1046.5, 1318.5, 1568.0];
    const now = ctx.currentTime + 0.02;
    for (let i = 0; i < stars; i++) {
      const t = now + i * 0.22;
      const osc = ctx.createOscillator(), harm = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = 'triangle'; osc.frequency.setValueAtTime(freqs[i], t);
      harm.type = 'sine'; harm.frequency.setValueAtTime(freqs[i] * 2, t);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.linearRampToValueAtTime(0.22, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.27);
      const harmGain = ctx.createGain();
      harmGain.gain.setValueAtTime(0.08, t);
      osc.connect(gain); harm.connect(harmGain); harmGain.connect(gain); gain.connect(ctx.destination);
      osc.start(t); harm.start(t);
      osc.stop(t + 0.28); harm.stop(t + 0.28);
    }
  }
  function ensureStarStyle() {
    if (document.getElementById('speech-star-fx-style')) return;
    const st = document.createElement('style');
    st.id = 'speech-star-fx-style';
    st.textContent =
      '.speech-star-overlay{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:99999;transition:opacity .24s ease,transform .24s ease;}' +
      '.speech-star-overlay.leaving{opacity:0;transform:scale(.88);}' +
      '.speech-star-burst{display:flex;align-items:center;gap:12px;padding:16px 26px;border-radius:24px;background:rgba(15,23,42,.88);border:1.5px solid rgba(251,191,36,.45);box-shadow:0 12px 36px rgba(0,0,0,.45);}' +
      '.speech-star-item{opacity:0;transform:scale(.25);display:inline-flex;}' +
      '.speech-star-item.lit{opacity:1;transform:scale(1);animation:speechStarPop .38s cubic-bezier(.2,1.5,.4,1) forwards;filter:drop-shadow(0 0 8px rgba(251,191,36,.6));}' +
      '.speech-star-item.dim{opacity:.32;transform:scale(.88);transition:opacity .2s ease;}' +
      '@keyframes speechStarPop{0%{opacity:0;transform:scale(.25);}65%{opacity:1;transform:scale(1.28);}100%{opacity:1;transform:scale(1);}}' +
      '@media(prefers-reduced-motion:reduce){.speech-star-item.lit{animation:none;opacity:1;transform:scale(1);}.speech-star-overlay{transition:none;}}';
    document.head.appendChild(st);
  }
  function playStarFx(stars) {
    const s = Math.max(0, Math.min(3, Math.round(Number(stars) || 0)));
    if (s < 1 || !document.body) return;
    ensureStarStyle();
    if (starOverlayTimer) { clearTimeout(starOverlayTimer); starOverlayTimer = null; }
    if (starCleanupTimer) { clearTimeout(starCleanupTimer); starCleanupTimer = null; }
    document.querySelectorAll('.speech-star-overlay').forEach(el => el.remove());
    const overlay = document.createElement('div');
    overlay.className = 'speech-star-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    const burst = document.createElement('div');
    burst.className = 'speech-star-burst';
    const items = [];
    for (let i = 0; i < 3; i++) {
      const item = document.createElement('span');
      item.className = 'speech-star-item' + (i < s ? '' : ' dim');
      item.appendChild(starSvg(i < s, 44));
      burst.appendChild(item);
      items.push(item);
    }
    overlay.appendChild(burst);
    document.body.appendChild(overlay);
    for (let i = 0; i < s; i++) {
      setTimeout(() => { if (overlay.isConnected) items[i].classList.add('lit'); }, i * 220);
    }
    playChimes(s);
    starOverlayTimer = setTimeout(() => {
      overlay.classList.add('leaving');
      starCleanupTimer = setTimeout(() => overlay.remove(), 260);
    }, 1150);
  }
  w.SpeechStarFx = { play: playStarFx, unlockAudio, renderInlineStars };
})(window);
