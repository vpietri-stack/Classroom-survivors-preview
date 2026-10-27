'use strict';
const assert = require('node:assert/strict');
const core = require('./api/src/functions/shared/previewNotesCore');
const fs = require('node:fs'), vm = require('node:vm');
let checks = 0;
function ok(value, label) { assert.ok(value, label); checks++; }
const marker = { id: 'pu3-u9-p111', book: 'PU3', unit: '9', page: '111', version: 1, wordCount: 5, exerciseCount: 5 };
const event = { type: 'session', sessionType: 'study', eventId: 'note-session', timestamp: '2026-10-27T05:00:00.000Z', data: { previewNote: marker } };
const student = { id: 'fixture', analytics: [] };
core.apply(student, [event]);
ok(student.previewNotes[marker.id], 'completed normal Study session derives durable note progress');
const original = JSON.stringify(student.previewNotes);
core.apply(student, [event, event]);
ok(original === JSON.stringify(student.previewNotes), 'duplicate delivery is idempotent');
core.apply(student, []); ok(original === JSON.stringify(student.previewNotes), 'completion remains after analytics archival');
for (const invalid of [
  { ...event, type: 'exercise' }, { ...event, sessionType: 'game' },
  { ...event, data: { previewNote: { ...marker, id: '__proto__' } } },
  { ...event, data: { previewNote: { ...marker, wordCount: 4 } } },
  { ...event, data: { previewNote: { ...marker, exerciseCount: 4 } } },
  { ...event, data: { previewNote: { ...marker, page: '109' } } },
  { ...event, data: { previewNote: { ...marker, version: 999 } } }
]) ok(Object.keys(core.fromEvents([invalid])).length === 0, 'partial, wrong-page or unknown marker cannot complete notes');
ok(Object.keys(core.normalize(Object.fromEntries(Array.from({length:1000},(_,i) => ['unknown'+i, {version:1,completedAt:event.timestamp}])))).length === 0, 'storage bounded by the registered catalog');
const sandbox = { window: null, console, Math, API_BASE_URL: '', document: { addEventListener() {} }, localStorage: { getItem:()=>null,setItem(){},removeItem(){} }, getCurrentSession:()=>10 };
sandbox.window = sandbox; vm.createContext(sandbox);
for (const file of ['sr_engine.js','teaching_content.js','content_pu3.js','non_spelling_content.js']) vm.runInContext(fs.readFileSync(file,'utf8'),sandbox);
const pool = sandbox.NonSpellingContent.buildPool('PU3','9','111',{pageOnly:true}).entries;
ok(pool.filter(e=>e.item.type==='missing-word').length === 8, 'all eight existing p111 missing-word boards retained');
ok(pool.filter(e=>e.item.type==='find-fix').length === 14, 'all fourteen existing p111 find/fix boards retained');
ok(new Set(pool.map(e=>e.item.type)).size === 4, 'all four non-spelling types eligible');
const seenTypes = new Set(), seenBoards = new Set();
for(let i=0;i<200;i++) {
  const selected = sandbox.NonSpellingContent.selectPage('PU3','9','111',5);
  ok(selected.length === 5 && new Set(selected.map(e=>e.key)).size === 5, 'five distinct boards');
  ok(selected.every(e=>e.book==='PU3' && e.unit==='9' && e.page==='111'), 'never backfills from another page');
  selected.forEach(e=>{seenTypes.add(e.type);seenBoards.add(e.key);});
}
ok(seenTypes.size === 4 && seenBoards.size >= 30, 'random sampling reaches all types and existing boards');
const m8 = pool.find(e=>e.item.type==='missing-word' && e.item.id==='M8').item;
ok(m8.answers.join('/') === 'frightened/frightening' && m8.prefixes.join('/') === 'f/f', 'existing answers and locked prefixes unchanged');
console.log(checks+' preview-note state/content checks passed');
