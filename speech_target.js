// Target-aware encouragement using the existing Whisper model. No ASR prompting, new weights or pronunciation grades.
export const CLASSES=['clear','close','practice'];
export const FEATURE_NAMES=['target_mean','target_min','gain_mean','gain_min','char_similarity','phone_similarity','phones_known','asr_present','asr_exact','token_count','relative_target_mean'];
export const normalWord=s=>String(s).normalize('NFKD').replace(/\p{M}/gu,'').replace(/[’‘]/g,"'").toLowerCase();
export function words(text){return [...String(text).matchAll(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)].map(m=>({text:m[0],normal:normalWord(m[0]),start:m.index,end:m.index+m[0].length}));}
export function editDistance(a,b,cost=(x,y)=>x===y?0:1){let row=Array.from({length:b.length+1},(_,i)=>i);for(let i=0;i<a.length;i++){const next=[i+1];for(let j=0;j<b.length;j++)next.push(Math.min(row[j+1]+1,next[j]+1,row[j]+cost(a[i],b[j])));row=next;}return row[b.length];}
export const charSimilarity=(a,b)=>a||b?1-editDistance(a,b)/Math.max(a.length,b.length):1;
export function alignWords(target,transcript){
 const a=words(target),b=words(transcript),dp=Array.from({length:a.length+1},()=>Array(b.length+1).fill(0));
 for(let i=0;i<=a.length;i++)dp[i][0]=i;for(let j=0;j<=b.length;j++)dp[0][j]=j;
 for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++)dp[i][j]=Math.min(dp[i-1][j]+1,dp[i][j-1]+1,dp[i-1][j-1]+1-charSimilarity(a[i-1].normal,b[j-1].normal));
 const mapped=Array(a.length).fill(null),insertions=[];let i=a.length,j=b.length;
 while(i||j){if(i&&j&&Math.abs(dp[i][j]-(dp[i-1][j-1]+1-charSimilarity(a[i-1].normal,b[j-1].normal)))<1e-7){mapped[i-1]=b[j-1];i--;j--;}else if(i&&Math.abs(dp[i][j]-(dp[i-1][j]+1))<1e-7)i--;else{insertions.push(b[j-1]);j--;}}
 return {target:a,heard:mapped,insertions:insertions.reverse()};
}
const PHONE_GROUPS={vowel:new Set(['AA','AE','AH','AO','AW','AY','EH','ER','EY','IH','IY','OW','OY','UH','UW']),fricative:new Set(['DH','F','S','SH','TH','V','Z','ZH']),stop:new Set(['B','D','G','K','P','T']),nasal:new Set(['M','N','NG']),liquid:new Set(['L','R']),semivowel:new Set(['W','Y']),affricate:new Set(['CH','JH'])};
const NEAR=new Set(['B|P','D|T','G|K','F|V','S|Z','SH|ZH','DH|TH','CH|JH','D|N','N|T','B|M','M|P']);
function phoneCost(a,b){if(a===b)return 0;if(NEAR.has([a,b].sort().join('|')))return .5;for(const group of Object.values(PHONE_GROUPS))if(group.has(a)&&group.has(b))return .6;return 1;}
export function phoneSimilarity(a,b,lexicon){const x=lexicon[normalWord(a)],y=lexicon[normalWord(b)];if(!x||!y)return {known:false,similarity:0};let best=0;for(const p of x)for(const q of y)best=Math.max(best,1-editDistance(p,q,phoneCost)/Math.max(p.length,q.length));return {known:true,similarity:best};}
export function wordEvidence(assessor,text,target,silence,transcript){
 const canonical=text.replace(/[’‘]/g,"'"),alignment=alignWords(canonical,transcript),out=[];
 for(let index=0;index<alignment.target.length;index++){
  const word=alignment.target[index],before=canonical.slice(0,word.start).trimEnd(),through=canonical.slice(0,word.end),begin=before?assessor.tokens(before).length:0,end=assessor.tokens(through).length;
  const prefix=assessor.tokens(through);if(!prefix.every((id,i)=>id===target.tokens[i]))throw Error('Word/token boundary mismatch at '+index);
  if(end<=begin)throw Error('Empty word token span');const l=target.logprobs.slice(begin,end),n=silence.logprobs.slice(begin,end),gain=l.map((x,i)=>x-n[i]);
  out.push({index,text:word.text,normal:word.normal,heard:alignment.heard[index]?.text||'',mean:l.reduce((s,x)=>s+x,0)/l.length,min:Math.min(...l),gainMean:gain.reduce((s,x)=>s+x,0)/gain.length,gainMin:Math.min(...gain),tokenCount:l.length,relativeMean:l.reduce((s,x)=>s+x,0)/l.length-target.meanLogProb});
 }
 return {words:out,insertions:alignment.insertions.map(w=>w.text)};
}
export function featureVector(word,lexicon){const heard=normalWord(word.heard),phone=phoneSimilarity(word.normal,heard,lexicon);return [word.mean,word.min,word.gainMean,word.gainMin,heard?charSimilarity(word.normal,heard):0,phone.similarity,phone.known?1:0,heard?1:0,heard===word.normal?1:0,Math.log1p(word.tokenCount),word.relativeMean];}
export function probabilities(model,x){
 if(x.length!==model.mean.length||x.some(v=>!Number.isFinite(v)))return [0,0,0];let scores;
 if(model.kind==='boosted_trees_v1'){scores=[...model.baseScores];for(const group of model.trees)for(let k=0;k<3;k++){let node=group[k];while(node.feature!==undefined)node=x[node.feature]<=node.threshold?node.left:node.right;scores[k]+=model.learningRate*node.value;}}
 else{const z=x.map((v,j)=>(v-model.mean[j])/model.std[j]);scores=model.weights.map((w,k)=>model.bias[k]+w.reduce((s,v,j)=>s+v*z[j],0));}
 if(scores.some(v=>!Number.isFinite(v)))return [0,0,0];const max=Math.max(...scores),p=scores.map(x=>Math.exp(x-max)),sum=p.reduce((a,b)=>a+b,0);return p.map(x=>x/sum);
}
export function technicalIssue(s){return !s||!Number.isFinite(s.seconds)||s.seconds<.4||s.peak<.02||s.rmsDbfs< -48;}

