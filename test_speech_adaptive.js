const assert=require('assert/strict'),fs=require('fs'),path=require('path'),{pathToFileURL}=require('url');
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
(async()=>{
 const target=url(fs.readFileSync('speech_target.js','utf8')),phonetic=url(fs.readFileSync('speech_adaptive_phonetic.js','utf8').replace("'./speech_target.js?v=2026-10-28b'",JSON.stringify(target)));
 const core=await import(url(fs.readFileSync('speech_adaptive_core.js','utf8').replace("'./speech_target.js?v=2026-10-28b'",JSON.stringify(target)).replace("'./speech_adaptive_phonetic.js?v=1'",JSON.stringify(phonetic))));
 const assets=await import(url(fs.readFileSync('speech_adaptive_assets.js','utf8').replaceAll('import.meta.url',JSON.stringify(pathToFileURL(path.resolve('speech_adaptive_assets.js')).href))));
 const base='speech_assets/adaptive-20261029a/',manifest=JSON.parse(fs.readFileSync(base+'manifest.json')),patch=JSON.parse(fs.readFileSync(base+'encoder.patch.json')),config=JSON.parse(fs.readFileSync(base+'config.json')),model=JSON.parse(fs.readFileSync(base+'sentence-calibration.json')),lex=core.compactLexicon(JSON.parse(fs.readFileSync(base+'phonetic-lexicon.json')));
 for(const f of manifest.files){const b=fs.readFileSync(f.url);if(f.name.endsWith('.json'))assert(!b.includes(Buffer.from('\r\n')),f.name+' must retain published LF bytes on Windows');assert.equal(b.byteLength,f.bytes);assert.equal(await assets.sha256(b),f.sha256,f.name);}
 const configFile=manifest.files.find(f=>f.name==='config.json'),windowsConfig=Buffer.from(fs.readFileSync(configFile.url,'utf8').replace(/\n/g,'\r\n')),windowsHash=await assets.sha256(windowsConfig);assert.equal(await assets.sha256(await assets.verifiedCachedAsset(windowsConfig,configFile)),configFile.sha256);assert.equal(await assets.sha256(windowsConfig),windowsHash,'Legacy text entries must stay unchanged');assert.equal(await assets.verifiedCachedAsset(Buffer.from('{}'),configFile),null);
 const original=fs.readFileSync('models/whisper-tiny.en/onnx/encoder_model_quantized.onnx'),before=await assets.sha256(original),updated=await assets.applyEncoderPatch(original,patch);assert.equal(await assets.sha256(updated),patch.resultSHA256);assert.equal(await assets.sha256(original),before,'Migration must preserve the current model cache');
 const damaged=Buffer.from(original);damaged[100]^=1;await assert.rejects(()=>assets.applyEncoderPatch(damaged,patch),/does not match/);
 await assert.rejects(()=>assets.applyEncoderPatch(original,{...patch,ops:[{copy:[original.length,10]}]}),/Invalid/);
 const total=manifest.files.reduce((s,f)=>s+f.bytes,0)+['lib/transformers.min.js','lib/wasm/ort-wasm-simd-threaded.jsep.mjs'].reduce((s,f)=>s+fs.statSync(f).size,0);assert(total<150e6);assert(manifest.files.filter(f=>!f.legacyName&&!f.name.startsWith('runtime/')).reduce((s,f)=>s+f.bytes,0)<5.3e6);
 const evidence=(text,transcript,mean=-8,gain=-1,seconds=.5)=>({transcript,words:[],audioStats:{seconds},hypothesisScores:[{text,gainFullMean:gain,actual:{fullMeanLogProb:mean}}]});
 const green=e=>core.decide(e,[.95],lex,model,config)[0].heardClear;
 assert(green(evidence('to','2')),'Numerical transcription must preserve the spoken homophone');
 assert(green(evidence('ball','bull')),'Expected near-sounding words are deliberately accepted for practice');
 assert(!green(evidence('bird','computer')),'Unrelated speech must remain uncertain');
 assert(green(evidence('it','Rit',-3.6,0)),'Unknown ASR spellings can use bounded spelling/audio evidence');
 assert(!green(evidence('it','Rit',-8,0)),'Spelling alone must not excuse weak audio evidence');
 assert(green(evidence('the','the',-8,-1,.18)),'Short words must not inherit a one-second gate');
 assert(!green(evidence('the','the',-8,-1,.05)));
 assert(core.decide(evidence('This is a pen.','This is a pen.'),[.01],lex,model,config).every(w=>!w.heardClear),'Silence guard applies even to a perfect-looking transcript');
 assert(!green(evidence('ball','',-8,-1)));
 const clear=[-1,-1,.5,.2,1,1,1,1,1,.693,0,-2,-.2,.99,.8,.9,1],unclear=[-9,-12,-2,-4,0,0,0,0,0,.693,-4,-8,-8,.1,.01,0,0];
 assert(Math.abs(core.binaryProbability(model,clear)-.9571667721712261)<1e-12);assert(Math.abs(core.binaryProbability(model,unclear)-.019895431732115065)<1e-12);assert.equal(core.binaryProbability(model,clear.slice(1)),0);
 assert.equal(lex.toString,undefined);
 console.log('Adaptive speech: verified assets, cache-preserving patch, budget, word leniency, silence/short-audio boundaries and cross-language calibration parity passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
