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
  const pu1p87Event={...event,eventId:'pu1-p87-note-study',data:{...event.data,previewNote:{...marker,id:'pu1-u7-p87',book:'PU1',unit:'7',page:'87'}}};
  response=await save([pu1p87Event]);
  ok(response.status===200 && stored.previewNotes['pu1-u7-p87'],'page 87 completion survives server normalization');
  const pu3Event={...event,eventId:'pu3-p35-note-study',data:{...event.data,previewNote:{...marker,id:'pu3-u3-p35',book:'PU3',unit:'3',page:'35'}}};
  response=await save([pu3Event],{srState:{vocab:{}},srSeq:3,srDelta:true,incrementSession:true});
  ok(response.status===200 && stored.previewNotes['pu3-u3-p35'],'page 35 completion survives server normalization');
  const pu3Count=stored.sessionCount;
  await save([pu3Event],{srState:{vocab:{}},srSeq:3,srDelta:true,incrementSession:true});
  ok(stored.sessionCount===pu3Count,'page 35 completion retry does not double-credit Study');
  const p97Event={...event,eventId:'pu3-p97-note-study',data:{...event.data,previewNote:{...marker,id:'pu3-u8-p97',book:'PU3',unit:'8',page:'97'}}};
  response=await save([p97Event],{srState:{vocab:{}},srSeq:4,srDelta:true,incrementSession:true});
  ok(response.status===200 && stored.previewNotes['pu3-u8-p97'],'page 97 completion survives server normalization');
  const p97Count=stored.sessionCount;
  await save([p97Event],{srState:{vocab:{}},srSeq:4,srDelta:true,incrementSession:true});
  ok(stored.sessionCount===p97Count,'page 97 completion retry does not double-credit Study');
  const p59Event={...event,eventId:'pu1-p59-note-study',data:{...event.data,previewNote:{...marker,id:'pu1-u5-p59',book:'PU1',unit:'5',page:'59'}}};
  response=await save([p59Event],{srState:{vocab:{}},srSeq:5,srDelta:true,incrementSession:true});
  ok(response.status===200 && stored.previewNotes['pu1-u5-p59'],'PU1 page 59 completion survives server normalization');
  const p59Count=stored.sessionCount;
  await save([p59Event],{srState:{vocab:{}},srSeq:5,srDelta:true,incrementSession:true});
  ok(stored.sessionCount===p59Count,'PU1 page 59 retry does not double-credit Study');
  const circusEvent={...event,eventId:'circus-note-study',data:{...event.data,previewNote:{...marker,id:'pu3-u1-p14',book:'PU3',unit:'1',page:'14',wordCount:27,exerciseCount:4}}};
  response=await save([circusEvent],{srState:{vocab:{}},srSeq:6,srDelta:true,incrementSession:true});
  ok(response.status===200 && stored.previewNotes['pu3-u1-p14'],'Circus Child completion survives server normalization');
  const circusCount=stored.sessionCount;
  await save([circusEvent],{srState:{vocab:{}},srSeq:6,srDelta:true,incrementSession:true});
  ok(stored.sessionCount===circusCount,'Circus Child retry does not double-credit Study');
  console.log(checks+' preview-note API checks passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
