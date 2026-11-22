/**
 * Pure-JS browser audio features, G2P, ZIPA CTC forced alignment + GOP,
 * RMS/ZCR phonics gate, and multi-variable child pronunciation scoring.
 */

// 512-point real FFT precomputed tables
const N_FFT = 512;
const HALF_FFT = N_FFT / 2 + 1; // 257
const POVEY_400 = (() => {
  const w = new Float32Array(400);
  for (let n = 0; n < 400; n++) {
    w[n] = Math.pow(0.5 - 0.5 * Math.cos((2 * Math.PI * n) / 399), 0.85);
  }
  return w;
})();

const BIT_REV = (() => {
  const rev = new Uint16Array(N_FFT);
  for (let i = 0; i < N_FFT; i++) {
    let x = i, r = 0;
    for (let b = 0; b < 9; b++) {
      r = (r << 1) | (x & 1);
      x >>= 1;
    }
    rev[i] = r;
  }
  return rev;
})();

const TWIDDLE_RE = new Float64Array(N_FFT / 2);
const TWIDDLE_IM = new Float64Array(N_FFT / 2);
for (let k = 0; k < N_FFT / 2; k++) {
  const ang = (-2 * Math.PI * k) / N_FFT;
  TWIDDLE_RE[k] = Math.cos(ang);
  TWIDDLE_IM[k] = Math.sin(ang);
}

const KALDI_FB = (() => {
  const sr = 16000;
  const nMels = 80;
  const mel = (hz) => 1127.0 * Math.log(1.0 + hz / 700.0);
  const melLow = mel(20.0);
  const melHigh = mel(7600.0);
  const melPts = new Float64Array(nMels + 2);
  for (let i = 0; i < nMels + 2; i++) {
    melPts[i] = melLow + ((melHigh - melLow) * i) / (nMels + 1);
  }
  const binMel = new Float64Array(HALF_FFT);
  for (let k = 0; k < HALF_FFT; k++) {
    binMel[k] = mel((k * sr) / N_FFT);
  }
  const fb = new Float32Array(nMels * HALF_FFT);
  for (let b = 0; b < nMels; b++) {
    const left = melPts[b], center = melPts[b + 1], right = melPts[b + 2];
    const rowOff = b * HALF_FFT;
    for (let k = 0; k < HALF_FFT; k++) {
      const m = binMel[k];
      const up = (m - left) / Math.max(1e-12, center - left);
      const dn = (right - m) / Math.max(1e-12, right - center);
      fb[rowOff + k] = Math.max(0.0, Math.min(up, dn));
    }
  }
  return fb;
})();

export function computeKaldiFbank(audio) {
  const winLen = 400;
  const hopLen = 160;
  let x = audio;
  if (x.length < winLen) {
    const padded = new Float32Array(winLen);
    padded.set(x);
    x = padded;
  }
  const numFrames = 1 + Math.floor((x.length - winLen) / hopLen);
  const out = new Float32Array(numFrames * 80);

  const frame = new Float64Array(winLen);
  const re = new Float64Array(N_FFT);
  const im = new Float64Array(N_FFT);
  const power = new Float32Array(HALF_FFT);

  for (let f = 0; f < numFrames; f++) {
    const off = f * hopLen;
    let sum = 0.0;
    for (let i = 0; i < winLen; i++) sum += x[off + i];
    const mean = sum / winLen;
    for (let i = 0; i < winLen; i++) frame[i] = x[off + i] - mean;

    // Pre-emphasis + Povey window
    re.fill(0.0);
    im.fill(0.0);
    re[0] = frame[0] * (1.0 - 0.97) * POVEY_400[0];
    for (let i = 1; i < winLen; i++) {
      re[i] = (frame[i] - 0.97 * frame[i - 1]) * POVEY_400[i];
    }

    // Bit-reversal permutation into FFT buffer (inplace using temp swap via copy)
    const tmpRe = new Float64Array(N_FFT);
    for (let i = 0; i < N_FFT; i++) tmpRe[BIT_REV[i]] = re[i];
    re.set(tmpRe);

    // Cooley-Tukey radix-2 DIT FFT
    for (let size = 2; size <= N_FFT; size <<= 1) {
      const half = size >> 1;
      const step = N_FFT / size;
      for (let i = 0; i < N_FFT; i += size) {
        for (let j = 0; j < half; j++) {
          const twIdx = j * step;
          const wr = TWIDDLE_RE[twIdx];
          const wi = TWIDDLE_IM[twIdx];
          const idx2 = i + j + half;
          const tr = wr * re[idx2] - wi * im[idx2];
          const ti = wr * im[idx2] + wi * re[idx2];
          const idx1 = i + j;
          re[idx2] = re[idx1] - tr;
          im[idx2] = im[idx1] - ti;
          re[idx1] += tr;
          im[idx1] += ti;
        }
      }
    }

    for (let k = 0; k < HALF_FFT; k++) {
      power[k] = re[k] * re[k] + im[k] * im[k];
    }
    const outOff = f * 80;
    for (let b = 0; b < 80; b++) {
      const rowOff = b * HALF_FFT;
      let acc = 0.0;
      for (let k = 0; k < HALF_FFT; k++) acc += power[k] * KALDI_FB[rowOff + k];
      out[outOff + b] = Math.log(Math.max(1e-10, acc));
    }
  }
  return { data: out, numFrames };
}

