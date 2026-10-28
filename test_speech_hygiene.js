// Regression tests for the 2026-09-04 speech memory-hygiene + crash-breadcrumb fix.
//
//   1. Recorder.stop() must CLOSE its AudioContext and release references —
//      every sentence gate creates a fresh Recorder; before this fix each one
//      leaked a live AudioContext + stream on iPadOS Safari (hard limit) →
//      WebContent kill ~5 min into a session ("forced refresh").
//   2. csPageHeartbeat must merge sp* (speech breadcrumb) fields so a kill
//      mid-gate reports what the speech pipeline was doing.
//   3. The restart diagnostic must carry those sp* fields through pageState.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = __dirname;
const recorderSrc = fs.readFileSync(path.join(root, 'speech_recorder.js'), 'utf8');
const authSrc = fs.readFileSync(path.join(root, 'frontend_auth.js'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log('PASS:', name); }
  else { fail++; console.log('FAIL:', name); }
}

// --- 1. Recorder lifecycle -------------------------------------------------
function makeRecorderSandbox() {
  const closed = [];
  const stoppedTracks = [];
  class FakeAudioContext {
    constructor(opts) { this.sampleRate = (opts && opts.sampleRate) || 48000; this.destination = {}; }
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    createScriptProcessor() {
      const p = { onaudioprocess: null, connect() {}, disconnect() {} };
      p._emit = (ch) => { if (p.onaudioprocess) p.onaudioprocess({ inputBuffer: { getChannelData: () => ch } }); };
      return p;
    }
    close() { closed.push(this); return Promise.resolve(); }
  }
  const fakeStream = { getTracks: () => [{ stop: () => stoppedTracks.push(1) }] };
  const sandbox = {
    console,
    window: {},
    navigator: { mediaDevices: { getUserMedia: () => Promise.resolve(fakeStream) } },
    AudioContext: FakeAudioContext,
    webkitAudioContext: null,
    URL,
    Blob: class { constructor(parts) { this._buf = parts && parts[0]; } },
    performance: { now: () => Date.now() },
    setTimeout, clearTimeout,
  };
  sandbox.window.AudioContext = FakeAudioContext;
  vm.createContext(sandbox);
  vm.runInContext(recorderSrc, sandbox);
  return { sandbox, closed, stoppedTracks, FakeAudioContext, fakeStream };
}

