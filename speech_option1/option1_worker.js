import { prepareAdaptiveAssets, sha256 } from '../speech_adaptive_assets.js?v=5';
import { compactLexicon, decide, sentenceFeatures, binaryProbability } from '../speech_adaptive_core.js?v=1';
import { expectedWordSimilarity } from '../speech_adaptive_phonetic.js?v=1';
import { words, stats, disposeTensors } from '../speech_target.js?v=2026-10-28b';
import { evidence, warmZeroContexts } from '../speech_adaptive_evidence.js?v=1';
import {
  computeKaldiFbank,
  rmsZcrGate,
  logSoftmaxRowMajor,
  parseZipaTokens,
  wordToArpabetVariants,
  mapArpabetSeqToZipa,
  ctcViterbiAlignAndGop,
  classifyPhonicsSound,
  scoreUtteranceOption1,
  FRIENDLY_SOUND_NAME,
} from './zipa_core.js?v=1';

const ZIPA_CACHE_NAME = 'speech-option1-zipa-v1';
const ZIPA_BASE = new URL('./zipa/', import.meta.url).href;
const ZIPA_RAW_MIRROR = 'https://gh-proxy.com/https://raw.githubusercontent.com/vpietri-stack/Classroom-survivors-preview/main/speech_option1/zipa/';

let runtime, pipe, vad, zipaModel, assets, lexicon, zipaVocab, zipaIdToTok;
let contextSeconds = 8;
let loading = null;
let lastLoadStats = null;

async function fetchWithTimeout(url, timeoutMs = 25000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { signal: ctrl.signal, cache: 'no-cache' });
    if (!resp.ok) throw Error(`HTTP ${resp.status}`);
    return await resp.arrayBuffer();
  } finally {
    clearTimeout(timer);
  }
}

async function downloadZipaChunked(id) {
  let cache = null;
  try { cache = await caches.open(ZIPA_CACHE_NAME); } catch (_) {}

  const manifest = await (await fetch(new URL('manifest.json?v=1', ZIPA_BASE).href, { cache: 'no-cache' })).json();
  const tokText = await (await fetch(new URL('tokens.txt?v=1', ZIPA_BASE).href, { cache: 'no-cache' })).text();
  ({ vocab: zipaVocab, idToTok: zipaIdToTok } = parseZipaTokens(tokText));

  const out = new Uint8Array(manifest.totalBytes);
  let offset = 0;
  let downloaded = 0;
  let networkBytes = 0;
  let reusedBytes = 0;
  const routesUsed = new Set();
  const isLocalHost = ['localhost', '127.0.0.1'].includes(self.location.hostname);

  for (const part of manifest.parts) {
    const cacheKey = new URL(`${part.sha256}/${part.name}`, ZIPA_BASE).href;
    let buf = null;
    try {
      const saved = await cache?.match(cacheKey);
      if (saved) {
        const b = await saved.arrayBuffer();
        if (b.byteLength === part.bytes && await sha256(b) === part.sha256) {
          buf = b;
          reusedBytes += part.bytes;
          routesUsed.add('cache');
        }
      }
    } catch (_) {}

    if (!buf) {
      const urls = isLocalHost
        ? [new URL(part.name, ZIPA_BASE).href]
        : [new URL(part.name, ZIPA_BASE).href, ZIPA_RAW_MIRROR + part.name];
      let lastErr = null;
      for (const u of urls) {
        try {
          postMessage({
            id,
            phase: 'zipa',
            stage: `Downloading sound grader (${(downloaded / 1048576).toFixed(1)} / ${(manifest.totalBytes / 1048576).toFixed(1)} MB)`,
            downloaded,
            total: manifest.totalBytes,
            progress: Math.round((downloaded / manifest.totalBytes) * 100),
          });
          const b = await fetchWithTimeout(u, 30000);
          if (b.byteLength !== part.bytes || await sha256(b) !== part.sha256) {
            throw Error('Chunk verification failed');
          }
          buf = b;
          networkBytes += part.bytes;
          routesUsed.add(u.includes('gh-proxy.com') ? 'gh-proxy' : 'pages');
          try {
            await cache?.put(cacheKey, new Response(buf.slice(0), { headers: { 'Content-Type': 'application/octet-stream' } }));
          } catch (_) {}
          break;
        } catch (err) {
          lastErr = err;
        }
      }
      if (!buf) throw Error(`Could not download ${part.name}: ${String(lastErr?.message || lastErr)}`);
    }

    out.set(new Uint8Array(buf), offset);
    offset += part.bytes;
    downloaded += part.bytes;
    postMessage({
      id,
      phase: 'zipa',
      stage: reusedBytes === manifest.totalBytes
        ? 'Reusing saved sound grader'
        : `Downloading sound grader (${(downloaded / 1048576).toFixed(1)} / ${(manifest.totalBytes / 1048576).toFixed(1)} MB)`,
      downloaded,
      total: manifest.totalBytes,
      progress: Math.round((downloaded / manifest.totalBytes) * 100),
    });
  }

  return { bytes: out, networkBytes, reusedBytes, totalBytes: manifest.totalBytes, zipaRoute: [...routesUsed].join('+') || 'cache' };
}

