// Public, aggregate calibration only; no student recordings or reference rows.
const fs=require('fs'),assert=require('node:assert/strict');
(async()=>{
 const source=fs.readFileSync('speech_target.js','utf8'),m=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64')),data=JSON.parse(fs.readFileSync('speech_target_data.json'));
 let checks=0;assert.equal(data.schema,1);assert.deepEqual(Object.keys(data).sort(),['calibration','dictionaryLicense','lexicon','purpose','schema']);
 assert.equal(data.purpose,'encouragement_only');assert(data.calibration.weights.every(row=>row.length===11&&row.every(Number.isFinite)));assert(data.calibration.std.every(x=>Number.isFinite(x)&&x>0));checks++;
 const calibration={mean:Array(11).fill(0),std:Array(11).fill(1),weights:Array.from({length:3},()=>Array(11).fill(0)),bias:[4,0,0],clearThreshold:.6},fixture={schema:1,calibration,lexicon:{this:[['DH','IH','S']],is:[['IH','Z']]}};
 const word={text:'this',normal:'this',heard:'',mean:-1,min:-1,gainMean:2,gainMin:2,tokenCount:1,relativeMean:0},audioStats={seconds:1,peak:.3,rmsDbfs:-20};
 assert.equal(m.positiveWords({words:[word],audioStats},fixture)[0].heardClear,true);checks++;
 const notClear={...fixture,calibration:{...calibration,bias:[0,0,4]}};
 assert.equal(m.positiveWords({words:[word],audioStats},notClear)[0].heardClear,false);
 assert.equal(m.positiveWords({words:[{...word,heard:'this'}],audioStats},notClear)[0].heardClear,true);checks++;
 assert.equal(m.positiveWords({words:[word],audioStats:{seconds:1,peak:0,rmsDbfs:-Infinity}},fixture)[0].heardClear,false);
 assert.equal(m.positiveWords({words:[word]},fixture)[0].heardClear,false);checks++;
 assert.deepEqual(Object.keys(m.positiveWords({words:[word],audioStats},fixture)[0]).sort(),['basis','heardClear','text']);checks++;
 class Tensor{constructor(type,data,dims){if(typeof type==='object'){this.data=type.data;this.dims=type.dims;}else{this.data=data;this.dims=dims;}this.ort_tensor=this;this.disposed=false;}dispose(){this.disposed=true;}}
 const inputs=[];let encoders=0;const pipe={tokenizer:{encode:text=>text.trim().toLowerCase().split(/\s+/).map(w=>({this:10,is:11}[w])),decode:()=>''},processor:async audio=>({input_features:new Tensor('float32',new Float32Array([audio.some(v=>v)?1:0]),[1,1])}),model:{sessions:{model:{run:async()=>{encoders++;return {last_hidden_state:new Tensor('float32',new Float32Array([1]),[1,1])};}}},forward:async input=>{assert(!input.encoder_outputs.disposed);inputs.push(Array.from(input.decoder_input_ids.data,Number));return {logits:new Tensor('float32',new Float32Array(50364),[1,1,50364])};},getPastKeyValues:()=>({cache:new Tensor('float32',new Float32Array([1]),[1,1])})}};
 const checker=m.createTargetChecker(pipe,{Tensor},fixture),audio=new Float32Array(16000).fill(.2);
 const result=await checker.check(audio,'this is','');assert.equal(result.status,'checked');assert.equal(result.words.length,2);
 assert.deepEqual(inputs.slice(0,3),[[50257,50362],[10],[11]]);assert.deepEqual(inputs.slice(3,6),[[50257,50362],[10],[11]]);checks++;
 await checker.check(audio,'this is','');assert.equal(encoders,3);checks++;
 const controller=new AbortController();controller.abort();await assert.rejects(checker.check(audio,'this is','',controller.signal),{name:'AbortError'});checks++;
 const silence=await checker.check(new Float32Array(16000),'this is','this is');assert(silence.words.every(w=>!w.heardClear));checks++;
 checker.dispose();console.log(checks+' target-aware encouragement checks passed (causal tokens, silence, no grades, public data and cache reuse)');
})().catch(error=>{console.error(error);process.exitCode=1});
