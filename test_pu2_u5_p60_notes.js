'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const lesson=require('./pu2_u5_p60_notes_data');
const core=require('./api/src/functions/shared/previewNotesCore');
assert.equal(core.atPage({book:'PU2',unit:'5',page:'60'}).id,lesson.id);
assert.equal(core.atPage({book:'PU2',unit:'5',page:'61'}),undefined);
assert.equal(lesson.pages.length,3);
const s={window:{InteractiveNotesData:{}}};vm.runInNewContext(fs.readFileSync('pu2_u5_p60_assets/audio-bundle.js','utf8'),s);
const bundle=s.window.InteractiveNotesData.audioBundle,reachable=new Set();
for(const page of lesson.pages){
 const image=fs.readFileSync(lesson.assetBase+page.file);
 assert.deepEqual(require('./scripts/check-notes-images.cjs').webpDimensions(image),[page.width,page.height]);
 for(const spot of page.hotspots){const [x,y,w,h]=spot.rect;assert.ok(lesson.clips[spot.clip]);assert.ok(x>=0&&y>=0&&w>0&&h>0&&x+w<=page.width&&y+h<=page.height,spot.clip);reachable.add(spot.clip);}
}
assert.equal(Object.keys(lesson.clips).length,28);
for(const clip of Object.values(lesson.clips)){
 assert.ok(reachable.has(clip.id),clip.id+' tappable');assert.ok(clip.translation&&clip.text);
 const audio=fs.readFileSync(clip.audio);assert.ok(audio.length>2000);
  const [group,offset,length]=clip.audioPack;
  assert.ok(fs.readFileSync(lesson.assetBase+'audio-'+group+'.bin').subarray(offset,offset+length).equals(audio),clip.id+' packed range preserves MP3');
 assert.ok(Buffer.from(bundle[clip.id],'base64').equals(audio),clip.id+' bundle preserves actual saved MP3');
}
const marker={id:lesson.id,book:'PU2',unit:'5',page:'60',version:1,wordCount:5,exerciseCount:5};
const event={type:'session',sessionType:'study',timestamp:'2026-11-11T07:30:00Z',data:{previewNote:marker}};
assert.ok(core.fromEvents([event])[lesson.id]);
for(const change of [{page:'62'},{wordCount:4},{exerciseCount:4},{version:2}])assert.equal(Object.keys(core.fromEvents([{...event,data:{previewNote:{...marker,...change}}}])).length,0);
assert.ok(!fs.readFileSync('pu2_u5_p60_notes.html','utf8').includes('audio-bundle.js'),'initial HTML does not block on full audio bundle');
console.log('PU2 p60: three images, all 28 packed MP3s, hotspot bounds and exact completion markers passed.');