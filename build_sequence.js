// ============================================================
// build_sequence.js — lay tiles out left-to-right on a square canvas
// with arrows between them, for "growing up" style sequences.
//
//   node build_sequence.js <out.png> <tileA.png> <tileB.png> [...] [--arrows]
//
// Tiles are BOTTOM-aligned and scaled by their natural height, so a real
// size progression survives (baby small, adult tall) instead of every stage
// being blown up to the same box. The generator is told not to draw arrows
// because it puts them anywhere it likes; we need them between the figures at
// a consistent height.
// ============================================================
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const argv = process.argv.slice(2);
const wantArrows = argv.includes('--arrows');
const [outPath, ...tiles] = argv.filter(a => a !== '--arrows');
if (!outPath || tiles.length < 2) {
  console.error('Usage: node build_sequence.js <out.png> <tileA> <tileB> [...] [--arrows]');
  process.exit(2);
}

(async () => {
  const data = tiles.map(t => 'data:image/png;base64,' + fs.readFileSync(t).toString('base64'));
  const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  await page.setContent('<body></body>');

  const url = await page.evaluate(async ({ data, wantArrows }) => {
    const S = 1024;
    const imgs = [];
    for (const d of data) {
      const im = new Image();
      await new Promise((r, j) => { im.onload = r; im.onerror = j; im.src = d; });
      imgs.push(im);
    }
    const c = document.createElement('canvas'); c.width = S; c.height = S;
    const o = c.getContext('2d');
    o.fillStyle = '#ffffff'; o.fillRect(0, 0, S, S);

    const n = imgs.length;
    const gapF = 0.045;                        // arrow lane between neighbours
    const floor = 0.93 * S, ceil = 0.05 * S;

    // Four figures side by side means WIDTH binds long before height, so the
    // tallest stage only reaches ~half the canvas. That is fine here because we
    // trim and re-fit below; scaling by natural height keeps the real size
    // progression (baby small, adult tall) instead of blowing every stage up.
    const maxH = Math.max(...imgs.map(i => i.naturalHeight));
    const sumW = imgs.reduce((a, i) => a + i.naturalWidth, 0);
    const scale = Math.min((floor - ceil) / maxH,
                           (S - S * gapF * (n - 1)) / sumW);

    const boxes = [];
    let x = 0;
    const totalW = imgs.reduce((a, im) => a + im.naturalWidth * scale, 0) + (n - 1) * S * gapF;
    x = (S - totalW) / 2;
    for (const im of imgs) {
      const w = im.naturalWidth * scale, h = im.naturalHeight * scale;
      o.imageSmoothingQuality = 'high';
      o.drawImage(im, x, floor - h, w, h);
      boxes.push({ x, w, top: floor - h });
      x += w + S * gapF;
    }

    if (wantArrows) {
      o.strokeStyle = '#d21f2b'; o.fillStyle = '#d21f2b';
      o.lineWidth = 13; o.lineCap = 'round';
      const ay = floor - 0.06 * S;
      for (let i = 0; i < n - 1; i++) {
        const a = boxes[i], b = boxes[i + 1];
        const x1 = a.x + a.w + 8, x2 = b.x - 8;
        const ah = Math.min(30, (x2 - x1) * 0.45), aw = ah * 0.6;
        o.beginPath(); o.moveTo(x1, ay); o.lineTo(x2 - ah * 0.85, ay); o.stroke();
        o.beginPath();
        o.moveTo(x2, ay); o.lineTo(x2 - ah, ay - aw); o.lineTo(x2 - ah, ay + aw);
        o.closePath(); o.fill();
      }
    }

    // trim the dead space and re-fit, otherwise the pupil sees four thumbnails
    // hanging at the bottom of a white square
    const box = o.getImageData(0, 0, S, S).data;
    let x0 = S, y0 = S, x1 = 0, y1 = 0;
    for (let y = 0; y < S; y++) for (let x2 = 0; x2 < S; x2++) {
      const i = (y * S + x2) * 4;
      if (box[i + 3] > 16 && (box[i] < 246 || box[i + 1] < 246 || box[i + 2] < 246)) {
        if (x2 < x0) x0 = x2; if (x2 > x1) x1 = x2;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
    const out = document.createElement('canvas'); out.width = S; out.height = S;
    const oo = out.getContext('2d');
    oo.fillStyle = '#ffffff'; oo.fillRect(0, 0, S, S);
    const k2 = Math.min(S / cw, S / ch) * 0.96;
    oo.imageSmoothingQuality = 'high';
    oo.drawImage(c, x0, y0, cw, ch, (S - cw * k2) / 2, (S - ch * k2) / 2, cw * k2, ch * k2);
    return out.toDataURL('image/png');
  }, { data, wantArrows });

  fs.writeFileSync(path.resolve(outPath), Buffer.from(url.split(',')[1], 'base64'));
  await browser.close();
  console.log('-> ' + outPath);
})();
