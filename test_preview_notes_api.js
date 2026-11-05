'use strict';
const assert = require('node:assert/strict');
const Module = require('node:module');
let handler, checks = 0, race = false, writes = 0;
let stored = { id:'notes-api-fixture',studentId:'notes-api-fixture',_etag:'1',analytics:[],sessionCount:0 };
const container = {
  items: { query: () => ({ fetchAll: async () => ({ resources:[structuredClone(stored)] }) }), upsert:async()=>({}),create:async()=>({}) },
  item: () => ({
    read: async () => ({ resource:structuredClone(stored) }),
    replace: async (value, options) => {
      writes++;
      if (race) { race=false;stored._etag='2';stored.otherField='preserved';throw Object.assign(new Error('etag race'),{code:412}); }
      assert.equal(options.accessCondition.condition,stored._etag);
      stored=structuredClone(value); stored._etag=String(Number(stored._etag)+1); return { requestCharge:1 };
    }
  })
};
const original = Module._load;
Module._load = function (name,parent,main) {
  if (name==='@azure/functions') return {app:{http:(_name,options)=>{handler=options.handler;}}};
  if (parent?.filename.endsWith('saveAnalytics.js')) {
    if (name==='./shared/db') return {getContainer:()=>container};
    if (name==='./shared/validateApiKey') return {validateApiKey:()=>true};
    if (name==='./shared/auth') return {requireAuth:()=>({token:{sub:'notes-api-fixture',role:'student'}})};
  }
  return original.call(this,name,parent,main);
};
require('./api/src/functions/saveAnalytics'); Module._load=original;
const marker={id:'pu3-u9-p111',book:'PU3',unit:'9',page:'111',version:1,wordCount:5,exerciseCount:5};
const event={type:'session',sessionType:'study',eventId:'note-study',timestamp:new Date().toISOString(),data:{durationMs:100000,previewNote:marker}};
const context={log(){},warn(){},error(...a){console.error(...a);}};
function ok(condition,label){assert.ok(condition,label);checks++;}
async function save(events,extra={}) {
 return handler({json:async()=>({studentId:'ignored-body-identity',events,...extra}),headers:{get:()=>''}},context);
}
(async()=>{
  race=true;
  let response=await save([event],{srState:{vocab:{bored:{lastResult:'success',interval:2,lastSession:0}}},srSeq:1,srDelta:true,incrementSession:true});
  ok(response.status===200,'real handler accepts regular Study completion');
  ok(writes===2 && stored.otherField==='preserved','completion survives etag retry without losing concurrent data');
  ok(stored.previewNotes['pu3-u9-p111'] && stored.analytics.length===1,'completion map and one regular session saved atomically');
  ok(stored.sessionCount===1 && stored.srState.vocab.bored.lastResult==='success','normal session count and SR delta saved');
  response=await save([event],{srState:{vocab:{}},srSeq:1,srDelta:true,incrementSession:true});
  ok(stored.sessionCount===1 && stored.analytics.length===1 && response.jsonBody.duplicateEventIds.includes('note-study'),'retries do not double-count session/target credit');
  const timestamp=stored.previewNotes['pu3-u9-p111'].completedAt;
  stored.analytics=[];
  await save([{type:'device',eventId:'later',timestamp:new Date().toISOString()}]);
  ok(stored.previewNotes['pu3-u9-p111'].completedAt===timestamp,'archived analytics do not remove persistent note completion');
  const pu1Event={...event,eventId:'pu1-note-study',data:{...event.data,previewNote:{...marker,id:'pu1-u7-p85',book:'PU1',unit:'7',page:'85'}}};
  response=await save([pu1Event],{srState:{vocab:{}},srSeq:2,srDelta:true,incrementSession:true});
  ok(response.status===200 && stored.previewNotes['pu1-u7-p85'] && stored.previewNotes['pu3-u9-p111'],'new page 85 completion coexists with existing notes');
  const pu1Count=stored.sessionCount;
  await save([pu1Event],{srState:{vocab:{}},srSeq:2,srDelta:true,incrementSession:true});
  ok(stored.sessionCount===pu1Count && stored.analytics.filter(e=>e.eventId==='pu1-note-study').length===1,'new lesson retry does not double-credit Study');
  const pu3Event={...event,eventId:'pu3-p35-note-study',data:{...event.data,previewNote:{...marker,id:'pu3-u3-p35',book:'PU3',unit:'3',page:'35'}}};
  response=await save([pu3Event],{srState:{vocab:{}},srSeq:3,srDelta:true,incrementSession:true});
  ok(response.status===200 && stored.previewNotes['pu3-u3-p35'],'page 35 completion survives server normalization');
  const pu3Count=stored.sessionCount;
  await save([pu3Event],{srState:{vocab:{}},srSeq:3,srDelta:true,incrementSession:true});
  ok(stored.sessionCount===pu3Count,'page 35 completion retry does not double-credit Study');
  console.log(checks+' preview-note API checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
