const fs=require('fs'),vm=require('vm'),assert=require('assert');
const source=fs.readFileSync(__dirname+'/practice_telemetry.js','utf8');let checks=0;
function check(v,s){assert.ok(v,s);checks++;console.log('PASS: '+s);}
function storage(map=new Map()){return {getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k),map};}
function load(local=storage(),session=storage()){
 const handlers={},c={Date,Math,JSON,Map,localStorage:local,sessionStorage:session,location:{pathname:'/Classroom-survivors/'},setTimeout,clearTimeout,addEventListener:(t,fn)=>(handlers[t]??=[]).push(fn)};
 c.window=c;vm.createContext(c);vm.runInContext(source,c);return {api:c.PracticeTelemetry,c,handlers,local,session};
}
const events=[],p=load();p.api.attach({id:'student_a',role:'student'},e=>events.push(e));
const first=p.api.start('study','study');p.api.checkpoint({round:'D',ex:'handwriting',word:'private-answer',audioPhase:'microphone-request'});
check(first&&events.length===1&&events[0].phase==='start','real start gets a stable run ID');
check(p.api.current()===first,'exercises can reference current run');
p.api.complete('study');p.api.complete('study');check(events.filter(e=>e.phase==='complete').length===1,'completion emitted once');
const second=p.api.start('study','study');check(second!==first,'consecutive Study has a new identity');
p.api.interrupt('study_exit',false);check(events.at(-1).phase==='interrupted'&&!events.at(-1).detail.inferred,'explicit quit distinguished from inferred page loss');
p.api.start('game','uno');p.api.complete('gomoku');check(p.api.current()&&!p.api.current('gomoku'),'stale completion cannot close or claim another game');
p.api.start('game','gomoku');check(events.some(e=>e.detail.reason==='another_run_started'),'another start records the previous exit');
p.handlers.pagehide[0]({persisted:true});p.handlers.pageshow[0]();check(p.api.current(),'BFCache does not falsely end a live run');
for(let i=0;i<50;i++)p.handlers.error[0]({target:vm.runInContext('window',p.c),message:'password=secret',error:null});
check(events.filter(e=>e.phase==='error').length===5&&!JSON.stringify(events).includes('password=secret'),'error sampling bounded and redacted');
const recovered=[],q=load(p.local,p.session);q.api.attach({id:'student_a'},e=>recovered.push(e));check(recovered.length===1&&recovered[0].detail.inferred,'same-tab new document recovers unfinished run as a clue');
const other=[];q.api.attach({id:'student_b'},e=>other.push(e));check(!q.api.current()&&other.length===0,'accounts do not inherit learner runs');
q.api.start('study','study');q.api.detach('logout');const n=other.length;q.handlers.error[0]({target:q.c,message:'after logout'});check(other.length===n,'logout stops error attribution');
const independent=load(p.local,storage()),extra=[];independent.api.attach({id:'student_a'},e=>extra.push(e));check(!extra.length,'independent tab does not declare another tab dead');
const broken=load({getItem(){throw Error('blocked')},setItem(){throw Error('full')},removeItem(){throw Error('blocked')}});broken.api.attach({id:'student_c'},()=>{});broken.api.start('study','study');broken.api.complete('study');check(true,'storage failure never throws into gameplay');
console.log('Practice lifecycle: '+checks+' checks passed.');
