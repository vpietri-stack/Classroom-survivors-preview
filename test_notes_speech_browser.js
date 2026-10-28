const {chromium}=require('playwright-core');
const http=require('http'),fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=__dirname;let checks=0;
const ok=(value,label)=>{assert.ok(value,label);checks++;console.log('PASS '+label);};
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.readFile(file,(e,data)=>{if(e){res.writeHead(404).end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(data);});
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
   window.testSpeech={calls:[],cancelled:0,revoked:0};
   const revoke=URL.revokeObjectURL.bind(URL);URL.revokeObjectURL=url=>{testSpeech.revoked++;revoke(url);};
   HTMLMediaElement.prototype.play=function(){return Promise.resolve();};
   window.Recorder=class{
    static isSupported(){return true;}
    async start(){if(testSpeech.denied)throw Object.assign(new Error(),{name:'NotAllowedError'});}
    cancel(){testSpeech.cancelled++;}
    async stop(){return new Blob([new Uint8Array(16000)],{type:'audio/wav'});}
   };
   window.LocalEngine={load:async cb=>cb(100),transcribe:async(blob,options)=>{
    testSpeech.calls.push({target:options.target,signal:options.signal});
    const result={targetStatus:'ready',targetWords:options.target.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu).map((text,i)=>({text,heardClear:i===0}))};
    if(testSpeech.delay)return new Promise(resolve=>testSpeech.resolve=()=>resolve(result));return result;
   }};
  });
  await page.goto('http://127.0.0.1:'+server.address().port+'/interactive_notes_poc.html');
  ok(await page.locator('#notes-mic').isDisabled(),'no microphone target until a hotspot is selected');
  await page.locator('[data-clip="intro-puppy"]').first().click();
  await page.locator('#notes-mic').click();await page.waitForFunction(()=>document.getElementById('notes-mic').getAttribute('aria-pressed')==='true');
  ok(await page.locator('#notes-mic').textContent()==='■ 停止录音','same microphone button starts and stops');
  await page.locator('#notes-mic').click();await page.waitForFunction(()=>document.querySelector('.notes-heard'));
  ok(await page.evaluate(()=>testSpeech.calls[0].target==='The puppy is surprising.'),'uses the exact selected sentence as target');
  ok(await page.locator('.notes-heard').count()===1&&await page.locator('.notes-heard').textContent()==='The','only clearly heard words turn green');
  ok(await page.locator('#nowPlaying').textContent()==='The puppy is surprising.','feedback retains punctuation and full target');
  await page.screenshot({path:path.join(require('os').tmpdir(),'notes-speech-feedback.png')});
  ok(await page.locator('#notes-recording').isEnabled(),'student can listen to their recording');
  await page.locator('#replay').click();ok(await page.locator('.notes-heard').count()===1,'listening to the original again preserves feedback');
  await page.locator('#notes-recording').click();
  await page.locator('#notes-mic').click();await page.waitForFunction(()=>document.getElementById('notes-mic').getAttribute('aria-pressed')==='true');
  ok(await page.locator('.notes-heard').count()===0,'new attempt clears previous green feedback');
  await page.locator('[data-clip="word-bored"]').first().evaluate(el=>el.scrollIntoView({block:'center'}));await page.locator('[data-clip="word-bored"]').first().click();
  ok(await page.locator('#notes-mic').getAttribute('aria-pressed')==='false'&&await page.locator('#notes-recording').isDisabled(),'new target cancels recording and discards old clip');
  await page.evaluate(()=>testSpeech.delay=true);
  await page.locator('#notes-mic').click();await page.waitForFunction(()=>document.getElementById('notes-mic').getAttribute('aria-pressed')==='true');await page.locator('#notes-mic').click();
  await page.waitForFunction(()=>!!testSpeech.resolve);await page.locator('[data-clip="word-boring"]').first().evaluate(el=>el.scrollIntoView({block:'center'}));await page.locator('[data-clip="word-boring"]').first().click();
  await page.evaluate(()=>testSpeech.resolve());
  ok(await page.locator('.notes-heard').count()===0&&await page.evaluate(()=>testSpeech.calls.at(-1).signal.aborted),'switching targets aborts assessment and ignores stale results');
  await page.evaluate(()=>{testSpeech.delay=false;testSpeech.denied=true;});await page.locator('#notes-mic').click();await page.waitForFunction(()=>document.getElementById('notes-speech-status').textContent.includes('允许'));
  ok(await page.locator('#replay').isEnabled(),'microphone denial leaves original listening controls usable');
  await page.setViewportSize({width:320,height:800});
  ok(await page.evaluate(()=>document.documentElement.scrollWidth<=320),'player fits a 320px phone');
  await page.screenshot({path:path.join(require('os').tmpdir(),'notes-speech-phone.png')});
  await page.evaluate(()=>NotesSpeech.dispose());
  ok(await page.locator('#notes-mic').isDisabled()&&await page.locator('#notes-recording').isDisabled(),'closing the embedded reader explicitly releases recording and selection');
  ok(errors.length===0,'no browser runtime errors');
  console.log(checks+' notes speech browser checks passed');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
