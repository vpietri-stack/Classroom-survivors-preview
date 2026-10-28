/* =========================================================================
 * recorder.js  —  microphone capture, target format: 16 kHz / 16-bit / mono PCM
 * Wrapped so app.js never touches getUserMedia/MediaRecorder directly.
 * Works in Safari, Android Chrome, and (partially) WeChat in-app browser.
 * ========================================================================= */
(function (global) {
  'use strict';

  const SAMPLE_RATE = 16000;

  class Recorder {
    constructor() {
      this.audioCtx = null;
      this.stream = null;
      this.source = null;
      this.processor = null;
      this.recording = false;
      this._chunks = [];      // Float32Array chunks
      this._recorders = [];    // fallback MediaRecorder handles
      this.level = 0;          // live mic level 0..1 (RMS), for UI feedback
      this._generation = 0;
    }

    static isSupported() {
      return !!(global.AudioContext || global.webkitAudioContext) &&
             !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    }

    async start() {
      if (this.recording) return;
      const generation = ++this._generation;
      this._chunks = [];

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
          // NOTE: do NOT set sampleRate here — browsers ignore/round it and the
          // context sample rate may differ. We capture whatever we get and the
          // engine resamples to 16 kHz; the WAV header records the TRUE rate.
        }
      });
      // Permission can resolve after the exercise has been left. Never open
      // an AudioContext or leave a live microphone for that discarded request.
      if (generation !== this._generation) {
        stream.getTracks().forEach(t => t.stop());
        const error = new Error('Recording cancelled'); error.name = 'AbortError'; throw error;
      }
      this.stream = stream;

      try {
      // Prefer an explicit 16 kHz context (best for ASR); fall back to default.
      const Ctx = global.AudioContext || global.webkitAudioContext;
      try {
        this.audioCtx = new Ctx({ sampleRate: SAMPLE_RATE });
      } catch (_) {
        this.audioCtx = new Ctx();
      }
      this._actualRate = this.audioCtx.sampleRate;   // may be 44100/48000

      const src = this.audioCtx.createMediaStreamSource(this.stream);
      this.source = src;

      // ScriptProcessor is deprecated but universally supported (incl. Safari/WeChat).
      const processor = this.audioCtx.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = (e) => {
        if (!this.recording) return;
        const ch = e.inputBuffer.getChannelData(0);
        this._chunks.push(new Float32Array(ch));
        // live RMS level for UI feedback (0..1, lightly amplified for visible motion)
        let sum = 0;
        for (let i = 0; i < ch.length; i++) sum += ch[i] * ch[i];
        const rms = Math.sqrt(sum / ch.length);
        this.level = Math.min(1, rms * 4);
      };
      src.connect(processor);
      processor.connect(this.audioCtx.destination);
      this.processor = processor;

      this.recording = true;
      } catch (error) { this.cancel(); throw error; }
    }

    cancel() {
      this._generation++;
      this.recording = false;
      this.level = 0;
      try { this.source.disconnect(); } catch (_) {}
      try { this.processor.disconnect(); } catch (_) {}
      if (this.stream) this.stream.getTracks().forEach(t => t.stop());
      if (this.audioCtx) { try { const closing = this.audioCtx.close(); if (closing && closing.catch) closing.catch(function () {}); } catch (_) {} }
      this.audioCtx = this.source = this.processor = this.stream = null;
      this._chunks = [];
    }

    async stop() {
      if (!this.recording) return null;
      this.recording = false;
      this.level = 0;

      try { this.source.disconnect(); } catch (_) {}
      try { this.processor.disconnect(); } catch (_) {}
      if (this.stream) this.stream.getTracks().forEach(t => t.stop());

      // MEMORY HYGIENE (2026-09-04, Doris iPad crash investigation):
      // iPadOS Safari enforces a hard limit on live AudioContexts. Every
      // sentence gate creates a fresh Recorder → a fresh AudioContext +
      // getUserMedia stream. Without an explicit close(), the context stays
      // alive holding its (now stopped) stream until GC *feels like it* —
      // field pattern: ~10 gates/session → ~10 live contexts → WebContent
      // process killed ~5 min into a session ("forced refresh"). Closing
      // synchronously here is safe: all audio work (merge/VAD/WAV) happens
      // on already-captured PCM, not on the live graph.
      if (this.audioCtx && typeof this.audioCtx.close === 'function') {
        try { this.audioCtx.close(); } catch (_) {}
        this.audioCtx = null;
      }
      this.source = null;
      this.processor = null;
      this.stream = null;

      // Trim speechless lead (Android echo tap + dead air) via adaptive VAD:
      // keep everything from the first meaningful-amplitude window onward.
      const pcm = mergeChunks(this._chunks);
      const rate = this._actualRate || SAMPLE_RATE;
      const start = findSpeechStart(pcm, rate);
      const trimmed = pcm.slice(start);
      const wav = encodeWav(trimmed, rate);
      this._chunks = []; // release raw PCM after the WAV is encoded
      return wav;
    }
  }

  function mergeChunks(chunks) {
    let len = 0;
    chunks.forEach(c => len += c.length);
    const out = new Float32Array(len);
    let off = 0;
    chunks.forEach(c => { out.set(c, off); off += c.length; });
    return out;
  }

  // Adaptive front-trim: find where speech actually starts instead of applying
  // a fixed millisecond clip. Scans the first 2 s for the first audio window
  // that exceeds a threshold (12% of the recording's peak amplitude, floor 0.015).
  // Uses 50 ms window (down from 100 ms) to better preserve leading consonants
  // on short words like "square" (~300 ms) which can lose ~1/3 of their duration
  // with a 100 ms window.
  function findSpeechStart(samples, rate) {
    var windowMs = 50;
    var windowSize = Math.round(rate * windowMs / 1000);
    if (windowSize < 1) return 0;
    var maxScan = Math.min(samples.length, Math.round(rate * 2));

    var peak = 0;
    for (var i = 0; i < maxScan; i++) {
      var abs = Math.abs(samples[i]);
      if (abs > peak) peak = abs;
    }
    var threshold = Math.max(0.015, peak * 0.12);
    var hop = Math.max(1, Math.floor(windowSize / 2));

    for (var i = 0; i < maxScan; i += hop) {
      var sum = 0;
      var end = Math.min(i + windowSize, maxScan);
      var len = end - i;
      for (var j = i; j < end; j++) sum += samples[j] * samples[j];
      if (Math.sqrt(sum / len) > threshold) return i;
    }
    return 0;
  }

  function encodeWav(samples, sampleRate) {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);
    const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i)); };

    writeStr(0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);          // PCM
    view.setUint16(22, 1, true);          // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeStr(36, 'data');
    view.setUint32(40, samples.length * 2, true);

    let off = 44;
    for (let i = 0; i < samples.length; i++, off += 2) {
      let s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }
    return new Blob([view], { type: 'audio/wav' });
  }

  global.Recorder = Recorder;
})(window);
