// Real page, synthetic recording and model workers. No accounts, external calls or child audio.
const {chromium}=require('playwright-core');
const fs=require('fs'),path=require('path'),http=require('http'),assert=require('node:assert/strict');
(async()=>{let browser,checks=0;
 const server=http.createServer((req,res)=>{const file=path.resolve(__dirname,'.'+decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(__dirname+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);return res.end();}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');fs.createReadStream(file).pipe(res);});
 try{
  const core=await import('data:text/javascript;base64,'+fs.readFileSync(path.join(__dirname,'speech_word_core.js')).toString('base64'));
  const audio=new Float32Array(16000);audio.fill(.2,3200,9600);const prepared=core.variants(audio);
  assert.equal(prepared.length,4);assert.deepEqual(prepared[3].audio,audio);assert.deepEqual(audio.slice(0,3200),new Float32Array(3200));checks++;
  assert(prepared[0].audio.length<audio.length);assert.equal(prepared[2].audio.length,prepared[1].audio.length+8000);assert.equal(prepared[1].repeatThresholdSec,1e-9);checks++;
  assert(core.matches('Exciting.','exciting'));assert(!core.matches('excited','exciting'));assert(!core.matches('',''));checks++;
  assert.equal(core.resample(new Float32Array(48000),48000).length,16000);const wave=Buffer.from(await core.wav(audio).arrayBuffer());assert.equal(wave.toString('ascii',8,12),'WAVE');checks++;
  // Keep the experimental trim rule identical to the production recorder rule.
  const recorder=fs.readFileSync(path.join(__dirname,'speech_recorder.js'),'utf8');const start=recorder.indexOf('  function findSpeechStart('),end=recorder.indexOf('\n  function encodeWav',start);const find=new Function(recorder.slice(start,end)+'; return findSpeechStart;')();
  for(const x of [audio,new Float32Array(8000),Float32Array.from({length:22000},(_,i)=>i>4000&&i<13000?.1*Math.sin(i):0)])assert.equal(core.trimStart(x).length,x.length-find(x,16000));checks++;
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[],external=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>{if(new URL(r.request().url()).origin===origin)return r.continue();external.push(r.request().url());return r.abort();});
  await page.addInitScript(()=>{
   window.modelCalls=[];window.terminations=0;window.hold=false;window.holdMoonshine=false;
   window.Worker=class{
    constructor(url){this.url=url;this.dead=false;}
    postMessage(data){modelCalls.push({worker:this.url,...data,audio:data.audio?Array.from(data.audio):null});if(hold||(holdMoonshine&&this.url.includes('moonshine')))return;setTimeout(()=>{if(!this.dead)this.onmessage({data:data.action==='load'?{id:data.id,ready:true}:{id:data.id,text:'excited',ms:100,targetStatus:'checked',targetWords:[{text:'exciting',heardClear:false}]}});},10);}
    terminate(){this.dead=true;terminations++;}
   };
  });
  await page.goto(origin+'/speech_word_poc.html');assert.equal(await page.locator('#compare').isEnabled(),false);checks++;
  await page.locator('#file').setInputFiles({name:'synthetic.wav',mimeType:'audio/wav',buffer:wave});await page.waitForFunction(()=>!document.getElementById('compare').disabled);
  await page.locator('#compare').click();await page.waitForFunction(()=>!document.getElementById('compare').disabled);
  assert.equal(await page.locator('.result').count(),4);assert.equal(await page.locator('.hint.heard').count(),0);assert.equal(await page.locator('.result').filter({hasText:'Transcript matches target: No'}).count(),4);checks++;
  assert.equal(await page.evaluate(()=>modelCalls.some(c=>c.worker.includes('moonshine'))),false);checks++;
  await page.locator('#moonshine').check();assert.equal(await page.locator('#export').isEnabled(),false);await page.locator('#compare').click();await page.waitForFunction(()=>!document.getElementById('compare').disabled);assert.equal(await page.locator('.result').count(),5);assert((await page.locator('.result').last().innerText()).includes('not tested for Moonshine'));checks++;
  assert.equal(await page.evaluate(()=>{const calls=modelCalls.filter(c=>c.audio);return JSON.stringify(calls.at(-1).audio)===JSON.stringify(calls.at(-5).audio);}),true);checks++;
  await page.locator('#label').selectOption('wrong');const download=page.waitForEvent('download');await page.locator('#export').click();const exported=await download;const saved=JSON.parse(fs.readFileSync(await exported.path(),'utf8'));assert.equal(saved.teacherLabel,'wrong');assert.equal(saved.rows.length,5);assert.equal(saved.target,'exciting');assert(saved.clipId);assert(!('pcm' in saved));checks++;
  // A stalled optional model must never block completed results or the recording.
  await page.evaluate(()=>{holdMoonshine=true;});await page.locator('#compare').click();
  await page.waitForFunction(()=>!document.getElementById('skip-moonshine').hidden);
  assert.equal(await page.locator('.result').count(),4);assert.equal(await page.locator('#export').isEnabled(),true);assert.equal(await page.locator('#audio-download').isEnabled(),true);assert.equal(await page.locator('#label').isEnabled(),true);checks++;
  const partialDownload=page.waitForEvent('download');await page.locator('#export').click();const partialFile=await partialDownload;const partial=JSON.parse(fs.readFileSync(await partialFile.path(),'utf8'));
  assert.equal(partial.status,'running');assert.equal(partial.rows.length,4);assert.deepEqual(partial.requestedModels,['whisper','moonshine']);checks++;
  await page.locator('#skip-moonshine').click();assert.equal(await page.locator('#compare').isEnabled(),true);assert.equal(await page.locator('#export').isEnabled(),true);assert.equal(await page.locator('.result').count(),5);checks++;
  const skippedDownload=page.waitForEvent('download');await page.locator('#export').click();const skippedFile=await skippedDownload;const skipped=JSON.parse(fs.readFileSync(await skippedFile.path(),'utf8'));
  assert.equal(skipped.status,'partial');assert.equal(skipped.rows.at(-1).skipped,true);assert.equal(skipped.clipId,partial.clipId);checks++;
  // General Cancel must retain results as well.
  await page.locator('#compare').click();await page.waitForFunction(()=>!document.getElementById('skip-moonshine').hidden);await page.locator('#cancel').click();
  assert.equal(await page.locator('.result').count(),4);assert.equal(await page.locator('#export').isEnabled(),true);checks++;
  await page.locator('#target').fill('bored');assert.equal(await page.locator('.result').count(),0);assert.equal(await page.locator('#export').isEnabled(),false);checks++;
  await page.evaluate(()=>{hold=true;});await page.locator('#compare').click();await page.locator('#cancel').click();assert.equal(await page.locator('#compare').isEnabled(),true);assert.equal(await page.locator('#export').isEnabled(),false);checks++;
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);checks++;
  // Permission cancellation must stop a late microphone stream.
  await page.evaluate(()=>{window.stopped=0;Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,writable:true,value:()=>new Promise(r=>{window.grantMic=r;})});});
  await page.locator('#record').click();await page.locator('#cancel').click();await page.evaluate(()=>grantMic({getTracks:()=>[{stop:()=>stopped++}]}));await page.waitForFunction(()=>stopped>0);assert.equal(await page.locator('#record').isEnabled(),true);checks++;
  // Exercise real page capture/stop logic with a synthetic Web Audio graph.
  await page.evaluate(()=>{
   navigator.mediaDevices.getUserMedia=async()=>({getTracks:()=>[{stop:()=>stopped++}]});
   window.AudioContext=class{constructor(){this.sampleRate=16000;this.destination={};}resume(){return Promise.resolve();}close(){return Promise.resolve();}createMediaStreamSource(){return {connect(){},disconnect(){}};}createScriptProcessor(){window.captureNode={connect(){},disconnect(){}};return captureNode;}};
  });
  await page.locator('#record').click();await page.waitForFunction(()=>document.getElementById('record').textContent.includes('Stop recording'));
  await page.evaluate(()=>captureNode.onaudioprocess({inputBuffer:{getChannelData:()=>new Float32Array(9600).fill(.1)}}));await page.locator('#record').click();assert.equal(await page.locator('#compare').isEnabled(),true);assert((await page.locator('#audio-info').innerText()).includes('0.60'));checks++;
  // Public model downloads fall back, resume verified chunks, and reject corruption.
  const assetModule=await import('data:text/javascript;base64,'+fs.readFileSync(path.join(__dirname,'speech_word_assets.js')).toString('base64'));
  const payload=new Uint8Array(262160).fill(7),hash=require('crypto').createHash('sha256').update(payload).digest('hex');let downloads=0;const store=new Map(),oldCaches=globalThis.caches;
  globalThis.caches={open:async()=>({match:async k=>store.get(k)?.clone(),put:async(k,v)=>store.set(k,v),keys:async()=>[...store.keys()].map(url=>({url})),delete:async k=>store.delete(k.url||k)})};
  const fetcher=async(url,opts)=>{if(url.endsWith('manifest.json'))return Response.json({revision:assetModule.REVISION,files:[{file:'test.onnx',bytes:payload.length,sha256:hash}]});if(url.startsWith('https://slow/'))throw Error('stalled host');downloads++;const [a,b]=opts.headers.Range.match(/bytes=(\d+)-(\d+)/).slice(1).map(Number);assert(url.endsWith('?part='+a+'-'+b));return new Response(payload.slice(a,b+1),{status:206,headers:{'Content-Range':`bytes ${a}-${b}/${payload.length}`}});};
  const options={fetch:fetcher,base:'https://local/models/',sources:['https://slow/','https://fast/']};
  const loaded=await assetModule.prepareMoonshine(()=>{},options);assert.deepEqual(loaded.buffers.get('test.onnx'),payload);assert.equal(downloads,2);checks++;
  await assetModule.prepareMoonshine(()=>{},options);assert.equal(downloads,2);checks++;
  const key=[...store.keys()][0];store.set(key,new Response(new Uint8Array(262144)));await assert.rejects(()=>assetModule.prepareMoonshine(()=>{},options),/checksum/);assert.equal(store.size,0);globalThis.caches=oldCaches;checks++;
  // Optional model files are pinned, public, licensed and checked byte for byte.
  const dir=path.join(__dirname,'models/moonshine-tiny-poc'),manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json')));const crypto=require('crypto');
  for(const item of manifest.files){const data=fs.readFileSync(path.join(dir,item.file));assert.equal(data.length,item.bytes);assert.equal(crypto.createHash('sha256').update(data).digest('hex'),item.sha256);}assert(fs.readFileSync(path.join(dir,'LICENSE'),'utf8').includes('MIT License'));checks++;
  console.log(checks+' single-word lab checks passed (same audio, optional Moonshine, neutral errors, export, cancellation, phone layout, pinned model)');
 }finally{await browser?.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
