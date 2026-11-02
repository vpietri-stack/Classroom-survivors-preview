import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {select,manifest,root,fingerprint} from './checks.mjs';
const require=createRequire(import.meta.url);
const {launchBrowser,fileUrl}=require('./test-browser.cjs');

test('unknown runtime paths and shared contracts broaden to full coverage',()=>{
  const config=manifest();
  for(const f of ['game.js','frontend_auth.js','package-lock.json','dictionary.txt','api/src/functions/shared/auth.js','api/src/functions/saveAnalytics.js']) assert.deepEqual(select([f]),config.all,f);
  assert.deepEqual(select(['content_pu1.js','game.js']),config.all);
  assert.deepEqual(select(['docs/wiki/12-testing.md','AGENTS.md']),[]);
  const focused=select(['content_pu1.js']);
  assert.equal(focused[0],'test_deploy_stamp_sync.js');
  assert.ok(focused.includes('test_non_spelling_integration_browser.js'));
  assert.ok(!focused.includes('test_handwriting_browser.js'));
});
test('environment changes invalidate cached validation without storing environment values',()=>{
  const prior=process.env.CS_CHECK_CACHE_PROBE;
  try {
    process.env.CS_CHECK_CACHE_PROBE='first';const a=fingerprint(['test_deploy_stamp_sync.js']);
    process.env.CS_CHECK_CACHE_PROBE='second';assert.notEqual(fingerprint(['test_deploy_stamp_sync.js']),a);
  } finally {if(prior===undefined)delete process.env.CS_CHECK_CACHE_PROBE;else process.env.CS_CHECK_CACHE_PROBE=prior;}
});
test('every retained full-suite test exists and the stamp guard stays first',()=>{
  const config=manifest();assert.equal(config.all[0],'test_deploy_stamp_sync.js');
  assert.equal(new Set(config.all).size,config.all.length);
  for(const f of config.all) assert.ok(fs.existsSync(path.join(root,f)),f);
  for(const group of Object.values(config.groups)) for(const f of group.tests) assert.ok(config.all.includes(f),f);
});
test('integration cannot silently run without explicit isolated prerequisites',()=>{
  const env={...process.env};delete env.CS_INTEGRATION_ISOLATED;delete env.TEST_BASE;
  const r=spawnSync(process.execPath,['scripts/checks.mjs','--integration'],{cwd:root,encoding:'utf8',env});
  assert.equal(r.status,2);assert.match(r.stderr,/UNAVAILABLE/);
});
test('runner preserves child failure and invalidates reuse after a test edit',()=>{
  const dir=path.join(root,'.checks');fs.mkdirSync(dir,{recursive:true});
  const name='.checks/runner-fixture.cjs';const fixture=path.join(root,name);const marker=path.join(dir,'runner-marker.txt');
  const execute=reuse=>spawnSync(process.execPath,['--input-type=module','-e',`import {run} from './scripts/checks.mjs';process.exitCode=run([${JSON.stringify(name)}],{reuse:${reuse}});`],{cwd:root,encoding:'utf8'});
  try {
    fs.writeFileSync(fixture,'process.exit(7);');
    const failed=execute(false);assert.equal(failed.status,7);assert.match(failed.stdout,/FAIL/);
    fs.writeFileSync(fixture,`require('node:fs').appendFileSync(${JSON.stringify(marker)},'x');`);
    assert.equal(execute(false).status,0);assert.match(execute(true).stdout,/REUSED/);assert.equal(fs.readFileSync(marker,'utf8'),'x');
    fs.appendFileSync(fixture,'\n// changed test input');
    const changed=execute(true);assert.equal(changed.status,0);assert.doesNotMatch(changed.stdout,/REUSED/);assert.equal(fs.readFileSync(marker,'utf8'),'xx');
  } finally {fs.rmSync(fixture,{force:true});fs.rmSync(marker,{force:true});}
});
test('browser fixture blocks real HTTP API traffic before navigation',async()=>{
  let contacts=0;
  const server=http.createServer((_req,res)=>{contacts++;res.end('{}');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    browser=await launchBrowser();const page=await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/api/saveAnalytics`);
    assert.equal(contacts,0);assert.match(await page.textContent('body'),/blocked external API/);
    assert.match(fileUrl('a folder/file.html'),/a%20folder/);
  } finally {if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
});
