import {RATE,resample,stats,variants,wav,matches,snapshot,tokens} from './speech_word_core.js?v=1';
const $=id=>document.getElementById(id),allowed=/^\/Classroom-survivors-preview(?:\/|$)/i.test(location.pathname)||['localhost','127.0.0.1'].includes(location.hostname);
let clipId='',raw=null,url=null,report=null,phase='idle',activeModel=null,generation=0,mic=null,worker=null,pending=null,timer=null;
const say=text=>{$('status').textContent=text;};
function controls(){const busy=phase!=='idle';for(const id of ['target','spoken','moonshine','file'])$(id).disabled=busy;$('record').disabled=busy&&phase!=='recording';$('record').textContent=phase==='recording'?'■ Stop recording':'🎙 Record';$('cancel').disabled=!busy;$('compare').disabled=busy||!raw;$('export').disabled=!report?.rows.length;$('export').textContent=report?.rows.length?'Download completed results ('+report.rows.length+')':'Download comparison results (JSON)';$('audio-download').disabled=!raw;$('skip-moonshine').hidden=activeModel!=='moonshine';}
function clearResult(){report=null;$('results').replaceChildren();$('gate-info').textContent='';controls();}
function terminate(reason='Comparison cancelled'){if(worker)worker.terminate();worker=null;if(pending){clearTimeout(pending.timer);pending.reject(new Error(reason));pending=null;}}
function closeMic(m){if(!m)return;if(m.stream)m.stream.getTracks().forEach(t=>t.stop());try{m.source?.disconnect();m.node?.disconnect();}catch(_){}if(m.ctx)m.ctx.close().catch(()=>{});}
function cancel(message='Stopped checking. Completed results and your recording can still be downloaded.'){if(phase==='checking'&&report){report.status='cancelled';report.interruptedModel=activeModel;}activeModel=null;generation++;clearTimeout(timer);closeMic(mic);mic=null;terminate();phase='idle';controls();say(message);}
function useAudio(pcm){clipId=crypto.randomUUID();raw=pcm;if(url)URL.revokeObjectURL(url);url=URL.createObjectURL(wav(raw));$('playback').src=url;$('playback').hidden=false;const s=stats(raw);$('audio-info').textContent=`Recording: ${s.seconds.toFixed(2)} seconds. All comparisons use this recording.`;clearResult();controls();}
async function stopRecording(){const m=mic;if(!m)return;clearTimeout(timer);mic=null;const n=m.chunks.reduce((a,x)=>a+x.length,0),pcm=new Float32Array(n);let i=0;for(const x of m.chunks){pcm.set(x,i);i+=x.length;}closeMic(m);phase='idle';if(!n){say('No audio was captured. Please try again.');controls();return;}useAudio(resample(pcm,m.ctx.sampleRate));say('Listen to your recording, then tap Compare this recording.');}
async function record(){
  if(phase==='recording')return stopRecording();
  $('playback').pause();const ticket=++generation;phase='permission';clearResult();raw=null;if(url)URL.revokeObjectURL(url);url=null;$('playback').removeAttribute('src');$('playback').hidden=true;$('audio-info').textContent='';controls();say('Opening microphone…');
  const m={chunks:[]};mic=m;timer=setTimeout(()=>cancel('Microphone permission took too long. Please try again.'),15000);
  try{
    if(!navigator.mediaDevices?.getUserMedia)throw Error('Microphone needs HTTPS and browser permission.');
    m.stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true}});
    if(ticket!==generation){closeMic(m);return;}
    const Ctx=window.AudioContext||window.webkitAudioContext;m.ctx=new Ctx();await m.ctx.resume();
    if(ticket!==generation){closeMic(m);return;}
    m.source=m.ctx.createMediaStreamSource(m.stream);m.node=m.ctx.createScriptProcessor(4096,1,1);m.node.onaudioprocess=e=>{if(phase==='recording'&&ticket===generation)m.chunks.push(e.inputBuffer.getChannelData(0).slice());};m.source.connect(m.node);m.node.connect(m.ctx.destination);
    clearTimeout(timer);phase='recording';controls();say('Recording. Say the word, then tap Stop.');timer=setTimeout(stopRecording,20000);
  }catch(e){if(ticket===generation)cancel('Could not record: '+e.message);else closeMic(m);}
}
function startWorker(file){terminate();worker=new Worker(file,{type:'module'});worker.onmessage=event=>{const p=pending,r=event.data;if(!p||p.id!==r.id)return;if(r.progress!==undefined){say(r.total?'Moonshine download: '+(r.downloaded/1e6).toFixed(1)+' / '+(r.total/1e6).toFixed(1)+' MB ('+r.progress+'%). '+r.stage+'. You can download Whisper results or skip Moonshine.':'Preparing model files: '+r.progress+'%. You can cancel at any time.');return;}if(r.log){say(r.log);return;}pending=null;clearTimeout(p.timer);r.error?p.reject(new Error(r.error)):p.resolve(r);};worker.onerror=()=>{const p=pending;pending=null;if(p){clearTimeout(p.timer);p.reject(new Error('The model worker could not run. Try a smaller test or another browser.'));}worker?.terminate();worker=null;};}
let sequence=0;
function request(data,timeout=90000){return new Promise((resolve,reject)=>{if(!worker)return reject(new Error('Model worker unavailable'));const id=++sequence;pending={id,resolve,reject,timer:setTimeout(()=>{terminate('This comparison took too long. Try again or skip this model.');},timeout)};worker.postMessage({id,...data});});}
function addRow(row){const card=document.createElement('article');card.className='result';const h=document.createElement('h3');h.textContent=row.label;card.append(h);function line(text){const p=document.createElement('p');p.textContent=text;card.append(p);}
  if(row.error){line('Could not finish: '+row.error);$('results').append(card);return;}
  line('Model heard: “'+(row.text||'(nothing)')+'”');line('Transcript matches target: '+(row.transcriptMatch?'Yes':'No'));
  if(row.engine==='moonshine')line('Target-aware hint: not tested for Moonshine. Compare the transcript above.');else{
    line('Current target-aware checker: '+row.targetStatus);const list=document.createElement('div');for(const word of row.targetWords||[]){const span=document.createElement('span');span.className='hint'+(word.heardClear?' heard':'');span.textContent=word.text;list.append(span);}card.append(list);
    if(row.targetStatus==='unassessed')line('The current checker did not assess this audio. Its short/quiet-audio rules may be involved; this is not a pronunciation judgement.');
  }
  line('Checking time: '+(row.ms/1000).toFixed(1)+' seconds (model preparation excluded).');$('results').append(card);
}
async function compare(){
  if(!raw||phase!=='idle')return;const target=$('target').value.trim();if(!tokens(target).length||tokens(target).length>20){say('Enter a word or short sentence (up to 20 words).');return;}
  $('playback').pause();const ticket=++generation,source=raw.slice(),rows=[],label=$('label').value,spoken=$('spoken').value,includeMoonshine=$('moonshine').checked;phase='checking';clearResult();controls();
  report={...snapshot(target,spoken,label,source,rows),clipId,status:'running',requestedModels:includeMoonshine?['whisper','moonshine']:['whisper']};activeModel='whisper';
  const prepared=variants(source),s=stats(prepared[0].audio);$('gate-info').textContent=`After the app’s normal beginning trim: ${s.seconds.toFixed(2)} seconds. The sentence button’s one-second rule ${s.seconds<1?'would reject':'would allow'} it. The notes page bypassed that rule. This lab bypasses it too.`;
  try{
    say('Preparing Whisper. First use can take several minutes; Cancel remains available.');startWorker('speech_word_whisper_worker.js?v=1');await request({action:'load'},360000);
    for(const v of prepared){if(ticket!==generation)return;say('Checking '+v.label+'…');let row;try{const r=await request({audio:v.audio,target,repeatThresholdSec:v.repeatThresholdSec});row={id:v.id,label:v.label,engine:'whisper',text:r.text,transcriptMatch:matches(r.text,target),targetStatus:r.targetStatus,targetWords:r.targetWords||[],ms:r.ms,audio:stats(v.audio),repeatThresholdSec:v.repeatThresholdSec};}catch(e){if(ticket!==generation)return;row={id:v.id,label:v.label,error:e.message};}rows.push(row);addRow(row);controls();if(!worker)break;}
    terminate();
    if(includeMoonshine&&ticket===generation){activeModel='moonshine';controls();say('Whisper results are ready to download. Moonshine is loading; you can skip it below without losing results.');startWorker('speech_word_moonshine_worker.js?v=2');let row;try{const r=await request({audio:prepared[0].audio},360000);row={id:'moonshine',label:'Moonshine Tiny · normal trim, no repetition',engine:'moonshine',text:r.text,transcriptMatch:matches(r.text,target),ms:r.ms,audio:stats(prepared[0].audio)};}catch(e){if(ticket!==generation)return;row={id:'moonshine',label:'Moonshine Tiny',error:e.message};}rows.push(row);addRow(row);controls();terminate();}
    if(ticket===generation){report.status=rows.some(r=>r.error)?'finished_with_errors':'complete';say('Comparison finished. Add your judgement, then download the results and recording if you want to keep them.');}
  }catch(e){if(ticket===generation){if(report)report.status='failed';say('Comparison could not finish: '+e.message+'. Completed results can still be downloaded.');}}
  finally{if(ticket===generation){terminate();activeModel=null;phase='idle';controls();}}
}
function download(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
if(!allowed){document.querySelectorAll('button,input,select').forEach(el=>el.disabled=true);say('This experiment is available on preview and localhost only.');}
else{
  $('skip-moonshine').onclick=()=>{if(activeModel!=='moonshine')return;const row={id:'moonshine',engine:'moonshine',label:'Moonshine Tiny',skipped:true,error:'Skipped by user; no Moonshine assessment was made.'};report.rows.push(row);addRow(row);cancel('Moonshine skipped. Your Whisper results and recording are ready to download.');report.status='partial';};
  $('record').onclick=record;$('cancel').onclick=()=>cancel();$('compare').onclick=compare;
  $('audio-download').onclick=()=>{if(raw)download(wav(raw),'word-poc-'+clipId+'.wav');};
  $('export').onclick=()=>{if(report){report.teacherLabel=$('label').value;download(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}),'word-poc-'+clipId+'.json');}};
  for(const id of ['target','spoken','moonshine'])$(id).addEventListener('input',clearResult);
  $('file').onchange=async()=>{const file=$('file').files[0];if(!file)return;cancel();const ticket=generation;phase='importing';controls();say('Opening audio…');let ctx;try{if(file.size>10*1024*1024)throw Error('Choose a recording under 10 MB and 20 seconds.');ctx=new (window.AudioContext||window.webkitAudioContext)();const buffer=await ctx.decodeAudioData(await file.arrayBuffer());if(buffer.duration>20)throw Error('Choose a recording up to 20 seconds.');const mono=new Float32Array(buffer.length);for(let c=0;c<buffer.numberOfChannels;c++){const ch=buffer.getChannelData(c);for(let i=0;i<mono.length;i++)mono[i]+=ch[i]/buffer.numberOfChannels;}if(ticket===generation){phase='idle';useAudio(resample(mono,buffer.sampleRate));say('Audio opened. Tap Compare this recording.');}}catch(e){if(ticket===generation){phase='idle';say(e.message);controls();}}finally{if(ctx)ctx.close().catch(()=>{});$('file').value='';}};
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&phase!=='idle')cancel('Stopped while the page was hidden. Your completed recording is still here.');});
  window.addEventListener('pagehide',()=>{cancel();if(url)URL.revokeObjectURL(url);raw=null;});
}
