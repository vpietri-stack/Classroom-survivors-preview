'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const lesson = require('./pu1_u7_p85_notes_data');
const core = require('./api/src/functions/shared/previewNotesCore');
const s = { console, Math, API_BASE_URL: '', document: { addEventListener() {} }, localStorage: { getItem:()=>null,setItem(){},removeItem(){} }, getCurrentSession:()=>5 };
s.window = s; vm.createContext(s);
for (const file of ['sr_engine.js','teaching_content.js','content_pu1.js','non_spelling_content.js']) vm.runInContext(fs.readFileSync(path.join(__dirname,file),'utf8'),s);
const content = vm.runInContext('TEACHING_CONTENT.PU1[7][85]',s);
assert.equal(vm.runInContext('TEACHING_CONTENT.PU1[7][84]',s),undefined);
assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(AVAILABLE_CONTENT.PU1[7])',s)),[83,85,92]);
assert.equal(content.vocab.length,19); assert.equal(content.sentences.length,9); assert.equal(content.sentencePairs.length,5);
const entries = s.NonSpellingContent.buildPool('PU1',7,85,{pageOnly:true}).entries;
assert.equal(entries.filter(e=>e.item.type==='missing-word').length,8);
assert.equal(entries.filter(e=>e.item.type==='find-fix').length,12);
assert.equal(entries.filter(e=>e.item.type==='sentence-scramble').length,9);
assert.equal(new Set(entries.map(e=>e.item.type)).size,4);
for(const entry of entries.filter(e=>e.item.id)) {
  assert.equal(entry.item.page,'85');
  assert.equal(entry.key,`non-spelling:${entry.item.type}:pu1:7:84:${entry.item.id.toLowerCase()}`,'page correction preserves earned SR identity');
}
const earlier=s.NonSpellingContent.buildPool('PU1',7,83,{pageOnly:true}).entries;
assert.ok(!earlier.some(e=>e.item.id && /^M(?:9|1[0-6])$/.test(e.item.id)),'new lesson never leaks into page 83');
for(let i=0;i<100;i++) {
  const selected=s.NonSpellingContent.selectPage('PU1',7,85,5);
  assert.equal(selected.length,5); assert.equal(new Set(selected.map(e=>e.key)).size,5);
  assert.ok(selected.every(e=>e.book==='PU1'&&e.unit==='7'&&e.page==='85'));
}
assert.equal(core.atPage({book:'PU1',unit:7,page:85}).id,lesson.id);
const marker={id:lesson.id,book:'PU1',unit:'7',page:'85',version:1,wordCount:5,exerciseCount:5};
const event={type:'session',sessionType:'study',timestamp:'2026-11-03T01:00:00Z',data:{previewNote:marker}};
assert.ok(core.fromEvents([event])[lesson.id]);
assert.equal(Object.keys(core.fromEvents([{...event,data:{previewNote:{...marker,page:'84'}}}])).length,0,'retired page cannot claim new note completion');
assert.equal(lesson.pages.length,3);
const reachable=new Set();
for(const page of lesson.pages) {
  const bytes=fs.readFileSync(path.join(__dirname,lesson.assetBase,page.file));
  assert.equal(bytes.readUInt32BE(16),page.width); assert.equal(bytes.readUInt32BE(20),page.height);
  for(const spot of page.hotspots) {
    const [x,y,w,h]=spot.rect; assert.ok(lesson.clips[spot.clip]);
    assert.ok(x>=0&&y>=0&&w>0&&h>0&&x+w<=page.width&&y+h<=page.height); reachable.add(spot.clip);
  }
}
for(const clip of Object.values(lesson.clips)) {
  assert.ok(reachable.has(clip.id),clip.id+' is tappable'); assert.ok(clip.translation&&clip.text);
  const audio=fs.readFileSync(path.join(__dirname,clip.audio));
  assert.ok(audio.length>=1000&&(audio.subarray(0,3).toString()==='ID3'||(audio[0]===255&&(audio[1]&224)===224)),clip.id+' is a saved MP3');
}
console.log('PU1 p85: content move, 20 stable typed-board keys, strict 5-board selection, note completion and all '+Object.keys(lesson.clips).length+' audio mappings passed');
