/* test_scorer_regression.js — regression suite for speech_scorer.js against
 * real field transcripts (2026-07-27 dataset). Run: node test_scorer_regression.js
 * Exit 0 = all cases pass. Keep MUST_FAIL cases when retuning thresholds. */
global.window = global;
require('../speech_scorer.js');
const S = global.Scorer;

// [target, transcript, expectedPass, why]
const CASES = [
    // must-pass: genuinely good readings the old fixed-edit-cap scorer rejected
    ['You must wear a helmet and knee pads when you go skating.', 'You must work on helmet and knee pads when you go skate', true, 'long sentence, 2 small word errors'],
    ['Do you have to vacuum the floor everyday?', 'Do you have to became the floor every day?', true, 'one garbled word in 8'],
    ["What time is the break? It's at half past ten.", "Good time is a break, it's a half past 10.", true, 'accent + digit rendering'],
    ['There is a bin on the laptop screen.', 'There is a bean on the laptop.', true, 'bin/bean L1 confusion'],
    ["They aren't my brothers.", 'The Aunt My Brothers', true, 'phonetically close short sentence'],
    // must-fail: wrong content / hallucinations must never pass
    ['The kite is a triangle.', 'The guide is a rectangle.', false, 'wrong shape words (template frame match)'],
    ['The zoo is opposite the park.', '[BLANK_AUDIO]', false, 'Whisper silence hallucination'],
    ["It's got long ears.", 'Bye!', false, 'noise hallucination'],
    ['The parrot is near the cage.', 'The pair is near the king.', false, 'both content words wrong'],
    ['It slept in the garden.', 'He flapped in the garden.', false, 'wrong verb'],
    ['', '', false, 'empty target must not pass']
];

const d = require('./speech_events_dump_full.json');
let fieldPass = 0;
for (const a of d.attempts) if (S.score(a.target, a.transcript, 2).pass) fieldPass++;
console.log('Field replay (272 attempts of 2026-07-27): ' + fieldPass + ' pass (' +
    Math.round(100 * fieldPass / d.attempts.length) + '% — was 18% under the old scorer)');

let ok = true;
for (const [t, g, want, why] of CASES) {
    const r = S.score(t, g, 2);
    const good = r.pass === want;
    if (!good) ok = false;
    console.log((good ? 'OK    ' : 'WRONG ') + 'pass=' + r.pass + ' want=' + want +
        '  [' + why + ']  heard:"' + g.slice(0, 45) + '"');
}

// ---- Book-tier leniency ladder --------------------------------------------
console.log('\n--- BOOK TIERS ---');

// Anchor equivalence: PU3/Think1 must behave exactly like the tuned level 2.
for (const [t, g, want] of CASES) {
    for (const book of ['PU3', 'Think1']) {
        const r = S.scoreForBook(t, g, book);
        if (r.pass !== want) {
            ok = false;
            console.log('WRONG anchor mismatch [' + book + '] pass=' + r.pass + ' want=' + want + '  heard:"' + g.slice(0, 40) + '"');
        }
    }
}
console.log('OK    PU3/Think1 anchor matches level-2 verdict on all ' + CASES.length + ' cases');

// Gibberish must fail at EVERY tier, including the most lenient (PU0/PU1).
const GIBBERISH = [
    ['The zoo is opposite the park.', '[BLANK_AUDIO]'],
    ["It's got long ears.", 'Bye!'],
    ['Fred went to the shop.', 'me?'],
    ['The dolphins are cleverer than a lot of animals.', '[Music]']
];
for (const book of ['PU0', 'PU1', 'PU2', 'Think0', 'PU3', 'Think1', 'PU4', 'Think2']) {
    for (const [t, g] of GIBBERISH) {
        const r = S.scoreForBook(t, g, book);
        if (r.pass) { ok = false; console.log('WRONG gibberish passed at ' + book + ': "' + g + '"'); }
    }
}
console.log('OK    gibberish fails at every tier (incl. PU0/PU1)');

