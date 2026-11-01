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
    const instance = new Worker('speech_adaptive_worker.js?v=5' + (preferLocal ? '&local=1' : ''), { type: 'module' });
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
      if (signal?.aborted) throw error('Speech cancelled', 'SPEECH_ABORTED');
      abort = () => reset(error('Speech cancelled', 'SPEECH_ABORTED'));
      signal?.addEventListener('abort', abort, { once: true });
      const r = await request('assess', { audio, target: options.target }, 5000);
      return { text: r.transcript, targetWords: r.targetWords, targetStatus: r.status, targetCheckMs: r.totalMs, configuration: r.configuration };
    } finally { signal?.removeEventListener('abort', abort); assessing = false; }
  }
  if (enabled) {
    document.addEventListener('visibilitychange', () => document.hidden ? pause() : resume());
    w.addEventListener('pagehide', e => { if (e.persisted) pause(); else reset(); });
    w.addEventListener('pageshow', e => { if (e.persisted && !document.hidden) resume(); });
  }
  w.AdaptiveSpeech = { enabled, load, transcribe, isBusy: () => assessing, isReady: () => ready,
    resetLoad: () => { if (!assessing && !loading) reset(); } };
})(window);
