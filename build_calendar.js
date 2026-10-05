// ============================================================
// build_calendar.js — the days-of-the-week / frequency vocab icons.
//
//   node build_calendar.js <outDir>
//
// Drawn with canvas instead of generated: these are DIAGRAMS whose meaning
// lives in the labels, and the image generator garbles short text ("STSEE",
// "WECIAL" in earlier batches). Canvas also lets us honour the rule that the
// picture must never print the word the pupil is supposed to recognise — the
// target day's card carries a star, not its name.
//
// Everything shares one calendar-page shell so day / week / month / year read
// as a graded set: one card, seven cards, thirty squares, twelve pages.
// ============================================================
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const outDir = process.argv[2];
if (!outDir) { console.error('Usage: node build_calendar.js <outDir>'); process.exit(2); }

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME_PATH, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 900, height: 900 } });
  await page.setContent('<body></body>');

  const res = await page.evaluate(async ({ DAYS }) => {
    const S = 1024;
    const INK = '#2f2a26', RED = '#d21f2b', LINE = '#b9b1a6', CARD = '#ffffff';
    const HL = '#ffe9a8', WEND = '#ffd7d2';
    const FONT = '"Arial Rounded MT Bold", Arial, sans-serif';
    const shots = [];

    const cv = () => { const c = document.createElement('canvas'); c.width = S; c.height = S; return c; };
    function rr(o, x, y, w, h, r) {
      o.beginPath();
      o.moveTo(x + r, y);
      o.arcTo(x + w, y, x + w, y + h, r);
      o.arcTo(x + w, y + h, x, y + h, r);
      o.arcTo(x, y + h, x, y, r);
      o.arcTo(x, y, x + w, y, r);
      o.closePath();
    }
    function card(o, x, y, w, h, fill) {
      rr(o, x, y, w, h, 18);
      o.fillStyle = fill || CARD; o.fill();
      o.strokeStyle = LINE; o.lineWidth = 5; o.stroke();
    }
    function ring(o, x, y, w, h) {
      rr(o, x - 12, y - 12, w + 24, h + 24, 26);
      o.strokeStyle = RED; o.lineWidth = 14; o.stroke();
    }
    // apple() and sun() both leave a colour in strokeStyle, so a ring drawn
    // straight after one of them inherits it unless this sets it explicitly
    function circleRing(o, cx, cy, r) {
      o.strokeStyle = RED; o.lineWidth = 13;
      o.beginPath(); o.arc(cx, cy, r, 0, Math.PI * 2); o.stroke();
    }
    function star(o, cx, cy, r) {
      o.fillStyle = RED; o.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r * 0.45 : r;
        o[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
      }
      o.closePath(); o.fill();
    }
    function sun(o, cx, cy, r) {
      o.fillStyle = '#f6c445'; o.strokeStyle = '#e0a21c'; o.lineWidth = r * 0.13;
      o.beginPath(); o.arc(cx, cy, r * 0.62, 0, Math.PI * 2); o.fill(); o.stroke();
      o.strokeStyle = '#e0a21c'; o.lineWidth = r * 0.16; o.lineCap = 'round';
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        o.beginPath();
        o.moveTo(cx + Math.cos(a) * r * 0.78, cy + Math.sin(a) * r * 0.78);
        o.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
        o.stroke();
      }
    }
    function moon(o, cx, cy, r) {
      o.fillStyle = '#8fa9d8';
      o.beginPath(); o.arc(cx, cy, r * 0.72, 0, Math.PI * 2); o.fill();
      o.fillStyle = CARD;
      o.beginPath(); o.arc(cx + r * 0.34, cy - r * 0.18, r * 0.62, 0, Math.PI * 2); o.fill();
    }
    function apple(o, cx, cy, r) {
      o.fillStyle = '#d94141';
      o.beginPath(); o.arc(cx - r * 0.34, cy, r * 0.68, 0, Math.PI * 2);
      o.arc(cx + r * 0.34, cy, r * 0.68, 0, Math.PI * 2); o.fill();
      o.strokeStyle = '#7a4a1e'; o.lineWidth = r * 0.14; o.lineCap = 'round';
      o.beginPath(); o.moveTo(cx, cy - r * 0.6); o.lineTo(cx + r * 0.1, cy - r * 1.0); o.stroke();
      o.fillStyle = '#4d9a3a';
      o.beginPath(); o.ellipse(cx + r * 0.42, cy - r * 0.86, r * 0.34, r * 0.17, -0.5, 0, Math.PI * 2); o.fill();
    }
    function label(o, txt, cx, cy, size, colour) {
      o.fillStyle = colour || INK;
      o.font = 'bold ' + size + 'px ' + FONT;
      o.textAlign = 'center'; o.textBaseline = 'middle';
      o.fillText(txt, cx, cy);
    }
    // the shared calendar page: outer sheet + blue header band + binder rings
    function sheet(o) {
      o.fillStyle = '#ffffff'; o.fillRect(0, 0, S, S);
      rr(o, 40, 60, S - 80, S - 120, 30);
      o.fillStyle = CARD; o.fill();
      o.strokeStyle = LINE; o.lineWidth = 7; o.stroke();
      o.save(); rr(o, 40, 60, S - 80, S - 120, 30); o.clip();
      o.fillStyle = '#4a8fd0'; o.fillRect(40, 60, S - 80, 110);
      o.restore();
      o.fillStyle = '#dfe8f2';
      for (let i = 0; i < 4; i++) {
        const x = 200 + i * 208;
        o.beginPath(); o.arc(x, 78, 15, 0, Math.PI * 2); o.fill();
        o.strokeStyle = '#8d97a3'; o.lineWidth = 8;
        o.beginPath(); o.arc(x, 62, 15, Math.PI, 0); o.stroke();
      }
    }
    // 4 + 3 grid of day cards inside the sheet
    const GRID = (() => {
      const w = 208, h = 250, gx = 26, gy = 34;
      const x0 = 66, y0 = 212;
      const pos = [];
      for (let i = 0; i < 4; i++) pos.push([x0 + i * (w + gx), y0]);
      for (let i = 0; i < 3; i++) pos.push([x0 + (i + 0.5) * (w + gx), y0 + h + gy]);
      return { w, h, gy, pos };
    })();

    function dayPage(target, opts) {
      const c = cv(), o = c.getContext('2d');
      sheet(o);
      GRID.pos.forEach((p, i) => {
        const [x, y] = p;
        const isTarget = target === i;
        const isWend = opts && opts.weekend && (i === 5 || i === 6);
        card(o, x, y, GRID.w, GRID.h, isTarget ? HL : (isWend ? WEND : null));
        if (opts && opts.suns) sun(o, x + GRID.w / 2, y + GRID.h / 2, GRID.w * 0.34);
        label(o, String(i + 1), x + 26, y + 30, 40, '#9a9187');
        if (!isTarget && !(opts && opts.suns)) label(o, DAYS[i], x + GRID.w / 2, y + GRID.h * 0.56, 62);
        if (isTarget) star(o, x + GRID.w / 2, y + GRID.h * 0.58, GRID.w * 0.32);
        if (isTarget || (opts && opts.weekend && (i === 5 || i === 6))) ring(o, x, y, GRID.w, GRID.h);
      });
      if (opts && opts.bracket) {
        rr(o, 50, 196, S - 100, GRID.h * 2 + GRID.gy + 40, 34);
        o.strokeStyle = RED; o.lineWidth = 16; o.stroke();
      }
      return c.toDataURL('image/png');
    }

    const FULL = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    DAYS.forEach((_, i) => shots.push({ file: FULL[i] + '.png', url: dayPage(i) }));

    shots.push({ file: 'week.png', url: dayPage(-1, { bracket: true }) });
    shots.push({ file: 'weekend.png', url: dayPage(-1, { weekend: true }) });
    shots.push({ file: 'everyday.png', url: dayPage(-1, { suns: true, bracket: true }) });

    // --- day: one card holding a whole sun-to-moon cycle -------------------
    {
      const c = cv(), o = c.getContext('2d');
      o.fillStyle = '#ffffff'; o.fillRect(0, 0, S, S);
      card(o, 200, 190, 624, 640);
      ring(o, 200, 190, 624, 640);
      sun(o, 366, 430, 130);
      moon(o, 662, 430, 130);
      label(o, '1', 512, 690, 190, INK);
      shots.push({ file: 'day.png', url: c.toDataURL('image/png') });
    }

    // --- month: a 7 x 5 numbered grid -------------------------------------
    {
      const c = cv(), o = c.getContext('2d');
      sheet(o);
      const x0 = 74, y0 = 196, w = 122, h = 118;
      DAYS.forEach((d, i) => label(o, d, x0 + i * w + w / 2, y0 + 34, 40, '#6f6a63'));
      for (let n = 1; n <= 30; n++) {
        const i = n - 1, col = i % 7, row = Math.floor(i / 7);
        const x = x0 + col * w, y = y0 + 66 + row * h;
        card(o, x + 5, y + 5, w - 10, h - 10);
        label(o, String(n), x + w / 2, y + 5 + (h - 10) / 2, 46);
      }
      rr(o, 60, y0 - 12, S - 120, 66 + 5 * h + 14, 26);
      o.strokeStyle = RED; o.lineWidth = 16; o.stroke();
      shots.push({ file: 'month.png', url: c.toDataURL('image/png') });
    }

    // --- year: twelve month pages -----------------------------------------
    {
      const c = cv(), o = c.getContext('2d');
      o.fillStyle = '#ffffff'; o.fillRect(0, 0, S, S);
      const w = 206, h = 258, gx = 22, gy = 24, x0 = 52, y0 = 78;
      const season = ['#7ec96b', '#f6c445', '#e8863c', '#7fb8e8'];
      for (let n = 0; n < 12; n++) {
        const col = n % 4, row = Math.floor(n / 4);
        const x = x0 + col * (w + gx), y = y0 + row * (h + gy);
        card(o, x, y, w, h);
        o.save(); rr(o, x, y, w, h, 18); o.clip();
        o.fillStyle = season[Math.floor(n / 3)]; o.fillRect(x, y, w, 52);
        o.restore();
        label(o, String(n + 1), x + w / 2, y + h * 0.58, 92);
      }
      rr(o, x0 - 22, y0 - 22, 4 * w + 3 * gx + 44, 3 * h + 2 * gy + 44, 30);
      o.strokeStyle = RED; o.lineWidth = 16; o.stroke();
      shots.push({ file: 'year.png', url: c.toDataURL('image/png') });
    }

    // --- always: a full bar and five filled stars --------------------------
    {
      const c = cv(), o = c.getContext('2d');
      o.fillStyle = '#ffffff'; o.fillRect(0, 0, S, S);
      const bx = 90, by = 430, bw = S - 180, bh = 190;
      rr(o, bx, by, bw, bh, 60); o.fillStyle = '#eae4da'; o.fill();
      o.strokeStyle = LINE; o.lineWidth = 6; o.stroke();
      o.save(); rr(o, bx, by, bw, bh, 60); o.clip();
      o.fillStyle = '#4caf50'; o.fillRect(bx, by, bw, bh);
      o.restore();
      label(o, '100%', bx + bw / 2, by + bh / 2, 110, '#ffffff');
      for (let i = 0; i < 5; i++) star(o, 190 + i * 162, 220, 66);
      sun(o, 512, 800, 120);
      shots.push({ file: 'always.png', url: c.toDataURL('image/png') });
    }

    // --- every: each one of the row, individually ringed -------------------
    {
      const c = cv(), o = c.getContext('2d');
      o.fillStyle = '#ffffff'; o.fillRect(0, 0, S, S);
      const r = 92;
      [[212, 360], [512, 360], [812, 360], [362, 700], [662, 700]].forEach(p => {
        apple(o, p[0], p[1], r);
        circleRing(o, p[0], p[1], r * 1.5);
      });
      shots.push({ file: 'every.png', url: c.toDataURL('image/png') });
    }

    // contact sheet
    const cols = 4, cell = 250;
    const rows = Math.ceil(shots.length / cols);
    const cs = cv(); cs.width = cols * (cell + 8) + 8; cs.height = rows * (cell + 30) + 8;
    const cc = cs.getContext('2d');
    cc.fillStyle = '#f2f2f2'; cc.fillRect(0, 0, cs.width, cs.height);
    for (let i = 0; i < shots.length; i++) {
      const im = new Image();
      await new Promise(r => { im.onload = r; im.src = shots[i].url; });
      const gx = 8 + (i % cols) * (cell + 8), gy = 8 + Math.floor(i / cols) * (cell + 30);
      cc.fillStyle = '#fff'; cc.fillRect(gx, gy, cell, cell);
      cc.drawImage(im, gx, gy, cell, cell);
      cc.fillStyle = '#c00'; cc.font = 'bold 17px sans-serif'; cc.textAlign = 'left';
      cc.fillText(shots[i].file, gx + 2, gy + cell + 20);
    }
    return { shots: shots.map(s => s.url), files: shots.map(s => s.file), contact: cs.toDataURL('image/png') };
  }, { DAYS });

  fs.mkdirSync(path.resolve(outDir), { recursive: true });
  res.shots.forEach((url, i) => {
    fs.writeFileSync(path.join(path.resolve(outDir), res.files[i]), Buffer.from(url.split(',')[1], 'base64'));
  });
  fs.writeFileSync('tmp_calendar_review.png', Buffer.from(res.contact.split(',')[1], 'base64'));
  await browser.close();
  console.log(res.files.join(' '));
  console.log('\n' + res.files.length + ' -> ' + path.resolve(outDir));
  console.log('review -> tmp_calendar_review.png');
})();
