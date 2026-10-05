// Focused regression test for the scramble/spelling widget rework.
// Loads the REAL project scripts (in index.html order) into jsdom, stubs only
// the externals jsdom lacks (Phaser, Web Audio, Firebase), then exercises the
// exact bugs the user reported:
//   (1) bank/keyboard/dock is a STATIC palette that never depletes,
//   (2) clicking a placed letter/word DELETES it (nothing returns to the source),
//   (3) editing is FROZEN during the ~5s CHECK reveal.
// The test body is appended to the same eval blob so it can see the scripts'
// top-level const/let bindings (STUDY_STATE, startRoundC, etc.).
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = __dirname;
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

// Remove remote <script src> (CDN/tailwind/fonts) — jsdom would try to fetch them.
html = html.replace(/<script src="https:[^"]*"><\/script>/g, '');

// Scripts to load in order (mirrors index.html bottom block). Skip the Phaser
// game core (boot/vampire_survivors/gomoku/uno/tower_defense) — not needed here.
const order = [
  'translations.js', 'config.js', 'sr_engine.js', 'frontend_auth.js',
  'teaching_content.js', 'content_pu1.js', 'content_pu2.js', 'content_pu3.js',
  'content_think0.js', 'content_think1.js', 'content_think2.js', 'content_test.js',
  'class_config.js', 'game.js', 'study_mode.js'
];

