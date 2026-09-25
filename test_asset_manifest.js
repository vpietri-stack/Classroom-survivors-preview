// ============================================================
// ASSET MANIFEST SYNC — asset_cache.js vs the files on disk.
//
// Guarantee requested by the user: any NEW image added as a game
// asset must automatically be covered by the prefetch cache.
//  1) every .png under sprites/td/ on disk is listed in
//     AssetCache.TD_SPRITES  (forgotten new sprite -> FAIL)
//  2) every runtime .png under sprites/vs/ on disk is listed in
//     AssetCache.VS_SPRITES (files with '_raw' in the name are
//     uncut tooling sheets, never loaded at runtime -> excluded)
//  3) every .mp3 under music/ on disk is listed in AssetCache.MUSIC
//  4) every .mp3 under sfx/ on disk is listed in AssetCache.SFX
//  5) every listed path exists on disk        (stale entry -> FAIL)
// Vocab images + audio_mp3 need no manifest: their paths are
// derived from TEACHING_CONTENT at runtime and cached on first
// use, so new files are covered automatically.
// Run: node test_asset_manifest.js   (part of npm test)
// ============================================================
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; console.log('PASS: ' + msg); }
  else { fail++; console.error('FAIL: ' + msg); }
}

// --- extract a list of quoted string literals from an array in asset_cache.js ---
const src = fs.readFileSync(path.join(__dirname, 'asset_cache.js'), 'utf8');
function extractList(name) {
  const m = src.match(new RegExp(name + '\\s*=\\s*\\[([\\s\\S]*?)\\];'));
  ok(!!m, 'asset_cache.js contains a ' + name + ' array');
  const list = m ? Array.from(m[1].matchAll(/'([^']+)'/g)).map(x => x[1]) : [];
  ok(list.length > 0, name + ' is non-empty (' + list.length + ' entries)');
  return list;
}

// --- walk a dir for files with the given extension --------------------------
function walk(dir, ext) {
  if (!fs.existsSync(dir)) return [];
  let out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out = out.concat(walk(p, ext));
    else if (e.isFile() && e.name.toLowerCase().endsWith(ext)) out.push(p);
  }
  return out;
}
function rel(p) { return path.relative(__dirname, p).split(path.sep).join('/'); }

// Sync-check one manifest against one disk dir, both directions.
function checkGroup(name, dir, ext, diskFilter) {
  const listed = extractList(name);
  let onDisk = walk(path.join(__dirname, dir), ext).map(rel);
  if (diskFilter) onDisk = onDisk.filter(diskFilter);
  // disk -> list: a new runtime asset must be added to the manifest
  for (const f of onDisk) ok(listed.includes(f), name + ': on disk & listed: ' + f);
  // list -> disk: no stale entries pointing at deleted files
  for (const f of listed) ok(onDisk.includes(f), name + ': listed & on disk: ' + f);
}

checkGroup('TD_SPRITES', 'sprites/td', '.png');
// '_raw' sheets are Nano Banana slicing inputs, never loaded at runtime
checkGroup('VS_SPRITES', 'sprites/vs', '.png', f => !/_raw/.test(f));
checkGroup('MUSIC', 'music', '.mp3');
checkGroup('SFX', 'sfx', '.mp3');

// ============================================================
// VOCAB FILENAME CONTRACT — three independent copies of one rule
// ============================================================
// The vocab image filename rule exists in three places that never call each
// other: slice_vocab_sheet.js fileFor() (the GENERATOR, which decides what is
// on disk), asset_cache.js vocabImagePath() (the PREFETCHER), and game.js
// showVocabImage() (the DISPLAY). When they disagree, images silently 404 in
// front of a student.
//
// 2026-09-16a added an apostrophe/comma strip to game.js ONLY, believing no
// such files existed. It fixed nothing (the generator never strips, so a
// stripped name can never match a generated file) and broke o'clock.png and
// chemist's.png, which have existed since 2026-07-27 and are real PU3/Think1
// vocab entries. This block fails if the three copies ever drift again.
const vm = require('vm');

function fnFrom(expr, argName) {
  try { return new Function(argName, 'return (' + expr + ');'); }
  catch (e) { return null; }
}

const genSrc = fs.readFileSync(path.join(__dirname, 'slice_vocab_sheet.js'), 'utf8');
const dispSrc = fs.readFileSync(path.join(__dirname, 'game.js'), 'utf8');

