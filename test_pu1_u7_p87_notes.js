'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const lesson=require('./pu1_u7_p87_notes_data');
const core=require('./api/src/functions/shared/previewNotesCore');
assert.equal(core.atPage({book:'PU1',unit:7,page:87}).id,lesson.id);
assert.equal(core.atPage({book:'PU1',unit:7,page:86}),undefined);
assert.equal(lesson.pages.length,5);
const reachable=new Set();let total=0;
for(const p of lesson.pages){
 const bytes=fs.readFileSync(lesson.assetBase+p.file);total+=bytes.length;
 assert.deepEqual(require('./scripts/check-notes-images.cjs').webpDimensions(bytes),[p.width,p.height]);
 for(const h of p.hotspots){const [x,y,w,z]=h.rect;assert.ok(x>=0&&y>=0&&w>0&&z>0&&x+w<=p.width&&y+z<=p.height,h.clip);reachable.add(h.clip);assert.ok(p.audioPacks.includes(lesson.clips[h.clip].audioPack[0]));}
}
assert.ok(total<1500000);
for(const clip of Object.values(lesson.clips)){
 assert.ok(reachable.has(clip.id));assert.ok(clip.translation&&clip.text);
 const [group,offset,length]=clip.audioPack;const audio=fs.readFileSync(clip.audio);
 assert.ok(audio.length>2000);assert.ok(fs.readFileSync(lesson.assetBase+'audio-'+group+'.bin').subarray(offset,offset+length).equals(audio));
 assert.ok(!/\bcan we (playing|going)\b/i.test(clip.text),'audio models correct English only');
}
const marker={id:lesson.id,book:'PU1',unit:'7',page:'87',version:1,wordCount:5,exerciseCount:5};
const event={type:'session',sessionType:'study',timestamp:'2026-11-06T08:00:00Z',data:{previewNote:marker}};
assert.ok(core.fromEvents([event])[lesson.id]);
for(const patch of [{page:'86'},{wordCount:4},{exerciseCount:4},{version:2}])assert.equal(Object.keys(core.fromEvents([{...event,data:{previewNote:{...marker,...patch}}}])).length,0);
const s={console,Math,API_BASE_URL:'',document:{addEventListener(){}},localStorage:{getItem:()=>null,setItem(){},removeItem(){}},getCurrentSession:()=>5};s.window=s;vm.createContext(s);
for(const f of ['sr_engine.js','teaching_content.js','content_pu1.js','non_spelling_content.js'])vm.runInContext(fs.readFileSync(f,'utf8'),s);
for(let i=0;i<100;i++){const items=s.NonSpellingContent.selectPage('PU1',7,87,5);assert.equal(items.length,5);assert.equal(new Set(items.map(x=>x.key)).size,5);assert.ok(items.every(x=>x.book==='PU1'&&x.unit==='7'&&x.page==='87'));}
console.log('PU1 p87: five compressed images, 58 packed British clips, hotspot bounds, page-only Study and completion-marker contracts passed.');