(async () => {
  // --- 1a. stop() closes the AudioContext and nulls graph references -------
  {
    const { sandbox, closed } = makeRecorderSandbox();
    const rec = new sandbox.window.Recorder();
    await rec.start();
    ok('recorder: AudioContext created on start', closed.length === 0);
    // feed ~1.2s of audible PCM (16kHz after our fake ctx reports 16000)
    const ctx = rec.audioCtx;
    const proc = rec.processor;
    for (let i = 0; i < 40; i++) proc._emit(new Float32Array(4096).map(() => Math.random() * 0.5));
    const blob = await rec.stop();
    ok('recorder: stop() returns a WAV blob', !!blob && !!blob._buf);
    ok('recorder: stop() CLOSES the AudioContext (leak fix)', closed.length === 1 && closed[0] === ctx);
    ok('recorder: graph references released', rec.audioCtx === null && rec.source === null && rec.processor === null && rec.stream === null);
    ok('recorder: raw PCM chunks released after encode', rec._chunks.length === 0);
    // second stop is a no-op, must not double-close
    await rec.stop();
    ok('recorder: double stop() does not double-close', closed.length === 1);
  }

  // --- 1b. recording=false guard: chunks after stop are not captured --------
  {
    const { sandbox } = makeRecorderSandbox();
    const rec = new sandbox.window.Recorder();
    await rec.start();
    const proc = rec.processor;
    proc._emit(new Float32Array(4096).fill(0.4));
    await rec.stop();
    const chunksBefore = rec._chunks.length;
    proc._emit(new Float32Array(4096).fill(0.4)); // late callback after stop
    ok('recorder: no capture after stop', rec._chunks.length === chunksBefore && rec._chunks.length === 0);
  }

  // --- 2+3. sp* heartbeat merge + restart diagnostic passthrough ------------
  {
    const { sandbox, stoppedTracks, fakeStream, closed } = makeRecorderSandbox();
    let allow;
    sandbox.navigator.mediaDevices.getUserMedia = () => new Promise(resolve => { allow = resolve; });
    const rec = new sandbox.window.Recorder();
    const pending = rec.start().catch(error => error.name);
    rec.cancel(); allow(fakeStream);
    ok('recorder: late permission after cancellation is rejected', await pending === 'AbortError');
    ok('recorder: late permission stops its stream without opening a context', stoppedTracks.length === 1 && closed.length === 0 && rec.stream === null);
  }
  {
    const { sandbox, stoppedTracks, closed } = makeRecorderSandbox();
    const rec = new sandbox.window.Recorder(); await rec.start();
    const proc = rec.processor; proc._emit(new Float32Array(4096).fill(.3));
    rec.cancel(); rec.cancel(); proc._emit(new Float32Array(4096).fill(.3));
    ok('recorder: discard closes the context and tracks exactly once', closed.length === 1 && stoppedTracks.length === 1);
    ok('recorder: discard releases PCM and ignores late audio', rec._chunks.length === 0 && rec.audioCtx === null && !rec.recording);
  }
  {
    let store = {};
    const sandbox = {
      console,
      API_BASE_URL: 'http://test.local/api',
      localStorage: {
        getItem: (k) => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: (k) => { delete store[k]; }
      },
      navigator: { userAgent: 'test', platform: 'test', maxTouchPoints: 0 },
      document: { addEventListener() {}, getElementById: () => null },
      window: { addEventListener() {}, location: { search: '' } },
      setTimeout, clearTimeout,
      performance: { now: () => Date.now() },
      fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
      getAppKey: () => Promise.resolve('k'),
      Blob: class { constructor(p) { this._t = String(p); } },
      URLSearchParams,
      isTestMode: false,
      authActiveUser: null,
    };
    vm.createContext(sandbox);
    vm.runInContext(authSrc, sandbox);
    sandbox.csNewPageSession();
    // simulate speech_ui breadcrumbs during a gate
    sandbox.csPageHeartbeat({ spGate: 1, spFails: 1 });
    sandbox.csPageHeartbeat({ spRec: 1 });       // recording started
    sandbox.csPageHeartbeat({ spRec: 0, spLastMs: 2400 }); // transcribe done
    const hb = JSON.parse(store['csPageHeartbeat']);
    ok('heartbeat: sp* fields merge across calls',
       hb.state.spGate === 1 && hb.state.spFails === 1 && hb.state.spLastMs === 2400);
    ok('heartbeat: later spRec merge wins (0 after stop)', hb.state.spRec === 0);
    // restart diagnostic carries sp* through pageState
    sandbox.csPageHeartbeat({ mode: 'study', round: 'E' }); // normal activity after gate
    const now = Date.now();
    store['csPageHeartbeat'] = JSON.stringify({ ps: 'ps_dead', ts: now - 60000, loadTs: now - 300000, v: '2026-09-04a', state: { spGate: 1, spFails: 2, spLastMs: 2100, mode: 'study' } });
    sandbox.csRestartDetectionDone = false;
    vm.runInContext('analyticsQueue = [];', sandbox);
    sandbox.csDetectRestartAndQueueDiagnostic();
    const queue = vm.runInContext('analyticsQueue', sandbox);
    const diag = queue.find(e => e.diagnostic === 'restart');
    ok('restart diagnostic: sp* fields ride pageState', !!diag && diag.pageState.spGate === 1 && diag.pageState.spFails === 2 && diag.pageState.spLastMs === 2100);
  }

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('TEST CRASH:', e); process.exit(1); });
