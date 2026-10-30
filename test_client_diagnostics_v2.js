const assert=require('assert');
const {HttpRequest}=require('./api/node_modules/@azure/functions');
const auth=require('./api/src/functions/shared/auth');
const {makeHandler,sanitizeEvent,redact,effectiveConfig,DAILY_BATCH_LIMIT}=require('./api/src/functions/clientDiagnostics');
process.env.SESSION_SECRET='local-diagnostics-unit-test-only';process.env.REQUIRE_AUTH='false';delete process.env.APP_API_KEY;
let checks=0,writes=0,throttle=false;
function check(v,s){assert.ok(v,s);checks++;console.log('PASS: '+s);}
const docs=new Map();
const db={item(id,pk){return {
 async read(){const d=docs.get(pk+'/'+id);if(!d)throw {code:404,requestCharge:1};return {resource:structuredClone(d),requestCharge:1};},
 async patch(ops){const d=docs.get(pk+'/'+id);if(d.batches>=DAILY_BATCH_LIMIT)throw {code:412};for(const o of ops){const k=o.path.slice(1);d[k]=o.op==='incr'?d[k]+o.value:o.value;}writes++;return {resource:structuredClone(d),requestCharge:5};}
};},items:{
 async create(d){if(throttle){throttle=false;throw {code:429,retryAfterInMs:100};}const k=d.studentId+'/'+d.id;if(docs.has(k))throw {code:409};docs.set(k,structuredClone(d));writes++;return {resource:structuredClone(d),requestCharge:5};},
 async upsert(d){docs.set(d.studentId+'/'+d.id,structuredClone(d));writes++;return {resource:structuredClone(d),requestCharge:5};},
 query(q,opts){const type=q.query.includes("'client_diagnostics_chunk'")?'client_diagnostics_chunk':q.query.includes("'client_diagnostics_day'")?'client_diagnostics_day':'client_diagnostics_usage';const rows=[...docs.values()].filter(d=>d.studentId===opts.partitionKey&&d.type===type).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return {fetchAll:async()=>({resources:rows}),fetchNext:async()=>({resources:opts.continuationToken?rows.slice(20,40):rows.slice(0,20),continuationToken:!opts.continuationToken&&rows.length>20?'next-page':undefined})};}
}};
let handler=makeHandler(()=>db);
const token=(sub,role='student')=>auth.signToken({sub,role},process.env.SESSION_SECRET);
const student=token('student_test_diag'),other=token('student_other_diag'),teacher=token('teacher_test_diag','BM'),admin=token('admin_test_diag','admin');
async function call(method,who,body,query=''){const headers={Origin:'http://localhost:8888'};if(who)headers['X-Auth-Token']=who;if(body)headers['Content-Type']='application/json';return handler(new HttpRequest({method,url:'http://localhost/api/clientDiagnostics'+query,headers,body:body?{string:JSON.stringify(body)}:undefined}),{warn(){}});}
const event=(seq=1)=>({boot:'test_boot',seq,ts:new Date().toISOString(),type:'error',context:{word:'want',password:'never-store',practiceRunId:'run_test'},detail:'password=secret authToken=hidden https://example.test/a?token=private'});
const payload=seq=>({browserId:'browser_test',device:{ua:'test',token:'never-store'},events:[event(seq)]});
(async()=>{
 check((await call('GET')).status===401,'signed token required even with legacy auth disabled');
 check((await call('GET',student,null,'?studentId=student_other_diag')).status===403,'students cannot read another account');
 check((await call('GET',student,null,'?view=events')).status===403,'students cannot read raw logs');
 check((await call('POST',student,{action:'configure',enabled:true})).status===403,'students cannot enable capture');
 check(!(await call('GET',student)).jsonBody.enabled,'defaults off before rollout');
 check((await call('POST',teacher,{action:'configureGlobal',enabled:true})).status===403,'only admin can enable all-student rollout');
 await call('POST',admin,{action:'configureGlobal',enabled:true,days:7});
 check((await call('GET',student)).jsonBody.enabled&&(await call('GET',other)).jsonBody.enabled,'seven-day global policy enables student accounts');
 const first=await call('POST',student,payload(1)),chunk=[...docs.values()].find(d=>d.type==='client_diagnostics_chunk');
 check(first.jsonBody.ack[0]==='test_boot:1'&&first.jsonBody.metrics.writeRU>0,'stored upload acknowledges event and measured RU');
 check(chunk.studentId==='student_test_diag'&&!chunk.device.token&&chunk.ttl===14*86400,'chunk is owner-scoped, restricted and expires after fourteen days');
 check(!JSON.stringify(chunk).includes('secret')&&!JSON.stringify(chunk).includes('hidden')&&!JSON.stringify(chunk).includes('never-store'),'server sanitizes secrets and unsupported context');
 check(chunk.events[0].context.practiceRunId==='run_test','run correlation survives sanitization');
 const before=writes;await call('POST',student,payload(1));check(writes===before,'lost-ack replay neither rewrites data nor spends another quota reservation');
 for(let i=2;i<=45;i++)await call('POST',student,{...payload(i),events:Array.from({length:40},(_,j)=>event(i*40+j))});
 check([...docs.values()].filter(d=>d.type==='client_diagnostics_chunk').length===45,'later uploads retain earlier chunks without a daily-tail rewrite');
 check([...docs.values()].filter(d=>d.type==='client_diagnostics_chunk').reduce((n,d)=>n+d.events.length,0)===1761,'more than one thousand events retain the earlier practice');
 const invalidAt=writes;check((await call('POST',student,{...payload(46),events:[event(46),{...event(47),type:'session'}]})).status===400&&writes===invalidAt,'invalid batches write nothing');
 check((await call('POST',student,{...payload(46),noise:'x'.repeat(25000)})).status===413,'oversized payload refused');
 docs.set('student_test_diag/old_day',{id:'old_day',studentId:'student_test_diag',type:'client_diagnostics_day',events:[sanitizeEvent(event(900))],device:{},browserId:'old',updatedAt:new Date().toISOString()});
 const history=(await call('GET',teacher,null,'?studentId=student_test_diag&view=events')).jsonBody;
 check(history.days.length===21&&history.cursor==='next-page','history combines legacy records and bounded chunk page');
 check((await call('GET',teacher,null,'?studentId=student_test_diag&view=events&cursor=next-page')).jsonBody.days.length===20,'older chunks remain accessible through cursor');
 await call('POST',teacher,{action:'configure',enabled:false},'?studentId=student_other_diag');check(!(await call('POST',other,payload(200))).jsonBody.enabled,'individual stop overrides school rollout');
 const usage=[...docs.values()].find(d=>d.studentId==='student_test_diag'&&d.type==='client_diagnostics_usage');usage.batches=DAILY_BATCH_LIMIT;
 const capAt=writes,capped=await call('POST',student,payload(500));check(capped.status===429&&capped.jsonBody.kind==='daily_budget'&&writes===capAt,'daily budget refuses new writes with a retry time');
 usage.batches=45;throttle=true;const throttled=await call('POST',student,payload(501));check(throttled.status===429&&throttled.jsonBody.kind==='cosmos_throttle','Cosmos throttling is distinguishable from capture budget');
 await call('POST',admin,{action:'configureGlobal',enabled:false});check(!(await call('GET',student)).jsonBody.enabled,'global stop pauses capture');
 const global=docs.get('_global/config');global.paused=false;global.enabled=true;global.endsAt=new Date(Date.now()-1000).toISOString();handler=makeHandler(()=>db);
 check(!(await call('GET',student)).jsonBody.enabled,'expired school trial stops ingestion automatically');
 check(!effectiveConfig({enabled:true,endsAt:'2020-01-01'},null).enabled,'expired personal trial stays off');
 check(sanitizeEvent({...event(),seq:-1})===null&&sanitizeEvent({...event(),ts:'nonsense'})===null,'invalid identity/time rejected');
 check(!redact('https://a.test/p?q=private').includes('private'),'URL queries removed');
 console.log('Remote diagnostics API: '+checks+' checks passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
