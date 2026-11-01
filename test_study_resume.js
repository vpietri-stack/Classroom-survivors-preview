const assert=require('assert'),{HttpRequest}=require('./api/node_modules/@azure/functions');
const auth=require('./api/src/functions/shared/auth'),core=require('./api/src/functions/shared/studyResumeCore');
const {makeHandler}=require('./api/src/functions/studyResume');
process.env.SESSION_SECRET='study-resume-unit-only';delete process.env.APP_API_KEY;let count=0,writes=0,etag=0;const docs=new Map(),profiles=new Map();
const ok=(v,s)=>{assert.ok(v,s);count++;console.log('PASS '+s);};
const store={item(id,pk){return{read:async()=>{const d=docs.get(pk);if(!d)throw{code:404};return{resource:structuredClone(d)};},replace:async(d,o)=>{const old=docs.get(pk);if(o.accessCondition.condition!==old._etag)throw{code:412};writes++;d._etag=String(++etag);docs.set(pk,structuredClone(d));return{resource:d};}}},items:{create:async d=>{if(docs.has(d.studentId))throw{code:409};d._etag=String(++etag);docs.set(d.studentId,structuredClone(d));writes++;return{resource:d};}}};
const handler=makeHandler(()=>store,async id=>profiles.get(id)||{},()=>true),disabled=makeHandler(()=>store,async()=>({}),()=>false);
const token=(id,role='student')=>auth.signToken({sub:id,role},process.env.SESSION_SECRET);
async function call(method,body,who='student_a',query='',h=handler){return h(new HttpRequest({method,url:'http://localhost/api/studyResume'+query,headers:{Origin:'http://localhost:8888',...(who?{'X-Auth-Token':token(who,who==='teacher'?'admin':'student')}:{})},body:body?{string:JSON.stringify(body)}:undefined}),{warn(){}});}
function snap(run='run_a',writer='writer_a',seq=1,known=[]){return{schema:1,owner:'student_a',runId:run,writerId:writer,seq,createdAt:Date.now(),updatedAt:Date.now(),knownCompletions:known,state:{round:'C',words:['want'],sentences:['I want a pen.'],currentWordIndex:0},elapsedMs:20,exercise:{attempts:1,elapsedMs:20},ui:{cSlots:[],cBank:[]},srResults:[],usedPairKeys:[]};}
(async()=>{
 ok((await call('GET',null,null)).status===401,'authentication required even in legacy mode');
 ok((await call('GET',null,'student_a','?studentId=student_b')).status===403,'another student cannot read the checkpoint');
 ok(!(await call('GET',null,'student_a','',disabled)).jsonBody.enabled,'backend remains disabled until preview configuration enables it');
 let s=snap();ok(core.validate(s,'student_a'),'valid versioned snapshot accepted');
 ok(!core.validate({...s,owner:'student_b'},'student_a'),'owner mismatch rejected');
 ok(core.validate({...s,owner:'student_小明@example.cn'},'student_小明@example.cn'),'Chinese and email-style account identifiers remain supported');
 ok(!core.validate({...s,unexpected:'secret'},'student_a'),'unknown top-level fields rejected');
 ok(!core.validate({...s,ui:{text:'<img src=x onerror=alert(1)>'}},'student_a'),'untrusted markup rejected');
 ok(!core.validate({...s,ui:{password:'secret'}},'student_a'),'credentials cannot enter saved state');
 ok(!core.validate({...s,srResults:new Array(201).fill({})},'student_a'),'unbounded result history rejected');
 ok((await call('POST',{action:'begin',runId:s.runId,baseVersion:0,snapshot:s})).status===200,'initial checkpoint stored');
 const before=writes;await call('POST',{action:'checkpoint',runId:s.runId,snapshot:s});ok(writes===before,'identical save retry does not rewrite data');
 s={...s,seq:2};ok((await call('POST',{action:'checkpoint',runId:s.runId,snapshot:s})).status===200,'new revision accepted for the current writer');
 const other={...s,seq:3,writerId:'writer_b'};ok((await call('POST',{action:'checkpoint',runId:s.runId,snapshot:other})).status===409,'another page cannot overwrite the active writer');
 ok((await call('POST',{action:'claim',runId:s.runId,baseVersion:1,snapshot:other})).status===409,'stale takeover requires a fresh checkpoint version');
 const v=(await call('GET')).jsonBody.version;ok((await call('POST',{action:'claim',runId:s.runId,baseVersion:v,snapshot:other})).status===200,'explicit continuation can claim the current checkpoint');
 ok((await call('POST',{action:'checkpoint',runId:s.runId,snapshot:{...s,seq:4}})).status===409,'old page loses write ownership after continuation elsewhere');
 const profile={};core.completion(profile,[{type:'session',sessionType:'study',eventId:'done',timestamp:new Date().toISOString(),data:{studyRunId:s.runId}}],['done']);profiles.set('student_a',profile);
 ok(!(await call('GET')).jsonBody.snapshot,'accepted completion hides a stale pending checkpoint');
 ok((await call('POST',{action:'claim',runId:s.runId,baseVersion:v,snapshot:other})).status===410,'a completed session cannot be resurrected');
 let newer=snap('run_new','writer_c',1,[s.runId]);ok((await call('POST',{action:'begin',runId:newer.runId,baseVersion:0,supersedesRunId:s.runId,snapshot:newer})).status===200,'new Study can replace an earlier unfinished session');
 ok((await call('POST',{action:'complete',runId:newer.runId})).status===200,'completion creates a durable tombstone');
 ok(!(await call('GET')).jsonBody.snapshot,'completed Study has no resume offer');
 const next=snap('run_next','writer_c',1,[s.runId,newer.runId]);ok((await call('POST',{action:'begin',runId:next.runId,baseVersion:0,snapshot:next})).status===200,'a lost completion acknowledgement cannot block the next Study');
 const oldMarker=profile.studyRecoveryCompletion;core.completion(profile,[{type:'session',sessionType:'study',eventId:'duplicate',timestamp:new Date().toISOString(),data:{studyRunId:'wrong'}}],[]);ok(profile.studyRecoveryCompletion===oldMarker,'duplicate events do not change the completion receipt');
 const legacy={};core.completion(legacy,[{type:'session',sessionType:'study',eventId:'legacy_study',timestamp:new Date().toISOString(),data:{}}],['legacy_study']);ok(legacy.studyRecoveryCompletion.runId==='legacy_study','a completed Study from an older client also clears an earlier resume offer');
 console.log('Study resume API/core: '+count+' checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
