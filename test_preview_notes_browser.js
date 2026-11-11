'use strict';
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {chromium}=require('playwright-core');
const pu1=process.argv.includes('--pu1');
const pu1p87=process.argv.includes('--pu1-p87');
const pu1p59=process.argv.includes('--pu1-p59');
const pu3p35=process.argv.includes('--pu3-p35');
const pu3p97=process.argv.includes('--pu3-p97');
const pu2p60=process.argv.includes('--pu2-p60');
const lesson=pu2p60?{book:'PU2',unit:'5',page:'60',previous:'59',id:'pu2-u5-p60',pageCount:3,missing:'M17',secondMissing:'M23',fix:'F23',srKey:'non-spelling:find-fix:pu2:5:60:f23'}:pu1p87?{book:'PU1',unit:'7',page:'87',previous:'85',id:'pu1-u7-p87',pageCount:5,missing:'M17',secondMissing:'M26',fix:'F30',srKey:'non-spelling:find-fix:pu1:7:92:f30'}:pu1p59?{book:'PU1',unit:'5',page:'59',previous:'57',id:'pu1-u5-p59',pageCount:3,missing:'M6',secondMissing:'M8',fix:'F7',srKey:'non-spelling:find-fix:pu1:5:59:f7'}:pu3p97?{book:'PU3',unit:'8',page:'97',previous:'95',id:'pu3-u8-p97',pageCount:1,missing:'M7',secondMissing:'M8',fix:'F5',srKey:'non-spelling:find-fix:pu3:8:97:f5'}:pu3p35?{book:'PU3',unit:'3',page:'35',previous:'33',id:'pu3-u3-p35',pageCount:6,missing:'M11',secondMissing:'M12',fix:'F16',srKey:'non-spelling:find-fix:pu3:3:40:f16'}:pu1?{book:'PU1',unit:'7',page:'85',previous:'83',id:'pu1-u7-p85',pageCount:3,missing:'M9',secondMissing:'M16',fix:'F20',srKey:'non-spelling:find-fix:pu1:7:84:f20'}:{book:'PU3',unit:'9',page:'111',previous:'110',id:'pu3-u9-p111',pageCount:4,missing:'M1',secondMissing:'M8',fix:'F14',srKey:'non-spelling:find-fix:pu3:9:111:f14'};
lesson.placement={book:lesson.book,unit:lesson.unit,page:lesson.page};
const root=__dirname,qa=path.join(os.tmpdir(),'classroom-preview-notes-integration',lesson.id);fs.mkdirSync(qa,{recursive:true});
let count=0;function ok(value,label){assert.ok(value,label);count++;console.log('PASS '+label);}
const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  const p=file.endsWith(path.sep)?path.join(file,'index.html'):file;
  fs.readFile(p,(error,bytes)=>{if(error){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',({'js':'text/javascript','css':'text/css','html':'text/html','png':'image/png','woff2':'font/woff2','mp3':'audio/mpeg'})[path.extname(p).slice(1)]||'application/octet-stream');res.end(bytes);});
});
async function fixture(page,id='notes-a',placement=lesson.placement,notes={}){
 await page.evaluate(({id,placement,notes})=>{
  window.playTTS=()=>{};window.synthGem=()=>{};window.synthError=()=>{};window.playHappySound=()=>{};window.SpeechStatus={isReady:()=>false};if(window.AdaptiveSpeech)AdaptiveSpeech.enabled=false;
  if(window.HWRecognition) HWRecognition.load=()=>Promise.resolve();
  if(typeof STUDY_STATE!=='undefined'&&STUDY_STATE.active)exitStudyMode();
  resetInMemorySessionState();
  const now=Date.now();
  authActiveUser={id,name:'Preview fixture',role:'student',avatar:'🙂',...placement,previewNotes:notes,sessionCount:2,srState:{vocab:{},sentences:{},sentencePairs:{}},analytics:[],targets:[{startTime:new Date(now-86400000).toISOString(),endTime:new Date(now+86400000).toISOString(),targetSessions:3}]};
  isTestMode=false;window.__saved=[];
  apiFetch=async(url,options={})=>{const body=options.body?JSON.parse(options.body):{};window.__saved.push({url,body});return {ok:true,status:200,json:async()=>({addedEventIds:(body.events||[]).map(e=>e.eventId),duplicateEventIds:[],srSeq:body.srSeq})};};
  if(navigator.geolocation)navigator.geolocation.getCurrentPosition=()=>{};
  finishLogin();
 },{id,placement,notes});
}
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1102,height:900}}),page=await context.newPage(),errors=[];
  await context.addInitScript(value=>{window.testNote=value;},lesson);
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{const u=route.request().url();return u.startsWith(base)&&!u.includes('/models/')&&!u.includes('/lib/wasm/')?route.continue():route.abort();});
  await page.goto(base+'/index.html?resume=0&testMode=true&studentBook='+lesson.book+'&studentUnit='+lesson.unit+'&studentPage='+lesson.page);
  await page.waitForFunction(()=>window.PreviewNotes&&window.NonSpellingFlow);
  if(pu1){await fixture(page,'notes-legacy',{book:'PU1',unit:'7',page:'84'});ok(await page.evaluate(()=>authActiveUser.page==='85'&&selectedClassContent.page==='85'),'legacy page 84 assignment resolves to page 85 before loading content');}
  await fixture(page);
  await page.locator('#preview-notes-overlay iframe').waitFor();
  ok(true,'manual preview-page assignment automatically opens notes after real finishLogin');
  ok((await page.locator('#preview-notes-overlay iframe').getAttribute('allow')).includes('microphone'),'embedded notes allow explicit student microphone use');
  ok(await page.locator('#preview-notes-button').isHidden(),'library button stays hidden until a preview Study is completed');
  const reader=page.frameLocator('#preview-notes-overlay iframe');
  await reader.locator('.note-page').first().waitFor();
  ok(await reader.locator('.note-page').count()===lesson.pageCount,'integrated reader includes all approved original pages');
  ok(!(await reader.locator('#reader-study-start').isDisabled()),'Chinese Start studying has no listening gate');
  await page.screenshot({path:path.join(qa,'automatic-intro.png')});
  await reader.locator('#reader-study-start').click();
  await page.waitForFunction(()=>STUDY_STATE.active&&STUDY_STATE.round==='A'&&!document.getElementById('preview-notes-overlay'));
  ok(await page.evaluate(()=>STUDY_STATE.words.length===5&&new Set(STUDY_STATE.words).size===5&&STUDY_STATE.words.every(w=>TEACHING_CONTENT[testNote.book][testNote.unit][testNote.page].vocab.includes(w))),'five random vocabulary items come from assigned page vocabulary array');
  ok(await page.evaluate(()=>STUDY_STATE.nonSpellingExercises.length===5&&STUDY_STATE.nonSpellingExercises.every(e=>e.book===testNote.book&&e.unit===testNote.unit&&e.page===testNote.page)),'five non-spelling boards are strictly page-scoped');
  await page.evaluate(()=>exitStudyMode());await fixture(page);
  ok(await page.locator('#preview-notes-overlay').isVisible(),'abandoned session does not complete preview');
  await page.evaluate(()=>PreviewNotes.close());
  await page.evaluate(()=>{localStorage.setItem('csPendingPageAdvance',JSON.stringify({book:testNote.book,unit:testNote.unit,page:testNote.previous}));finishLogin();});
  ok(await page.locator('#preview-notes-overlay').isVisible()&&await page.evaluate(()=>authActiveUser.page===testNote.page),'stale pending placement cannot bypass newly assigned notes');
  await page.evaluate(()=>localStorage.removeItem('csPendingPageAdvance'));
  await page.frameLocator('#preview-notes-overlay iframe').locator('#reader-study-start').click();
  await page.waitForFunction(()=>STUDY_STATE.active&&STUDY_STATE.round==='A');
  // Exercise all four existing widget types deterministically; selection itself
  // remains random and is separately sampled over 200 complete plans.
  await page.evaluate(()=>{
   const pool=NonSpellingContent.buildPool(testNote.book,testNote.unit,testNote.page,{pageOnly:true}).entries.map(e=>e.item);
   STUDY_STATE.nonSpellingExercises=[pool.find(e=>e.id===testNote.missing&&e.type==='missing-word'),pool.find(e=>e.id===testNote.fix&&e.type==='find-fix'),pool.find(e=>e.type==='sentence-scramble'),pool.find(e=>e.type==='sentence-match'),pool.find(e=>e.id===testNote.secondMissing&&e.type==='missing-word')];
  });
  for(let i=0;i<5;i++){
   await page.waitForFunction(()=>STUDY_STATE.round==='A'&&!STUDY_STATE.isTransitioning);
   const word=await page.evaluate(()=>currentTTSWord);await page.locator('#roundA-container button').filter({hasText:new RegExp('^'+word+'$')}).click();
   await page.waitForFunction(()=>!STUDY_STATE.isTransitioning);
  }
  await page.waitForFunction(()=>STUDY_STATE.round==='C');
  ok(true,'Round A progresses into regular word scramble');
  for(let i=0;i<5;i++){
   const word=await page.evaluate(()=>STUDY_STATE.words[STUDY_STATE.currentWordIndex]);
   for(const letter of word.replace(/[ .?!-]/g,''))await page.locator('#scramble-bank button').filter({hasText:new RegExp('^'+letter+'$')}).first().click();
   await page.evaluate(()=>checkRoundC());
   await page.waitForFunction(i=>STUDY_STATE.round!=='C'||STUDY_STATE.currentWordIndex>i,i);
  }
  await page.waitForFunction(()=>STUDY_STATE.round==='D'&&!!roundDTrace);
  ok(true,'regular handwriting round follows the same five vocabulary words');
  // Accept recognition outcomes through the real handwriting-round handler.
  // Recognition accuracy remains covered by the existing handwriting suites.
  while(await page.evaluate(()=>STUDY_STATE.round==='D')){
   const ready=await page.evaluate(()=>!STUDY_STATE.isTransitioning&&roundDCursor<roundDGapOrder.length);
   if(ready)await page.evaluate(()=>roundDAcceptLetter(roundDSlots[roundDGapOrder[roundDCursor]].char));
   await page.waitForTimeout(170);
  }
  ok(await page.evaluate(()=>STUDY_STATE._mixedActive&&STUDY_STATE.currentNonSpellingIndex===0),'Round D uses the normal mixed-exercise adapter');
  for(let index=0;index<5;index++){
   const item=await page.evaluate(()=>STUDY_STATE.nonSpellingExercises[STUDY_STATE.currentNonSpellingIndex]);
   if(item.type==='missing-word'){
    for(let b=0;b<item.answers.length;b++){
     await page.locator('[data-box="'+b+'"]').click();
     const prefix=(item.prefixes||[])[b]||'';for(const letter of item.answers[b].slice(prefix.length))await page.locator('[data-letter="'+letter+'"]').click();
    }
    await page.locator('#check').click();
   }else if(item.type==='find-fix'){
    const wrong=await page.locator('#words .word').allTextContents().catch(()=>[]);
    const target=await page.evaluate(()=>{const words=document.querySelectorAll('[data-word]');return [...words].find(el=>el.textContent.toLowerCase().replace(/[.,!?]/g,'')===STUDY_STATE.nonSpellingExercises[STUDY_STATE.currentNonSpellingIndex].wrongWord.toLowerCase()).dataset.word;});
    await page.locator('[data-word="'+target+'"]').click();await page.locator('#bin').click();
    for(const letter of item.answer)await page.locator('[data-letter="'+letter+'"]').click();await page.locator('#check').click();
   }else if(item.type==='sentence-scramble'){
    const text=Array.isArray(item.sentence)?item.sentence[0]:item.sentence;
    for(const word of text.split(' '))await page.locator('#sentence-word-bank .study-word-tile').filter({hasText:new RegExp('^'+word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$')}).first().click();
    await page.evaluate(()=>checkRoundE());
   }else{
    for(let p=0;p<item.pairs.length;p++){await page.locator('.sentence-b-tile[data-correct-index="'+p+'"]').click();await page.locator('.sentence-b-slot[data-target-index="'+p+'"]').click();}
    await page.evaluate(()=>checkRoundF());
   }
   await page.waitForFunction(i=>STUDY_STATE.currentNonSpellingIndex>i,index);
  }
  await page.waitForFunction(()=>document.getElementById('study-title').textContent==='Session Complete');
  ok(await page.evaluate(()=>!!authActiveUser.previewNotes[testNote.id]),'only completed follow-up Study unlocks permanent notes');
  ok(await page.evaluate(()=>!document.getElementById('preview-notes-button').classList.contains('hidden')),'first completed preview Study immediately unlocks the library button for the main menu');
  ok(await page.evaluate(()=>authActiveUser.analytics.filter(e=>e.type==='session'&&e.sessionType==='study').length===1),'one regular completed study session recorded');
  ok(await page.evaluate(()=>countCompletedSessionsForTarget(authActiveUser,authActiveUser.targets[0].startTime,authActiveUser.targets[0].endTime)===1),'weekly target receives exactly one session credit');
  ok(await page.evaluate(()=>Object.keys(authActiveUser.srState.vocab).length===5&&Object.keys(authActiveUser.srState.sentences).some(k=>k===testNote.srKey)),'normal vocabulary and typed-exercise SR outcomes persisted');
  ok(await page.evaluate(()=>__saved.some(r=>r.body.events?.some(e=>e.data?.previewNote?.id===testNote.id))&&__saved.some(r=>r.body.srDelta)),'completion marker and normal SR delta use the real acknowledged flush');
  await page.evaluate(()=>finishStudySession());
  ok(await page.evaluate(()=>authActiveUser.analytics.filter(e=>e.type==='session').length===1),'duplicate completion cannot double credit');
  const notes=await page.evaluate(()=>authActiveUser.previewNotes);
  await fixture(page,'notes-a',lesson.placement,notes);
  ok(await page.locator('#preview-notes-overlay').count()===0,'completed page uses normal login');
  await page.locator('#preview-notes-button').click();await page.locator('.preview-notes-library button').click();
  ok((await page.frameLocator('#preview-notes-overlay iframe').locator('#reader-study-start').textContent())==='返回主界面','studied notes reopen in listening-only review mode');
  await page.evaluate(()=>PreviewNotes.close());
  await fixture(page,'notes-b');ok(await page.locator('#preview-notes-overlay').isVisible(),'another student does not inherit completion');
  await page.evaluate(()=>PreviewNotes.close());
  await fixture(page,'notes-server-only',lesson.placement,notes);
  ok(await page.locator('#preview-notes-overlay').count()===0,'server completion works on a fresh account cache');
  await fixture(page,'notes-advance',{book:lesson.book,unit:lesson.unit,page:lesson.previous},pu1p87?{'pu1-u7-p85':{version:1,completedAt:'2026-11-03T01:00:00Z'}}:{});
  ok(pu1p87?await page.locator('#preview-notes-button').isVisible():await page.locator('#preview-notes-button').isHidden(),'library button reflects completed earlier notes');
  await page.evaluate(()=>{
   PreviewNotes.close();
   const current=getCurrentSession();
   const sorted=getSortedPagesForBook(testNote.book),end=sorted.findIndex(p=>p.unit===testNote.unit&&p.page===testNote.previous);
   for(const type of ['vocab','sentences','sentencePairs'])for(const e of buildItemPool(sorted.slice(0,end+1),type).flatPool)authActiveUser.srState[type][e.key]={lastResult:'success',dueAfterSession:current+999,interval:999};
   finishLogin();
  });
  ok(await page.evaluate(()=>authActiveUser.page===testNote.page)&&await page.locator('#preview-notes-overlay').isVisible(),'automatic SR advancement stops at the registered page and opens its preview');
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(qa,'automatic-intro-phone.png')});
  ok(errors.length===0,'no browser runtime errors: '+errors.join(','));
  console.log(count+' preview-note integration checks passed; '+qa);
  await context.close();
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});