// Ladder ordering on real field pairs: lenient passes, strict rejects.
const jojo = ['She wants a big purple teddy.', 'same what a big purple taking.']; // acc ~0.66
checkTier(jojo, 'PU1', true, 'Jojo-style near-miss passes at PU1');
checkTier(jojo, 'Think2', false, 'Jojo-style near-miss fails at Think2');
const helmet = ['You must wear a helmet and knee pads when you go skating.', 'You must work on helmet and knee pads when you go skate']; // acc 0.86
checkTier(helmet, 'Think2', true, 'helmet sentence (acc .86) passes even at Think2');
function checkTier(pair, book, want, why) {
    const r = S.scoreForBook(pair[0], pair[1], book);
    const good = r.pass === want;
    if (!good) ok = false;
    console.log((good ? 'OK    ' : 'WRONG ') + why + ' (pass=' + r.pass + ')');
}

// Unknown / missing book falls back to the anchor tier.
const fb1 = S.scoreForBook(jojo[0], jojo[1], undefined);
const fb2 = S.scoreForBook(jojo[0], jojo[1], 'SomeFutureBook');
const anchor = S.scoreForBook(jojo[0], jojo[1], 'PU3');
if (fb1.pass !== anchor.pass || fb2.pass !== anchor.pass) { ok = false; console.log('WRONG unknown-book fallback != anchor'); }
else console.log('OK    unknown/missing book falls back to PU3 anchor');

// Field replay ladder: pass rate must be monotonically non-increasing from
// most lenient tier to strictest.
console.log('\n--- FIELD REPLAY LADDER (272 attempts of 2026-07-27) ---');
const LADDER = ['PU0', 'PU1', 'PU2', 'Think0', 'PU3', 'PU4', 'Think2'];
let prev = Infinity;
for (const book of LADDER) {
    let p = 0;
    for (const a of d.attempts) if (S.scoreForBook(a.target, a.transcript, book).pass) p++;
    const mono = p <= prev;
    if (!mono) ok = false;
    console.log((mono ? 'OK    ' : 'WRONG ') + book + ': ' + p + '/' + d.attempts.length + ' (' + Math.round(100 * p / d.attempts.length) + '%)');
    prev = p;
}

// ---- Per-try leniency ladder (retry grace) --------------------------------
// A student who fails twice then has to press Skip experiences the gate as a
// wall. Try 2 takes a modest step down; try 3 drops to a grace floor that still
// rejects silence/noise/hallucination but passes any real voiced attempt, and
// tightens as you go up the book ladder. Try 1 must never move.
console.log('\n--- RETRY LADDER ---');

const BOOKS = ['PU0', 'PU1', 'PU2', 'Think0', 'PU3', 'Think1', 'PU4', 'Think2'];
const LADDER_ORDER = ['pu0', 'pu1', 'pu2', 'think0', 'pu3', 'think1', 'pu4', 'think2'];

function assert(cond, msg) {
    if (!cond) { ok = false; console.log('WRONG ' + msg); }
    else console.log('OK    ' + msg);
}
function countPass(book, attempt) {
    let p = 0;
    for (const a of d.attempts) if (S.scoreForBook(a.target, a.transcript, book, attempt).pass) p++;
    return p;
}

