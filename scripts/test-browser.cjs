'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require('playwright-core');

function chromePath() {
  const candidates=[process.env.CHROME_PATH,
    ...[process.env.ProgramFiles,process.env['ProgramFiles(x86)'],process.env.LOCALAPPDATA].filter(Boolean).map(p=>path.join(p,'Google/Chrome/Application/chrome.exe')),
    chromium.executablePath()].filter(Boolean);
  if(process.env.CHROME_PATH && !fs.existsSync(process.env.CHROME_PATH)) throw Error('CHROME_PATH does not exist');
  const found=candidates.find(p=>fs.existsSync(p));
  if(!found) throw Error('No test Chrome found. Set CHROME_PATH to an installed browser; no automatic installation.');
  return found;
}
function fileUrl(filename) {return pathToFileURL(path.resolve(filename)).href;}
async function isolateApi(page) {
  await page.route('**/*',route=>{
    const u=new URL(route.request().url());
    if(/^https?:$/.test(u.protocol) && /\/api(?:\/|$)/i.test(u.pathname)) {
      const config=/CaptureConfig$/i.test(u.pathname);
      return route.fulfill({status:config?200:403,contentType:'application/json',body:JSON.stringify(config?{enabled:false,open:false,endsAt:0,maxPerDay:0}:{error:'Test harness blocked external API; install a scenario mock.'})});
    }
    return route.continue();
  });
}
async function launchBrowser(options={}) {
  const browser=await chromium.launch({executablePath:chromePath(),headless:true,...options});
  const create=browser.newPage.bind(browser);
  browser.newPage=async(...args)=>{const page=await create(...args);await isolateApi(page);return page;};
  return browser;
}
module.exports={chromePath,fileUrl,isolateApi,launchBrowser};
