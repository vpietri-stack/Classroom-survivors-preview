// Recreate logical game state with the existing renderers. Never persist HTML or Phaser objects.
(function(w){
    'use strict';
    const clone=x=>JSON.parse(JSON.stringify(x)), $=id=>document.getElementById(id), all=s=>Array.from(document.querySelectorAll(s));
    let restoring=false, unoRestore=null, question=0, pending=null, pendingTimer=null, epoch=0, claimed=false, restoreSerial=0;
    const enabled=()=>typeof GAME_RESUME_ENABLED!=='undefined'&&GAME_RESUME_ENABLED;
    const current=()=>activeGameMode==='Gomoku'&&gomokuGameActive?'gomoku':activeGameMode==='Uno'&&unoGameActive?'uno':null;
    const scene=()=>typeof game!=='undefined'&&game&&game.scene&&game.scene.isActive('UnoScene')?game.scene.getScene('UnoScene'):null;
    function tick(){if(w.GameRecovery&&!restoring)GameRecovery.capture();}
    function later(kind,fn,ms){clearTimeout(pendingTimer);const token=epoch;pending={kind,due:Date.now()+ms};pendingTimer=setTimeout(()=>{if(token!==epoch)return;pending=null;pendingTimer=null;fn();tick();},ms);tick();return pendingTimer;}
    function cancelQuestion(){epoch++;clearTimeout(pendingTimer);pendingTimer=null;pending=null;clearInterval(recTimer);}
    function cancel(){cancelQuestion();clearInterval(minigameCountdownInterval);if (typeof unoESLTimerInterval !== 'undefined') { clearInterval(unoESLTimerInterval); unoESLTimerInterval=null; }
        all('.speech-rec-btn').forEach(b=>{if(b.disposeSpeech)b.disposeSpeech();});
        ['spellingGame','grammarGame'].forEach(id=>{const e=$(id);clearTimeout(e._spellingResetTimer);clearTimeout(e._grammarResetTimer);});
        if(w.NonSpellingFlow)NonSpellingFlow.cleanupGame();
    }
    function suspend(){restoreSerial++;restoring=false;if (typeof unoLaunchEpoch !== 'undefined') { unoLaunchEpoch++; unoGameActive=false; }cancel();gomokuGameActive=false;clearTimeout(gomokuAiTimeout);clearInterval(gomokuSpeedInterval);clearInterval(w.gomokuTimerInterval);clearInterval(w.unoTimerInterval);
        const s=scene();if(s){s.clearAllTurnTimers();game.scene.stop('UnoScene');}unoRestore=null;
        ['gomokuScreen','unoScreen','unoESLOverlay','unoTensionOverlay','spellingGame','wordRecGame','grammarGame','sentenceMatchGame'].forEach(id=>$(id)?.classList.add('hidden'));
    }
    function mini(){
        const id=['spellingGame','wordRecGame','grammarGame','sentenceMatchGame'].find(id=>!$(id).classList.contains('hidden'));
        if(!id)return null;
        const e=$(id), result={id,data:{...e.dataset},tts:currentTTSWord,first:isFirstAttempt,question,
            elapsed:Math.max(0,Date.now()-minigameStartTime),resultReady:false,pending:pending&&{kind:pending.kind,remaining:Math.max(0,pending.due-Date.now())},
            typed:w.NonSpellingFlow&&NonSpellingFlow.gameState?NonSpellingFlow.gameState():null};
        const resultId={spellingGame:'spelling-result-action',wordRecGame:'rec-result-action',grammarGame:'grammar-result-action',sentenceMatchGame:'sentencematch-result-action'}[id];
        result.resultReady=!$(resultId).classList.contains('hidden');
        if(id==='spellingGame'){const gate=$('spelling-speech-gate');result.speech=gate&&gate.studyResumeState?gate.studyResumeState():null;}
        if(id==='wordRecGame'){result.choices=all('#rec-options button').map(b=>({text:b.textContent,cls:b.className}));result.recLeft=recTimeLeft;}
        if(id==='grammarGame'&&!result.typed){result.slots=all('#sentence-container .drop-zone').map(e=>({cls:e.className,tile:e.firstElementChild?{text:e.firstElementChild.dataset.word,cls:e.firstElementChild.className}:null}));result.bank=all('#word-dock>.draggable').map(e=>({text:e.dataset.word,cls:e.className}));const gate=$('grammar-speech-gate');result.speech=gate&&gate.studyResumeState?gate.studyResumeState():null;}
        if(id==='sentenceMatchGame'){result.slots=all('.gm-sentence-b-slot').map(e=>e.firstElementChild&&e.firstElementChild.matches('.gm-sentence-b-tile')?Number(e.firstElementChild.dataset.correctIndex):null);result.dock=all('#sentencematch-dock .gm-sentence-b-tile').map(e=>Number(e.dataset.correctIndex));result.tiles=all('.gm-sentence-b-tile').map(e=>({index:Number(e.dataset.correctIndex),cls:e.className,color:e.style.backgroundColor}));result.selected=gameModeSelectedBTile?Number(gameModeSelectedBTile.dataset.correctIndex):null;}
        return result;
    }
    function unoData(s){return {deck:clone(s.deck),discard:clone(s.discard),players:clone(s.players),playerNames:s.playerNames.slice(),currentPlayer:s.currentPlayer,direction:s.direction,
        pendingStack:s.pendingStack,pendingStackType:s.pendingStackType,snapEnabled:s.snapEnabled,freePlay:s.freePlay,vulnerable:s.vulnerable.slice(),isProcessing:s.isProcessing,
        winner:unoWinner,elapsed:unoAccumulatedTime+(unoESLTimerInterval?0:Math.max(0,Date.now()-unoStartTime)),eslContext:unoESLContext,
        eslElapsed:unoESLContext?Math.max(0,Date.now()-unoESLTimerStart):0,eslActive:!!unoESLTimerInterval,status:$('uno-status').textContent};}
    function checkpointUno(s,kind,args){if(!enabled()||restoring)return;s._recoveryBase=unoData(s);s._recoveryTask={kind,args:clone(args||[]),at:Date.now()};tick();}
    function capture(){const mode=current();if(!mode)throw Error('No active game');let state;
        if(mode==='gomoku')state={board:clone(gomokuBoard),mode:gomokuMode,difficulty:gomokuDifficulty,turn:gomokuTurn,last:lastGomokuMove,pendingMove:pendingGomokuMove,viewport:{...gomokuViewport},
            elapsed:gomokuAccumulatedTime+(gomokuTurn==='minigame'?0:Math.max(0,Date.now()-gomokuStartTime)),speedInterval:currentGomokuSpeedIntervalTime,speedRemaining:Math.max(0,gomokuNextAiTime-Date.now()),aiRemaining:Math.max(0,gomokuAiDue-Date.now()),status:$('gomoku-status')?.textContent||''};
        else {const s=scene();state=s._recoveryBase?clone(s._recoveryBase):unoData(s);state.task=s._recoveryTask?clone(s._recoveryTask):{kind:'turn',args:[]};
            if(state.task.kind==='turn')state.aiRemaining=s._recoveryAiTimer?Math.max(0,s._recoveryAiTimer.getRemaining()):0;
            if(state.task.kind==='next')state.task.remaining=Math.max(0,state.task.args[2]-(Date.now()-state.task.at));
            if(state.task.kind==='tension')state.task.remaining=Math.max(0,(s._recoveryTensionUntil||Date.now())-Date.now());
        }
        const s=scene(), frozen=mode==='uno'&&s&&s._recoveryTask&&!['turn','esl'].includes(s._recoveryTask.kind);
        return {game:mode,state,elapsedMs:state.elapsed,content:clone(selectedClassContent),exercise:{attempts:Math.max(1,exerciseAttempts),elapsedMs:Math.max(0,Date.now()-exerciseStartTime)},
            ui:{mini:frozen?null:mini(),totalQuest:totalMinigameTimeMs,failures:Array.from(srInSessionFailures),successes:Array.from(srInSessionSuccesses),last:clone(srLastServedKey),question},
            srResults:clone(srGameResults),usedPairKeys:[],practice:w.PracticeTelemetry&&PracticeTelemetry.snapshot?PracticeTelemetry.snapshot():null};
    }
    function readyResult(id){const map={spellingGame:['spelling-actions','spelling-result-action'],wordRecGame:['rec-options','rec-result-action'],grammarGame:['grammar-actions','grammar-result-action'],sentenceMatchGame:['sentencematch-actions','sentencematch-result-action']};const [a,r]=map[id];$(a).classList.add('hidden');$(r).classList.remove('hidden');$(r).replaceChildren();const b=document.createElement('button');b.className='game-btn bg-green-500 text-2xl py-4 px-8';b.textContent='CONTINUE!';b.onclick=()=>claimReward(true);$(r).appendChild(b);}
    function restoreMini(saved){if(!saved)return;claimed=false;question=saved.question||0;rewardContext=current()==='gomoku'?'gomoku':'uno';currentTTSWord=saved.tts;
        if(saved.typed&&w.NonSpellingFlow)NonSpellingFlow.restoreGame(saved.typed);
        else if(saved.id==='spellingGame'){startSpellingGame(saved.data.targetWord);Object.assign($('spellingGame').dataset,saved.data);$('spelling-keyboard').dataset.built='false';if(saved.resultReady||saved.speech)readyResult(saved.id);buildSpellingSlots();buildSpellingKeyboard();buildSpellingSlots();if(saved.speech)mountGameWordSpeechGate(saved.speech);}
        else if(saved.id==='wordRecGame') {startWordRecGame(saved.tts);clearInterval(recTimer);$('rec-options').replaceChildren();saved.choices.forEach(v=>{const b=document.createElement('button');b.className=v.cls;b.textContent=v.text;b.onclick=()=>checkWordRec(v.text,saved.tts,b);$('rec-options').appendChild(b);});recTimeLeft=saved.recLeft;$('rec-timer-bar').style.width=recTimeLeft+'%';if(!saved.resultReady&&recTimeLeft>0)recTimer=setInterval(()=>{recTimeLeft--; $('rec-timer-bar').style.width=Math.max(0,recTimeLeft)+'%';if(recTimeLeft<=0){clearInterval(recTimer);isFirstAttempt=false;}},50);}
        else if(saved.id==='grammarGame'){startGrammarGame(JSON.parse(saved.data.validOptions));Object.assign($('grammarGame').dataset,saved.data);all('#sentence-container .drop-zone').forEach((e,i)=>{const v=saved.slots[i];e.className=v.cls;e.replaceChildren();if(v.tile){const tile=document.createElement('div');tile.className=v.tile.cls;tile.textContent=v.tile.text;tile.dataset.word=v.tile.text;e.appendChild(tile);}});$('word-dock').replaceChildren();saved.bank.forEach(v=>{const e=document.createElement('div');e.className=v.cls;e.textContent=v.text;e.dataset.word=v.text;$('word-dock').appendChild(e);});if(saved.speech&&SpeechUI.isReady()){$('grammar-actions').classList.add('hidden');const gate=SpeechUI.makeSentenceGate({target:saved.slots.map(v=>v.tile&&v.tile.text||'').join(' '),wordTiles:all('#sentence-container .drop-zone').map(e=>e.firstElementChild),mode:'game',level:2,resumeState:saved.speech,onDone:()=>{$('grammar-speech-gate')?.remove();handleMinigameSuccess('grammar');}});gate.id='grammar-speech-gate';$('word-dock').appendChild(gate);}else if(saved.speech)readyResult(saved.id);}
        else if(saved.id==='sentenceMatchGame'){startSentenceMatchGame(JSON.parse(saved.data.pairs));Object.assign($('sentenceMatchGame').dataset,saved.data);const map=new Map(all('.gm-sentence-b-tile').map(e=>[Number(e.dataset.correctIndex),e]));all('.gm-sentence-b-slot').forEach((e,i)=>{if(saved.slots[i]!==null)e.replaceChildren(map.get(saved.slots[i]));});saved.dock.forEach(i=>$('sentencematch-dock').appendChild(map.get(i)));saved.tiles.forEach(v=>{const e=map.get(v.index);e.className=v.cls;e.style.backgroundColor=v.color;});gameModeSelectedBTile=map.get(saved.selected)||null;}
        Object.assign($(saved.id).dataset,saved.data);if(saved.resultReady)readyResult(saved.id);
        isFirstAttempt=saved.first;minigameStartTime=Date.now()-saved.elapsed;startMinigameCountdown(null);
        if(saved.pending){const resets={spelling:()=>clearSpelling(),grammar:clearGrammar,rec:startWordRecGame,match:()=>{all('.gm-sentence-b-tile').forEach(returnGameModeTileToDock);all('.gm-sentence-b-slot').forEach(e=>{e.replaceChildren();const t=document.createElement('span');t.textContent='Tap to place';e.appendChild(t);});}};const fn=resets[saved.pending.kind];if(fn)later(saved.pending.kind,fn,saved.pending.remaining);}
    }
    function applyCommon(saved){selectedClassContent=clone(saved.content);srGameResults=clone(saved.srResults);srInSessionFailures=new Set(saved.ui.failures);srInSessionSuccesses=new Set(saved.ui.successes);srLastServedKey=clone(saved.ui.last);totalMinigameTimeMs=saved.ui.totalQuest;question=saved.ui.question||0;exerciseAttempts=saved.exercise.attempts;exerciseStartTime=Date.now()-saved.exercise.elapsedMs;}
    async function restore(saved){suspend();if(w.PreviewNotes)PreviewNotes.close();const serial=++restoreSerial,runtimeEpoch=epoch;restoring=true;applyCommon(saved);
        try {
        w.SpeechStatus?.start?.();
        if (saved.game === 'uno' && typeof UnoScene === 'undefined') await ensurePhaserGames();
        if (runtimeEpoch !== epoch) throw Error('Recovery cancelled');
        if(saved.game==='gomoku'){
            triggerGomoku(saved.state.mode);clearInterval(gomokuSpeedInterval);clearTimeout(gomokuAiTimeout);const s=saved.state;
            gomokuBoard=clone(s.board);gomokuMode=s.mode;gomokuDifficulty=s.difficulty;gomokuTurn=s.turn;lastGomokuMove=s.last;pendingGomokuMove=s.pendingMove;gomokuViewport={...s.viewport};gomokuAccumulatedTime=s.elapsed;gomokuStartTime=Date.now();currentGomokuSpeedIntervalTime=s.speedInterval;drawGomokuBoard();updateGomokuStatus(s.status);
            if(s.mode==='speed')startGomokuSpeedClock(s.speedRemaining);else if(s.turn==='ai')scheduleGomokuAi(s.aiRemaining);
            restoreMini(saved.ui.mini);
        }else {unoRestore=saved;triggerUno();await new Promise((resolve,reject)=>{let n=0;const timer=setInterval(()=>{if(epoch!==runtimeEpoch){clearInterval(timer);reject(Error('Recovery cancelled'));return;}if(!unoRestore){clearInterval(timer);resolve();}else if(++n>300){clearInterval(timer);reject(Error('UNO did not initialize'));}},50);});}
        applyCommon(saved);
        }finally{if(serial===restoreSerial)restoring=false;}
    }
    function initUno(s){if(!unoRestore)return false;const saved=unoRestore;unoRestore=null;const v=clone(saved.state),task=v.task||{kind:'turn',args:[]};Object.assign(s,v);delete s.task;if(!['turn','next','esl','tension','win','deal','initialDiscard'].includes(task.kind)){s.isProcessing=true;s.snapEnabled=false;}
        unoWinner=v.winner;unoGameActive=true;unoAccumulatedTime=v.elapsed;unoStartTime=Date.now();unoESLContext=v.eslContext;unoESLTimerStart=Date.now()-v.eslElapsed;unoESLTimedOut=v.eslElapsed>=UNO_ESL_TIME_LIMIT;s._recoveryBase=null;s._recoveryTask=null;s.renderAll();s.setStatus(v.status);applyCommon(saved);
        if(task.kind==='deal')s.dealNext(task.args[0],()=>s.startTurn());
        else if(task.kind==='initialDiscard'){const card=task.args[0];s.discard.push(card);if(card.type==='skip')s.currentPlayer=1;else if(card.type==='reverse'){s.direction=-1;s.currentPlayer=3;}else if(card.type==='+2'){s.pendingStack=2;s.pendingStackType='+2';}s.startTurn();}
        else if(task.kind==='tension')s.tensionBlackCardESL(task.remaining);
        else if(task.kind==='esl'){s._recoveryTask={kind:'esl',args:[]};$('unoESLOverlay').classList.remove('hidden');unoESLTimerInterval=setInterval(()=>s.updateUnoESLDisplay(),100);s.updateUnoESLDisplay();restoreMini(saved.ui.mini);}
        else if(task.kind==='turn'){s.startTurn();if(s.currentPlayer!==0&&v.aiRemaining!==undefined){s.clearAllTurnTimers();s._recoveryAiTimer=s.addTurnTimer(s.time.delayedCall(Math.max(150,v.aiRemaining),()=>s.aiTurn(s.currentPlayer)));}}
        else if(task.kind==='win'){s.endUno(task.args[0]);}
        else if(task.kind==='next'){s._recoveryBase=clone(v);s._recoveryTask=clone(task);s._recoveryTask.at=Date.now();s._recoveryTask.args[2]=task.remaining;s.addTurnTimer(s.time.delayedCall(task.remaining,()=>{if(task.args[1]>0)s.vulnerable[task.args[1]]=false;s.currentPlayer=task.args[0];s.startTurn();}));}
        else {s._recoveryBase=clone(v);s._recoveryTask=clone(task);s.time.delayedCall(150,()=>{if(task.kind==='effect')s.handleCardEffect(...task.args);else if(typeof s[task.kind]==='function')s[task.kind](...task.args);});}
        return true;
    }
    function attachUno() {
        // Keep a serializable intent while an animation/penalty callback is in flight.
        ['humanPlay','humanSnapCard','humanDrawPending','humanDeclareNoPlay','humanCatchBot','aiTurn','handleCardEffect','handleESLResult'].forEach(name=>{const original=UnoScene.prototype[name];UnoScene.prototype[name]=function(...args){if(enabled()&&!restoring)checkpointUno(this,name==='handleCardEffect'?'effect':name,args);const value=original.apply(this,args);tick();return value;};});
        const turn=UnoScene.prototype.startTurn;UnoScene.prototype.startTurn=function(){const value=turn.apply(this,arguments);if(enabled()){this._recoveryBase=null;this._recoveryTask={kind:'turn',args:[]};tick();}return value;};
        const esl=UnoScene.prototype.triggerUnoESL;UnoScene.prototype.triggerUnoESL=function(){const value=esl.apply(this,arguments);if(enabled()){this._recoveryBase=null;this._recoveryTask={kind:'esl',args:[]};tick();}return value;};
    }
    if (typeof UnoScene !== 'undefined') attachUno();
    w.GameRuntime={attachUno,capture,restore,suspend,isActive:()=>!!current(),restoring:()=>restoring,later,cancel,cancelLater:kind=>{if(pending&&pending.kind===kind){clearTimeout(pendingTimer);pendingTimer=null;pending=null;}},tick,questionId:()=>question,newQuestion:()=>{cancelQuestion();claimed=false;question++;},claim:()=>{if(!enabled()||!w.GameRecovery||!GameRecovery.active())return true;if(claimed)return false;claimed=true;cancelQuestion();return true;},checkpointUno,initUno,unoData,
        updateUnoFlags:s=>{if(s._recoveryBase&&s._recoveryTask&&s._recoveryTask.kind==='next')s._recoveryBase.vulnerable=s.vulnerable.slice();tick();},transition:(s,p,ms,clear=-1)=>checkpointUno(s,'next',[p,clear,ms]),pendingEffect:(s,pi,card)=>checkpointUno(s,'effect',[pi,card]),deal:(s,step)=>checkpointUno(s,'deal',[step]),initialDiscard:(s,card)=>checkpointUno(s,'initialDiscard',[card]),
        tension:(s,ms)=>{s._recoveryTensionUntil=Date.now()+ms;checkpointUno(s,'tension',[]);},win:(s,pi)=>checkpointUno(s,'win',[pi])};
})(window);
