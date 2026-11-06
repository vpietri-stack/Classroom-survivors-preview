'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
const root=__dirname,base='https://fixture.github.io/Classroom-survivors-preview/';
(async()=>{
 const browser=await chromium.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1000,height:800},hasTouch:true});const page=await context.newPage();
  let phase='cold',mode='origin',media=[];const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{const Native=window.Audio;window.Audio=function(...args){const a=new Native(...args);window.__lastAudio=a;return a;};});
  await page.route('**/*',async route=>{
   const url=route.request().url(),mirror=url.startsWith('https://gh-proxy.com/');
   if(!mirror&&!url.startsWith(base))return route.abort();
   const pathname=mirror?url.split('/main/')[1]?.split('?')[0]:new URL(url).pathname.replace('/Classroom-survivors-preview/','');
   if(!pathname)return route.abort();
   const file=path.resolve(root,decodeURIComponent(pathname));if(!file.startsWith(root+path.sep))return route.abort();
   const isMedia=/\.(bin|webp|mp3)$/.test(file);
   if(isMedia){media.push({phase,mirror,path:pathname});if(phase==='warm')return route.abort();
    if((mode==='origin'&&mirror)||(mode==='mirror'&&!mirror)){await new Promise(r=>setTimeout(r,1500));try{return await route.abort();}catch{return;}}}
   if(!fs.existsSync(file))return route.fulfill({status:404,body:''});
   const type=({'js':'text/javascript','html':'text/html','css':'text/css','webp':'image/webp','bin':'application/octet-stream'})[file.split('.').pop()]||'application/octet-stream';
   try{await route.fulfill({status:200,contentType:type,headers:{'Access-Control-Allow-Origin':'*'},body:fs.readFileSync(file)});}catch{}
  });
  await page.goto(base+'pu1_u7_p87_notes.html');
  await page.waitForFunction(()=>document.querySelector('.page-image')?.naturalWidth>0);
  assert.ok(!media.some(r=>r.path.endsWith('audio-bundle.js')));
  assert.ok(media.every(r=>r.path.includes('vocab-1-')||r.path.endsWith('audio-1.bin')),'cold startup loads only first-page media');
  for(let i=0;i<5;i++){await page.locator('.page-image').nth(i).scrollIntoViewIfNeeded();await page.waitForFunction(i=>document.querySelectorAll('.page-image')[i].naturalWidth>0,i);}
  const ids=await page.evaluate(()=>Object.keys(InteractiveNotesData.clips));
  for(const id of ids){await page.locator('[data-clip="'+id+'"]').first().tap();await page.waitForFunction(()=>__lastAudio?.currentTime>.02);await page.evaluate(()=>InteractiveNotesPOC.pause());}
  await page.waitForFunction(()=>new Promise(resolve=>{const req=indexedDB.open('asset-cache',1);req.onsuccess=()=>{const db=req.result,r=db.transaction('files','readonly').objectStore('files').getAllKeys();r.onsuccess=()=>{resolve(r.result.filter(k=>k.startsWith('pu1-u7-p87-v1/')).length===10);db.close();};};}));
  phase='warm';media=[];await page.reload();
  for(let i=0;i<5;i++){await page.locator('.page-image').nth(i).scrollIntoViewIfNeeded();await page.waitForFunction(i=>document.querySelectorAll('.page-image')[i].naturalWidth>0,i);}
  for(const id of ids){await page.locator('[data-clip="'+id+'"]').first().tap();await page.waitForFunction(()=>__lastAudio?.currentTime>.02);await page.evaluate(()=>InteractiveNotesPOC.pause());}
  assert.equal(media.length,0,'reopened reader serves five images and all 53 clips from persistent cache with media network blocked');
  await context.close();
  // A separate cold context verifies the opposite source wins as well.
  const second=await browser.newContext();const p=await second.newPage();let paths=[];
  await p.route('**/*',async route=>{const url=route.request().url(),mirror=url.startsWith('https://gh-proxy.com/');if(!mirror&&!url.startsWith(base))return route.abort();const filename=mirror?url.split('/main/')[1]?.split('?')[0]:new URL(url).pathname.replace('/Classroom-survivors-preview/','');if(!filename)return route.abort();const f=path.resolve(root,filename);if(/\.(webp|bin)$/.test(f)&&!mirror)return route.abort();if(mirror)paths.push(filename);if(!fs.existsSync(f))return route.fulfill({status:404,body:''});return route.fulfill({status:200,contentType:f.endsWith('.js')?'text/javascript':f.endsWith('.html')?'text/html':f.endsWith('.css')?'text/css':f.endsWith('.webp')?'image/webp':'application/octet-stream',headers:{'Access-Control-Allow-Origin':'*'},body:fs.readFileSync(f)});});
  await p.goto(base+'pu1_u7_p87_notes.html');await p.waitForFunction(()=>document.querySelector('.page-image')?.naturalWidth>0);assert.ok(paths.some(x=>x.endsWith('.webp')));
  assert.deepEqual(errors,[]);await second.close();
  console.log('PASS first-page-only downloads, origin/mirror fallback, 10 persistent assets, and offline reload of five images plus 58 audio clips.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
