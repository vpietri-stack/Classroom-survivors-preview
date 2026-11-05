// Canonical vocabulary and compatibility with students' pre-rename SR records.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = name => fs.readFileSync(path.join(__dirname, name), 'utf8');
const sandbox = { TEACHING_CONTENT: {}, AVAILABLE_CONTENT: {} };
vm.createContext(sandbox);
for (const name of ['sr_engine.js', 'content_pu1.js', 'content_pu2.js', 'content_pu3.js',
    'content_think0.js', 'content_think1.js', 'translations.js']) {
    vm.runInContext(source(name), sandbox, { filename: name });
}
const aliases = vm.runInContext('VOCAB_SR_LEGACY_KEYS', sandbox);
const translations = vm.runInContext('LOCAL_TRANSLATIONS', sandbox);
const entries = [];
for (const [book, units] of Object.entries(sandbox.TEACHING_CONTENT)) {
    for (const [unit, pages] of Object.entries(units)) {
        for (const [page, data] of Object.entries(pages)) {
            for (const word of data.vocab || []) entries.push({ book, unit, page, word });
        }
    }
}
const vocab = (book, unit, page) => Array.from(sandbox.TEACHING_CONTENT[book][unit][page].vocab);
const includes = (book, unit, page, words) => {
    for (const word of words) assert(vocab(book, unit, page).includes(word), `${book} U${unit} p${page}: ${word}`);
};

includes('PU2', '4', '46', ['big - bigger than', 'good - better than']);
includes('PU3', '3', '40', ['big - the biggest', 'beautiful - more beautiful than', 'beautiful - the most beautiful']);
includes('PU3', '4', '54', ['well - better than', 'badly - worse than', 'quickly - more quickly than']);
includes('PU1', '7', '85', ['eat - eating', 'paint - painting']);
includes('PU3', '2', '28', ['grow up - grew up', 'build - built']);
includes('Think1', '6', '58', ['put - put', 'read - read']);
includes('PU1', '6', '81', ['I - my', 'he - his', 'she - her', 'they - their']);
includes('PU2', '4', '54', ['I - my - mine', 'he - his - his', 'she - her - hers']);
includes('PU2', '6', '78', ["am - was", "is - was", "are - were", "am not - wasn't", "isn't - wasn't", "aren't - weren't"]);
includes('PU3', '1', '16', ['can - could', "can't - couldn't"]);
// Early PU1 retains the original beginner-facing forms by teacher request.
includes('PU1', '0', '5', ['your']);
includes('PU1', '0', '8', ['my']);
includes('PU1', '1', '16', ['my', 'your']);
includes('PU1', '2', '23', ['got']);
includes('PU1', '3', '35', ['my', 'your', 'got']);
for (const e of entries.filter(e => e.book === 'PU1' && Number(e.unit) <= 3)) {
    assert(!['I - my', 'you - your', 'get - got'].includes(e.word),
        `Early PU1 must keep its original labels: ${JSON.stringify(e)}`);
}
// Identical-looking words with different meanings/roles are not global replacements.
includes('PU1', '8', '99', ['painting']);
includes('PU3', '8', '95', ['left']);
includes('PU3', '5', '59', ['cut']);
includes('Think0', '0', '11', ['put']);
includes('Think1', '5', '55', ['interesting', 'tiring']);

const legacyLabels = new Set(Object.values(aliases).flat());
for (const e of entries) {
    const key = sandbox.itemKey(e.word);
    if (e.book === 'PU1' && Number(e.unit) <= 3 && ['my', 'your', 'got'].includes(key)) continue;
    // Bare base verbs and the picture noun still intentionally exist elsewhere.
    if (['cut', 'put', 'read', 'painting'].includes(key)) continue;
    assert(!legacyLabels.has(key), `Unconverted vocabulary: ${JSON.stringify(e)}`);
}
for (const [canonical, legacy] of Object.entries(aliases)) {
    const current = entries.find(e => sandbox.itemKey(e.word) === canonical);
    assert(current, `Alias target is absent from curriculum: ${canonical}`);
    assert(translations[current.word], `Missing exact translation: ${current.word}`);
    const image = word => path.join(__dirname, 'images/vocab', word.toLowerCase().replace(/ /g, '-') + '.png');
    if (legacy.some(word => fs.existsSync(image(word)))) {
        assert(fs.existsSync(image(canonical)), `Lost existing illustration: ${canonical}`);
    }
}

const success = (session, interval = 8) => ({ lastSession: session, interval,
    dueAfterSession: session + interval, lastResult: 'success', lapses: 2 });