export function rmsZcrGate(audio) {
  const win = 320;
  const hop = 160;
  let x = audio;
  if (x.length < win) {
    const p = new Float32Array(win);
    p.set(x);
    x = p;
  }
  let maxRms = 0, maxPeak = 0, maxFricRms = 0, maxZcr = 0;
  for (let i = 0; i < x.length; i++) {
    const a = Math.abs(x[i]);
    if (a > maxPeak) maxPeak = a;
  }
  for (let s = 0; s <= x.length - win; s += hop) {
    let sq = 0, zc = 0;
    for (let i = 0; i < win; i++) {
      const v = x[s + i];
      sq += v * v;
      if (i > 0 && v * x[s + i - 1] < 0) zc++;
    }
    const rms = Math.sqrt(sq / win);
    const zcr = zc / (win - 1);
    if (rms > maxRms) maxRms = rms;
    if (zcr > maxZcr) maxZcr = zcr;
    if (zcr >= 0.25 && rms > maxFricRms) maxFricRms = rms;
  }
  const passed = maxRms >= 0.008 || maxPeak >= 0.04 || maxFricRms >= 0.003;
  return { passed, maxRms, maxPeak, maxZcr };
}

export function logSoftmaxRowMajor(logits, T, V) {
  const out = new Float32Array(T * V);
  for (let t = 0; t < T; t++) {
    const off = t * V;
    let mx = -Infinity;
    for (let v = 0; v < V; v++) if (logits[off + v] > mx) mx = logits[off + v];
    let sumExp = 0;
    for (let v = 0; v < V; v++) sumExp += Math.exp(logits[off + v] - mx);
    const lse = mx + Math.log(sumExp);
    for (let v = 0; v < V; v++) out[off + v] = logits[off + v] - lse;
  }
  return out;
}

export const ARPABET_TO_IPA = {
  AA: [['ɑ'], ['a']],
  AE: [['æ']],
  AH: [['ə'], ['ʌ'], ['ɐ']],
  AO: [['ɔ'], ['ɒ']],
  AW: [['a', 'ʊ']],
  AY: [['a', 'ɪ']],
  B: [['b']],
  CH: [['tʃ'], ['t͡ʃ'], ['ʧ'], ['t', 'ʃ']],
  D: [['d']],
  DH: [['ð']],
  EH: [['ɛ'], ['e']],
  ER: [['ɚ'], ['ɜ', 'ɹ'], ['ɜ']],
  EY: [['e', 'ɪ'], ['e']],
  F: [['f']],
  G: [['ɡ'], ['g']],
  HH: [['h']],
  IH: [['ɪ']],
  IY: [['i']],
  JH: [['dʒ'], ['d͡ʒ'], ['ʤ'], ['d', 'ʒ']],
  K: [['k']],
  L: [['l']],
  M: [['m']],
  N: [['n']],
  NG: [['ŋ']],
  OW: [['o', 'ʊ'], ['ə', 'ʊ'], ['o']],
  OY: [['ɔ', 'ɪ']],
  P: [['p']],
  R: [['ɹ'], ['r']],
  S: [['s']],
  SH: [['ʃ']],
  T: [['t']],
  TH: [['θ']],
  UH: [['ʊ']],
  UW: [['u']],
  V: [['v']],
  W: [['w']],
  Y: [['j']],
  Z: [['z']],
  ZH: [['ʒ']],
};

