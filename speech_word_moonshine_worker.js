// A separate worker bounds native work and releases the optional model on termination.
import {prepareMoonshine} from './speech_word_assets.js?v=1';
let pipe;
self.onmessage=async event=>{const {id,audio}=event.data;try{
  if(!pipe){
    const assets=await prepareMoonshine(p=>self.postMessage({id,...p}));
    const originalFetch=self.fetch.bind(self);
    self.fetch=(input,init)=>{const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;if(url.startsWith(assets.base)){const file=url.slice(assets.base.length).split('?')[0],bytes=assets.buffers.get(file);if(bytes)return Promise.resolve(new Response(bytes,{headers:{'Content-Type':file.endsWith('.json')?'application/json':'application/octet-stream'}}));}return originalFetch(input,init);};
    const stable='https://vpietri-stack.github.io/Classroom-survivors-lib/tjs-v3/';
    let runtime,base;try{runtime=await import(stable+'transformers.min.js');base=stable;}catch(_){runtime=await import('./lib/transformers.min.js?v=4');base=new URL('./lib/',self.location.href).href;}
    const {env,pipeline}=runtime;env.allowLocalModels=true;env.allowRemoteModels=false;env.localModelPath=new URL('./models/',self.location.href).href;env.useBrowserCache=false;env.backends.onnx.wasm.wasmPaths=base+'wasm/';env.backends.onnx.wasm.numThreads=1;
    pipe=await pipeline('automatic-speech-recognition','moonshine-tiny-poc',{device:'wasm',dtype:'q8'});
  }
  const start=performance.now();const result=await pipe(audio,{max_new_tokens:64});self.postMessage({id,text:result.text||'',ms:Math.round(performance.now()-start)});
}catch(e){self.postMessage({id,error:String(e.message||e).slice(0,300)});}};
