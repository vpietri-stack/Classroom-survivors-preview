const fs=require('fs'),vm=require('vm'),assert=require('assert');let n=0;const ok=(v,s)=>{assert.ok(v,s);n++;console.log('PASS '+s);};
const c={console};vm.createContext(c);vm.runInContext(fs.readFileSync('sr_engine.js','utf8'),c);
let sr=c.updateSRStateForSession({vocab:{},sentences:{},sentencePairs:{}},[{type:'vocab',key:'want',firstAttempt:false}],4,'same_study');
ok(sr.vocab.want.lapses===1&&sr.vocab.want.lastStudyRunId==='same_study','partial Study outcome has a stable run receipt');
sr=c.updateSRStateForSession(sr,[{type:'vocab',key:'want',firstAttempt:false}],4,'same_study');ok(sr.vocab.want.lapses===1,'restoring and finalizing the same failure does not add a lapse');
sr=c.updateSRStateForSession(sr,[{type:'vocab',key:'want',firstAttempt:true}],4,'same_study');ok(sr.vocab.want.lastResult==='failure','a retry cannot replace the original first-check failure');
sr=c.updateSRStateForSession(sr,[{type:'vocab',key:'want',firstAttempt:true}],5);ok(sr.vocab.want.lastResult==='success'&&sr.vocab.want.lastStudyRunId==='same_study','game results still apply while retaining the partial Study receipt');
sr=c.updateSRStateForSession(sr,[{type:'vocab',key:'want',firstAttempt:false}],6,'same_study');ok(sr.vocab.want.lastResult==='success','resuming does not reapply the already recorded outcome over a later game result');
sr=c.updateSRStateForSession(sr,[{type:'vocab',key:'want',firstAttempt:false}],6,'new_study');ok(sr.vocab.want.lapses===2,'a genuinely new Study can record a new failure');
const config=fs.readFileSync('config.js','utf8');function gate(hostname,pathname,search=''){const context={location:{hostname,pathname,search,protocol:'https:'},URLSearchParams};context.window=context;vm.createContext(context);vm.runInContext(config,context);return vm.runInContext('STUDY_RESUME_ENABLED',context);}
ok(gate('vpietri-stack.github.io','/Classroom-survivors-preview/'),'preview enables recovery');ok(!gate('vpietri-stack.github.io','/Classroom-survivors/'),'production stays disabled');ok(!gate('vpietri-stack.github.io','/Classroom-survivors/','?resume=1'),'query parameters cannot enable recovery in production');ok(!gate('vpietri-stack.github.io','/Classroom-survivors-preview/','?resume=0'),'preview can explicitly test the legacy flow');
console.log('Study resume state/gates: '+n+' checks passed.');
