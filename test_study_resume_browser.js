const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {chromium}=require('playwright-core');
const root=__dirname,qa=path.join(os.tmpdir(),'classroom-study-resume');fs.mkdirSync(qa,{recursive:true});
let checks=0;const ok=(v,s)=>{assert.ok(v,s);checks++;console.log('PASS '+s);};
let remote=null,version=0,completion=null,offline=false,delayGET=0;const events=new Map();
const server=http.createServer((req,res)=>{let pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/Classroom-survivors-preview/,'');const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}fs.readFile(file,(e,b)=>{if(e){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.woff2':'font/woff2','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(b);});});
let base;
async function routes(context){await context.route('**/*',async route=>{const req=route.request(),url=req.url();if(url.includes('/api/')&&!url.includes('/api/src/')){
 if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type,X-Auth-Token,X-App-Key'}});
 if(offline&&url.includes('/studyResume'))return route.abort();
 const body=req.postData()?JSON.parse(req.postData()):{};let data={};
 if(url.includes('/studyResume')){if(req.method()==='GET'){if(delayGET)await new Promise(r=>setTimeout(r,delayGET));data={enabled:true,version,runId:remote&&remote.runId||completion&&completion.runId||null,closedRunId:!remote&&completion?completion.runId:null,completed:completion,snapshot:remote};}else{version++;if(body.action==='complete'){remote=null;completion={runId:body.runId,completedAt:new Date().toISOString()};}else remote=body.snapshot;data={version,seq:remote&&remote.seq};}}
 else if(url.includes('/saveAnalytics')){for(const e of body.events||[]){events.set(e.eventId,e);if(e.type==='session'&&e.sessionType==='study'&&e.data.studyRunId)completion={runId:e.data.studyRunId,completedAt:e.timestamp};}data={addedEventIds:(body.events||[]).map(e=>e.eventId),duplicateEventIds:[],srSeq:body.srSeq};}
 else if(url.includes('Diagnostics')||url.includes('Config')||url.includes('Consent'))data={enabled:false};
 return route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':'*'},body:JSON.stringify(data)});
 }return url.startsWith(base)&&!url.includes('/models/')&&!url.includes('/lib/wasm/')?route.continue():route.abort();});}
