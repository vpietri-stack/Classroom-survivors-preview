/* =========================================================================
 * speech_preload.js  —  invisible, eager model preload.
 * Kicks off the Whisper download+compile on FIRST page load (before login),
 * so the model is ready by the time the student reaches a speech round.
 * Exposes window.SpeechStatus for the UI to read (Round B / game mode).
 * ========================================================================= */
(function (global) {
  'use strict';

  // Preview uses the same single adaptive worker as its word/sentence gates.
  // Do not load a second legacy pipeline alongside it on memory-limited tablets.
  const engine = global.AdaptiveSpeech && global.AdaptiveSpeech.enabled ? global.AdaptiveSpeech : global.LocalEngine;

  const SpeechStatus = {
    state: 'idle',        // idle | loading | preparing | ready | error | unsupported
    pct: 0,
    file: '',
    message: '',
    supported: !!(engine && global.Recorder && global.Recorder.isSupported && global.Recorder.isSupported()),
    _started: false,

    isReady: function () { return this.state === 'ready'; },

    // Begin preload (idempotent).
    start: function () {
      if (this._started) return;
      if (!engine) { this.state = 'error'; this.message = 'engine missing'; return; }
      this._started = true;

      if (!this.supported) {
        this.state = 'unsupported';
        this.message = '麦克风不可用（请在系统/微信设置中允许麦克风）';
        if (global.__speechLog) global.__speechLog('Speech: mic unsupported on this device');
        return;
      }

      this.state = 'loading';
      try {
        engine.load((pct, file) => {
          this.pct = pct;
          this.file = file || '';
          this.state = pct >= 100 ? 'preparing' : 'loading';
        }).then(function () {
          this.state = 'ready';
          this.pct = 100;
          this.message = '';
        }.bind(this)).catch(function (e) {
          this.state = 'error';
          this.message = (e && e.message) || 'model load failed';
          if (global.__speechLog) global.__speechLog('Speech load error: ' + this.message);
        }.bind(this));
      } catch (e) {
        this.state = 'error';
        this.message = (e && e.message) || 'preload failed';
      }
    },

    // Manual retry (wired to the debug panel's Retry button). Clears the engine's
    // in-flight load state and re-runs start(), so a student can recover from a
    // transient download failure without a full page reload.
    retry: function () {
      if (engine && typeof engine.resetLoad === 'function') {
        engine.resetLoad();
      }
      this._started = false;
      this.state = 'loading';
      this.pct = 0;
      this.file = '';
      this.message = '';
      this.start();
    }
  };

  global.SpeechStatus = SpeechStatus;

  // Start as early as possible — page parsed, before login.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { SpeechStatus.start(); }, { once: true });
  } else {
    SpeechStatus.start();
  }
})(window);
