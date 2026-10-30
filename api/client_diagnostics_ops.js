// Operator-only controls. Explicit database required; never changes Students.
const fs = require('fs');
const { CosmosClient } = require('@azure/cosmos');
const cfg = require('./local.settings.json').Values;
function arg(k) { const i = process.argv.indexOf(k); return i < 0 ? '' : process.argv[i+1]; }
(async () => {
    const database = arg('--database'), action = arg('--action') || 'status';
    if (!database || !['status','enable-all','stop-all'].includes(action)) throw Error('Use --database <name> --action status|enable-all|stop-all');
    const client = new CosmosClient({ endpoint: cfg.COSMOS_ENDPOINT, key: cfg.COSMOS_KEY, connectionPolicy: { requestTimeout: 20000 } });
    const c = client.database(database).container('client_diagnostics');
    if (action !== 'status') {
        const days = Math.max(1,Math.min(Number(arg('--days')) || 7,14));
        await c.items.upsert({ id:'config', studentId:'_global', type:'client_diagnostics_config', scope:'all_students',
            enabled:action==='enable-all', paused:action==='stop-all', endsAt:new Date(Date.now()+days*86400000).toISOString(),
            updatedAt:new Date().toISOString(), ttl:-1 });
    }
    let policy=null; try { policy=(await c.item('config','_global').read()).resource; } catch(e) { if(e.code!==404)throw e; }
    const since=new Date(Date.now()-86400000).toISOString();
    const {resources:usage}=await c.items.query({query:"SELECT c.studentId,c.batches,c.events,c.bytes,c.day FROM c WHERE c.type='client_diagnostics_usage' AND c.updatedAt>=@since",parameters:[{name:'@since',value:since}]}).fetchAll();
    const {resources:heartbeats}=await c.items.query({query:"SELECT c.studentId,c.browserId,e.boot,e.ts,e.detail FROM c JOIN e IN c.events WHERE c.type='client_diagnostics_chunk' AND c.updatedAt>=@since AND e.type='heartbeat'",parameters:[{name:'@since',value:since}]}).fetchAll();
    const latest=new Map();
    for(const e of heartbeats){const k=e.studentId+'/'+e.browserId+'/'+e.boot;if(!latest.has(k)||latest.get(k).ts<e.ts)latest.set(k,e);}
    const measured={boots:0,uploads:0,failures:0,http429:0,readRU:0,writeRU:0,storageWrites:0,storageMs:0,maxStorageMs:0,maxLagMs:0,queueDropped:0};
    for(const e of latest.values()){let m;try{m=JSON.parse(e.detail).diagnostics;}catch(_){}if(!m)continue;measured.boots++;
        for(const k of ['uploads','failures','http429','readRU','writeRU','storageWrites','storageMs','queueDropped'])measured[k]+=Number(m[k])||0;
        for(const k of ['maxStorageMs','maxLagMs'])measured[k]=Math.max(measured[k],Number(m[k])||0);
    }
    const result={database,policy:policy&&{enabled:policy.enabled,endsAt:policy.endsAt,scope:policy.scope},since,
        activeAccounts:new Set(usage.map(u=>u.studentId)).size,reservedBatches:usage.reduce((s,u)=>s+u.batches,0),
        reservedEvents:usage.reduce((s,u)=>s+u.events,0),reservedBytes:usage.reduce((s,u)=>s+u.bytes,0),measured,
        note:'RU/performance values are uploaded heartbeat samples, not an invoice or complete native-memory measurement. Final unsent samples may be absent; quota counters include reservations/retries.'};
    if(arg('--out'))fs.writeFileSync(arg('--out'),JSON.stringify(result,null,2));
    console.log(JSON.stringify(result,null,2));
})().catch(e=>{console.error('Diagnostics operations failed:',e.code||e.message);process.exitCode=1});
