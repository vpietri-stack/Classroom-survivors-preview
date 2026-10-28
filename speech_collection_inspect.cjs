// Usage: node speech_collection_inspect.cjs /private/path/collection-backup.json
// Validates all takes; prepares DEVELOPMENT inputs only. It never runs a model.
const fs=require('fs'),path=require('path'),{pathToFileURL}=require('url');
(async()=>{
 const input=process.argv[2];if(!input)throw Error('Give the downloaded collection JSON file as the first argument.');
 if(fs.statSync(input).size>100000000)throw Error('Backup exceeds 100 MB.');
 const {unpack,coverage}=await import(pathToFileURL(path.join(__dirname,'speech_collection_store.js')).href);
 const records=await unpack(JSON.parse(fs.readFileSync(input,'utf8'))),development=records.filter(r=>r.split==='development');
 const out=path.join(__dirname,'.hermes','word-collection',require('crypto').randomUUID());fs.mkdirSync(out,{recursive:true});
 const manifest=[];for(const r of development){const filename=r.id+'.wav';fs.writeFileSync(path.join(out,filename),Buffer.from(await r.blob.arrayBuffer()),{flag:'wx'});const {blob,...meta}=r;manifest.push({...meta,audioFile:filename,cohort:'adult_teacher',condition:r.phase==='accent'?'simulated_accent_stress':r.phase});}
 fs.writeFileSync(path.join(out,'development-manifest.json'),JSON.stringify({schema:'teacher_word_development_v1',sourceBackup:path.basename(input),records:manifest},null,2),{flag:'wx'});
 const counts=coverage(records);console.log(JSON.stringify({validatedTakes:records.length,completedPrompts:counts.prompts,developmentTakes:development.length,reservedTakesNotPrepared:records.length-development.length,outputDirectory:out,modelInferences:0},null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