const IPA_ALLOPHONES = {
  'i': ['i', 'iː', 'ɪ'], 'iː': ['i', 'iː', 'ɪ'], 'ɪ': ['ɪ', 'i', 'iː'],
  'u': ['u', 'uː', 'ʊ', 'ʉ'], 'uː': ['u', 'uː', 'ʊ'], 'ʊ': ['ʊ', 'u', 'uː'],
  'ɑ': ['ɑ', 'ɑː', 'a', 'ɒ', 'ɔ'], 'ɑː': ['ɑ', 'ɑː', 'a', 'ɒ'],
  'ɔ': ['ɔ', 'ɔː', 'ɒ', 'ɑ'], 'ɔː': ['ɔ', 'ɔː', 'ɒ', 'ɑ'],
  'ə': ['ə', 'ʌ', 'ɐ', 'ɜ'], 'ʌ': ['ʌ', 'ə', 'ɐ', 'a'], 'ɐ': ['ɐ', 'ə', 'ʌ'],
  'ɜ': ['ɜ', 'ɜː', 'ə', 'ɚ'], 'ɚ': ['ɚ', 'ɜ', 'ə'],
  'ɛ': ['ɛ', 'e', 'æ'], 'e': ['e', 'ɛ'],
  'ɡ': ['ɡ', 'g'], 'g': ['g', 'ɡ'],
  'ɹ': ['ɹ', 'r', 'ɻ'], 'r': ['r', 'ɹ'],
};

export const FRIENDLY_SOUND_NAME = {
  AA: '"ah"', AE: '"a" (cat)', AH: '"uh"', AO: '"aw"', AW: '"ow"', AY: '"eye"',
  B: '"b"', CH: '"ch"', D: '"d"', DH: '"th" (this)', EH: '"eh" (bed)', ER: '"er"',
  EY: '"ay"', F: '"f"', G: '"g"', HH: '"h"', IH: '"i" (sit)', IY: '"ee" (see)',
  JH: '"j"', K: '"k"', L: '"l"', M: '"m"', N: '"n"', NG: '"ng"',
  OW: '"oh"', OY: '"oy"', P: '"p"', R: '"r"', S: '"s"', SH: '"sh"',
  T: '"t"', TH: '"th" (thin)', UH: '"oo" (book)', UW: '"oo" (too)', V: '"v"',
  W: '"w"', Y: '"y"', Z: '"z"', ZH: '"zh"',
};

export const ALL_39_PHONES = Object.keys(ARPABET_TO_IPA);

export function parseZipaTokens(txt) {
  const vocab = new Map();
  const idToTok = [];
  for (const rawLine of txt.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line) continue;
    const sp = line.lastIndexOf(' ');
    if (sp <= 0) continue;
    const tok = line.slice(0, sp);
    const id = Number.parseInt(line.slice(sp + 1), 10);
    vocab.set(tok, id);
    idToTok[id] = tok;
  }
  return { vocab, idToTok };
}

