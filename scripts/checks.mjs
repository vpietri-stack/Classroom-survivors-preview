import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const git = (...args) => {
  const r = spawnSync('git', args, {cwd:root, encoding:'utf8', maxBuffer:16*1024*1024});
  if (r.status !== 0) throw Error(r.stderr || `git ${args[0]} failed`);
  return r.stdout;
};
export function manifest() {
  return JSON.parse(fs.readFileSync(path.join(root,'scripts/checks.json'),'utf8'));
}
export function select(files, config=manifest()) {
  if (!files.length) return [];
  const chosen = new Set();
  for (const filename of files) {
    const f = filename.replaceAll('\\','/');
    if (/^(docs\/|\.github\/ISSUE_TEMPLATE\/)/.test(f) || /\.md$/i.test(f)) continue;
    if (/^api\/src\/functions\/(shared\/|(?:login|saveAnalytics|updateStudent)\.)/.test(f)) return config.all;
    const matches = Object.entries(config.groups).filter(([,g]) => g.paths.some(p=>new RegExp(p).test(f)));
    if (!matches.length) return config.all;
    for (const [,g] of matches) for (const test of g.tests) chosen.add(test);
  }
  return config.all.filter(t => chosen.has(t) || (chosen.size && t === 'test_deploy_stamp_sync.js'));
}
export function changed(base='HEAD') {
  return [...new Set((git('diff','--name-only','-z',base,'--') + git('ls-files','--others','--exclude-standard','-z')).split('\0').filter(Boolean))];
}
export function fingerprint(tests) {
  const names=[...new Set(git('ls-files','--cached','--others','--exclude-standard','-z').split('\0').filter(Boolean))].sort();
  const h=crypto.createHash('sha256');
  h.update(JSON.stringify({tests,node:process.version,platform:process.platform,arch:process.arch,env:Object.entries(process.env).sort(([a],[b])=>a.localeCompare(b))}));
  for(const test of tests) h.update(fs.readFileSync(path.join(root,test)));
  for(const n of names) {
    if (/^docs\//.test(n) || /\.(md|log)$/i.test(n) || /^(?:test_screenshot|screenshot_|td_).*\.png$/.test(n)) continue;
    const p=path.join(root,n); h.update(n+'\0');
    if(fs.existsSync(p) && fs.statSync(p).isFile()) h.update(fs.readFileSync(p)); else h.update('<deleted>');
  }
  // Installed package metadata and browser executable identity invalidate reuse even
  // if the lockfile is unchanged. Live API integration is never cached.
  for(const name of ['jsdom','playwright-core','@azure/functions','@azure/cosmos']) {
    for(const dir of ['node_modules','api/node_modules']) {
      const p=path.join(root,dir,name,'package.json');
      if(fs.existsSync(p)) {h.update(fs.realpathSync(p));h.update(fs.readFileSync(p));}
    }
  }
  const {chromePath}=installedBrowser();
  if(chromePath) {const s=fs.statSync(chromePath);h.update(JSON.stringify([chromePath,s.size,s.mtimeMs]));}
  return h.digest('hex');
}
function installedBrowser() {
  const options=[process.env.CHROME_PATH,process.env.ProgramFiles&&path.join(process.env.ProgramFiles,'Google/Chrome/Application/chrome.exe'),process.env.LOCALAPPDATA&&path.join(process.env.LOCALAPPDATA,'Google/Chrome/Application/chrome.exe')].filter(Boolean);
  return {chromePath:options.find(p=>fs.existsSync(p))};
}
function integration() {
  const helper=path.join(root,'api/test_auth.js');
  const base=process.env.TEST_BASE;
  if(!fs.existsSync(helper)) throw Error('UNAVAILABLE: api/test_auth.js is a private integration helper. Portable checks: npm --prefix api test.');
  if(process.env.CS_INTEGRATION_ISOLATED!=='1' || !base) throw Error('UNAVAILABLE: integration requires CS_INTEGRATION_ISOLATED=1 and explicit TEST_BASE for an isolated local Functions/Cosmos setup.');
  const url=new URL(base);
  if(url.protocol!=='http:' || !['localhost','127.0.0.1','[::1]'].includes(url.hostname)) throw Error('Integration TEST_BASE must use loopback HTTP; hosted student systems are forbidden.');
  return ['api/test_auth.js'];
}
export function run(tests,{reuse=false,integrationRun=false}={}) {
  const dir=path.join(root,'.checks');fs.mkdirSync(dir,{recursive:true});
  const before=integrationRun?null:fingerprint(tests);
  const key=digest(JSON.stringify(tests));const receipt=path.join(dir,`${key}.json`);
  if(reuse && !integrationRun && fs.existsSync(receipt)) {
    const prior=JSON.parse(fs.readFileSync(receipt,'utf8'));
    if(prior.passed && prior.fingerprint===before && prior.cwd===root) {console.log(`REUSED: ${tests.length} checks; unchanged local inputs. Receipt: ${receipt}`);return 0;}
  }
  const stamp=new Date().toISOString().replaceAll(/[:.]/g,'-');const log=path.join(dir,`${stamp}.log`);
  const fd=fs.openSync(log,'w');const results=[];const started=Date.now();
  try {
    for(const test of tests) {
      fs.writeSync(fd,`\n=== ${test} ===\n`);
      const at=Date.now();const r=spawnSync(process.execPath,[test],{cwd:root,stdio:['ignore',fd,fd],timeout:600000,env:process.env});
      const exit=r.status ?? 2;results.push({test,exit,ms:Date.now()-at,error:r.error?.message});
      console.log(`${exit===0?'PASS':'FAIL'} ${test} (${Math.round((Date.now()-at)/1000)}s)`);
      if(exit!==0) break;
    }
  } finally {fs.closeSync(fd);}
  const passed=results.length===tests.length && results.every(r=>r.exit===0);
  const after=integrationRun?null:fingerprint(tests);const stable=before===after;
  const result={at:new Date().toISOString(),cwd:root,tests,results,passed:passed&&stable,fingerprint:after,ms:Date.now()-started,log,integrationRun};
  fs.writeFileSync(receipt,JSON.stringify(result,null,2)+'\n');
  console.log(`${passed&&stable?'PASS':'FAIL'} ${results.filter(r=>r.exit===0).length}/${tests.length} checks; ${Math.round(result.ms/1000)}s; full log: ${log}`);
  if(!passed) console.error(fs.readFileSync(log,'utf8').slice(-6000));
  if(!stable) console.error('Inputs changed while checks ran; validation is not current. Rerun after edits settle.');
  return passed&&stable?0:results.find(r=>r.exit)?.exit||2;
}
function main(args) {
  const config=manifest();let tests=config.all;let reuse=false;let list=false;let integrationRun=false;
  for(let i=0;i<args.length;i++) {
    const a=args[i];
    if(a==='--all') tests=config.all;
    else if(a==='--group') {const g=config.groups[args[++i]];if(!g)throw Error('Unknown test group');tests=config.all.filter(t=>g.tests.includes(t)||t==='test_deploy_stamp_sync.js');}
    else if(a==='--changed') tests=select(changed(args[i+1]&&!args[i+1].startsWith('--')?args[++i]:'HEAD'),config);
    else if(a==='--integration') {tests=integration();integrationRun=true;}
    else if(a==='--reuse') reuse=true;
    else if(a==='--list') list=true;
    else throw Error(`Unknown option: ${a}`);
  }
  for(const test of tests) if(!fs.existsSync(path.join(root,test))) throw Error(`UNAVAILABLE: ${test}`);
  if(list) {console.log(tests.length?tests.join('\n'):'No application checks selected (no changes or documentation-only).');return 0;}
  if(!tests.length) {console.log('NO APPLICATION CHECKS: no changes or documentation-only. This is not a full-release pass.');return 0;}
  return run(tests,{reuse,integrationRun});
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {process.exitCode=main(process.argv.slice(2));} catch(e) {console.error(e.message);process.exitCode=2;}
}