// Experimental local audio/text evidence. This is not a phone-pronunciation score.
// Expected words are evaluated as hypotheses, never inserted into ASR generation.
export function disposeTensors(value,seen=new Set(),keep=new Set()){
 if(!value||typeof value!=='object'||seen.has(value))return;seen.add(value);
 if(typeof value.dispose==='function'&&value.dims){if(!keep.has(value))value.dispose();return;}
 for(const child of Object.values(value))disposeTensors(child,seen,keep);
}
export function readPcm(buffer){const view=new DataView(buffer);for(let p=12;p+8<=buffer.byteLength;){const tag=String.fromCharCode(...new Uint8Array(buffer,p,4)),n=view.getUint32(p+4,true);if(p+8+n>buffer.byteLength)throw Error('Truncated audio');if(tag==='data'){const audio=new Float32Array(n/2);for(let i=0;i<audio.length;i++)audio[i]=view.getInt16(p+8+i*2,true)/32768;return audio;}p+=8+n+(n%2);}throw Error('No PCM data');}
export function stats(audio){let peak=0,sum=0;for(const v of audio){peak=Math.max(peak,Math.abs(v));sum+=v*v;}return {seconds:audio.length/16000,peak,rmsDbfs:20*Math.log10(Math.max(1e-12,Math.sqrt(sum/audio.length)))};}
function logProbability(logits,offset,size,token){let max=-Infinity;for(let k=0;k<size;k++)max=Math.max(max,logits[offset+k]);let sum=0;for(let k=0;k<size;k++)sum+=Math.exp(logits[offset+k]-max);return logits[offset+token]-max-Math.log(sum);}