function ruleG2P(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return ['AH'];
  const map = [
    ['tion', ['SH', 'AH', 'N']], ['ch', ['CH']], ['sh', ['SH']], ['th', ['TH']],
    ['ng', ['NG']], ['ph', ['F']], ['ee', ['IY']], ['ea', ['IY']], ['oo', ['UW']],
    ['ou', ['AW']], ['ow', ['OW']], ['ay', ['EY']], ['ai', ['EY']],
    ['a', ['AE']], ['b', ['B']], ['c', ['K']], ['d', ['D']], ['e', ['EH']],
    ['f', ['F']], ['g', ['G']], ['h', ['HH']], ['i', ['IH']], ['j', ['JH']],
    ['k', ['K']], ['l', ['L']], ['m', ['M']], ['n', ['N']], ['o', ['AA']],
    ['p', ['P']], ['q', ['K']], ['r', ['R']], ['s', ['S']], ['t', ['T']],
    ['u', ['AH']], ['v', ['V']], ['w', ['W']], ['x', ['K', 'S']], ['y', ['Y']], ['z', ['Z']],
  ];
  const out = [];
  let i = 0;
  while (i < w.length) {
    let matched = false;
    for (const [pat, phs] of map) {
      if (w.startsWith(pat, i)) {
        out.push(...phs);
        i += pat.length;
        matched = true;
        break;
      }
    }
    if (!matched) i++;
  }
  return out.length ? out : ['AH'];
}

export function wordToArpabetVariants(word, lexicon) {
  const clean = word.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9'-]/g, '');
  const overrides = {
    'café': [['K', 'AE', 'F', 'EY']], 'cafe': [['K', 'AE', 'F', 'EY']],
    'maths': [['M', 'AE', 'TH', 'S']], 'toothache': [['T', 'UW', 'TH', 'EY', 'K']],
    'lijun': [['L', 'IY', 'JH', 'UH', 'N']], 'yunnan': [['Y', 'UW', 'N', 'AA', 'N']],
    '0': [['Z', 'IH', 'R', 'OW']], '1': [['W', 'AH', 'N']], '2': [['T', 'UW']],
    '3': [['TH', 'R', 'IY']], '4': [['F', 'AO', 'R']], '5': [['F', 'AY', 'V']],
    '6': [['S', 'IH', 'K', 'S']], '7': [['S', 'EH', 'V', 'AH', 'N']], '8': [['EY', 'T']],
    '9': [['N', 'AY', 'N']], '10': [['T', 'EH', 'N']],
  };
  if (overrides[clean]) return overrides[clean];
  if (lexicon && lexicon[clean]) return lexicon[clean];
  const alphaOnly = clean.replace(/[^a-z]/g, '');
  if (lexicon && lexicon[alphaOnly]) return lexicon[alphaOnly];
  if (clean.includes('-')) {
    const parts = clean.split('-').filter(Boolean);
    if (parts.length > 1) {
      const combined = [];
      for (const p of parts) combined.push(...wordToArpabetVariants(p, lexicon)[0]);
      return [combined];
    }
  }
  return [ruleG2P(alphaOnly || clean)];
}

export function mapArpabetSeqToZipa(arpabetSeq, vocab, tolerantEquiv = true) {
  const tids = [], eqs = [], owners = [], labels = [];
  for (let idx = 0; idx < arpabetSeq.length; idx++) {
    const p = String(arpabetSeq[idx]).replace(/[0-9]+$/, '').toUpperCase();
    const cands = ARPABET_TO_IPA[p] || [['ə']];
    let chosen = cands.find((seq) => seq.every((sym) => vocab.has(sym)));
    if (!chosen) chosen = ['ə'];
    for (const sym of chosen) {
      const tid = vocab.get(sym) ?? 2;
      const eq = new Set([tid]);
      if (tolerantEquiv) {
        for (const alt of (IPA_ALLOPHONES[sym] || [sym])) {
          if (vocab.has(alt)) eq.add(vocab.get(alt));
        }
      }
      tids.push(tid);
      eqs.push([...eq]);
      owners.push(idx);
      labels.push(p);
    }
  }
  return { tids, eqs, owners, labels };
}

