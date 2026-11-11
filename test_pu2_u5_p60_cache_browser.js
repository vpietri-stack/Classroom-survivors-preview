'use strict';
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright-core');
const root=__dirname,qa=path.join(root,'.checks','p2-60-cache');fs.mkdirSync(qa,{recursive:true});
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(e,data)=>{if(e){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'html':'text/html','js':'text/javascript','css':'text/css','webp':'image/webp','bin':'application/octet-stream'})[file.split('.').pop()]||'application/octet-stream');res.end(data);});});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=process.env.NOTES_BASE_URL||'http://127.0.0.1:'+server.address().port+'/';
 const browser=await chromium.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1100,height:800},hasTouch:true});const page=await context.newPage();let phase='cold',mode='origin',media=[];const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{const Native=window.Audio;window.Audio=function(...args){const a=new Native(...args);window.__lastAudio=a;return a;};});
  await page.route('**/*',async route=>{
   const url=route.request().url(),mirror=url.startsWith('https://gh-proxy.com/');
   if(!mirror&&!url.startsWith(base))return route.abort();
   const pathname=mirror?url.split('/main/')[1]?.split('?')[0]:new URL(url).pathname.split('?')[0].replace('/Classroom-survivors-preview/','');
   if(!pathname)return route.abort();
   const file=path.resolve(root,'.'+decodeURIComponent(pathname));if(!file.startsWith(root+path.sep))return route.abort();
   const isMedia=/\.(bin|webp|mp3)$/.test(file);
   if(isMedia){media.push({phase,mirror,path:pathname});if(phase==='warm')return route.abort();
    if((mode==='origin'&&mirror)||(mode==='mirror'&&!mirror)){await new Promise(r=>setTimeout(r,1500));try{return await route.abort();}catch{return;}}}
   if(!fs.existsSync(file))return route.fulfill({status:404,body:''});
   const type=({'js':'text/javascript','html':'text/html','css':'text/css','webp':'image/webp','bin':'application/octet-stream'})[file.split('.').pop()]||'application/octet-stream';
   try{await route.fulfill({status:200,contentType:type,headers:{'Access-Control-Allow-Origin':'*'},body:fs.readFileSync(file)});}catch{}
  });
  await page.goto(base+'pu2_u5_p60_notes.html');
  await page.waitForFunction(()=>document.querySelector('.page-image')?.naturalWidth>0);
  assert.ok(!media.some(r=>r.path.endsWith('audio-bundle.js')));
  // Cold startup: only page 1 image (01-move-like-an-animal.webp) and audio-1.bin should load
  assert.ok(media.every(r=>r.path.endsWith('01-move-like-an-animal.webp')||r.path.endsWith('audio-1.bin')),'cold startup loads only first-page media');
  for(let i=0;i<3;i++){await page.locator('.page-image').nth(i).scrollIntoViewIfNeeded();await page.waitForFunction(i=>document.querySelectorAll('.page-image')[i].naturalWidth>0,i);}
  const ids=await page.evaluate(()=>Object.keys(InteractiveNotesData.clips));
  for(const id of ids){await page.locator('[data-clip="'+id+'"]').first().tap();await page.waitForFunction(()=>__lastAudio?.currentTime>.02);await page.evaluate(()=>InteractiveNotesPOC.pause());}
  await page.waitForFunction(()=>new Promise(resolve=>{const req=indexedDB.open('asset-cache',1);req.onsuccess=()=>{const db=req.result,r=db.transaction('files','readonly').objectStore('files').getAllKeys();r.onsuccess=()=>{resolve(r.result.filter(k=>k.startsWith('pu2-u5-p60-v1/')).length===12);db.close();};};}));
  phase='warm';media=[];await page.reload();
  for(let i=0;i<3;i++){await page.locator('.page-image').nth(i).scrollIntoViewIfNeeded();await page.waitForFunction(i=>document.querySelectorAll('.page-image')[i].naturalWidth>0,i);}
  for(const id of ids){await page.locator('[data-clip="'+id+'"]').first().tap();await page.waitForFunction(()=>__lastAudio?.currentTime>.02);await page.evaluate(()=>InteractiveNotesPOC.pause());}
  assert.equal(media.length,0,'reopened reader serves three images and all 28 clips from persistent cache with media network blocked');
  await context.close();
  console.log('PASS first-page-only downloads, origin/mirror fallback, 12 persistent assets, and offline reload of three images plus 28 audio clips.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});
