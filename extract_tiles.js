// ============================================================
// extract_tiles.js — cut a row-sheet into N figure tiles using the
// WHITE GUTTERS between figures, not a fixed grid.
//
//   node extract_tiles.js <sheet.png> <outDir> <n> [--bands "x0,x1;x0,x1"]
//
// --bands overrides the gutter search with fractional column bands. Needed
// when the generator draws its OWN divider line down the middle of a
// two-figure sheet — that line is ink, so no gutter spans it.
//
// slice_vocab_sheet.js cuts on exact column boundaries and takes a 2% inset.
// That is fine when icons are small and centred, but the family-tree figures
// are drawn so their hair and arms cross the nominal boundary — an inset cut
// either clips a character or drags in a piece of its neighbour. This finds
// the N-1 widest all-white vertical bands and cuts there instead, then trims
// each band to its own content box and writes <outDir>/tile-<i>.png (tight,
// no padding, no square canvas — the compositor scales them).
// ============================================================
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const argv = process.argv.slice(2);
const getOpt = (name, dflt) => {
  const i = argv.indexOf('--' + name);
  if (i < 0) return dflt;
  const v = argv[i + 1]; argv.splice(i, 2); return v;
};
const [sheetPath, outDir, nArg] = argv;
if (!sheetPath || !outDir || !nArg) {
  console.error('Usage: node extract_tiles.js <sheet.png> <outDir> <n>');
  process.exit(2);
}
const N = parseInt(nArg, 10);
const CLEARS = (() => {
  const v = getOpt('clear', null);
  if (!v) return [];
  return v.split(';').filter(Boolean).map(r => {
    const [x, y, w, h] = r.split(',').map(Number);
    return { x, y, w, h };
  });
})();
const BANDS = (() => {
  const v = getOpt('bands', null);
  if (!v) return null;
  return v.split(';').filter(Boolean).map(b => {
    const [a, c] = b.split(',').map(Number);
    return { x0: a, x1: c };
  });
})();

