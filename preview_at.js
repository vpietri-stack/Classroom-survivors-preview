// tmp/preview_at.js — render vocab PNGs at the on-screen sizes a pupil gets.
//   node tmp/preview_at.js 140 file.png file.png ...
// .vocab-image is clamp(80px, 25vw, 140px), so 140 is the best case and 80 the
// phone case. This is the only honest way to judge a busy illustration: the
// 1024 master always looks fine.
const { chromium } = require('playwright-core');
const path = require('path');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const argv = process.argv.slice(2);
const SIZES = argv.shift().split(',').map(Number);
const files = argv;

(async () => {
  const b = await chromium.launch({ executablePath: CHROME_PATH, headless: true, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
  const cells = files.map(f => {
    // setContent() gives an about:blank document, which Chrome refuses to let
    // load file:// subresources — inline the bytes as data URLs instead.
    const src = 'data:image/png;base64,' + require('fs').readFileSync(f).toString('base64');
    const name = path.basename(f);
    const imgs = SIZES.map(s =>
      `<div style="text-align:center"><img src="${src}" style="width:${s}px;height:${s}px;background:#fff;border:1px solid #bbb"><div style="font:11px monospace;color:#666">${s}px</div></div>`
    ).join('');
    return `<div style="display:flex;gap:10px;align-items:center;padding:8px;background:#fff;border-bottom:1px solid #ddd">
      <b style="font:13px monospace;width:150px">${name}</b>${imgs}</div>`;
  }).join('');
  await p.setContent(`<body style="margin:0;background:#eee"><div id="g">${cells}</div></body>`);
  await p.waitForTimeout(400);
  await p.locator('#g').screenshot({ path: 'tmp_preview_at.png' });
  await b.close();
  console.log('-> tmp_preview_at.png');
})();
