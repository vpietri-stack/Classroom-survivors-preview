'use strict';
const assert = require('node:assert/strict');
const { chromium } = require('playwright-core');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const url = process.argv[2] || 'http://127.0.0.1:8093/interactive_notes_poc.html';
const qa = path.join(os.tmpdir(), 'classroom-interactive-notes-listening');
fs.mkdirSync(qa, { recursive: true });
let checks = 0;
const ok = (value, label) => { assert.ok(value, label); checks++; console.log('PASS ' + label); };
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 1800 } });
    const page = await context.newPage(), errors = [], external = [], forbidden = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', route => {
      const u = route.request().url();
      if (/\/api\/|speech_engine|speech_recorder|speech_scorer|models\/|wasm/.test(u)) forbidden.push(u);
      if (!u.startsWith(new URL(url).origin)) { external.push(u); return route.abort(); }
      return route.continue();
    });
    await page.addInitScript(() => {
      window.audioTest = { played: [], audio: [], paused: 0, micRequests: 0 };
      const pause = HTMLMediaElement.prototype.pause;
      HTMLMediaElement.prototype.pause = function () { audioTest.paused++; return pause.call(this); };
      HTMLMediaElement.prototype.play = function () {
        audioTest.played.push(this.src); audioTest.audio.push(this);
        if (audioTest.directFails) {
          if (!this.src.startsWith('blob:')) { setTimeout(() => this.dispatchEvent(new Event('error')), 0); return Promise.reject(new Error('media request failed')); }
          setTimeout(() => this.dispatchEvent(new Event('ended')), 40);
        }
        return audioTest.fail ? Promise.reject(new Error('unavailable')) : Promise.resolve();
      };
      if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = () => { audioTest.micRequests++; throw new Error('microphone forbidden'); };
    });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 }); await page.waitForFunction(() => window.InteractiveNotesPOC);
    ok(await page.locator('.note-page').count() === 4, 'all four original infographic pages displayed');
    ok((await page.locator('.page-image').first().getAttribute('src')).endsWith('01-grammar-guide.png'), 'intro page is the first full page');
    ok(await page.locator('.hotspot.word').count() === 12, 'twelve separately clickable vocabulary headings');
    ok(await page.locator('script[src*="speech_"]').count() === 0 && await page.locator('#recordButton').count() === 0, 'no eager speech engine or legacy record control');
    await page.screenshot({ path: path.join(qa, 'intro-desktop.png') });
    const spots = await page.evaluate(() => InteractiveNotesData.pages.flatMap(p => p.hotspots.map(s => ({ id: s.clip, source: InteractiveNotesData.clips[s.clip].audio, text: InteractiveNotesData.clips[s.clip].text }))));
    for (let i = 0; i < spots.length; i++) {
      const button = page.locator('.hotspot').nth(i);
      await button.evaluate(el => el.scrollIntoView({ block: 'center' }));
      await button.click();
      const state = await page.evaluate(() => InteractiveNotesPOC.snapshot());
      ok(state.currentClip === spots[i].id && (await page.locator('#nowPlaying').textContent()) === spots[i].text, 'tap ' + (i + 1) + ': ' + spots[i].id);
      ok((await page.evaluate(() => audioTest.played.at(-1))).endsWith(spots[i].source), 'plays correct file ' + spots[i].source);
    }
    ok(await page.evaluate(() => audioTest.paused >= 48), 'new taps stop previous audio');
    await page.locator('#replay').click();
    ok(await page.evaluate(() => audioTest.played.length === 50), 'replay repeats the selected clip');
    await page.selectOption('#speed', '0.8');
    ok(await page.evaluate(() => audioTest.audio.at(-1).playbackRate === .8), 'speed control updates current audio');
    const selected = await page.evaluate(() => { window.oldEnd = audioTest.audio.at(-1).onended; return InteractiveNotesPOC.snapshot().currentClip; });
    await page.locator('.hotspot.word').first().evaluate(el => el.scrollIntoView({ block: 'center' })); await page.locator('.hotspot.word').first().click();
    await page.evaluate(() => oldEnd());
    ok(await page.evaluate(() => InteractiveNotesPOC.snapshot().currentClip === 'word-boring' && InteractiveNotesPOC.snapshot().playing), 'stale audio-end callback cannot stop a new word');
    await page.locator('#stop').click();
    ok(await page.evaluate(() => !InteractiveNotesPOC.snapshot().playing), 'stop button cancels playback');
    await page.evaluate(() => { audioTest.fail = true; }); await page.locator('#replay').click();
    await page.waitForFunction(() => document.getElementById('playerStatus').textContent.includes('重试'));
    ok(await page.evaluate(() => !InteractiveNotesPOC.snapshot().playing), 'failed audio resets for retry');
    await page.evaluate(() => { audioTest.fail = false; audioTest.directFails = true; });
    await page.locator('[data-clip="word-bored"]').evaluate(el => el.scrollIntoView({ block: 'center' })); await page.locator('[data-clip="word-bored"]').click();
    await page.waitForFunction(() => !InteractiveNotesPOC.snapshot().playing);
    ok((await page.locator('#playerStatus').textContent()).includes('还想听') && await page.evaluate(() => audioTest.played.at(-1).startsWith('blob:')), 'media-request failure retries a full same-origin MP3 through a Blob URL');
    const cachedAudio = await page.evaluate(() => audioTest.played.at(-1));
    await page.locator('#replay').click(); await page.waitForFunction(() => !InteractiveNotesPOC.snapshot().playing);
    ok(await page.evaluate(url => audioTest.played.at(-1) === url, cachedAudio), 'subsequent playback reuses the in-memory audio');
    await page.evaluate(() => { audioTest.directFails = false; });
    await page.locator('#showAreas').check();
    ok(await page.locator('body').evaluate(el => el.classList.contains('show-areas')), 'optional hotspot guide works');
    const missing = await page.evaluate(async () => {
      const urls = [...new Set(Object.values(InteractiveNotesData.clips).map(c => c.audio))];
      const result = await Promise.all(urls.map(src => new Promise(resolve => {
        const a = new Audio(), timer = setTimeout(() => resolve(src), 15000);
        a.onloadedmetadata = () => { clearTimeout(timer); resolve(a.duration > 0 && a.duration < 30 ? null : src); a.removeAttribute('src'); a.load(); };
        a.onerror = () => { clearTimeout(timer); resolve(src); };
        a.src = src;
      })));
      return result.filter(Boolean);
    });
    ok(missing.length === 0, 'all 31 unique local MP3s decode: ' + missing.join(','));
    const hiddenPlayer = await page.addStyleTag({ content: '.player{display:none!important}' });
    for (let i = 0; i < 4; i++) {
      const image = page.locator('.page-image').nth(i); await image.scrollIntoViewIfNeeded();
      await image.evaluate(el => el.decode());
      await page.locator('.paper').nth(i).screenshot({ path: path.join(qa, 'page-' + (i + 1) + '-hotspots.png') });
    }
    await hiddenPlayer.evaluate(el => el.remove()); await page.locator('#showAreas').uncheck();
    await page.reload(); await page.waitForFunction(() => window.InteractiveNotesPOC);
    await page.setViewportSize({ width: 320, height: 900 }); await page.evaluate(() => scrollTo(0, 0));
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '320px phone has no horizontal page overflow');
    await page.screenshot({ path: path.join(qa, 'intro-phone-320.png'), fullPage: false });
    await page.selectOption('#zoom', '2');
    ok(await page.locator('.paper-viewport').first().evaluate(el => el.scrollWidth > el.clientWidth), 'zoom enlarges original pages inside a scrollable viewer');
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'zoom does not overflow whole phone page');
    ok(await page.evaluate(() => audioTest.micRequests === 0 && typeof LocalEngine === 'undefined' && localStorage.length === 0), 'no microphone, model or practice-progress writes');
    ok(external.length === 0 && forbidden.length === 0, 'all playback is same-origin, with no model or API requests');
    ok(errors.length === 0, 'no browser errors: ' + errors.join(','));
    await context.close();
    const realContext = await browser.newContext({ viewport: { width: 1280, height: 1800 } });
    const real = await realContext.newPage();
    await real.route('**/*', route => route.request().url().startsWith(new URL(url).origin) ? route.continue() : route.abort());
    await real.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 }); await real.waitForFunction(() => window.InteractiveNotesPOC);
    await real.locator('[data-clip="intro-puppy"]').first().click();
    await real.waitForFunction(() => !InteractiveNotesPOC.snapshot().playing);
    ok((await real.locator('#playerStatus').textContent()).includes('还想听'), 'real intro sentence audio plays to completion');
    await real.locator('.hotspot.word').first().evaluate(el => el.scrollIntoView({ block: 'center' })); await real.locator('.hotspot.word').first().click();
    await real.waitForFunction(() => !InteractiveNotesPOC.snapshot().playing);
    ok((await real.locator('#nowPlaying').textContent()) === 'boring' && (await real.locator('#playerStatus').textContent()).includes('还想听'), 'real single-word audio plays to completion');
    await realContext.close();
    console.log(checks + ' listening browser checks passed; screenshots: ' + qa);
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