if (typeof S.cfgForTry !== 'function' || !S.RETRY_LADDER) {
    ok = false;
    console.log('WRONG scorer exposes neither cfgForTry() nor RETRY_LADDER');
} else {
    // 1. Try 1 is byte-identical to the book tier — the field-tuned anchor and
    //    every existing verdict above must not drift.
    let cfgDrift = 0;
    for (const book of BOOKS) {
        if (JSON.stringify(S.cfgForTry(book, 1)) !== JSON.stringify(S.tierForBook(book))) cfgDrift++;
    }
    assert(cfgDrift === 0, 'try 1 cfg equals the untouched book tier for all ' + BOOKS.length + ' books');

    let verdictDrift = 0;
    for (const book of BOOKS)
        for (const a of d.attempts)
            if (S.scoreForBook(a.target, a.transcript, book, 1).pass !== S.scoreForBook(a.target, a.transcript, book).pass) verdictDrift++;
    assert(verdictDrift === 0, 'try 1 verdicts unchanged across all ' + d.attempts.length + ' field attempts x ' + BOOKS.length + ' books');

    for (const [t, g, want, why] of CASES)
        for (const book of ['PU3', 'Think1'])
            if (S.scoreForBook(t, g, book, 1).pass !== want) { ok = false; console.log('WRONG try-1 anchor verdict moved [' + book + '] ' + why); }
    console.log('OK    all ' + CASES.length + ' must-pass/must-fail cases hold at try 1');

    // 2. Each rung is looser than the one before it, per book.
    let nonMono = [];
    for (const book of BOOKS) {
        const c = [1, 2, 3].map(n => countPass(book, n));
        if (!(c[0] <= c[1] && c[1] <= c[2])) nonMono.push(book + '(' + c.join('<') + ')');
    }
    assert(nonMono.length === 0, 'field pass count rises try1 <= try2 <= try3 for every book' + (nonMono.length ? ': ' + nonMono.join(' ') : ''));

    // 3. The book ladder still orders at try 3 (most lenient book passes most).
    let prev3 = Infinity, ladderBad = [];
    for (const book of LADDER_ORDER) {
        const p = countPass(book, 3);
        if (p > prev3) ladderBad.push(book);
        prev3 = p;
    }
    assert(ladderBad.length === 0, 'try-3 leniency still ordered down the book ladder' + (ladderBad.length ? ': broke at ' + ladderBad.join(',') : ''));

    // 4. Gibberish — including Whisper's parenthesised sound-effect tags — must
    //    fail at EVERY try for EVERY book, however lenient the grace floor.
    const JUNK = GIBBERISH.concat([
        ['His teddy is blue.', '(upbeat music)'],
        ['Tom is on the bike.', '(singing)'],
        ['A circle is a shape.', '(mumbles)'],
        ['The kite is a triangle.', '[speaking in foreign language]']
    ]);
    let junkLeak = [];
    for (const book of BOOKS)
        for (const attempt of [1, 2, 3])
            for (const [t, g] of JUNK)
                if (S.scoreForBook(t, g, book, attempt).pass) junkLeak.push(book + '/try' + attempt + ':"' + g + '"');
    assert(junkLeak.length === 0, 'junk + hallucinations fail at every try for every book' + (junkLeak.length ? ': ' + junkLeak.join(' ') : ''));

    // 4b. The chance-overlap guard specifically. Two unrelated strings of
    //     comparable length share ~37% of their characters, so a low accuracy
    //     floor alone would rescue "[speaking in foreign language]" against
    //     "The kite is a triangle" (acc 0.37, WER 1.00, phonetic 0.00).
    const OVERLAP = ['The kite is a triangle.', '[speaking in foreign language]'];
    assert(S.cfgForTry('PU0', 3).requireWordEvidence === true, 'try-3 rung sets requireWordEvidence');
    assert(!S.cfgForTry('PU0', 1).requireWordEvidence && !S.cfgForTry('PU0', 2).requireWordEvidence,
        'try 1 and try 2 do NOT set it (existing behaviour untouched)');
    assert(S.scoreForBook(OVERLAP[0], OVERLAP[1], 'PU0', 3).pass === false,
        'chance character overlap alone cannot rescue a try-3 pass');

    // 5. Try 3 is a grace floor, not a free pass: real speech with no word
    //    overlap still fails everywhere.
    const FREEBIE = ['Do they like salad? Yes, they do.', 'Oh, I got this. A sheep belt.'];
    let freeLeak = [];
    for (const book of BOOKS) if (S.scoreForBook(FREEBIE[0], FREEBIE[1], book, 3).pass) freeLeak.push(book);
    assert(freeLeak.length === 0, 'unrelated speech is NOT a free pass at try 3' + (freeLeak.length ? ': passed at ' + freeLeak.join(',') : ''));

    // 6. The ladder has a real gradient: the same weak attempt wins for the
    //    little kids and still fails for the oldest.
    const WEAK = ["His teddy's blue.", 'This is the world!'];
    assert(S.scoreForBook(WEAK[0], WEAK[1], 'PU0', 3).pass === true, 'weak attempt passes try 3 at PU0 (most lenient)');
    assert(S.scoreForBook(WEAK[0], WEAK[1], 'Think2', 3).pass === false, 'same weak attempt still fails try 3 at Think2 (strictest)');

    // 7. The case this whole change exists for: a kid who genuinely tried and
    //    was mis-heard. Fails try 1 at the anchor and above, wins at try 3
    //    everywhere. (PU0 already passes it at try 1 — its floor is 0.62.)
    const MISHEARD = ['He wants a small white helicopter.', 'Peace warmed up more white helicopter!'];
    let t1 = 0, t3 = 0;
    for (const book of BOOKS) {
        if (S.scoreForBook(MISHEARD[0], MISHEARD[1], book, 1).pass) t1++;
        if (S.scoreForBook(MISHEARD[0], MISHEARD[1], book, 3).pass) t3++;
    }
    assert(t1 === 1, 'mis-heard effort fails try 1 at every book except PU0 (got ' + t1 + '/8)');
    assert(t3 === BOOKS.length, 'mis-heard effort passes try 3 at all ' + BOOKS.length + ' books (got ' + t3 + ')');
    for (const book of ['PU3', 'Think1', 'PU4', 'Think2'])
        assert(S.scoreForBook(MISHEARD[0], MISHEARD[1], book, 1).pass === false, 'mis-heard effort still fails try 1 at ' + book);

    // 8. Clamping: junk/absent try numbers fall back to try 1, huge ones cap at
    //    the try-3 rung, numeric strings coerce.
    const probe = ['He wants a small white helicopter.', 'Peace warmed up more white helicopter!'];
    const atTry = n => S.scoreForBook(probe[0], probe[1], 'PU3', n).pass;
    assert(atTry(undefined) === false && atTry(0) === false && atTry(-3) === false && atTry(NaN) === false,
        'absent/zero/negative/NaN try number behaves as try 1');
    assert(atTry(3) === true && atTry(99) === true, 'try numbers above the ladder cap at the try-3 rung');
    assert(S.scoreForBook(probe[0], probe[1], 'PU3', '2').pass === S.scoreForBook(probe[0], probe[1], 'PU3', 2).pass,
        'string try number coerces to the same rung');

    // 9. Unknown/missing books ride the anchor rung at every try.
    for (const attempt of [1, 2, 3]) {
        const a = S.cfgForTry('SomeFutureBook', attempt), b = S.cfgForTry(undefined, attempt), c = S.cfgForTry('PU3', attempt);
        if (JSON.stringify([a.minAccuracy, a.maxWER, a.phonPass]) !== JSON.stringify([c.minAccuracy, c.maxWER, c.phonPass]) ||
            JSON.stringify([b.minAccuracy, b.maxWER, b.phonPass]) !== JSON.stringify([c.minAccuracy, c.maxWER, c.phonPass])) {
            ok = false; console.log('WRONG unknown-book fallback != PU3 anchor at try ' + attempt);
        }
    }
    console.log('OK    unknown/missing book falls back to the PU3 anchor rung at every try');

    // 10. No target is never a pass, at any try.
    let emptyLeak = 0;
    for (const book of BOOKS) for (const attempt of [1, 2, 3]) if (S.scoreForBook('', '', book, attempt).pass) emptyLeak++;
    assert(emptyLeak === 0, 'empty target never auto-passes at any try');
}

console.log(ok ? '\nALL REGRESSION CASES PASS' : '\nREGRESSIONS REMAIN');
process.exit(ok ? 0 : 1);
