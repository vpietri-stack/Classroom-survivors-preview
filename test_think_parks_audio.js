'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

async function run(direct, mirror) {
    const lesson = { wordsAudio: { 'word-test.mp3': [0, 3] } };
    const local = { ThinkParks: lesson };
    const parent = { AssetCache: { getBlobUrl: mirror } };
    const context = { window: local, parent, fetch: direct, Blob, URL, Map, Promise, Error };
    vm.runInNewContext(fs.readFileSync('think_parks_audio.js', 'utf8'), context);
    const bytes = await lesson.fetchAsset('think_parks_assets/words.bin');
    assert.equal(Buffer.from(bytes).toString(), 'abc');
}

(async () => {
    const bytes = new TextEncoder().encode('abc').buffer;
    await run(async () => ({ ok: true, arrayBuffer: async () => bytes }), async () => null);
    await run(async path => {
        if (path.startsWith('blob:')) return { arrayBuffer: async () => bytes };
        throw Error('direct unavailable');
    }, async () => 'blob:mirror');
    console.log('Parks audio cache falls back across both delivery paths.');
})().catch(error => { console.error(error); process.exitCode = 1; });
