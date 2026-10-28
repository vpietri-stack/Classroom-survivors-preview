// Public, pinned model assets only. No recording or user information is sent.
export const REVISION='a6da1241cd305dcd64eab1edbd615f2bb9aabb95';
const REPO_REVISION='91668a78eee4a469082d9594cf846e13e13abef6';
const CHUNK=262144;
export async function prepareMoonshine(progress,options={}){
 const fetcher=options.fetch||globalThis.fetch.bind(globalThis),base=options.base||new URL('./models/moonshine-tiny-poc/',import.meta.url).href;
 const manifest=await (await fetcher(base+'manifest.json')).json();
 if(manifest.revision!==REVISION)throw Error('Unexpected Moonshine asset revision');
 let cache=null;try{cache=await caches.open('single-word-moonshine-pinned-v1');}catch(_){}
 const local=options.local??['localhost','127.0.0.1'].includes(new URL(base).hostname);
 const sources=options.sources||[
  'https://raw.githubusercontent.com/vpietri-stack/Classroom-survivors-preview/'+REPO_REVISION+'/models/moonshine-tiny-poc/',
  'https://gh-proxy.com/https://raw.githubusercontent.com/vpietri-stack/Classroom-survivors-preview/'+REPO_REVISION+'/models/moonshine-tiny-poc/',
  'https://hf-mirror.com/onnx-community/moonshine-tiny-ONNX/resolve/'+REVISION+'/',
  'https://huggingface.co/onnx-community/moonshine-tiny-ONNX/resolve/'+REVISION+'/',base
 ];
 if(local&&!options.sources)sources.unshift(base);
 const unhealthy=new Set();let preferred=null;
 let done=0;const total=manifest.files.reduce((s,f)=>s+f.bytes,0),buffers=new Map();
 const notify=stage=>progress({downloaded:done,total,progress:Math.round(done/total*100),stage});
 for(const file of manifest.files){
  const bytes=new Uint8Array(file.bytes),count=Math.ceil(file.bytes/CHUNK);let next=0;
  async function part(){while(next<count){const index=next++,start=index*CHUNK,end=Math.min(file.bytes,start+CHUNK)-1,length=end-start+1;
   const key=base+'__chunks__/'+file.sha256+'/'+start;let data;
   try{const saved=await cache?.match(key);if(saved){const b=await saved.arrayBuffer();if(b.byteLength===length)data=b;}}catch(_){}
   if(!data){let last;
    for(const source of [...new Set([preferred,...sources])].filter(s=>s&&!unhealthy.has(s))){const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),20000);
     try{
      notify('Downloading '+file.file+' via '+new URL(source).hostname);
      // Separate URLs prevent intermediary caches from confusing different ranges.
      const response=await fetcher(source+file.file+'?part='+start+'-'+end,{headers:{Range:`bytes=${start}-${end}`},signal:ctrl.signal});
      if(!response.ok||(response.status!==206&&length!==file.bytes)){await response.body?.cancel();throw Error('This host does not support resumed downloads');}
      const range=response.headers.get('Content-Range');if(range&&range!==`bytes ${start}-${end}/${file.bytes}`)throw Error('Host returned the wrong model segment');
      const b=await response.arrayBuffer();if(b.byteLength!==length)throw Error('Incomplete model download');data=b;preferred=source;break;
     }catch(e){last=e;unhealthy.add(source);}finally{clearTimeout(timer);}
    }
    if(!data)throw Error('Model download stalled on all routes. Completed chunks are saved; retry to resume. '+String(last?.message||''));
    try{await cache?.put(key,new Response(data.slice(0)));}catch(_){}
   }
   bytes.set(new Uint8Array(data),start);done+=length;notify('Downloading '+file.file);
  }}
  await Promise.all(Array.from({length:Math.min(4,count)},()=>part()));
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
  if(hash!==file.sha256){try{const keys=await cache?.keys();for(const key of keys||[])if(key.url.includes(file.sha256))await cache.delete(key);}catch(_){}throw Error('Downloaded model checksum did not match. Please retry.');}
  buffers.set(file.file,bytes);
 }
 notify('Model files ready. Preparing Moonshine…');return {base,buffers};
}