function summarizePhoneGop(logProbs, T, V, frameIndices, eqs, compExclude, heardExclude, windowExpand) {
  if (!frameIndices.length) {
    return { gopMax: -20, gopMargin: -20, gopPeak: -20, durFrames: 0, topHeardId: -1 };
  }
  let gopMaxSum = 0, gopMarginSum = 0;
  let tMin = Math.max(0, Math.min(...frameIndices) - windowExpand);
  let tMax = Math.min(T, Math.max(...frameIndices) + 1 + windowExpand);

  for (let i = 0; i < frameIndices.length; i++) {
    const t = frameIndices[i];
    const eq = eqs[i];
    const off = t * V;
    let targetLp = -Infinity;
    for (const k of eq) if (logProbs[off + k] > targetLp) targetLp = logProbs[off + k];
    let bestAll = -Infinity, bestOther = -Infinity;
    for (let v = 0; v < V; v++) {
      if (compExclude.has(v)) continue;
      const val = logProbs[off + v];
      if (val > bestAll) bestAll = val;
      if (!eq.includes(v) && val > bestOther) bestOther = val;
    }
    if (bestOther === -Infinity) bestOther = bestAll;
    gopMaxSum += targetLp - bestAll;
    gopMarginSum += targetLp - bestOther;
  }

  // Bottleneck peak across unique sub-token slots
  let minSlotPeak = Infinity;
  const seenSlots = new Set();
  for (const eq of eqs) {
    const key = eq.join(',');
    if (seenSlots.has(key)) continue;
    seenSlots.add(key);
    let slotBest = -Infinity;
    for (let t = tMin; t < tMax; t++) {
      const off = t * V;
      let targetLp = -Infinity;
      for (const k of eq) if (logProbs[off + k] > targetLp) targetLp = logProbs[off + k];
      let bestOther = -Infinity;
      for (let v = 0; v < V; v++) {
        if (!compExclude.has(v) && !eq.includes(v) && logProbs[off + v] > bestOther) {
          bestOther = logProbs[off + v];
        }
      }
      if (bestOther === -Infinity) bestOther = targetLp;
      const diff = targetLp - bestOther;
      if (diff > slotBest) slotBest = diff;
    }
    if (slotBest < minSlotPeak) minSlotPeak = slotBest;
  }

  let bestHeard = -1, bestHeardProb = -1;
  for (let v = 0; v < V; v++) {
    if (heardExclude.has(v)) continue;
    let avg = 0;
    for (const t of frameIndices) avg += Math.exp(logProbs[t * V + v]);
    avg /= frameIndices.length;
    if (avg > bestHeardProb) {
      bestHeardProb = avg;
      bestHeard = v;
    }
  }

  return {
    gopMax: gopMaxSum / frameIndices.length,
    gopMargin: gopMarginSum / frameIndices.length,
    gopPeak: minSlotPeak === Infinity ? -20 : minSlotPeak,
    durFrames: frameIndices.length,
    topHeardId: bestHeard,
  };
}

