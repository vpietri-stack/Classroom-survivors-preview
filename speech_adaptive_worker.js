import {prepareAdaptiveAssets} from './speech_adaptive_assets.js?v=2';
import {compactLexicon,decide} from './speech_adaptive_core.js?v=1';
import {words,disposeTensors,stats} from './speech_target.js?v=2026-10-28b';
import {evidence,warmZeroContexts} from './speech_adaptive_evidence.js?v=1';
let runtime,pipe,vad,assets,lexicon,contextSeconds=8,loading;
async function load(id){
 if(pipe&&vad)return;if(loading)return loading;
 loading=(async()=>{
  const preferLocal=new URL(location.href).searchParams.has('local');assets=await prepareAdaptiveAssets(p=>postMessage({id,...p}),{preferLocal});const originalFetch=self.fetch.bind(self);
  self.fetch=(input,init)=>{const url=typeof input==='string'?input:input instanceof URL?input.href:input.url,path=url.split('?')[0];let key;if(path.startsWith(assets.whisperBase))key='whisper/'+path.slice(assets.whisperBase.length);else if(path===assets.vadBase+'config.json')return Promise.resolve(new Response('{"model_type":"silero_vad","architectures":["PreTrainedModel"]}',{headers:{'Content-Type':'application/json'}}));else if(path===assets.vadBase+'onnx/model.onnx')key='silero_vad_v5.onnx';if(key&&assets.buffers.has(key))return Promise.resolve(new Response(assets.buffers.get(key),{headers:{'Content-Type':path.endsWith('.json')?'application/json':'application/octet-stream'}}));return originalFetch(input,init);};
  const stable='https://vpietri-stack.github.io/Classroom-survivors-lib/tjs-v3/';let base=new URL('./lib/',import.meta.url).href;
  if(!preferLocal&&!['localhost','127.0.0.1'].includes(location.hostname)){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),4000);try{const response=await originalFetch(stable+'wasm/ort-wasm-simd-threaded.jsep.mjs',{signal:controller.signal});if(response.ok)base=stable;await response.body?.cancel();}catch(_){}finally{clearTimeout(timer);}}
  postMessage({id,log:'Preparing the speech engine…'});runtime=await import(base+'transformers.min.js'+(base===stable?'':'?v=4'));
  const {env}=runtime;env.allowLocalModels=true;env.allowRemoteModels=false;env.useBrowserCache=false;env.localModelPath=new URL('./models/',import.meta.url).href;env.backends.onnx.wasm.wasmPaths=base+'wasm/';env.backends.onnx.wasm.numThreads=1;env.backends.onnx.wasm.proxy=false;
  pipe=await runtime.pipeline('automatic-speech-recognition','whisper-tiny.en',{device:'wasm',dtype:'q8'});
  const original=pipe.processor,wrapped=async(audio,...args)=>{const f=await original(audio,...args),x=f.input_features,n=x.dims[2],frames=Math.min(n,Math.max(contextSeconds*100,Math.ceil((audio.length/16000+.25)*2)*50));if(frames<n){const data=new Float32Array(x.dims[1]*frames);for(let j=0;j<x.dims[1];j++)data.set(x.data.subarray(j*n,j*n+frames),j*frames);f.input_features=new runtime.Tensor('float32',data,[1,x.dims[1],frames]);x.dispose();}return f;};Object.assign(wrapped,original);wrapped.feature_extractor=original.feature_extractor;pipe.processor=wrapped;
  vad=await runtime.AutoModel.from_pretrained('silero-vad-v5',{device:'wasm',dtype:'fp32'});lexicon=compactLexicon(assets.lexicon);
  if(assets.calibration.id!==assets.config.id)throw Error('Speech configuration mismatch');
  postMessage({id,log:'Warming up the word and sentence checks…'});await warmZeroContexts(pipe,runtime,[assets.config.word.contextMinimumSec,assets.config.sentence.contextMinimumSec],seconds=>{contextSeconds=seconds;});
  // Constructors have consumed their verified model bytes. Release those copies.
  assets.buffers.clear();self.fetch=originalFetch;
 })();try{await loading;}catch(e){loading=null;throw e;}
}
async function speechPresence(audio){
 const Tensor=runtime.Tensor,sr=new Tensor('int64',BigInt64Array.from([16000n]),[]);let state=new Tensor('float32',new Float32Array(256),[2,1,128]),context=new Float32Array(64);const scores=[];
 try{for(let i=0;i<audio.length+4096;i+=512){const frame=new Float32Array(576);frame.set(context);frame.set(audio.subarray(i,Math.min(audio.length,i+512)),64);context=frame.slice(-64);const input=new Tensor('float32',frame,[1,576]);let out;try{out=await vad.sessions.model.run({input:input.ort_tensor,state:state.ort_tensor,sr:sr.ort_tensor});state.dispose();state=new Tensor(out.stateN);const probability=new Tensor(out.output);scores.push(probability.data[0]);probability.dispose();}finally{input.dispose();}}return scores;}finally{state.dispose();sr.dispose();}
}
let busy=false;
self.onmessage=async e=>{const {id,action,audio,target}=e.data;if(busy){postMessage({id,error:'A recording is already being checked'});return;}busy=true;try{
 await load(id);if(action==='load'){postMessage({id,ready:true,assetBytes:assets.total,networkBytes:assets.networkBytes,reusedBytes:assets.reusedBytes,configuration:assets.config.id});return;}
 const targetWords=words(target||'');if(!(audio instanceof Float32Array)||!targetWords.length||targetWords.length>40||audio.some(x=>!Number.isFinite(x)))throw Error('Choose a short English word or sentence');const audioStats=stats(audio),started=performance.now();
 const neutral=()=>({status:'unassessed',targetWords:targetWords.map(w=>({text:w.text,heardClear:false,basis:null})),transcript:'',audioStats,totalMs:performance.now()-started});
 if(audioStats.seconds<assets.config.audio.minimumSeconds||audioStats.seconds>assets.config.audio.maximumSeconds){postMessage({id,...neutral()});return;}
 const vadScores=await speechPresence(audio);if(Math.max(...vadScores)<assets.config.vad.thresholdMax){postMessage({id,...neutral(),vadMax:Math.max(...vadScores)});return;}
 const isWord=targetWords.length===1;contextSeconds=isWord?assets.config.word.contextMinimumSec:assets.config.sentence.contextMinimumSec;
 const result=await evidence(pipe,runtime,audio,target,[],isWord?assets.config.generation.maxWordTokens:assets.config.generation.maxSentenceTokens),targetResult=decide(result,vadScores,lexicon,assets.calibration,assets.config);
 postMessage({id,status:'checked',targetWords:targetResult,transcript:result.transcript,audioStats,totalMs:performance.now()-started,contextMinimumSec:contextSeconds,vadMax:Math.max(...vadScores),sharedEncoderVerified:result.sharedEncoderVerifiedByRunCount,configuration:assets.config.id});
 }catch(e){postMessage({id,error:String(e.message||e).slice(0,400)});}finally{busy=false;}};
