// Public model assets only. This module never receives a recording or account ID.
export const ASSET_ID='speech-encouragement-20261029-a';
const CHUNK=262144,assetBase=new URL('./speech_assets/adaptive-20261029a/',import.meta.url),appBase=new URL('./',import.meta.url);
export async function sha256(buffer){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),n=>n.toString(16).padStart(2,'0')).join('');}
export async function verifiedCachedAsset(buffer,file){
 if(!buffer)return null;const bytes=buffer instanceof Uint8Array?buffer:new Uint8Array(buffer);
 if(bytes.byteLength===file.bytes&&await sha256(bytes)===file.sha256)return bytes;
 // Some Windows development caches contain CRLF JSON. Verify its canonical
 // published bytes without mutating or replacing the original legacy entry.
 if(file.name.endsWith('.json')){const canonical=new TextEncoder().encode(new TextDecoder().decode(bytes).replace(/\r\n/g,'\n'));if(canonical.byteLength===file.bytes&&await sha256(canonical)===file.sha256)return canonical;}
 return null;
}
async function legacyFile(name){
 try{return await new Promise(resolve=>{const request=indexedDB.open('whisper-model-cache',1);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains('files'))request.result.createObjectStore('files',{keyPath:'name'});};request.onerror=()=>resolve(null);request.onsuccess=()=>{const db=request.result;if(!db.objectStoreNames.contains('files')){db.close();return resolve(null);}const tx=db.transaction('files','readonly'),get=tx.objectStore('files').get('whisper-tiny.en-model-v1/'+name);get.onsuccess=()=>resolve(get.result?.data||null);get.onerror=()=>resolve(null);tx.oncomplete=()=>db.close();tx.onabort=()=>{db.close();resolve(null);};};});}catch(_){return null;}
}
export async function applyEncoderPatch(base,patch){
 if(patch.schema!==1||base.byteLength!==patch.baseBytes||patch.resultBytes>16*1024*1024||patch.ops.length>64||await sha256(base)!==patch.baseSHA256)throw Error('Cached encoder does not match this update');
 const original=new Uint8Array(base),out=new Uint8Array(patch.resultBytes);let offset=0;
 for(const op of patch.ops){let part;if(op.copy){const [start,length]=op.copy;if(!Number.isInteger(start)||!Number.isInteger(length)||start<0||length<0||start+length>original.length)throw Error('Invalid encoder update');part=original.subarray(start,start+length);}else{const text=atob(op.data);part=Uint8Array.from(text,c=>c.charCodeAt(0));}if(offset+part.length>out.length)throw Error('Invalid encoder update size');out.set(part,offset);offset+=part.length;}
 if(offset!==out.length||await sha256(out)!==patch.resultSHA256)throw Error('Encoder update did not verify');return out;
}
function sources(file,preferLocal=false){
 const local=new URL(file.url,appBase).href,host=appBase.hostname,repo=appBase.pathname.split('/').filter(Boolean)[0],owner=host.endsWith('.github.io')?host.slice(0,-10):null,raw=owner&&repo?'https://raw.githubusercontent.com/'+owner+'/'+repo+'/main/'+file.url:null;
 const mirrors=raw?['https://gh-proxy.com/'+raw,raw]:[];
 const modelScope=file.legacyName&&file.name.endsWith('.onnx')?'https://modelscope.cn/models/Xenova/whisper-tiny.en/resolve/master/'+file.name.slice('whisper/'.length):null;
 return [...new Set((preferLocal||['localhost','127.0.0.1'].includes(host)?[local,modelScope,...mirrors]:[modelScope,local,...mirrors]).filter(Boolean))];
}
export async function prepareAdaptiveAssets(progress=()=>{},options={}){
 const fetcher=options.fetch||globalThis.fetch.bind(globalThis),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);let manifest;
 try{const response=await fetcher(new URL('manifest.json?v=2',assetBase),{signal:controller.signal});if(!response.ok)throw Error('Speech asset list unavailable');manifest=await response.json();}finally{clearTimeout(timer);}
 if(manifest.schema!==1||manifest.id!==ASSET_ID)throw Error('Unexpected speech assets');
 let cache;try{cache=await caches.open('speech-adaptive-assets-v1');}catch(_){}
 const buffers=new Map(),total=manifest.files.reduce((sum,f)=>sum+f.bytes,0);let done=0,networkBytes=0,reusedBytes=0;
 const notify=stage=>progress({stage,downloaded:done,total,networkBytes,reusedBytes,progress:Math.round(done/total*100)});
 for(const file of manifest.files){
  const key=new URL('__files__/'+file.sha256,assetBase).href;let data;
  try{const saved=await cache?.match(key);if(saved)data=await verifiedCachedAsset(await saved.arrayBuffer(),file);}catch(_){}
  if(!data&&file.legacyName)data=await verifiedCachedAsset(await legacyFile(file.legacyName),file);
  if(data){done+=file.bytes;reusedBytes+=file.bytes;notify('Reusing saved speech files');}
  else{
   const bytes=new Uint8Array(file.bytes),count=Math.ceil(file.bytes/CHUNK),routes=options.sources?.(file)||sources(file,options.preferLocal),unhealthy=new Set();let next=0;
   async function part(){while(next<count){const start=next++*CHUNK,end=Math.min(file.bytes,start+CHUNK)-1,length=end-start+1,chunkKey=new URL('__chunks__/'+file.sha256+'/'+start,assetBase).href;let chunk;
    try{const saved=await cache?.match(chunkKey);if(saved){const b=await saved.arrayBuffer();if(b.byteLength===length){chunk=b;reusedBytes+=length;}}}catch(_){}
    if(!chunk){let error;
     for(const url of routes.filter(r=>!unhealthy.has(r))){const ctrl=new AbortController(),clock=setTimeout(()=>ctrl.abort(),20000);
      try{notify('Downloading '+file.name);const response=await fetcher(url+'?part='+start+'-'+end,{headers:{Range:`bytes=${start}-${end}`},signal:ctrl.signal});if(!response.ok||response.status!==206&&length!==file.bytes){await response.body?.cancel();throw Error('Download route cannot resume');}const range=response.headers.get('Content-Range');if(range&&range!==`bytes ${start}-${end}/${file.bytes}`)throw Error('Wrong download segment');const b=await response.arrayBuffer();if(b.byteLength!==length)throw Error('Incomplete download');chunk=b;networkBytes+=length;break;}catch(e){error=e;unhealthy.add(url);}finally{clearTimeout(clock);}
     }
     if(!chunk)throw Error('Speech download stopped. Saved parts will resume on Retry. '+String(error?.message||''));
     try{await cache?.put(chunkKey,new Response(chunk.slice(0)));}catch(_){}
    }
    bytes.set(new Uint8Array(chunk),start);done+=length;notify('Downloading '+file.name);
   }}
   await Promise.all(Array.from({length:Math.min(4,count)},()=>part()));
   if(await sha256(bytes)!==file.sha256){try{for(const request of await cache?.keys()||[])if(request.url.includes(file.sha256))await cache.delete(request);}catch(_){}throw Error('Speech file did not verify. Retry will download a fresh copy.');}data=bytes;
  }
  buffers.set(file.name,data);try{await cache?.put(key,new Response(data.slice(0)));}catch(_){}
 }
 const parse=name=>JSON.parse(new TextDecoder().decode(buffers.get(name))),patch=parse('encoder.patch.json');
 buffers.set('whisper/onnx/encoder_model_quantized.onnx',await applyEncoderPatch(buffers.get('whisper/onnx/encoder_model_quantized.onnx'),patch));
 notify('Speech files ready. Preparing the model…');
 return {buffers,config:parse('config.json'),calibration:parse('sentence-calibration.json'),lexicon:parse('phonetic-lexicon.json'),networkBytes,reusedBytes,total,whisperBase:new URL('models/whisper-tiny.en/',appBase).href,vadBase:new URL('models/silero-vad-v5/',appBase).href};
}
