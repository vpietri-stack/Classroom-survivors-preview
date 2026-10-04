/* =========================================================================
 * scorer.js  —  the "margin of error" engine.
 * Takes a target string + recognized transcript + a student level (1..5)
 * and returns { pass, accuracy, details }.
 *
 * Pure client-side, no dependencies. You control difficulty per level here.
 * Swapping the recognition engine (Whisper / Vosk / future Xunfei relay)
 * does NOT change this module.
 * ========================================================================= */
(function (global) {
  'use strict';

  // --- per-level tolerance -------------------------------------------------
  // Field data (2026-07-27, 272 real classroom attempts) showed the old rule
  // (charAcc AND fixed edit cap) punished LONG sentences: a 12-word sentence
  // said 85% right failed on the edit cap while short clean sentences passed.
  // New rule is OR-based with a length-proportional word-error-rate (WER):
  //   pass if  charAcc >= minAccuracy  OR  WER <= maxWER  OR  phonetic >= phonPass
  //  minAccuracy : char-similarity floor of the whole utterance
  //  maxWER      : word edits / target words (scales with sentence length)
  //  phonPass    : fraction of target words fuzzy-matched (L1 accent tolerance)
  //  exact       : if true, requires exact (case/punct-insensitive) match
  // Thresholds tuned by replaying the 272 field attempts (api/tune_scorer.js)
  // against must-pass / must-fail regression pairs: minAccuracy 0.75 is the
  // lowest floor that still rejects template swaps like "The kite is a
  // triangle" → "The guide is a rectangle" (acc 0.71 — sentence frames share
  // most characters, so 0.65 was too forgiving).
  const LEVELS = {
    1: { label: 'Level 1 (beginner)',      minAccuracy: 0.65, maxWER: 0.45, phonPass: 0.60, allowPhonetic: true,  exact: false },
    2: { label: 'Level 2 (elementary)',    minAccuracy: 0.75, maxWER: 0.30, phonPass: 0.70, allowPhonetic: true,  exact: false },
    3: { label: 'Level 3 (intermediate)',  minAccuracy: 0.85, maxWER: 0.20, phonPass: 0.85, allowPhonetic: true,  exact: false },
    4: { label: 'Level 4 (upper-inter)',   minAccuracy: 0.92, maxWER: 0.10, phonPass: 1.00, allowPhonetic: false, exact: false },
    5: { label: 'Level 5 (advanced)',      minAccuracy: 1.00, maxWER: 0.00, phonPass: 1.00, allowPhonetic: false, exact: true  }
  };

  // --- per-BOOK leniency ladder ---------------------------------------------
  // Lower-level students get more leeway so early failures don't discourage
  // them, while hallucination garbage ([Music], "Bye!") still fails at every
  // tier (it scores <30% on all three paths). Order, most to least lenient:
  //   PU0 > PU1 > PU2 > Think0 > PU3 = Think1 > PU4 > Think2
  // PU3/Think1 is the anchor = the field-tuned thresholds above (LEVELS[2]).
  // PU0/PU4 are pre-seeded for future books. Keys are lower-cased book ids as
  // stored in the student's DB record (authActiveUser.book).
  const BOOK_TIERS = {
    pu0:    { label: 'PU0 (most lenient)', minAccuracy: 0.62, maxWER: 0.50, phonPass: 0.55, allowPhonetic: true, exact: false },
    pu1:    { label: 'PU1',                minAccuracy: 0.65, maxWER: 0.45, phonPass: 0.60, allowPhonetic: true, exact: false },
    pu2:    { label: 'PU2',                minAccuracy: 0.70, maxWER: 0.38, phonPass: 0.65, allowPhonetic: true, exact: false },
    think0: { label: 'Think0',             minAccuracy: 0.72, maxWER: 0.34, phonPass: 0.68, allowPhonetic: true, exact: false },
    pu3:    { label: 'PU3 (anchor)',       minAccuracy: 0.75, maxWER: 0.30, phonPass: 0.70, allowPhonetic: true, exact: false },
    think1: { label: 'Think1 (anchor)',    minAccuracy: 0.75, maxWER: 0.30, phonPass: 0.70, allowPhonetic: true, exact: false },
    pu4:    { label: 'PU4',                minAccuracy: 0.78, maxWER: 0.25, phonPass: 0.75, allowPhonetic: true, exact: false },
    think2: { label: 'Think2 (strictest)', minAccuracy: 0.80, maxWER: 0.22, phonPass: 0.80, allowPhonetic: true, exact: false }
  };
  // Unknown / missing book → anchor tier (today's behavior, safe default).
  function tierForBook(book) {
    return BOOK_TIERS[String(book || '').toLowerCase().trim()] || BOOK_TIERS.pu3;
  }

  // --- per-try leniency ladder ----------------------------------------------
  // A student who fails twice and then has to press Skip experiences the gate
  // as a wall, and stops volunteering to speak. Replaying the 3067-attempt
  // field dump showed that relaxing thresholds *uniformly* converts only ~10%
  // of double-failures, because most of them are Whisper mis-hearing the child
  // entirely rather than near-misses sitting just under a line. So the ramp is
  // deliberately back-loaded:
  //   try 1 — untouched BOOK_TIERS entry (every existing verdict preserved)
  //   try 2 — modest step down, expressed as deltas on the book's own tier
  //   try 3 — absolute grace floor: still rejects silence/noise/hallucination
  //           (those score acc<0.17, WER=1.0, phonetic=0), but passes any real
  //           voiced attempt at the sentence
  // The try-3 floor tightens up the book ladder exactly as BOOK_TIERS does, so
  // PU0/PU1 little kids are rescued most often and Think2 keeps real teeth.
  // Measured on the field dump, of students who failed BOTH try 1 and try 2,
  // the share who win at try 3:
  //   PU1 71% · PU2 70% · PU0/Think0 68% · PU3/Think1 61% · PU4 59% · Think2 56%
  // Wrong-content sentences (acc 0.71-0.74, e.g. "The kite is a triangle" →
  // "The guide is a rectangle") do pass at try 3 — unavoidable, since they
  // out-score the genuine near-misses (acc 0.66). That trade is intentional:
  // by the third try the goal is confidence, not assessment, and every pass
  // carries its try number in telemetry so it stays measurable.
  const RETRY_LADDER = {
    //          try 2: deltas on the book tier      try 3: absolute floors
    pu0:    { t2: { minAccuracy: -0.07, maxWER: +0.10, phonPass: -0.07 }, t3: { minAccuracy: 0.25, maxWER: 0.85, phonPass: 0.20 } },
    pu1:    { t2: { minAccuracy: -0.07, maxWER: +0.10, phonPass: -0.07 }, t3: { minAccuracy: 0.28, maxWER: 0.82, phonPass: 0.22 } },
    pu2:    { t2: { minAccuracy: -0.06, maxWER: +0.09, phonPass: -0.06 }, t3: { minAccuracy: 0.32, maxWER: 0.78, phonPass: 0.26 } },
    think0: { t2: { minAccuracy: -0.05, maxWER: +0.08, phonPass: -0.05 }, t3: { minAccuracy: 0.36, maxWER: 0.74, phonPass: 0.30 } },
    pu3:    { t2: { minAccuracy: -0.05, maxWER: +0.07, phonPass: -0.05 }, t3: { minAccuracy: 0.40, maxWER: 0.70, phonPass: 0.34 } },
    think1: { t2: { minAccuracy: -0.05, maxWER: +0.07, phonPass: -0.05 }, t3: { minAccuracy: 0.40, maxWER: 0.70, phonPass: 0.34 } },
    pu4:    { t2: { minAccuracy: -0.04, maxWER: +0.06, phonPass: -0.04 }, t3: { minAccuracy: 0.45, maxWER: 0.65, phonPass: 0.40 } },
    think2: { t2: { minAccuracy: -0.03, maxWER: +0.05, phonPass: -0.03 }, t3: { minAccuracy: 0.50, maxWER: 0.60, phonPass: 0.45 } }
  };
  const MAX_LENIENT_TRY = 3;

  // Rounds to 2dp as well as clamping: every ladder delta is 2dp, but float
  // subtraction otherwise leaves artifacts like 0.6499999999999999 in the cfg
  // that surfaces in the debug panel and telemetry.
  function clamp01(n) { return Math.max(0, Math.min(1, Math.round(n * 100) / 100)); }

  // Resolve the threshold config for a given book + try number.
  // try 1 returns the BOOK_TIERS entry itself (identity — no drift possible);
  // absent/garbage try numbers fall back to 1, anything above the ladder caps
  // at the try-3 rung.
  function cfgForTry(book, attempt) {
    const base = tierForBook(book);
    const n = Math.floor(Number(attempt));
    const tryNo = Number.isFinite(n) ? Math.max(1, Math.min(MAX_LENIENT_TRY, n)) : 1;
    if (tryNo === 1) return base;
    const rung = RETRY_LADDER[String(book || '').toLowerCase().trim()] || RETRY_LADDER.pu3;
    if (tryNo === 2) {
      return {
        label: base.label + ' (try 2)',
        minAccuracy: clamp01(base.minAccuracy + rung.t2.minAccuracy),
        maxWER: clamp01(base.maxWER + rung.t2.maxWER),
        phonPass: clamp01(base.phonPass + rung.t2.phonPass),
        allowPhonetic: base.allowPhonetic,
        exact: base.exact
      };
    }
    return {
      label: base.label + ' (try 3 grace)',
      minAccuracy: rung.t3.minAccuracy,
      maxWER: rung.t3.maxWER,
      phonPass: rung.t3.phonPass,
      allowPhonetic: base.allowPhonetic,
      exact: base.exact,
      requireWordEvidence: true
    };
  }

  function normalize(s) {
    return (s || '')
      .toLowerCase()
      .replace(/[.,!?;:'"()\-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function levenshtein(a, b) {
    // Generic edit distance: works on strings (char-level) AND arrays of
    // tokens (word-level), since only ===-comparison of elements is used.
    const m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++)
      for (let j = 1; j <= n; j++)
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
    return dp[m][n];
  }

  // Char-level similarity of the two (normalized) utterances.
  // One formula handles BOTH single words and whole sentences.
  function accuracyOf(tgt, got) {
    if (!tgt && !got) return 1;
    if (!tgt || !got) return 0;
    const d = levenshtein(tgt, got);
    const denom = Math.max(tgt.length, got.length, 1);
    return Math.max(0, 1 - d / denom);
  }

  // Fuzzy single-word matcher. Captures L1-Chinese confusions naturally via
  // character distance, e.g. light~right (1/5), very~wery (1/5),
  // three~tree (1/5), teacher~teacha (2/7) — while rejecting apple~banana.
  const WORD_FUZZY = 1 / 3; // up to 1/3 of chars may differ
  function phoneticMatch(a, b) {
    if (!a || !b) return false;
    if (a === b) return true;
    const d = levenshtein(a, b);
    const denom = Math.max(a.length, b.length, 1);
    return d / denom <= WORD_FUZZY;
  }

  // Core decision shared by score() (numeric levels) and scoreForBook().
  function scoreWithCfg(cfg, target, transcript) {
    const tgt = normalize(target);
    const got = normalize(transcript);
    // No target = nothing to grade; never auto-pass (accuracyOf('','') is 1).
    if (!tgt) return { pass: false, accuracy: 0, details: 'no target', cfg };
    const tTok = tgt ? tgt.split(' ') : [];
    const gTok = got ? got.split(' ') : [];

    if (cfg.exact) {
      const pass = tgt === got;
      return { pass, accuracy: pass ? 1 : 0, details: pass ? 'exact match' : 'exact match required', cfg };
    }

    // exact normalized match -> instant pass
    if (tgt && tgt === got) {
      return { pass: true, accuracy: 1, details: 'exact match', cfg };
    }

    const accuracy = accuracyOf(tgt, got);

    // word-level phonetic leniency (ALTERNATIVE path): a target word is
    // "phonetically covered" if ANY recognized token is a fuzzy match.
    // Evaluated even when edit-distance accuracy is low, so heavily accented
    // but phonetically-close single words still pass at low levels.
    let phoneticHits = 0;
    if ((cfg.allowPhonetic || cfg.requireWordEvidence) && tTok.length && gTok.length) {
      for (const tw of tTok) {
        if (gTok.some(gw => phoneticMatch(tw, gw))) phoneticHits++;
      }
    }
    const phoneticRatio = tTok.length ? phoneticHits / tTok.length : 0;

    // decide — ANY of the three paths passes (field-tuned "variant D"):
    //   1. char accuracy (whole-utterance similarity)
    //   2. WER — word edits proportional to sentence length (replaces the old
    //      fixed edit cap that made long sentences nearly unpassable)
    //   3. phonetic coverage (accent-tolerant word matching)
    const edits = levenshtein(tTok, gTok); // token-level (array) edit distance
    const wer = tTok.length ? edits / tTok.length : 1;
    let pass = false, details = '';

    // requireWordEvidence (grace rung only): char similarity between two
    // UNRELATED strings of comparable length sits around 0.35-0.40 purely by
    // chance, so a low accuracy floor on its own would pass Whisper junk like
    // "[speaking in foreign language]" against "The kite is a triangle"
    // (acc 0.37, WER 1.00, phonetic 0.00). Requiring at least one matched
    // target word before accuracy can rescue the attempt closes that hole
    // while keeping every genuine mis-heard effort, which by definition has
    // word overlap. Measured cost: PU0 try-3 wins 83% -> 68%, Think2 unchanged.
    const accuracyOk = accuracy >= cfg.minAccuracy && (!cfg.requireWordEvidence || phoneticHits > 0);
    const werOk = wer <= cfg.maxWER;
    const phoneticOk = cfg.allowPhonetic && phoneticRatio >= cfg.phonPass;

    if (accuracyOk) {
      pass = true;
      details = `accuracy ${(accuracy * 100).toFixed(0)}%`;
    } else if (werOk) {
      pass = true;
      details = `word errors ${(wer * 100).toFixed(0)}% (≤${(cfg.maxWER * 100).toFixed(0)}% allowed)`;
    } else if (phoneticOk) {
      pass = true;
      details = `phonetic match ${(phoneticRatio * 100).toFixed(0)}% (accent tolerant)`;
    } else {
      const reasons = [];
      if (accuracy >= cfg.minAccuracy) {
        reasons.push(`accuracy ${(accuracy * 100).toFixed(0)}% but no target word matched`);
      } else {
        reasons.push(`accuracy ${(accuracy * 100).toFixed(0)}% < ${(cfg.minAccuracy * 100).toFixed(0)}%`);
      }
      reasons.push(`WER ${(wer * 100).toFixed(0)}% > ${(cfg.maxWER * 100).toFixed(0)}%`);
      if (cfg.allowPhonetic) reasons.push(`phonetic ${(phoneticRatio * 100).toFixed(0)}% < ${(cfg.phonPass * 100).toFixed(0)}%`);
      details = reasons.join('; ');
    }

    return { pass, accuracy, details, phoneticRatio, edits, wer, cfg };
  }

  /**
   * @param {string} target      e.g. "the weather is nice today"
   * @param {string} transcript  what the STT heard
   * @param {number} level       1..5
   */
  function score(target, transcript, level) {
    return scoreWithCfg(LEVELS[level] || LEVELS[3], target, transcript);
  }

  /**
   * Book-aware scoring: same three-path decision, thresholds from the
   * student's book tier (see BOOK_TIERS). book comes from the student's DB
   * record (authActiveUser.book), e.g. 'PU1', 'Think2'.
   * attempt is the 1-based try number within one sentence gate; tries 2 and 3
   * score against progressively looser rungs (see RETRY_LADDER). Omitted = 1,
   * i.e. exactly the pre-ramp behavior.
   */
  function scoreForBook(target, transcript, book, attempt) {
    return scoreWithCfg(cfgForTry(book, attempt), target, transcript);
  }

  global.Scorer = { score, scoreForBook, LEVELS, BOOK_TIERS, RETRY_LADDER, tierForBook, cfgForTry, normalize, phoneticMatch, levenshtein };
})(window);