function checkCancelled(signal){if(signal&&signal.aborted){const error=new Error('Target checking cancelled');error.name='AbortError';throw error;}}
export function positiveWords(evidence,data){
 const invalid=technicalIssue(evidence.audioStats);
 return (evidence.words||[]).map(w=>{const p=invalid?[0,0,0]:probabilities(data.calibration,featureVector(w,data.lexicon));
  const exact=!invalid&&!!w.heard&&normalWord(w.heard)===w.normal,target=!invalid&&p[0]>=data.calibration.clearThreshold;
  return {text:w.text,heardClear:exact||target,basis:exact?'transcript':target?'target':null};});
}
export function createTargetChecker(pipe,runtime,data){
 const Tensor=runtime.Tensor;
 if(!Tensor||data.schema!==1||data.calibration.mean.length!==11||data.calibration.std.some(x=>!Number.isFinite(x)||x<=0))throw Error('Invalid target checker');
 class TargetEvidenceAssessor{
 constructor(pipe){this.pipe=pipe;this.prefix=[50257,50362];this.eos=50256;}
 tokens(text){return this.pipe.tokenizer.encode(' '+text.trim().replace(/[’‘]/g,"'"),{add_special_tokens:false});}
 async encode(features){
  if(!features.encoder_outputs){const raw=await this.pipe.model.sessions.model.run({input_features:features.input_features.ort_tensor});features.encoder_outputs=new Tensor(raw.last_hidden_state);}
  return features.encoder_outputs;
 }
 async score(features,text,signal){
  checkCancelled(signal);
  const content=this.tokens(text);if(!content.length||content.length>96)throw Error('Unsupported hypothesis length');
  const expected=[...content,this.eos],logprobs=[];let past=null;
  try{
   const encoded=await this.encode(features);
   for(let i=0;i<expected.length;i++){
    // Yield browser tasks between decoder tokens so Continue can interrupt.
    await new Promise(resolve=>setTimeout(resolve,0));
    checkCancelled(signal);
    const input=i===0?this.prefix:[expected[i-1]],decoder=new Tensor('int64',BigInt64Array.from(input.map(BigInt)),[1,input.length]);let out;
    try{
     out=await this.pipe.model.forward({encoder_outputs:encoded,decoder_input_ids:decoder,past_key_values:past});
     const logits=out.logits,size=logits.dims[2];logprobs.push(logProbability(logits.data,(logits.dims[1]-1)*size,size,expected[i]));
     const next=this.pipe.model.getPastKeyValues(out,past),keep=new Set([...Object.values(next),encoded]);disposeTensors({out,past},new Set(),keep);past=next;out=null;
    }finally{disposeTensors(out);decoder.dispose();}
   }
   const contentLogprobs=logprobs.slice(0,-1),sorted=[...contentLogprobs].sort((a,b)=>a-b);
   return {text,tokens:content,tokenText:content.map(id=>this.pipe.tokenizer.decode([id])),logprobs:contentLogprobs,meanLogProb:contentLogprobs.reduce((a,b)=>a+b,0)/content.length,p10LogProb:sorted[Math.floor((sorted.length-1)*.1)],minLogProb:sorted[0],eosLogProb:logprobs.at(-1),fullMeanLogProb:logprobs.reduce((a,b)=>a+b,0)/logprobs.length,positionsChecked:expected.length,causalTokenByToken:true};
  }finally{disposeTensors(past);}
 }
 async verifyCausalScoring(features,text){
  const full=await this.score(features,text),content=this.tokens(text);let maxDifference=0;
  for(let i=0;i<Math.min(3,content.length);i++){
   const input=[...this.prefix,...content.slice(0,i)],decoder=new Tensor('int64',BigInt64Array.from(input.map(BigInt)),[1,input.length]);let out;
   try{out=await this.pipe.model.forward({input_features:features.input_features,decoder_input_ids:decoder});const size=out.logits.dims[2],actual=logProbability(out.logits.data,(input.length-1)*size,size,content[i]);maxDifference=Math.max(maxDifference,Math.abs(actual-full.logprobs[i]));}finally{disposeTensors(out);decoder.dispose();}
  }
  // q8 dynamic activation quantization differs slightly between cached and uncached execution.
  if(maxDifference>.5)throw Error('Cached scoring differs excessively from uncached causal prefixes: '+maxDifference);
  return {checkedTokens:Math.min(3,content.length),maxLogProbDifference:maxDifference,method:'cached causal tokens checked against independent uncached prefixes',q8Tolerance:.5};
 }
}

 const assessor=new TargetEvidenceAssessor(pipe);let zeroFeatures=null;
 function sameFeatures(a,b){if(!a||!b)return false;const x=a.input_features,y=b.input_features;if(x.dims.join(',')!==y.dims.join(',')||x.data.length!==y.data.length)return false;for(let i=0;i<x.data.length;i++)if(x.data[i]!==y.data[i])return false;return true;}
 return {dispose(){disposeTensors(zeroFeatures);zeroFeatures=null;},async check(audio,target,transcript,signal){
  checkCancelled(signal);const audioStats=stats(audio),targetWords=words(target);
  if(!targetWords.length||targetWords.length>40||technicalIssue(audioStats))return {status:'unassessed',words:targetWords.map(w=>({text:w.text,heardClear:false,basis:null}))};
  let features,empty;
  try{
   features=await pipe.processor(audio);checkCancelled(signal);empty=await pipe.processor(new Float32Array(audio.length));checkCancelled(signal);
   if(sameFeatures(zeroFeatures,empty)){disposeTensors(empty);empty=null;}else{disposeTensors(zeroFeatures);zeroFeatures=empty;empty=null;}
   const actual=await assessor.score(features,target,signal),silence=await assessor.score(zeroFeatures,target,signal);checkCancelled(signal);
   const heard=/^\[.*\]$|^\(.*\)$|^(you|bye!?|thank you\.?|thanks for watching!?)$/i.test((transcript||'').trim())?'':transcript;
   const evidence={...wordEvidence(assessor,target,actual,silence,heard||''),audioStats};
   return {status:'checked',words:positiveWords(evidence,data)};
  }finally{disposeTensors(features);disposeTensors(empty);}
 }};
}
