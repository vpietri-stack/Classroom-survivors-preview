// ============================================================
// build_family_tree.js — composite the canonical family tree and
// export one red-highlighted variant per vocabulary word.
//
//   node build_family_tree.js <specFile.js> <outDir>
//
// spec exports { SIZE, members, couples, structure, variants }.
//   members[id]  = { tile:'gp/tile-1.png', cx, cy, fh }   cy is the FEET line
//   couples      = [{a,b}]  — grey marriage bar in the gap between them
//   structure    = [ [[x,y],...] ]  — grey descent polylines
//   variant      = { file, rings:[ids], brackets:[[ids]],
//                    paths:[[[x,y],...]], arcs:[{from:[x,y],to:[x,y]}] }
//
// Why the tree is drawn and not generated: the same twelve figures must sit
// in the same places in nine PNGs, so a pupil learns to read the diagram once
// and then only watches for the red mark. The generator cannot reproduce a
// layout across nine calls — it supplies the faces, canvas supplies the lines,
// boxes and arrows.
//
// All geometry is fractional. Figures are scaled by fh (a fraction of the
// canvas height) so the children are visibly smaller than the adults, which is
// part of the reading.
// ============================================================
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const [specPath, outDir] = process.argv.slice(2);
if (!specPath || !outDir) {
  console.error('Usage: node build_family_tree.js <spec.js> <outDir>');
  process.exit(2);
}
const spec = require(path.resolve(specPath));
const RED = '#d21f2b';
const GREY = '#9a9a9a';