const failure = session => ({ lastSession: session, interval: 1,
    dueAfterSession: session + 1, lastResult: 'failure', lapses: 3, priorInterval: 8 });
// Exercise every real old key, including old labels that now feed two new targets.
let aliasChecks = 0;
for (const [canonical, legacy] of Object.entries(aliases)) {
    for (const old of legacy) {
        const state = { vocab: { [old]: success(10) }, sentences: { untouched: success(1) } };
        const before = JSON.stringify(state);
        assert.equal(sandbox.getSRPriority(canonical, state.vocab, 11).group, 4);
        const updated = sandbox.updateSRStateForSession(state,
            [{ type: 'vocab', key: canonical, firstAttempt: true }], 18);
        assert.equal(updated.vocab[canonical].interval, 16, `${old} must retain its old interval`);
        assert.equal(updated.vocab[canonical].lapses, 2);
        assert.equal(JSON.stringify(state), before, 'Compatibility reads must not mutate stored data');
        const delta = sandbox.extractSRDelta(updated, 18);
        assert.deepEqual(Object.keys(delta.vocab), [canonical], 'Keep wire updates sparse');
        assert.equal(Object.keys(delta.sentences).length, 0);
        aliasChecks++;
    }
}
const key = 'get - got';
let state = { [key]: success(15, 32), 'get got': failure(14) };
assert.equal(sandbox.getVocabSRRecord(state, key).lastResult, 'success', 'A stale alias must not undo newer success');
state = { [key]: success(15, 32), 'get got': failure(16) };
assert.equal(sandbox.getSRPriority(key, state, 17).group, 1, 'Latest failure survives a label merge');
const recovered = sandbox.updateSRStateForSession({ vocab: state },
    [{ type: 'vocab', key, firstAttempt: true }], 17).vocab[key];
assert.equal(recovered.interval, 16, 'Recovery retains the previously achieved interval');
assert.equal(recovered.lapses, 3, 'Lapses are preserved, never added across aliases');
state = { [key]: success(15), 'get got': failure(15) };
assert.equal(sandbox.getVocabSRRecord(state, key).lastResult, 'success', 'An old alias cannot shadow a canonical result on the same SR day');
const sameDayRecovery = sandbox.updateSRStateForSession({ vocab: { 'get got': failure(15) } },
    [{ type: 'vocab', key, firstAttempt: true }], 15);
assert.equal(sandbox.getVocabSRRecord(sameDayRecovery.vocab, key).lastResult, 'success');
assert.equal(sandbox.getVocabSRRecord({ 'eat eating': success(15), eating: failure(15) }, 'eat - eating').lastResult,
    'failure', 'Conflicting legacy labels must retain their failure when no canonical record exists');
assert.equal(sandbox.getSRPriority(key, state, 16, new Set([key])).group, 0);
assert.equal(sandbox.getSRPriority(key, state, 16, null, new Set([key])).group, 5);
assert.equal(sandbox.itemKey(' Get got '), 'get got', 'Generic sentence/storage key semantics stay unchanged');
console.log(`Vocabulary normalization: curriculum, translations, image continuity and ${aliasChecks} legacy SR routes passed.`);
const { pruneRetiredVocab } = require('./api/src/functions/shared/retiredVocab');
const before = { vocab: { pyramid: success(15), 'the sun rises': failure(15), fall: success(15), help: success(15) },
    sentences: { 'the sun rises': success(15) } };
const cleaned = pruneRetiredVocab(before);
assert.deepEqual(Object.keys(cleaned.vocab), ['fall', 'help']);
assert.equal(cleaned.sentences, before.sentences);
assert.equal(pruneRetiredVocab(cleaned), cleaned);
assert(before.vocab.pyramid);
includes('Think0', '4', '44', ['iguana']);
includes('PU3', '9', '112', ['sunrise', 'sunset']);
assert.equal(translations.sunrise, '\u65e5\u51fa');
assert.equal(translations.sunset, '\u65e5\u843d');
assert(!vocab('PU2', '1', '14').includes('winning'));
assert(!vocab('PU3', '9', '112').includes('pyramid'));
vm.runInContext(source('teaching_content.js'), sandbox);
assert(sandbox.hasRetiredArticleVocab(['pyramid'], { book: 'PU3', page: 112 }));
assert(sandbox.hasRetiredArticleVocab(['fall'], { book: 'PU2', page: 14 }));
assert(!sandbox.hasRetiredArticleVocab(['fall'], { book: 'PU2', page: 81 }));
console.log('Article vocabulary curriculum, recovery eligibility and SR cleanup passed.');
