// Study's serializable state boundary. Rebuild controls from code, never saved HTML.
(function (w) {
    'use strict';
    const clone = value => JSON.parse(JSON.stringify(value));
    const ids = ['words','sentences','remainingWordsRoundA','currentWordIndex','currentSentenceIndex','round',
        'subRound','sentencePairs','pairAttempts','pairQueued','nonSpellingExercises','currentNonSpellingIndex',
        'previewNote','_mixedActive','_typedRecorded','isTransitioning','_roundCFrozen','_roundEFrozen','srFinalized'];
    const $ = id => document.getElementById(id);
    const nodes = selector => Array.from(document.querySelectorAll(selector));
    function capture() {
        const state = {};
        ids.forEach(k => { if (STUDY_STATE[k] !== undefined) state[k] = clone(STUDY_STATE[k]); });
        const gate = document.querySelector('#study-game-area .speech-sentence-gate');
        const fTiles = nodes('#study-game-area .sentence-b-tile');
        const ui = {
            title: $('study-title').textContent, instruction: $('study-instruction').textContent, tts: currentTTSWord,
            aOrder: nodes('#roundA-container button').map(e => e.textContent),
            cSlots: nodes('#scramble-slots .study-slot').map(e => ({ text: e.innerText, cls: e.className })),
            cBank: nodes('#scramble-bank button').map(e => e.dataset.char || e.innerText),
            eSlots: nodes('#sentence-drop-zone .sentence-slot').map(e => e.firstElementChild ? { text: e.firstElementChild.dataset.word, cls: e.firstElementChild.className } : null),
            eBank: nodes('#sentence-word-bank > .study-word-tile').map(e => ({ text: e.dataset.word, cls: e.className })),
            fDock: nodes('#sentence-b-dock .sentence-b-tile').map(e => Number(e.dataset.correctIndex)),
            fSlots: nodes('#study-game-area .sentence-b-slot').map(e => e.querySelector('.sentence-b-tile') ? Number(e.querySelector('.sentence-b-tile').dataset.correctIndex) : null),
            fTiles: fTiles.map(e => ({ index: Number(e.dataset.correctIndex), cls: e.className, color: e.style.backgroundColor })),
            fSelected: selectedBTile ? Number(selectedBTile.dataset.correctIndex) : null,
            typed: w.NonSpellingWidget && NonSpellingWidget.isActive() ? NonSpellingWidget.getState() : null,
            scroll: $('studyModeOverlay').scrollTop
        };
        return { state, content: clone(typeof selectedClassContent !== 'undefined' && selectedClassContent || {}),
            elapsedMs: Math.max(0, Date.now() - STUDY_STATE.startTime),
            exercise: { attempts: exerciseAttempts, elapsedMs: Math.max(0, Date.now() - exerciseStartTime) }, ui,
            handwriting: STUDY_STATE.round === 'D' ? { slots: clone(roundDSlots), gaps: roundDGapOrder.slice(), cursor: roundDCursor,
                attempts: roundDAttempts, effort: roundDEffortAttempts, guided: roundDGuided, help: roundDHadHelp, skip: roundDSkipUnlocked,
                targetElapsedMs: Math.max(0, Date.now() - roundDTargetShownAt), trace: roundDTrace && roundDTrace.exportRecovery(),
                status: $('handwriting-status') && $('handwriting-status').textContent } : null,
            speech: gate && gate.studyResumeState ? gate.studyResumeState() : null,
            srResults: clone(srStudyResults), usedPairKeys: Array.from(srUsedPairKeys),
            pending: STUDY_STATE._resumePending ? { action: STUDY_STATE._resumePending.action, remainingMs: Math.max(0, STUDY_STATE._resumePending.dueAt - Date.now()) } : null,
            practice: w.PracticeTelemetry && PracticeTelemetry.snapshot ? PracticeTelemetry.snapshot() : null };
    }
    function cancel() {
        studyRuntimeEpoch++; studyCancelPending(); clearTimeout(roundDTimer);
        nodes('#study-game-area .speech-rec-btn').forEach(e => { if(e.disposeSpeech)e.disposeSpeech(); });
        clearTimeout(STUDY_STATE._roundEResetTimer); STUDY_STATE._roundEResetTimer = null;
        nodes('#scramble-slots .study-slot').forEach(e => { clearTimeout(e._resetTimer); e._resetTimer = null; });
    }
    function suspend() {
        cancel();
        if (roundDTrace) { roundDTrace.destroy(); roundDTrace = null; }
        if (w.NonSpellingFlow) NonSpellingFlow.cleanupStudy();
        STUDY_STATE.active = false; $('studyModeOverlay').classList.add('hidden');
    }
    function pendingAction(name) {
        if (name === 'recognition_next') return () => { STUDY_STATE.isTransitioning = false; playRoundAPrompt(); };
        if (name === 'scramble_next') return () => { STUDY_STATE.currentWordIndex++; STUDY_STATE.isTransitioning = false; STUDY_STATE._roundCFrozen = false; startExerciseTracking(); nextRoundCWord(); };
        if (name === 'scramble_reset') return clearRoundC;
        if (name === 'handwriting_letter') return roundDShowTarget;
        if (name === 'handwriting_word') return () => { STUDY_STATE.currentWordIndex++; STUDY_STATE.isTransitioning = false; startExerciseTracking(); nextRoundDWord(); };
        if (name === 'sentence_next') return advanceRoundESentence;
        if (name === 'sentence_reset') return clearRoundE;
        if (name === 'match_next') return () => { STUDY_STATE.isTransitioning = false; if (STUDY_STATE._mixedActive) NonSpellingFlow.advanceStudy(); else { STUDY_STATE.subRound++; startExerciseTracking(); nextRoundFSubRound(); } };
        if (name === 'match_reset') return () => { resetRoundF(); STUDY_STATE.isTransitioning = false; };
        return null;
    }
    function restore(saved) {
        cancel();
        if (w.PreviewNotes) PreviewNotes.close();
        if (roundDTrace) { roundDTrace.destroy(); roundDTrace = null; }
        if (w.NonSpellingFlow) NonSpellingFlow.cleanupStudy();
        ids.forEach(k => { delete STUDY_STATE[k]; });
        Object.assign(STUDY_STATE, clone(saved.state), { active: true, srFinalized: false, startTime: Date.now() - saved.elapsedMs });
        // Selection remains the original session's location; profile assignment is untouched.
        selectedClassContent = clone(saved.content);
        srStudyResults = clone(saved.srResults || []); srUsedPairKeys = new Set(saved.usedPairKeys || []);
        showStudyModeScreen();
        const s = saved.state, ui = saved.ui;
        if (s.round === 'A') startRoundA(true);
        else if (s.round === 'C') nextRoundCWord();
        else if (s.round === 'D') nextRoundDWord(saved.handwriting);
        else if (s._mixedActive) NonSpellingFlow.restoreStudy(ui.typed);
        else if (s.round === 'E') nextRoundESentence();
        else renderRoundF();
        // Renderers initialize their controls; restore their saved lock/attempt state afterwards.
        ['isTransitioning','_roundCFrozen','_roundEFrozen','_typedRecorded'].forEach(k => { STUDY_STATE[k] = s[k]; });
        exerciseAttempts = saved.exercise.attempts; exerciseStartTime = Date.now() - saved.exercise.elapsedMs;
        currentTTSWord = ui.tts;
        updateStudyUI(ui.title, ui.instruction);
        if (s.round === 'A') {
            const map = new Map(nodes('#roundA-container button').map(e => [e.textContent,e]));
            ui.aOrder.forEach(text => { if (map.has(text)) $('roundA-container').appendChild(map.get(text)); });
            showTranslation('roundA-translation', ui.tts); showVocabImage('roundA-image', ui.tts);
        }
        if (s.round === 'C') {
            nodes('#scramble-slots .study-slot').forEach((e,i) => { const v=ui.cSlots[i]; if(v){e.innerText=v.text;e.className=v.cls;} });
            $('scramble-bank').replaceChildren();
            ui.cBank.forEach(char => { const b=document.createElement('button');b.className='study-letter-btn';b.innerText=char;b.dataset.char=char;b.onclick=()=>addLetterToSlot(char,b,currentTTSWord);$('scramble-bank').appendChild(b); });
            if (saved.speech) mountStudyWordSpeechGate(saved.speech);
        }
        if (s.round === 'E' && !ui.typed) {
            nodes('#sentence-drop-zone .sentence-slot').forEach((e,i) => { const v=ui.eSlots[i];if(v){const b=createWordTile(v.text,i);b.className=v.cls;b.dataset.word=v.text;e.appendChild(b);} });
            $('sentence-word-bank').replaceChildren();
            ui.eBank.forEach((v,i) => { const b=createWordTile(v.text,i);b.className=v.cls;$('sentence-word-bank').appendChild(b); });
            if (saved.speech) mountStudySpeechGate(saved.speech);
        }
        if (s.round === 'F') {
            const map = new Map(nodes('#study-game-area .sentence-b-tile').map(e=>[Number(e.dataset.correctIndex),e]));
            nodes('#study-game-area .sentence-b-slot').forEach((e,i)=>{const tile=map.get(ui.fSlots[i]);if(tile){e.replaceChildren(tile);}});
            ui.fDock.forEach(i=>{if(map.has(i))$('sentence-b-dock').appendChild(map.get(i));});
            ui.fTiles.forEach(v=>{const e=map.get(v.index);if(e){e.className=v.cls;e.style.backgroundColor=v.color;}});
            selectedBTile = map.get(ui.fSelected) || null;
        }
        if (w.PracticeTelemetry && PracticeTelemetry.resume) PracticeTelemetry.resume(saved.practice || { id:saved.runId,mode:'study',game:'study',startedAt:new Date(saved.createdAt).toISOString() });
        let pending = saved.pending;
        if (!pending && !saved.speech && !ui.typed) {
            if (s.round === 'C' && s.isTransitioning) pending={action:'scramble_next',remainingMs:100};
            else if (s.round === 'C' && s._roundCFrozen) pending={action:'scramble_reset',remainingMs:5000};
            else if (s.round === 'E' && s.isTransitioning) { mountStudySpeechGate(null); }
            else if (s.round === 'E' && s._roundEFrozen) pending={action:'sentence_reset',remainingMs:5000};
            else if (s.round === 'D' && s.isTransitioning) pending={action:'handwriting_word',remainingMs:300};
            else if (s.round === 'D' && saved.handwriting.trace && saved.handwriting.trace.frozen) pending={action:'handwriting_letter',remainingMs:140};
            else if (s.round === 'F' && s.isTransitioning) pending={action:s.pairQueued.every(Boolean)?'match_next':'match_reset',remainingMs:500};
        }
        if (pending && pendingAction(pending.action)) studyLater(pending.action,pendingAction(pending.action),Math.min(5000,pending.remainingMs));
        $('studyModeOverlay').scrollTop = ui.scroll || 0;
        return true;
    }
    w.StudyRuntime = { capture, restore, cancel, suspend };
})(window);
