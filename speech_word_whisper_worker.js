// Reuse the exact app engine and IndexedDB model cache in an isolated worker.
self.window=self;
let engine;
self.onmessage=async event=>{const {id,action,audio,target,repeatThresholdSec}=event.data;try{
  if(!engine){await import('./speech_engine.js?v=12');engine=self.LocalEngine;}
  self.__speechLog=text=>self.postMessage({id,log:String(text).slice(0,180)});
  if(action==='load'){await engine.load(percent=>self.postMessage({id,progress:percent}));self.postMessage({id,ready:true});return;}
  const start=performance.now(),result=await engine.transcribe(audio,{target,repeatThresholdSec});
  self.postMessage({id,...result,ms:Math.round(performance.now()-start)});
}catch(e){self.postMessage({id,error:String(e.message||e).slice(0,300)});}};
