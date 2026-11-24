import {prepareAdaptiveAssets,sha256} from './speech_adaptive_assets.js?v=5';
import {compactLexicon,decide,sentenceFeatures,binaryProbability} from './speech_adaptive_core.js?v=1';
import {expectedWordSimilarity} from './speech_adaptive_phonetic.js?v=1';
import {words,disposeTensors,stats} from './speech_target.js?v=2026-10-28b';
import {evidence,warmZeroContexts} from './speech_adaptive_evidence.js?v=2';
import {verifyPhonics} from './phonics_speech_evidence.js?v=3';
import {speechSegments} from './phonics_speech_segments.js?v=1';
import {
 computeKaldiFbank,
 logSoftmaxRowMajor,
 parseZipaTokens,
 wordToArpabetVariants,
 mapArpabetSeqToZipa,
 ctcViterbiAlignAndGop,
 scoreUtteranceOption1
} from './speech_option1/zipa_core.js?v=1';

const ZIPA_CACHE_NAME='speech-option1-zipa-v1';
const ZIPA_BASE=new URL('./speech_option1/zipa/',import.meta.url).href;
const ZIPA_RAW_MIRROR='https://gh-proxy.com/https://raw.githubusercontent.com/vpietri-stack/Classroom-survivors-preview/main/speech_option1/zipa/';

let runtime,pipe,vad,zipaModel,assets,lexicon,zipaVocab,zipaIdToTok,contextSeconds=8,loading;
let zipaNetworkBytes=0,zipaReusedBytes=0,zipaTotalBytes=0;

async function fetchWithTimeout(url,timeoutMs=25000){
 const ctrl=new AbortController();
 const timer=setTimeout(()=>ctrl.abort(),timeoutMs);
 try{
  const resp=await fetch(url,{signal:ctrl.signal,cache:'no-cache'});
  if(!resp.ok)throw Error(`HTTP ${resp.status}`);
  return await resp.arrayBuffer();
 }finally{clearTimeout(timer);}
}

async function downloadZipaChunked(id){
 let cache=null;
 try{cache=await caches.open(ZIPA_CACHE_NAME);}catch(_){}
 const manifest=await(await fetch(new URL('manifest.json?v=1',ZIPA_BASE).href,{cache:'no-cache'})).json();
 const tokText=await(await fetch(new URL('tokens.txt?v=1',ZIPA_BASE).href,{cache:'no-cache'})).text();
 ({vocab:zipaVocab,idToTok:zipaIdToTok}=parseZipaTokens(tokText));
 const out=new Uint8Array(manifest.totalBytes);
 let offset=0,downloaded=0,networkBytes=0,reusedBytes=0;
 const isLocalHost=['localhost','127.0.0.1'].includes(self.location.hostname);
 for(const part of manifest.parts){
  const cacheKey=new URL(`${part.sha256}/${part.name}`,ZIPA_BASE).href;
  let buf=null;
  try{
   const saved=await cache?.match(cacheKey);
   if(saved){
    const b=await saved.arrayBuffer();
    if(b.byteLength===part.bytes&&await sha256(b)===part.sha256){buf=b;reusedBytes+=part.bytes;}
   }
  }catch(_){}
  if(!buf){
   const urls=isLocalHost?[new URL(part.name,ZIPA_BASE).href]:[new URL(part.name,ZIPA_BASE).href,ZIPA_RAW_MIRROR+part.name];
   let lastErr=null;
   for(const u of urls){
    try{
     postMessage({id,log:`Downloading sound grader (${(downloaded/1048576).toFixed(1)} / ${(manifest.totalBytes/1048576).toFixed(1)} MB)…`,progress:45+Math.round((downloaded/manifest.totalBytes)*45)});
     const b=await fetchWithTimeout(u,30000);
     if(b.byteLength!==part.bytes||await sha256(b)!==part.sha256)throw Error('Chunk verification failed');
     buf=b;networkBytes+=part.bytes;
     try{await cache?.put(cacheKey,new Response(buf.slice(0),{headers:{'Content-Type':'application/octet-stream'}}));}catch(_){}
     break;
    }catch(err){lastErr=err;}
   }
   if(!buf)throw Error(`Could not download ${part.name}: ${String(lastErr?.message||lastErr)}`);
  }
  out.set(new Uint8Array(buf),offset);offset+=part.bytes;downloaded+=part.bytes;
  postMessage({id,log:reusedBytes===manifest.totalBytes?'Reusing saved sound grader…':`Downloading sound grader (${(downloaded/1048576).toFixed(1)} / ${(manifest.totalBytes/1048576).toFixed(1)} MB)…`,progress:45+Math.round((downloaded/manifest.totalBytes)*45)});
 }
 return {bytes:out,networkBytes,reusedBytes,totalBytes:manifest.totalBytes};
}