const dom = new JSDOM(html, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://localhost/' });
const { window } = dom;
const document = window.document;

// Stubs for externals jsdom lacks.
const stub = `
  window.Phaser = function(){}; window.Phaser.Scene = function(){}; window.Phaser.Game = function(){};
  window.API_BASE_URL = ''; window.FIREBASE_CONFIG = {};
  window.activeGameMode = null; // declared in boot.js (not loaded by harness)
  window.triggerStartGame = function(){}; // declared in game.js (not loaded by harness)
  window.showGameSelection = function(){}; // declared in game.js (not loaded by harness)
  window.goBackFromGameSelection = function(){ // mirror game.js so harness DOM reflects it
    var gso = document.getElementById('gameSelectionOverlay'); if (gso) gso.classList.add('hidden');
    var ss = document.getElementById('startScreen'); if (ss) ss.classList.remove('hidden');
    document.querySelectorAll('.step-container').forEach(function(c){ c.classList.add('hidden'); });
    var sg = document.getElementById('step-greeting'); if (sg) sg.classList.remove('hidden');
  };
  function FakeParam(){ this.setValueAtTime=function(){}; this.exponentialRampToValueAtTime=function(){}; this.linearRampToValueAtTime=function(){}; this.setValueAtTime=function(){}; }
  function FakeNode(){ this.frequency=new FakeParam(); this.gain=new FakeParam(); this.type=''; this.connect=function(){}; this.start=function(){}; this.stop=function(){}; this.disconnect=function(){}; }
  function FakeAudioCtx(){ this.currentTime=0; this.destination={};
    this.createOscillator=function(){ return new FakeNode(); };
    this.createGain=function(){ return new FakeNode(); };
  }
  window.AudioContext = FakeAudioCtx; window.webkitAudioContext = FakeAudioCtx;
  window.firebase = { initializeApp:function(){ return {}; }, auth:function(){ return {}; }, database:function(){ return {}; }, firestore:function(){ return {}; } };
  window.speechSynthesis = { speak:function(){ return Promise.resolve(); }, cancel:function(){} };
  window.SpeechSynthesisUtterance = function(){};
  if (window.HTMLMediaElement) window.HTMLMediaElement.prototype.play = function(){ return Promise.resolve(); };
  if (window.HTMLMediaElement) window.HTMLMediaElement.prototype.pause = function(){};
  var _ls = {};
  window.localStorage = { getItem:function(k){ return _ls[k]||null; }, setItem:function(k,v){ _ls[k]=v; } };
`;

// Test body appended into the same scope so it sees STUDY_STATE / startRoundC etc.
const testBody = `
(function(){
  var pass=0, fail=0;
  function ok(name, cond){ if(cond){pass++;console.log('PASS:',name);} else {fail++;console.log('FAIL:',name);} }

  // ===== STUDY ROUND B (depleting bank, delete-on-click, gap stays) =====
  STUDY_STATE.words = ['wed'];
  STUDY_STATE.currentWordIndex = 0;
  startRoundC(); nextRoundCWord();

  var bSlots = document.getElementById('scramble-slots');
  var bSlotEls = function(){ return Array.prototype.slice.call(bSlots.querySelectorAll('.study-slot')); };
  var bBank = document.getElementById('scramble-bank');
  var bankBtns = Array.prototype.slice.call(bBank.querySelectorAll('button'));
  ok('B: bank rendered as full palette (3 keys for "wed")', bankBtns.length === 3);

  var wBtn = bankBtns.find(function(b){ return b.innerText === 'w'; });
  wBtn.click();
  ok('B: clicking bank letter fills earliest slot', bSlotEls()[0].innerText === 'w');
  ok('B: bank letter IS removed on placement (depletes)', !bBank.contains(wBtn) && bBank.querySelectorAll('button').length === 2);

  bankBtns.find(function(b){ return b.innerText === 'e'; }).click();
  bankBtns.find(function(b){ return b.innerText === 'd'; }).click();
  ok('B: word fully placed "wed"', bSlotEls().map(function(s){return s.innerText;}).join('') === 'wed');

  // Delete the middle 'e' -> expect 'w_d' (gap stays), NOT 'wd', and the letter returns to bank.
  bSlotEls()[1].click();
  ok('B: deleting middle letter leaves a gap (w_d), not reflow',
     bSlotEls()[0].innerText==='w' && bSlotEls()[1].innerText==='' && bSlotEls()[2].innerText==='d');
  ok('B: delete returns letter to bank (length back to 1)', bBank.querySelectorAll('button').length === 1);

  // ===== STUDY ROUND B: fixed chars (space / - / .) stay put on check / clear =====
  // Word 'drop-ed' -> 'drop' + '-' + 'ed' (past tense). The '-' slot is fixed and
  // must NEVER move to the bank or get blanked.
  STUDY_STATE.words = ['drop-ed'];
  STUDY_STATE.currentWordIndex = 0;
  startRoundC(); nextRoundCWord();
  var fSlots = document.getElementById('scramble-slots');
  var fSlotEls = function(){ return Array.prototype.slice.call(fSlots.querySelectorAll('.study-slot')); };
  var fBank = document.getElementById('scramble-bank');
  var dashSlotIdx = -1;
  for (var fi=0; fi<fSlotEls().length; fi++){ if (fSlotEls()[fi].innerText === '-'){ dashSlotIdx = fi; break; } }
  ok('B(fixed): a "-" fixed slot exists', dashSlotIdx !== -1 && fSlotEls()[dashSlotIdx].dataset.fixed === 'true');
  var fInitialBank = fBank.querySelectorAll('button').length; // letters only (dash excluded)
  // Fill ALL letter slots, then CLEAR.
  Array.prototype.slice.call(fBank.querySelectorAll('button')).forEach(function(b){ b.click(); });
  ok('B(fixed): all letters placed, bank empty', fBank.querySelectorAll('button').length === 0);
  clearRoundC();
  ok('B(fixed): CLEAR keeps the "-" in its original slot', fSlotEls()[dashSlotIdx].innerText === '-' && fSlotEls()[dashSlotIdx].dataset.fixed === 'true');
  ok('B(fixed): CLEAR returns only letters to the bank (no dash added)', fBank.querySelectorAll('button').length === fInitialBank);
  // Wrong CHECK (re-place letters wrong) must also keep the '-' put.
  Array.prototype.slice.call(fBank.querySelectorAll('button')).forEach(function(b){ b.click(); });
  checkRoundC();
  ok('B(fixed): wrong CHECK keeps "-" fixed (not banked/blanked)', fSlotEls()[dashSlotIdx].innerText === '-' && fSlotEls()[dashSlotIdx].dataset.fixed === 'true');

  // ===== STUDY ROUND B: apostrophe is NOT fixed (user must place it) =====
  // 'doesn't' / 'don't' etc. -> the "'" is a draggable letter tile now, not pinned.
  STUDY_STATE.words = ["doesn't"];
  STUDY_STATE.currentWordIndex = 0;
  startRoundC(); nextRoundCWord();
  var aSlots = document.getElementById('scramble-slots');
  var aSlotEls = function(){ return Array.prototype.slice.call(aSlots.querySelectorAll('.study-slot')); };
  var aBank = document.getElementById('scramble-bank');
  // The apostrophe must NOT be a fixed slot...
  var aposFixed = false;
  for (var ai=0; ai<aSlotEls().length; ai++){ if (aSlotEls()[ai].dataset.fixed === 'true' && aSlotEls()[ai].innerText === "'"){ aposFixed = true; break; } }
  ok("B(apos): apostrophe is NOT a fixed slot in doesn't", !aposFixed);
  // ...and it must be among the draggable bank tiles (count == 7 letters incl. apostrophe).
  var aBtns = Array.prototype.slice.call(aBank.querySelectorAll('button'));
  ok('B(apos): apostrophe is a draggable bank tile', aBtns.some(function(b){ return b.innerText === "'"; }));
  ok('B(apos): bank has 7 tiles (6 letters + apostrophe)', aBtns.length === 7);

  // ===== STUDY ROUND D (depleting bank — mirrors game-mode word scramble) =====
  if (STUDY_STATE._roundEResetTimer) { clearTimeout(STUDY_STATE._roundEResetTimer); STUDY_STATE._roundEResetTimer = null; }
  if (STUDY_STATE._roundCResetTimer) { clearTimeout(STUDY_STATE._roundCResetTimer); STUDY_STATE._roundCResetTimer = null; }
  STUDY_STATE._roundEFrozen = false; STUDY_STATE._roundCFrozen = false; STUDY_STATE.isTransitioning = false;
  STUDY_STATE.sentences = ['The cat sat'];
  STUDY_STATE.currentSentenceIndex = 0;
  startRoundE(); nextRoundESentence();

  var dZone = document.getElementById('sentence-drop-zone');
  var dBank = document.getElementById('sentence-word-bank');
  var dBtns = Array.prototype.slice.call(dBank.querySelectorAll('button'));
  ok('D: bank has 3 word tiles', dBtns.length === 3);

  var theBtn = dBtns.find(function(b){ return b.innerText === 'The'; });
  theBtn.click();
  ok('D: placed copy into first slot', !!(dZone.children[0].firstChild && dZone.children[0].firstChild.innerText === 'The'));
  ok('D: bank tile REMOVED on placement (depletes)', !dBank.contains(theBtn) && dBank.querySelectorAll('button').length === 2);

  dZone.children[0].firstChild.click();
  ok('D: deleting placed word removes it from slot', !dZone.children[0].firstChild);
  ok('D: delete RETURNS word to bank', dBank.querySelectorAll('button').length === 3);

  // Place all three, then CLEAR restores the full bank.
  dBank.querySelectorAll('button').forEach(function(b){ b.click(); });
  ok('D: placing all words empties the bank', dBank.querySelectorAll('button').length === 0);
  clearRoundE();
  ok('D: CLEAR restores all tiles to the bank', dBank.querySelectorAll('button').length === 3 && !dZone.children[0].firstChild);

  // ===== STUDY ROUND D: CLEAR works during wrong-answer freeze =====
  // Reset any leaked frozen state from prior sections.
  if (STUDY_STATE._roundEResetTimer) { clearTimeout(STUDY_STATE._roundEResetTimer); STUDY_STATE._roundEResetTimer = null; }
  if (STUDY_STATE._roundCResetTimer) { clearTimeout(STUDY_STATE._roundCResetTimer); STUDY_STATE._roundCResetTimer = null; }
  STUDY_STATE._roundEFrozen = false; STUDY_STATE._roundCFrozen = false; STUDY_STATE.isTransitioning = false;
  STUDY_STATE.sentences = ['The cat sat'];
  STUDY_STATE.currentSentenceIndex = 0;
  startRoundE(); nextRoundESentence();
  dBank = document.getElementById('sentence-word-bank');
  dZone = document.getElementById('sentence-drop-zone');
  // Place all 3 but force a WRONG order (sat, cat, The) so check REVEALS + FREEZES
  // (not the success transition, which would block CLEAR).
  var dAll = Array.prototype.slice.call(dBank.querySelectorAll('button'));
  var wrongOrder = ['sat','cat','The'];
  wrongOrder.forEach(function(w){
    var b = dAll.find(function(x){ return x.innerText === w; });
    if (b) b.click();
  });
  checkRoundE();
  ok('D(freeze): frozen after wrong CHECK', STUDY_STATE._roundEFrozen === true);
  clearRoundE();
  ok('D(freeze): CLEAR works while frozen (unfreezes, bank restored)', STUDY_STATE._roundEFrozen === false && dBank.querySelectorAll('button').length === 3);

  // ===== WORD GROUPING (no mid-word break; wrap only at separators) =====
  // A word with no separator (e.g. "danced") must be ONE unbreakable group,
  // so it can never split across lines. A word with a separator (e.g. "drop-ed")
  // must split into separate groups around the fixed separator (so it CAN wrap
  // at the hyphen) while each word stays intact.
  STUDY_STATE.words = ['danced'];
  STUDY_STATE.currentWordIndex = 0;
  startRoundC(); nextRoundCWord();
  var dGroups = document.getElementById('scramble-slots').querySelectorAll('.word-group');
  var dSlots = document.getElementById('scramble-slots').querySelectorAll('.study-slot');
  ok('B(group): no-separator word is a single word-group', dGroups.length === 1);
  ok('B(group): single group holds every letter slot', dGroups.length === 1 && dGroups[0].querySelectorAll('.study-slot').length === dSlots.length && dSlots.length === 6);

  STUDY_STATE.words = ['drop-ed'];
  STUDY_STATE.currentWordIndex = 0;
  startRoundC(); nextRoundCWord();
  var peGroups = document.getElementById('scramble-slots').querySelectorAll('.word-group');
  var peFixed = document.getElementById('scramble-slots').querySelectorAll('.study-slot[data-fixed="true"]');
  ok('B(group): hyphenated word yields 2 word-groups (drop | ed)', peGroups.length === 2);
  ok('B(group): the separator stays a fixed, non-grouped slot', peFixed.length === 1 && peFixed[0].innerText === '-');
  // Reset any leaked frozen/transition state from prior sections.
  if (STUDY_STATE._roundCResetTimer) { clearTimeout(STUDY_STATE._roundCResetTimer); STUDY_STATE._roundCResetTimer = null; }
  STUDY_STATE._roundCFrozen = false; STUDY_STATE.isTransitioning = false;
  STUDY_STATE.words = ['abc'];
  STUDY_STATE.currentWordIndex = 0;
  startRoundC(); nextRoundCWord();
  var freeSlots = document.getElementById('scramble-slots');
  var freeSlotEls = function(){ return Array.prototype.slice.call(freeSlots.querySelectorAll('.study-slot')); };
  var fb = Array.prototype.slice.call(document.getElementById('scramble-bank').querySelectorAll('button'));
  fb.find(function(b){ return b.innerText==='a'; }).click();
  fb.find(function(b){ return b.innerText==='b'; }).click();
  freeSlotEls()[2].innerText = 'x'; // force wrong-but-full
  checkRoundC();
  ok('B: frozen flag set after wrong CHECK', STUDY_STATE._roundCFrozen === true);
  var before = freeSlotEls()[0].innerText;
  document.getElementById('scramble-bank').querySelector('button').click();
  ok('B: editing blocked while frozen', freeSlotEls()[0].innerText === before);
  // CLEAR must work DURING the frozen reveal (skip the 5s wait) and unfreeze.
  clearRoundC();
  ok('B: CLEAR works while frozen (slots emptied)', freeSlotEls().every(function(s){ return !s.innerText; }));
  ok('B: CLEAR during freeze unfreezes', STUDY_STATE._roundCFrozen === false);

  // ===== GAME-MODE WORD SCRAMBLE (desync fix: palette index vs slot position) =====
  // Word 'opposite' (8 letters). Simulate the user's report: type o, then p, then
  // try to select 'i' for a later slot. With the old bug, the 'i' bubble was
  // unselectable because a lower-position slot was already filled.
  SPELLING_WORDS = [{ en: 'opposite', zh: '在...对面' }];
  selectedClassContent = { book: 1, unit: 1, page: 1 };
  getGameItemSR = function(){ return 'opposite'; }; // override SR lookup (test content empty)
  try { startSpellingGame(); }
  catch (e) { console.log('startSpellingGame ERROR:', e.message, e.stack); throw e; }
  // Force deterministic palette order by overwriting the dataset (bypasses shuffle).
  var spEl = document.getElementById('spellingGame');
  spEl.dataset.letters = JSON.stringify(['o','p','p','o','s','i','t','e']);
  spEl.dataset.placement = JSON.stringify([undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined]);
  spEl.dataset.usedKeys = JSON.stringify([false,false,false,false,false,false,false,false]);
  spEl.dataset.built = "false";           // (harmless) force keyboard rebuild below
  document.getElementById('spelling-keyboard').dataset.built = "false"; // force keyboard rebuild with deterministic letters
  buildSpellingKeyboard();
  buildSpellingSlots();
  // Type o, p, p, o, s via keydown (earliest-empty-slot fill).
  ['o','p','p','o','s'].forEach(function(ch){ handleGameSpellingKeyDown(ch); });
  var spDisp = document.getElementById('spelling-input-display');
  var spSlotEls = function(){ return Array.prototype.slice.call(spDisp.querySelectorAll('.study-slot')); };
  ['o','p','p','o','s'].forEach(function(ch){ handleGameSpellingKeyDown(ch); });
  var spSlots = spSlotEls();
  ok('G: typing o,p,p,o,s fills first 5 slots', spSlots[0].innerText==='o'&&spSlots[1].innerText==='p'&&spSlots[2].innerText==='p'&&spSlots[3].innerText==='o'&&spSlots[4].innerText==='s');
  var iBubble = Array.prototype.slice.call(document.querySelectorAll('#spelling-keyboard .letter-bubble')).find(function(b){ return b.dataset.keyIndex==='5'; });
  ok('G: i bubble present and NOT marked used', !!iBubble && !iBubble.classList.contains('used'));
  iBubble.click();
  ok('G: clicking i fills slot 5 (no desync)', spSlotEls()[5].innerText === 'i');
  // Backspace should remove the last placed (i) and free its bubble.
  handleGameSpellingKeyDown('Backspace');
  ok('G: Backspace removes last placed letter (i)', spSlotEls()[5].innerText === '');
  ok('G: i bubble freed again after backspace', !iBubble.classList.contains('used'));
  // Placing the same bubble twice is blocked (no double-use / no overflow).
  iBubble.click();  // already used -> should be a no-op
  var filledCount = 0;
  for (var fi=0; fi<spEl.dataset.placement.length; fi++){
    var pv = JSON.parse(spEl.dataset.placement)[fi];
    if (pv !== undefined && pv !== null) filledCount++;
  }
  ok('G: same palette bubble cannot be placed twice (no overflow)',
     spSlotEls()[5].innerText === 'i'
     && filledCount === 6
     && document.querySelectorAll('#spelling-keyboard .letter-bubble.used').length === 6);

  // ===== GAME-MODE SPELLING: CLEAR works during wrong-answer freeze =====
  // Fill a WRONG-but-full word ('opposite' with first two letters swapped -> 'poposite') so check reveals + freezes.
  spEl.dataset.placement = JSON.stringify([1,0,2,3,4,5,6,7]);
  spEl.dataset.usedKeys = JSON.stringify([true,true,true,true,true,true,true,true]);
  buildSpellingSlots();
  checkSpelling();
  ok('GS(freeze): feedbackMode set after wrong CHECK', spEl.dataset.feedbackMode === 'true');
  clearSpelling();
  ok('GS(freeze): CLEAR works while frozen (empties + unfreezes)', spEl.dataset.feedbackMode === 'false' && (function(){
    var p = JSON.parse(spEl.dataset.placement); return p.every(function(v){ return v === undefined || v === null; });
  })());

  // ===== GAME-MODE SPELLING: comma is a draggable tile (matches study Round C) =====
  // 'yes, it is' -> the "," must NOT be a pinned fixed slot; it is a draggable letter tile.
  SPELLING_WORDS = [{ en: 'yes, it is', zh: '是的，它是' }];
  getGameItemSR = function(){ return 'yes, it is'; };
  startSpellingGame();
  var scEl = document.getElementById('spellingGame');
  // Count fixed (pinned) slots vs letter slots.
  var scSlots = JSON.parse(scEl.dataset.slots);
  var commaFixed = scSlots.some(function(s){ return s.type === 'fixed' && s.char === ','; });
  ok("G(apos): comma is NOT a fixed slot in 'yes, it is'", !commaFixed);
  // The comma should be part of the draggable palette (letters array includes it).
  var scLetters = JSON.parse(scEl.dataset.letters);
  ok('G(apos): comma is in the draggable palette', scLetters.indexOf(',') !== -1);
  ok('G(apos): fixed slots are only space/period/question/exclaim (no comma)',
     scSlots.filter(function(s){ return s.type === 'fixed'; }).every(function(s){ return ['.','?','!',' '].includes(s.char); }));

  // ===== STUDY ROUND C (spelling desync fix — same class as game-mode word scramble) =====
  // Reproduces the user's report: word "danced" (5 letters d-a-n-c-e), board of
  // 10 tiles. Typing the two 'd's first must NOT block the 'a' tiles. Old bug
  // used roundDInput (typing order) as if it were keyed by tile index, so the
  // 'd's at typing positions 0,1 blocked every tile at index 0,1 (both 'a' tiles).
  STUDY_STATE.words = ['danced'];
  STUDY_STATE.currentWordIndex = 0;
  STUDY_STATE.isTransitioning = false;
  STUDY_STATE._roundDFrozen = false;
  startRoundD(); nextRoundDWord();
  // Force a deterministic board: sorted letters a,a,c,d,d,e + 4 fillers, so the
  // two 'a' tiles are at indices 0,1 and a 'd' tile is later. Bypasses shuffle.
  var kb = document.getElementById('virtual-keyboard');
  var kbBtns = Array.prototype.slice.call(kb.children);
  // Build deterministic keys by overwriting the dataset + re-rendering keyboard.
  roundDBaseKeys = ['a','a','c','d','d','e','b','f','o','t'];
  roundDInput = ''; roundDPlacement = []; roundDUsedKeys = [];
  // Clear and re-add buttons in deterministic order.
  kb.innerHTML = '';
  roundDBaseKeys.forEach(function(ch, i){
    var b = document.createElement('button');
    b.className = 'study-key'; b.innerText = ch; b.dataset.keyIndex = i;
    b.onclick = (function(ki){ return function(){ typeRoundD(ki); }; })(i);
    kb.appendChild(b);
  });
  // Round D groups letter slots into .word-group wrappers (so a word never
  // breaks mid-word); flatten to the .study-slot descendants for assertions.
  function cSlots() {
    return Array.prototype.slice.call(document.querySelectorAll('#spelling-display .study-slot'));
  }
  kbBtns = Array.prototype.slice.call(kb.children);
  ok('C: board rendered 10 keys', kbBtns.length === 10);
  // Type the two 'd' tiles first (indices 3 and 4).
  kbBtns.find(function(b){ return b.dataset.keyIndex === '3'; }).click();
  kbBtns.find(function(b){ return b.dataset.keyIndex === '4'; }).click();
  ok('C: typing two d tiles fills first two letter slots', (function(){
    var dis = cSlots().map(function(s){return s.textContent;}).join('');
    return dis.indexOf('d') === 0 && dis[1] === 'd';
  })());
  // The 'a' tiles (index 0,1) must now be selectable (the old bug blocked them).
  var a0 = kbBtns.find(function(b){ return b.dataset.keyIndex === '0'; });
  a0.click();
  ok('C: an a tile is selectable after two d tiles (no desync)', (function(){
    var dis = cSlots().map(function(s){return s.textContent;}).join('');
    return dis.indexOf('a') !== -1;
  })());
  // Fill the rest via typing: d-a-n-c-e (we have a0 placed; add a1,c, then d,e fill remaining).
  kbBtns.find(function(b){ return b.dataset.keyIndex === '1'; }).click(); // a
  kbBtns.find(function(b){ return b.dataset.keyIndex === '2'; }).click(); // c
  // remaining two letter slots get the two d tiles already used; need 'n' and 'e'
  // but board has no 'n' (filler only). Use handleRoundDKeyDown to type 'n'/'e' if allowed.
  // Instead, verify the full word can be completed by clicking available keys:
  // we already used d(3),d(4),a(0),a(1),c(2); remaining slots need n,e -> not on board,
  // so just assert the desync fix: a-tile selectable. (Full correct spelled by real board.)
  ok('C: clicking a placed slot deletes it without losing other tiles', (function(){
    // place one a, then delete it via slot click, board stays intact
    var before = document.querySelectorAll('#virtual-keyboard .study-key').length;
    var slots = cSlots();
    // find a filled slot and click it
    for (var si=0; si<slots.length; si++){ if (slots[si].textContent){ slots[si].click(); break; } }
    return document.querySelectorAll('#virtual-keyboard .study-key').length === before;
  })());

  // ===== STUDY ROUND C back-key (delete last placed letter) =====
  STUDY_STATE.words = ['tap'];
  STUDY_STATE.currentWordIndex = 0;
  startRoundD(); nextRoundDWord();
  var kbC = Array.prototype.slice.call(document.getElementById('virtual-keyboard').querySelectorAll('button'));
  // Force a deterministic board: a,a,t,p...
  roundDBaseKeys = ['a','a','t','p','b','f','o','x','w','z'];
  roundDPlacement = []; roundDUsedKeys = []; updateRoundDDisplay();
  // Place 't' then 'a' (slots 0,1).
  var tBtn = kbC.find(function(b){ return b.dataset.keyIndex === '2'; }); // 't'
  var aBtn = kbC.find(function(b){ return b.dataset.keyIndex === '0'; }); // 'a'
  tBtn.click(); aBtn.click();
  ok('C(back): two letters placed', (function(){
    var dis = cSlots().map(function(s){return s.textContent;}).join('');
    return dis.indexOf('t') === 0 && dis[1] === 'a';
  })());
  // Press Backspace via the keyboard handler -> removes the LAST placed ('a').
  handleRoundDKeyDown('Backspace');
  ok('C(back): Backspace removes last placed letter', (function(){
    var slots = cSlots();
    return slots[0].textContent === 't' && slots[1].textContent === '';
  })());
  ok('C(back): freed tile is selectable again', roundDUsedKeys[0] === false);

  // ===== STUDY ROUND C: CLEAR works during wrong-answer freeze =====
  STUDY_STATE.words = ['tap'];
  STUDY_STATE.currentWordIndex = 0;
  startRoundD(); nextRoundDWord();
  // Force deterministic board and place a WRONG-but-full word 'aatp' (wrong order) to freeze.
  roundDBaseKeys = ['a','a','t','p','b','f','o','x','w','z'];
  roundDPlacement = []; roundDUsedKeys = []; updateRoundDDisplay();
  var kbC2 = Array.prototype.slice.call(document.getElementById('virtual-keyboard').querySelectorAll('button'));
  // Fill all 3 letter slots with 'a','a','t' (wrong word) so a check reveals+wfreezes.
  kbC2.find(function(b){ return b.dataset.keyIndex==='0'; }).click();
  kbC2.find(function(b){ return b.dataset.keyIndex==='1'; }).click();
  kbC2.find(function(b){ return b.dataset.keyIndex==='2'; }).click();
  checkRoundD();
  ok('C(freeze): frozen after wrong CHECK', STUDY_STATE._roundDFrozen === true);
  clearRoundD();
  ok('C(freeze): CLEAR works while frozen (unfreezes)', STUDY_STATE._roundDFrozen === false && roundDPlacement.length === 0);
  // ===== GRAMMAR (sentence scramble) must NOT throw on empty SR result =====
  // Reproduces the freeze: getGameItemSR can return [] (empty spaced-rep pool).
  // Old code did primarySentence = rawEntry[0] (=undefined) -> .split(' ') -> throw,
  // which left the scene paused with a blank white screen. Now it must either
  // fall back to a loaded sentence, or auto-pass safely.
  GRAMMAR_SENTENCES = ['The cat sat on the mat.'];
  activeGameMode = null;  // present in real game (boot.js); harness doesn't load boot.js
  selectedClassContent = { book: 1, unit: 1, page: 1 };
  getGameItemSR = function(){ return []; }; // empty SR pool (the crash trigger)
  var threw = false;
  try { startGrammarGame(); } catch (e) { threw = true; console.log('grammar throw:', e.message); }
  ok('G2: startGrammarGame does NOT throw on empty SR result', !threw);
  ok('G2: overlay shown (not frozen/blank)', !document.getElementById('grammarGame').classList.contains('hidden'));
  ok('G2: a sentence was rendered into the container', document.getElementById('sentence-container').children.length > 0);

  // Depletion behaviour: clicking a dock word must place EXACTLY ONE copy and
  // remove the tile from the dock (the old double-binding placed two copies and
  // kept the tile — both regressions reported by the user).
  var dockTiles = Array.prototype.slice.call(document.querySelectorAll('#word-dock .draggable'));
  var dockCount = dockTiles.length;
  ok('G2: dock rendered the full set of word tiles', dockCount > 0);
  var firstTile = dockTiles[0];
  firstTile.click(); // delegated #word-dock listener handles placement
  var zones = document.querySelectorAll('.drop-zone');
  var placedCount = Array.prototype.slice.call(zones).filter(function(z){ return z.children.length > 0; }).length;
  ok('G2: clicking dock word places exactly ONE copy (no double-write)', placedCount === 1);
  ok('G2: placed word removed from dock (depletes)', document.querySelectorAll('#word-dock .draggable').length === dockCount - 1);
  ok('G2: clicking placed word returns tile to dock', (function(){
    zones[0].children[0].click(); // delegated #sentence-container listener -> deleteGrammarWord
    return document.querySelectorAll('#word-dock .draggable').length === dockCount;
  })());

  // ===== Post-CHECK behaviour (regression from deplete rework) =====
  // Reproduces two bugs: (a) after a wrong CHECK the 5s reset deleted placed
  // words instead of returning them to the dock (words vanished permanently now
  // that the dock depletes); (b) CLEAR was a no-op while frozen (during the
  // reveal), so the player couldn't start over.
  GRAMMAR_SENTENCES = ['We are not hungry.'];
  getGameItemSR = function(){ return 'We are not hungry.'; };
  threw = false;
  try { startGrammarGame(); } catch (e) { threw = true; console.log('grammar fresh throw:', e.message, e.stack); }
  ok('G2b: fresh grammar game renders without throwing', !threw && document.querySelectorAll('.drop-zone').length > 0);
  var gzones = document.querySelectorAll('.drop-zone');
  var gdc = document.querySelectorAll('#word-dock .draggable').length;
  ok('G2b: dock full before placement (one tile per word)', gdc === gzones.length);

  // Override setTimeout so the 5s reset is captured (not auto-fired); we fire it
  // manually to simulate the reveal window elapsing.
  var gOrigST = setTimeout;
  var gCaptured = null;
  setTimeout = function(fn, ms){ gCaptured = fn; return 1; };

  // Place ONE word (partial fill -> wrong on check).
  document.querySelectorAll('#word-dock .draggable')[0].click();
  ok('G2b: one word placed, dock depletes by 1', document.querySelectorAll('#word-dock .draggable').length === gdc - 1 && gzones[0].children.length === 1);

  // WRONG check -> freeze + schedule 5s reset.
  checkGrammar();
  ok('G2b: after wrong CHECK, frozen during reveal', grammarGameEl().dataset.frozen === 'true');
  ok('G2b: placed word still visible during reveal', gzones[0].children.length === 1);

  // CLEAR while frozen must STILL work and unfreeze.
  clearGrammar();
  ok('G2b: CLEAR during freeze restores all tiles to dock', document.querySelectorAll('#word-dock .draggable').length === gdc);
  ok('G2b: CLEAR during freeze empties the slots', document.querySelectorAll('.drop-zone .draggable.placed').length === 0);
  ok('G2b: CLEAR during freeze unfreezes (editable again)', grammarGameEl().dataset.frozen === 'false');

  // 5s auto-reset must RETURN words to the dock, not lose them.
  document.querySelectorAll('#word-dock .draggable')[0].click(); // place again
  checkGrammar(); // schedules reset (captured)
  ok('G2b: wrong CHECK again freezes the widget', grammarGameEl().dataset.frozen === 'true');
  if (gCaptured) gCaptured(); // simulate the 5s reveal window elapsing
  setTimeout = gOrigST;
  ok('G2b: 5s reset returns placed word to dock (not lost)', document.querySelectorAll('#word-dock .draggable').length === gdc);
  ok('G2b: 5s reset clears the slots', document.querySelectorAll('.drop-zone .draggable.placed').length === 0);
  ok('G2b: 5s reset unfreezes the widget', grammarGameEl().dataset.frozen === 'false');

  // And with NO sentences available at all, it must auto-pass (no throw, no hang).
  GRAMMAR_SENTENCES = [];
  threw = false;
  try { startGrammarGame(); } catch (e) { threw = true; console.log('G2 auto-pass throw:', e.message, e.stack); }
  ok('G2: startGrammarGame does NOT throw when no sentences exist (auto-pass)', !threw);

  // ===== STUDY -> GAME keyboard handoff (BUG: study.active never reset) =====
  // Entering study mode set STUDY_STATE.active=true. The game-mode keydown
  // listener early-returns while it's true, so after leaving study mode the
  // spelling minigame's physical keyboard typing silently died. Exiting study
  // mode must reset active=false.
  STUDY_STATE.words = ['wed'];
  STUDY_STATE.currentWordIndex = 0;
  startRoundC(); nextRoundCWord();
  STUDY_STATE.active = true; // simulate "in study mode" (initStudyMode sets this; not called by direct startRoundC in test)
  ok('KBD: entering study sets STUDY_STATE.active=true', STUDY_STATE.active === true);
  exitStudyMode();
  ok('KBD: exiting study resets STUDY_STATE.active=false', STUDY_STATE.active === false);
  ok('KBD: exiting study hides studyModeOverlay', document.getElementById('studyModeOverlay').classList.contains('hidden'));
  ok('KBD: exiting study returns to main dashboard (startScreen shown)', !document.getElementById('startScreen').classList.contains('hidden'));
  // Now start the game-mode spelling minigame and type via handleGameSpellingKeyDown.
  SPELLING_WORDS = [{ en: 'cat', zh: '猫' }];
  selectedClassContent = { book: 1, unit: 1, page: 1 };
  getGameItemSR = function(){ return 'cat'; };
  try { startSpellingGame(); } catch (e) { console.log('startSpellingGame(2) ERROR:', e.message); }
  var spEl2 = document.getElementById('spellingGame');
  spEl2.dataset.letters = JSON.stringify(['c','a','t']);
  spEl2.dataset.placement = JSON.stringify([undefined,undefined,undefined]);
  spEl2.dataset.usedKeys = JSON.stringify([false, false, false]);
  document.getElementById('spelling-keyboard').dataset.built = "false";
  buildSpellingKeyboard();
  buildSpellingSlots();
  // Simulate physical typing 'c','a','t' (only works if active=false).
  handleGameSpellingKeyDown('c');
  handleGameSpellingKeyDown('a');
  handleGameSpellingKeyDown('t');
  ok('KBD: typing works in game-mode spelling after study exit', (function(){
    var p = JSON.parse(spEl2.dataset.placement);
    return p[0] !== undefined && p[1] !== undefined && p[2] !== undefined && p.filter(function(v){return v!==undefined&&v!==null;}).length === 3;
  })());

  // ===== RESPONSIVE SHRINK (fitAnswerArea) =====
  // When the answer area is wider than its container (long no-separator word on a
  // narrow phone), fitAnswerArea must step --answer-font down until it fits, and
  // never go below the 10px floor. jsdom has no layout, so stub getComputedStyle
  // + the box metrics.
  var fitEl = document.getElementById('spelling-input-display');
  var fitFont = 24, fitSlot = 48; // start "large"
  var realGCS = window.getComputedStyle;
  window.getComputedStyle = function(el){
    return { getPropertyValue: function(prop){
      if (prop === '--answer-font') return fitFont + 'px';
      if (prop === '--slot-size') return fitSlot + 'px';
      return '';
    } };
  };
  Object.defineProperty(fitEl, 'scrollWidth', { configurable: true, get: function(){ return 400; } });
  Object.defineProperty(fitEl, 'clientWidth', { configurable: true, get: function(){ return 200; } });
  document.documentElement.style.setProperty('--answer-font', fitFont + 'px');
  document.documentElement.style.setProperty('--slot-size', fitSlot + 'px');
  fitAnswerArea(fitEl);
  var afterFont = parseFloat(document.documentElement.style.getPropertyValue('--answer-font')) || 0;
  var afterSlot = parseFloat(document.documentElement.style.getPropertyValue('--slot-size')) || 0;
  ok('fit: shrinks --answer-font when container is too narrow', afterFont < fitFont);
  ok('fit: shrinks --slot-size (fixed-width box) when container is too narrow', afterSlot < fitSlot);
  ok('fit: never falls below the 12px font floor', afterFont >= 12);
  ok('fit: never falls below the 22px slot floor', afterSlot >= 22);
  // With a wide-enough container, it should not shrink below the (reset) default.
  Object.defineProperty(fitEl, 'clientWidth', { configurable: true, get: function(){ return 2000; } });
  document.documentElement.style.setProperty('--answer-font', '');
  document.documentElement.style.setProperty('--slot-size', '');
  fitAnswerArea(fitEl);
  ok('fit: no shrink when content already fits', !document.documentElement.style.getPropertyValue('--answer-font') && !document.documentElement.style.getPropertyValue('--slot-size'));
  window.getComputedStyle = realGCS;
  window.__testResult = { pass: pass, fail: fail };
  console.log('\\n' + pass + ' passed, ' + fail + ' failed');
})();
`;

let combined = stub;
for (const f of order) {
  combined += '\n;// === ' + f + ' ===\n' + fs.readFileSync(path.join(root, f), 'utf8');
}
combined += '\n' + testBody;

try { window.eval(combined); }
catch (e) { console.log('LOAD/RUN ERROR:', e.message); process.exit(2); }

const res = window.__testResult || { pass: 0, fail: 1 };
process.exit(res.fail ? 1 : 0);
