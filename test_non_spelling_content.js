'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const vm = require('vm');
let seed = 93417;
const randomMath = Object.create(Math);
randomMath.random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const sandbox = {
    console, Math: randomMath, API_BASE_URL: '', document: { addEventListener() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, getCurrentSession: () => 5
};
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const file of ['sr_engine.js', 'teaching_content.js', 'content_pu1.js', 'content_pu2.js', 'content_pu3.js', 'content_think0.js', 'content_think1.js', 'content_think2.js']) {
    vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox);
}
const vocabSnapshot = () => vm.runInContext("JSON.stringify(Object.fromEntries(Object.entries(TEACHING_CONTENT).map(([b,us]) => [b,Object.fromEntries(Object.entries(us).map(([u,ps]) => [u,Object.fromEntries(Object.entries(ps).map(([p,c]) => [p,c.vocab]))]))])))", sandbox);
const before = vocabSnapshot();
vm.runInContext(fs.readFileSync('non_spelling_content.js', 'utf8'), sandbox);
const content = sandbox.NonSpellingContent;
assert.equal(vocabSnapshot(), before, 'normalization never changes vocabulary');
assert.equal(content.buildPool('PU3', 9, 107).entries.some(e => e.item.page === '109'), false, 'page 109 exercises never leak into earlier pages');
assert.equal(content.buildPool('PU3', 9, 109).entries.filter(e => e.item.id && e.item.page === '109').length, 14, 'six missing-word and eight fix items belong to PU3 p109');
const unit1 = content.buildPool('PU3', 1, 16).entries.filter(e => e.item.id).map(e => e.item);
assert.equal(unit1.filter(e => e.type === 'missing-word').length, 20, 'all twenty approved Unit 1 missing boards belong to page 16');
assert.equal(unit1.filter(e => e.type === 'find-fix').length, 22, 'all twenty-two approved Unit 1 fixes belong to page 16');
assert.ok(unit1.every(e => e.unit === '1' && e.page === '16'), 'Unit 1 authored items have the exact approved placement');
assert.equal(new Set(unit1.map(e => e.key)).size, 42, 'reused page-local M/F IDs retain distinct SR keys');
assert.equal(content.buildPool('PU3', 0, 5).entries.some(e => e.item.id), false, 'Unit 1 content never appears before Unit 1');
const unit2 = content.buildPool('PU3', 2, 28).entries.filter(e => e.item.id && e.item.unit === '2').map(e => e.item);
assert.equal(unit2.filter(e => e.type === 'missing-word').length, 16, 'sixteen approved Unit 2 missing boards belong to page 28');
assert.equal(unit2.filter(e => e.type === 'find-fix').length, 20, 'twenty approved Unit 2 fixes belong to page 28');
assert.ok(unit2.every(e => e.page === '28'), 'Unit 2 authored content stays under page 28');
assert.equal(new Set([...unit1, ...unit2].map(e => e.key)).size, 78, 'Unit 1 and Unit 2 retain distinct SR keys');
assert.equal(unit2.find(e => e.id === 'M2').sentences[1], 'These are the pancakes ___ we ate.', 'M2 retains the approved pancakes replacement');
assert.equal(unit2.find(e => e.id === 'F9').sentence, "He's the teacher who teaches me English last year.");
assert.equal(unit2.find(e => e.id === 'F11').sentence, 'This is the tree house which they build last summer.');
const unit3 = content.buildPool('PU3', 3, 40).entries.filter(e => e.item.id && e.item.unit === '3').map(e => e.item);
assert.equal(unit3.filter(e => e.type === 'missing-word').length, 22, 'Unit 3 has the approved 22 missing boards');
const fixes3 = unit3.filter(e => e.type === 'find-fix');
assert.equal(fixes3.length, 27, 'Unit 3 has the approved 27 distinct fixes');
assert.equal(new Set(fixes3.map(e => e.sentence)).size, 27, 'no duplicate fix sentences');
assert.ok(!fixes3.some(e => e.id === 'F27'), 'F27 duplicate remains excluded');
assert.ok(!fixes3.find(e => e.id === 'F28').sentence.includes('but'), 'F28 omits the rejected conjunction');
assert.equal(unit3.find(e => e.id === 'M22').answers.length, 4, 'M22 retains four blanks');
assert.equal(new Set([...unit1, ...unit2, ...unit3].map(e => e.key)).size, 127, 'all three units retain scoped SR keys');
assert.ok(unit3.every(e => e.page === '40'), 'Unit 3 belongs to page 40');
const unit4 = content.buildPool('PU3', 4, 54).entries.filter(e => e.item.id && e.item.unit === '4').map(e => e.item);
assert.equal(unit4.filter(e => e.answers).length, 16, 'Unit 4 has 16 approved missing boards');
assert.equal(unit4.filter(e => e.answer).length, 20, 'Unit 4 has 20 approved fixes');
assert.ok(unit4.every(e => e.page === '54'), 'Unit 4 stays under page 54');
assert.equal(unit4.filter(e => e.prefixes).length, 13, 'only the 13 requested boards prefill letters');
for (const item of unit4.filter(e => e.prefixes)) assert.deepEqual(item.prefixes, item.answers.map(a => a[0]));
assert.equal(unit4.find(e => e.id === 'F14').wrongWord, 'then', 'F14 avoids the ambiguous as repair');
assert.equal(new Set([...unit1, ...unit2, ...unit3, ...unit4].map(e => e.key)).size, 163, 'four units retain scoped keys');
assert.equal(content.buildPool('PU3', 3, 40).entries.some(e => e.item.unit === '4'), false, 'Unit 4 cannot appear early');
const unit5 = content.buildPool('PU3', 5, 66).entries.filter(e => e.item.id && e.item.unit === '5').map(e => e.item);
assert.equal(unit5.filter(e => e.answers).length, 16, 'Unit 5 has 16 approved missing boards');
assert.equal(unit5.filter(e => e.answer).length, 20, 'Unit 5 has 20 approved fixes');
for (const [page, missing, fixes] of [['57', 3, 4], ['59', 4, 6], ['66', 9, 10]]) {
    assert.equal(unit5.filter(e => e.page === page && e.answers).length, missing, page + ' missing count');
    assert.equal(unit5.filter(e => e.page === page && e.answer).length, fixes, page + ' fix count');
    assert.ok(!content.buildPool('PU3', 5, page).entries.some(e => e.item.unit === '5' && Number(e.item.page) > Number(page)), 'later Unit 5 pages never appear early');
}
assert.equal(unit5.filter(e => e.prefixes).length, 13, 'Unit 5 preserves the approved initial hints');
assert.equal(new Set(unit5.filter(e => e.answer).map(e => e.sentence)).size, 20, 'no duplicate Unit 5 fixes');
assert.equal(new Set([...unit1, ...unit2, ...unit3, ...unit4, ...unit5].map(e => e.key)).size, 199, 'all approved boards retain scoped keys');
assert.ok(!content.buildPool('PU3', 4, 54).entries.some(e => e.item.unit === '5'), 'Unit 5 stays out of Unit 4');
const unit6 = content.buildPool('PU3', 6, 73).entries.filter(e => e.item.id && e.item.unit === '6').map(e => e.item);
assert.equal(unit6.filter(e => e.answers).length, 26, 'Unit 6 has 26 approved missing boards');
assert.equal(unit6.filter(e => e.answer).length, 34, 'Unit 6 has 34 approved fixes');
for (const [page, missing, fixes] of [['69', 6, 6], ['71', 4, 6], ['73', 16, 22]]) {
    assert.equal(unit6.filter(e => e.page === page && e.answers).length, missing, page + ' missing count');
    assert.equal(unit6.filter(e => e.page === page && e.answer).length, fixes, page + ' fix count');
    assert.ok(!content.buildPool('PU3', 6, page).entries.some(e => e.item.unit === '6' && Number(e.item.page) > Number(page)), 'later Unit 6 pages never appear early');
}
assert.equal(unit6.filter(e => e.prefixes).length, 22, 'Unit 6 preserves initial hints');
assert.equal(unit6.find(e => e.id === 'M11').sentences[0], 'You should ___ the guitar every day to get good.');
assert.ok(unit6.find(e => e.id === 'M21').sentences[0].includes('password'), 'wifi uses familiar password context');
assert.ok(unit6.find(e => e.id === 'M25').sentences.join(' ').includes('CTRL + V'), 'copy/paste retains the approved shortcuts');
for (const [id, wrong, answer] of [['F23','dictionary','laptop'],['F25','glues','apps'],['F26','in','on'],['F27','hifi','wifi'],['F30','bin','dictionary']]) {
    const item = unit6.find(e => e.id === id); assert.equal(item.wrongWord, wrong); assert.equal(item.answer, answer);
}
assert.equal(new Set([...unit1, ...unit2, ...unit3, ...unit4, ...unit5, ...unit6].map(e => e.key)).size, 259, 'all approved boards retain scoped keys');
assert.ok(!content.buildPool('PU3', 5, 66).entries.some(e => e.item.unit === '6'), 'Unit 6 stays out of Unit 5');
const unit7 = content.buildPool('PU3', 7, 87).entries.filter(e => e.item.id && e.item.unit === '7').map(e => e.item);
assert.equal(unit7.filter(e => e.answers).length, 26, 'Unit 7 has 26 approved missing boards');
assert.equal(unit7.filter(e => e.answer).length, 32, 'Unit 7 has 32 approved fixes');
for (const [page, missing, fixes] of [['83', 5, 10], ['85', 10, 12], ['87', 11, 10]]) {
    assert.equal(unit7.filter(e => e.page === page && e.answers).length, missing, page + ' missing count');
    assert.equal(unit7.filter(e => e.page === page && e.answer).length, fixes, page + ' fix count');
    assert.ok(!content.buildPool('PU3', 7, page).entries.some(e => e.item.unit === '7' && Number(e.item.page) > Number(page)), 'later Unit 7 pages never appear early');
}
assert.equal(unit7.filter(e => e.prefixes).length, 15, 'Unit 7 preserves the approved initial hints');
assert.deepEqual(Array.from(unit7.find(e => e.id === 'M5').prefixes), ['a', ''], 'M5 prefills only its first blank');
for (const id of ['M23','M24','M25','M26']) {
    const item = unit7.find(e => e.id === id); assert.equal(item.page, '85'); assert.equal(item.prefixes, undefined);
    assert.deepEqual(Array.from(item.answers).sort(), ['if', 'when'], 'connector boards retain both unhinted words');
}
for (const [id, wrong, answer] of [['F29','when','if'],['F30','if','when'],['F31','if','when'],['F32','when','if']]) {
    const item = unit7.find(e => e.id === id); assert.equal(item.wrongWord, wrong); assert.equal(item.answer, answer);
}
assert.equal(new Set([...unit1, ...unit2, ...unit3, ...unit4, ...unit5, ...unit6, ...unit7].map(e => e.key)).size, 317, 'all approved boards retain scoped keys');
assert.equal(new Set(unit7.filter(e => e.answer).map(e => e.sentence)).size, 32, 'no duplicate Unit 7 fixes');
assert.ok(!content.buildPool('PU3', 6, 73).entries.some(e => e.item.unit === '7'), 'Unit 7 stays out of Unit 6');
const unit8 = content.buildPool('PU3', 8, 99).entries.filter(e => e.item.id && e.item.unit === '8').map(e => e.item);
assert.equal(unit8.filter(e => e.answers).length, 23, 'Unit 8 has 23 approved missing boards');
assert.equal(unit8.filter(e => e.answer).length, 32, 'Unit 8 has 32 approved fixes');
for (const [page, missing, fixes] of [['95', 4, 4], ['97', 8, 10], ['98', 6, 10], ['99', 5, 8]]) {
    assert.equal(unit8.filter(e => e.page === page && e.answers).length, missing, page + ' missing count');
    assert.equal(unit8.filter(e => e.page === page && e.answer).length, fixes, page + ' fix count');
    assert.ok(!content.buildPool('PU3', 8, page).entries.some(e => e.item.unit === '8' && Number(e.item.page) > Number(page)), 'later Unit 8 pages never appear early');
}
assert.equal(unit8.filter(e => e.prefixes).length, 17, 'Unit 8 preserves approved initial hints');
assert.ok(!unit8.some(e => e.id === 'M10'), 'rejected umbrella/rain board is omitted');
assert.deepEqual(Array.from(unit8.find(e => e.id === 'M5').answers), ["'m", "'s"]);
assert.deepEqual(Array.from(unit8.find(e => e.id === 'M6').answers), ["'re", "'s"]);
assert.ok(unit8.find(e => e.id === 'M5').sentences[0].startsWith('I___'), 'contraction slot attaches to its pronoun');
assert.deepEqual(Array.from(unit8.find(e => e.id === 'M15').sentences), ['We go to the ___', 'to get ___.']);
const postBoard = unit8.find(e => e.id === 'M16');
assert.deepEqual(Array.from(postBoard.sentences), ['We buy ___ at the ___ ___.']);
assert.deepEqual(Array.from(postBoard.answers), ['stamps', 'post', 'office']);
assert.equal(new Set([...unit1, ...unit2, ...unit3, ...unit4, ...unit5, ...unit6, ...unit7, ...unit8].map(e => e.key)).size, 372, 'all approved boards retain scoped keys');
assert.equal(new Set(unit8.filter(e => e.answer).map(e => e.sentence)).size, 32, 'no duplicate Unit 8 fixes');
assert.ok(!content.buildPool('PU3', 7, 87).entries.some(e => e.item.unit === '8'), 'Unit 8 stays out of Unit 7');
assert.ok(!unit1.some(e => ['M6', 'M9', 'M10', 'F9', 'F10'].includes(e.id)), 'rejected boards remain excluded');
// Unit 9 additions retain page 109's original six M/eight F catalog.
const unit9 = content.buildPool('PU3', 9, 111).entries.filter(e => e.item.id && e.item.unit === '9' && e.item.page !== '109').map(e => e.item);
assert.equal(unit9.length, 60);
assert.equal(new Set([...unit1, ...unit2, ...unit3, ...unit4, ...unit5, ...unit6, ...unit7, ...unit8, ...unit9].map(e => e.key)).size, 432);
vm.runInContext(fs.readFileSync('translations.js', 'utf8'), sandbox);
const translations = vm.runInContext('LOCAL_TRANSLATIONS', sandbox);
assert.equal(translations.over, '越过；结束了', 'approved shared entry covers both meanings');
assert.deepEqual(Array.from(vm.runInContext('AVAILABLE_CONTENT.PU3[9]', sandbox)), [107, 109, 110, 111, 112]);
for (const [page, missing, fix, vocab, scrambles, pairs] of [[107, 8, 10, null, null, null], [110, 8, 12, 17, 10, 8], [111, 8, 14, 14, 12, 7]]) {
    const data = vm.runInContext('TEACHING_CONTENT.PU3[9][' + page + ']', sandbox);
    assert.equal(data.nonSpellingExercises.filter(e => e.type === 'missing-word').length, missing);
    assert.equal(data.nonSpellingExercises.filter(e => e.type === 'find-fix').length, fix);
    assert.equal(new Set(data.nonSpellingExercises.filter(e => e.type === 'find-fix').map(e => e.sentence)).size, fix);
    if (vocab !== null) {
        assert.equal(data.vocab.length, vocab);
        assert.equal(data.sentences.length, scrambles);
        assert.equal(data.sentencePairs.length, pairs);
        for (const text of [...data.vocab, ...data.sentences]) assert.match(translations[text] || '', /[\u4e00-\u9fff]/u, 'exact translation exists: ' + text);
    }
    for (const item of data.nonSpellingExercises.filter(e => e.answers)) assert.deepEqual(Array.from(item.prefixes), Array.from(item.answers, a => a[0]), 'approved first-letter hints retained');
}
const newYear = unit9.find(e => e.page === '107' && e.id === 'M5');
assert.equal(newYear.sentences.length, 1);
assert.deepEqual(Array.from(newYear.answers), ['special', 'excellent']);
assert.equal(unit9.find(e => e.page === '107' && e.id === 'F5').sentence, 'This poopoo soup tastes amazing.');
assert.equal(unit9.find(e => e.page === '110' && e.id === 'M4').sentences[0], 'We sent a ___ to Grandma from our holiday.');
assert.equal(unit9.find(e => e.page === '110' && e.id === 'F6').sentence, 'I pack my holiday clothes in my postcard.');
assert.ok(!content.buildPool('PU3', 9, 109).entries.some(e => Number(e.item.page) > 109), 'new holiday/feelings pages do not leak into page 109');
for (let i = 0; i < 50; i++) {
    const round = content.select('PU3', 9, 111, 5);
    assert.equal(round.length, 5);
    assert.ok(new Set(round.map(e => e.type)).size >= 3);
}
// PU2 Unit 1 uses its existing page progression and the exact approved exclusions.
const pu2Unit1 = content.buildPool('PU2', 1, 16).entries.filter(e => e.item.id && e.item.unit === '1').map(e => e.item);
assert.equal(pu2Unit1.filter(e => e.answers).length, 22);
assert.equal(pu2Unit1.filter(e => e.answer).length, 24);
assert.equal(new Set(pu2Unit1.map(e => e.key)).size, 46, 'PU2 keys stay distinct from PU3 and each other');
for (const [page, missing, fix] of [[7,5,5],[9,6,7],[10,7,8],[16,4,4]]) {
    const items = pu2Unit1.filter(e => e.page === String(page));
    assert.equal(items.filter(e => e.answers).length, missing);
    assert.equal(items.filter(e => e.answer).length, fix);
    const pool = content.buildPool('PU2', 1, page);
    assert.ok(!pool.entries.some(e => Number(e.item.page) > page), 'later PU2 pages stay excluded');
    for (let sample = 0; sample < 20; sample++) {
        const picked = content.select('PU2', 1, page, 5);
        assert.equal(picked.length, 5);
        assert.ok(new Set(picked.map(e => e.type)).size >= 3);
    }
}
assert.ok(!content.buildPool('PU2', 0, 5).entries.some(e => e.item.id), 'Unit 1 cannot appear in starter');
assert.equal(pu2Unit1.find(e => e.id === 'M13').sentences[1], 'Then I get my school clothes and I get ___.');
assert.equal(pu2Unit1.find(e => e.id === 'F3').sentence, 'The cows are eating rocks in the field.');
assert.ok(!pu2Unit1.some(e => ['M23','M24','F25','F26','F27','F28'].includes(e.id)), 'planet items are excluded');
assert.equal(new Set(pu2Unit1.filter(e => e.answer).map(e => e.sentence)).size, 24);
for (const item of pu2Unit1.filter(e => e.prefixes)) {
    assert.equal(item.prefixes.length, item.answers.length);
    item.prefixes.forEach((prefix, i) => assert.ok(item.answers[i].startsWith(prefix)));
}
const pu2Unit2 = content.buildPool('PU2', 2, 25).entries.filter(e => e.item.id && e.item.unit === '2').map(e => e.item);
assert.equal(pu2Unit2.filter(e => e.answers).length, 24);
assert.equal(pu2Unit2.filter(e => e.answer).length, 28);
assert.equal(new Set([...pu2Unit1, ...pu2Unit2].map(e => e.key)).size, 98);
for (const [page, missing, fix] of [[19,6,7],[21,6,7],[22,6,6],[25,6,8]]) {
    const items = pu2Unit2.filter(e => e.page === String(page));
    assert.equal(items.filter(e => e.answers).length, missing);
    assert.equal(items.filter(e => e.answer).length, fix);
    assert.ok(!content.buildPool('PU2', 2, page).entries.some(e => e.item.unit === '2' && Number(e.item.page) > page));
    for (let sample = 0; sample < 20; sample++) {
        const picked = content.select('PU2', 2, page, 5);
        assert.equal(picked.length, 5);
        assert.ok(new Set(picked.map(e => e.type)).size >= 3);
    }
}
assert.ok(!content.buildPool('PU2', 1, 16).entries.some(e => e.item.unit === '2'));
assert.deepEqual(Array.from(pu2Unit2.find(e => e.id === 'M1').sentences), ['Sunday comes after ___.', 'Sunday comes before ___.']);
assert.deepEqual(Array.from(pu2Unit2.find(e => e.id === 'M1').answers), ['saturday', 'monday']);
assert.deepEqual(Array.from(pu2Unit2.find(e => e.id === 'M3').sentences), ['Thursday comes before ___.', 'Wednesday comes after ___.']);
assert.deepEqual(Array.from(pu2Unit2.find(e => e.id === 'M3').answers), ['friday', 'tuesday']);
assert.equal(pu2Unit2.find(e => e.id === 'M4').sentences[0], 'Saturday comes before ___.');
for (const [id, prefixes] of [['M10',['t','o']], ['M11',['d','w']], ['M19',['m','m']], ['M20',['m','m']]]) {
    assert.deepEqual(Array.from(pu2Unit2.find(e => e.id === id).prefixes), prefixes);
}
for (const item of pu2Unit2.filter(e => e.prefixes)) {
    assert.equal(item.prefixes.length, item.answers.length);
    item.prefixes.forEach((prefix, i) => assert.ok(item.answers[i].startsWith(prefix)));
}
assert.equal(new Set(pu2Unit2.filter(e => e.answer).map(e => e.sentence)).size, 28);
assert.ok(vm.runInContext("TEACHING_CONTENT.PU2[2][19].sentencePairs.some(p => p.a === 'Tuesday comes after' && p.b === 'Monday.')", sandbox));
assert.ok(!vm.runInContext("TEACHING_CONTENT.PU2[2][19].sentencePairs.some(p => p.a === 'Tuesday comes before' && p.b === 'Monday.')", sandbox));
const pu2Unit3 = content.buildPool('PU2', 3, 40).entries.filter(e => e.item.id && e.item.unit === '3').map(e => e.item);
assert.equal(pu2Unit3.filter(e => e.answers).length, 24);
assert.equal(pu2Unit3.filter(e => e.answer).length, 27);
assert.equal(new Set([...pu2Unit1, ...pu2Unit2, ...pu2Unit3].map(e => e.key)).size, 149);
for (const [page, missing, fix] of [[31,6,5],[33,8,10],[40,10,12]]) {
    const items = pu2Unit3.filter(e => e.page === String(page));
    assert.equal(items.filter(e => e.answers).length, missing);
    assert.equal(items.filter(e => e.answer).length, fix);
    assert.ok(!content.buildPool('PU2', 3, page).entries.some(e => e.item.unit === '3' && Number(e.item.page) > page));
    for (let sample = 0; sample < 20; sample++) {
        const picked = content.select('PU2', 3, page, 5);
        assert.equal(picked.length, 5);
        assert.ok(new Set(picked.map(e => e.type)).size >= 3);
    }
}
assert.ok(!content.buildPool('PU2', 2, 25).entries.some(e => e.item.unit === '3'));
assert.deepEqual(Array.from(pu2Unit3.find(e => e.id === 'M16').sentences), ['___ are you wearing a helmet?', "___ I'm riding my bike."]);
assert.deepEqual(Array.from(pu2Unit3.find(e => e.id === 'M16').answers), ['why','because']);
assert.ok(!pu2Unit3.some(e => e.id === 'F5'));
assert.equal(pu2Unit3.find(e => e.id === 'F22').sentence, "His hair hasn't got any curls. It's curly.");
assert.equal(pu2Unit3.find(e => e.id === 'F22').answer, 'straight');
for (const item of pu2Unit3.filter(e => e.prefixes)) {
    assert.equal(item.prefixes.length, item.answers.length);
    item.prefixes.forEach((prefix, i) => assert.ok(item.answers[i].startsWith(prefix)));
}
assert.equal(new Set(pu2Unit3.filter(e => e.answer).map(e => e.sentence)).size, 27);
const pu2Unit4 = content.buildPool('PU2', 4, 54).entries.filter(e => e.item.id && e.item.unit === '4').map(e => e.item);
assert.equal(pu2Unit4.filter(e => e.answers).length, 30);
assert.equal(pu2Unit4.filter(e => e.answer).length, 40);
assert.equal(new Set([...pu2Unit1, ...pu2Unit2, ...pu2Unit3, ...pu2Unit4].map(e => e.key)).size, 219);
for (const [page, missing, fix] of [[45,4,6],[46,4,4],[47,7,12],[54,15,18]]) {
    const items = pu2Unit4.filter(e => e.page === String(page));
    assert.equal(items.filter(e => e.answers).length, missing);
    assert.equal(items.filter(e => e.answer).length, fix);
    assert.ok(!content.buildPool('PU2', 4, page).entries.some(e => e.item.unit === '4' && Number(e.item.page) > page));
    for (let sample = 0; sample < 20; sample++) {
        const picked = content.select('PU2', 4, page, 5);
        assert.equal(picked.length, 5);
        assert.ok(new Set(picked.map(e => e.type)).size >= 3);
    }
}
assert.ok(!content.buildPool('PU2', 3, 43).entries.some(e => e.item.unit === '4'));
for (const [id, answers] of [['M25',['than','is','than']], ['M26',['bigger','is','than']], ['M27',['than','is','shorter','than']]]) {
    assert.deepEqual(Array.from(pu2Unit4.find(e => e.id === id).answers), answers);
    assert.equal(pu2Unit4.find(e => e.id === id).prefixes, undefined);
}
assert.deepEqual(Array.from(pu2Unit4.find(e => e.id === 'M27').sentences), ['My hair is longer ___ yours.', 'Your hair ___ ___ ___ mine.']);
for (const id of ['M28','M29','M30']) {
    assert.deepEqual(Array.from(pu2Unit4.find(e => e.id === id).answers), ['floor','roof']);
    assert.equal(pu2Unit4.find(e => e.id === id).prefixes, undefined);
}
for (const id of ['F19','F20','F21','F22','F23']) assert.equal(pu2Unit4.find(e => e.id === id).wrongIndex, 5);
for (const item of pu2Unit4.filter(e => e.prefixes)) {
    assert.equal(item.prefixes.length, item.answers.length);
    item.prefixes.forEach((prefix, i) => assert.ok(item.answers[i].startsWith(prefix)));
}
assert.equal(new Set(pu2Unit4.filter(e => e.answer).map(e => e.sentence)).size, 40);
const pu2Unit5 = content.buildPool('PU2', 5, 62).entries.filter(e => e.item.id && e.item.unit === '5').map(e => e.item);
assert.equal(pu2Unit5.filter(e => e.answers).length, 28);
assert.equal(pu2Unit5.filter(e => e.answer).length, 34);
assert.equal(new Set([...pu2Unit1, ...pu2Unit2, ...pu2Unit3, ...pu2Unit4, ...pu2Unit5].map(e => e.key)).size, 281);
for (const [page, missing, fix] of [[57,6,8],[59,10,14],[60,6,4],[62,6,8]]) {
    const items = pu2Unit5.filter(e => e.page === String(page));
    assert.equal(items.filter(e => e.answers).length, missing);
    assert.equal(items.filter(e => e.answer).length, fix);
    assert.ok(!content.buildPool('PU2', 5, page).entries.some(e => e.item.unit === '5' && Number(e.item.page) > page));
    for (let sample = 0; sample < 20; sample++) {
        const picked = content.select('PU2', 5, page, 5);
        assert.equal(picked.length, 5);
        assert.ok(new Set(picked.map(e => e.type)).size >= 3);
    }
}
assert.ok(pu2Unit5.filter(e => e.page === '59').every(e => e.key === 'non-spelling:' + e.type + ':pu2:5:60:' + e.id.toLowerCase()));
assert.ok(!content.buildPool('PU2', 4, 54).entries.some(e => e.item.unit === '5'));
for (const [id, answers] of [['M25',['meat','fish','carnivores']], ['M26',['meat','plants','omnivores']], ['M27',['plants','herbivores']], ['M28',['bears','polar','bears']]]) {
    assert.deepEqual(Array.from(pu2Unit5.find(e => e.id === id).answers), answers);
}
assert.equal(pu2Unit5.find(e => e.id === 'M2').sentences[0], 'A ___ is a big cat with long hair.');
assert.equal(pu2Unit5.find(e => e.id === 'M3').sentences[1], 'A ___ is a colourful bird that can sometimes speak.');
assert.equal(pu2Unit5.find(e => e.id === 'F11').wrongIndex, 10);
for (const [id, sentence, answer] of [
    ['F31', "Lions eat plants. They're carnivores.", 'meat'],
    ['F32', "Rabbits eat meat. They're herbivores.", 'plants'],
    ['F33', "People eat both meat and poopoo. We're omnivores.", 'plants']
]) {
    assert.equal(pu2Unit5.find(e => e.id === id).sentence, sentence);
    assert.equal(pu2Unit5.find(e => e.id === id).answer, answer);
}
for (const item of pu2Unit5.filter(e => e.prefixes)) {
    assert.equal(item.prefixes.length, item.answers.length);
    item.prefixes.forEach((prefix, i) => assert.ok(item.answers[i].startsWith(prefix)));
}
assert.equal(new Set(pu2Unit5.filter(e => e.answer).map(e => e.sentence)).size, 34);
const pu2Unit6 = content.buildPool('PU2', 6, 81).entries.filter(e => e.item.id && e.item.unit === '6').map(e => e.item);
assert.equal(pu2Unit6.filter(e => e.answers).length, 23);
assert.equal(pu2Unit6.filter(e => e.answer).length, 29);
assert.ok(!pu2Unit6.some(e => e.id === 'M5' || e.id === 'F5'));
assert.equal(new Set([...pu2Unit1, ...pu2Unit2, ...pu2Unit3, ...pu2Unit4, ...pu2Unit5, ...pu2Unit6].map(e => e.key)).size, 333);
for (const [page, missing, fix] of [[78,19,23],[81,4,6]]) {
    const items = pu2Unit6.filter(e => e.page === String(page));
    assert.equal(items.filter(e => e.answers).length, missing);
    assert.equal(items.filter(e => e.answer).length, fix);
    assert.ok(!content.buildPool('PU2', 6, page).entries.some(e => e.item.unit === '6' && Number(e.item.page) > page));
    for (let sample = 0; sample < 20; sample++) {
        const picked = content.select('PU2', 6, page, 5);
        assert.equal(picked.length, 5);
        assert.ok(new Set(picked.map(e => e.type)).size >= 3);
    }
}
assert.ok(!content.buildPool('PU2', 5, 62).entries.some(e => e.item.unit === '6'));
for (const [id, sentences, answers] of [
    ['M13', ['It ___ cold yesterday.','___ hot today.'], ['was',"it's"]],
    ['M14', ['We ___ on holiday last week.','___ at school today.'], ['were',"we're"]]
]) {
    const item = pu2Unit6.find(e => e.id === id);
    assert.deepEqual(Array.from(item.sentences), sentences);
    assert.deepEqual(Array.from(item.answers), answers);
    assert.equal(item.prefixes, undefined);
}
for (const id of ['F25','F26']) assert.equal(pu2Unit6.find(e => e.id === id).wrongIndex, 5);
for (const item of pu2Unit6.filter(e => e.prefixes)) {
    assert.equal(item.prefixes.length, item.answers.length);
    item.prefixes.forEach((prefix, i) => assert.ok(item.answers[i].startsWith(prefix)));
}
assert.equal(new Set(pu2Unit6.filter(e => e.answer).map(e => e.sentence)).size, 29);
const pu2Unit7 = content.buildPool('PU2', 7, 87).entries.filter(e => e.item.id && e.item.unit === '7').map(e => e.item);
assert.equal(pu2Unit7.filter(e => e.answers).length, 28);
assert.equal(pu2Unit7.filter(e => e.answer).length, 36);
assert.equal(new Set([...pu2Unit1, ...pu2Unit2, ...pu2Unit3, ...pu2Unit4, ...pu2Unit5, ...pu2Unit6, ...pu2Unit7].map(e => e.key)).size, 397);
for (const [page, missing, fix] of [[83,6,8],[85,10,12],[87,12,16]]) {
    const items = pu2Unit7.filter(e => e.page === String(page));
    assert.equal(items.filter(e => e.answers).length, missing);
    assert.equal(items.filter(e => e.answer).length, fix);
    assert.ok(!content.buildPool('PU2', 7, page).entries.some(e => e.item.unit === '7' && Number(e.item.page) > page));
    for (let sample = 0; sample < 20; sample++) {
        const picked = content.select('PU2', 7, page, 5);
        assert.equal(picked.length, 5);
        assert.ok(new Set(picked.map(e => e.type)).size >= 3);
    }
}
assert.ok(!content.buildPool('PU2', 6, 81).entries.some(e => e.item.unit === '7'));
const pu2Unit7M1 = pu2Unit7.find(e => e.id === 'M1');
assert.deepEqual(Array.from(pu2Unit7M1.sentences), ["I've got some bread and some ___.", 'I can make a ___ ___.']);
assert.deepEqual(Array.from(pu2Unit7M1.answers), ['cheese','cheese','sandwich']);
assert.deepEqual(Array.from(pu2Unit7M1.prefixes), ['ch','ch','s']);
for (const item of pu2Unit7.filter(e => e.prefixes)) {
    assert.equal(item.prefixes.length, item.answers.length);
    item.prefixes.forEach((prefix, i) => assert.ok(item.answers[i].startsWith(prefix)));
}
assert.equal(new Set(pu2Unit7.filter(e => e.answer).map(e => e.sentence)).size, 36);
const pu2Unit8 = content.buildPool('PU2', 8, 104).entries.filter(e => e.item.id && e.item.unit === '8').map(e => e.item);
assert.equal(pu2Unit8.filter(e => e.answers).length, 29);
assert.equal(pu2Unit8.filter(e => e.answer).length, 39);
assert.ok(!pu2Unit8.some(e => e.id === 'M30' || e.id === 'F40'));
assert.equal(new Set([...pu2Unit1, ...pu2Unit2, ...pu2Unit3, ...pu2Unit4, ...pu2Unit5, ...pu2Unit6, ...pu2Unit7, ...pu2Unit8].map(e => e.key)).size, 465);
for (const [page, missing, fix] of [[95,4,6],[96,7,10],[97,5,6],[98,6,8],[104,7,9]]) {
    const items = pu2Unit8.filter(e => e.page === String(page));
    assert.equal(items.filter(e => e.answers).length, missing);
    assert.equal(items.filter(e => e.answer).length, fix);
    assert.ok(!content.buildPool('PU2', 8, page).entries.some(e => e.item.unit === '8' && Number(e.item.page) > page));
    for (let sample = 0; sample < 20; sample++) {
        const picked = content.select('PU2', 8, page, 5);
        assert.equal(picked.length, 5);
        assert.ok(new Set(picked.map(e => e.type)).size >= 3);
    }
}
assert.ok(!content.buildPool('PU2', 7, 93).entries.some(e => e.item.unit === '8'));
for (const [id, answers, prefixes] of [
    ['M7',['lost','found'],['l','f']], ['M8',['gave','hid'],['g','h']],
    ['M10',['sat','was','slept'],['s','w','s']], ['M29',['crossing','light'],['c','l']]
]) {
    const item = pu2Unit8.find(e => e.id === id);
    assert.deepEqual(Array.from(item.answers), answers);
    assert.deepEqual(Array.from(item.prefixes), prefixes);
}
assert.equal(pu2Unit8.find(e => e.id === 'M2').sentences[1], 'We use a ___ to know where to go.');
assert.equal(pu2Unit8.find(e => e.id === 'M5').sentences[1], 'He cooked his lunch at home, then ___ it on the train.');
assert.equal(pu2Unit8.find(e => e.id === 'M8').sentences[1], "She and Grandpa ___ behind the sofa and said 'Surprise!' when I came in.");
for (const [id, sentence, wrong, answer] of [
    ['F1','We leave our car in the car station.','station','park'],
    ['F2','We catch a train at the train park.','park','station'],
    ['F3','We have to buy a sandwich to get on the train.','sandwich','ticket'],
    ['F4','We use a menu to know where to go.','menu','map'],
    ['F29','We can catch a bus at the bus park.','park','station']
]) {
    const item = pu2Unit8.find(e => e.id === id);
    assert.equal(item.sentence, sentence); assert.equal(item.wrongWord, wrong); assert.equal(item.answer, answer);
}
for (const item of pu2Unit8.filter(e => e.prefixes)) {
    assert.equal(item.prefixes.length, item.answers.length);
    item.prefixes.forEach((prefix, i) => assert.ok(item.answers[i].startsWith(prefix)));
}
assert.equal(new Set(pu2Unit8.filter(e => e.answer).map(e => e.sentence)).size, 39);
const pu2Unit9 = content.buildPool('PU2', 9, 119).entries.filter(e => e.item.id && e.item.unit === '9').map(e => e.item);
assert.equal(pu2Unit9.filter(e => e.answers).length, 28);
assert.equal(pu2Unit9.filter(e => e.answer).length, 34);
assert.ok(!pu2Unit9.some(e => e.id === 'F22' || e.id === 'F23'));
assert.equal(new Set([...pu2Unit1, ...pu2Unit2, ...pu2Unit3, ...pu2Unit4, ...pu2Unit5, ...pu2Unit6, ...pu2Unit7, ...pu2Unit8, ...pu2Unit9].map(e => e.key)).size, 527);
for (const [page, missing, fix] of [[107,6,8],[109,8,10],[116,8,8],[119,6,8]]) {
    const items = pu2Unit9.filter(e => e.page === String(page));
    assert.equal(items.filter(e => e.answers).length, missing);
    assert.equal(items.filter(e => e.answer).length, fix);
    assert.ok(!content.buildPool('PU2', 9, page).entries.some(e => e.item.unit === '9' && Number(e.item.page) > page));
    for (let sample = 0; sample < 20; sample++) {
        const picked = content.select('PU2', 9, page, 5);
        assert.equal(picked.length, 5);
        assert.ok(new Set(picked.map(e => e.type)).size >= 3);
    }
}
assert.ok(!content.buildPool('PU2', 8, 104).entries.some(e => e.item.unit === '9'));
for (const [id, answers, prefixes] of [
    ['M8',['more','exciting','boring','than'],['','e','b','']],
    ['M9',['more','difficult','dangerous','than'],['','d','d','']],
    ['M10',['was','easier','is','hungrier','than'],['w','e','','h','t']],
    ['M11',['thirstier','than','was','more','than'],['t','t','','','']],
    ['M13',['is','more','than'],['','m','t']],
    ['M14',['is','more','than','was','more','boring','than'],['','','','w','','b','']],
    ['M17',['one','of','the','most','the','most'],['o','o','','m','','']],
    ['M18',['the','most','one','of','the','most'],['','m','o','o','','']]
]) {
    const item = pu2Unit9.find(e => e.id === id);
    assert.deepEqual(Array.from(item.answers), answers);
    assert.deepEqual(Array.from(item.prefixes), prefixes);
}
assert.equal(pu2Unit9.find(e => e.id === 'M3').sentences[1], "I'm ___ of big, angry dogs.");
assert.deepEqual(Array.from(pu2Unit9.find(e => e.id === 'M13').sentences), ['This game ___ ___ exciting ___ that one.']);
assert.equal(pu2Unit9.find(e => e.id === 'M17').sentences[0], 'This is ___ ___ ___ ___ beautiful cities in the world.');
for (const [id, sentence, answer] of [
    ['F6','The ride was boring. Everyone thought it was so much fun!','exciting'],
    ['F7','The test was easy. Everyone got 0/100.','difficult'],
    ['F8','Fighting bears is very safe. You can get badly hurt doing it.','dangerous']
]) {
    assert.equal(pu2Unit9.find(e => e.id === id).sentence, sentence);
    assert.equal(pu2Unit9.find(e => e.id === id).answer, answer);
}
for (const item of pu2Unit9.filter(e => e.prefixes)) {
    assert.equal(item.prefixes.length, item.answers.length);
    item.prefixes.forEach((prefix, i) => assert.ok(item.answers[i].startsWith(prefix)));
}
assert.equal(new Set(pu2Unit9.filter(e => e.answer).map(e => e.sentence)).size, 34);
const pu1Approved = [];
for (const [unit, lastPage, missing, fixes, pages] of [
    [0, 8, 13, 14, [[5,9,8],[7,2,2],[8,2,4]]],
    [1, 16, 18, 24, [[9,4,4],[10,2,4],[11,4,6],[12,2,2],[13,2,2],[16,4,6]]],
    [2, 26, 26, 36, [[19,4,4],[20,2,4],[21,4,4],[22,6,8],[23,4,6],[26,6,10]]],
    [3, 43, 28, 36, [[31,4,4],[32,2,2],[33,4,6],[34,4,4],[35,4,6],[36,3,4],[37,3,4],[43,4,6]]],
    [4, 54, 22, 32, [[45,5,6],[47,7,10],[48,4,6],[54,6,10]]],
    [5, 63, 28, 36, [[57,5,6],[59,8,10],[60,5,6],[61,6,8],[63,4,6]]],
    [6, 81, 32, 46, [[78,28,40],[81,4,6]]],
    [7, 92, 28, 36, [[83,8,8],[85,8,12],[92,12,16]]]
]) {
    const items = content.buildPool('PU1', unit, lastPage).entries.filter(e => e.item.id && e.item.unit === String(unit)).map(e => e.item);
    pu1Approved.push(...items);
    assert.equal(items.filter(e => e.answers).length, missing);
    assert.equal(items.filter(e => e.answer).length, fixes);
    for (const [page, m, f] of pages) {
        assert.equal(items.filter(e => e.page === String(page) && e.answers).length, m);
        assert.equal(items.filter(e => e.page === String(page) && e.answer).length, f);
        assert.ok(!content.buildPool('PU1', unit, page).entries.some(e => e.item.unit === String(unit) && Number(e.item.page) > page));
        for (let sample = 0; sample < 20; sample++) {
            const picked = content.select('PU1', unit, page, 5);
            assert.equal(picked.length, 5);
            assert.ok(new Set(picked.map(e => e.type)).size >= 3);
        }
    }
    for (const item of items.filter(e => e.prefixes)) item.prefixes.forEach((prefix, i) => assert.ok(item.answers[i].startsWith(prefix)));
}
assert.equal(new Set(pu1Approved.map(e => e.key)).size, 455, 'PU1 units have distinct stable SR keys');
assert.deepEqual(Array.from(pu1Approved.find(e => e.unit === '1' && e.id === 'M12').sentences), ['Here you ___!', '___ you very much.'], 'M12 includes both approved blanks');
assert.ok(!content.buildPool('PU1', 1, 16).entries.some(e => e.item.unit === '2'), 'Unit 2 stays out of Unit 1');
const pu1Unit2 = pu1Approved.filter(e => e.unit === '2');
assert.deepEqual(pu1Unit2.filter(e => e.answers).map(e => e.id).sort(), Array.from({length: 26}, (_, i) => 'M' + (i + 1)).sort());
assert.deepEqual(pu1Unit2.filter(e => e.answer).map(e => e.id).sort(), Array.from({length: 36}, (_, i) => 'F' + (i + 1)).sort());
assert.equal(new Set(pu1Unit2.filter(e => e.answer).map(e => e.sentence)).size, 36);
const pu1Unit2M24 = pu1Unit2.find(e => e.id === 'M24');
assert.deepEqual(Array.from(pu1Unit2M24.prefixes), ['', 'e', '', 'e']);
assert.deepEqual(Array.from(pu1Unit2M24.answers), ['has', 'eyes', 'have', 'eyes']);
for (const id of ['M25','M26','F33','F34','F35','F36']) assert.equal(pu1Unit2.find(e => e.id === id).page, '26', 'senses stay in approved review grouping');
assert.deepEqual(Array.from(pu1Unit2.find(e => e.id === 'M20').answers), ["i've", "they've"]);
assert.ok(!content.buildPool('PU1', 2, 26).entries.some(e => e.item.unit === '3'), 'Unit 3 stays out of Unit 2');
const pu1Unit3 = pu1Approved.filter(e => e.unit === '3');
assert.deepEqual(pu1Unit3.filter(e => e.answers).map(e => e.id).sort(), Array.from({length: 28}, (_, i) => 'M' + (i + 1)).sort());
assert.deepEqual(pu1Unit3.filter(e => e.answer).map(e => e.id).sort(), Array.from({length: 36}, (_, i) => 'F' + (i + 1)).sort());
assert.equal(new Set(pu1Unit3.filter(e => e.answer).map(e => e.sentence)).size, 36);
assert.equal(pu1Unit3.find(e => e.id === 'F13').sentence, "😊 It's a sad dog.");
assert.equal(pu1Unit3.find(e => e.id === 'F14').sentence, "😠 It's a happy cat.");
assert.deepEqual(Array.from(pu1Unit3.find(e => e.id === 'M23').answers), ['legs', 'long']);
assert.deepEqual(Array.from(pu1Unit3.find(e => e.id === 'M21').answers), ['comes', 'come']);
assert.deepEqual(Array.from(pu1Unit3.find(e => e.id === 'M26').answers), ["it's", "they've"]);
for (const [id, wrong, answer] of [['F23','bees','cows'],['F24','cows','chickens'],['F25','sheep','bees'],['F26','chickens','sheep'],['F27','two','four'],['F28','short','long']]) {
    const item = pu1Unit3.find(e => e.id === id); assert.equal(item.wrongWord, wrong); assert.equal(item.answer, answer);
}
assert.ok(!content.buildPool('PU1', 3, 43).entries.some(e => e.item.unit === '4'), 'Unit 4 stays out of Unit 3');
const pu1Unit4 = pu1Approved.filter(e => e.unit === '4');
assert.deepEqual(pu1Unit4.filter(e => e.answers).map(e => e.id).sort(), Array.from({length: 24}, (_, i) => 'M' + (i + 1)).filter(id => !['M21','M23'].includes(id)).sort());
assert.deepEqual(pu1Unit4.filter(e => e.answer).map(e => e.id).sort(), Array.from({length: 32}, (_, i) => 'F' + (i + 1)).sort());
assert.equal(new Set(pu1Unit4.filter(e => e.answer).map(e => e.sentence)).size, 32);
assert.ok(!pu1Unit4.some(e => ['M21','M23'].includes(e.id)), 'teacher-rejected pairs stay omitted');
const pu1Unit4M16 = pu1Unit4.find(e => e.id === 'M16');
assert.equal(pu1Unit4M16.sentences[1], 'I eat two ___ and eggs for breakfast.');
assert.deepEqual(Array.from(pu1Unit4M16.answers), ['beans','sausages','meatballs']);
assert.deepEqual(Array.from(pu1Unit4M16.prefixes), ['b','s','m']);
assert.ok(!pu1Unit4.some(e => JSON.stringify(e).includes('🌭')), 'no misleading hot-dog emoji');
const pu1Unit4F22 = pu1Unit4.find(e => e.id === 'F22');
assert.equal(pu1Unit4F22.sentence, "These are balls of meat. They're grapeballs.");
assert.equal(pu1Unit4F22.wrongWord, 'grapeballs');
assert.equal(pu1Unit4F22.answer, 'meatballs');
assert.deepEqual(Array.from(pu1Unit4.find(e => e.id === 'M18').prefixes), ['', 'p']);
assert.ok(!content.buildPool('PU1', 4, 54).entries.some(e => e.item.unit === '5'), 'Unit 5 stays out of Unit 4');
const pu1Unit5 = pu1Approved.filter(e => e.unit === '5');
assert.deepEqual(pu1Unit5.filter(e => e.answers).map(e => e.id).sort(), Array.from({length: 28}, (_, i) => 'M' + (i + 1)).sort());
assert.deepEqual(pu1Unit5.filter(e => e.answer).map(e => e.id).sort(), Array.from({length: 36}, (_, i) => 'F' + (i + 1)).sort());
assert.equal(new Set(pu1Unit5.filter(e => e.answer).map(e => e.sentence)).size, 36);
assert.equal(pu1Unit5.find(e => e.id === 'M2').sentences[0], 'We fly to Beijing in a ___.');
const pu1Unit5M14 = pu1Unit5.find(e => e.id === 'M14');
assert.deepEqual(Array.from(pu1Unit5M14.answers), ['balloons','helicopter']);
assert.deepEqual(Array.from(pu1Unit5M14.prefixes), ['ballo','heli']);
assert.deepEqual(Array.from(pu1Unit5M14.sentences), ["I've got six ___ for my birthday party.", 'My toy ___ can fly.']);
assert.deepEqual(Array.from(pu1Unit5.find(e => e.id === 'M4').answers), ['doll','doll','house']);
assert.equal(pu1Unit5.find(e => e.id === 'M15').sentences.length, 1, 'computer and mouse share the approved sentence');
for (const id of ['M19','M20','M21']) assert.equal(pu1Unit5.find(e => e.id === id).answers.length, 4, 'birthday boards practise want/wants and possession together');
for (const [id, wrong, answer] of [['F17','balloon','balloons'],['F18','helicopter','helicopters'],['F31','squares','circles'],['F34','circle','rectangle']]) {
    const item = pu1Unit5.find(e => e.id === id); assert.equal(item.wrongWord, wrong); assert.equal(item.answer, answer);
}
assert.ok(!pu1Unit5.some(e => /wings|blades|put air in|🪁|🚲|✈️|🚗|⚽|🤖|🎈|🚁|🖥️|⌨️|📻|🧸|🔴|🟦|🔺|▭/u.test(JSON.stringify(e))), 'approved simple contexts replace difficult clues and toy/shape emojis');
assert.ok(!content.buildPool('PU1', 5, 63).entries.some(e => e.item.unit === '6'), 'Unit 6 stays out of Unit 5');
const pu1Unit6 = pu1Approved.filter(e => e.unit === '6');
assert.deepEqual(pu1Unit6.filter(e => e.answers).map(e => e.id).sort(), Array.from({length: 34}, (_, i) => 'M' + (i + 1)).filter(id => !['M25','M26'].includes(id)).sort());
assert.deepEqual(pu1Unit6.filter(e => e.answer).map(e => e.id).sort(), Array.from({length: 48}, (_, i) => 'F' + (i + 1)).filter(id => !['F25','F26'].includes(id)).sort());
assert.equal(new Set(pu1Unit6.filter(e => e.answer).map(e => e.sentence)).size, 46);
assert.deepEqual(Array.from(pu1Unit6.find(e => e.id === 'M4').sentences), ['We can go to Beijing by plane or by ___.', "I go to school in my mum's ___."]);
assert.equal(pu1Unit6.find(e => e.id === 'M6').sentences[0], 'This brown ___ is very tall.');
for (const [id, sentences, answers] of [
    ['M11',['There ___ any cars in the garden.','There ___ a bus in the classroom.'],["aren't","isn't"]],
    ['M12',['There ___ any buses in the classroom.','There ___ two lorries in the street.'],["aren't",'are']]
]) {
    const item = pu1Unit6.find(e => e.id === id);
    assert.deepEqual(Array.from(item.sentences), sentences);
    assert.deepEqual(Array.from(item.answers), answers);
    assert.ok(!item.prefixes, 'revised agreement boards have no locked hints');
}
for (const id of ['M31','M32','M33','M34']) {
    const item = pu1Unit6.find(e => e.id === id);
    assert.deepEqual(Array.from(item.answers).sort(), ['their',"they're",'there'].sort(), id + ' practises all three homophones');
    assert.equal(item.page, '78');
    assert.ok(!item.prefixes, 'homophones are selected from context without initial hints');
}
for (const [id, wrong, answer] of [
    ['F41','their','there'],['F42',"they're",'there'],['F43','there',"they're"],['F44','their',"they're"],
    ['F45',"they're",'their'],['F46','there','their'],['F47','their',"they're"],['F48',"they're",'there']
]) {
    const item = pu1Unit6.find(e => e.id === id);
    assert.equal(item.wrongWord, wrong); assert.equal(item.answer, answer); assert.equal(item.page, '78');
}
assert.ok(!content.buildPool('PU1', 6, 81).entries.some(e => e.item.unit === '7'), 'Unit 7 stays out of Unit 6');
const pu1Unit7 = pu1Approved.filter(e => e.unit === '7');
assert.deepEqual(pu1Unit7.filter(e => e.answers).map(e => e.id).sort(), Array.from({length: 28}, (_, i) => 'M' + (i + 1)).sort());
assert.deepEqual(pu1Unit7.filter(e => e.answer).map(e => e.id).sort(), Array.from({length: 36}, (_, i) => 'F' + (i + 1)).sort());
assert.equal(new Set(pu1Unit7.filter(e => e.answer).map(e => e.sentence)).size, 36);
assert.deepEqual(Array.from(pu1Unit7.find(e => e.id === 'M1').prefixes), ['f','b']);
assert.deepEqual(Array.from(pu1Unit7.find(e => e.id === 'M3').sentences), ['I can play ___ on the ___ or on a ___.']);
assert.deepEqual(Array.from(pu1Unit7.find(e => e.id === 'M3').answers), ['music','piano','guitar']);
assert.deepEqual(Array.from(pu1Unit7.find(e => e.id === 'M3').prefixes), ['m','p','g']);
const pu1Unit7M4 = pu1Unit7.find(e => e.id === 'M4');
assert.deepEqual(Array.from(pu1Unit7M4.sentences), ['After school, I like watching ___ or going for a ___ in the ___ pool.']);
assert.deepEqual(Array.from(pu1Unit7M4.answers), ['tv','swim','swimming']);
assert.deepEqual(Array.from(pu1Unit7M4.suffixes), ['','','ming']);
assert.deepEqual(Array.from(pu1Unit7.find(e => e.id === 'M17').prefixes), ['b','h']);
for (const item of pu1Unit7.filter(e => e.suffixes)) {
    assert.equal(item.suffixes.length, item.answers.length);
    item.suffixes.forEach((suffix, index) => {
        assert.ok(item.answers[index].endsWith(suffix));
        assert.ok(item.answers[index].length > suffix.length + ((item.prefixes || [])[index] || '').length);
    });
}
assert.ok(!content.buildPool('PU1', 7, 92).entries.some(e => e.item.unit === '8'), 'Unit 8 stays out of Unit 7');
for (const item of [...pu1Approved, ...unit1, ...unit2, ...unit3, ...unit4, ...unit5, ...unit6, ...unit7, ...unit8, ...unit9, ...pu2Unit1, ...pu2Unit2, ...pu2Unit3, ...pu2Unit4, ...pu2Unit5, ...pu2Unit6, ...pu2Unit7, ...pu2Unit8, ...pu2Unit9]) {
    if (item.answers) assert.equal(item.sentences.join(' ').split('___').length - 1, item.answers.length, item.id + ' has one target per blank');
    else if (Number.isInteger(item.wrongIndex)) assert.equal(item.sentence.split(' ')[item.wrongIndex].replace(/[.,!?]+$/, '').toLowerCase(), item.wrongWord, item.id + ' explicitly identifies its repeated wrong token');
    else assert.equal(item.sentence.split(' ').filter(word => word.replace(/[.,!?]+$/, '').toLowerCase() === item.wrongWord).length, 1, item.id + ' identifies exactly one wrong token');
}
for (let sample = 0; sample < 100; sample++) {
    const picked = content.select('PU3', 1, 16, 5);
    assert.equal(picked.length, 5);
    assert.ok(new Set(picked.map(e => e.type)).size >= 3, 'Unit 1 selects a varied five-board round');
    const next = content.select('PU3', 2, 28, 5);
    assert.equal(next.length, 5);
    assert.ok(new Set(next.map(e => e.type)).size >= 3, 'Unit 2 selects a varied five-board round');
    const third = content.select('PU3', 3, 40, 5);
    assert.equal(third.length, 5);
    assert.ok(new Set(third.map(e => e.type)).size >= 3, 'Unit 3 selects a varied five-board round');
}
for (let sample = 0; sample < 400; sample++) {
    const picked = content.select('PU3', 9, 109, 5);
    assert.equal(picked.length, 5);
    assert.ok(new Set(picked.map(p => p.type)).size >= 3, 'five boards include at least three eligible types');
    assert.equal(new Set(picked.map(p => p.type + ':' + p.key)).size, 5, 'boards are unique');
    const pairKeys = picked.flatMap(p => p.pairs || []).map(sandbox.itemKey);
    assert.equal(new Set(pairKeys).size, pairKeys.length, 'matching pairs are never repeated within the round');
    for (const board of picked.filter(p => p.type === 'sentence-match')) assert.equal(board.pairs.length, 3, 'one matching board contains three pairs');
}
vm.runInContext(`
TEACHING_CONTENT.pilot = { '1': {
  '1': { vocab: ['old'], sentences: Array.from({length:12}, (_,i) => 'Old sentence '+i+'.'), sentencePairs: [] },
  '2': { vocab: ['new'], sentences: Array.from({length:12}, (_,i) => 'New sentence '+i+'.'), sentencePairs: [], nonSpellingExercises: [
    ...Array.from({length:5}, (_,i) => ({type:'missing-word',id:'m'+i,sentences:['I ___ here.'],answers:['am']})),
    ...Array.from({length:5}, (_,i) => ({type:'find-fix',id:'f'+i,sentence:'I is here.',wrongWord:'is',answer:'am'})),
    { type:'sentence-match',pairs:Array.from({length:6}, (_,i)=>({a:'Question '+i,b:'Answer '+i})) },
    ...Array.from({length:12}, (_,i) => ({type:'sentence-scramble',sentence:'New sentence '+i+'.'}))
  ] },
  '3': { vocab:['future'],sentences:['Future sentence.'],sentencePairs:[] }
} };
AVAILABLE_CONTENT.pilot = { '1':[1,2,3] };
`, sandbox);
const pool = content.buildPool('pilot', 1, 2).entries;
assert.equal(pool.some(e => e.item.page === '3'), false, 'future curriculum stays excluded');
const cooledTyped = { sentences: {}, sentencePairs: {} };
for (const e of pool.filter(e => e.item.id)) cooledTyped.sentences[e.key] = { dueAfterSession: 10, lastResult: 'success' };
for (let i = 0; i < 40; i++) {
    const picked = content.select('pilot', 1, 2, 5, { srState: cooledTyped, session: 5 });
    assert.equal(picked.length, 5);
    assert.equal(picked.some(p => p.id), false, 'cooldown types are not pulled merely to force variety');
    assert.equal(new Set(picked.map(p => p.type)).size, 2, 'two eligible types remain a valid round');
}
const allCooled = { sentences: {}, sentencePairs: {} };
for (const e of pool) {
    for (const key of e.item.pairs ? e.item.pairs.map(sandbox.itemKey) : [e.key]) {
        allCooled[e.item.srType][key] = { dueAfterSession: 10, lastResult: 'success' };
    }
}
const due = pool.find(e => e.item.type === 'sentence-scramble');
allCooled.sentences[due.key] = { dueAfterSession: 4, lastResult: 'failure' };
const shortage = content.select('pilot', 1, 2, 5, { srState: allCooled, session: 5 });
assert.equal(shortage.length, 5, 'cooldown fills real shortages');
assert.ok(shortage.some(e => e.key === due.key), 'due failure stays in the shortage-filled round');
const duePair = pool.find(e => e.item.pairs).item.pairs[0];
allCooled.sentencePairs[sandbox.itemKey(duePair)] = { dueAfterSession: 4, lastResult: 'failure' };
const duePairRound = content.select('pilot', 1, 2, 5, { srState: allCooled, session: 5 });
assert.ok(duePairRound.some(e => e.pairs && e.pairs.some(p => sandbox.itemKey(p) === sandbox.itemKey(duePair))), 'one due matching pair is still reviewed with cooldown board partners');
const partialBoard = content.buildPool('pilot', 1, 2, { srState: allCooled, session: 5 }).entries.find(e => e.item.pairs && e.item.pairs.some(p => sandbox.itemKey(p) === sandbox.itemKey(duePair)));
assert.equal(partialBoard.varietyEligible, false, 'cooldown partners cannot be used solely for the variety quota');
const floor = content.select('pilot', 1, 2, 5, { srState: allCooled, session: 0 });
assert.equal(floor.length, 5, 'all-cooldown pool still produces a full round');
const legacyOnly = content.select('pilot', 1, 1, 5);
assert.ok(legacyOnly.every(e => e.type === 'sentence-scramble'), 'a page with just one type still works');
let nearest = 0;
for (let i = 0; i < 400; i++) {
    const picked = content.select('pilot', 1, 2, 1, { srState: cooledTyped, session: 5 });
    if (picked[0].page === '2') nearest++;
}
assert.ok(nearest > 320, 'nearer pages receive greater sampling weight');
const typed = pool.find(e => e.item.type === 'missing-word').item;
const oldState = { vocab: { old: { lastResult: 'success' } }, sentences: { old: { lastResult: 'success' } }, sentencePairs: {} };
const updated = sandbox.updateSRStateForSession(oldState, [{ type: 'sentences', key: typed.key, firstAttempt: false }], 5);
const delta = sandbox.extractSRDelta(updated, 5);
const merged = sandbox.mergeSRDelta(oldState, delta);
assert.equal(merged.sentences[typed.key].lastResult, 'failure', 'new IDs survive the existing SR delta wire format');
assert.equal(merged.sentences.old.lastResult, 'success', 'legacy sentence history survives new updates');
assert.equal(merged.vocab.old.lastResult, 'success', 'legacy vocabulary history survives new updates');
function enabledAt(address) {
    const location = new URL(address);
    const context = { window: { location }, URLSearchParams };
    vm.createContext(context);
    return vm.runInContext(fs.readFileSync('config.js', 'utf8') + '\nNON_SPELLING_ENABLED;', context);
}
assert.equal(enabledAt('https://vpietri-stack.github.io/Classroom-survivors/index.html'), false, 'production keeps the existing flow during preview testing');
assert.equal(enabledAt('https://vpietri-stack.github.io/Classroom-survivors-preview/index.html'), true, 'preview enables the mixed flow');
assert.equal(enabledAt('http://localhost:8123/index.html'), true, 'local development enables the mixed flow');
assert.equal(enabledAt('https://vpietri-stack.github.io/Classroom-survivors-preview/index.html?nonspelling=0'), false, 'preview can still verify the legacy flow');
console.log('Mixed non-spelling selection: 400 varied rounds, cooldown, proximity, vocabulary and SR compatibility passed.');