async function load(id){
 if(pipe&&vad)return;if(loading)return loading;
 loading=(async()=>{
  const preferLocal=new URL(location.href).searchParams.has('local');
  assets=await prepareAdaptiveAssets(p=>{
   const scaled=typeof p.progress==='number'?{...p,progress:Math.round(p.progress*0.45)}:p;
   postMessage({id,...scaled});
  },{preferLocal});
  let zipaAsset=null;
  try{
   zipaAsset=await downloadZipaChunked(id);
   zipaNetworkBytes=zipaAsset.networkBytes;zipaReusedBytes=zipaAsset.reusedBytes;zipaTotalBytes=zipaAsset.totalBytes;
  }catch(_){zipaAsset=null;}
  const originalFetch=self.fetch.bind(self);
  let zipaBytesRef=zipaAsset?.bytes||null;
  self.fetch=(input,init)=>{
   const url=typeof input==='string'?input:input instanceof URL?input.href:input.url,path=url.split('?')[0];
   let key;
   if(path.startsWith(assets.whisperBase))key='whisper/'+path.slice(assets.whisperBase.length);
   else if(path.endsWith('/ort-wasm-simd-threaded.jsep.wasm'))key='runtime/ort-wasm-simd-threaded.jsep.wasm';
   else if(path===assets.vadBase+'config.json')return Promise.resolve(new Response('{"model_type":"silero_vad","architectures":["PreTrainedModel"]}',{headers:{'Content-Type':'application/json'}}));
   else if(path===assets.vadBase+'onnx/model.onnx')key='silero_vad_v5.onnx';
   else if(path.endsWith('/models/zipa-w8/config.json'))return Promise.resolve(new Response('{"model_type":"silero_vad","architectures":["PreTrainedModel"]}',{headers:{'Content-Type':'application/json'}}));
   else if(path.endsWith('/models/zipa-w8/onnx/model.onnx')&&zipaBytesRef)return Promise.resolve(new Response(zipaBytesRef,{headers:{'Content-Type':'application/octet-stream'}}));
   if(key&&assets.buffers.has(key))return Promise.resolve(new Response(assets.buffers.get(key),{headers:{'Content-Type':path.endsWith('.wasm')?'application/wasm':path.endsWith('.json')?'application/json':'application/octet-stream'}}));
   return originalFetch(input,init);
  };
  try{
   const base=new URL('./lib/',import.meta.url).href;
   postMessage({id,log:'Speech files are ready. Starting the local speech engine…',progress:92});
   runtime=await import(base+'transformers.min.js?v=4');
   const {env}=runtime;env.allowLocalModels=true;env.allowRemoteModels=false;env.useBrowserCache=false;env.localModelPath=new URL('./models/',import.meta.url).href;env.backends.onnx.wasm.wasmPaths=base+'wasm/';env.backends.onnx.wasm.numThreads=1;env.backends.onnx.wasm.proxy=false;
   postMessage({id,log:'Preparing the local speech checks…',progress:94});
   pipe=await runtime.pipeline('automatic-speech-recognition','whisper-tiny.en',{device:'wasm',dtype:'q8'});
   const original=pipe.processor,wrapped=async(audio,...args)=>{const f=await original(audio,...args),x=f.input_features,n=x.dims[2],frames=Math.min(n,Math.max(contextSeconds*100,Math.ceil((audio.length/16000+.25)*2)*50));if(frames<n){const data=new Float32Array(x.dims[1]*frames);for(let j=0;j<x.dims[1];j++)data.set(x.data.subarray(j*n,j*n+frames),j*frames);f.input_features=new runtime.Tensor('float32',data,[1,x.dims[1],frames]);x.dispose();}return f;};
   Object.assign(wrapped,original);wrapped.feature_extractor=original.feature_extractor;pipe.processor=wrapped;
   vad=await runtime.AutoModel.from_pretrained('silero-vad-v5',{device:'wasm',dtype:'fp32'});lexicon=compactLexicon(assets.lexicon);
   if(assets.calibration.id!==assets.config.id)throw Error('Speech configuration mismatch');
   postMessage({id,log:'Warming up the word and sentence checks…',progress:96});
   await warmZeroContexts(pipe,runtime,[assets.config.word.contextMinimumSec,assets.config.sentence.contextMinimumSec],seconds=>{contextSeconds=seconds;});
   if(zipaBytesRef){
    try{
     postMessage({id,log:'Starting sound grader…',progress:98});
     zipaModel=await runtime.AutoModel.from_pretrained('zipa-w8',{device:'wasm',dtype:'fp32'});
    }catch(_){zipaModel=null;}
   }
  }finally{
   // Constructors have consumed their verified model bytes. Release those copies.
   zipaBytesRef=null;assets.buffers.clear();self.fetch=originalFetch;
  }
 })();try{await loading;}catch(e){loading=null;throw e;}
}

