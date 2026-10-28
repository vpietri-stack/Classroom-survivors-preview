'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const lesson = require('./interactive_notes_data.js');
let checks = 0;
const ok = (condition, label) => { assert.ok(condition, label); checks++; };
ok(lesson.pages.length === 4 && lesson.pages[0].file === '01-grammar-guide.png', 'four original pages, intro first');
ok(Object.values(lesson.clips).filter(x => x.kind === 'word').length === 12, 'all twelve vocabulary words have separate audio');
ok(Object.keys(lesson.clips).length === 32, 'all vocabulary, examples, intro sentences and phrase present');
const referenced = new Set();
for (const page of lesson.pages) {
  const image = fs.readFileSync(path.join(__dirname, 'interactive_notes_assets', page.file));
  ok(image.readUInt32BE(16) === page.width && image.readUInt32BE(20) === page.height, page.file + ': coordinate dimensions match source');
  for (const spot of page.hotspots) {
    ok(lesson.clips[spot.clip], 'hotspot has a clip');
    const [x, y, w, h] = spot.rect;
    ok(x >= 0 && y >= 0 && w > 0 && h > 0 && x + w <= page.width && y + h <= page.height, 'hotspot stays on original page');
    referenced.add(spot.clip);
  }
}
for (const clip of Object.values(lesson.clips)) {
  ok(referenced.has(clip.id), clip.id + ': reachable by tapping');
  const mp3 = fs.readFileSync(path.join(__dirname, clip.audio));
  ok(mp3.length >= 1000 && (mp3.subarray(0, 3).toString() === 'ID3' || (mp3[0] === 255 && (mp3[1] & 224) === 224)), clip.id + ': valid MP3 signature');
  ok(clip.text && clip.translation, clip.id + ': original caption and translation');
}
for (const pair of lesson.pairs) for (const item of [pair.left, pair.right]) {
  const word = lesson.clips['word-' + item.word];
  const sentence = lesson.clips['sentence-' + item.word];
  ok(word.text === item.word && sentence.text === item.sentence && word.audio !== sentence.audio, item.word + ': word and sentence are different recordings');
}
const html = fs.readFileSync(path.join(__dirname, 'interactive_notes_poc.html'), 'utf8');
const js = fs.readFileSync(path.join(__dirname, 'interactive_notes_poc.js'), 'utf8');
ok(!/speech_engine|speech_scorer|speech_recorder|frontend_auth|interactive_notes_core|speech_sample/.test(html), 'no eager speech engine, account or collection scripts');
ok(!/getUserMedia|LocalEngine|Recorder|localStorage|indexedDB|apiFetch/.test(js), 'base listening controller delegates optional practice without capture, storage or API paths');
console.log(checks + ' listening-note checks passed');