async function load(id) {
  if (pipe && vad && zipaModel) return lastLoadStats;
  if (loading) return loading;

  loading = (async () => {
    const tAll0 = performance.now();
    const preferLocal = ['localhost', '127.0.0.1'].includes(self.location.hostname);

    const tWh0 = performance.now();
    assets = await prepareAdaptiveAssets(
      (p) => postMessage({ id, phase: 'whisper', ...p }),
      { preferLocal },
    );
    const whisperDownloadMs = performance.now() - tWh0;

    const tZ0 = performance.now();
    const zipaAsset = await downloadZipaChunked(id);
    const zipaDownloadMs = performance.now() - tZ0;

    const tEng0 = performance.now();
    postMessage({ id, phase: 'engine', stage: 'Starting speech engine in browser…', progress: 92 });

    const originalFetch = self.fetch.bind(self);
    let zipaBytesRef = zipaAsset.bytes;
    self.fetch = (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const path = url.split('?')[0];
      let key;
      if (path.startsWith(assets.whisperBase)) key = 'whisper/' + path.slice(assets.whisperBase.length);
      else if (path.endsWith('/ort-wasm-simd-threaded.jsep.wasm')) key = 'runtime/ort-wasm-simd-threaded.jsep.wasm';
      else if (path === assets.vadBase + 'config.json') {
        return Promise.resolve(new Response('{"model_type":"silero_vad","architectures":["PreTrainedModel"]}', { headers: { 'Content-Type': 'application/json' } }));
      } else if (path === assets.vadBase + 'onnx/model.onnx') key = 'silero_vad_v5.onnx';
      else if (path.endsWith('/models/zipa-w8/config.json')) {
        return Promise.resolve(new Response('{"model_type":"silero_vad","architectures":["PreTrainedModel"]}', { headers: { 'Content-Type': 'application/json' } }));
      } else if (path.endsWith('/models/zipa-w8/onnx/model.onnx') && zipaBytesRef) {
        return Promise.resolve(new Response(zipaBytesRef, { headers: { 'Content-Type': 'application/octet-stream' } }));
      }
      if (key && assets.buffers.has(key)) {
        return Promise.resolve(new Response(assets.buffers.get(key), {
          headers: { 'Content-Type': path.endsWith('.wasm') ? 'application/wasm' : path.endsWith('.json') ? 'application/json' : 'application/octet-stream' },
        }));
      }
      return originalFetch(input, init);
    };

    try {
      const libBase = new URL('../lib/', import.meta.url).href;
      runtime = await import(libBase + 'transformers.min.js?v=4');
      const { env } = runtime;
      env.allowLocalModels = true;
      env.allowRemoteModels = false;
      env.useBrowserCache = false;
      env.localModelPath = new URL('../models/', import.meta.url).href;
      env.backends.onnx.wasm.wasmPaths = libBase + 'wasm/';
      env.backends.onnx.wasm.numThreads = 1;
      env.backends.onnx.wasm.proxy = false;

      pipe = await runtime.pipeline('automatic-speech-recognition', 'whisper-tiny.en', { device: 'wasm', dtype: 'q8' });
      const original = pipe.processor;
      const wrapped = async (audio, ...args) => {
        const f = await original(audio, ...args);
        const x = f.input_features, n = x.dims[2];
        const frames = Math.min(n, Math.max(contextSeconds * 100, Math.ceil((audio.length / 16000 + 0.25) * 2) * 50));
        if (frames < n) {
          const data = new Float32Array(x.dims[1] * frames);
          for (let j = 0; j < x.dims[1]; j++) data.set(x.data.subarray(j * n, j * n + frames), j * frames);
          f.input_features = new runtime.Tensor('float32', data, [1, x.dims[1], frames]);
          x.dispose();
        }
        return f;
      };
      Object.assign(wrapped, original);
      wrapped.feature_extractor = original.feature_extractor;
      pipe.processor = wrapped;

      vad = await runtime.AutoModel.from_pretrained('silero-vad-v5', { device: 'wasm', dtype: 'fp32' });
      lexicon = compactLexicon(assets.lexicon);
      await warmZeroContexts(pipe, runtime, [assets.config.word.contextMinimumSec, assets.config.sentence.contextMinimumSec], (seconds) => {
        contextSeconds = seconds;
      });

      postMessage({ id, phase: 'engine', stage: 'Starting sound grader…', progress: 97 });
      zipaModel = await runtime.AutoModel.from_pretrained('zipa-w8', { device: 'wasm', dtype: 'fp32' });
    } finally {
      zipaBytesRef = null;
      assets.buffers.clear();
      self.fetch = originalFetch;
    }

    const engineStartupMs = performance.now() - tEng0;
    const totalLoadMs = performance.now() - tAll0;
    const totalNetworkBytes = assets.networkBytes + zipaAsset.networkBytes;
    const totalDlSec = (whisperDownloadMs + zipaDownloadMs) / 1000;
    const downloadMbps = totalNetworkBytes > 0 && totalDlSec > 0 ? Number(((totalNetworkBytes / 1048576) / totalDlSec).toFixed(2)) : 0;

    lastLoadStats = {
      whisperDownloadMs: Math.round(whisperDownloadMs),
      whisperNetworkBytes: assets.networkBytes,
      whisperReusedBytes: assets.reusedBytes,
      whisperTotalBytes: assets.total,
      zipaDownloadMs: Math.round(zipaDownloadMs),
      zipaNetworkBytes: zipaAsset.networkBytes,
      zipaReusedBytes: zipaAsset.reusedBytes,
      zipaTotalBytes: zipaAsset.totalBytes,
      zipaRoute: zipaAsset.zipaRoute,
      downloadMbps,
      totalNetworkBytes,
      totalReusedBytes: assets.reusedBytes + zipaAsset.reusedBytes,
      totalBytes: assets.total + zipaAsset.totalBytes,
      engineStartupMs: Math.round(engineStartupMs),
      totalLoadMs: Math.round(totalLoadMs),
    };
    return lastLoadStats;
  })();

  try {
    return await loading;
  } catch (e) {
    loading = null;
    throw e;
  }
}