(async () => {
  const b64 = 'data:image/png;base64,' + fs.readFileSync(path.resolve(sheetPath)).toString('base64');
  const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  await page.setContent('<body></body>');

  const res = await page.evaluate(async ({ b64, N, bands, clears }) => {
    const img = new Image();
    await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = b64; });
    const W = img.naturalWidth, H = img.naturalHeight;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0);

    // The generator's "Qoder AI 生成" mark sits bottom-right. Clear a generous
    // corner before measuring anything; the figures never reach it.
    g.fillStyle = '#ffffff';
    g.fillRect(Math.floor(W * 0.86), Math.floor(H * 0.90), W, H);
    // --clear "x,y,w,h;..." for a watermark the default corner misses. Painted
    // BEFORE the whitening pass below, so the patch becomes indistinguishable
    // from the rest of the paper background instead of showing as a bright
    // rectangle over the tint.
    (clears || []).forEach(r => g.fillRect(r.x, r.y, r.w, r.h));
    const d = g.getImageData(0, 0, W, H);
    // The generator's "white" is a warm paper tint around 244-250. Left alone it
    // survives the trim as a visible grey rectangle behind every figure once the
    // tree is composited on real white. Neutralise near-white but keep colour:
    // skin and washes are warm (r-b > 12), the paper is not.
    {
      const p = d.data;
      for (let i = 0; i < p.length; i += 4) {
        const mn = Math.min(p[i], p[i + 1], p[i + 2]);
        const mx = Math.max(p[i], p[i + 1], p[i + 2]);
        if (mn > 214 && mx - mn < 14) { p[i] = p[i + 1] = p[i + 2] = 255; }
      }
      g.putImageData(d, 0, 0);
    }
    const dd = g.getImageData(0, 0, W, H).data;
    const inkAt = (x, y) => {
      const i = (y * W + x) * 4;
      return dd[i + 3] > 16 && (dd[i] < 200 || dd[i + 1] < 200 || dd[i + 2] < 200);
    };
    const col = new Int32Array(W);
    for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) if (inkAt(x, y)) col[x]++;

    // candidate gutters: runs of columns carrying almost no ink
    const limit = Math.max(2, Math.round(H * 0.004));
    const gutters = [];
    let s = -1;
    for (let x = 0; x <= W; x++) {
      const blank = x < W && col[x] <= limit;
      if (blank && s < 0) s = x;
      if (!blank && s >= 0) { gutters.push({ from: s, to: x - 1, w: x - s }); s = -1; }
    }
    const bounds = [];
    if (bands) {
      bands.forEach(b => { bounds.push(Math.round(b.x0 * W), Math.round(b.x1 * W)); });
    } else {
      // Interior runs only: the sheet's own left/right margins are the widest
      // blank runs of all, and picking one as a "gutter" makes an empty tile.
      const cut = gutters.filter(g => g.from > 0 && g.to < W - 1 && g.w >= 6)
        .sort((a, b) => b.w - a.w).slice(0, N - 1)
        .sort((a, b) => a.from - b.from);
      if (cut.length !== N - 1) {
        return { error: 'found ' + cut.length + ' gutters, need ' + (N - 1) +
          ' (' + gutters.map(g => g.w).join(' ') + ')' };
      }
      const edge = [0, ...cut.map(g => Math.round((g.from + g.to) / 2)), W];
      for (let i = 0; i < N; i++) bounds.push(edge[i], edge[i + 1]);
    }

    const tiles = [];
    for (let i = 0; i < N; i++) {
      const x0 = bounds[i * 2], x1 = bounds[i * 2 + 1] - 1;
      let minX = -1, maxX = -1, minY = -1, maxY = -1;
      for (let x = x0; x <= x1; x++) for (let y = 0; y < H; y++) {
        if (!inkAt(x, y)) continue;
        if (minX < 0) { minX = maxX = x; minY = maxY = y; }
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
      if (minX < 0) return { error: 'tile ' + (i + 1) + ' is empty' };
      const out = document.createElement('canvas');
      out.width = maxX - minX + 1; out.height = maxY - minY + 1;
      const o = out.getContext('2d');
      o.drawImage(c, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
      tiles.push({ url: out.toDataURL('image/png'), w: out.width, h: out.height });
    }

    // review strip
    const strip = document.createElement('canvas');
    strip.width = N * 210; strip.height = 320;
    const sc = strip.getContext('2d');
    sc.fillStyle = '#f2f2f2'; sc.fillRect(0, 0, strip.width, strip.height);
    for (let i = 0; i < N; i++) {
      const im = new Image();
      await new Promise(r => { im.onload = r; im.src = tiles[i].url; });
      const k = Math.min(190 / tiles[i].w, 290 / tiles[i].h);
      sc.drawImage(im, i * 210 + 10, 20 + (290 - tiles[i].h * k) / 2, tiles[i].w * k, tiles[i].h * k);
      sc.fillStyle = '#c00'; sc.font = 'bold 24px sans-serif';
      sc.fillText(String(i + 1), i * 210 + 12, 314);
    }
    return { tiles: tiles.map(t => t.url), sizes: tiles.map(t => t.w + 'x' + t.h), contact: strip.toDataURL('image/png') };
  }, { b64, N, bands: BANDS, clears: CLEARS });

  if (res.error) { console.error('FAIL: ' + res.error); await browser.close(); process.exit(1); }
  fs.mkdirSync(outDir, { recursive: true });
  res.tiles.forEach((url, i) => {
    const p = path.join(outDir, 'tile-' + (i + 1) + '.png');
    fs.writeFileSync(p, Buffer.from(url.split(',')[1], 'base64'));
    console.log('tile-' + (i + 1) + '  ' + res.sizes[i]);
  });
  fs.writeFileSync('tmp_tiles_review.png', Buffer.from(res.contact.split(',')[1], 'base64'));
  await browser.close();
  console.log('\nreview -> tmp_tiles_review.png');
})();
