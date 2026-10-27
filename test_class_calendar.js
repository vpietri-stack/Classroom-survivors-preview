const assert = require('assert/strict');
const fs = require('fs');
const vm = require('vm');
const { JSDOM } = require('jsdom');
const core = require('./api/src/functions/shared/classCalendarCore');
const service = require('./api/src/functions/shared/classCalendarService');
const copy = value => JSON.parse(JSON.stringify(value));
const at = (day,time='16:30') => core.iso(`2026-10-${day}T${time}`);
const group = {teacher:'Teacher A',classTime:'Sun 16:30',studentIds:['a','b']};
const oldTarget = () => ({id:'old',startTime:at('11','18:00'),endTime:at('18'),targetSessions:10});
const practice = n => Array.from({length:n},(_,i) => ({eventId:'s'+i,type:'session',sessionType:'study',timestamp:at('14','12:00')}));

// In-memory Cosmos contract: reads are snapshots; writes honor ETags and partition keys.
class Store {
    constructor(docs) { this.docs = new Map(docs.map(d => [d.id,{...copy(d),_etag:'1'}])); this.inject = null; this.keys = []; this.queries=[]; this.writes=0; }
    items = {
        query: spec => ({fetchAll:async () => {
            const q = typeof spec === 'string' ? spec : spec.query;
            this.queries.push(q);
            let docs = [...this.docs.values()];
            if (q.includes("c.role = 'classCalendar'")) {
                docs = docs.filter(d => d.role === 'classCalendar');
                const params = new Map((spec.parameters || []).map(p=>[p.name,p.value]));
                if (params.has('@group')) docs = docs.filter(d=>d.groupKey===params.get('@group'));
                if (params.has('@future')) docs = docs.filter(d=>d.startTime>params.get('@future'));
                if (params.has('@from')) docs = docs.filter(d=>(d.startTime>=params.get('@from') && d.startTime<=params.get('@to')) || (d.endTime<=params.get('@now') && d.status==='scheduled' && !d.attendanceComplete));
            }
            else if (q.includes("c.type = 'student_analytics_archive'")) {
                const ids=spec.parameters.filter(p=>p.name.startsWith('@id')).map(p=>p.value);
                docs = docs.filter(d => d.type === 'student_analytics_archive' && ids.includes(d.studentId));
                if (q.includes('JOIN e IN')) docs=docs.flatMap(d=>d.events.filter(e=>e.type==='session').map(event=>({studentId:d.studentId,event})));
            }
            else if (q.includes('c.id = @id')) docs = docs.filter(d => d.id === spec.parameters[0].value);
            else if (q.includes('ARRAY_CONTAINS(@ids, c.id)')) docs=docs.filter(d=>spec.parameters[0].value.includes(d.id));
            else docs = docs.filter(d => (!d.role || d.role === 'student') && !d.type);
            return {resources:copy(docs)};
        }}),
        create:async doc => {this.writes++; if (this.docs.has(doc.id)) throw {code:409}; const resource = {...copy(doc),_etag:'1'}; this.docs.set(doc.id,resource); return {resource:copy(resource)}; }
    };
    item(id,pk) {
        const read = () => {
            const doc = this.docs.get(id);
            if (!doc) throw {code:404};
            assert.equal(pk,doc.studentId);
            this.keys.push([id,pk]);
            return doc;
        };
        return {read:async () => ({resource:copy(read())}),patch:async (ops,options) => {
            this.writes++;
            const doc = read();
            if (this.inject) { const inject=this.inject; this.inject=null; inject(doc); doc._etag=String(+doc._etag+1); }
            if (options?.accessCondition && options.accessCondition.condition !== doc._etag) throw {code:412};
            for (const op of ops) doc[op.path.slice(1)] = copy(op.value);
            doc._etag=String(+doc._etag+1);
            return {resource:copy(doc)};
        }};
    }
}
async function coreAndServiceTests() {
    const classes = core.occurrences(group,'2026-10-12','2026-10-25');
    assert.equal(classes.length,2);
    assert.equal(classes[0].startTime,at('18'));
    assert.equal(classes[0].endTime,at('18','18:00'));
    assert.equal(core.parseClassTime('Saturday 9:05').day,6);
    assert.equal(core.parseClassTime('Sun 24:00'),null);
    assert.equal(core.beijingDate('2026-10-17T18:00:00Z'),'2026-10-18');
    const event = {...classes[0],id:'class_'+'a'.repeat(32)};
    let targets = core.updateTargets({targets:[oldTarget()]},event,'attended',classes[1],practice(10));
    assert.equal(targets[1].startTime,at('18','18:00'));
    assert.equal(targets[1].endTime,at('25'));
    assert.equal(targets[1].targetSessions,10);
    targets = core.updateTargets({targets:[oldTarget()]},event,'missed',classes[1],practice(10));
    assert.equal(targets.length,1);
    assert.equal(targets[0].targetSessions,20);
    assert.equal(targets[0].startTime,at('11','18:00'));
    assert.equal(targets[0].endTime,at('25'));
    targets = core.updateTargets({targets:[oldTarget()]},event,'missed',classes[1],practice(9));
    assert.equal(targets[1].targetSessions,10);
    assert.equal(targets[1].startTime,at('18','18:00'));
    targets = core.updateTargets({targets:[{...oldTarget(),manualOffset:1}]},event,'missed',classes[1],practice(9));
    assert.equal(targets[0].targetSessions,20);
    assert.equal(core.countPractice(practice(10).concat(practice(10)),oldTarget()),10);
    assert.equal(core.countPractice([{type:'session',eventId:'loss',sessionType:'uno',timestamp:at('14'),data:{winner:1,totalTimeSec:60}}],oldTarget()),0);
    const rescheduled = {...classes[1],startTime:at('26','17:00')};
    assert.equal(core.updateTargets({targets:[]},event,'attended',rescheduled,[])[0].endTime,rescheduled.startTime);
    const cancelled = core.updateTargets({targets:[oldTarget()]},event,'cancelled',null,[]);
    assert.equal(cancelled[0].endTime,at('25'));
    assert.equal(cancelled[0].targetSessions,20);
    const fridayKey=core.groupKey('Teacher A','Fri 16:30');
    const octoberTarget={id:'october',groupKey:fridayKey,startTime:core.iso('2026-10-23T18:00'),endTime:core.iso('2026-10-30T16:30'),targetSessions:10,manualOffset:2};
    const octoberCancellation={id:'class_'+'f'.repeat(32),teacher:'Teacher A',classTime:'Fri 16:30',groupKey:fridayKey,startTime:core.iso('2026-10-30T16:30'),endTime:core.iso('2026-10-30T18:00')};
    const extendedOctober=core.updateTargets({targets:[octoberTarget]},octoberCancellation,'cancelled',null,[])[0];
    assert.equal(extendedOctober.startTime,octoberTarget.startTime);
    assert.equal(extendedOctober.endTime,core.iso('2026-11-06T16:30'));
    assert.equal(extendedOctober.targetSessions,20);
    assert.equal(extendedOctober.manualOffset,2);
    const extendedAgain=core.updateTargets({targets:[extendedOctober]},{...octoberCancellation,startTime:core.iso('2026-11-06T16:30')},'cancelled',null,[])[0];
    assert.equal(extendedAgain.targetSessions,30);
    assert.equal(extendedAgain.endTime,core.iso('2026-11-13T16:30'));
    assert.deepEqual(core.updateTargets({targets:[]},octoberCancellation,'cancelled',null,[]),[]);
    const stats = core.attendanceStats({attendance:[{status:'attended',startTime:at('18')},{status:'missed',startTime:at('25')},{status:'cancelled',startTime:at('20')}]},'2026-10-12','2026-10-31');
    assert.equal(stats.rate,50); assert.equal(stats.recorded,2);
    assert.equal(core.attendanceStats({attendance:stats.records},'2026-10-18','2026-10-18').rate,100);
    assert.equal(core.attendanceStats({},'','').rate,null);

    const store = new Store([
        {id:'a',role:'student',...group,studentIds:undefined,targets:[oldTarget()],analytics:practice(9)},
        {id:'b',studentId:'b',role:'student',teacher:group.teacher,classTime:group.classTime,targets:[oldTarget()],analytics:[]},
        {id:'arc',type:'student_analytics_archive',studentId:'a',events:[practice(10)[9]]}
    ].map(d => Object.fromEntries(Object.entries(d).filter(([,v]) => v !== undefined))));
    const now = Date.now;
    Date.now = () => +new Date(at('19','12:00'));
    try {
        const generated = await service.ensureCalendar(store,'2026-10-31');
        const first = generated.find(e => e.startTime === at('18'));
        const second = generated.find(e => e.startTime === at('25'));
        assert(first && second);
        const size=store.docs.size;
        const writes=store.writes;
        await service.ensureCalendar(store,'2026-10-31'); assert.equal(store.docs.size,size);assert.equal(store.writes,writes);
        // Foreign student and future attendance fail without locking a class.
        await assert.rejects(service.recordBatch(store,{action:'record',eventId:first.id,studentIds:['outsider'],status:'attended'},'admin'),/belonging/);
        assert(!store.docs.get(first.id).attendanceStarted);
        await assert.rejects(service.recordBatch(store,{action:'record',eventId:second.id,studentIds:['a'],status:'attended'},'admin'),/after the class ends/);
        // Conflict retry merges onto a newly saved analytics tail, preserving it.
        store.inject = d => { d.analytics=(d.analytics || []).concat({eventId:'concurrent',type:'exercise'}); };
        const result = await service.recordOne(store,first,'a','missed',second,'admin');
        assert(result.success); assert.equal(result.targets[0].targetSessions,20);
        assert(store.docs.get('a').analytics.some(e => e.eventId === 'concurrent'));
        const duplicate = await service.recordOne(store,first,'a','missed',second,'admin');
        assert(duplicate.duplicate); assert.equal(store.docs.get('a').targets[0].targetSessions,20);
        assert.equal(store.docs.get('a').attendance.length,1);
        const beforeBatch=store.queries.length;
        const partial = await service.recordBatch(store,{action:'record',eventId:first.id,studentIds:['a','b'],status:'attended'},'admin');
        assert(!store.queries.slice(beforeBatch).some(q=>q.includes('SELECT c.id, c.teacher, c.classTime'))); // no calendar rebuild for an attendance save
        assert(partial.success); assert.equal(store.docs.get('b').targets[1].targetSessions,10);
        await assert.rejects(service.saveEvent(store,{eventId:first.id,startTime:at('20'),endTime:at('20','18:00')}),/cannot be edited/);
        const cancel1 = await service.recordBatch(store,{action:'cancel',eventId:second.id},'admin'); assert(cancel1.success);
        const before = copy(store.docs.get('a').targets);
        assert.equal(before[0].targetSessions,30);
        const cancel2 = await service.recordBatch(store,{action:'cancel',eventId:second.id},'admin'); assert(cancel2.success);
        assert.deepEqual(store.docs.get('a').targets,before);
        assert.equal(store.docs.get(second.id).status,'cancelled');
        assert.equal(core.attendanceStats(store.docs.get('a'),'','').recorded,1);
        assert(store.keys.some(([id,pk]) => id === 'a' && pk === undefined));
        assert(store.keys.some(([id,pk]) => id === 'b' && pk === 'b'));
        const editable = generated.find(e => e.startTime === core.iso('2026-11-01T16:30'));
        await service.saveEvent(store,{eventId:editable.id,etag:store.docs.get(editable.id)._etag,startTime:core.iso('2026-11-02T16:30'),endTime:core.iso('2026-11-02T18:00')});
        await service.ensureCalendar(store,'2026-11-30');
        assert.equal(store.docs.get(editable.id).startTime,core.iso('2026-11-02T16:30'));
    } finally { Date.now = now; }
}
async function uiTests() {
    const html=fs.readFileSync('teacher_dashboard.html','utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g,'');
    const dom=new JSDOM(html,{runScripts:'outside-only',url:'https://example.test/'});
    const w=dom.window;
    w.document.addEventListener=()=>{}; // Do not start a real login.
    w.eval('var API_BASE="/api"; var AVAILABLE_CONTENT={};');
    w.eval(['teacher_dashboard.js','geo_export.js','admin_dashboard.js','api/src/functions/shared/classCalendarCore.js','class_calendar.js'].map(file => fs.readFileSync(file,'utf8')).join('\n') + '\nallStudents=[{id:"a",fullName:"Student <script>",classTime:"Sun 16:30",teacher:"Teacher A",role:"student"}]; isAdmin=true; loadAllStudents=async()=>{}; window.testSetEvents=events=>{calendarEvents=events;calendarReady=true;};');
    w.isUncountedShortLoss=core.shortLoss;
    const archivedStudent={analytics:[],_fullAnalytics:practice(3)};
    assert.equal(w.countTargetSessions(archivedStudent,new Date(at('11')),new Date(at('18'))),3);
    assert.equal(w.countSessionsInRange(archivedStudent,new Date(at('11')),new Date(at('18'))),3);
    for (const [id,value] of Object.entries({bulkTargetClass:'Sun 16:30',bulkTargetStart:'2026-10-18T18:00',bulkTargetEnd:'2026-10-25T16:30',bulkTargetCount:'10',bulkContentClass:'Sun 16:30',bulkBook:'PU1',bulkUnit:'1',bulkPage:'2'})) {
        const el=w.document.getElementById(id);
        if (el.tagName === 'SELECT') el.innerHTML=`<option>${value}</option>`;
        el.value=value;
    }
    const targetsBtn=w.document.querySelector('button[onclick="submitBulkTargets()"]');
    const contentBtn=w.document.querySelector('button[onclick="submitBulkContent()"]');
    w.apiFetch=async()=>({ok:true,json:async()=>({results:[{success:true}]}),text:async()=>''});
    await w.submitBulkTargets(); assert(!targetsBtn.disabled); assert(targetsBtn.textContent.includes('Set Targets'));
    await w.submitBulkTargets(); assert(!targetsBtn.disabled);
    await w.submitBulkContent(); assert(!contentBtn.disabled); assert(contentBtn.textContent.includes('Apply to Class'));
    await w.submitBulkContent(); assert(!contentBtn.disabled);
    w.apiFetch=async()=>({ok:false,text:async()=>'Save denied'});
    await w.submitBulkContent(); assert(!contentBtn.disabled); assert(w.document.getElementById('bulkContentError').textContent.includes('Save denied'));
    await w.submitBulkTargets(); assert(!targetsBtn.disabled);
    w.apiFetch=async()=>{throw Error('Offline');};
    await w.submitBulkTargets(); assert(!targetsBtn.disabled);
    const event={id:'class_'+'a'.repeat(32),groupKey:core.groupKey('Teacher A','Sun 16:30'),teacher:'Teacher A',classTime:'Sun 16:30',startTime:at('18'),endTime:at('18','18:00'),studentIds:['a'],status:'scheduled'};
    w.testSetEvents([event]); w.document.getElementById('calendarMonth').value='2026-10';
    const realNow=w.Date.now; w.Date.now=()=>+new Date(at('19','12:00'));
    w.renderClassCalendar(); assert.equal(w.document.querySelectorAll('.calendar-event').length,1);
    w.renderAttendanceChecklist(); assert(w.document.querySelector('#attendanceChecklist input').checked);
    w.selectAttendance(false); assert(!w.document.querySelector('#attendanceChecklist input').checked);
    w.selectAttendance(true);
    w.apiFetch=async()=>({ok:true,json:async()=>({success:true,results:[{studentId:'a',success:true,attendance:[{classId:event.id,status:'attended',startTime:event.startTime,endTime:event.endTime,classTime:event.classTime}],targets:[]}]} )});
    await w.saveCheckedAttendance('attended');
    assert.equal(w.document.querySelectorAll('#attendanceChecklist input').length,0);
    assert(w.document.getElementById('studentsTableBody').textContent.includes('100%'));
    assert(!w.document.querySelector('#attendanceChecklist script'));
    w.Date.now=realNow;
    dom.window.close();
}
async function multipleGroupTests() {
    const sundayKey=core.groupKey('Teacher A','Sun 16:30'), saturdayKey=core.groupKey('Teacher A','Sat 14:50');
    const sat={id:'sat',startTime:at('10','16:20'),endTime:at('17','14:50'),targetSessions:10,manualOffset:1};
    const selena={id:'selena',role:'student',teacher:'Teacher A',classTime:'Sat 14:50',classGroups:[{teacher:'Teacher A',classTime:'Sun 16:30'}],targets:[sat,oldTarget()],analytics:practice(9)};
    assert.equal(core.memberships({...selena,classGroups:selena.classGroups.concat(selena.classGroups)}).length,2);
    assert(core.belongsTo(selena,'Teacher A','Sun 16:30'));
    assert.equal(core.targetGroupKey(selena,sat),saturdayKey);
    assert.equal(core.targetGroupKey(selena,oldTarget()),sundayKey);
    const ambiguous={...selena,classGroups:[{teacher:'Teacher A',classTime:'Sat 10:40'}]};
    assert.equal(core.targetGroupKey(ambiguous,{...sat,endTime:at('17','00:00')}),null);
    const early={id:'early',groupKey:sundayKey,teacher:'Teacher A',classTime:'Sun 16:30',startTime:at('12'),endTime:at('12','18:00')};
    const earlyTargets=core.updateTargets(selena,early,'attended',{startTime:at('25')},[]);
    assert.equal(earlyTargets.find(t=>t.id==='old').endTime,early.startTime);
    assert.deepEqual(earlyTargets.find(t=>t.id==='sat'),sat);
    const store=new Store([selena]);const originalNow=Date.now;
    Date.now=()=>+new Date(at('19','12:00'));
    try {
        const events=await service.ensureCalendar(store,'2026-11-01');
        const sun=events.find(e=>e.startTime===at('18')),satClass=events.find(e=>e.startTime===at('17','14:50'));
        assert(sun.studentIds.includes('selena'));assert(satClass.studentIds.includes('selena'));
        const sundayFirst=await service.recordBatch(store,{action:'record',eventId:sun.id,studentIds:['selena'],status:'attended'},'admin');
        assert(sundayFirst.success); // Pending Saturday attendance must not block Sunday's independent target.
        assert.deepEqual(store.docs.get('selena').targets[0],sat);
        const sunTargets=copy(store.docs.get('selena').targets.filter(t=>core.targetGroupKey(selena,t)===sundayKey));
        const saturdaySecond=await service.recordBatch(store,{action:'record',eventId:satClass.id,studentIds:['selena'],status:'missed'},'admin');
        assert(saturdaySecond.success);
        const current=store.docs.get('selena');
        assert.equal(current.targets[0].targetSessions,20);assert.equal(current.targets[0].endTime,at('24','14:50'));
        assert.deepEqual(current.targets.filter(t=>core.targetGroupKey(current,t)===sundayKey),sunTargets);
        const cancelSat=events.find(e=>e.startTime===at('24','14:50'));
        assert((await service.recordBatch(store,{action:'cancel',eventId:cancelSat.id},'admin')).success);
        assert.equal(store.docs.get('selena').targets[0].endTime,at('31','14:50'));
        assert.equal(store.docs.get('selena').targets[0].targetSessions,30);
        assert.deepEqual(store.docs.get('selena').targets.filter(t=>core.targetGroupKey(current,t)===sundayKey),sunTargets);
        await service.recordBatch(store,{action:'cancel',eventId:cancelSat.id},'admin');
        assert.equal(store.docs.get('selena').targets[0].endTime,at('31','14:50'));
        assert.equal(store.docs.get('selena').targets[0].targetSessions,30);
        const stats=core.attendanceStats(store.docs.get('selena'),'2026-10-12','2026-10-31');
        assert.equal(stats.recorded,2);assert.equal(stats.rate,50);

        // Manual assignment and batch targets cannot erase a different group's overlapping period.
        const assign=httpHandler('setTargets.js',store);
        const result=await assign({json:async()=>({studentIds:['selena'],target:{startTime:at('11','18:00'),endTime:at('25'),targetSessions:30,groupKey:sundayKey}})},{error:()=>{}});
        assert(result.jsonBody.results[0].success);
        assert.equal(store.docs.get('selena').targets.find(t=>t.id==='sat').targetSessions,30);
        const wrong=await assign({json:async()=>({studentIds:['selena'],target:{startTime:at('11','18:00'),endTime:at('25'),targetSessions:10,groupKey:core.groupKey('outsider','Sun 16:30')}})},{error:()=>{}});
        assert(!wrong.jsonBody.results[0].success);

        // Bind existing manual targets as additional memberships are saved; preserve their contents.
        const legacyStore=new Store([{...selena,classGroups:[],attendance:[]}]);
        const update=httpHandler('updateStudent.js',legacyStore);
        const request=fields=>({json:async()=>({studentId:'selena',fields})});
        assert.equal((await update(request({classGroups:selena.classGroups}),{error:()=>{}})).status,200);
        const bound=legacyStore.docs.get('selena').targets;
        assert.equal(bound[0].groupKey,saturdayKey);assert.equal(bound[1].groupKey,sundayKey);
        assert.equal(bound[0].manualOffset,1);assert.equal(bound[1].endTime,oldTarget().endTime);
        assert.equal((await update({json:async()=>({studentId:'selena',fields:{targets:[]},expectedTargets:[]})},{error:()=>{}})).status,409);
        assert.equal((await update(request({classGroups:[{teacher:'Teacher A',classTime:'invalid'}]}),{error:()=>{}})).status,400);
        assert.equal((await httpHandler('updateStudent.js',legacyStore,{token:{role:'student',sub:'selena'}})(request({classGroups:[]}),{error:()=>{}})).status,403);
        assert.equal((await update(request({classGroups:[]}),{error:()=>{}})).status,200);
        assert.equal(legacyStore.docs.get('selena').targets[1].groupKey,sundayKey); // Former group history remains identified.
    } finally {Date.now=originalNow;}
}
function httpHandler(file,store,gate={token:{role:'admin',sub:'admin'}}) {
    let handler;
    const filename=require('path').resolve('api/src/functions',file);
    const sandbox={module:{exports:{}},console,Date,require: id => {
        if (id==='@azure/functions') return {app:{http:(_name,options)=>{handler=options.handler;}}};
        if (id==='./shared/validateApiKey') return {validateApiKey:()=>true};
        if (id==='./shared/db') return {getContainer:()=>store};
        if (id==='./shared/auth') return {requireAuth:()=>gate,isPrivileged:token=>['admin','teacher','BM'].includes(token.role),forbidden:()=>({status:403}),publicUser:copy};
        if (id==='crypto') return require('crypto');
        return require(require('path').resolve(require('path').dirname(filename),id));
    }};
    vm.runInNewContext(fs.readFileSync(filename,'utf8'),sandbox);
    return handler;
}
async function httpAndRosterTests() {
    const configSource=fs.readFileSync('config.js','utf8');
    const apiFor=(hostname,pathname)=>vm.runInNewContext(configSource+'\nAPI_BASE_URL;', {window:{location:{hostname,pathname,search:'',protocol:'https:'}},URLSearchParams});
    assert.equal(apiFor('vpietri-stack.github.io','/Classroom-survivors-preview/teacher_dashboard.html'),'https://brave-bush-0438ab000-1.eastasia.7.azurestaticapps.net/api');
    assert.equal(apiFor('vpietri-stack.github.io','/Classroom-survivors/index.html'),'https://brave-bush-0438ab000.7.azurestaticapps.net/api');
    assert.equal(apiFor('localhost','/teacher_dashboard.html'),'http://localhost:7074/api');
    const context={error:()=>{}};
    const store=new Store([{id:'a',role:'student',teacher:'Teacher A',classTime:'Sun 16:30',analytics:practice(1),attendance:[]}]);
    const request={method:'GET',query:{get:()=>null}};
    assert.equal((await httpHandler('classCalendar.js',store,{token:{role:'student',sub:'a'}})(request,context)).status,403);
    assert.equal((await httpHandler('classCalendar.js',store,{error:{status:401}})(request,context)).status,401);
    const now=Date.now;
    Date.now=()=>+new Date(at('19','12:00'));
    try {
        const roster=await service.ensureCalendar(store,'2026-11-30');
        const first=roster.find(e=>e.startTime===at('18'));
        const second=roster.find(e=>e.startTime===at('25'));
        // Recording a later class with earlier pending attendance does not lock it.
        Date.now=()=>+new Date(at('26','12:00'));
        const failed=await service.recordBatch(store,{action:'record',eventId:second.id,studentIds:['a'],status:'attended'},'admin');
        assert(!failed.success); assert(failed.results[0].error.includes('earlier')); assert(!store.docs.get(second.id).attendanceStarted);
        Date.now=()=>+new Date(at('19','12:00'));
        store.docs.get('a').classTime='Tue 17:00';
        await service.ensureCalendar(store,'2026-11-30');
        assert.equal(store.docs.get(second.id).status,'retired');
        assert.equal(store.docs.get(first.id).status,'scheduled'); // historical roster remains valid
        const targetReq={json:async()=>({studentIds:['a'],target:{startTime:at('18','18:00'),endTime:at('25'),targetSessions:10}})};
        store.inject=doc=>{doc.attendance.push({classId:first.id,status:'attended',startTime:first.startTime});};
        const assigned=await httpHandler('setTargets.js',store)(targetReq,context);
        assert.equal(assigned.status,200); assert(assigned.jsonBody.results[0].success);
        assert.equal(store.docs.get('a').attendance.length,1);
        assert.equal(store.docs.get('a').analytics.length,1);
        const contentReq={json:async()=>({studentId:'a',fields:{book:'PU1',unit:'2',page:'3'}})};
        const updated=await httpHandler('updateStudent.js',store)(contentReq,context);
        assert.equal(updated.status,200); assert.equal(store.docs.get('a').book,'PU1');
        assert.equal(store.docs.get('a').attendance.length,1);
        assert.equal(store.docs.get('a').targets.length,1);
    } finally {Date.now=now;}
}
(async()=>{await coreAndServiceTests();await httpAndRosterTests();await multipleGroupTests();await uiTests();console.log('PASS: calendar recurrence, separate group targets/attendance, migration, archives, retries, cancellation, auth, rosters and dashboard controls');})().catch(e=>{console.error(e);process.exitCode=1;});
