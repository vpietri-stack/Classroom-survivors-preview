'use strict';
const assert = require('assert/strict');
const { chromium } = require('playwright-core');
const { pathToFileURL } = require('url');
const path = require('path');
const fs = require('fs');
const os = require('os');
const url = pathToFileURL(path.join(__dirname, 'index.html')).href + '?testMode=true&studentBook=PU3&studentUnit=9&studentPage=109';
let assertions = 0;
function ok(value, description) { assert.ok(value, description); assertions++; console.log('PASS: ' + description); }
async function click(page, selector) { await page.locator(selector).click(); }
async function type(page, text) { for (const letter of text) await click(page, '[data-letter="' + letter + '"]'); }
async function fillMissing(page, answers) {
    for (let i = 0; i < answers.length; i++) { await click(page, '[data-box="' + i + '"]'); await type(page, answers[i]); }
}
async function fillFix(page, index, text) {
    await click(page, '[data-word="' + index + '"]'); await click(page, '#bin'); await type(page, text);
}
async function waitBoard(page, index) { await page.waitForFunction(i => STUDY_STATE.currentNonSpellingIndex === i, index); }
(async () => {
    const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true,
        args: ['--allow-file-access-from-files', '--disable-web-security'] });
    const errors = [];
    try {
        const page = await browser.newPage({ viewport: { width: 1102, height: 892 } });
        // No test traffic may reach either live or preview services/model hosts.
        await page.route(/^https?:/, route => route.abort());
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(url);
        await page.waitForFunction(() => window.NonSpellingFlow && window.NonSpellingWidget);
        await page.evaluate(() => {
            window.playTTS = () => {}; window.synthError = () => {}; window.playHappySound = () => {};
            window.SpeechStatus = { isReady: () => false }; if (window.AdaptiveSpeech) AdaptiveSpeech.enabled = false;
            window.__savedRequests = [];
            apiFetch = async (url, options = {}) => {
                const body = options.body ? JSON.parse(options.body) : {};
                window.__savedRequests.push(body);
                return { ok: true, status: 200, json: async () => ({ success: true, addedEventIds: (body.events || []).map(e => e.eventId), duplicateEventIds: [], srSeq: body.srSeq }) };
            };
            authActiveUser = { id: 'non-spelling-test', role: 'student', sessionCount: 3, srState: { vocab: {}, sentences: {}, sentencePairs: {} }, targets: [] };
            isTestMode = false;
            selectedClassContent = { book: 'PU3', unit: '9', page: '109' };
            selectedStudent = 'Preview Test';
            initStudyMode();
            window.__initialTypes = STUDY_STATE.nonSpellingExercises.map(e => e.type);
            const pool = NonSpellingContent.buildPool('PU3', '9', '109').entries.map(e => e.item);
            window.__fixtureBoards = [pool.find(e => e.id === 'M1'), pool.find(e => e.id === 'F1'), pool.find(e => e.type === 'sentence-scramble'), pool.find(e => e.type === 'sentence-match'), pool.find(e => e.id === 'M2')];
            STUDY_STATE.nonSpellingExercises = window.__fixtureBoards;
            startRoundE();
        });
        ok(await page.evaluate(() => STUDY_STATE.words.length === 5 && new Set(window.__initialTypes).size >= 3), 'real Study init keeps five vocabulary words and selects a varied Round D');
        ok(await page.locator('#study-progress-indicator > *').count() === 4, 'mixed Study uses four progress markers');
        await click(page, '#check');
        ok(await page.evaluate(() => srStudyResults.length === 0), 'empty checks do not record SR outcomes');
        await fillMissing(page, ['after', 'before']); await click(page, '#check');
        ok(await page.evaluate(() => srStudyResults[0].firstAttempt === false), 'first submitted mistake immediately records an SR failure');
        await page.waitForTimeout(3100);
        ok(await page.evaluate(() => NonSpellingWidget.getState().input.every(value => value === '')), 'wrong missing-word board resets all blanks in the real app');
        await fillMissing(page, ['before', 'after']); await click(page, '#check');
        await waitBoard(page, 1);
        ok(await page.evaluate(() => srStudyResults.length === 1 && !srStudyResults[0].firstAttempt), 'retry success keeps the original failure without duplicate SR records');
        await fillFix(page, 0, 'before'); await click(page, '#check');
        ok(await page.locator('#bin.word-wrong').count() === 1 && await page.locator('.nse-answer.spelling-correct').count() === 1, 'real find/fix separates word-selection and spelling results');
        await click(page, '#clear'); await fillFix(page, 4, 'befor'); await click(page, '#check');
        await page.waitForTimeout(950);
        ok(!(await page.locator('#bin-label').isVisible()) && await page.locator('.letter.wrong').count() === 1, 'bin celebration remains independent when replacement spelling is wrong');
        await click(page, '#clear'); await fillFix(page, 4, 'before'); await click(page, '#check');
        await waitBoard(page, 2);
        const sentence = await page.evaluate(() => STUDY_STATE.sentences[0]);
        for (const word of (Array.isArray(sentence) ? sentence[0] : sentence).split(' ')) {
            await page.locator('#sentence-word-bank .study-word-tile').filter({ hasText: new RegExp('^' + word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }).first().click();
        }
        await page.evaluate(() => checkRoundE()); await waitBoard(page, 3);
        ok(await page.locator('.sentence-b-slot').count() === 3, 'one mixed matching board has three pairs');
        for (let i = 0; i < 3; i++) {
            await click(page, '.sentence-b-tile[data-correct-index="' + i + '"]');
            await click(page, '.sentence-b-slot[data-target-index="' + i + '"]');
        }
        await page.evaluate(() => checkRoundF()); await waitBoard(page, 4);
        ok(await page.evaluate(() => srStudyResults.filter(e => e.type === 'sentencePairs').length === 3), 'matching counts as one board while retaining three independent pair results');
        await fillMissing(page, ['before', 'after']); await click(page, '#check');
        await page.waitForFunction(() => STUDY_STATE.srFinalized && document.getElementById('study-title').textContent === 'Session Complete');
        ok(await page.evaluate(() => STUDY_STATE.currentNonSpellingIndex === 5), 'five mixed boards complete Study without a separate matching round');
        ok(await page.evaluate(() => authActiveUser.srState.sentences[window.__fixtureBoards[0].key].lastResult === 'failure'), 'completion stores the new exercise SR failure through the real finalizer');
        ok(await page.evaluate(() => window.__savedRequests.some(body => body.srDelta && body.srState.sentences[window.__fixtureBoards[0].key])), 'new exercise outcomes ride the existing SR delta wire payload');
        // Observe a failure, leave Study, and prove that a later widget cannot be reset by the old timer.
        await page.evaluate(() => { initStudyMode(); STUDY_STATE.nonSpellingExercises = [window.__fixtureBoards[0]]; startRoundE(); });
        await fillMissing(page, ['after', 'before']); await click(page, '#check');
        const sessionsBefore = await page.evaluate(() => authActiveUser.sessionCount);
        await page.evaluate(() => exitStudyMode());
        ok(await page.evaluate(() => !NonSpellingWidget.isActive() && authActiveUser.srState.sentences[window.__fixtureBoards[0].key].lastResult === 'failure'), 'exit cancels the widget and keeps observed failure progress');
        ok(await page.evaluate(() => authActiveUser.sessionCount) === sessionsBefore, 'partial Study does not advance the session counter');
        await page.evaluate(() => { initStudyMode(); STUDY_STATE.nonSpellingExercises = [window.__fixtureBoards[0]]; startRoundE(); });
        await type(page, 'b'); await page.waitForTimeout(3100);
        ok(await page.evaluate(() => NonSpellingWidget.getState().input[0] === 'b'), 'old reveal timers cannot clear a new Study draft');
        await page.evaluate(() => {
            exitStudyMode();
            window.__rewards = [];
            completeGomokuMove = success => window.__rewards.push(success);
            window.__forcePilot = id => {
                srInSessionFailures.clear(); srInSessionSuccesses.clear();
                const srState = { vocab: {}, sentences: {}, sentencePairs: {} };
                const entries = NonSpellingContent.buildPool('PU3', '9', '109').entries;
                for (const e of entries) {
                    for (const key of e.item.pairs ? e.item.pairs.map(itemKey) : [e.key]) srState[e.item.srType][key] = { dueAfterSession: 999, lastResult: 'success' };
                }
                // Random board grouping can omit leftover pairs. Cool every raw
                // pair as well so regrouping cannot introduce a fresh board.
                for (const pages of Object.values(TEACHING_CONTENT.PU3)) {
                    for (const content of Object.values(pages)) {
                        for (const pair of content.sentencePairs || []) srState.sentencePairs[itemKey(pair)] = { dueAfterSession: 999, lastResult: 'success' };
                    }
                }
                const chosen = entries.find(e => e.item.id === id && e.item.unit === '9' && e.item.page === '109').item;
                srState.sentences[chosen.key] = { dueAfterSession: 0, lastResult: 'failure' };
                authActiveUser.srState = srState;
                startMiniGame('scramble', 'gomoku');
            };
            window.__forcePilot('M1');
        });
        ok(await page.locator('#grammarGame.nse-typed').isVisible(), 'normal game challenge dispatch selects a new typed exercise');
        await fillMissing(page, ['before', 'after']); await click(page, '#check');
        ok(await page.locator('#next').textContent() === 'CONTINUE!', 'Gomoku uses its normal continue action');
        await page.locator('#next').click({ force: true });
        ok(await page.evaluate(() => window.__rewards.length === 1 && window.__rewards[0] && !NonSpellingWidget.isActive()), 'typed success reaches the real claimReward bridge and cleans up the widget');
        await page.setViewportSize({ width: 319, height: 892 });
        await page.evaluate(() => { document.body.classList.add('kid-friendly'); window.__forcePilot('F1'); });
        await fillFix(page, 0, 'before'); await click(page, '#check');
        ok(!(await page.locator('#result-action').isVisible()), 'a wrong game answer does not offer a reward');
        await click(page, '#clear'); await fillFix(page, 4, 'before'); await click(page, '#check');
        ok(await page.evaluate(() => srGameResults.some(e => e.key.includes(':f1') && !e.firstAttempt)), 'game retry preserves its first failed SR result');
        const screenshots = path.join(os.tmpdir(), 'classroom-non-spelling-integrated'); fs.mkdirSync(screenshots, { recursive: true });
        await page.waitForTimeout(950); await page.screenshot({ path: path.join(screenshots, 'phone-game-fix.png'), fullPage: true });
        ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'real app typed challenge fits a 319px phone');
        await page.locator('#next').click({ force: true });
        ok(await page.evaluate(() => window.__rewards.length === 2 && !document.getElementById('exercise-widget')), 'second typed challenge resumes the game without leaking controls');
        await page.evaluate(() => { startGrammarGame('I washed my hands before I ate lunch.'); });
        ok(await page.locator('#sentence-container').isVisible() && await page.locator('#grammar-actions').isVisible(), 'legacy grammar UI is restored after typed challenges');
        const approved = await page.evaluate(() => {
            const items = [['1', '16'], ['2', '28'], ['3', '40'], ['4', '54'], ['5', '57'], ['5', '59'], ['5', '66'], ['6', '69'], ['6', '71'], ['6', '73'], ['7', '83'], ['7', '85'], ['7', '87'], ['8', '95'], ['8', '97'], ['8', '98'], ['8', '99'], ['9', '107'], ['9', '110'], ['9', '111']].flatMap(([unit, page]) =>
                TEACHING_CONTENT.PU3[unit][page].nonSpellingExercises.filter(e => e.id).map(e => ({ ...e, book: 'PU3', unit, page })));
            for (const [unit, pages] of [['1', ['7', '9', '10', '16']], ['2', ['19', '21', '22', '25']], ['3', ['31', '33', '40']], ['4', ['45', '46', '47', '54']], ['5', ['57', '60', '62']], ['6', ['78', '81']], ['7', ['83', '85', '87']], ['8', ['95', '96', '97', '98', '104']], ['9', ['107', '109', '116', '119']]]) {
                for (const page of pages) items.push(...TEACHING_CONTENT.PU2[unit][page].nonSpellingExercises.filter(e => e.id).map(e => ({ ...e, book: 'PU2', unit, page })));
            }
            for (const [unit, pages] of [['0', ['5', '7', '8']], ['1', ['9', '10', '11', '12', '13', '16']], ['2', ['19', '20', '21', '22', '23', '26']], ['3', ['31', '32', '33', '34', '35', '36', '37', '43']], ['4', ['45', '47', '48', '54']], ['5', ['57', '59', '60', '61', '63']], ['6', ['78', '81']], ['7', ['83', '85', '87', '91', '92']]]) {
                for (const page of pages) items.push(...TEACHING_CONTENT.PU1[unit][page].nonSpellingExercises.filter(e => e.id).map(e => ({ ...e, book: 'PU1', unit, page })));
            }
            const host = document.querySelector('#grammarGame .minigame-container');
            host.replaceChildren();
            document.getElementById('grammarGame').classList.add('nse-typed');
            return items;
        });
        const translationCoverage = await page.evaluate(() => ['110', '111'].map(page => {
            const data = TEACHING_CONTENT.PU3[9][page];
            return [...data.vocab, ...data.sentences].every(text => /[\u4e00-\u9fff]/u.test(getLocalTranslation(text)));
        }));
        ok(translationCoverage.every(Boolean), 'real app exact-key lookup translates every new Unit 9 vocabulary and scramble item');
        for (const item of approved) {
            await page.evaluate(item => {
                NonSpellingWidget.mount(document.querySelector('#grammarGame .minigame-container'), item, { presentation: 'game', onCheck() {}, onNext() {} });
            }, item);
            const enter = async answer => {
                // Exercise both physical typing and the on-screen apostrophe key.
                if (item.id === 'M20' || item.id === 'F21') await type(page, answer);
                else await page.keyboard.type(answer);
            };
            if (item.answers) {
                for (const [index, answer] of item.answers.entries()) {
                    await click(page, '[data-box="' + index + '"]');
                    await enter(answer.slice((item.prefixes || [])[index]?.length || 0, answer.length - ((item.suffixes || [])[index]?.length || 0)));
                }
            } else {
                const index = Number.isInteger(item.wrongIndex) ? item.wrongIndex : item.sentence.split(' ').findIndex(word => word.replace(/[.,!?]+$/, '').toLowerCase() === item.wrongWord);
                await click(page, '[data-word="' + index + '"]');
                await click(page, '#bin');
                await enter(item.answer);
            }
            await click(page, '#check');
            ok(await page.evaluate(() => NonSpellingWidget.getState().solved), 'approved ' + item.book + ' Unit ' + item.unit + ' ' + item.id + ' solves through the real widget');
            ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Unit ' + item.unit + ' ' + item.id + ' fits the 319px phone');
        }
        for (const presentation of ['study', 'game']) {
            for (const id of ['M5', 'M6']) {
                const item = approved.find(e => e.unit === '8' && e.id === id);
                await page.evaluate(({ item, presentation }) => {
                    document.getElementById('studyModeOverlay').classList.toggle('hidden', presentation !== 'study');
                    document.getElementById('grammarGame').classList.toggle('hidden', presentation === 'study');
                    const host = presentation === 'study' ? document.getElementById('study-game-area') : document.querySelector('#grammarGame .minigame-container');
                    NonSpellingWidget.mount(host, item, { presentation, onCheck() {}, onNext() {} });
                }, { item, presentation });
                ok(await page.locator('.nse-contraction').count() === 2, presentation + ' ' + id + ' attaches both contraction blanks');
                ok(await page.locator('.nse-contraction').evaluateAll(groups => groups.every(group => {
                    const [pronoun, box] = group.children;
                    const a = pronoun.getBoundingClientRect(), b = box.getBoundingClientRect();
                    return Math.abs(b.left - a.right - 2) < 1 && a.top < b.bottom && b.top < a.bottom;
                })), presentation + ' ' + id + ' keeps each pronoun beside its ending');
                await fillMissing(page, item.answers);
                await click(page, '#check');
                ok(await page.evaluate(() => NonSpellingWidget.getState().solved), presentation + ' ' + id + ' accepts apostrophe endings from on-screen keys');
                ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), presentation + ' contraction board fits 319px');
                await page.screenshot({ path: path.join(screenshots, 'phone-' + presentation + '-contraction-' + id + '.png'), fullPage: true });
            }
        }
        const poolBoard = approved.find(e => e.book === 'PU1' && e.unit === '7' && e.id === 'M4');
        for (const presentation of ['study', 'game']) {
            await page.evaluate(({ item, presentation }) => {
                document.getElementById('studyModeOverlay').classList.toggle('hidden', presentation !== 'study');
                document.getElementById('grammarGame').classList.toggle('hidden', presentation === 'study');
                const host = presentation === 'study' ? document.getElementById('study-game-area') : document.querySelector('#grammarGame .minigame-container');
                NonSpellingWidget.mount(host, item, { presentation, onCheck() {}, onNext() {} });
            }, { item: poolBoard, presentation });
            ok(await page.locator('[data-box="2"] .nse-suffix').allTextContents().then(parts => parts.join('') === 'ming'), presentation + ' keeps ming visible inside the swimming box');
            const poolKeys = await page.locator('[data-letter]').evaluateAll(keys => keys.map(key => key.dataset.letter).sort().join(''));
            ok(poolKeys === 'imstvw', presentation + ' pool keyboard excludes letters supplied only by the fixed ending');
            await click(page, '[data-box="2"]'); await page.keyboard.press('Backspace'); await click(page, '#check');
            ok(await page.evaluate(() => !NonSpellingWidget.getState().locked && NonSpellingWidget.getState().input[2] === ''), presentation + ' fixed ending alone cannot submit or be erased');
            await fillMissing(page, ['tv', 'wim', 'sw']); await click(page, '#check');
            ok(await page.locator('.nse-suffix.wrong').count() === 0 && await page.locator('[data-box="2"] .letter.wrong').count() > 0, presentation + ' incomplete pool answer grades typed letters without marking the given ending wrong');
            await page.waitForTimeout(3100);
            ok(await page.locator('[data-box="2"] .nse-suffix').allTextContents().then(parts => parts.join('') === 'ming'), presentation + ' timed retry retains the fixed ending');
            await click(page, '[data-box="2"]'); await type(page, 'swim'); await page.keyboard.press('Backspace');
            ok(await page.evaluate(() => NonSpellingWidget.getState().input[2] === 'swi'), presentation + ' backspace removes typed letters ahead of ming');
            await click(page, '#clear'); await fillMissing(page, ['tv', 'wim', 'swim']); await click(page, '#check');
            ok(await page.evaluate(() => NonSpellingWidget.getState().solved), presentation + ' TV / swim / swim plus ming solves through on-screen keys');
            ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), presentation + ' fixed-ending board fits a 319px phone');
            await page.screenshot({ path: path.join(screenshots, 'phone-' + presentation + '-pool-ending.png'), fullPage: true });
        }
        const homophones = approved.find(e => e.book === 'PU1' && e.unit === '6' && e.id === 'M31');
        for (const presentation of ['study', 'game']) {
            await page.evaluate(({ item, presentation }) => {
                document.getElementById('studyModeOverlay').classList.toggle('hidden', presentation !== 'study');
                document.getElementById('grammarGame').classList.toggle('hidden', presentation === 'study');
                const host = presentation === 'study' ? document.getElementById('study-game-area') : document.querySelector('#grammarGame .minigame-container');
                NonSpellingWidget.mount(host, item, { presentation, onCheck() {}, onNext() {} });
            }, { item: homophones, presentation });
            ok(await page.evaluate(() => NonSpellingWidget.getState().input.every(value => value === '')), presentation + ' homophone board has no prefilled hints');
            ok(await page.locator('[data-letter="\'"]').count() === 1, presentation + ' homophone keyboard includes the apostrophe');
            await fillMissing(page, ['their', 'there', "they're"]); await click(page, '#check');
            ok(await page.evaluate(() => !NonSpellingWidget.getState().solved) && await page.locator('.letter.wrong').count() > 0, presentation + ' rejects homophones placed in the wrong grammatical roles');
            await click(page, '#clear'); await fillMissing(page, homophones.answers); await click(page, '#check');
            ok(await page.evaluate(() => NonSpellingWidget.getState().solved), presentation + ' accepts there / they-re / their from on-screen keys');
            ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), presentation + ' three homophones fit a 319px phone');
        }
        const toyStarts = approved.find(e => e.book === 'PU1' && e.unit === '5' && e.id === 'M14');
        for (const presentation of ['study', 'game']) {
            await page.evaluate(({ item, presentation }) => {
                document.getElementById('studyModeOverlay').classList.toggle('hidden', presentation !== 'study');
                document.getElementById('grammarGame').classList.toggle('hidden', presentation === 'study');
                const host = presentation === 'study' ? document.getElementById('study-game-area') : document.querySelector('#grammarGame .minigame-container');
                NonSpellingWidget.mount(host, item, { presentation, onCheck() {}, onNext() {} });
            }, { item: toyStarts, presentation });
            ok(await page.evaluate(() => NonSpellingWidget.getState().input.join(',') === 'ballo,heli'), presentation + ' preserves both longer toy word starts');
            const toyKeys = await page.locator('[data-letter]').evaluateAll(keys => keys.map(key => key.dataset.letter).sort().join(''));
            ok(toyKeys === [...new Set('onscopter')].sort().join(''), presentation + ' toy keyboard contains only the missing suffix letters');
            await page.keyboard.press('Backspace'); await click(page, '#clear');
            ok(await page.evaluate(() => NonSpellingWidget.getState().input.join(',') === 'ballo,heli'), presentation + ' backspace and CLEAR retain full toy prefixes');
            await click(page, '[data-box="0"]'); await type(page, 'ons');
            await click(page, '[data-box="1"]'); await type(page, 'copter');
            await click(page, '#check');
            ok(await page.evaluate(() => NonSpellingWidget.getState().solved), presentation + ' toy suffixes solve using only on-screen keys');
            ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), presentation + ' longer toy prefixes fit a 319px phone');
        }
        const hinted = approved.find(e => e.unit === '4' && e.id === 'M1');
        for (const presentation of ['study', 'game']) {
            await page.evaluate(({ item, presentation }) => {
                document.getElementById('studyModeOverlay').classList.toggle('hidden', presentation !== 'study');
                document.getElementById('grammarGame').classList.toggle('hidden', presentation === 'study');
                const host = presentation === 'study' ? document.getElementById('study-game-area') : document.querySelector('#grammarGame .minigame-container');
                NonSpellingWidget.mount(host, item, { presentation, onCheck() {}, onNext() {} });
            }, { item: hinted, presentation });
            ok(await page.evaluate(() => NonSpellingWidget.getState().input.join(',') === 'b,b'), presentation + ' starts with both locked initials');
            ok(await page.locator('[data-letter="b"]').count() === 0, presentation + ' keyboard excludes the prefilled b');
            await click(page, '#check');
            ok(await page.evaluate(() => !NonSpellingWidget.getState().locked), presentation + ' initials alone are not a submitted answer');
            await page.keyboard.press('Backspace');
            ok(await page.evaluate(() => NonSpellingWidget.getState().input[0] === 'b'), presentation + ' backspace preserves the initial');
            await type(page, 'ae'); await page.keyboard.press('Backspace');
            await click(page, '#clear');
            ok(await page.evaluate(() => NonSpellingWidget.getState().input.join(',') === 'b,b'), presentation + ' CLEAR restores both initials');
            await type(page, 'aa'); await click(page, '[data-box="1"]'); await type(page, 'aa'); await click(page, '#check');
            ok(await page.locator('.nse-prefilled.wrong').count() === 0 && await page.locator('.letter.wrong').count() > 0, presentation + ' wrong feedback grades only entered letters');
            await page.waitForTimeout(3100);
            ok(await page.evaluate(() => NonSpellingWidget.getState().input.join(',') === 'b,b'), presentation + ' retry reset preserves both initials');
            await click(page, '[data-box="0"]'); await type(page, 'eautiful');
            await click(page, '[data-box="1"]'); await type(page, 'eautifully');
            await page.screenshot({ path: path.join(screenshots, 'phone-' + presentation + '-prefix.png'), fullPage: true });
            await click(page, '#check');
            ok(await page.evaluate(() => NonSpellingWidget.getState().solved), presentation + ' suffix-only entry solves full words');
        }
        await page.evaluate(item => {
            NonSpellingWidget.mount(document.querySelector('#grammarGame .minigame-container'), item, { presentation: 'game', onCheck() {}, onNext() {} });
        }, approved.find(e => e.unit === '4' && e.id === 'M12'));
        ok(await page.locator('[data-letter="c"]').count() === 1, 'catch retains c for its second occurrence');
        const repeatedArticle = approved.find(e => e.unit === '3' && e.id === 'F28');
        await page.evaluate(item => {
            NonSpellingWidget.mount(document.querySelector('#grammarGame .minigame-container'), item, { presentation: 'game', onCheck() {}, onNext() {} });
        }, repeatedArticle);
        await fillFix(page, 2, 'than'); await click(page, '#check');
        ok(await page.locator('#bin.word-wrong').count() === 1 && await page.locator('.nse-answer.spelling-correct').count() === 1, 'F28 rejects replacing an already-correct the while recognizing correct spelling');
        await click(page, '#clear'); await fillFix(page, repeatedArticle.wrongIndex, 'than'); await click(page, '#check');
        ok(await page.evaluate(() => NonSpellingWidget.getState().solved), 'F28 accepts only its intended final the');
        await page.evaluate(item => {
            NonSpellingWidget.mount(document.querySelector('#grammarGame .minigame-container'), item, { presentation: 'game', onCheck() {}, onNext() {} });
        }, approved.find(e => e.unit === '1' && e.id === 'M19'));
        await click(page, '[data-box="0"]');
        await page.keyboard.type('couldn');
        await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: '’', bubbles: true })));
        await page.keyboard.type('t');
        ok(await page.evaluate(() => NonSpellingWidget.getState().input[0] === "couldn't"), 'smart apostrophe input uses the same contracted answer as the on-screen keyboard');
        await page.evaluate(() => NonSpellingWidget.destroy());
        ok(errors.length === 0, 'no real-app browser script errors: ' + errors.join('; '));
        console.log(assertions + ' real-app integration checks passed.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
