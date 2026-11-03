// Creates reference MP3s from public lesson text only. Never sends mic audio.
// API contract: https://soundoftext.com/docs ; also used by gen_missing_audio.js.
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const data = require(process.argv[2] ? path.resolve(process.argv[2]) : '../interactive_notes_data.js');
const dir = path.join(root, data.assetBase || 'interactive_notes_assets/', 'audio');
const manifestPath = path.join(dir, '..', 'sentence-audio-sources.json');
const sources = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, 'utf8')) : [];
function source(item, details) {
  const entry = { id: item.id, text: item.text, audio: item.audio, ...details };
  const index = sources.findIndex(row => row.id === item.id);
  if (index < 0) sources.push(entry); else sources[index] = entry;
  fs.writeFileSync(manifestPath, JSON.stringify(sources, null, 2) + '\n');
}
const wait = ms => new Promise(r => setTimeout(r, ms));
async function json(url, options = {}) {
  const r = await fetch(url, { ...options, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
(async () => {
  fs.mkdirSync(dir, { recursive: true });
  const clips = [...new Map(Object.values(data.clips).filter(clip => clip.kind !== 'word').map(clip => [clip.audio, clip])).values()];
  for (const item of clips) {
    const destination = path.join(__dirname, '..', item.audio);
    if (fs.existsSync(destination) && fs.statSync(destination).size > 1000) continue;
    const existing = [item.text, item.text.replace(/[.!?]$/, '')].map(text => path.join(root, 'audio_mp3', text + '.mp3')).find(file => fs.existsSync(file) && fs.statSync(file).size > 1000);
    if (existing) {
      fs.copyFileSync(existing, destination);
      source(item, { source: 'existing exact-text app MP3', sourceFile: path.relative(root, existing), bytes: fs.statSync(existing).size });
      console.log(item.id + ': reused app MP3'); continue;
    }
    const result = await json('https://api.soundoftext.com/sounds', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ engine: 'Google', data: { voice: 'en-GB', text: item.text } }) });
    if (!result.success || !result.id) throw new Error('Sound of Text did not accept ' + item.id);
    let done = false;
    for (let i = 0; i < 15; i++) {
      await wait(1200);
      const status = await json('https://api.soundoftext.com/sounds/' + result.id);
      if (status.status === 'Error') throw new Error(status.message);
      if (status.status === 'Done' && status.location) {
        const r = await fetch(status.location, { signal: AbortSignal.timeout(20000) });
        if (!r.ok) throw new Error('MP3 HTTP ' + r.status);
        const bytes = Buffer.from(await r.arrayBuffer());
        const mp3Signature = bytes.subarray(0, 3).toString() === 'ID3' || (bytes[0] === 255 && (bytes[1] & 224) === 224);
        if (bytes.length < 1000 || !mp3Signature) throw new Error('Invalid audio response: ' + r.headers.get('content-type') + ', ' + bytes.length + ' bytes');
        fs.writeFileSync(destination, bytes); source(item, { source: 'Sound of Text en-GB', sourceUrl: status.location, bytes: bytes.length }); console.log(item.id + ': ' + bytes.length + ' bytes'); done = true; break;
      }
    }
    if (!done) throw new Error('MP3 generation timeout for ' + item.id);
    await wait(1200);
  }
})().catch(e => { console.error(e.message); process.exitCode = 1; });