export function ctcViterbiAlignAndGop(logProbs, T, V, wordVariantsList, blankId = 0, ignoreIds = [0, 1, 2, 3], blankEquiv = [0, 3]) {
  const compExclude = new Set(ignoreIds);
  for (const b of blankEquiv) compExclude.delete(b);
  const heardExclude = new Set(ignoreIds);
  for (const b of blankEquiv) heardExclude.add(b);

  const nodes = [{ sym: blankId, word: -1, varIdx: -1, pos: -1, owner: -1, label: '', eq: blankEquiv, preds: [] }];
  let prevEnds = [0];
  const startNodes = [0];

  const eqIntersect = (a, b) => a.some((x) => b.includes(x));

  for (let wIdx = 0; wIdx < wordVariantsList.length; wIdx++) {
    const variants = wordVariantsList[wIdx];
    const wordTails = [];
    for (let vIdx = 0; vIdx < variants.length; vIdx++) {
      const { tids, eqs, owners, labels } = variants[vIdx];
      if (!tids.length) continue;
      let prevPhoneState = -1, prevPhoneEq = [], prevBlankState = -1;
      for (let pos = 0; pos < tids.length; pos++) {
        const preds = [];
        if (pos === 0) {
          for (const pe of prevEnds) {
            if (nodes[pe].word === -1 || !eqIntersect(nodes[pe].eq, eqs[0])) preds.push(pe);
          }
        } else {
          preds.push(prevBlankState);
          if (prevPhoneState >= 0 && !eqIntersect(prevPhoneEq, eqs[pos])) preds.push(prevPhoneState);
        }
        const pIdx = nodes.length;
        nodes.push({ sym: tids[pos], word: wIdx, varIdx: vIdx, pos, owner: owners[pos], label: labels[pos], eq: eqs[pos], preds });
        if (wIdx === 0 && pos === 0) startNodes.push(pIdx);
        if (pos < tids.length - 1) {
          const bIdx = nodes.length;
          nodes.push({ sym: blankId, word: -1, varIdx: -1, pos: -1, owner: -1, label: '', eq: blankEquiv, preds: [pIdx] });
          prevPhoneState = pIdx;
          prevPhoneEq = eqs[pos];
          prevBlankState = bIdx;
        } else {
          wordTails.push(pIdx);
        }
      }
    }
    const bWord = nodes.length;
    nodes.push({ sym: blankId, word: -1, varIdx: -1, pos: -1, owner: -1, label: '', eq: blankEquiv, preds: [...wordTails] });
    prevEnds = [...wordTails, bWord];
  }

  const N = nodes.length;
  if (T === 0 || N <= 1) {
    return { aligned: false, words: wordVariantsList.map(() => ({ minPeak: -20, minMargin: -20, meanMargin: -20, startMs: 0, endMs: 0, phones: [] })) };
  }

  const emit = new Float64Array(T * N);
  for (let s = 0; s < N; s++) {
    const eq = nodes[s].eq;
    for (let t = 0; t < T; t++) {
      let mx = -Infinity;
      const off = t * V;
      for (const k of eq) if (logProbs[off + k] > mx) mx = logProbs[off + k];
      emit[t * N + s] = mx;
    }
  }

  let prev = new Float64Array(N).fill(-Infinity);
  for (const s of startNodes) prev[s] = emit[s];
  const trace = new Int32Array(T * N).fill(-1);
  const predLists = nodes.map((nd, s) => [s, ...nd.preds]);

  for (let t = 1; t < T; t++) {
    const nxt = new Float64Array(N).fill(-Infinity);
    const tOff = t * N;
    for (let s = 0; s < N; s++) {
      const ps = predLists[s];
      let bestP = ps[0], bestV = prev[bestP];
      for (let i = 1; i < ps.length; i++) {
        const p = ps[i], v = prev[p];
        if (v > bestV) {
          bestV = v;
          bestP = p;
        }
      }
      nxt[s] = bestV + emit[tOff + s];
      trace[tOff + s] = bestP;
    }
    prev = nxt;
  }

  let bestEnd = prevEnds[0], bestEndVal = prev[bestEnd];
  for (const s of prevEnds) {
    if (prev[s] > bestEndVal) {
      bestEndVal = prev[s];
      bestEnd = s;
    }
  }
  if (!Number.isFinite(bestEndVal)) {
    return { aligned: false, words: wordVariantsList.map(() => ({ minPeak: -20, minMargin: -20, meanMargin: -20, startMs: 0, endMs: 0, phones: [] })) };
  }

  const path = new Int32Array(T);
  let cur = bestEnd;
  for (let t = T - 1; t >= 0; t--) {
    path[t] = cur;
    if (t > 0) cur = trace[t * N + cur];
  }

  const chosenVar = new Int32Array(wordVariantsList.length);
  const framesByWordPhone = wordVariantsList.map(() => new Map());
  for (let t = 0; t < T; t++) {
    const nd = nodes[path[t]];
    if (nd.word < 0) continue;
    chosenVar[nd.word] = nd.varIdx;
    const m = framesByWordPhone[nd.word];
    if (!m.has(nd.owner)) m.set(nd.owner, { frames: [], eqs: [], label: nd.label });
    const rec = m.get(nd.owner);
    rec.frames.push(t);
    rec.eqs.push(nd.eq);
  }

  const frameMs = 40; // ZIPA 4x subsampling on 10ms fbank
  const wordOut = [];
  for (let wIdx = 0; wIdx < wordVariantsList.length; wIdx++) {
    const v = wordVariantsList[wIdx][chosenVar[wIdx]];
    const numOrig = v.owners.length ? Math.max(...v.owners) + 1 : 0;
    const m = framesByWordPhone[wIdx];
    const phones = [];
    let minFrame = Infinity, maxFrame = -1;
    let minPeak = Infinity, minMargin = Infinity, sumMargin = 0;
    for (let pIdx = 0; pIdx < numOrig; pIdx++) {
      const rec = m.get(pIdx);
      let gop;
      let label = '';
      if (rec && rec.frames.length) {
        label = rec.label;
        for (const f of rec.frames) {
          if (f < minFrame) minFrame = f;
          if (f > maxFrame) maxFrame = f;
        }
        gop = summarizePhoneGop(logProbs, T, V, rec.frames, rec.eqs, compExclude, heardExclude, 1);
      } else {
        const subEqs = [];
        for (let k = 0; k < v.owners.length; k++) {
          if (v.owners[k] === pIdx) {
            subEqs.push(v.eqs[k]);
            label = v.labels[k];
          }
        }
        gop = summarizePhoneGop(logProbs, T, V, [], subEqs, compExclude, heardExclude, 1);
      }
      if (gop.gopPeak < minPeak) minPeak = gop.gopPeak;
      if (gop.gopMargin < minMargin) minMargin = gop.gopMargin;
      sumMargin += gop.gopMargin;
      phones.push({ arpabet: label, ...gop });
    }
    wordOut.push({
      minPeak: phones.length ? minPeak : -20,
      minMargin: phones.length ? minMargin : -20,
      meanMargin: phones.length ? sumMargin / phones.length : -20,
      startMs: minFrame < Infinity ? minFrame * frameMs : 0,
      endMs: maxFrame >= 0 ? (maxFrame + 1) * frameMs : 0,
      phones,
    });
  }

  return { aligned: true, words: wordOut };
}

