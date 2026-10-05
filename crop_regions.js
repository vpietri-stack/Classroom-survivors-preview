// ============================================================
// crop_regions.js — slice a sheet by CONTENT, not by grid.
//
//   node crop_regions.js <sheet.png> <outPrefix> [--min 40]
//
// The image generator sometimes ignores a requested grid (it drew one icon
// oversized and merged cells). This finds the non-white blobs, merges blobs
// that are close together (so a loudspeaker keeps its sound waves and music
// notes), then exports each region contain-fitted onto a 512x512 white canvas
// in reading order, and prints a numbered contact sheet for mapping.
//
// Uses playwright-core + Chrome canvas: no ImageMagick on this host.
// ============================================================
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const [sheetPath, prefix, minArg] = process.argv.slice(2);
if (!sheetPath || !prefix) {
  console.error('Usage: node crop_regions.js <sheet.png> <outPrefix> [--min 40]');
  console.error('       node crop_regions.js <sheet.png> <outPrefix> --rects "x,y,w,h;x,y,w.h;..."');
  process.exit(2);
}
const MIN = parseInt((minArg || '').replace('--min', '') || '40', 10);

// Explicit rectangles win: the auto blob merge is defeated by any faint grid
// line the generator leaves behind, which bridges every cell into one region.
const RECTS = (() => {
  const i = process.argv.indexOf('--rects');
  if (i < 0) return null;
  return process.argv[i + 1].split(';').filter(Boolean).map(r => {
    const [x, y, w, h] = r.split(',').map(Number);
    return { x, y, w, h };
  });
})();

// Optional --clear "x,y,w,h;x,y,w,h" paints those source rectangles pure white
// before anything is measured or cropped. Needed when the generator's
// "Qoder AI 生成" watermark lands on top of artwork rather than in dead space.
const CLEARS = (() => {
  const i = process.argv.indexOf('--clear');
  if (i < 0) return [];
  return process.argv[i + 1].split(';').filter(Boolean).map(r => {
    const [x, y, w, h] = r.split(',').map(Number);
    return { x, y, w, h };
  });
})();

