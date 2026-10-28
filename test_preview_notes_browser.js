'use strict';
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {chromium}=require('playwright-core');
const root=__dirname,qa=path.join(os.tmpdir(),'classroom-preview-notes-integration');fs.mkdirSync(qa,{recursive:true});
let count=0;function ok(value,label){assert.ok(value,label);count++;console.log('PASS '+label);}
const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  const p=file.endsWith(path.sep)?path.join(file,'index.html'):file;
  fs.readFile(p,(error,bytes)=>{if(error){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',({'js':'text/javascript','css':'text/css','html':'text/html','png':'image/png','woff2':'font/woff2','mp3':'audio/mpeg'})[path.extname(p).slice(1)]||'application/octet-stream');res.end(bytes);});
});
async function fixture(page,id='notes-a',placement={book:'PU3',unit:'9',page:'111'},notes={}){
 await page.evaluate(({id,placement,notes})=>{
  window.playTTS=()=>{};window.synthGem=()=>{};window.synthError=()=>{};window.playHappySound=()=>{};window.SpeechStatus={isReady:()=>false};
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
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{const u=route.request().url();return u.startsWith(base)&&!u.includes('/models/')&&!u.includes('/lib/wasm/')?route.continue():route.abort();});
  await page.goto(base+'/index.html?testMode=true&studentBook=PU3&studentUnit=9&studentPage=111');
  await page.waitForFunction(()=>window.PreviewNotes&&window.NonSpellingFlow);
  await fixture(page);
  await page.locator('#preview-notes-overlay iframe').waitFor();
  ok(true,'manual p111 assignment automatically opens notes after real finishLogin');
  ok(await page.locator('#preview-notes-button').isHidden(),'library button stays hidden until a preview Study is completed');
  const reader=page.frameLocator('#preview-notes-overlay iframe');
  await reader.locator('.note-page').first().waitFor();
  ok(await reader.locator('.note-page').count()===4,'integrated reader includes all four original pages');
  ok(!(await reader.locator('#reader-study-start').isDisabled()),'Chinese Start studying has no listening gate');
  await page.screenshot({path:path.join(qa,'automatic-intro.png')});
  await reader.locator('#reader-study-start').click();
  await page.waitForFunction(()=>STUDY_STATE.active&&STUDY_STATE.round==='A'&&!document.getElementById('preview-notes-overlay'));
  ok(await page.evaluate(()=>STUDY_STATE.words.length===5&&new Set(STUDY_STATE.words).size===5&&STUDY_STATE.words.every(w=>TEACHING_CONTENT.PU3[9][111].vocab.includes(w))),'five random vocabulary items come from existing p111 array');
  ok(await page.evaluate(()=>STUDY_STATE.nonSpellingExercises.length===5&&STUDY_STATE.nonSpellingExercises.every(e=>e.book==='PU3'&&e.unit==='9'&&e.page==='111')),'five non-spelling boards are strictly page-scoped');
  await page.evaluate(()=>exitStudyMode());await fixture(page);
  ok(await page.locator('#preview-notes-overlay').isVisible(),'abandoned session does not complete preview');
  await page.evaluate(()=>PreviewNotes.close());
  await page.evaluate(()=>{localStorage.setItem('csPendingPageAdvance',JSON.stringify({book:'PU3',unit:'9',page:'110'}));finishLogin();});
  ok(await page.locator('#preview-notes-overlay').isVisible()&&await page.evaluate(()=>authActiveUser.page==='111'),'stale pending placement cannot bypass newly assigned notes');
  await page.evaluate(()=>localStorage.removeItem('csPendingPageAdvance'));
  await page.frameLocator('#preview-notes-overlay iframe').locator('#reader-study-start').click();
  await page.waitForFunction(()=>STUDY_STATE.active&&STUDY_STATE.round==='A');
  // Exercise all four existing widget types deterministically; selection itself
  // remains random and is separately sampled over 200 complete plans.
  await page.evaluate(()=>{
   const pool=NonSpellingContent.buildPool('PU3','9','111',{pageOnly:true}).entries.map(e=>e.item);
   STUDY_STATE.nonSpellingExercises=[pool.find(e=>e.id==='M1'&&e.type==='missing-word'),pool.find(e=>e.id==='F14'&&e.type==='find-fix'),pool.find(e=>e.type==='sentence-scramble'),pool.find(e=>e.type==='sentence-match'),pool.find(e=>e.id==='M8'&&e.type==='missing-word')];
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
   for(const letter of word)await page.locator('#scramble-bank button').filter({hasText:new RegExp('^'+letter+'$')}).first().click();
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
  ok(await page.evaluate(()=>!!authActiveUser.previewNotes['pu3-u9-p111']),'only completed follow-up Study unlocks permanent notes');
  ok(await page.evaluate(()=>!document.getElementById('preview-notes-button').classList.contains('hidden')),'first completed preview Study immediately unlocks the library button for the main menu');
  ok(await page.evaluate(()=>authActiveUser.analytics.filter(e=>e.type==='session'&&e.sessionType==='study').length===1),'one regular completed study session recorded');
  ok(await page.evaluate(()=>countCompletedSessionsForTarget(authActiveUser,authActiveUser.targets[0].startTime,authActiveUser.targets[0].endTime)===1),'weekly target receives exactly one session credit');
  ok(await page.evaluate(()=>Object.keys(authActiveUser.srState.vocab).length===5&&Object.keys(authActiveUser.srState.sentences).some(k=>k.includes('non-spelling:find-fix:pu3:9:111:f14'))),'normal vocabulary and typed-exercise SR outcomes persisted');
  ok(await page.evaluate(()=>__saved.some(r=>r.body.events?.some(e=>e.data?.previewNote?.id==='pu3-u9-p111'))&&__saved.some(r=>r.body.srDelta)),'completion marker and normal SR delta use the real acknowledged flush');
  await page.evaluate(()=>finishStudySession());
  ok(await page.evaluate(()=>authActiveUser.analytics.filter(e=>e.type==='session').length===1),'duplicate completion cannot double credit');
  const notes=await page.evaluate(()=>authActiveUser.previewNotes);
  await fixture(page,'notes-a',{book:'PU3',unit:'9',page:'111'},notes);
  ok(await page.locator('#preview-notes-overlay').count()===0,'completed page uses normal login');
  await page.locator('#preview-notes-button').click();await page.locator('.preview-notes-library button').click();
  ok((await page.frameLocator('#preview-notes-overlay iframe').locator('#reader-study-start').textContent())==='返回主界面','studied notes reopen in listening-only review mode');
  await page.evaluate(()=>PreviewNotes.close());
  await fixture(page,'notes-b');ok(await page.locator('#preview-notes-overlay').isVisible(),'another student does not inherit completion');
  await page.evaluate(()=>PreviewNotes.close());
  await fixture(page,'notes-server-only',{book:'PU3',unit:'9',page:'111'},notes);
  ok(await page.locator('#preview-notes-overlay').count()===0,'server completion works on a fresh account cache');
  await fixture(page,'notes-advance',{book:'PU3',unit:'9',page:'110'});
  ok(await page.locator('#preview-notes-button').isHidden(),'students on other pages with no completed preview have no empty library button');
  await page.evaluate(()=>{
   PreviewNotes.close();
   const current=getCurrentSession();
   const sorted=getSortedPagesForBook('PU3'),end=sorted.findIndex(p=>p.unit==='9'&&p.page==='110');
   for(const type of ['vocab','sentences','sentencePairs'])for(const e of buildItemPool(sorted.slice(0,end+1),type).flatPool)authActiveUser.srState[type][e.key]={lastResult:'success',dueAfterSession:current+999,interval:999};
   finishLogin();
  });
  ok(await page.evaluate(()=>authActiveUser.page==='111')&&await page.locator('#preview-notes-overlay').isVisible(),'automatic SR advancement stops at p111 and opens its preview');
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(qa,'automatic-intro-phone.png')});
  ok(errors.length===0,'no browser runtime errors: '+errors.join(','));
  console.log(count+' preview-note integration checks passed; '+qa);
  await context.close();
 }finally{await browser.close();server.close();}
})().catch(error=>{console.error(error);server.close();process.exitCode=1;});
