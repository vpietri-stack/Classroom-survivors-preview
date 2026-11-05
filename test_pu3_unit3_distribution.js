'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const sandbox = { console, Math, localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const file of ['sr_engine.js','teaching_content.js','content_pu3.js','non_spelling_content.js']) {
    vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
}
const evaluate = script => vm.runInContext(script, sandbox);
evaluate(`authActiveUser = { id: 'fixture', book: 'PU3', unit: '3', page: '31',
    srState: { vocab: {}, sentences: {}, sentencePairs: {} } };
    function getCurrentSession() { return 0; }
    function shuffleArray(items) { return items; }`);
const pages = [31,33,35,36];
assert.deepEqual(Array.from(evaluate('AVAILABLE_CONTENT.PU3[3]')), pages);
const unit = evaluate('TEACHING_CONTENT.PU3[3]');
assert.ok(unit[36].sentences.includes('He hurt his elbow.'));
assert.ok(unit[36].sentences.includes('My shoulder is sore.'));
assert.equal(unit[31].sentences.length, 1);
assert.equal(unit[36].sentences.length, 4);
const canonical = item => JSON.stringify(item);
for (const type of ['vocab','sentences','sentencePairs']) {
    assert.deepEqual(pages.flatMap(page => Array.from(unit[page][type])).map(canonical).sort(),
        Array.from(unit[40][type]).map(canonical).sort(), type + ' conserved exactly once');
}
const typed = data => Array.from(data.nonSpellingExercises).filter(item => item.id);
const moved = pages.flatMap(page => typed(unit[page]));
const legacy = typed(unit[40]);
assert.equal(moved.length, 49);
const keys = (items, page) => items.map(item => sandbox.NonSpellingContent.typedKey(item,
    { book: 'PU3', unit: '3', page })).sort();
assert.deepEqual(pages.flatMap(page => keys(typed(unit[page]), page)).sort(), keys(legacy, 40),
    'all 49 old typed SR keys remain unchanged');
assert.equal(new Set(pages.flatMap(page => keys(typed(unit[page]), page))).size, 49);
assert.ok(!moved.some(item => item.id === 'F27'), 'excluded duplicate stays excluded');
for (const page of pages) {
    const pool = sandbox.NonSpellingContent.buildPool('PU3', 3, page, { pageOnly: true }).entries;
    assert.ok(pool.length > 0, 'new page participates in normal runtime');
    assert.ok(pool.every(entry => String(entry.item.page) === String(page)), 'strict page boundary');
    assert.equal(sandbox.NonSpellingContent.select('PU3', 3, page, 5).length, 5,
        'cumulative Study still has a complete five-board round');
    assert.ok(!sandbox.NonSpellingContent.buildPool('PU3', 3, page).entries.some(entry =>
        entry.item.unit === '3' && Number(entry.item.page) > page), 'later lessons cannot leak early');
}
assert.ok(!evaluate("getSortedPagesForBook('PU3').some(p => p.unit === '3' && p.page === '40')"));
evaluate("authActiveUser.page = '40'; selectedClassContent = { book: 'PU3', unit: '3', page: '40' };");
assert.ok(evaluate("getSortedPagesForBook('PU3').some(p => p.unit === '3' && p.page === '40')"));
assert.equal(sandbox.NonSpellingContent.buildPool('PU3', 3, 40, { pageOnly: true }).entries.filter(e => e.item.id).length, 49);
assert.equal(evaluate("getStudyContentSR('PU3', '3', '40', 'vocab', 5).length"), 5);
// A restored old checkpoint may keep its old boundary without assigning new users to it.
evaluate("authActiveUser.page = '36';");
const auth = fs.readFileSync('frontend_auth.js', 'utf8');
vm.runInContext(auth.slice(auth.indexOf('function checkAndAdvancePageIfAllOnCooldown()'),
    auth.indexOf('function reapplyPendingPageAdvance()')), sandbox);
evaluate('getSRPriority = () => ({ group: 4 }); window.PreviewNotes = { blocksAdvance: () => false };');
assert.equal(evaluate('checkAndAdvancePageIfAllOnCooldown()'), false);
assert.equal(evaluate('authActiveUser.page'), '36');
const dom = new JSDOM('<select id="settingsPage"></select><select id="addPage"></select>');
const admin = { document: dom.window.document, Option: dom.window.Option, AVAILABLE_CONTENT: { PU3: { 3: pages } } };
vm.createContext(admin);
const source = fs.readFileSync('admin_dashboard.js', 'utf8');
vm.runInContext(source.slice(source.indexOf('function populatePageSelect('),
    source.indexOf('function populateClassTimeSelect(')), admin);
admin.populatePageSelect('settingsPage','PU3','3','40');
assert.equal(dom.window.document.querySelector('#settingsPage').value, '40');
assert.equal(dom.window.document.querySelector('#settingsPage option[value="40"]').disabled, true);
admin.populatePageSelect('addPage','PU3','3','');
assert.equal(dom.window.document.querySelector('#addPage option[value="40"]'), null);
console.log('PU3 Unit 3 conservation, lesson boundaries, SR identity and legacy assignments passed.');
