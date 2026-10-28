/* =========================================================================
 * local-engine.js  —  runs Whisper TINY (multilingual) entirely in the browser.
 * No server, no API key, no cost. Audio never leaves the device.
 * Uses Transformers.js v3 with the WASM backend (works on GitHub Pages,
 * no SharedArrayBuffer / COOP-COEP required, and survives WeChat's
 * limited service-worker support).
 * ========================================================================= */
(function (global) {
  'use strict';

  // ---- Model-weight hosting: ModelScope (mainland CDN), then GitHub proxy, then same-origin.
  // Constraint map (all verified empirically):
  //   • ModelScope (modelscope.cn, Alibaba) mirrors Xenova/whisper-tiny.en on a
  //     mainland CDN: CORS:*, no auth, no size cap, ~2.4 MB/s measured from CN
  //     (2026-07-27) → the fastest source for students without a VPN.
  //   • Gitee Pages は discontinued.
  //   • hf-mirror redirects big files back to the blocked huggingface.co.
  //   • jsDelivr caps /gh/ files at 20 MB → 403 on our ~30 MB decoder.
  //   • gh-proxy.com serves the FULL 30 MB file with CORS:* and no size cap.
  //   • ghproxy.net measured at ~0.01 MB/s (2026-07-27) — dead, removed.
  // MIME caveat: proxies serve .js/.mjs as text/plain, which the browser
  // REFUSES to `import()`. So the ESM lib + ORT wasm glue (which ARE imported) stay
  // same-origin (GitHub Pages, correct MIME, already confirmed working in WeChat).
  // Only the model weights — the 41 MB bottleneck, fetched not imported — get proxied.
  const MODEL_ID = 'whisper-tiny.en';

  // ---- IndexedDB cache for model weights (eliminates repeat downloads on WeChat) ----
  // WeChat aggressively evicts the browser HTTP cache, so students re-download the
  // ~41 MB model on every pageload. IndexedDB persists across app restarts. We store
  // each model file as an ArrayBuffer keyed by basename + unique cache-bust token.
  const DB_NAME = 'whisper-model-cache';
  const DB_VERSION = 1;
  const CACHE_KEY = 'whisper-tiny.en-model-v1'; // bump when model files change

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('files')) {
          db.createObjectStore('files', { keyPath: 'name' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function cacheGet(name) {
    try {
      const db = await openDB();
      return new Promise((resolve) => {
        const tx = db.transaction('files', 'readonly');
        const req = tx.objectStore('files').get(CACHE_KEY + '/' + name);
        req.onsuccess = () => { resolve(req.result ? req.result.data : null); };
        req.onerror = () => resolve(null);
      });
    } catch (_) { return null; }
  }

  async function cachePut(name, data) {
    try {
      const db = await openDB();
      return new Promise((resolve) => {
        const tx = db.transaction('files', 'readwrite');
        tx.objectStore('files').put({ name: CACHE_KEY + '/' + name, data });
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch (_) {}
  }

  // Set of model file basenames we need (stored under MODELS_DIR on disk):
  //   config.json (probed by pickSource, small), quantized ONNX files (the big ones).
  const MODEL_FILES = ['config.json', 'encoder_model_quantized.onnx', 'decoder_model_merged_quantized.onnx'];

  // Intercept fetch() for model files: serve from IndexedDB if cached, otherwise
  // download with a per-attempt timeout and automatic mirror fallback.
  //
  // Why this matters (GFW): pickSource() only probes the tiny config.json, so a
  // mirror can "win" the probe yet STALL on the ~41 MB of weights. Without a
  // timeout the download hangs forever and SpeechStatus stays 'loading' (speech
  // silently never appears). Here each attempt is bounded by MIRROR_TIMEOUT_MS;
  // on timeout/error we rewrite the URL to the next mirror and retry, cycling
  // through all of MODEL_SOURCES once before giving up.
  const MIRROR_TIMEOUT_MS = 90000; // per-file, per-mirror; tolerates slow GFW links but aborts true stalls
  let mirrorIdx = 0;               // index into MODEL_SOURCES; seeded by pickSource(), advanced on fallback

  // Guard the model compile/init phase (after the download finishes). On some
  // browsers (notably Chrome on certain devices) the ONNX/WASM session creation
  // can hang indefinitely; without a timeout SpeechStatus sits at 'preparing'
  // forever and speech silently never appears. Bound it, retry once, then surface
  // an error (the debug panel's Retry button recovers without a page reload).
  //
  // Strategy: first attempt gets a LONG timeout (300s) because mobile WASM compile
  // is slow on cold start (~170s observed). Retries use a shorter timeout (120s)
  // since the runtime is already "warm". A heartbeat log every 20s reassures the
  // user (and the debug panel) that compilation is progressing, not frozen.
  const COMPILE_TIMEOUT_FIRST_MS = 300000;  // 5 min for cold compile
  const COMPILE_TIMEOUT_RETRY_MS = 120000;  // 2 min for warm retries
  const MAX_COMPILE_RETRIES = 2;            // up to 3 total attempts
  const COMPILE_HEARTBEAT_MS = 20000;       // log "still working" every 20s

  // Reject if `promise` doesn't settle within `ms` (a hung compile never resolves).
  function withTimeout(promise, ms, label) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(label + ' timed out after ' + Math.round(ms / 1000) + 's')), ms);
      promise.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
    });
  }

  // Portion of a model-file URL starting at 'models/<MODEL_ID>/...' (mirror-independent).
  function modelRelPath(urlStr) {
    const marker = 'models/' + MODEL_ID + '/';
    const i = urlStr.indexOf(marker);
    return i >= 0 ? urlStr.slice(i) : null;
  }

  // fetch with a hard timeout (aborts a stalled body download, not just the headers).
  function fetchWithTimeout(url, init, ms) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    const merged = Object.assign({}, init || {}, { signal: ctrl.signal });
    return globalThis.__origFetch(url, merged).finally(() => clearTimeout(timer));
  }

  // Build the download URL for a model file on a given source. Sources that
  // don't mirror our repo layout (e.g. ModelScope) provide a url() rewriter;
  // the rest simply prepend their base to the repo-relative path.
  function srcUrl(src, relPath) {
    return src.url ? src.url(relPath) : src.base + relPath;
  }

  // Download a model file, falling back across mirrors (starting at mirrorIdx).
  // On success, mirrorIdx is left pointing at the working mirror so subsequent
  // files prefer it. Throws only if EVERY mirror fails.
  async function fetchModelFileWithFallback(relPath) {
    let lastErr;
    for (let attempt = 0; attempt < MODEL_SOURCES.length; attempt++) {
      const idx = (mirrorIdx + attempt) % MODEL_SOURCES.length;
      const src = MODEL_SOURCES[idx];
      const url = srcUrl(src, relPath);
      const file = relPath.split('/').pop();
      log(`Engine: fetching ${file} via ${src.name} …`);
      try {
        const resp = await fetchWithTimeout(url, {}, MIRROR_TIMEOUT_MS);
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        mirrorIdx = idx; // this mirror works — prefer it for the remaining files
        return resp;
      } catch (e) {
        lastErr = e;
        const next = MODEL_SOURCES[(idx + 1) % MODEL_SOURCES.length];
        log(`Engine: ${file} failed on ${src.name} (${(e && e.message) || e}) → trying ${next.name}`);
      }
    }
    throw new Error('all mirrors failed for ' + relPath + ': ' + ((lastErr && lastErr.message) || lastErr));
  }

  function patchFetchForModel() {
    const origFetch = globalThis.fetch.bind(globalThis);
    // API bypass (2026-09-16, "Val PC log"): every analytics/network failure
    // in the log stacks through patchedFetch — the model cache layer must
    // NEVER see API traffic, so a cache bug can never break saving. API calls
    // (same-origin /saveAnalytics, /login, /updateStudent, model-scope
    // allow-list below) go straight to the raw fetch.
    globalThis.fetch = async function patchedFetch(url, init) {
      const urlStr = (typeof url === 'string' ? url : url.url || url.toString());
      if (/\/api\/(saveAnalytics|login|updateStudent|getStudents|changePassword)/.test(urlStr)) {
        return origFetch(url, init);
      }
      // Only intercept model-file requests.
      const rel = modelRelPath(urlStr);
      if (rel) {
        const name = urlStr.split('/').pop(); // basename
        const cached = await cacheGet(name);
        if (cached) {
          log(`Engine: ${name} served from IndexedDB cache`);
          // Return a Response with the cached ArrayBuffer (no network trip).
          return new Response(cached, { status: 200, headers: { 'Content-Type': 'application/octet-stream' } });
        }
        // First-time download: fetch with timeout + mirror fallback, then cache.
        const resp = await fetchModelFileWithFallback(rel);
        if (resp.ok) {
          const blob = await resp.clone().arrayBuffer();
          // Fire-and-forget cache write (don't block the pipeline load).
          cachePut(name, blob);
        }
        return resp;
      }
      return origFetch(url, init);
    };
  }

  function unPatchFetch() {
    globalThis.fetch = globalThis.__origFetch || globalThis.fetch;
  }
  // Store original fetch so we can unpatch cleanly if needed (currently we leave
  // the patch in place — subsequent loads will short-circuit to IndexedDB).
  if (!globalThis.__origFetch) globalThis.__origFetch = globalThis.fetch;

  // Resolve WHICH GitHub Pages repo we are running on, so the proxies point at
  // the SAME repo that's serving the page (promotion-safe: the same code works
  // on the preview site AND the live site without editing at deploy time).
  // The site is served from https://vpietri-stack.github.io/<repo>/ (a user/org
  // Pages host + project path), so we derive the repo from the pathname. If the
  // host isn't *.github.io (local dev / custom domain), we skip the proxies and
  // rely on the same-origin fallback below.
  function rawRepoBase() {
    const h = (location.hostname || '').toLowerCase();
    if (!h.endsWith('.github.io')) return null; // local dev / unknown host → same-origin only
    const owner = h.slice(0, -'.github.io'.length); // e.g. 'vpietri-stack'
    if (!owner) return null;
    // First pathname segment is the repo, e.g. '/Classroom-survivors-preview/' → 'Classroom-survivors-preview'.
    const repo = (location.pathname || '').split('/').filter(Boolean)[0];
    if (!repo) return null;
    return `raw.githubusercontent.com/${owner}/${repo}/main/`;
  }
  const RAW = rawRepoBase();

  // ModelScope mirrors the upstream HF repo (Xenova/whisper-tiny.en) with the
  // same file layout our models/ folder uses, just without the models/<id>/
  // prefix — so rewrite 'models/whisper-tiny.en/onnx/x.onnx' → '<base>/onnx/x.onnx'.
  const MS_BASE = 'https://modelscope.cn/models/Xenova/' + MODEL_ID + '/resolve/master/';
  const MS_SOURCE = {
    name: 'modelscope',
    url: (relPath) => MS_BASE + relPath.slice(('models/' + MODEL_ID + '/').length),
  };
  const SAME_ORIGIN = { name: 'same-origin', base: new URL('./', location.href).href };

  const MODEL_SOURCES = RAW
    // GitHub Pages host: same-origin is unreliable in CN, so remote mirrors first.
    ? [
        MS_SOURCE,                                                          // CN mainland CDN (fastest)
        { name: 'gh-proxy', base: `https://gh-proxy.com/https://${RAW}` },  // CN GitHub proxy
        SAME_ORIGIN,                                                        // GitHub Pages fallback
      ]
    // Local dev / other hosts: serve from disk/origin first, ModelScope as backstop
    // (also covers future hosts that cap file size below our 30 MB decoder).
    : [SAME_ORIGIN, MS_SOURCE];

  // ---- Speech runtime (Transformers.js bundle + matched ORT wasm) ----------
  // These files are IMPORTED (ES modules), so they need a real JS/wasm MIME
  // type — the CN proxies serve text/plain, so unlike the fetched model
  // weights they can NEVER go through gh-proxy/ModelScope.
  //
  // WHY TWO LOCATIONS (compile-cache stability — read before changing):
  // Browsers cache the COMPILED machine code of the 23MB ORT wasm alongside
  // its HTTP cache entry. GitHub Pages ETags are hex(deploy-mtime)-hex(size),
  // so EVERY app deploy re-stamps every file → the browser sees "changed",
  // discards the compiled code, and each device pays a ~160s recompile
  // (field-measured 2026-07). The separate Classroom-survivors-lib repo is
  // deployed ONCE and then never pushed again → stable ETags → the compile
  // cache survives app deploys. GitHub project sites share the
  // vpietri-stack.github.io origin, so those URLs are still same-origin here.
  //
  // RULES (mirrored in that repo's README — keep both in sync):
  //   • NEVER edit files in Classroom-survivors-lib in place.
  //   • Upgrading Transformers.js/onnxruntime: the JS bundle and the wasm are
  //     a version-locked PAIR — put the complete new pair in a NEW tjs-vN/
  //     folder there, push once, then bump STABLE_LIB_BASE below.
  //   • KEEP the local lib/ copies in this repo — pickLibBase() probes the
  //     stable repo and falls back to them automatically, so a broken/deleted
  //     lib repo degrades to today's behavior instead of breaking speech.
  const STABLE_LIB_BASE = 'https://vpietri-stack.github.io/Classroom-survivors-lib/tjs-v3/';
  const LOCAL_LIB_URL   = new URL('lib/transformers.min.js?v=4', location.href).href;
  const LOCAL_WASM_PATH = new URL('lib/wasm/', location.href).href;

  // Decide where to import the runtime from: the stable lib repo when we're on
  // GitHub Pages AND it answers quickly; this repo's own lib/ otherwise (local
  // dev, other hosts, or lib repo unreachable). The probe hits the small .mjs
  // (48KB) so a missing lib repo can never stall the speech load.
  async function pickLibBase() {
    const h = (location.hostname || '').toLowerCase();
    if (!h.endsWith('.github.io')) return null; // non-Pages host → local copy
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6000);
      const r = await fetch(STABLE_LIB_BASE + 'wasm/ort-wasm-simd-threaded.jsep.mjs',
        { method: 'HEAD', signal: ctrl.signal });
      clearTimeout(timer);
      if (r.ok) return STABLE_LIB_BASE;
      log('Engine: stable lib repo returned ' + r.status + ' → same-origin lib');
    } catch (_) {
      log('Engine: stable lib repo unreachable → same-origin lib');
    }
    return null;
  }

  let transcriber = null;     // cached pipeline
  let InterruptableStoppingCriteria = null;
  let transcriptionBusy = false;
  let inferenceRuntime = null, targetCheckerLoading = null;
  function targetChecker() {
    if (!targetCheckerLoading) {
      targetCheckerLoading = (async function () {
        const controller = new AbortController(); let timer;
        try {
          const parts = await Promise.race([Promise.all([
            import(new URL('speech_target.js?v=2026-10-28b', location.href).href),
            fetch(new URL('speech_target_data.json?v=2026-10-28b', location.href).href, { signal: controller.signal }).then(function (response) { if (!response.ok) throw new Error('Target hints unavailable'); return response.json(); })
          ]), new Promise(function (_, reject) { timer = setTimeout(function () { controller.abort(); reject(new Error('Target hints timed out')); }, 12000); })]);
          return parts[0].createTargetChecker(transcriber, inferenceRuntime, parts[1]);
        } finally { clearTimeout(timer); }
      })().catch(function (error) { targetCheckerLoading = null; throw error; });
    }
    return targetCheckerLoading;
  }
  function waitForTarget(promise, signal) {
    if (!signal) return promise;
    return new Promise(function (resolve, reject) {
      const abort = function () { signal.removeEventListener('abort', abort); const error = new Error('Target checking cancelled'); error.name = 'AbortError'; reject(error); };
      if (signal.aborted) return abort(); signal.addEventListener('abort', abort, { once: true });
      promise.then(function (value) { signal.removeEventListener('abort', abort); resolve(value); }, function (error) { signal.removeEventListener('abort', abort); reject(error); });
    });
  }
  let loading = null;          // in-flight promise
  let chosen = null;           // winning weight source {name, base} after probe

  // Reset all in-flight load state so SpeechStatus.retry() can start fresh
  // (re-probes mirrors, re-downloads). Called only on a manual retry.
  function resetLoad() {
    if (transcriptionBusy) return false;
    if (targetCheckerLoading) targetCheckerLoading.then(function (checker) { checker.dispose(); }, function () {});
    targetCheckerLoading = null;
    transcriber = null;
    loading = null;
    chosen = null;
    mirrorIdx = 0;
  }

  function log(msg) { if (global.__speechLog) global.__speechLog(msg); }

  // Probe weight sources in order; first whose config.json answers within timeout wins.
  async function pickSource() {
    if (chosen) return chosen;
    for (const src of MODEL_SOURCES) {
      const url = srcUrl(src, `models/${MODEL_ID}/config.json`);
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 6000);
        const r = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
        clearTimeout(timer);
        if (r.ok) { chosen = src; mirrorIdx = MODEL_SOURCES.indexOf(src); log(`Engine: model host → ${src.name}`); return src; }
        log(`Engine: ${src.name} returned ${r.status}, trying next…`);
      } catch (_) {
        log(`Engine: ${src.name} unreachable, trying next…`);
      }
    }
    chosen = MODEL_SOURCES[MODEL_SOURCES.length - 1];
    log('Engine: all proxies failed probe; using ' + chosen.name);
    return chosen;
  }

  async function load(onProgress) {
    if (transcriber) return transcriber;
    if (loading) return loading;

    const loadT0 = performance.now(); // for the spCompileMs crash breadcrumb
    loading = (async () => {
      const src = await pickSource();
      // localModelPath only shapes the URLs transformers.js *requests*; the
      // patched fetch intercepts anything containing models/<MODEL_ID>/ and
      // reroutes it through the mirror system, so a same-origin-shaped base
      // works for every source (including base-less ones like ModelScope).
      const MODEL_DIR = (src.base || SAME_ORIGIN.base) + 'models/';

      // Patch global fetch so model files are served from IndexedDB when cached,
      // and otherwise downloaded with a timeout + mirror fallback. The cache
      // eliminates the 41 MB download on repeat visits (critical for WeChat, which
      // aggressively evicts the browser HTTP cache); the fallback stops a stalling
      // mirror from hanging the load forever on first download (GFW).
      patchFetchForModel();

      log('Engine: importing transformers.js …');
      // Prefer the never-redeployed lib repo (stable ETags keep the browser's
      // compiled-wasm cache valid across app deploys → no ~160s recompile).
      const libBase = await pickLibBase();
      let wasmPath = libBase ? libBase + 'wasm/' : LOCAL_WASM_PATH;
      let pipeline, env, runtime;
      try {
        runtime = await import(libBase ? libBase + 'transformers.min.js' : LOCAL_LIB_URL);
        ({ pipeline, env } = runtime);
        log('Engine: runtime lib → ' + (libBase ? 'stable lib repo' : 'same-origin'));
      } catch (e) {
        if (!libBase) throw e; // local import failing is fatal (nothing else to try)
        // Stable repo answered the probe but the import still failed — fall
        // back to the matched local pair (lib + wasm must switch TOGETHER).
        log('Engine: stable lib import failed (' + ((e && e.message) || e) + ') → same-origin lib');
        runtime = await import(LOCAL_LIB_URL);
        ({ pipeline, env } = runtime);
        wasmPath = LOCAL_WASM_PATH;
      }

      InterruptableStoppingCriteria = runtime.InterruptableStoppingCriteria || null;
      inferenceRuntime = runtime;
      // Weights from the chosen (fast, CN-reachable) mirror; lib+wasm same-origin.
      // allowRemoteModels stays OFF so the blocked huggingface.co is NEVER contacted.
      env.allowLocalModels = true;
      env.allowRemoteModels = false;
      env.localModelPath = MODEL_DIR;
      env.backends.onnx.wasm.proxy = false;
      env.backends.onnx.wasm.wasmPaths = wasmPath;

      log('Engine: loading ' + MODEL_ID + ' from ' + src.name + ' (quantized, wasm) — first load ~41 MB …');
      const pipelineOpts = {
        device: 'wasm',
        dtype: { encoder_model: 'q8', decoder_model_merged: 'q8' },
        progress_callback: (p) => {
          if (onProgress && p.status === 'progress') {
            const pct = p.total ? Math.round((p.loaded / p.total) * 100) : 0;
            onProgress(pct, p.file || '');
          }
        }
      };
      // Download finishes at 100%; the compile/init phase that follows is silent and
      // (on some browsers) can hang — narrate it and bound it with a timeout+retry.
      log('Engine: download complete, compiling model (this can take a while on first load) …');
      let pipe;
      for (let attempt = 0; attempt <= MAX_COMPILE_RETRIES; attempt++) {
        const timeoutMs = attempt === 0 ? COMPILE_TIMEOUT_FIRST_MS : COMPILE_TIMEOUT_RETRY_MS;
        // Heartbeat: log every 20s so the user/debug panel knows compile is progressing.
        let heartbeatCount = 0;
        const heartbeat = setInterval(() => {
          heartbeatCount++;
          log(`Engine: still compiling… (${heartbeatCount * COMPILE_HEARTBEAT_MS / 1000}s, attempt ${attempt + 1})`);
        }, COMPILE_HEARTBEAT_MS);
        try {
          pipe = await withTimeout(
            pipeline('automatic-speech-recognition', MODEL_ID, pipelineOpts),
            timeoutMs,
            'model compile'
          );
          clearInterval(heartbeat);
          break;
        } catch (e) {
          clearInterval(heartbeat);
          const timedOut = /timed out/.test((e && e.message) || '');
          if (timedOut && attempt < MAX_COMPILE_RETRIES) {
            log(`Engine: compile did not finish in ${Math.round(timeoutMs / 1000)}s (attempt ${attempt + 1}) — retrying with warm runtime …`);
            continue;
          }
          if (timedOut) log(`Engine: compile still not finished after ${MAX_COMPILE_RETRIES + 1} attempts`);
          throw e;
        }
      }
      transcriber = pipe;
      // B1 CRASH BREADCRUMB (2026-09-04): record how the engine came up —
      // which runtime copy won and how long the compile took. These fields
      // ride csPageHeartbeat, so a hard kill later in the session reports
      // the exact speech-pipeline state it died with.
      try {
        if (typeof csPageHeartbeat === 'function') {
          csPageHeartbeat({
            spLib: libBase ? 'stable' : 'local',
            spSrc: src && src.name ? String(src.name).slice(0, 16) : '?',
            spCompileMs: Math.round(performance.now() - loadT0)
          });
        }
      } catch (_) { /* breadcrumb is best-effort */ }
      log('Engine: ready ✅');
      return pipe;
    })();

    return loading;
  }

  /**
   * @param {Blob|Float32Array} input  16-bit PCM WAV Blob, or raw Float32Array samples
   * @param {Object} [opts]   { repeatThresholdSec: 1.5 } — short audio gets repeated
   * @returns {Promise<{text:string, timeSec:number}>}
   */
  const TARGET_SR = 16000;   // Whisper tiny.en expects 16 kHz

  // --- WAV (Blob) → Float32Array PCM in [-1,1], with the file's TRUE sample rate ---
  async function decodeWav(blob) {
    const buf = await blob.arrayBuffer();
    const dv = new DataView(buf);
    if (dv.getUint32(0, true) !== 0x46464952) throw new Error('Not a WAV (RIFF) blob');
    let offset = 12, sampleRate = TARGET_SR, numCh = 1, bits = 16, fmt = 1, dataOff = -1, dataLen = 0;
    while (offset + 8 <= buf.byteLength) {
      const id = dv.getUint32(offset, true);
      const size = dv.getUint32(offset + 4, true);
      if (id === 0x20746d66) {            // 'fmt '
        fmt = dv.getUint16(offset + 8, true);
        numCh = dv.getUint16(offset + 10, true);
        sampleRate = dv.getUint32(offset + 12, true);
        bits = dv.getUint16(offset + 22, true);
      } else if (id === 0x61746164) {     // 'data'
        dataOff = offset + 8; dataLen = size; break;
      }
      offset += 8 + size + (size & 1);
    }
    if (dataOff < 0) throw new Error('WAV: missing data chunk');
    const frames = Math.floor(dataLen / (bits / 8) / numCh);
    const data = new Float32Array(frames);
    let p = dataOff;
    if (fmt === 3) {                       // IEEE float
      const fa = new Float32Array(buf, dataOff, frames * numCh);
      for (let i = 0; i < frames; i++) { let s = 0; for (let c = 0; c < numCh; c++) s += fa[i * numCh + c]; data[i] = s / numCh; }
    } else if (bits === 16) {
      for (let i = 0; i < frames; i++) { let s = 0; for (let c = 0; c < numCh; c++) { s += dv.getInt16(p, true); p += 2; } data[i] = s / numCh / 32768; }
    } else if (bits === 8) {
      for (let i = 0; i < frames; i++) { let s = 0; for (let c = 0; c < numCh; c++) { s += dv.getUint8(p) - 128; p++; } data[i] = s / numCh / 128; }
    } else {
      throw new Error('WAV: unsupported bit depth ' + bits);
    }
    return { data, sampleRate };
  }

  // --- linear-interpolation resample (good enough for ASR) ---
  function resample(audio, fromRate, toRate) {
    if (fromRate === toRate) return audio;
    const ratio = fromRate / toRate;
    const out = new Float32Array(Math.max(1, Math.round(audio.length / ratio)));
    for (let i = 0; i < out.length; i++) {
      const idx = i * ratio, i0 = Math.floor(idx), i1 = Math.min(i0 + 1, audio.length - 1), f = idx - i0;
      out[i] = audio[i0] * (1 - f) + audio[i1] * f;
    }
    return out;
  }

  // --- Child-voice pitch adaptation: REMOVED 2026-08-26 -------------------
  // The F0-estimate + resample-down path shipped 2026-07-29 showed NO lift in
  // four weeks of field data (1517 shifted attempts: 47% pass vs 48% for 1550
  // unshifted). It also mis-shifted borderline adult voices (teacher ~150Hz
  // read as 300-390Hz). Removed for simplicity; if children's-voice accuracy
  // is revisited, the data points to a better model, not preprocessing.

  // Collapse Tiny Whisper speaker-echo loops (famous 'what what what' / 'the
  // the the the' patterns on Android). We only strip obvious loops — not normal
  // two-repeat intent speech like "Wednesday, Wednesday".
  function collapseRepetition(text) {
    if (!text) return text;
    // Strip leading duplicated word + comma pairs ("what, what, " echo tail).
    // The pattern: a word, comma, same word, comma — drop the leading copy.
    text = text.replace(/^([^,\s]+,\s*)\1+/, '$1').trim();
    // Collapse runs of 4+ identical tokens to 1 token. (2-3 repeats happens in
    // real speech; 4+ is echo/decode loops without any new content.)
    text = text.replace(/(\S+)((?:\s+\1){3,})/g, '$1');
    // Final fallback: if the whole thing is just 1 word repeated (no commas,
    // no other words), and it's super long (>6 tokens total), that's pure echo
    // → blank so the scorer shows "try again".
    if (!text.includes(' ') && text.split(/\s+/).length > 6) return '';
    return text;
  }

  async function transcribe(input, opts) {
    opts = opts || {};
    const signal = opts.signal;
    function checkCancelled() { if (signal && signal.aborted) { const e = new Error('Speech assessment cancelled'); e.name = 'AbortError'; throw e; } }
    checkCancelled();
    // A cancelled call may still be finishing one WASM step. Do not run a
    // second decoder on the same pipeline or queue more recordings behind it.
    if (transcriptionBusy) { const e = new Error('Previous recording is still finishing'); e.code = 'SPEECH_BUSY'; throw e; }
    transcriptionBusy = true;
    let stopper, interrupt, out, audio, targetAudio;
    try {
    if (!transcriber) await load();
    checkCancelled();
    if (signal && InterruptableStoppingCriteria) {
      stopper = new InterruptableStoppingCriteria();
      interrupt = function () { stopper.interrupt(); };
      signal.addEventListener('abort', interrupt, { once: true });
    }
    let sampleRate;
    if (input instanceof Blob) {
      const { data, sampleRate: sr } = await decodeWav(input);
      audio = data; sampleRate = sr;
    } else if (input instanceof Float32Array) {
      audio = input; sampleRate = TARGET_SR;
    } else {
      throw new Error('transcribe: expected a WAV Blob or Float32Array');
    }
    if (sampleRate !== TARGET_SR) audio = resample(audio, sampleRate, TARGET_SR);
    checkCancelled();
    if (opts.target) targetAudio = audio;

    // --- Audio repeat hack for isolated words ---
    // Whisper tiny.en struggles on very short utterances (~0.3-0.6s single words)
    // because the decoder has too little audio context to lock onto a token.
    // Repeating the audio 3x gives the decoder enough acoustic evidence to
    // recognise the word correctly. The dedup post-processing handles the rest.
    const repeatThreshold = (opts && opts.repeatThresholdSec) || 1.5;
    if (audio.length / TARGET_SR < repeatThreshold) {
      const orig = audio;
      audio = new Float32Array(orig.length * 3);
      audio.set(orig);
      audio.set(orig, orig.length);
      audio.set(orig, orig.length * 2);
      log('Engine: short utterance (' + (orig.length / TARGET_SR).toFixed(2) + 's) repeated 3× for better recognition');
    }
    if (!audio.length) return { text: '(silence / no audio captured)', timeSec: 0 };

    const t0 = performance.now();
    log('Transcribing audio (wasm) …');
    out = await transcriber(audio, {
      // whisper-tiny.en has forced_decoder_ids baked in (English-only), so
      // language/task must NOT be passed here — they'd conflict with the
      // model's own forced tokens and raise "Cannot specify task" errors.
      temperature: 0,           // deterministic; stops spooky hallucination loops
      best_of: 5,               // beam-5 search: keeps best, drops single-token repetition
      no_repeat_ngram_size: 3,  // blocks "what, what, what" spills from Android speaker echo
      length_penalty: 1.0,
      ...(stopper ? { stopping_criteria: [stopper] } : {}),
    });
    const timeSec = ((performance.now() - t0) / 1000).toFixed(1);
    let text = (out && out.text ? out.text : '').trim();
    checkCancelled();
    // MEMORY HYGIENE (2026-09-04): Transformers.js pipeline outputs are tensor
    //-backed objects. They are not auto-released promptly on WebKit; across a
    // long session (10+ gates) they pile up and Safari eventually kills the
    // page (the "forced refresh" pattern). Release eagerly when the API allows.

    // Post-pass: catch any residual repetition hallucination (tiny models can still
    // n-gram-loop on TTS echo). If the transcript is literally the same token N+
    // times, treat it as noise / "try again" — never let it score.
    text = collapseRepetition(text);

    let hints = null, targetCheckMs = 0;
    if (opts.target) {
      const checkingSince = performance.now();
      try {
        const checker = await waitForTarget(targetChecker(), signal); checkCancelled();
        log('Checking audio against target words …');
        hints = await checker.check(targetAudio, opts.target, text, signal); checkCancelled();
      } catch (error) {
        checkCancelled(); // Cancelled work must not return partial hints.
        log('Target word hints unavailable; keep the transcription result');
        hints = { status: 'unavailable', words: [] };
      }
      targetCheckMs = Math.round(performance.now() - checkingSince);
    }

    log(`Transcribed in ${timeSec}s → "${text}"`);
    return {
      text,
      timeSec: parseFloat(timeSec),
      ...(hints ? { targetWords: hints.words, targetStatus: hints.status, targetCheckMs: targetCheckMs } : {})
    };
    } finally {
      if (signal && interrupt) signal.removeEventListener('abort', interrupt);
      try {
        if (out && typeof out.dispose === 'function') out.dispose();
        else if (out && out.logits && typeof out.logits.dispose === 'function') out.logits.dispose();
      } catch (_) { /* older runtime without dispose */ }
      audio = null;
      targetAudio = null;
      transcriptionBusy = false;
    }
  }

  global.LocalEngine = {
    MODEL_ID,
    MODEL_SOURCES,
    load,
    transcribe,
    isBusy: () => transcriptionBusy,
    resetLoad,
    isLoaded: () => !!transcriber,
    chosenSource: () => chosen,
    _resample: resample
  };
})(window);