async function open(context){const page=await context.newPage();page.on('pageerror',e=>console.log('BROWSER_ERROR '+e.message));await page.goto(base+'/Classroom-survivors-preview/index.html');await page.waitForFunction(()=>window.StudyRuntime&&window.StudyRecovery);return page;}
async function login(page,id='student_resume_a'){
 await page.evaluate(id=>{window.playTTS=()=>{};window.synthGem=()=>{};window.synthError=()=>{};window.playHappySound=()=>{};window.SpeechStatus={isReady:()=>false};if(window.HWRecognition)HWRecognition.load=()=>Promise.resolve();if(navigator.geolocation)navigator.geolocation.getCurrentPosition=()=>{};setSessionToken('x.'+btoa(JSON.stringify({sub:id}))+'.x');saveUserToLocalAndStart({id,role:'student',name:'Resume test',fullName:'Resume test',avatar:'🙂',book:'PU1',unit:'1',page:'11',sessionCount:2,srState:{vocab:{},sentences:{},sentencePairs:{}},analytics:[]});},id);
 await page.waitForTimeout(180);
}
async function saved(page){return page.evaluate(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('csStudyResume_v1_')&&k.endsWith('_'+authActiveUser.id));return k?JSON.parse(localStorage.getItem(k)):null;});}
async function crash(context,page){const crashed=page.waitForEvent('crash');const session=await context.newCDPSession(page);session.send('Page.crash').catch(()=>{});await crashed;await page.close().catch(()=>{});const next=await open(context);await login(next);await next.locator('#study-resume-dialog').waitFor();return next;}
(async()=>{await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 try{const context=await browser.newContext({viewport:{width:1024,height:900}});await routes(context);let page=await open(context);await login(page);
 await page.evaluate(()=>initStudyMode());await page.waitForFunction(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('csStudyResume_v1_'));return k&&JSON.parse(localStorage.getItem(k)).snapshot.state.round==='A';});
 const recognition=await saved(page);ok(recognition.snapshot.exercise.attempts===1,'the first recognition round is recoverable before any exercise is completed');
 page=await crash(context,page);await page.locator('#study-resume-yes').click();await page.waitForFunction(()=>StudyRecovery.active());
 ok(await page.evaluate(target=>currentTTSWord===target,recognition.snapshot.ui.tts),'initial recognition restores the same listening target');
 ok(JSON.stringify(await page.locator('#roundA-container button').allTextContents())===JSON.stringify(recognition.snapshot.ui.aOrder),'initial recognition restores the same word order');
 await page.evaluate(()=>{STUDY_STATE.words=['want','cat','dog','pen','sun'];STUDY_STATE.sentences=['I want a pen.','This is a cat.','I can see a dog.','It is a pen.','It is sunny.'];STUDY_STATE.nonSpellingExercises=null;startRoundC();});
 await page.locator('#scramble-bank button').filter({hasText:/^w$/}).click();await page.locator('#scramble-bank button').filter({hasText:/^a$/}).click();
 await page.waitForFunction(()=>{const k=Object.keys(localStorage).find(k=>k.startsWith('csStudyResume_v1_'));return k&&JSON.parse(localStorage.getItem(k)).snapshot.ui.cSlots.filter(x=>x.text).map(x=>x.text).join('')==='wa';});
 const before=await saved(page);ok(before.snapshot.state.round==='C','Study starts a durable versioned checkpoint');const run=before.runId;
 page=await crash(context,page);await page.screenshot({path:path.join(qa,'resume-prompt-desktop.png')});ok((await page.locator('#study-resume-dialog').textContent()).includes('看起来你上次的学习还没有完成'),'real renderer crash is followed by the Chinese login prompt');
 delayGET=350;await page.locator('#study-resume-yes').click();await page.locator('#study-resume-no').click();await page.waitForTimeout(450);delayGET=0;
 ok(!await page.evaluate(()=>StudyRecovery.active()),'No cancels a pending Yes request without opening the session afterwards');
 ok(await page.locator('#study-resume-button').isVisible(),'No returns to the menu and keeps Continue last session');ok((await saved(page)).runId===run,'No keeps the unfinished session');
 await page.locator('#study-resume-button').click();await page.waitForFunction(()=>StudyRecovery.active());
 ok(await page.evaluate(()=>roundCSlots().map(x=>x.innerText).join('')==='wa'),'resume restores partial spelling');ok(await page.evaluate(()=>STUDY_STATE.words.join(',')==='want,cat,dog,pen,sun'),'resume restores the original five words');
 ok((await saved(page)).runId===run,'resuming keeps the same session identity');
 ok(JSON.stringify(await page.locator('#scramble-bank button').allTextContents())===JSON.stringify(before.snapshot.ui.cBank),'remaining letters keep their order');
 await page.screenshot({path:path.join(qa,'resumed-spelling.png')});
 // A wrong answer keeps its failure and attempt count across a real crash.
 await page.locator('#scramble-bank button').filter({hasText:/^t$/}).click();await page.locator('#scramble-bank button').filter({hasText:/^n$/}).click();
 await page.evaluate(()=>checkRoundC());await page.waitForTimeout(60);
 ok(await page.evaluate(()=>exerciseAttempts===2&&STUDY_STATE._roundCFrozen),'wrong spelling enters the normal feedback state');
 page=await crash(context,page);await page.locator('#study-resume-yes').click();await page.waitForFunction(()=>StudyRecovery.active());
 ok(await page.evaluate(()=>exerciseAttempts===2&&srStudyResults[0].firstAttempt===false),'attempt count and first failure survive the crash');
 await page.waitForFunction(()=>!STUDY_STATE._roundCFrozen);
 ok(await page.evaluate(()=>roundCSlots().every(s=>s.dataset.fixed==='true'||!s.innerText)),'restored feedback timer clears the board once');
 for(const c of 'want')await page.locator('#scramble-bank button').filter({hasText:new RegExp('^'+c+'$')}).first().click();
 await page.evaluate(()=>checkRoundC());await page.waitForFunction(()=>STUDY_STATE.currentWordIndex===1);
 ok(await page.evaluate(()=>currentTTSWord==='cat'),'the recovered spelling exercise advances normally');
 // Preserve the current handwriting letter, chosen gaps, guides and actual ink.
 await page.evaluate(()=>{startRoundD();HWRecognition.verify=()=>Promise.resolve({accepted:false,top:[]});});
 const canvas=page.locator('.hw-trace-canvas'),box=await canvas.boundingBox();
 await page.mouse.move(box.x+box.width*.25,box.y+box.height*.3);await page.mouse.down();await page.mouse.move(box.x+box.width*.7,box.y+box.height*.7,{steps:9});await page.mouse.up();
 await page.waitForTimeout(40);const inkBefore=await saved(page);
 ok(inkBefore.snapshot.handwriting.trace.s.length>0,'functional checkpoint contains the unfinished handwriting ink');
 page=await crash(context,page);await page.locator('#study-resume-yes').click();await page.waitForFunction(()=>StudyRecovery.active()&&!!roundDTrace);
 const inkAfter=await page.evaluate(()=>({trace:roundDTrace.exportRecovery(),gaps:roundDGapOrder,cursor:roundDCursor}));
 ok(JSON.stringify(inkAfter.trace.s)===JSON.stringify(inkBefore.snapshot.handwriting.trace.s),'handwriting strokes are restored exactly in engine coordinates');
 ok(JSON.stringify(inkAfter.gaps)===JSON.stringify(inkBefore.snapshot.handwriting.gaps)&&inkAfter.cursor===inkBefore.snapshot.handwriting.cursor,'the same handwriting gaps and current letter are retained');
 await page.screenshot({path:path.join(qa,'resumed-handwriting.png')});
 // Restore sentence tiles and their remaining bank order.
 await page.evaluate(()=>{STUDY_STATE.nonSpellingExercises=null;STUDY_STATE._mixedActive=false;startRoundE();});
 await page.locator('#sentence-word-bank .study-word-tile').filter({hasText:/^I$/}).first().click();await page.locator('#sentence-word-bank .study-word-tile').filter({hasText:/^want$/}).first().click();
 await page.waitForTimeout(40);const sentenceBefore=await saved(page);
 page=await crash(context,page);await page.locator('#study-resume-yes').click();await page.waitForFunction(()=>StudyRecovery.active());
 ok(await page.evaluate(()=>[...document.querySelectorAll('#sentence-drop-zone .placed')].map(x=>x.dataset.word).join(' ')==='I want'),'partial sentence tile placement survives a crash');
 ok(JSON.stringify(await page.locator('#sentence-word-bank .study-word-tile').allTextContents())===JSON.stringify(sentenceBefore.snapshot.ui.eBank.map(x=>x.text)),'remaining sentence tiles keep their order');
 // No automatic microphone restart when interruption happens while recording.
 await page.evaluate(()=>{window.__micStarts=0;window.Recorder=class{static isSupported(){return true;}start(){window.__micStarts++;return Promise.resolve();}cancel(){}stop(){return Promise.resolve(null);}};SpeechStatus={isReady:()=>true};});
 for(const word of ['a','pen.'])await page.locator('#sentence-word-bank .study-word-tile').filter({hasText:new RegExp('^'+word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$')}).first().click();
 await page.evaluate(()=>checkRoundE());await page.locator('.speech-rec-btn').click();await page.waitForFunction(()=>document.querySelector('.speech-rec-btn').dataset.speechState==='recording');await page.waitForTimeout(40);
 const speechBefore=await saved(page);ok(speechBefore.snapshot.speech.recordingState==='recording','the checkpoint identifies an interrupted speaking step');
 page=await crash(context,page);await page.locator('#study-resume-yes').click();await page.waitForFunction(()=>StudyRecovery.active());
 ok(await page.locator('.speech-sentence-gate').count()===1,'the correctly built sentence resumes at its speaking step');
 ok(await page.locator('.speech-rec-btn').getAttribute('data-speech-state')!=='recording'&&(await page.locator('.heard-feedback').textContent()).includes('录音已中断'),'microphone stays stopped and the child can explicitly retry');
 ok(await page.locator('.speech-practice-continue').isVisible(),'interrupted speaking can still use the normal Continue action');
 await page.locator('.speech-practice-continue').click();await page.waitForFunction(()=>STUDY_STATE.currentSentenceIndex===1);
 ok(await page.evaluate(()=>STUDY_STATE.sentences[1]==='This is a cat.'),'speaking continuation advances without repeating the completed grammar exercise');
 // Matching keeps already recorded pairs, placements and failed attempts.
 await page.evaluate(()=>{StudyRuntime.cancel();STUDY_STATE.round='F';STUDY_STATE._mixedActive=false;STUDY_STATE.subRound=1;STUDY_STATE.sentencePairs=[{a:'What is it?',b:'It is a pen.'},{a:'Where is it?',b:'It is here.'},{a:'Do you want it?',b:'Yes, I do.'}];STUDY_STATE.pairAttempts=[1,1,1];STUDY_STATE.pairQueued=[false,false,false];STUDY_STATE.isTransitioning=false;renderRoundF();});
 await page.locator('.sentence-b-tile[data-correct-index="0"]').click();await page.locator('.sentence-b-slot[data-target-index="0"]').click();await page.locator('.sentence-b-tile[data-correct-index="1"]').click();await page.locator('.sentence-b-slot[data-target-index="2"]').click();await page.evaluate(()=>checkRoundF());await page.waitForTimeout(40);
 const matchBefore=await saved(page);page=await crash(context,page);await page.locator('#study-resume-yes').click();await page.waitForFunction(()=>StudyRecovery.active());
 ok(await page.evaluate(()=>STUDY_STATE.pairQueued[0]&&STUDY_STATE.pairAttempts[1]===2),'matching preserves prior pair credit and wrong-attempt counters');
 ok(await page.locator('.sentence-b-slot[data-target-index="0"] .correct-match').count()===1,'matching restores the already-correct green placement');
 await page.waitForFunction(()=>!STUDY_STATE.isTransitioning);ok(await page.locator('#sentence-b-dock .sentence-b-tile').count()===3,'restored matching feedback resets normally');
 // Partial mixed-word exercise is also available from a new browser with no local save.
 await page.evaluate(()=>{StudyRuntime.cancel();const pool=NonSpellingContent.buildPool('PU3','9','111',{pageOnly:true}).entries.map(e=>e.item);STUDY_STATE.nonSpellingExercises=[pool.find(e=>e.type==='missing-word'&&e.id==='M1'),pool.find(e=>e.type==='find-fix'),pool.find(e=>e.type==='sentence-scramble'),pool.find(e=>e.type==='sentence-match'),pool.find(e=>e.type==='missing-word'&&e.id==='M8')];selectedClassContent={book:'PU3',unit:'9',page:'111'};NonSpellingFlow.beginStudy();});
 const item=await page.evaluate(()=>STUDY_STATE.nonSpellingExercises[0]);await page.locator('[data-box="0"]').click();const initial=(item.prefixes||[])[0]||'';for(const c of item.answers[0].slice(initial.length,initial.length+2))await page.locator('[data-letter="'+c+'"]').click();await page.waitForTimeout(50);
 const typedBefore=await saved(page);await page.evaluate(()=>StudyRecovery.flush());
 for(let i=0;i<60&&(!remote||remote.state.currentNonSpellingIndex!==0||!remote.ui.typed||JSON.stringify(remote.ui.typed.input)!==JSON.stringify(typedBefore.snapshot.ui.typed.input));i++){await page.waitForTimeout(100);await page.evaluate(()=>StudyRecovery.flush());}
 ok(remote&&remote.ui.typed&&JSON.stringify(remote.ui.typed.input)===JSON.stringify(typedBefore.snapshot.ui.typed.input),'small remote checkpoint receives the partial mixed exercise');
 await page.evaluate(()=>StudyRecovery.pause());await page.close();const fresh=await browser.newContext({viewport:{width:390,height:844}});await routes(fresh);page=await open(fresh);
 ok(await page.evaluate(()=>!Object.keys(localStorage).some(k=>k.startsWith('csStudyResume_v1_'))),'second browser starts with no local checkpoint');await login(page);await page.locator('#study-resume-dialog').waitFor();await page.screenshot({path:path.join(qa,'resume-prompt-phone.png')});await page.locator('#study-resume-yes').click();await page.waitForFunction(()=>StudyRecovery.active());
 ok(JSON.stringify(await page.evaluate(()=>NonSpellingWidget.getState().input))===JSON.stringify(typedBefore.snapshot.ui.typed.input),'another browser restores the same partial word input');
 ok(await page.evaluate(()=>selectedClassContent.book==='PU3'&&selectedClassContent.page==='111'&&authActiveUser.book==='PU1'),'original Study content is restored without changing the current assignment');
 ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Chinese recovery and restored exercise fit a phone screen');
 await page.screenshot({path:path.join(qa,'remote-resume-phone.png')});
 // Account switches cannot offer another learner's work.
 const oldTyped=await saved(page);await login(page,'student_resume_b');
 ok(await page.locator('#study-resume-dialog').count()===0&&await page.locator('#study-resume-button').isHidden(),'another student sees neither the prompt nor the saved session');
 await login(page);await page.locator('#study-resume-dialog').waitFor();await page.locator('#study-resume-no').click();
 await page.evaluate(()=>queueSessionEvent('uno',{durationMs:10}));
 ok(await page.locator('#study-resume-button').isVisible(),'a game completion leaves the Study continuation available');
 // Starting a different Study and finishing it clears the old offer.
 await page.evaluate(()=>{initStudyMode();const pool=NonSpellingContent.buildPool('PU3','9','111',{pageOnly:true}).entries.map(e=>e.item);STUDY_STATE.words=['cat'];STUDY_STATE.nonSpellingExercises=[pool.find(e=>e.type==='missing-word'&&e.id==='M1')];STUDY_STATE.sentences=[];startRoundA();});
 const newRun=(await saved(page)).runId;ok(newRun!==oldTyped.runId,'a new Study has a different session identity');
 await page.locator('#roundA-container button').click();await page.waitForFunction(()=>STUDY_STATE.round==='C');
 for(const c of 'cat')await page.locator('#scramble-bank button').filter({hasText:new RegExp('^'+c+'$')}).first().click();await page.evaluate(()=>checkRoundC());
 await page.waitForFunction(()=>STUDY_STATE.round==='D');
 while(await page.evaluate(()=>STUDY_STATE.round==='D')){if(await page.evaluate(()=>!STUDY_STATE.isTransitioning&&roundDCursor<roundDGapOrder.length))await page.evaluate(()=>roundDAcceptLetter(roundDSlots[roundDGapOrder[roundDCursor]].char));await page.waitForTimeout(170);}
 const last=await page.evaluate(()=>STUDY_STATE.nonSpellingExercises[0]);
 for(let b=0;b<last.answers.length;b++){await page.locator('[data-box="'+b+'"]').click();const pre=(last.prefixes||[])[b]||'',post=(last.suffixes||[])[b]||'';for(const c of last.answers[b].slice(pre.length,last.answers[b].length-post.length))await page.locator('[data-letter="'+c+'"]').click();}
 await page.locator('#check').click();await page.waitForFunction(()=>STUDY_STATE.srFinalized);await page.waitForTimeout(250);
 ok((await saved(page)).status==='completed','finishing the new Study durably clears the unfinished checkpoint');
 ok(await page.locator('#study-resume-button').isHidden(),'Continue last session disappears after the new Study completes');
 const sessions=[...events.values()].filter(e=>e.type==='session'&&e.sessionType==='study');
 ok(sessions.length===1&&sessions[0].eventId==='se_study_'+newRun,'real completion delivery gives exactly one Study credit with a stable identity');
 await page.evaluate(()=>finishStudySession());await page.waitForTimeout(100);ok([...events.values()].filter(e=>e.type==='session'&&e.sessionType==='study').length===1,'repeated finish callbacks do not create another session');
 // Even an old local copy cannot resurrect a completed/superseded session.
 await page.evaluate(old=>{const k=Object.keys(localStorage).find(k=>k.startsWith('csStudyResume_v1_')&&k.endsWith('_'+authActiveUser.id));localStorage.setItem(k,JSON.stringify(old));},oldTyped);
 await page.reload();await page.waitForFunction(()=>window.StudyRuntime);await login(page);await page.waitForTimeout(200);
 ok(await page.locator('#study-resume-dialog').count()===0&&await page.locator('#study-resume-button').isHidden(),'server completion suppresses a stale local resume copy');
 // A session begun without network remains recoverable from this browser.
 offline=true;await page.evaluate(()=>{initStudyMode();STUDY_STATE.words=['want'];STUDY_STATE.nonSpellingExercises=null;STUDY_STATE.sentences=['I want a pen.'];startRoundC();});await page.locator('#scramble-bank button').filter({hasText:/^w$/}).click();await page.waitForTimeout(40);
 page=await crash(fresh,page);await page.locator('#study-resume-yes').click();await page.waitForFunction(()=>StudyRecovery.active());
 ok(await page.evaluate(()=>roundCSlots().map(s=>s.innerText).join('')==='w'),'offline interruption restores locally saved input');
 offline=false;await page.evaluate(()=>dispatchEvent(new Event('online')));for(let i=0;i<60&&(!remote||remote.runId!==(await saved(page)).runId);i++){await page.waitForTimeout(100);await page.evaluate(()=>StudyRecovery.flush());}
 ok(remote&&remote.runId===(await saved(page)).runId,'an offline-only session establishes its remote checkpoint after reconnection');
 // Find/fix retains the binned word, partial correction and first-check outcome.
 await page.evaluate(()=>{StudyRuntime.cancel();const pool=NonSpellingContent.buildPool('PU3','9','111',{pageOnly:true}).entries.map(e=>e.item);STUDY_STATE.nonSpellingExercises=[pool.find(e=>e.type==='find-fix')];NonSpellingFlow.beginStudy();});
 const fix=await page.evaluate(()=>STUDY_STATE.nonSpellingExercises[0]);
 const wrongIndex=Number.isInteger(fix.wrongIndex)?fix.wrongIndex:fix.sentence.split(' ').findIndex(w=>w.toLowerCase().replace(/[.,!?]/g,'')===fix.wrongWord.toLowerCase());
 await page.locator('[data-word="'+wrongIndex+'"]').click();await page.locator('#bin').click();for(const c of fix.answer.slice(0,2))await page.locator('[data-letter="'+c+'"]').click();await page.waitForTimeout(40);
 const fixBefore=await saved(page);page=await crash(fresh,page);await page.locator('#study-resume-yes').click();await page.waitForFunction(()=>StudyRecovery.active());
 ok(await page.evaluate(i=>NonSpellingWidget.getState().binnedWord===i,wrongIndex),'find/fix keeps the selected word in the bin');
 ok(JSON.stringify(await page.evaluate(()=>NonSpellingWidget.getState().input))===JSON.stringify(fixBefore.snapshot.ui.typed.input),'find/fix keeps the partially typed correction');
 await page.locator('#clear').click();await page.locator('[data-word="'+wrongIndex+'"]').click();await page.locator('#bin').click();
 const wrongLetter=await page.evaluate(()=>NonSpellingWidget.getState().letters[0]);for(let i=0;i<fix.answer.length;i++)await page.locator('[data-letter="'+wrongLetter+'"]').click();await page.locator('#check').click();await page.waitForTimeout(40);
 ok(await page.evaluate(()=>STUDY_STATE._typedRecorded&&srStudyResults.some(r=>r.firstAttempt===false)),'first wrong typed check is retained in the checkpoint');
 await page.evaluate(()=>exitStudyMode());const lapseBefore=await page.evaluate(key=>authActiveUser.srState.sentences[key].lapses,fix.key);
 await page.locator('#study-resume-button').click();await page.waitForFunction(()=>StudyRecovery.active());await page.waitForFunction(()=>!NonSpellingWidget.getState().locked);
 await page.locator('[data-word="'+wrongIndex+'"]').click();await page.locator('#bin').click();for(const c of fix.answer)await page.locator('[data-letter="'+c+'"]').click();await page.locator('#check').click();await page.waitForFunction(()=>STUDY_STATE.srFinalized);
 ok(await page.evaluate(({key,lapses})=>authActiveUser.srState.sentences[key].lapses===lapses&&authActiveUser.srState.sentences[key].lastResult==='failure',{key:fix.key,lapses:lapseBefore}),'exit/resume/final completion does not double-apply a failure or turn a retry into first-time success');
 ok([...events.values()].filter(e=>e.type==='session'&&e.sessionType==='study').length===2,'a resumed Study adds exactly one further completion');
 // Input is saved even when the login checkpoint lookup is still in flight.
 const rapid=await browser.newContext({viewport:{width:390,height:844}});await routes(rapid);const quick=await open(rapid);delayGET=1500;await login(quick);
 await quick.evaluate(()=>{initStudyMode();STUDY_STATE.words=['want'];STUDY_STATE.nonSpellingExercises=null;STUDY_STATE.sentences=['I want a pen.'];startRoundC();});await quick.locator('#scramble-bank button').filter({hasText:/^w$/}).click();await quick.waitForTimeout(80);
 const rapidSave=await saved(quick);ok(rapidSave.snapshot.state.round==='C'&&rapidSave.snapshot.ui.cSlots.map(s=>s.text).join('')==='w','fast practice input is checkpointed before the remote login check finishes');
 await quick.waitForTimeout(1600);delayGET=0;await rapid.close();
 await fresh.close();
 console.log('Study resume browser: '+checks+' checks passed.');await context.close();
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
