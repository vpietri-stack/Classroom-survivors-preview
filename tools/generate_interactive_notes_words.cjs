// Order requested for vocabulary: Youdao -> an exact existing app MP3 ->
// Sound of Text. Save verified results locally so children need no third-party
// audio request when they tap a word.
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const data = require(process.argv[2] ? path.resolve(process.argv[2]) : '../interactive_notes_data.js');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const valid = bytes => bytes.length >= 1000 && (bytes.subarray(0, 3).toString() === 'ID3' || (bytes[0] === 255 && (bytes[1] & 224) === 224));
async function soundOfText(text) {
  let response = await fetch('https://api.soundoftext.com/sounds', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ engine: 'Google', data: { voice: 'en-GB', text } }), signal: AbortSignal.timeout(20000) });
  const created = await response.json();
  if (!created.success) throw new Error('Sound of Text create failed');
  for (let i = 0; i < 15; i++) {
    await wait(1200);
    const status = await (await fetch('https://api.soundoftext.com/sounds/' + created.id, { signal: AbortSignal.timeout(20000) })).json();
    if (status.status === 'Error') throw new Error('Sound of Text generation failed');
    if (status.status === 'Done') {
      response = await fetch(status.location, { signal: AbortSignal.timeout(20000) });
      const bytes = Buffer.from(await response.arrayBuffer());
      if (!response.ok || !valid(bytes)) throw new Error('Invalid generated MP3');
      return bytes;
    }
  }
  throw new Error('Sound of Text timeout');
}
(async () => {
  const report = [];
  for (const clip of Object.values(data.clips).filter(x => x.kind === 'word')) {
    const destination = path.join(root, clip.audio);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    if (fs.existsSync(destination) && valid(fs.readFileSync(destination))) { console.log(clip.text + ': cached'); continue; }
    let bytes, source;
    try {
      const r = await fetch('https://dict.youdao.com/dictvoice?audio=' + encodeURIComponent(clip.text) + '&type=1', { signal: AbortSignal.timeout(15000) });
      const b = Buffer.from(await r.arrayBuffer());
      if (!r.ok || !valid(b)) throw new Error('Youdao audio unavailable');
      bytes = b; source = 'Youdao British English (type=1)';
    } catch (_) {
      const existing = path.join(root, 'audio_mp3', clip.text + '.mp3');
      if (fs.existsSync(existing) && valid(fs.readFileSync(existing))) { bytes = fs.readFileSync(existing); source = 'existing exact-word app MP3'; }
      else { bytes = await soundOfText(clip.text); source = 'Sound of Text en-GB'; }
    }
    fs.writeFileSync(destination, bytes);
    report.push({ word: clip.text, source, bytes: bytes.length });
    console.log(clip.text + ': ' + source + ', ' + bytes.length + ' bytes');
    await wait(250);
  }
  if (report.length) fs.writeFileSync(path.join(root, data.assetBase || 'interactive_notes_assets/', 'word-audio-sources.json'), JSON.stringify(report, null, 2) + '\n');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
