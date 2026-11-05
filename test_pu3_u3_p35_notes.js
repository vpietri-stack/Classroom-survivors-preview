'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const lesson=require('./pu3_u3_p35_notes_data');
const core=require('./api/src/functions/shared/previewNotesCore');
assert.equal(core.atPage({book:'PU3',unit:'3',page:'35'}).id,lesson.id);
assert.equal(core.atPage({book:'PU3',unit:'3',page:'34'}),undefined);
assert.equal(lesson.pages.length,6);
const s={window:{InteractiveNotesData:{}}};vm.runInNewContext(fs.readFileSync('pu3_u3_p35_assets/audio-bundle.js','utf8'),s);
const bundle=s.window.InteractiveNotesData.audioBundle,reachable=new Set();
for(const page of lesson.pages){
 const image=fs.readFileSync(lesson.assetBase+page.file);
 assert.deepEqual(require('./scripts/check-notes-images.cjs').webpDimensions(image),[page.width,page.height]);
 for(const spot of page.hotspots){const [x,y,w,h]=spot.rect;assert.ok(lesson.clips[spot.clip]);assert.ok(x>=0&&y>=0&&w>0&&h>0&&x+w<=page.width&&y+h<=page.height,spot.clip);reachable.add(spot.clip);}
}
for(const clip of Object.values(lesson.clips)){
 assert.ok(reachable.has(clip.id),clip.id+' tappable');assert.ok(clip.translation&&clip.text);
 const audio=fs.readFileSync(clip.audio);assert.ok(audio.length>2000);
 assert.ok(Buffer.from(bundle[clip.id],'base64').equals(audio),clip.id+' bundle preserves actual saved MP3');
}
const marker={id:lesson.id,book:'PU3',unit:'3',page:'35',version:1,wordCount:5,exerciseCount:5};
const event={type:'session',sessionType:'study',timestamp:'2026-11-05T07:30:00Z',data:{previewNote:marker}};
assert.ok(core.fromEvents([event])[lesson.id]);
for(const change of [{page:'34'},{wordCount:4},{exerciseCount:4},{version:2}])assert.equal(Object.keys(core.fromEvents([{...event,data:{previewNote:{...marker,...change}}}])).length,0);
console.log('PU3 p35: six images, all 53 tappable bundled MP3s, hotspot bounds and exact completion markers passed.');
