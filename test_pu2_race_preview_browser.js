'use strict';
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {chromium}=require('playwright-core');
const pu1=false;
const lesson=pu1?{book:'PU1',unit:'7',page:'85',previous:'83',id:'pu1-u7-p85',pageCount:3,missing:'M9',secondMissing:'M16',fix:'F20',srKey:'non-spelling:find-fix:pu1:7:84:f20'}:{book:'PU3',unit:'9',page:'111',previous:'110',id:'pu3-u9-p111',pageCount:4,missing:'M1',secondMissing:'M8',fix:'F14',srKey:'non-spelling:find-fix:pu3:9:111:f14'};
Object.assign(lesson,{book:'PU2',unit:'1',page:'14',id:'pu2-u1-p14'});lesson.placement={book:lesson.book,unit:lesson.unit,page:lesson.page};
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
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:420,height:850}}),page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await context.addInitScript(value=>{window.testNote=value;},lesson);
  await page.route('**/*',route=>{const u=route.request().url();return u.startsWith(base)&&!u.includes('/models/')&&!u.includes('/lib/wasm/')?route.continue():route.abort();});
  await page.goto(base+'/index.html');
  await page.waitForFunction(()=>window.PreviewNotes&&window.PU2RaceStudy);
  await fixture(page,'unrelated',{book:'PU1',unit:'1',page:'11'});
  await page.waitForTimeout(500);
  ok(!await page.locator('#preview-notes-overlay').count(),'other placement has no automatic Parks notes');
  ok(await page.locator('#preview-notes-button').isHidden(),'unrelated students have no preview link');
  await fixture(page,'race');
  await page.locator('#preview-notes-overlay iframe').waitFor();
  const reader=page.frameLocator('#preview-notes-overlay iframe');
  await reader.locator('.card').first().waitFor();
  ok(await reader.locator('.card').count()===14,'assigned student sees 14 vocabulary cards');
  await reader.locator('.card img').first().waitFor({state:'visible'});
  await page.waitForFunction(() => { const f=document.querySelector('#preview-notes-overlay iframe'); return f?.contentDocument?.querySelector('.card img')?.naturalWidth > 0; });
  ok(await reader.locator('.race-part').count()===5,'reader has five story images');
  ok(await reader.locator('.race-sentences button').count()===26,'reader provides 26 individual story clips');
  await page.screenshot({path:path.join(qa,'reader-phone.png')});
  ok(await reader.locator('#notes-mic').count()===1,'standard notes speech control is present');
  await reader.locator('.card').first().click();
  ok(!(await reader.locator('#notes-mic').isDisabled()),'vocabulary tap enables pronunciation practice');
  await reader.locator('#article').scrollIntoViewIfNeeded();
  await reader.locator('.race-part img').first().scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>document.querySelector('#preview-notes-overlay iframe')?.contentDocument?.querySelector('.race-part img')?.naturalWidth>0,null,{timeout:30000});
  ok(true,'story image loads after scrolling into view');
  await reader.locator('.race-sentences button').first().click();
  ok(!(await reader.locator('#notes-mic').isDisabled()),'article sentence tap enables pronunciation practice');
  await reader.locator('#reader-study-start').click();
  await page.waitForFunction(()=>STUDY_STATE.active&&STUDY_STATE.parks);
  const srBefore=await page.evaluate(()=>JSON.stringify(authActiveUser.srState));
  await page.evaluate(()=>{const saved=StudyRuntime.capture(); StudyRuntime.restore(saved);});
  ok(await page.evaluate(()=>STUDY_STATE.round==='A' && STUDY_STATE.words.length===5),'recognition state restores');
  for(let i=0;i<14;i++){
   await page.waitForFunction(()=>!STUDY_STATE.isTransitioning);
   const target=await page.evaluate(()=>currentTTSWord);
   await page.locator('#roundA-container').getByRole('button',{name:target,exact:true}).click();
   if(i<13)await page.waitForFunction(prev=>!STUDY_STATE.isTransitioning&&currentTTSWord!==prev,target);
  }
  await page.locator('.parks-cloze').waitFor();
  const orders=[['Come on'],['everyone'],['winning','falls','calls'],['Come back','move','winning','race','last'],['feel sad','stops','goes back','sorry','helps her to stand']];
  for(let i=0;i<5;i++){
   await page.waitForFunction(n=>STUDY_STATE.currentSentenceIndex===n,i);
   if(i===3){
    await page.locator('.parks-dock').getByRole('button',{name:orders[i][0],exact:true}).first().click();
    await page.evaluate(()=>{const saved=StudyRuntime.capture(); StudyRuntime.restore(saved);});
    ok(await page.evaluate(()=>STUDY_STATE.parks.slots.filter(x=>x!==null).length===1),'partial gap-fill restores');
    await page.locator('.parks-gap').first().click();
   }
   for(const value of orders[i])await page.locator('.parks-dock').getByRole('button',{name:value,exact:true}).first().click();
   await page.getByRole('button',{name:'检查',exact:true}).click();
  }
  await page.waitForFunction(()=>document.querySelector('#study-title').textContent==='Session Complete');
  ok(await page.evaluate(s=>JSON.stringify(authActiveUser.srState)===s,srBefore),'completion does not change SR');
  ok(await page.evaluate(()=>authActiveUser.previewNotes['pu2-u1-p14']?.version===1),'completion writes preview marker');
  await page.evaluate(()=>{exitStudyMode();finishLogin();});
  await page.waitForTimeout(500);
  ok(!await page.locator('#preview-notes-overlay').count(),'completed assignment no longer opens automatically');
  await page.locator('#preview-notes-button').click();
  await page.locator('.preview-notes-library button').filter({hasText:'Power Up 2'}).click();
  await page.frameLocator('#preview-notes-overlay iframe').getByRole('button',{name:'返回主界面',exact:true}).waitFor();
  ok(true,'completed preview is available in the notes library');
  ok(!errors.length,'no browser errors: '+errors.join('; '));
  console.log(count+' Parks note checks passed');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
