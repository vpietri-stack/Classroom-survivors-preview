'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const lesson=require('./pu1_u5_p59_notes_data');
const core=require('./api/src/functions/shared/previewNotesCore');
assert.equal(core.atPage({book:'PU1',unit:'5',page:'59'}).id,lesson.id);
assert.equal(lesson.pages.length,3);
assert.ok(!/\b(Jim|Jenny)\b/.test(JSON.stringify(lesson)),'reader uses original Leo/Mia characters');
const s={window:{InteractiveNotesData:{}}};vm.runInNewContext(fs.readFileSync('pu1_u5_p59_assets/audio-bundle.js','utf8'),s);
const bundle=s.window.InteractiveNotesData.audioBundle,reachable=new Set();
for(const page of lesson.pages){
 const image=fs.readFileSync(lesson.assetBase+page.file);
 assert.deepEqual(require('./scripts/check-notes-images.cjs').webpDimensions(image),[page.width,page.height]);
 for(const spot of page.hotspots){const [x,y,w,h]=spot.rect;assert.ok(lesson.clips[spot.clip]);assert.ok(x>=0&&y>=0&&w>0&&h>0&&x+w<=page.width&&y+h<=page.height,spot.clip);reachable.add(spot.clip);}
}
for(const clip of Object.values(lesson.clips)){
 assert.ok(reachable.has(clip.id),clip.id+' tappable');assert.ok(clip.translation&&clip.text);
 const audio=fs.readFileSync(clip.audio);assert.ok(audio.length>2000);
 assert.ok(Buffer.from(bundle[clip.id],'base64').equals(audio),clip.id+' bundle preserves saved MP3');
}
const marker={id:lesson.id,book:'PU1',unit:'5',page:'59',version:1,wordCount:5,exerciseCount:5};
const event={type:'session',sessionType:'study',timestamp:'2026-11-05T08:00:00Z',data:{previewNote:marker}};
assert.ok(core.fromEvents([event])[lesson.id]);
for(const change of [{page:'57'},{wordCount:4},{exerciseCount:4},{version:2}])assert.equal(Object.keys(core.fromEvents([{...event,data:{previewNote:{...marker,...change}}}])).length,0);
console.log('PU1 p59: three images, 37 tappable bundled MP3s, hotspot bounds and exact completion markers passed.');