async function speechPresence(audio) {
  const Tensor = runtime.Tensor;
  const sr = new Tensor('int64', BigInt64Array.from([16000n]), []);
  let state = new Tensor('float32', new Float32Array(256), [2, 1, 128]);
  let context = new Float32Array(64);
  const scores = [];
  try {
    for (let i = 0; i < audio.length + 4096; i += 512) {
      const frame = new Float32Array(576);
      frame.set(context);
      frame.set(audio.subarray(i, Math.min(audio.length, i + 512)), 64);
      context = frame.slice(-64);
      const input = new Tensor('float32', frame, [1, 576]);
      let out;
      try {
        out = await vad.sessions.model.run({ input: input.ort_tensor, state: state.ort_tensor, sr: sr.ort_tensor });
        state.dispose();
        state = new Tensor(out.stateN);
        const probability = new Tensor(out.output);
        scores.push(probability.data[0]);
        probability.dispose();
      } finally {
        input.dispose();
      }
    }
    return scores;
  } finally {
    state.dispose();
    sr.dispose();
  }
}

async function runZipaForward(audio) {
  const pad = 3200; // 200ms silence before & after speech
  const pcm = new Float32Array(audio.length + pad * 2);
  pcm.set(audio, pad);
  const fb = computeKaldiFbank(pcm);
  const Tensor = runtime.Tensor;
  const x = new Tensor('float32', fb.data, [1, fb.numFrames, 80]);
  const xLens = new Tensor('int64', BigInt64Array.from([BigInt(fb.numFrames)]), [1]);
  let out;
  try {
    out = await zipaModel.sessions.model.run({ x: x.ort_tensor, x_lens: xLens.ort_tensor });
    const lpTensor = out.log_probs || Object.values(out)[0];
    const T = lpTensor.dims[1];
    const V = lpTensor.dims[2];
    const logProbs = logSoftmaxRowMajor(lpTensor.data, T, V);
    return { logProbs, T, V };
  } finally {
    x.dispose();
    xLens.dispose();
    if (out) disposeTensors(out);
  }
}