export function classifyPhonicsSound(logProbs, T, V, targetArpabet, vocab) {
  const target = String(targetArpabet).replace(/[0-9]+$/, '').toUpperCase();
  const scores = [];
  for (const p of ALL_39_PHONES) {
    const mapped = mapArpabetSeqToZipa([p], vocab, false);
    let minSlotPeak = Infinity;
    for (const eq of mapped.eqs) {
      let best = -Infinity;
      for (let t = 0; t < T; t++) {
        const off = t * V;
        for (const k of eq) if (logProbs[off + k] > best) best = logProbs[off + k];
      }
      if (best < minSlotPeak) minSlotPeak = best;
    }
    scores.push({ phone: p, score: minSlotPeak });
  }
  scores.sort((a, b) => b.score - a.score);
  const rank = scores.findIndex((s) => s.phone === target) + 1;
  const targetScore = scores.find((s) => s.phone === target)?.score ?? -20;
  const top3 = scores.slice(0, 3).map((s) => ({
    phone: s.phone,
    friendly: FRIENDLY_SOUND_NAME[s.phone] || s.phone,
    score: s.score,
  }));
  const matched = rank > 0 && rank <= 3 && targetScore > -8.0;
  return { target, rank, targetScore, matched, top3 };
}

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const sigmoid = (z) => 1 / (1 + Math.exp(-Math.max(-20, Math.min(20, z))));