(async () => {
  const tiles = {};
  for (const [id, m] of Object.entries(spec.members)) {
    const p = path.join(spec.tileRoot, m.tile);
    if (!fs.existsSync(p)) { console.error('missing tile ' + p); process.exit(1); }
    tiles[id] = 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');
  }
  fs.mkdirSync(path.resolve(outDir), { recursive: true });

  const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  await page.setContent('<body></body>');

  const res = await page.evaluate(async ({ spec, tiles, RED, GREY }) => {
    const SIZE = spec.SIZE;
    const K = SIZE / 1024;           // stroke widths and arrowheads are specced at 1024
    const loaded = {};
    for (const [id, url] of Object.entries(tiles)) {
      const im = new Image();
      await new Promise((r, j) => { im.onload = r; im.onerror = j; im.src = url; });
      loaded[id] = im;
    }

    const B = {};
    for (const [id, m] of Object.entries(spec.members)) {
      const im = loaded[id];
      const h = m.fh * SIZE;
      const w = h * (im.naturalWidth / im.naturalHeight);
      B[id] = { cx: m.cx * SIZE, foot: m.cy * SIZE, w, h,
                x: m.cx * SIZE - w / 2, y: m.cy * SIZE - h,
                top: m.cy * SIZE - h, mid: m.cy * SIZE - h * 0.55 };
    }

    function polyline(o, pts, colour, lw) {
      o.strokeStyle = colour; o.lineWidth = lw * K; o.lineJoin = 'round'; o.lineCap = 'round';
      o.beginPath(); o.moveTo(pts[0][0] * SIZE, pts[0][1] * SIZE);
      for (let i = 1; i < pts.length; i++) o.lineTo(pts[i][0] * SIZE, pts[i][1] * SIZE);
      o.stroke();
    }

    function head(o, from, to, colour, prevLen) {
      const x1 = from[0] * SIZE, y1 = from[1] * SIZE, x2 = to[0] * SIZE, y2 = to[1] * SIZE;
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len, px = -uy, py = ux;
      // The last leg of a descent line is short (bus to head is ~4% of the
      // canvas), so a fixed head would be longer than its own shaft.
      const ah = Math.max(14 * K, Math.min(30 * K, (prevLen || len) * 0.55));
      const aw = ah * 0.62;
      o.strokeStyle = colour; o.fillStyle = colour; o.lineWidth = 10 * K; o.lineCap = 'round';
      o.beginPath(); o.moveTo(x1, y1); o.lineTo(x2 - ux * ah * 0.8, y2 - uy * ah * 0.8); o.stroke();
      o.beginPath();
      o.moveTo(x2, y2);
      o.lineTo(x2 - ux * ah + px * aw, y2 - uy * ah + py * aw);
      o.lineTo(x2 - ux * ah - px * aw, y2 - uy * ah - py * aw);
      o.closePath(); o.fill();
    }

    // red path: grey-style elbow that ENDS IN AN ARROWHEAD, so the direction
    // of the relationship (parent -> child) is part of the drawing
    function redPath(o, pts) {
      polyline(o, pts, RED, 10);
      const a = pts[pts.length - 2], b = pts[pts.length - 1];
      head(o, a, b, RED, Math.hypot(b[0] - a[0], b[1] - a[1]) * SIZE);
    }

    function ring(o, b) {
      o.strokeStyle = RED; o.lineWidth = 12 * K;
      o.beginPath();
      o.ellipse(b.cx, b.foot - b.h * 0.50, b.w * 0.68, b.h * 0.58, 0, 0, Math.PI * 2);
      o.stroke();
    }

    function bracket(o, ids) {
      const r = rectOf(ids);
      const x0 = r[0], y0 = r[1], x1 = r[2], y1 = r[3], rad = 34 * K;
      o.strokeStyle = RED; o.lineWidth = 12 * K; o.lineJoin = 'round';
      o.beginPath();
      o.moveTo(x0 + rad, y0);
      o.arcTo(x1, y0, x1, y1, rad);
      o.arcTo(x1, y1, x0, y1, rad);
      o.arcTo(x0, y1, x0, y0, rad);
      o.arcTo(x0, y0, x1, y0, rad);
      o.closePath(); o.stroke();
    }

    // How far a member's MARK extends, not just its body: the ring is wider
    // than the figure and the bracket adds a stroke. Used for both the bracket
    // corners and the per-variant crop, so a highlight never gets cut off.
    function memberRect(id) {
      const b = B[id];
      return [b.cx - b.w * 0.78, b.foot - b.h * 1.16, b.cx + b.w * 0.78, b.foot + b.h * 0.14];
    }
    function rectOf(ids) {
      const rs = ids.map(memberRect);
      const pad = 12 * K;
      return [Math.min(...rs.map(r => r[0])) - pad, Math.min(...rs.map(r => r[1])) - pad,
              Math.max(...rs.map(r => r[2])) + pad, Math.max(...rs.map(r => r[3])) + pad];
    }
    function cropRect(v) {
      if (!v.focus) return [0, 0, SIZE, SIZE];
      let [x0, y0, x1, y1] = rectOf(v.focus);
      const eat = pts => pts.forEach(p => {
        x0 = Math.min(x0, p[0] * SIZE - 16 * K); y0 = Math.min(y0, p[1] * SIZE - 16 * K);
        x1 = Math.max(x1, p[0] * SIZE + 16 * K); y1 = Math.max(y1, p[1] * SIZE + 16 * K);
      });
      (v.ties || []).forEach(eat);
      (v.arcs || []).forEach(a => eat([a.from, a.to]));
      const g = 0.02 * SIZE;
      x0 = Math.max(0, x0 - g); y0 = Math.max(0, y0 - g);
      x1 = Math.min(SIZE, x1 + g); y1 = Math.min(SIZE, y1 + g);
      return [x0, y0, x1 - x0, y1 - y0];
    }

    const full = document.createElement('canvas');
    full.width = SIZE; full.height = SIZE;
    const fo = full.getContext('2d');
    fo.fillStyle = '#ffffff'; fo.fillRect(0, 0, SIZE, SIZE);
    fo.strokeStyle = GREY; fo.lineWidth = 4 * K;
    for (const cp of spec.couples) {
      const a = B[cp.a], b = B[cp.b];
      fo.beginPath();
      fo.moveTo(a.cx + a.w / 2 + 6 * K, a.mid);
      fo.lineTo(b.cx - b.w / 2 - 6 * K, b.mid);
      fo.stroke();
      fo.fillStyle = GREY;
      fo.beginPath(); fo.arc((a.cx + b.cx) / 2, a.mid, 9 * K, 0, Math.PI * 2); fo.fill();
    }
    for (const s of spec.structure) polyline(fo, s, GREY, 4);
    for (const [id, m] of Object.entries(spec.members)) {
      const b = B[id];
      fo.imageSmoothingQuality = 'high';
      fo.drawImage(loaded[id], b.x, b.y, b.w, b.h);
    }

    const shots = [];
    for (const v of spec.variants) {
      const c = document.createElement('canvas'); c.width = SIZE; c.height = SIZE;
      const o = c.getContext('2d');
      // left transparent on purpose: this layer is composited OVER the tree,
      // and an opaque white fill here would erase it
      for (const g of (v.brackets || [])) bracket(o, g);
      for (const t of (v.ties || [])) polyline(o, t, RED, 10);
      for (const id of (v.rings || [])) ring(o, B[id]);
      for (const p of (v.paths || [])) redPath(o, p);
      for (const a of (v.arcs || [])) head(o, a.from, a.to, RED);

      // composite the marks over the (already drawn) tree, then crop
      const tmp = document.createElement('canvas'); tmp.width = SIZE; tmp.height = SIZE;
      const t2 = tmp.getContext('2d');
      t2.drawImage(full, 0, 0);
      t2.drawImage(c, 0, 0);

      const [cx0, cy0, cw, ch] = cropRect(v);
      const out = document.createElement('canvas'); out.width = SIZE; out.height = SIZE;
      const oo = out.getContext('2d');
      oo.fillStyle = '#ffffff'; oo.fillRect(0, 0, SIZE, SIZE);
      const k = Math.min(SIZE / cw, SIZE / ch) * 0.97;
      oo.imageSmoothingQuality = 'high';
      oo.drawImage(tmp, cx0, cy0, cw, ch,
        (SIZE - cw * k) / 2, (SIZE - ch * k) / 2, cw * k, ch * k);
      shots.push({ file: v.file, url: out.toDataURL('image/png'), crop: [cx0 / SIZE, cy0 / SIZE, cw / SIZE, ch / SIZE] });
    }

    const cols = 3, cell = 300;
    const rows = Math.ceil(shots.length / cols);
    const cs = document.createElement('canvas');
    cs.width = cols * (cell + 10) + 10; cs.height = rows * (cell + 36) + 10;
    const cc = cs.getContext('2d');
    cc.fillStyle = '#f2f2f2'; cc.fillRect(0, 0, cs.width, cs.height);
    for (let i = 0; i < shots.length; i++) {
      const im = new Image();
      await new Promise(r => { im.onload = r; im.src = shots[i].url; });
      const gx = 10 + (i % cols) * (cell + 10), gy = 10 + Math.floor(i / cols) * (cell + 36);
      cc.fillStyle = '#fff'; cc.fillRect(gx, gy, cell, cell);
      cc.drawImage(im, gx, gy, cell, cell);
      cc.fillStyle = '#c00'; cc.font = 'bold 17px sans-serif';
      cc.fillText(shots[i].file, gx + 2, gy + cell + 22);
    }
    return { shots: shots.map(s => s.url), files: shots.map(s => s.file), contact: cs.toDataURL('image/png') };
  }, { spec, tiles, RED, GREY });

  res.shots.forEach((url, i) => {
    fs.writeFileSync(path.join(path.resolve(outDir), res.files[i]), Buffer.from(url.split(',')[1], 'base64'));
    console.log('wrote ' + res.files[i]);
  });
  fs.writeFileSync('tmp_tree_review.png', Buffer.from(res.contact.split(',')[1], 'base64'));
  await browser.close();
  console.log('\n' + res.files.length + ' variants -> ' + path.resolve(outDir));
  console.log('review -> tmp_tree_review.png');
})();