async function speechPresence(audio){
 const Tensor=runtime.Tensor,sr=new Tensor('int64',BigInt64Array.from([16000n]),[]);let state=new Tensor('float32',new Float32Array(256),[2,1,128]),context=new Float32Array(64);const scores=[];
 try{for(let i=0;i<audio.length+4096;i+=512){const frame=new Float32Array(576);frame.set(context);frame.set(audio.subarray(i,Math.min(audio.length,i+512)),64);context=frame.slice(-64);const input=new Tensor('float32',frame,[1,576]);let out;try{out=await vad.sessions.model.run({input:input.ort_tensor,state:state.ort_tensor,sr:sr.ort_tensor});state.dispose();state=new Tensor(out.stateN);const probability=new Tensor(out.output);scores.push(probability.data[0]);probability.dispose();}finally{input.dispose();}}return scores;}finally{state.dispose();sr.dispose();}
}

async function runZipaForward(audio){
 const pad=3200; // 200ms leading & trailing zero padding so first/last sounds are not clipped
 const pcm=new Float32Array(audio.length+pad*2);
 pcm.set(audio,pad);
 const fb=computeKaldiFbank(pcm);
 const Tensor=runtime.Tensor;
 const x=new Tensor('float32',fb.data,[1,fb.numFrames,80]);
 const xLens=new Tensor('int64',BigInt64Array.from([BigInt(fb.numFrames)]),[1]);
 let out;
 try{
  out=await zipaModel.sessions.model.run({x:x.ort_tensor,x_lens:xLens.ort_tensor});
  const lpTensor=out.log_probs||Object.values(out)[0];
  const T=lpTensor.dims[1],V=lpTensor.dims[2];
  return {logProbs:logSoftmaxRowMajor(lpTensor.data,T,V),T,V};
 }finally{x.dispose();xLens.dispose();if(out)disposeTensors(out);}
}