export function scoreUtteranceOption1({ targetWords, whisperWords, vadScores, zipaRes, idToTok, audioSeconds }) {
  const vadMax = vadScores?.length ? Math.max(...vadScores) : 0;
  if (!targetWords.length || vadMax < 0.15) {
    return {
      hasSpeech: false,
      overall: 0,
      accuracy: 0,
      completeness: 0,
      fluency: 0,
      stars: 0,
      headline: "I didn't hear any speech yet — try speaking a little closer to the mic!",
      words: targetWords.map((w) => ({
        text: w.text,
        score: 0,
        color: 'coral',
        heardClear: false,
        tip: 'No speech heard',
      })),
    };
  }

  const wordCards = [];
  let sumWordScore = 0;
  let clearCount = 0;

  for (let i = 0; i < targetWords.length; i++) {
    const tw = targetWords[i];
    const ww = whisperWords[i] || { prob: 0, heardClear: false };
    const zw = zipaRes.words[i] || { minPeak: -20, meanMargin: -20, phones: [] };

    const whisperScore = clamp01(Number.isFinite(ww.prob) ? ww.prob : (ww.heardClear ? 0.9 : 0.15));
    // Map ZIPA log-ratio metrics cleanly onto 0..1 child-friendly pronunciation scale
    const zipaPeakProb = sigmoid((zw.minPeak + 0.8) * 0.55);
    const zipaMeanProb = sigmoid((zw.meanMargin + 0.2) * 0.65);
    const soundScore = 0.55 * zipaPeakProb + 0.45 * zipaMeanProb;
    const blended = Math.round(100 * (0.52 * whisperScore + 0.48 * soundScore));

    const heardOk = ww.heardClear || blended >= 45;
    if (heardOk) clearCount++;

    let color = 'green';
    if (blended < 42) color = 'coral';
    else if (blended < 72) color = 'amber';

    let tip = 'Clear!';
    if (zw.phones && zw.phones.length) {
      let weakest = zw.phones[0];
      for (const ph of zw.phones) if (ph.gopPeak < weakest.gopPeak) weakest = ph;
      if (color === 'amber' && weakest.gopPeak < -1.5) {
        const targetFriendly = FRIENDLY_SOUND_NAME[weakest.arpabet] || weakest.arpabet;
        tip = `Good try — watch the ${targetFriendly} sound`;
      } else if (color === 'coral') {
        const targetFriendly = FRIENDLY_SOUND_NAME[weakest.arpabet] || weakest.arpabet;
        tip = `Try again slowly (listen for ${targetFriendly})`;
      }
    }

    sumWordScore += blended;
    wordCards.push({
      text: tw.text,
      score: blended,
      color,
      heardClear: Boolean(ww.heardClear),
      whisperProb: Number(whisperScore.toFixed(2)),
      zipaMinPeak: Number(zw.minPeak.toFixed(2)),
      zipaMeanMargin: Number(zw.meanMargin.toFixed(2)),
      startMs: zw.startMs,
      endMs: zw.endMs,
      tip,
      weakHeardIpa: zw.phones?.[0]?.topHeardId >= 0 ? (idToTok[zw.phones[0].topHeardId] || '') : '',
    });
  }

  const accuracy = Math.round(sumWordScore / targetWords.length);
  const completeness = Math.round((100 * clearCount) / targetWords.length);

  // Fluency from ZIPA inter-word gaps (gentle for young children)
  let longPausePenalty = 0;
  for (let i = 1; i < wordCards.length; i++) {
    const gapSec = Math.max(0, (wordCards[i].startMs - wordCards[i - 1].endMs) / 1000);
    if (gapSec > 0.65) longPausePenalty += Math.min(20, (gapSec - 0.65) * 18);
  }
  const fluency = Math.max(20, Math.round(0.75 * Math.max(0, 100 - longPausePenalty) + 0.25 * completeness));
  const overall = Math.round(0.55 * accuracy + 0.30 * completeness + 0.15 * fluency);
  const stars = overall >= 80 ? 3 : overall >= 55 ? 2 : 1;

  let headline = 'Awesome speaking! Clear and confident!';
  if (overall < 55) headline = 'Nice effort! Tap any yellow or red word to practice slowly.';
  else if (overall < 80) headline = 'Great job! Most words were clear — check the yellow hints.';

  return {
    hasSpeech: true,
    overall,
    accuracy,
    completeness,
    fluency,
    stars,
    headline,
    audioSeconds: Number((audioSeconds || 0).toFixed(2)),
    words: wordCards,
  };
}
