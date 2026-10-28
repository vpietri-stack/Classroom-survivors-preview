// A separate worker bounds native work and releases the optional model on termination.
let pipe;
self.onmessage=async event=>{const {id,audio}=event.data;try{
  if(!pipe){
    const stable='https://vpietri-stack.github.io/Classroom-survivors-lib/tjs-v3/';
    let runtime,base;try{runtime=await import(stable+'transformers.min.js');base=stable;}catch(_){runtime=await import('./lib/transformers.min.js?v=4');base=new URL('./lib/',self.location.href).href;}
    const {env,pipeline}=runtime;env.allowLocalModels=true;env.allowRemoteModels=false;env.localModelPath=new URL('./models/',self.location.href).href;env.useBrowserCache=true;env.backends.onnx.wasm.wasmPaths=base+'wasm/';env.backends.onnx.wasm.numThreads=1;
    pipe=await pipeline('automatic-speech-recognition','moonshine-tiny-poc',{device:'wasm',dtype:'q8',progress_callback:p=>{if(p.status==='progress')self.postMessage({id,progress:Math.round(p.progress||0)});}});
  }
  const start=performance.now();const result=await pipe(audio,{max_new_tokens:64});self.postMessage({id,text:result.text||'',ms:Math.round(performance.now()-start)});
}catch(e){self.postMessage({id,error:String(e.message||e).slice(0,300)});}};
