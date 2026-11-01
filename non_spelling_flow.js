// Real Study/game adapters for the shared non-spelling widgets.
(() => {
    'use strict';
    let typedGame = null, lastGameKey = null, gameResultsOwner = null;
    function enabled() { return typeof NON_SPELLING_ENABLED !== 'undefined' && NON_SPELLING_ENABLED; }
    function prepareStudy(book, unit, page) {
        return enabled() ? NonSpellingContent.select(book, unit, page, 5) : null;
    }
    function cleanupStudy() {
        if (typedGame) cleanupGame();
        else NonSpellingWidget.destroy();
        if (typeof STUDY_STATE !== 'undefined') {
            STUDY_STATE._mixedActive = false;
            if (STUDY_STATE._roundEResetTimer) clearTimeout(STUDY_STATE._roundEResetTimer);
        }
        document.getElementById('studyModeOverlay').classList.remove('nse-mixed');
    }
    function beginStudy() {
        STUDY_STATE._mixedActive = true;
        STUDY_STATE.currentNonSpellingIndex = 0;
        document.getElementById('studyModeOverlay').classList.add('nse-mixed');
        nextStudy();
    }
    function advanceStudy() {
        if (!STUDY_STATE.active || !STUDY_STATE._mixedActive) return;
        STUDY_STATE.currentNonSpellingIndex++;
        nextStudy();
    }
    function recordTyped(item, mode, result, tracking) {
        exerciseAttempts = result.attempts;
        const results = mode === 'study' ? srStudyResults : srGameResults;
        if (!tracking.recorded) {
            results.push({ type: item.srType, key: item.key, firstAttempt: result.solved });
            tracking.recorded = true;
            if (mode === 'study') STUDY_STATE._typedRecorded = true;
        }
        if (mode === 'game') {
            if (result.solved) {
                srInSessionFailures.delete(item.key);
                srInSessionSuccesses.add(item.key);
            } else { srInSessionFailures.add(item.key); isFirstAttempt = false; }
        }
        if (result.solved) {
            queueExerciseEvent(item.type === 'missing-word' ? 'missingWord' : 'findAndFix', mode, {
                id: item.id, key: item.key, book: item.book, unit: item.unit, page: item.page,
                sentences: item.sentences || [item.sentence], answers: item.answers || [item.answer],
                response: NonSpellingWidget.getState().input
            }, result.attempts);
            if (typeof playHappySound === 'function') playHappySound();
        } else if (typeof synthError === 'function') synthError();
    }
    function nextStudy(resuming, savedWidget) {
        NonSpellingWidget.destroy();
        if (!STUDY_STATE.active || !STUDY_STATE._mixedActive) return;
        const item = STUDY_STATE.nonSpellingExercises[STUDY_STATE.currentNonSpellingIndex];
        if (!item) { finishStudySession(); return; }
        STUDY_STATE.round = 'E';
        STUDY_STATE.isTransitioning = false;
        if (!resuming) { startExerciseTracking(); STUDY_STATE._typedRecorded = false; }
        if (item.type === 'sentence-scramble') {
            if (!resuming) { STUDY_STATE.sentences = [item.sentence]; STUDY_STATE.currentSentenceIndex = 0; }
            updateStudyUI('Round D: Sentence Scramble', '把单词排成正确的句子。');
            nextRoundESentence();
        } else if (item.type === 'sentence-match') {
            STUDY_STATE.round = 'F';
            if (!resuming) { STUDY_STATE.sentencePairs = item.pairs; STUDY_STATE.pairAttempts = item.pairs.map(() => 1); STUDY_STATE.pairQueued = item.pairs.map(() => false); }
            item.pairs.forEach(pair => srUsedPairKeys.add(itemKey(pair)));
            updateStudyUI('Round D: Sentence Match', '把对应的句子配起来。');
            renderRoundF();
        } else {
            const container = document.getElementById('study-game-area');
            container.replaceChildren();
            updateStudyUI(item.type === 'missing-word' ? 'Round D: Missing Words' : 'Round D: Find and Fix',
                item.type === 'missing-word' ? '点击空格，用字母补全单词。' : '找出用错的单词并改正。');
            const tracking = { recorded: !!STUDY_STATE._typedRecorded };
            NonSpellingWidget.mount(container, item, {
                presentation: 'study', resumeState: resuming && savedWidget || null, onCheck: result => recordTyped(item, 'study', result, tracking), onNext: advanceStudy
            });
        }
    }
    function cleanupGame() {
        if (!typedGame) return;
        NonSpellingWidget.destroy();
        typedGame.hidden.forEach(({ el, hidden }) => el.classList.toggle('hidden', hidden));
        typedGame.heading.textContent = typedGame.title;
        document.getElementById('grammarGame').classList.remove('nse-typed');
        typedGame = null;
    }
    function startGame() {
        if (!enabled() || !selectedClassContent) return false;
        cleanupGame();
        if (gameResultsOwner !== srGameResults) { gameResultsOwner = srGameResults; lastGameKey = null; }
        const { book, unit, page } = selectedClassContent;
        const item = NonSpellingContent.select(book, unit, page, 1, {
            failures: srInSessionFailures, successes: srInSessionSuccesses, avoidKey: lastGameKey
        })[0];
        if (!item) return false;
        lastGameKey = item.key;
        if (item.type === 'sentence-scramble') { startGrammarGame(item.sentence); return true; }
        if (item.type === 'sentence-match') { startSentenceMatchGame(item.pairs); return true; }
        const overlay = document.getElementById('grammarGame');
        const container = overlay.querySelector('.minigame-container');
        const heading = container.querySelector('h3');
        typedGame = { heading, title: heading.textContent, hidden: [] };
        ['sentence-container', 'word-dock', 'grammar-actions', 'grammar-result-action', 'grammar-translation', 'grammar-speech-gate'].forEach(id => {
            const el = document.getElementById(id);
            if (el) { typedGame.hidden.push({ el, hidden: el.classList.contains('hidden') }); el.classList.add('hidden'); }
        });
        heading.textContent = item.type === 'missing-word' ? 'Missing Words!' : 'Find and Fix!';
        overlay.classList.add('nse-typed');
        overlay.classList.remove('hidden');
        const instruction = document.createElement('p');
        instruction.id = 'nse-game-instruction';
        instruction.className = 'nse-game-instruction';
        instruction.textContent = item.type === 'missing-word' ? '点击空格，用字母补全单词。' : '找出用错的单词并改正。';
        // The instruction belongs to the widget and is removed with it.
        startExerciseTracking();
        const tracking = { recorded: false };
        NonSpellingWidget.mount(container, item, {
            presentation: 'game',
            nextLabel: rewardContext === 'gomoku' || rewardContext === 'uno' || activeGameMode === 'Gomoku' || activeGameMode === 'Uno' ? 'CONTINUE!' : 'GET POWER UP!',
            onCheck: result => {
                recordTyped(item, 'game', result, tracking);
                if (result.solved && minigameCountdownInterval) { clearInterval(minigameCountdownInterval); minigameCountdownInterval = null; }
            },
            onNext: () => claimReward(true)
        });
        document.getElementById('exercise-widget').prepend(instruction);
        return true;
    }
    window.NonSpellingFlow = { enabled, prepareStudy, beginStudy, advanceStudy, restoreStudy: saved => { STUDY_STATE._mixedActive=true; document.getElementById('studyModeOverlay').classList.add('nse-mixed'); nextStudy(true,saved); }, cleanupStudy, startGame, cleanupGame };
})();