const genM = genSrc.match(/const fileFor = w => ([^;]+);/);
const dispM = dispSrc.match(/function showVocabImage[\s\S]*?const filename = ([^;]+);/);
const prefM = src.match(/function vocabImagePath\(word\)\s*\{[\s\S]*?return 'images\/vocab\/' \+ ([^;]+);/);

ok(!!genM, 'extracted the generator rule from slice_vocab_sheet.js');
ok(!!dispM, 'extracted the display rule from game.js showVocabImage()');
ok(!!prefM, 'extracted the prefetch rule from asset_cache.js vocabImagePath()');

const genF  = genM && fnFrom(genM[1], 'w');
const dispF = dispM && fnFrom(dispM[1], 'word');
const prefF = prefM && fnFrom(prefM[1], 'word');

// The three copies return slightly different shapes (the generator and the
// prefetcher append '.png' and the prefetcher is prefixed at the call site,
// while showVocabImage adds both afterwards). Normalise to a bare basename so
// the comparison tests the RULE, not the string assembly around it.
const base = fn => w => {
  let s = fn(w);
  s = s.replace(/^images\/vocab\//, '');
  return s.replace(/\.png$/, '');
};
const genB  = genF  && base(genF);
const dispB = dispF && base(dispF);
const prefB = prefF && base(prefF);

// Every vocab string across every content pack.
const sandbox = { TEACHING_CONTENT: {} };
vm.createContext(sandbox);
for (const f of fs.readdirSync(__dirname).filter(n => /^content_.*\.js$/.test(n))) {
  try { vm.runInContext(fs.readFileSync(path.join(__dirname, f), 'utf8'), sandbox, { filename: f }); }
  catch (e) { /* a pack that will not eval is reported by the count check below */ }
}
const vocabWords = [];
for (const book of Object.values(sandbox.TEACHING_CONTENT || {})) {
  for (const unit of Object.values(book || {})) {
    for (const page of Object.values(unit || {})) {
      for (const v of (page && page.vocab) || []) if (typeof v === 'string') vocabWords.push(v);
    }
  }
}
ok(vocabWords.length > 100, 'collected vocab words from content packs (' + vocabWords.length + ')');

const PUNCT = vocabWords.filter(w => /['’,]/.test(w));
ok(PUNCT.length > 0, 'sample includes punctuation-bearing vocab words (' + PUNCT.length + ')');

let dispVsGen = 0, prefVsGen = 0;
for (const w of vocabWords) {
  if (dispB && genB && dispB(w) !== genB(w)) dispVsGen++;
  if (prefB && genB && prefB(w) !== genB(w)) prefVsGen++;
}
ok(dispVsGen === 0, 'game.js display rule matches the generator for all ' + vocabWords.length + ' vocab words (mismatches: ' + dispVsGen + ')');
ok(prefVsGen === 0, 'asset_cache.js prefetch rule matches the generator for all ' + vocabWords.length + ' vocab words (mismatches: ' + prefVsGen + ')');

// The two words the 2026-09-16a strip broke: the file exists ONLY with the apostrophe.
for (const w of ["o'clock", "chemist's"]) {
  if (!vocabWords.includes(w)) continue;
  const want = 'images/vocab/' + w + '.png';
  ok(fs.existsSync(path.join(__dirname, want)), 'generator-named file is on disk: ' + want);
  if (dispB) ok(dispB(w) === w, 'game.js keeps the apostrophe in ' + JSON.stringify(w));
  if (prefB) ok(prefB(w) === w, 'asset_cache.js keeps the apostrophe in ' + JSON.stringify(w));
  if (dispB) ok(fs.existsSync(path.join(__dirname, 'images/vocab', dispB(w) + '.png')),
    'game.js resolves ' + JSON.stringify(w) + ' to a file that exists');
  if (prefB) ok(fs.existsSync(path.join(__dirname, 'images/vocab', prefB(w) + '.png')),
    'asset_cache.js prefetches ' + JSON.stringify(w) + ' from a file that exists');
}

console.log('\n--- ASSET MANIFEST ---');
console.log(pass + ' passed, ' + fail + ' failed');
console.log('RESULT: ' + (fail === 0 ? 'PASS' : 'FAIL'));
process.exit(fail === 0 ? 0 : 1);
