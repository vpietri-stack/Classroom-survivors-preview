'use strict';
const assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright-core');
const root=__dirname,qa=path.join(root,'.checks','p2-60-media');fs.mkdirSync(qa,{recursive:true});
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(e,data)=>{if(e){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'html':'text/html','js':'text/javascript','css':'text/css','webp':'image/webp','mp3':'audio/mpeg'})[file.split('.').pop()]||'application/octet-stream');res.end(data);});});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=process.env.NOTES_BASE_URL||'http://127.0.0.1:'+server.address().port+'/';
 const browser=await chromium.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1100,height:1000},hasTouch:true});const errors=[],mp3=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/\.mp3(?:\?|$)/.test(r.url()))mp3.push(r.url());});
  await page.route('**/*',route=>{const url=route.request().url();return url.startsWith(base)&&!url.includes('/api/')&&!url.includes('/models/')?route.continue():route.abort();});
  await page.addInitScript(()=>{const Native=window.Audio;window.Audio=function(...args){const audio=new Native(...args);window.__lastAudio=audio;return audio;};});
  await page.goto(base+'pu2_u5_p60_notes.html?v=media-check');await page.waitForFunction(()=>window.InteractiveNotesPOC&&window.NotesSpeech);
  // PU2 p60 has 3 pages
  for(let i=0;i<3;i++){const image=page.locator('.page-image').nth(i);await image.scrollIntoViewIfNeeded();await image.evaluate(image=>image.complete&&image.naturalWidth?true:new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;}));await image.evaluate(image=>image.decode());await page.locator('.paper').nth(i).screenshot({path:path.join(qa,'page-'+(i+1)+'.png')});}
  const clips=await page.evaluate(()=>Object.keys(InteractiveNotesData.clips));assert.equal(clips.length,28);
  for(const id of clips){await page.locator('.hotspot[data-clip="'+id+'"]').first().tap();await page.waitForFunction(id=>InteractiveNotesPOC.snapshot().currentClip===id&&window.__lastAudio?.currentTime>.03&&!window.__lastAudio.paused,id,{timeout:10000});await page.evaluate(()=>InteractiveNotesPOC.pause());}
  assert.equal(mp3.length,0,'tap audio uses cached packs without individual MP3 requests');
  await page.locator('.hotspot[data-clip="run-running"]').first().tap();await page.locator('#speed').selectOption('0.8');
  assert.equal(await page.evaluate(()=>__lastAudio.playbackRate),.8);await page.locator('#replay').click();await page.waitForFunction(()=>__lastAudio.currentTime>.03);await page.locator('#stop').click();
  assert.equal(await page.locator('.notes-speech button').first().isEnabled(),true,'selected word enables optional pronunciation');
  await page.setViewportSize({width:390,height:844});await page.locator('#zoom').selectOption('1');
  await page.locator('.paper').first().screenshot({path:path.join(qa,'phone-page-1.png')});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'phone reader fits viewport');
  await page.locator('#zoom').selectOption('1.5');assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--zoom').trim()),'1.5');
  assert.deepEqual(errors,[]);console.log('PASS all 28 real Chrome touch audio playbacks, replay/slow/stop, optional pronunciation, three rendered images and phone zoom; '+qa);
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1});