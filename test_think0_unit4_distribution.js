'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

const sandbox = {
    console, Math,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
};
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const file of ['sr_engine.js', 'teaching_content.js', 'content_think0.js', 'non_spelling_content.js']) {
    vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
}

const evaluate = script => vm.runInContext(script, sandbox);
evaluate(`
    authActiveUser = { id: 'fixture', book: 'Think0', unit: '4', page: '40',
        srState: { vocab: {}, sentences: {}, sentencePairs: {} } };
    function getCurrentSession() { return 0; }
    function shuffleArray(items) { return items; }
`);

assert.deepEqual(Array.from(evaluate("AVAILABLE_CONTENT.Think0['4']")), [40, 41, 43, 44]);
for (const page of [40, 41, 43, 44]) {
    const counts = evaluate(`({
        words: TEACHING_CONTENT.Think0['4']['${page}'].vocab.length,
        sentences: TEACHING_CONTENT.Think0['4']['${page}'].sentences.length,
        pairs: TEACHING_CONTENT.Think0['4']['${page}'].sentencePairs.length,
        selectedWords: getStudyContentSR('Think0', '4', '${page}', 'vocab', 5).length,
        selectedBoards: NonSpellingContent.select('Think0', '4', '${page}', 5).length,
        gamePairs: getGameSentencePairsSR('Think0', '4', '${page}', new Set(), new Set()).pairs.length
    })`);
    assert.ok(counts.words >= 5, 'page ' + page + ' has five vocabulary choices');
    assert.ok(counts.sentences >= 5, 'page ' + page + ' has five sentences');
    assert.ok(counts.pairs >= 3, 'page ' + page + ' has three matching pairs');
    assert.equal(counts.selectedWords, 5, 'page ' + page + ' can start normal Study');
    assert.equal(counts.selectedBoards, 5, 'page ' + page + ' can select five mixed boards');
    assert.equal(counts.gamePairs, 3, 'page ' + page + ' can select a matching game');
}

assert.ok(evaluate("TEACHING_CONTENT.Think0['4']['41'].vocab.includes('app')"));
assert.ok(evaluate("TEACHING_CONTENT.Think0['4']['44'].vocab.includes('cable car')"));
assert.equal(evaluate("getSortedPagesForBook('Think0').some(p => p.unit === '4' && p.page === '45')"), false);
evaluate("authActiveUser.page = '45'; selectedClassContent = { book: 'Think0', unit: '4', page: '45' };");
assert.equal(evaluate("getSortedPagesForBook('Think0').some(p => p.unit === '4' && p.page === '45')"), true);
assert.equal(evaluate("getStudyContentSR('Think0', '4', '45', 'vocab', 5).length"), 5);
assert.equal(evaluate("NonSpellingContent.select('Think0', '4', '45', 5).length"), 5);
evaluate("authActiveUser.page = '44';");
assert.equal(evaluate("getSortedPagesForBook('Think0').some(p => p.unit === '4' && p.page === '45')"), true,
    'a resumed legacy session retains its old content boundary');

// A resumed old session may expose its former page boundary internally.
const authSource = fs.readFileSync('frontend_auth.js', 'utf8');
const advanceStart = authSource.indexOf('function checkAndAdvancePageIfAllOnCooldown()');
const advanceEnd = authSource.indexOf('function reapplyPendingPageAdvance()', advanceStart);
assert.ok(advanceStart >= 0 && advanceEnd > advanceStart);
vm.runInContext(authSource.slice(advanceStart, advanceEnd), sandbox);
evaluate("getSRPriority = () => ({ group: 4 }); window.PreviewNotes = { blocksAdvance: () => false };");
assert.equal(evaluate('checkAndAdvancePageIfAllOnCooldown()'), false);
assert.equal(evaluate('authActiveUser.page'), '44', 'removed page 45 cannot become a new automatic assignment');

const dom = new JSDOM('<select id="settingsPage"></select><select id="addPage"></select>');
const admin = { document: dom.window.document, Option: dom.window.Option,
    AVAILABLE_CONTENT: { Think0: { '4': [40, 41, 43, 44] } } };
vm.createContext(admin);
const code = fs.readFileSync('admin_dashboard.js', 'utf8');
const start = code.indexOf('function populatePageSelect(');
const end = code.indexOf('function populateClassTimeSelect(', start);
assert.ok(start >= 0 && end > start);
vm.runInContext(code.slice(start, end), admin);
admin.populatePageSelect('settingsPage', 'Think0', '4', '45');
assert.equal(dom.window.document.querySelector('#settingsPage').value, '45');
assert.equal(dom.window.document.querySelector('#settingsPage option[value="45"]').disabled, true);
admin.populatePageSelect('addPage', 'Think0', '4', '');
assert.equal(dom.window.document.querySelector('#addPage option[value="45"]'), null);
console.log('Think0 Unit 4 distribution, Study/game pools and legacy page-45 handling passed.');
