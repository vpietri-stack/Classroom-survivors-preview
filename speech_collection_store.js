import {PLAN_ID,TASKS,validateRecord} from './speech_collection_plan.js?v=1';
export const digest=async blob=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),x=>x.toString(16).padStart(2,'0')).join('');
let opening;
function db(){return opening||(opening=new Promise((resolve,reject)=>{const req=indexedDB.open('speech-word-collection-v1',1),timer=setTimeout(()=>reject(Error('Browser storage did not open. Please keep this page open and download a backup.')),8000);req.onupgradeneeded=()=>{req.result.createObjectStore('clips',{keyPath:'id'});req.result.createObjectStore('meta');};req.onsuccess=()=>{clearTimeout(timer);resolve(req.result);};req.onerror=()=>{clearTimeout(timer);reject(req.error);};}));}
async function transaction(store,mode,fn){const database=await db();return new Promise((resolve,reject)=>{let result;const tx=database.transaction(store,mode);fn(tx.objectStore(store),v=>{result=v;});tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Storage save was interrupted'));});}
export const getRecords=()=>transaction('clips','readonly',(s,set)=>{const r=s.getAll();r.onsuccess=()=>set(r.result);});
export const getMeta=()=>transaction('meta','readonly',(s,set)=>{const r=s.get('settings');r.onsuccess=()=>set(r.result||{});});
export const setMeta=value=>transaction('meta','readwrite',s=>s.put(value,'settings'));
export async function saveRecord(record){validateRecord(record);await checkAudio(record);await transaction('clips','readwrite',s=>s.add(record));}
export async function checkAudio(record){
 const b=await record.blob.arrayBuffer(),v=new DataView(b),str=(i,n)=>String.fromCharCode(...new Uint8Array(b,i,n));
 if(str(0,4)!=='RIFF'||str(8,4)!=='WAVE'||str(12,4)!=='fmt '||v.getUint32(16,true)!==16||v.getUint16(20,true)!==1||v.getUint16(22,true)!==1||v.getUint32(24,true)!==16000||v.getUint16(34,true)!==16||str(36,4)!=='data'||v.getUint32(40,true)!==b.byteLength-44)throw Error('Expected a mono 16 kHz PCM WAV recording');
 if(await digest(record.blob)!==record.sha256)throw Error('Recording checksum does not match');
}
function encode(bytes){let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text);}
export async function backup(records){const clips=[];for(const record of records){validateRecord(record);await checkAudio(record);const {blob,...meta}=record;clips.push({...meta,audioBase64:encode(new Uint8Array(await blob.arrayBuffer()))});}return {schema:'teacher_word_collection_v1',planId:PLAN_ID,createdAt:new Date().toISOString(),purpose:'adult_development_and_stress_tests_not_child_validation',clips};}
export async function unpack(data){
 if(data.schema!=='teacher_word_collection_v1'||data.planId!==PLAN_ID||!Array.isArray(data.clips)||data.clips.length>1000)throw Error('This is not a supported collection backup');
 const out=[],ids=new Set();let total=0;
 for(const clip of data.clips){if(typeof clip.audioBase64!=='string'||clip.audioBase64.length>854000)throw Error('Recording is too large');const {audioBase64,...meta}=clip;const bytes=Uint8Array.from(atob(audioBase64),c=>c.charCodeAt(0));total+=bytes.length;if(total>75000000)throw Error('Backup audio exceeds the 75 MB collection limit');const r={...meta,blob:new Blob([bytes],{type:'audio/wav'})};validateRecord(r);await checkAudio(r);if(ids.has(r.id))throw Error('Duplicate recording ID in backup');ids.add(r.id);out.push(r);}
 return out;
}
export async function importBackup(data){const records=await unpack(data),existing=await getRecords(),known=new Map(existing.map(r=>[r.id,r]));let count=0;
 const identity=r=>JSON.stringify([r.sha256,r.taskId,r.target,r.phase,r.family,r.split,r.spoken,r.label,r.notes,r.speaker,r.device,r.createdAt]);
 for(const r of records){const old=known.get(r.id);if(old&&identity(old)!==identity(r))throw Error('A recording ID conflicts with an existing take. Nothing was imported.');if(!old)count++;}
 if(existing.length+count>1000)throw Error('Collection limit: 1,000 takes');
 await transaction('clips','readwrite',s=>{for(const r of records)if(!known.has(r.id))s.add(r);});return count;
}
export function coverage(records){const completed=new Set(records.map(r=>r.taskId));return {takes:records.length,prompts:completed.size,total:TASKS.length,bytes:records.reduce((n,r)=>n+r.blob.size,0),byPhase:Object.fromEntries([...new Set(TASKS.map(t=>t.phase))].map(p=>[p,TASKS.filter(t=>t.phase===p&&completed.has(t.id)).length]))};}