let busy = false;
self.onmessage = async (e) => {
  const { id, action, audio, target } = e.data;
  if (action === 'clear_cache') {
    try {
      await caches.delete('speech-adaptive-assets-v1');
      await caches.delete(ZIPA_CACHE_NAME);
      postMessage({ id, cacheCleared: true });
    } catch (err) {
      postMessage({ id, error: String(err.message || err) });
    }
    return;
  }

  if (busy) {
    postMessage({ id, error: 'Still checking the previous recording' });
    return;
  }
  busy = true;
  try {
    const loadStats = await load(id);
    if (action === 'load') {
      postMessage({ id, ready: true, loadStats });
      return;
    }

    if (!(audio instanceof Float32Array) || audio.some((x) => !Number.isFinite(x))) {
      throw Error('Invalid audio buffer');
    }

    if (action === 'check_phonics') {
      const t0 = performance.now();
      const gate = rmsZcrGate(audio);
      if (!gate.passed) {
        postMessage({
          id,
          mode: 'phonics',
          result: {
            hasSpeech: false,
            matched: false,
            target: String(target || ''),
            headline: "I didn't hear that sound yet — try holding the sound clearly near the mic!",
            top3: [],
          },
          gateStats: gate,
          timings: { totalMs: Math.round(performance.now() - t0), zipaMs: 0 },
        });
        return;
      }
      const tZ0 = performance.now();
      const { logProbs, T, V } = await runZipaForward(audio);
      const ph = classifyPhonicsSound(logProbs, T, V, target, zipaVocab);
      const zipaMs = performance.now() - tZ0;
      const friendly = FRIENDLY_SOUND_NAME[ph.target] || ph.target;
      const headline = ph.matched
        ? (ph.rank === 1 ? `Great ${friendly} sound!` : `Good ${friendly} sound!`)
        : `Nice try! I heard ${ph.top3[0]?.friendly || 'another sound'} more strongly — try ${friendly} again.`;
      postMessage({
        id,
        mode: 'phonics',
        result: { hasSpeech: true, ...ph, friendly, headline },
        gateStats: gate,
        timings: { totalMs: Math.round(performance.now() - t0), zipaMs: Math.round(zipaMs) },
      });
      return;
    }

    const targetWords = words(target || '');
    if (!targetWords.length || targetWords.length > 40) {
      throw Error('Please enter 1 to 40 English words');
    }
    const audioStats = stats(audio);
    const t0 = performance.now();
    const vadScores = await speechPresence(audio);
    const vadMax = Math.max(...vadScores);

    if (vadMax < assets.config.vad.thresholdMax || audioStats.seconds < assets.config.audio.minimumSeconds) {
      const result = scoreUtteranceOption1({
        targetWords,
        whisperWords: [],
        vadScores,
        zipaRes: { words: [] },
        idToTok: zipaIdToTok,
        audioSeconds: audioStats.seconds,
      });
      postMessage({
        id,
        mode: 'speech',
        result,
        transcript: '',
        vadMax,
        timings: { totalMs: Math.round(performance.now() - t0), whisperMs: 0, zipaMs: 0 },
      });
      return;
    }

    const tWh0 = performance.now();
    const isWord = targetWords.length === 1;
    contextSeconds = isWord ? assets.config.word.contextMinimumSec : assets.config.sentence.contextMinimumSec;
    const ev = await evidence(pipe, runtime, audio, target, [], isWord ? assets.config.generation.maxWordTokens : assets.config.generation.maxSentenceTokens);
    const targetDecision = decide(ev, vadScores, lexicon, assets.calibration, assets.config);

    let whisperWordProbs;
    if (isWord) {
      const sim = expectedWordSimilarity(targetWords[0].text, ev.transcript, lexicon);
      const baseP = Math.max(sim.exact ? 0.99 : 0, sim.phone || 0, targetDecision[0]?.heardClear ? 0.85 : 0.15);
      whisperWordProbs = [{ prob: baseP, heardClear: Boolean(targetDecision[0]?.heardClear) }];
    } else {
      const feats = sentenceFeatures(ev, vadScores, lexicon);
      whisperWordProbs = feats.map((fv, idx) => ({
        prob: binaryProbability(assets.calibration, fv),
        heardClear: Boolean(targetDecision[idx]?.heardClear),
      }));
    }
    const whisperMs = performance.now() - tWh0;

    const tZ0 = performance.now();
    const { logProbs, T, V } = await runZipaForward(audio);
    const wordVariantsList = targetWords.map((tw) =>
      wordToArpabetVariants(tw.text, lexicon).slice(0, 4).map((seq) => mapArpabetSeqToZipa(seq, zipaVocab, true)),
    );
    const zipaRes = ctcViterbiAlignAndGop(logProbs, T, V, wordVariantsList, 0, [0, 1, 2, 3], [0, 3]);
    const zipaMs = performance.now() - tZ0;

    const result = scoreUtteranceOption1({
      targetWords,
      whisperWords: whisperWordProbs,
      vadScores,
      zipaRes,
      idToTok: zipaIdToTok,
      audioSeconds: audioStats.seconds,
    });

    postMessage({
      id,
      mode: 'speech',
      result,
      transcript: ev.transcript,
      vadMax,
      timings: {
        totalMs: Math.round(performance.now() - t0),
        whisperMs: Math.round(whisperMs),
        zipaMs: Math.round(zipaMs),
      },
    });
  } catch (err) {
    postMessage({ id, error: String(err.message || err).slice(0, 400) });
  } finally {
    busy = false;
  }
};
