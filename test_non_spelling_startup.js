'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright-core');
const sandbox = {
    console, Math: Object.assign(Object.create(Math), { random: () => .5 }),
    API_BASE_URL: '', document: { addEventListener() {} },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} }, getCurrentSession: () => 3
};
sandbox.window = sandbox;
vm.createContext(sandbox);
for (const file of ['sr_engine.js', 'teaching_content.js', 'content_pu1.js', 'content_pu2.js', 'content_pu3.js', 'content_think0.js', 'content_think1.js', 'content_think2.js', 'content_test.js', 'non_spelling_content.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), sandbox);
}
let checked = 0;
for (const book of vm.runInContext('Object.keys(AVAILABLE_CONTENT)', sandbox)) {
    for (const page of sandbox.getSortedPagesForBook(book)) {
        assert.ok(vm.runInContext('TEACHING_CONTENT[' + JSON.stringify(page.book) + '][' + JSON.stringify(page.unit) + ']?.[' + JSON.stringify(page.page) + ']', sandbox), 'advertised real page must have content: ' + book + ' U' + page.unit + ' p' + page.page);
        let round;
        assert.doesNotThrow(() => { round = sandbox.NonSpellingContent.select(book, page.unit, page.page, 5); }, book + ' U' + page.unit + ' p' + page.page + ' must not crash on a missing earlier page');
        assert.ok(round.length <= 5);
        for (const item of round) assert.ok(vm.runInContext('TEACHING_CONTENT[' + JSON.stringify(item.book) + '][' + JSON.stringify(item.unit) + '][' + JSON.stringify(item.page) + ']', sandbox), 'only loaded content can enter a round');
        checked++;
    }
}
assert.deepEqual(Array.from(vm.runInContext('AVAILABLE_CONTENT.PU1[2]', sandbox)), [19,20,21,22,23,26]);
assert.deepEqual(Array.from(vm.runInContext('AVAILABLE_CONTENT.PU2[4]', sandbox)), [45,46,47,54]);
assert.equal(sandbox.NonSpellingContent.select('PU2', 4, 47, 5).length, 5);
assert.ok(sandbox.NonSpellingContent.buildPool('PU2',4,47).entries.some(e => e.item.page === '47'), 'newly advertised page participates in selection');
assert.ok(!sandbox.NonSpellingContent.buildPool('PU2',4,46).entries.some(e => e.item.page === '47'), 'page 47 remains excluded from earlier study');
// Keep the original crash case as an isolated fixture, not a selectable page.
vm.runInContext('AVAILABLE_CONTENT.PU1[2].push(24,25);', sandbox);
const affected = sandbox.NonSpellingContent.buildPool('PU1', 2, 26);
assert.equal(sandbox.NonSpellingContent.select('PU1', 2, 26, 5).length, 5);
assert.ok(!affected.entries.some(e => ['24', '25'].includes(e.item.page)));

// Missing books/units/pages keep their absolute position but supply no exercises.
vm.runInContext(`
TEACHING_CONTENT.sparse = {
 '1': { '5': {vocab:['old'],sentences:['Old A.','Old B.','Old C.']}, '9': {vocab:['now'],sentences:['Current A.','Current B.','Current C.']} },
 '3': { '11': {vocab:['future'],sentences:['Future.']} }
};
AVAILABLE_CONTENT.missingPack = {'7':[3]};
AVAILABLE_CONTENT.sparse = {'1':[5,6,9],'2':[10],'3':[11]};
BOOK_SERIES.sparse = ['missingPack','sparse'];
`, sandbox);
const sparse = sandbox.NonSpellingContent.buildPool('sparse', 1, 9);
assert.equal(sparse.activeIndex, 3, 'gaps do not collapse curriculum positions');
assert.equal(sparse.entries.length, 6);
assert.ok(sparse.entries.every(e => ['5', '9'].includes(e.item.page)), 'future and unloaded pages are excluded');
assert.equal(sparse.entries.find(e => e.item.page === '5').score, .5 * Math.pow(.2, 2), 'proximity weight retains the unavailable intervening page');
assert.equal(sandbox.NonSpellingContent.select('sparse', 2, 10, 5).length, 5, 'missing current page can review already-loaded earlier material');
assert.equal(sandbox.NonSpellingContent.select('missingPack', 7, 3, 5).length, 0, 'a book with no loaded content yields an empty pool');
console.log('PASS: non-spelling selection starts safely on all ' + checked + ' listed pages; missing book/unit/page and proximity regressions');

(async () => {
    const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true, args: ['--allow-file-access-from-files', '--disable-web-security'] });
    const errors = [];
    try {
        const page = await browser.newPage();
        await page.route(/^https?:/, route => route.abort());
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(pathToFileURL(path.join(__dirname, 'index.html')).href + '?testMode=true&studentBook=PU1&studentUnit=2&studentPage=26');
        await page.waitForFunction(() => window.NonSpellingFlow && window.NonSpellingWidget);
        await page.evaluate(() => {
            window.playTTS = () => {}; window.SpeechStatus = { isReady: () => false }; if (window.AdaptiveSpeech) AdaptiveSpeech.enabled = false;
            apiFetch = async () => ({ ok: true, status: 200, json: async () => ({success:true}) });
            authActiveUser = { id: 'study-start-regression', role: 'student', sessionCount: 3, srState: {vocab:{},sentences:{},sentencePairs:{}}, targets: [] };
            selectedStudent = 'Test pupil';
            if(AVAILABLE_CONTENT.PU1[2].includes(24)||AVAILABLE_CONTENT.PU1[2].includes(25))throw Error('removed pages still selectable');
            if(!AVAILABLE_CONTENT.PU2[4].includes(47))throw Error('PU2 page 47 not selectable');
            // Exercise sparse availability defensively in this test context only.
            AVAILABLE_CONTENT.PU1[2].push(24,25);
        });
        for (const width of [1102, 319]) {
            await page.setViewportSize({width,height:892});
            for (const [book, unit, number] of [['PU1','2','23'],['PU1','2','24'],['PU1','2','25'],['PU1','2','26'],['PU1','9','111'],['PU2','4','47']]) {
                await page.evaluate(({book,unit,number}) => {
                    if(STUDY_STATE.active) exitStudyMode();
                    selectedClassContent = {book,unit,page:number};
                    document.getElementById('startScreen').classList.remove('hidden');
                }, {book,unit,number});
                await page.locator('#startScreen button[onclick="initStudyMode()"]').click({force:true});
                assert.ok(await page.evaluate(() => STUDY_STATE.active && STUDY_STATE.round === 'A' && STUDY_STATE.words.length === 5 && STUDY_STATE.nonSpellingExercises.length === 5), 'Study button starts '+book+' U'+unit+' p'+number+' at '+width+'px');
                assert.ok(await page.locator('#studyModeOverlay').isVisible());
                await page.evaluate(() => startRoundE());
                assert.ok(await page.evaluate(() => STUDY_STATE._mixedActive && ['E','F'].includes(STUDY_STATE.round)), 'mixed round renders on affected PU1 page');
            }
        }
        assert.deepEqual(errors, [], 'no startup or mixed-round script errors');
        console.log('PASS: real Study button and mixed round work on missing/earlier/later PU1 pages at desktop and 319px phone widths; no external API traffic');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