(async () => {
  const b64 = 'data:image/png;base64,' + fs.readFileSync(path.resolve(sheetPath)).toString('base64');
  const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  await page.setContent('<body></body>');

  const res = await page.evaluate(async ({ b64, MIN, rects, clears }) => {
    const img = new Image();
    await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = b64; });
    const W = img.naturalWidth, H = img.naturalHeight;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    // Paint the watermark rectangles pure white, then work from THIS canvas for
    // every later read and every crop — drawing from the original `img` again
    // would put the mark back.
    (clears || []).forEach(c => { ctx.fillStyle = '#ffffff'; ctx.fillRect(c.x, c.y, c.w, c.h); });
    const src = c;
    const d = ctx.getImageData(0, 0, W, H).data;

    // coarse mask: a CELL is ink if enough of its pixels are non-near-white
    const S = 8;                                   // cell size in px
    const cw = Math.ceil(W / S), ch = Math.ceil(H / S);
    const ink = new Uint8Array(cw * ch);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (d[i] < 238 || d[i + 1] < 238 || d[i + 2] < 238) {
        ink[Math.floor(y / S) * cw + Math.floor(x / S)]++;
      }
    }
    let keep;
    if (rects && rects.length) {
      keep = rects.map(r => ({ x: r.x, y: r.y, w: r.w, h: r.h }));
    } else {
    const on = k => ink[k] >= 3;

    // 8-connected flood fill over cells, then merge boxes separated by a small gap
    const seen = new Uint8Array(cw * ch);
    const boxes = [];
    for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) {
      const k0 = cy * cw + cx;
      if (!on(k0) || seen[k0]) continue;
      const st = [k0]; seen[k0] = 1;
      let x0 = cx, x1 = cx, y0 = cy, y1 = cy, n = 0;
      while (st.length) {
        const k = st.pop(); n++;
        const kx = k % cw, ky = (k - kx) / cw;
        if (kx < x0) x0 = kx; if (kx > x1) x1 = kx;
        if (ky < y0) y0 = ky; if (ky > y1) y1 = ky;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = kx + dx, ny = ky + dy;
          if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue;
          const nk = ny * cw + nx;
          if (on(nk) && !seen[nk]) { seen[nk] = 1; st.push(nk); }
        }
      }
      boxes.push({ x0, y0, x1, y1, n });
    }

    const GAP = 4;                                  // merge cells within 32px
    let merged = true;
    while (merged) {
      merged = false;
      outer: for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        if (a.x0 - GAP > b.x1 + 1 || b.x0 - GAP > a.x1 + 1 ||
            a.y0 - GAP > b.y1 + 1 || b.y0 - GAP > a.y1 + 1) continue;
        boxes[i] = { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0),
                     x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1), n: a.n + b.n };
        boxes.splice(j, 1); merged = true; break outer;
      }
    }

    keep = boxes.filter(b => b.n >= MIN)
      .map(b => ({ x: b.x0 * S, y: b.y0 * S, w: (b.x1 - b.x0 + 1) * S, h: (b.y1 - b.y0 + 1) * S, n: b.n }))
      .map(r => ({ x: Math.max(0, r.x - 12), y: Math.max(0, r.y - 12),
                   w: Math.min(W - r.x + 12, r.w + 24), h: Math.min(H - r.y + 12, r.h + 24), n: r.n }));

    // reading order: band rows by vertical centre, then left to right
    keep.sort((a, b) => (Math.floor(a.y / 120) - Math.floor(b.y / 120)) || (a.x - b.x));
    }

    const shots = [];
    for (const r of keep) {
      const out = document.createElement('canvas'); out.width = 512; out.height = 512;
      const o = out.getContext('2d');
      o.fillStyle = '#ffffff'; o.fillRect(0, 0, 512, 512);
      const sc = Math.min(512 / r.w, 512 / r.h);
      const w = r.w * sc, h = r.h * sc;
      o.imageSmoothingQuality = 'high';
      o.drawImage(src, r.x, r.y, r.w, r.h, (512 - w) / 2, (512 - h) / 2, w, h);
      shots.push({ url: out.toDataURL('image/png'), box: r });
    }

    // labelled contact sheet
    const cs = document.createElement('canvas');
    const cols = Math.min(4, Math.max(1, shots.length));
    const rows = Math.ceil(shots.length / cols) || 1;
    cs.width = cols * 200; cs.height = rows * 220;
    const cc = cs.getContext('2d');
    cc.fillStyle = '#f2f2f2'; cc.fillRect(0, 0, cs.width, cs.height);
    for (let i = 0; i < shots.length; i++) {
      const im = new Image();
      await new Promise(r => { im.onload = r; im.src = shots[i].url; });
      const cx = (i % cols) * 200, cyy = Math.floor(i / cols) * 220;
      cc.fillStyle = '#fff'; cc.fillRect(cx + 4, cyy + 4, 192, 192);
      cc.drawImage(im, cx + 8, cyy + 8, 184, 184);
      cc.fillStyle = '#c00'; cc.font = 'bold 22px sans-serif';
      cc.fillText(String(i + 1), cx + 10, cyy + 214);
    }
    return { shots: shots.map(s => s.url), boxes: shots.map(s => s.box), contact: cs.toDataURL('image/png') };
  }, { b64, MIN, rects: RECTS, clears: CLEARS });

  res.shots.forEach((url, i) => {
    const out = path.join('images', 'vocab', prefix + '-' + (i + 1) + '.png');
    fs.writeFileSync(out, Buffer.from(url.split(',')[1], 'base64'));
    const b = res.boxes[i];
    console.log((i + 1) + '. ' + out + '   src ' + b.w + 'x' + b.h + ' @ ' + b.x + ',' + b.y);
  });
  fs.writeFileSync('tmp_region_review.png', Buffer.from(res.contact.split(',')[1], 'base64'));
  await browser.close();
  console.log('\n' + res.shots.length + ' regions -> tmp_region_review.png');
})();
