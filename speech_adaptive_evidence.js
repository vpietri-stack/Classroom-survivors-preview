import {disposeTensors,stats,wordEvidence} from './speech_target.js?v=2026-10-28b';
const zeroCache=new Map();
export async function warmZeroContexts(pipe,runtime,contexts,setContext){
 for(const seconds of contexts){setContext(seconds);const features=await pipe.processor(new Float32Array(16000));try{const key='input_features|'+features.input_features.dims.join(',');if(zeroCache.has(key))continue;const raw=await pipe.model.sessions.model.run({input_features:features.input_features.ort_tensor});zeroCache.set(key,{encoded:new runtime.Tensor(raw.last_hidden_state),scores:new Map()});}finally{disposeTensors(features);}}
}
export async function evidence(pipe,runtime,audio,text,foils=[],maxTokens=96){
 const start=performance.now(),Tensor=runtime.Tensor,whisper=pipe.model.config.model_type==='whisper',prefix=whisper?[50257,50362]:[1],eos=whisper?50256:2,features=await pipe.processor(audio);
 // Whisper expects its normal leading-space BPE token. Moonshine's tokenizer
 // inserts that boundary itself; a literal extra space creates an unwanted token.
 const assessor={tokens:s=>pipe.tokenizer.encode((whisper?' ':'')+s.trim().replace(/[’‘]/g,"'"),{add_special_tokens:false})};
 const key=whisper?'input_features':'input_values';let actual,nullFeatures,zero,encoderRuns=0;
 const session=pipe.model.sessions.model,originalRun=session.run,originalParams=pipe.model.forward_params;
 session.run=function(...args){encoderRuns++;return originalRun.apply(this,args);};
 // This pinned runtime otherwise filters supplied encoder_outputs out before generation.
 pipe.model.forward_params=[...new Set([...originalParams,'encoder_outputs'])];
 async function encode(f){const raw=await pipe.model.sessions.model.run({[key]:f[key].ort_tensor});return new Tensor(raw.last_hidden_state);}
 async function score(encoded,text){const content=assessor.tokens(text),expected=[...content,eos],logprobs=[];let past=null;
  if(!content.length||content.length>100)throw Error('Invalid target token length');
  try{for(let i=0;i<expected.length;i++){const input=i?[expected[i-1]]:prefix,decoder=new Tensor('int64',BigInt64Array.from(input.map(BigInt)),[1,input.length]);let out;
   try{out=await pipe.model.forward({encoder_outputs:encoded,decoder_input_ids:decoder,past_key_values:past});const logits=out.logits,n=logits.dims[2],offset=(logits.dims[1]-1)*n;let max=-Infinity,sum=0;for(let k=0;k<n;k++)max=Math.max(max,logits.data[offset+k]);for(let k=0;k<n;k++)sum+=Math.exp(logits.data[offset+k]-max);logprobs.push(logits.data[offset+expected[i]]-max-Math.log(sum));const next=pipe.model.getPastKeyValues(out,past);disposeTensors({out,past},new Set(),new Set([encoded,...Object.values(next)]));past=next;out=null;
   }finally{decoder.dispose();disposeTensors(out,new Set(),new Set([encoded]));}}
   const l=logprobs.slice(0,-1);return {text,tokens:content,logprobs:l,meanLogProb:l.reduce((a,b)=>a+b,0)/l.length,minLogProb:Math.min(...l),eosLogProb:logprobs.at(-1),fullMeanLogProb:logprobs.reduce((a,b)=>a+b,0)/logprobs.length,sumLogProb:logprobs.reduce((a,b)=>a+b,0)};
  }finally{disposeTensors(past,new Set(),new Set([encoded]));}
 }
 try{const encStart=performance.now();actual=await encode(features);const encodeMs=performance.now()-encStart,genStart=performance.now();
  // Shared encoded audio: generation receives no target, prompt, forced target tokens or alternatives.
  const beforeGeneration=encoderRuns,generated=await pipe.model.generate({...features,encoder_outputs:actual,max_new_tokens:maxTokens,do_sample:false,return_dict_in_generate:true});const transcript=pipe.tokenizer.batch_decode(generated.sequences,{skip_special_tokens:true})[0];disposeTensors(generated,new Set(),new Set([actual]));const asrMs=performance.now()-genStart,generationEncoderRuns=encoderRuns-beforeGeneration;
  if(generationEncoderRuns!==0)throw Error('Shared encoder bypass failed: '+generationEncoderRuns+' extra encoding passes');
  nullFeatures=await pipe.processor(new Float32Array(audio.length));const zeroKey=key+'|'+nullFeatures[key].dims.join(',');if(zeroCache.has(zeroKey)){zero=zeroCache.get(zeroKey);zeroCache.delete(zeroKey);zeroCache.set(zeroKey,zero);}else{zero={encoded:await encode(nullFeatures),scores:new Map()};zeroCache.set(zeroKey,zero);while(zeroCache.size>4){const first=zeroCache.keys().next().value;disposeTensors(zeroCache.get(first).encoded);zeroCache.delete(first);}}
  const scored=[];for(const phrase of [...new Set([text,...foils])]){const a=await score(actual,phrase);let z=zero.scores.get(phrase);if(!z){z=await score(zero.encoded,phrase);zero.scores.set(phrase,z);while(zero.scores.size>256)zero.scores.delete(zero.scores.keys().next().value);}scored.push({text:phrase,actual:a,silence:z,gainMean:a.meanLogProb-z.meanLogProb,gainFullMean:a.fullMeanLogProb-z.fullMeanLogProb});}
  const target=scored[0],words=wordEvidence(assessor,text,target.actual,target.silence,transcript);
  return {transcript,...words,hypothesisScores:scored,encodeMs,asrMs,totalMs:performance.now()-start,audioStats:stats(audio),sharedEncoder:true,encoderRuns,generationEncoderRuns,sharedEncoderVerifiedByRunCount:true,expectedTextUsedInAsrGeneration:false,causalScoring:true,algorithm:'shared-causal-v3-verified-encoder-reuse'};
 }finally{session.run=originalRun;pipe.model.forward_params=originalParams;disposeTensors(actual);disposeTensors(features);disposeTensors(nullFeatures);}
}