let busy=false;
self.onmessage=async e=>{
 const {id,action,audio,target,assessmentProfile}=e.data;
 if(busy){postMessage({id,error:'A recording is already being checked'});return;}
 busy=true;
 try{
  await load(id);
  if(action==='load'){
   postMessage({id,ready:true,assetBytes:assets.total+zipaTotalBytes,networkBytes:assets.networkBytes+zipaNetworkBytes,reusedBytes:assets.reusedBytes+zipaReusedBytes,configuration:assets.config.id,zipaReady:Boolean(zipaModel)});
   return;
  }
  const targetWords=words(target||'');
  if(!(audio instanceof Float32Array)||!targetWords.length||targetWords.length>40||audio.some(x=>!Number.isFinite(x)))throw Error('Choose a short English word or sentence');
  const audioStats=stats(audio),started=performance.now();
  const neutral=()=>({status:'unassessed',targetWords:targetWords.map(w=>({text:w.text,heardClear:false,basis:null})),transcript:'',pronunciation:{hasSpeech:false,overall:0,stars:0,headline:''},audioStats,totalMs:performance.now()-started});
  if(audioStats.seconds<assets.config.audio.minimumSeconds||audioStats.seconds>assets.config.audio.maximumSeconds){postMessage({id,...neutral()});return;}
  const vadScores=await speechPresence(audio);
  if(Math.max(...vadScores)<assets.config.vad.thresholdMax){postMessage({id,...neutral(),vadMax:Math.max(...vadScores)});return;}
  const isWord=targetWords.length===1;
  contextSeconds=isWord?assets.config.word.contextMinimumSec:assets.config.sentence.contextMinimumSec;
  const phonicsProfile=assessmentProfile==='phonics1'||assessmentProfile==='phonics1-initial';
  const generationOptions=phonicsProfile?{repetition_penalty:1.2,no_repeat_ngram_size:3}:{};
  const maximumTokens=isWord?assets.config.generation.maxWordTokens:assets.config.generation.maxSentenceTokens;
  let result=await evidence(pipe,runtime,audio,target,[],maximumTokens,generationOptions),targetResult=decide(result,vadScores,lexicon,assets.calibration,assets.config);
  const initials=text=>words(text).map(w=>({text:w.normal,phones:[...new Set((lexicon[w.normal]||[]).map(p=>p[0]))]}));
  let phonicsInitials=phonicsProfile?initials(result.transcript):undefined,phonicsAlternatives,phonicsSoundUnassessed=false,phonicsWordTranscript,phonicsWordInitials;
  if(phonicsProfile){
   if(assessmentProfile==='phonics1-initial'&&targetWords.length===3){
    const spans=speechSegments(audio,12),last=spans.at(-1);
    if(last){const decoded=await pipe(audio.slice(last.start,last.end),{...generationOptions,max_new_tokens:16});phonicsWordTranscript=decoded.text;phonicsWordInitials=initials(decoded.text);}
   }
   const inspect=(r,t)=>verifyPhonics({text:r.transcript,targetWords:t,targetStatus:'checked',phonicsInitials:initials(r.transcript),phonicsWordTranscript,phonicsWordInitials},audio,target,assessmentProfile==='phonics1-initial');
   const primary=inspect(result,targetResult);
   if(!primary.targetWords.every(w=>w.heardClear)){
    const alternate=await evidence(pipe,runtime,audio,target,[],maximumTokens,{repetition_penalty:1.05,no_repeat_ngram_size:6}),alternateTargets=decide(alternate,vadScores,lexicon,assets.calibration,assets.config),secondary=inspect(alternate,alternateTargets);
    phonicsAlternatives=[result.transcript,alternate.transcript];
    if(secondary.targetWords.filter(w=>w.heardClear).length>primary.targetWords.filter(w=>w.heardClear).length){result=alternate;targetResult=alternateTargets;phonicsInitials=initials(result.transcript);}
   }
   const chosen=inspect(result,targetResult),heard=words(result.transcript.replace(/\[[^\]]*\]|\([^)]*\)|\*[^*]*\*/g,' ').replace(/[-–—]/g,' '));
   if(targetWords.length===3&&chosen.targetWords[0].heardClear&&!chosen.targetWords[1].heardClear&&chosen.targetWords[2].heardClear&&heard.length>=2){
    const spans=speechSegments(audio);
    for(const span of spans.slice(1,-1)){
     if(span.end-span.start>16000)continue;
     for(const options of [generationOptions,{repetition_penalty:1.05,no_repeat_ngram_size:6}]){
      const decoded=await pipe(audio.slice(span.start,span.end),{...options,max_new_tokens:12});
      const candidate={...result,transcript:heard[0].text+' '+decoded.text+' '+heard.slice(1).map(w=>w.text).join(' ')};
      if(inspect(candidate,targetResult).targetWords.every(w=>w.heardClear)){
       phonicsAlternatives||=[];phonicsAlternatives.push(candidate.transcript);result=candidate;phonicsInitials=initials(result.transcript);break;
      }
     }
     if(inspect(result,targetResult).targetWords.every(w=>w.heardClear))break;
    }
    const final=inspect(result,targetResult);
    phonicsSoundUnassessed=assessmentProfile==='phonics1-initial'&&spans.length>=3&&final.targetWords[0].heardClear&&!final.targetWords[1].heardClear&&final.targetWords[2].heardClear;
   }
   if(assessmentProfile==='phonics1-initial'&&targetWords.length===5){
    const final=inspect(result,targetResult);
    if(final.targetWords.slice(0,2).every(w=>w.heardClear)&&!final.targetWords.slice(2).every(w=>w.heardClear)&&speechSegments(audio).length>=3)phonicsSoundUnassessed=true;
   }
  }
  let pronunciation=null;
  if(zipaModel&&zipaIdToTok){
   try{
    let whisperWordProbs;
    if(isWord){
     const sim=expectedWordSimilarity(targetWords[0].text,result.transcript,lexicon);
     const baseP=Math.max(sim.exact?0.99:0,sim.phone||0,targetResult[0]?.heardClear?0.85:0.15);
     whisperWordProbs=[{prob:baseP,heardClear:Boolean(targetResult[0]?.heardClear)}];
    }else{
     const feats=sentenceFeatures(result,vadScores,lexicon);
     whisperWordProbs=feats.map((fv,idx)=>({prob:binaryProbability(assets.calibration,fv),heardClear:Boolean(targetResult[idx]?.heardClear)}));
    }
    const {logProbs,T,V}=await runZipaForward(audio);
    const wordVariantsList=targetWords.map(tw=>wordToArpabetVariants(tw.text,lexicon).slice(0,4).map(seq=>mapArpabetSeqToZipa(seq,zipaVocab,true)));
    const zipaRes=ctcViterbiAlignAndGop(logProbs,T,V,wordVariantsList,0,[0,1,2,3],[0,3]);
    pronunciation=scoreUtteranceOption1({targetWords,whisperWords:whisperWordProbs,vadScores,zipaRes,idToTok:zipaIdToTok,audioSeconds:audioStats.seconds});
    targetResult=targetResult.map((w,i)=>{
     const pw=pronunciation.words[i];
     if(!pw)return w;
     const grade=w.heardClear?(pw.score>=72?'green':'yellow'):(pw.score>=42?'yellow':'red');
     pw.grade=grade;
     pw.color=grade==='green'?'green':grade==='yellow'?'amber':'coral';
     return {...w,score:pw.score,grade,tip:pw.tip||''};
    });
    const hasRed=targetResult.some(w=>w.grade==='red');
    const hasYellow=targetResult.some(w=>w.grade==='yellow');
    const greenOrYellow=targetResult.filter(w=>w.grade==='green'||w.grade==='yellow').length;
    pronunciation.stars=(!hasRed&&!hasYellow)?3:((pronunciation.overall>=55||(greenOrYellow*2>=targetResult.length&&!targetResult.every(w=>w.grade==='red')))?2:1);
   }catch(_){pronunciation=null;}
  }
  postMessage({id,status:'checked',targetWords:targetResult,transcript:result.transcript,pronunciation,phonicsInitials,phonicsWordTranscript,phonicsWordInitials,phonicsAlternatives,phonicsSoundUnassessed,audioStats,totalMs:performance.now()-started,contextMinimumSec:contextSeconds,vadMax:Math.max(...vadScores),sharedEncoderVerified:result.sharedEncoderVerifiedByRunCount,configuration:assets.config.id});
 }catch(e){postMessage({id,error:String(e.message||e).slice(0,400)});}finally{busy=false;}
};
