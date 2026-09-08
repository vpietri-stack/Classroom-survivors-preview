// --- CONTENT MANAGEMENT ---
let SPELLING_WORDS = [];
let SIGHT_WORDS = [];
let GRAMMAR_SENTENCES = [];

// --- GLOBAL STATE (activeGameMode, game declared in boot.js) ---

// --- TRANSLATION SYSTEM (LOCAL) ---
function getLocalTranslation(text) {
    if (!text || typeof LOCAL_TRANSLATIONS === 'undefined') return '';
    const key = text.trim();
    return LOCAL_TRANSLATIONS[key] || '';
}

function showTranslation(elementId, text) {
    const el = document.getElementById(elementId);
    if (!el) return;

    el.textContent = "";
    el.classList.add('hidden');

    const cn = getLocalTranslation(text);
    if (cn) {
        el.textContent = cn;
        el.classList.remove('hidden');
    }
}

function showVocabImage(elementId, word) {
    const el = document.getElementById(elementId);
    if (!el) return;

    el.classList.add('hidden');
    if (!word) return;

    const filename = word.trim().toLowerCase().replace(/ /g, '-');
    const imagePath = `images/vocab/${filename}.png`;

    // Resolve through AssetCache (gh-proxy mirror + IndexedDB): instant blob:
    // URL when cached, downloads-and-caches otherwise (fast in CN, survives
    // WeChat cache eviction). Falls back to the plain same-origin path.
    // dataset guard: a later call for a different word wins the async race.
    el.dataset.pendingVocab = imagePath;
    const resolved = (window.AssetCache && AssetCache.getBlobUrl)
        ? AssetCache.getBlobUrl(imagePath).then(u => u || imagePath)
        : Promise.resolve(imagePath);
    resolved.then(src => {
        if (el.dataset.pendingVocab !== imagePath) return; // superseded
        // Use an off-DOM image to preload and check existence
        const img = new Image();
        img.onload = () => {
            if (el.dataset.pendingVocab !== imagePath) return;
            el.src = src;
            el.classList.remove('hidden');
        };
        img.onerror = () => {
            if (el.dataset.pendingVocab !== imagePath) return;
            el.classList.add('hidden');
        };
        img.src = src;
    });
}

// --- AUDIO SYSTEM ---
let audioCtx;

// --- SFX master gain + mute -------------------------------------------------
// ALL sound effects (procedural synths here + uno.js + sampled sfx/) route
// through one master gain so the HUD SFX-mute button can silence them without
// touching the music (bgm.js has its own context) or the TTS word audio
// (HTML5 <audio>, learning content — never muted by this).
let sfxGainNode = null;
let sfxMuted = false;
try { sfxMuted = localStorage.getItem('sfxMuted') === '1'; } catch (e) { }
function sfxDest() {
    if (!audioCtx) return null;
    if (!sfxGainNode) {
        sfxGainNode = audioCtx.createGain();
        sfxGainNode.gain.value = sfxMuted ? 0 : 1;
        sfxGainNode.connect(audioCtx.destination); // master -> speakers (only direct connection)
    }
    return sfxGainNode;
}
function syncSfxMuteIcon() {
    const icon = document.getElementById('vsMuteIcon');
    if (icon) icon.className = sfxMuted ? 'fas fa-volume-mute' : 'fas fa-volume-up';
}
function toggleSfxMute() {
    sfxMuted = !sfxMuted;
    try { localStorage.setItem('sfxMuted', sfxMuted ? '1' : '0'); } catch (e) { }
    if (sfxGainNode) sfxGainNode.gain.value = sfxMuted ? 0 : 1;
    syncSfxMuteIcon();
    return sfxMuted;
}

// --- iOS audio-session keep-alive -------------------------------------------
// On iPad/iPhone, WebAudio alone runs in the "ambient" audio session, which the
// hardware SILENT SWITCH mutes — so all our music/SFX (BGM + synths are pure
// WebAudio) were inaudible, EXCEPT while an HTML5 <audio> (the Youdao TTS MP3)
// was playing: media elements use the "playback" session, and while one plays
// iOS promotes the whole session, letting the music bleed through for a second.
// Fix: keep a silent, looping <audio> element playing (started inside a user
// gesture) so the session stays promoted and WebAudio ignores the mute switch.
// iOS-only: on Android/desktop a looping media element could steal audio focus
// (e.g. pause the user's own music), so we gate it.
let _iosKeepAlive = null;
function _isIOS() {
    const ua = navigator.userAgent || '';
    // iPadOS 13+ masquerades as Mac ("MacIntel") but has multi-touch
    return /iPad|iPhone|iPod/.test(ua) ||
        (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1);
}
function _silentWavUri() {
    // 0.5s of 8kHz mono silence, built at runtime (no asset, ~4KB base64)
    const rate = 8000, n = rate / 2, size = 44 + n * 2;
    const b = new ArrayBuffer(size), v = new DataView(b);
    const ws = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    ws(0, 'RIFF'); v.setUint32(4, size - 8, true); ws(8, 'WAVEfmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true);
    v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    ws(36, 'data'); v.setUint32(40, n * 2, true); // samples stay zero = silence
    let bin = ''; const u8 = new Uint8Array(b);
    for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
    return 'data:audio/wav;base64,' + btoa(bin);
}
function _ensureIosKeepAlive() {
    if (!_isIOS() || _iosKeepAlive) return;
    try {
        const a = document.createElement('audio');
        a.src = _silentWavUri();
        a.loop = true;
        a.setAttribute('playsinline', '');
        a.volume = 0.01; // effectively silent; iOS just needs it PLAYING
        const pr = a.play();
        if (pr && pr.catch) pr.catch(() => { _iosKeepAlive = null; }); // retry next gesture
        _iosKeepAlive = a;
    } catch (e) { _iosKeepAlive = null; }
}
// iOS also suspends AudioContexts when the tab/app backgrounds — resume on return
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        if (window.BGM && typeof BGM.resumeCtx === 'function') BGM.resumeCtx();
    }
});

// --- Universal audio unlock (WeChat-iOS especially) --------------------------
// WeChat on iOS keeps an AudioContext 'suspended'/'interrupted' unless resume()
// happens inside a DIRECT user gesture — and BGM's context often needs waking
// AFTER its async MP3 decode (no gesture at that point). Symptom fixed here:
// SFX audible but MUSIC never plays on iPad WeChat (fine in Safari + Android).
// Cheap permanent capture listeners: on every tap, wake anything not running.
function _unlockAllAudio() {
    if (audioCtx && audioCtx.state !== 'running') { try { audioCtx.resume(); } catch (e) { } }
    if (window.BGM && typeof BGM.resumeCtx === 'function') BGM.resumeCtx();
    _ensureIosKeepAlive();
}
document.addEventListener('touchend', _unlockAllAudio, true);
document.addEventListener('pointerdown', _unlockAllAudio, true);
// WeChat's own "audio is now allowed" moment (fires once its JS bridge is up)
if (typeof WeixinJSBridge !== 'undefined' && WeixinJSBridge.invoke) {
    try { WeixinJSBridge.invoke('getNetworkType', {}, _unlockAllAudio); } catch (e) { }
} else {
    document.addEventListener('WeixinJSBridgeReady', () => {
        try { WeixinJSBridge.invoke('getNetworkType', {}, _unlockAllAudio); } catch (e) { _unlockAllAudio(); }
    }, false);
}

function initAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    sfxDest();          // ensure the SFX master gain exists (applies saved mute)
    syncSfxMuteIcon();
    _ensureIosKeepAlive(); // initAudio is always called from a user gesture
}
const osc = (type, freq, dur, vol = 0.1) => {
    if (!audioCtx) return;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type; o.frequency.value = freq;
    o.connect(g); g.connect(sfxDest());
    g.gain.setValueAtTime(vol, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + dur);
    o.start(); o.stop(audioCtx.currentTime + dur);
}
const noise = (dur) => {
    if (!audioCtx) return;
    const bufferSize = audioCtx.sampleRate * dur;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const n = audioCtx.createBufferSource();
    n.buffer = buffer;
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.1, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + dur);
    n.connect(g); g.connect(sfxDest());
    n.start();
}
const synthWhipCrack = () => {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;

    // 1. Whoosh/Swell (the swing)
    const oscSwing = audioCtx.createOscillator();
    const gainSwing = audioCtx.createGain();
    oscSwing.type = 'triangle';
    oscSwing.frequency.setValueAtTime(100, now);
    oscSwing.frequency.exponentialRampToValueAtTime(700, now + 0.08);
    gainSwing.gain.setValueAtTime(0.001, now);
    gainSwing.gain.linearRampToValueAtTime(0.08, now + 0.06);
    gainSwing.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    
    oscSwing.connect(gainSwing);
    gainSwing.connect(sfxDest());
    oscSwing.start(now);
    oscSwing.stop(now + 0.1);

    // 2. The Crack (extremely sharp high-intensity pop)
    const oscCrack = audioCtx.createOscillator();
    const gainCrack = audioCtx.createGain();
    oscCrack.type = 'sawtooth';
    oscCrack.frequency.setValueAtTime(2800, now + 0.07);
    oscCrack.frequency.exponentialRampToValueAtTime(150, now + 0.13);
    
    gainCrack.gain.setValueAtTime(0.001, now);
    gainCrack.gain.setValueAtTime(0.35, now + 0.07); // loud, crisp snap!
    gainCrack.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    
    oscCrack.connect(gainCrack);
    gainCrack.connect(sfxDest());
    oscCrack.start(now + 0.07);
    oscCrack.stop(now + 0.15);

    // 3. Noise Snap (high frequency white noise snap/shockwave)
    const bufferSize = audioCtx.sampleRate * 0.08;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    const noiseNode = audioCtx.createBufferSource();
    noiseNode.buffer = buffer;

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1500, now + 0.07);
    filter.Q.setValueAtTime(1.5, now + 0.07);

    const gainNoise = audioCtx.createGain();
    gainNoise.gain.setValueAtTime(0.001, now);
    gainNoise.gain.setValueAtTime(0.3, now + 0.07);
    gainNoise.gain.exponentialRampToValueAtTime(0.001, now + 0.13);

    noiseNode.connect(filter);
    filter.connect(gainNoise);
    gainNoise.connect(sfxDest());
    noiseNode.start(now + 0.07);
};

const synthShoot = (type) => {
    if (type === 'wand') osc('sine', 800, 0.1, 0.05);
    if (type === 'whip') synthWhipCrack();
    if (type === 'orb') osc('triangle', 200, 0.3, 0.05);
    if (type === 'axe') osc('square', 150, 0.15, 0.05);
    if (type === 'cross') osc('sine', 600, 0.2, 0.05);
    if (type === 'knife') osc('sawtooth', 1000, 0.1, 0.02);
    if (type === 'garlic') osc('sine', 100, 0.5, 0.02);
};
const synthHit = () => osc('square', 100, 0.1, 0.05);
const synthGem = () => osc('sine', 1200, 0.1, 0.05);
const synthLevelUp = () => {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    [440, 554, 659, 880].forEach((f, i) => {
        const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
        o.frequency.value = f; o.connect(g); g.connect(sfxDest());
        g.gain.setValueAtTime(0.1, now + i * 0.1);
        g.gain.exponentialRampToValueAtTime(0.01, now + i * 0.1 + 0.3);
        o.start(now + i * 0.1); o.stop(now + i * 0.1 + 0.3);
    });
};
const synthHurt = () => {
    if (!audioCtx) return;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(150, audioCtx.currentTime);
    o.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.3);
    g.gain.setValueAtTime(0.2, audioCtx.currentTime);
    g.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.3);
    o.connect(g); g.connect(sfxDest());
    o.start(); o.stop(audioCtx.currentTime + 0.3);
}
const synthError = () => {
    if (!audioCtx) return;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(100, audioCtx.currentTime);
    o.frequency.linearRampToValueAtTime(50, audioCtx.currentTime + 0.2);
    g.gain.setValueAtTime(0.2, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
    o.connect(g); g.connect(sfxDest());
    o.start(); o.stop(audioCtx.currentTime + 0.2);
};

const synthDeath = () => {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const playNote = (freq, start, dur) => {
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = 'square';
        o.frequency.setValueAtTime(freq, start);
        g.gain.setValueAtTime(0.2, start);
        g.gain.exponentialRampToValueAtTime(0.01, start + dur);
        o.connect(g); g.connect(sfxDest());
        o.start(start); o.stop(start + dur);
    };
    // dadadadum
    playNote(220, now, 0.2);       // A3
    playNote(220, now + 0.25, 0.2);  // A3
    playNote(220, now + 0.5, 0.2);   // A3
    playNote(164.8, now + 0.75, 0.6); // E3 (lower)
};

const synthLootbox = () => {
    if (!audioCtx) return;
    const now = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(440, now);
    o.frequency.exponentialRampToValueAtTime(880, now + 0.1);
    o.frequency.exponentialRampToValueAtTime(1320, now + 0.2);
    g.gain.setValueAtTime(0.2, now);
    g.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    o.connect(g); g.connect(sfxDest());
    o.start(); o.stop(now + 0.3);
};

// ============================================================
// VS WEAPON SFX (procedural, matches the synth style above)
// Throttled per key so fast-firing weapons / crowd hits make ONE
// satisfying sound instead of a wall of noise (user request).
// ============================================================
const _sfxLast = {};
const sfxOK = (key, ms) => {
    if (!audioCtx) return false;
    const t = audioCtx.currentTime * 1000;
    if (_sfxLast[key] && t - _sfxLast[key] < ms) return false;
    _sfxLast[key] = t;
    return true;
};
// Filtered white-noise burst building block
const noiseBurst = (start, dur, filterType, freq, Q, vol) => {
    if (!audioCtx) return;
    const n = Math.floor(audioCtx.sampleRate * dur);
    const buf = audioCtx.createBuffer(1, n, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = audioCtx.createBufferSource(); src.buffer = buf;
    const f = audioCtx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = Q;
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(vol, start);
    g.gain.exponentialRampToValueAtTime(0.001, start + dur);
    src.connect(f); f.connect(g); g.connect(sfxDest());
    src.start(start); src.stop(start + dur);
};

// Air whoosh (thrown-blade-through-air). variant tweaks tone per projectile.
const synthSwoosh = (variant = 'plane') => {
    if (!audioCtx || !sfxOK('sw_' + variant, 55)) return;
    const now = audioCtx.currentTime;
    const cfg = {
        plane:    { dur: 0.22, f0: 700,  f1: 2400, Q: 0.9, vol: 0.12 }, // light & airy (boosted to be audible)
        scissors: { dur: 0.12, f0: 1600, f1: 3400, Q: 3.0, vol: 0.05 }, // sharp & metallic
        cross:    { dur: 0.20, f0: 600,  f1: 1700, Q: 1.0, vol: 0.05 }  // heavy & low
    }[variant] || { dur: 0.16, f0: 900, f1: 2800, Q: 1.2, vol: 0.05 };
    const n = Math.floor(audioCtx.sampleRate * cfg.dur);
    const buf = audioCtx.createBuffer(1, n, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = audioCtx.createBufferSource(); src.buffer = buf;
    const bp = audioCtx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = cfg.Q;
    bp.frequency.setValueAtTime(cfg.f0, now);
    bp.frequency.exponentialRampToValueAtTime(cfg.f1, now + cfg.dur * 0.6);
    bp.frequency.exponentialRampToValueAtTime(cfg.f0, now + cfg.dur);
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(cfg.vol, now + cfg.dur * 0.35);
    g.gain.exponentialRampToValueAtTime(0.001, now + cfg.dur);
    src.connect(bp); bp.connect(g); g.connect(sfxDest());
    src.start(now); src.stop(now + cfg.dur);
};

// Paper plane hit: arrow punching through a straw target (fwip + thunk)
const synthPlaneHit = () => {
    if (!audioCtx || !sfxOK('planehit', 70)) return;
    const now = audioCtx.currentTime;
    noiseBurst(now, 0.06, 'highpass', 2600, 6, 0.06); // fwip
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(320, now);
    o.frequency.exponentialRampToValueAtTime(90, now + 0.12);
    g.gain.setValueAtTime(0.09, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    o.connect(g); g.connect(sfxDest());
    o.start(now); o.stop(now + 0.13);
};

// Scissors hit: wet blade-into-flesh stab
const synthStab = () => {
    if (!audioCtx || !sfxOK('stab', 70)) return;
    const now = audioCtx.currentTime;
    noiseBurst(now, 0.1, 'bandpass', 750, 1.0, 0.16); // wet slice (boosted)
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(180, now);
    o.frequency.exponentialRampToValueAtTime(60, now + 0.11);
    g.gain.setValueAtTime(0.12, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    o.connect(g); g.connect(sfxDest());
    o.start(now); o.stop(now + 0.12);
};

// Ruler slash: airy whoosh + bright metallic "shing" (sword slash)
const synthSwordSlash = () => {
    if (!audioCtx || !sfxOK('slash', 60)) return;
    const now = audioCtx.currentTime;
    noiseBurst(now, 0.14, 'bandpass', 1800, 1.2, 0.10); // air cut
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(2600, now + 0.02);
    o.frequency.exponentialRampToValueAtTime(700, now + 0.16);
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.11, now + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    o.connect(g); g.connect(sfxDest());
    o.start(now); o.stop(now + 0.19);
};

// Ruler electric arc launch: low "vromb" travel hum (sawtooth + fast vibrato)
const synthArcHum = () => {
    if (!audioCtx || !sfxOK('archum', 80)) return;
    const now = audioCtx.currentTime;
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(220, now);
    o.frequency.linearRampToValueAtTime(150, now + 0.3);
    const lfo = audioCtx.createOscillator(), lg = audioCtx.createGain();
    lfo.type = 'sine'; lfo.frequency.value = 28; lg.gain.value = 42; // vromb wobble
    lfo.connect(lg); lg.connect(o.frequency);
    const lp = audioCtx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.08, now + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
    o.connect(lp); lp.connect(g); g.connect(sfxDest());
    o.start(now); o.stop(now + 0.33);
    lfo.start(now); lfo.stop(now + 0.33);
};

// Electricity crackle when the arc zaps an enemy (stun feedback)
const synthZap = () => {
    if (!audioCtx || !sfxOK('zap', 55)) return;
    const now = audioCtx.currentTime;
    noiseBurst(now, 0.09, 'highpass', 3800, 4, 0.10); // static crackle
    for (let i = 0; i < 2; i++) {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = 'square';
        const s = now + i * 0.035;
        o.frequency.setValueAtTime(1400 + Math.random() * 900, s);
        o.frequency.exponentialRampToValueAtTime(500, s + 0.05);
        g.gain.setValueAtTime(0.06, s);
        g.gain.exponentialRampToValueAtTime(0.001, s + 0.06);
        o.connect(g); g.connect(sfxDest());
        o.start(s); o.stop(s + 0.07);
    }
};

// ---- Sampled SFX (real recordings beat synthesis for sword sounds) ----
// Small MP3s under sfx/, decoded ONCE into WebAudio buffers for zero-latency
// replay. playSfxSample returns false while loading / on failure so callers
// can fall back to the procedural synths (GFW-resilient: same-origin fetch).
const _sfxBuffers = {};
function loadSfxSample(path) {
    if (!audioCtx || _sfxBuffers[path] !== undefined) return;
    _sfxBuffers[path] = 'loading';
    // Resolve through AssetCache: sfx/ is a prefetched cache group, so this is
    // usually an instant IndexedDB blob; on a cold cache getBlobUrl downloads
    // via the gh-proxy mirror AND seeds the cache for next time. Plain path
    // only when AssetCache is missing or every source failed.
    const resolved = (window.AssetCache && AssetCache.getBlobUrl)
        ? AssetCache.getBlobUrl(path).then(u => u || path)
        : Promise.resolve(path);
    resolved.then(url => fetch(url)).then(r => r.arrayBuffer())
        .then(ab => audioCtx.decodeAudioData(ab))
        .then(b => { _sfxBuffers[path] = b; })
        .catch(() => { _sfxBuffers[path] = false; });
}
// playSfxSample returns false while loading / on failure so callers can fall
// back to the procedural synths. Optional dur trims playback (e.g. a clip with
// a rubbish tail); optional throttleMs coalesces crowd events into one sound
// (a throttled call returns TRUE so the caller doesn't fire the synth either).
function playSfxSample(path, vol = 0.5, dur, throttleMs) {
    if (!audioCtx) return false;
    if (throttleMs && !sfxOK('smp_' + path, throttleMs)) return true;
    const b = _sfxBuffers[path];
    if (b === undefined) { loadSfxSample(path); return false; }
    if (!b || b === 'loading') return false;
    const src = audioCtx.createBufferSource();
    src.buffer = b;
    const g = audioCtx.createGain();
    g.gain.value = vol;
    src.connect(g); g.connect(sfxDest());
    if (dur) src.start(0, 0, dur); else src.start();
    return true;
}

// Triangle hit: woody block ricocheting off a hard surface (tok-tik, two knocks)
const synthRicochet = () => {
    if (!audioCtx || !sfxOK('ricochet', 60)) return;
    const now = audioCtx.currentTime;
    const knock = (t, f, vol) => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(f, t);
        o.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.05); // woody pitch drop
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);        // short hard decay
        o.connect(g); g.connect(sfxDest());
        o.start(t); o.stop(t + 0.09);
        noiseBurst(t, 0.02, 'highpass', 3200, 5, vol * 0.5);        // hard-surface click
    };
    knock(now, 1150, 0.14);        // first bounce
    knock(now + 0.07, 1550, 0.07); // lighter second bounce = ricochet
};

// Eraser / book hit: heavy blunt smash into flesh (deep thud + meaty splat)
const synthSmash = () => {
    if (!audioCtx || !sfxOK('smash', 80)) return;
    const now = audioCtx.currentTime;
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(140, now);
    o.frequency.exponentialRampToValueAtTime(45, now + 0.18);
    g.gain.setValueAtTime(0.16, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    o.connect(g); g.connect(sfxDest());
    o.start(now); o.stop(now + 0.21);
    noiseBurst(now, 0.08, 'lowpass', 500, 0.7, 0.09);
};

// Eraser doppler pass-by: low strobing bumblebee that swells then recedes
const synthEraserPass = () => {
    if (!audioCtx || !sfxOK('eraserpass', 180)) return;
    const now = audioCtx.currentTime, dur = 0.4;
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(70, now);
    o.frequency.linearRampToValueAtTime(130, now + dur * 0.5); // doppler approach
    o.frequency.linearRampToValueAtTime(60, now + dur);        // doppler recede
    const lp = audioCtx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    // Strobing tremolo (bumblebee wing-beat) modulating the gain
    const lfo = audioCtx.createOscillator(), lfoG = audioCtx.createGain();
    lfo.type = 'sine'; lfo.frequency.value = 22; lfoG.gain.value = 0.045;
    lfo.connect(lfoG); lfoG.connect(g.gain);
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.09, now + dur * 0.5); // swell on approach
    g.gain.linearRampToValueAtTime(0.001, now + dur);      // fade on recede
    o.connect(lp); lp.connect(g); g.connect(sfxDest());
    o.start(now); o.stop(now + dur);
    lfo.start(now); lfo.stop(now + dur);
};

// Magic book travelling: fluttering pages (rapid soft paper blips)
const synthPageFlutter = () => {
    if (!audioCtx || !sfxOK('flutter', 80)) return;
    const now = audioCtx.currentTime;
    for (let i = 0; i < 6; i++) {
        noiseBurst(now + i * 0.04, 0.04, 'bandpass', 1500 + Math.random() * 900, 1.4, 0.11);
    }
};

// Water balloon falling: descending bomb whistle
const synthBombFall = () => {
    if (!audioCtx || !sfxOK('bombfall', 120)) return;
    const now = audioCtx.currentTime, dur = 0.55;
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(1400, now);
    o.frequency.exponentialRampToValueAtTime(300, now + dur);
    g.gain.setValueAtTime(0.001, now);
    g.gain.linearRampToValueAtTime(0.05, now + 0.1);
    g.gain.setValueAtTime(0.05, now + dur - 0.1);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    o.connect(g); g.connect(sfxDest());
    o.start(now); o.stop(now + dur);
};

// Water balloon impact: splash (noise sweep + a bubble)
const synthSplash = () => {
    if (!audioCtx || !sfxOK('splash', 80)) return;
    const now = audioCtx.currentTime, dur = 0.25;
    const n = Math.floor(audioCtx.sampleRate * dur);
    const buf = audioCtx.createBuffer(1, n, audioCtx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = audioCtx.createBufferSource(); src.buffer = buf;
    const lp = audioCtx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3000, now);
    lp.frequency.exponentialRampToValueAtTime(500, now + dur);
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.12, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    src.connect(lp); lp.connect(g); g.connect(sfxDest());
    src.start(now); src.stop(now + dur);
    const o = audioCtx.createOscillator(), bg = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(500, now + 0.05);
    o.frequency.exponentialRampToValueAtTime(900, now + 0.2);
    bg.gain.setValueAtTime(0.04, now + 0.05);
    bg.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    o.connect(bg); bg.connect(sfxDest());
    o.start(now + 0.05); o.stop(now + 0.23);
};
let currentTTSWord = "";
const playTTS = () => {
    if (!currentTTSWord) return;
    const text = currentTTSWord;

    // Helper: try playing an Audio URL with a timeout.
    // If audio doesn't start playing within timeoutMs, fall through to onFail.
    // The settled flag prevents double-triggering from both timeout and error.
    const tryAudioWithTimeout = (url, label, onFail, timeoutMs = 2000) => {
        let settled = false;
        const fail = (reason) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            console.warn(`${label} ${reason}`);
            onFail();
        };
        const audio = new Audio(url);
        audio.addEventListener('playing', () => {
            settled = true;
            clearTimeout(timer);
        });
        audio.onerror = () => fail("error");
        audio.play().catch(e => fail("play failed: " + e));
        const timer = setTimeout(() => fail("timeout"), timeoutMs);
    };

    // Preferred order (field feedback 2026-07-28): the hand-recorded MP3s are
    // the best voice for long phrases / word pairs that Youdao mangles, but
    // they used to load so slowly from GitHub Pages that the chain fell
    // through to the robotic Baidu TTS. Now:
    //   cached MP3 (IndexedDB, instant, nicest voice)
    //   → Youdao TTS (mainland CDN, good for single words)
    //   → MP3 via gh-proxy mirror (fast + seeds the cache for next time)
    //   → Baidu TTS (robotic, last network resort)
    //   → browser speechSynthesis
    // Filename convention shared with AssetCache.audioPath: recordings are
    // named after the exact phrase text minus Windows-illegal characters
    // ("Does he want?" → "Does he want.mp3").
    const mp3Path = (window.AssetCache && AssetCache.audioPath)
        ? AssetCache.audioPath(text)
        : 'audio_mp3/' + text.replace(/[\\/:*?"<>|]/g, '').trim() + '.mp3';

    const playCachedMP3 = () => {
        if (window.AssetCache && AssetCache.getCached) {
            AssetCache.getCached(mp3Path).then(u => {
                if (u) tryAudioWithTimeout(u, "Cached MP3", playYoudao, 3000);
                else playYoudao();
            }).catch(playYoudao);
        } else {
            playYoudao();
        }
    };

    const playYoudao = () => {
        const url = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(text)}&type=1`;
        tryAudioWithTimeout(url, "Youdao TTS", playLocalMP3, 1000);
    };

    const playLocalMP3 = () => {
        const plainUrl = mp3Path.split('/').map(encodeURIComponent).join('/');
        if (window.AssetCache && AssetCache.getBlobUrl) {
            // Mirror-aware download; also persists to IndexedDB so the NEXT
            // play of this phrase hits the instant cached branch above.
            AssetCache.getBlobUrl(mp3Path).then(u => {
                tryAudioWithTimeout(u || plainUrl, "Local MP3", playBaidu, 10000);
            });
        } else {
            tryAudioWithTimeout(plainUrl, "Local MP3", playBaidu, 10000);
        }
    };

    const playBaidu = () => {
        const url = `https://fanyi.baidu.com/gettts?lan=uk&text=${encodeURIComponent(text)}&spd=3&source=web`;
        tryAudioWithTimeout(url, "Baidu Fanyi TTS", playBrowserSpeech, 2000);
    };

    const playBrowserSpeech = () => {
        console.log("Falling back to Browser Speech");
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
            const u = new SpeechSynthesisUtterance(text);
            u.rate = 0.9;
            const voices = window.speechSynthesis.getVoices();
            const v = voices.find(val => val.lang.includes('GB') || val.lang.includes('UK') || val.lang.includes('en'));
            if (v) u.voice = v;
            window.speechSynthesis.speak(u);
        }
    };

    playCachedMP3();
};

// --- PHASER STATE (game declared in boot.js) ---


// --- DOM FUNCTIONS ---
function updateDOMHUD(stats, time, kills) {
    // Only update if in Vampire Survivors mode and HUD exists
    if (activeGameMode !== 'VS') return;

    const hpFill = document.getElementById('hpBarFill');
    const hpText = document.getElementById('hpText');
    const xpFill = document.getElementById('xpBar');
    const lvlDisp = document.getElementById('levelDisplay');
    const timerDisp = document.getElementById('timerDisplay');
    const killDisp = document.getElementById('killDisplay');

    if (hpFill) hpFill.style.width = (stats.hp / stats.maxHp * 100) + '%';
    if (hpText) hpText.innerText = `${Math.floor(stats.hp)}/${stats.maxHp}`;
    if (xpFill) xpFill.style.width = (stats.xp / stats.nextLevelXp * 100) + '%';
    if (lvlDisp) lvlDisp.innerText = stats.level;
    if (killDisp) killDisp.innerText = kills;

    if (timerDisp) {
        const m = Math.floor(time / 60);
        const s = time % 60;
        timerDisp.innerText = `${m < 10 ? '0' + m : m}:${s < 10 ? '0' + s : s}`;
    }
}


// "New improved version" promo: highlight the VS button + show a badge to
// nudge kids who haven't tried the revamped VS. Shown ONCE PER USER — the
// FIRST time the game-selection menu appears for that student; any later visit
// clears it. Persistence is PER-USER (server-side `vsPromoSeen` on the student
// record, so it follows them across devices) with a localStorage fallback for
// anonymous / test-mode play (no logged-in student). Called from EVERY path
// that reveals the menu (showGameSelection + the return-from-game paths).
function _vsPromoGetSeen() {
    // Logged-in student: seen if EITHER the account flag (cross-device, from the
    // server via login) OR a per-user device mirror is set. The mirror covers
    // the gap before the server value round-trips back on the next login, and
    // survives even if the persistence POST fails.
    if (typeof authActiveUser !== 'undefined' && authActiveUser && authActiveUser.id) {
        if (authActiveUser.vsPromoSeen) return true;
        try { return localStorage.getItem('vsPromoSeen_' + authActiveUser.id) === '1'; } catch (e) { return false; }
    }
    // Anonymous / test mode: device-local fallback
    try { return localStorage.getItem('vsPromoSeen') === '1'; } catch (e) { return false; }
}
function _vsPromoSetSeen() {
    if (typeof authActiveUser !== 'undefined' && authActiveUser && authActiveUser.id) {
        authActiveUser.vsPromoSeen = true;
        // Per-user device mirror: remembered immediately on THIS device even
        // before the server value comes back on next login.
        try { localStorage.setItem('vsPromoSeen_' + authActiveUser.id, '1'); } catch (e) { }
        // Persist to the student's cached profile + backend (fire-and-forget)
        // so it follows the child to OTHER devices.
        if (typeof saveActiveUserToCache === 'function') { try { saveActiveUserToCache(); } catch (e) { } }
        if (typeof apiFetch === 'function' && typeof API_BASE !== 'undefined') {
            apiFetch(`${API_BASE}/updateStudent`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ studentId: authActiveUser.id, fields: { vsPromoSeen: true } })
            }).catch(e => console.warn('Failed to persist vsPromoSeen', e));
        }
    } else {
        try { localStorage.setItem('vsPromoSeen', '1'); } catch (e) { }
    }
}
function applyVsPromo() {
    const badge = document.getElementById('vsPromoBadge');
    const btn = document.getElementById('vsGameBtn');
    if (!_vsPromoGetSeen()) {
        if (badge) badge.classList.remove('hidden');
        if (btn) btn.classList.add('vs-promo-glow');
        _vsPromoSetSeen();
    } else {
        if (badge) badge.classList.add('hidden');
        if (btn) btn.classList.remove('vs-promo-glow');
    }
}

function showGameSelection() {
    // Reset all screens
    const screens = ['startScreen', 'gomokuScreen', 'gomokuGameOverScreen', 'gameOverScreen', 'gameIntroOverlay', 'vsCharSelect', 'studentManagerOverlay', 'studyModeOverlay', 'unoScreen', 'unoGameOverScreen', 'spellingGame', 'wordRecGame', 'sentenceMatchGame', 'levelUpMenu'];
    screens.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });

    // Cancel any pending stop from endUno(), then stop UNO scene properly
    if (typeof unoGameActive !== 'undefined') unoGameActive = false;
    if (window.unoTimerInterval) clearInterval(window.unoTimerInterval);
    if (window.unoStopTimeout) { clearTimeout(window.unoStopTimeout); window.unoStopTimeout = null; }
    if (typeof game !== 'undefined' && game && game.scene && game.scene.isActive('UnoScene')) {
        game.scene.stop('UnoScene');
    }

    // Stop Vampire Survivors scene and hide canvas
    if (typeof game !== 'undefined' && game && game.scene && game.scene.isActive('MainScene')) {
        game.scene.stop('MainScene');
    }
    // Restore the shared canvas to CSS-px RESIZE (undo VS HiDPI) for other games
    if (typeof exitHiDpi === 'function') exitHiDpi();
    if (typeof game !== 'undefined' && game && game.canvas) {
        game.canvas.style.display = 'none';
    }
    if (typeof minigameCountdownInterval !== 'undefined' && minigameCountdownInterval) {
        clearInterval(minigameCountdownInterval);
        minigameCountdownInterval = null;
    }
    // Hide VS exit button + mute toggle
    const vsExitBtn = document.getElementById('vsExitBtn');
    if (vsExitBtn) vsExitBtn.classList.add('hidden');
    const vsMuteBtn = document.getElementById('vsMuteBtn');
    if (vsMuteBtn) vsMuteBtn.classList.add('hidden');
    const vsMusicBtn2 = document.getElementById('vsMusicBtn');
    if (vsMusicBtn2) vsMusicBtn2.classList.add('hidden');
    activeGameMode = null;

    document.getElementById('gameSelectionOverlay').classList.remove('hidden');

    applyVsPromo();

    // Gate the Tower Defense entry on sites where it isn't released yet (live).
    // Preview / localhost keep it selectable. (TD_ENABLED is defined in config.js,
    // loaded before game.js.)
    if (typeof applyTowerDefenseGate === 'function') applyTowerDefenseGate();
}

// --- WIZARD STATE ---
// --- WIZARD STATE (Moved to teaching_content.js for global access) ---

function initMenus() {
    if (typeof CLASS_CONFIG === 'undefined' || typeof CLASS_DAYS === 'undefined') {
        console.error("CLASS_CONFIG or CLASS_DAYS is undefined. Make sure teaching_content.js is loaded correctly.");
        return;
    }

    // Populate Day buttons
    const dayContainer = document.getElementById('day-buttons');
    dayContainer.innerHTML = '';

    CLASS_DAYS.forEach(day => {
        const btn = document.createElement('button');
        btn.className = 'wizard-btn bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold py-3 px-6 rounded-lg shadow-lg transform hover:scale-105 transition-all duration-200';
        btn.innerText = day;
        btn.onclick = () => selectDay(day);
        dayContainer.appendChild(btn);
    });
}

function selectDay(day) {
    selectedDay = day;

    if (day === "其他老师的学生") {
        document.getElementById('step-day').classList.add('hidden');
        document.getElementById('step-book').classList.remove('hidden');

        // Populate book buttons
        const bookContainer = document.getElementById('book-buttons');
        bookContainer.innerHTML = '';
        Object.keys(TEACHING_CONTENT).forEach(book => {
            const btn = document.createElement('button');
            btn.className = 'wizard-btn bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white font-bold py-3 px-6 rounded-lg shadow-lg transform hover:scale-105 transition-all duration-200';
            btn.innerText = book;
            btn.onclick = () => selectBook(book);
            bookContainer.appendChild(btn);
        });
        return;
    }

    // Hide step 1, show step 2
    document.getElementById('step-day').classList.add('hidden');
    document.getElementById('step-time').classList.remove('hidden');

    // Populate time buttons for this day
    const timeContainer = document.getElementById('time-buttons');
    const noClassMsg = document.getElementById('no-class-msg');
    timeContainer.innerHTML = '';

    const dayData = CLASS_CONFIG[day];

    if (dayData && Object.keys(dayData).length > 0) {
        noClassMsg.classList.add('hidden');
        Object.keys(dayData).forEach(time => {
            const btn = document.createElement('button');
            btn.className = 'wizard-btn bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white font-bold py-3 px-6 rounded-lg shadow-lg transform hover:scale-105 transition-all duration-200';
            btn.innerText = time;
            btn.onclick = () => selectTime(time);
            timeContainer.appendChild(btn);
        });
    } else {
        // No classes for this day
        noClassMsg.classList.remove('hidden');
    }
}

function selectTime(time) {
    selectedTime = time;

    const classData = CLASS_CONFIG[selectedDay][time];
    // Hide step 2, show step 3
    document.getElementById('step-time').classList.add('hidden');
    document.getElementById('step-student').classList.remove('hidden');

    // Populate student buttons
    const studentContainer = document.getElementById('student-buttons');
    studentContainer.innerHTML = '';

    if (classData && classData.students) {
        classData.students.forEach(student => {
            const btn = document.createElement('button');
            btn.className = 'wizard-btn bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-bold py-3 px-6 rounded-lg shadow-lg transform hover:scale-105 transition-all duration-200';
            btn.innerText = student;
            btn.onclick = () => selectStudent(student);
            studentContainer.appendChild(btn);
        });
    }
}

function selectBook(book) {
    selectedBook = book;
    document.getElementById('step-book').classList.add('hidden');
    document.getElementById('step-unit').classList.remove('hidden');

    const unitContainer = document.getElementById('unit-buttons');
    unitContainer.innerHTML = '';
    const bookData = TEACHING_CONTENT[book];
    if (bookData) {
        Object.keys(bookData).forEach(unit => {
            const btn = document.createElement('button');
            btn.className = 'wizard-btn bg-gradient-to-r from-yellow-600 to-amber-600 hover:from-yellow-500 hover:to-amber-500 text-white font-bold py-3 px-6 rounded-lg shadow-lg transform hover:scale-105 transition-all duration-200';
            btn.innerText = `Unit ${unit}`;
            btn.onclick = () => selectUnit(unit);
            unitContainer.appendChild(btn);
        });
    }
}

function selectUnit(unit) {
    selectedUnit = unit;
    selectedStudent = "Other Student"; // Tag as other teacher student

    document.getElementById('step-unit').classList.add('hidden');
    document.getElementById('step-greeting').classList.remove('hidden');

    document.getElementById('greeting-text').innerText = `欢迎！`;
    loadContent();
}

function selectStudent(student) {
    selectedStudent = student;

    // Hide step 3, show step 4 (greeting)
    document.getElementById('step-student').classList.add('hidden');
    document.getElementById('step-greeting').classList.remove('hidden');

    // Update greeting text
    document.getElementById('greeting-text').innerText = `Hello, ${student}!`;

    // Load content for this class
    loadContent();
}

// --- BACK NAVIGATION ---
function goBackToDay() {
    document.getElementById('step-time').classList.add('hidden');
    document.getElementById('step-book').classList.add('hidden'); // Also hide if we came from book
    document.getElementById('step-day').classList.remove('hidden');
    selectedDay = null;
    selectedBook = null;
}

function goBackToTime() {
    document.getElementById('step-student').classList.add('hidden');
    document.getElementById('step-time').classList.remove('hidden');
    selectedTime = null;
}

function goBackToStudentOrUnit() {
    document.getElementById('step-greeting').classList.add('hidden');
    if (selectedBook) {
        document.getElementById('step-unit').classList.remove('hidden');
    } else {
        document.getElementById('step-student').classList.remove('hidden');
    }
    selectedStudent = null;
    selectedUnit = null;
}

function goBackToBook() {
    document.getElementById('step-unit').classList.add('hidden');
    document.getElementById('step-book').classList.remove('hidden');
    selectedBook = null;
    selectedUnit = null;
}

function goBackToTimeFromBook() {
    document.getElementById('step-book').classList.add('hidden');
    document.getElementById('step-time').classList.remove('hidden');
    selectedBook = null;
}

// --- GAME INTRO ---

let pendingReward = null;
let rewardContext = 'levelup';
let isFirstAttempt = true;
let minigameStartTime = 0; // Track when minigame started (in ms)
let currentMinigameType = ''; // Track which type of minigame is active
let minigameCountdownInterval = null; // Interval for countdown timer during minigames
let totalMinigameTimeMs = 0; // Track total time spent in all minigames



function startMinigameCountdown(scene) {
    // Clear any existing countdown
    if (minigameCountdownInterval) {
        clearInterval(minigameCountdownInterval);
    }

    // Update countdown every 100ms
    minigameCountdownInterval = setInterval(() => {
        let timeString = "";

        if (activeGameMode === 'Gomoku' && typeof gomokuMode !== 'undefined' && gomokuMode === 'speed') {
            // Show time until next computer move ONLY in speed mode
            const timeLeftMs = Math.max(0, gomokuNextAiTime - Date.now());
            const totalSec = Math.floor(timeLeftMs / 1000);
            const m = Math.floor(totalSec / 60);
            const s = totalSec % 60;
            const ms = Math.floor((timeLeftMs % 1000) / 10);
            timeString = `AI Move: ${m < 10 ? '0' + m : m}:${s < 10 ? '0' + s : s}:${ms < 10 ? '0' + ms : ms}`;
        } else {
            // Hide the timer for all other modes as requested
            timeString = "";
        }

        // Update all minigame timer displays
        const spellingTimer = document.getElementById('spelling-timer');
        const recTimer = document.getElementById('rec-timer');
        const grammarTimer = document.getElementById('grammar-timer');
        const sentencematchTimer = document.getElementById('sentencematch-timer');

        if (spellingTimer) spellingTimer.textContent = timeString;
        if (recTimer) recTimer.textContent = timeString;
        if (grammarTimer) grammarTimer.textContent = timeString;
        if (sentencematchTimer) sentencematchTimer.textContent = timeString;

        // NOTE: no survival-time deduction here. The VS scene is PAUSED while
        // a minigame is open, so accumulatedTime is already frozen — the old
        // "deduct 100ms per tick" on top of that made the HUD clock run
        // BACKWARDS during questions (survival = fight time MINUS question
        // time), which made the 10-minute final boss nearly unreachable.
    }, 100);
}

function startMiniGame(type, context) {
    rewardContext = context;
    isFirstAttempt = true;
    currentMinigameType = type;
    minigameStartTime = Date.now(); // Record start time

    // Start countdown timer display (we start it even to clear the strings if empty)
    const scene = game ? game.scene.getScene('MainScene') : null;
    startMinigameCountdown(scene);

    try {
        if (type === 'spelling') startSpellingGame();
        else if (type === 'wordrec') startWordRecGame();
        else if (type === 'scramble') startGrammarGame();
        else if (type === 'sentencematch') startSentenceMatchGame();
    } catch (err) {
        // A crash here would otherwise leave the game scene paused with no overlay
        // shown (a permanent white/frozen screen). Recover by ending the minigame
        // without crediting a reward, using the same resume logic as claimReward.
        console.error('Minigame start failed for type "' + type + '":', err);
        claimReward(false);
    }
}

function claimReward(success) {
    // Stop countdown timer
    if (minigameCountdownInterval) {
        clearInterval(minigameCountdownInterval);
        minigameCountdownInterval = null;
    }

    document.getElementById('spellingGame').classList.add('hidden');
    document.getElementById('wordRecGame').classList.add('hidden');
    document.getElementById('grammarGame').classList.add('hidden');
    document.getElementById('sentenceMatchGame').classList.add('hidden');

    // Calculate time penalty
    const timeSpentMs = Date.now() - minigameStartTime;
    const timeSpentSec = Math.floor(timeSpentMs / 1000);

    // Track cumulative minigame time
    totalMinigameTimeMs += timeSpentMs;

    if (rewardContext === 'gomoku' || activeGameMode === 'Gomoku') {
        completeGomokuMove(success);
        return;
    }

    if (rewardContext === 'uno' || activeGameMode === 'Uno') {
        completeUnoESLQuestion(success);
        return;
    }

    if (rewardContext === 'towerdefense' || activeGameMode === 'TowerDefense') {
        if (typeof tdCreditCoins === 'function') tdCreditCoins(success ? 50 : 0);
        return;
    }

    const scene = (game && activeGameMode === 'VS') ? game.scene.getScene('MainScene') : null;

    // Note: time was already deducted during countdown in startMinigameCountdown
    // Just update the HUD
    if (scene) {
        updateDOMHUD(scene.playerStats, Math.floor(scene.accumulatedTime / 1000), scene.killCount);

        // Apply reward based on game type and success
        if (success) {
            if (rewardContext === 'chest') {
                const r = POWER_UPS[Math.floor(Math.random() * POWER_UPS.length)];
                scene.applyReward(r);
            } else {
                scene.applyReward(pendingReward);
            }
        }
        game.scene.resume('MainScene');
    }
}

// --- PLACEHOLDERS FOR LARGE CHUNKS ---
function loadContent() {
    let book, unit, page;

    if (typeof authActiveUser !== 'undefined' && authActiveUser && authActiveUser.book && authActiveUser.unit && authActiveUser.page) {
        book = authActiveUser.book;
        unit = authActiveUser.unit.toString();
        page = authActiveUser.page.toString();
        selectedClassContent = { book, unit, page };
    } else if (selectedBook && selectedUnit) {
        book = selectedBook;
        unit = selectedUnit;
        // Assign the LAST page of that unit
        const bookData = TEACHING_CONTENT[book];
        const unitData = bookData[unit];
        const pages = Object.keys(unitData).sort((a, b) => parseInt(a) - parseInt(b));
        page = pages[pages.length - 1]; // Last page
        selectedClassContent = { book, unit, page };
    } else {
        if (!CLASS_CONFIG || !selectedDay || !selectedTime) return;
        const classData = CLASS_CONFIG[selectedDay] && CLASS_CONFIG[selectedDay][selectedTime];
        if (!classData || !classData.content) {
            console.warn("No content configured for:", selectedDay, selectedTime);
            return;
        }
        ({ book, unit, page } = classData.content);
        selectedClassContent = { book, unit, page };
    }

    // Default to empty
    SPELLING_WORDS = [];
    SIGHT_WORDS = [];
    GRAMMAR_SENTENCES = [];

    // Use Spaced Repetition logic to get all available items up to current page
    const sortedPages = getSortedPagesForBook(book);
    const activePageIndex = sortedPages.findIndex(p => p.book === book && p.unit === unit && p.page === page.toString());

    // We populate the global arrays with ALL eligible items (up to current)
    // The specific weighted selection will happen during minigame start
    const unitsToLoad = sortedPages.slice(0, activePageIndex + 1);

    unitsToLoad.forEach(p => {
        const content = TEACHING_CONTENT[book] && TEACHING_CONTENT[book][p.unit] && TEACHING_CONTENT[book][p.unit][p.page];
        if (content) {
            if (content.vocab) {
                content.vocab.forEach(w => {
                    if (!SPELLING_WORDS.includes(w)) SPELLING_WORDS.push(w);
                });
            }
            if (content.sentences) {
                content.sentences.forEach(s => {
                    // Avoid dupes if necessary, though sentences might be unique across pages usually
                    GRAMMAR_SENTENCES.push(s);
                });
            }
        }
    });

    // Format SIGHT_WORDS (legacy legacy...)
    SIGHT_WORDS = SPELLING_WORDS.map(w => [w]);

    if (SPELLING_WORDS.length === 0) {
        // Final fallback if absolutely nothing found
        const prefix = `${book} U${unit} P${page}`;
        SPELLING_WORDS = [`${prefix} Word1`];
        SIGHT_WORDS = [[`${prefix} Word1`]];
        GRAMMAR_SENTENCES = [`${prefix} Sentence 1.`];
    }
}

// SR result tracking for game session
var srGameResults = [];  // [{ type, key, firstAttempt }, ...]
var srInSessionFailures = new Set();  // Set of keys failed at least once this session
var srInSessionSuccesses = new Set(); // Set of keys succeeded on first attempt this session
// Last item served per type: passed to the SR picker so the same word/sentence
// is never served twice back-to-back (a failed item returns after ONE other
// item, forcing real retrieval instead of a short-term-memory echo).
var srLastServedKey = { vocab: null, sentences: null };

// --- MINIGAMES ---

function startSpellingGame() {
    if (SPELLING_WORDS.length === 0) { handleMinigameSuccess('spelling'); return; }
    startExerciseTracking();

    // SR-aware selection
    const { book, unit, page } = selectedClassContent;
    let word = getGameItemSR(book, unit, page, 'vocab', srInSessionFailures, srInSessionSuccesses, srLastServedKey.vocab);
    // SR can return undefined when everything is on cooldown or already
    // succeeded this session — fall back to any loaded word, never crash.
    if (!word) word = SPELLING_WORDS[Math.floor(Math.random() * SPELLING_WORDS.length)];
    srLastServedKey.vocab = itemKey(word);
    currentTTSWord = word;
    showTranslation('spelling-translation', word);
    showVocabImage('spelling-image', word);

    const gameEl = document.getElementById('spellingGame');
    gameEl.dataset.targetWord = word;
    gameEl.dataset.feedbackMode = "false";
    if (gameEl._spellingResetTimer) { clearTimeout(gameEl._spellingResetTimer); gameEl._spellingResetTimer = null; }
    // Reset the static palette keyboard so a new word rebuilds it fresh.
    document.getElementById('spelling-keyboard').dataset.built = "false";

    // Build fixed slots: every character position gets a slot. Non-letters are pre-filled & locked.
    const punct = [' ', "-", ".", "?", "!"];
    const slots = [];
    for (let i = 0; i < word.length; i++) {
        const ch = word[i];
        if (punct.includes(ch)) {
            slots.push({ type: 'fixed', char: ch });
        } else {
            slots.push({ type: 'letter', index: i });
        }
    }
    gameEl.dataset.slots = JSON.stringify(slots);

    // Full palette of letters (shuffled) — rendered once, never depletes.
    const letters = word.split('').filter(ch => !punct.includes(ch));
    const shuffled = [...letters].sort(() => 0.5 - Math.random());
    gameEl.dataset.letters = JSON.stringify(shuffled);
    // Placed letters keyed by letter-POSITION (so gaps survive deletes). Each entry
    // is the palette keyIndex that filled it. Empty slot => undefined.
    gameEl.dataset.placement = JSON.stringify(new Array(letters.length).fill(undefined));
    // Which palette bubbles are already used (placed). Length === letters.length.
    gameEl.dataset.usedKeys = JSON.stringify(new Array(letters.length).fill(false));

    // Un-hide the overlay BEFORE building the slots: buildSpellingSlots() ends
    // with fitAnswerArea(), which needs real layout widths. While the overlay is
    // display:none every width reads 0, so long words (e.g. "beautiful") were
    // never shrunk and their end slots rendered off-screen on narrow phones.
    // (Resetting result-action first also keeps buildSpellingSlots from painting
    // the fresh slots green off a previous round's success state.)
    const display = document.getElementById('spelling-input-display');
    display.classList.remove('shake');
    document.getElementById('spelling-result-action').classList.add('hidden');
    document.getElementById('spelling-actions').classList.remove('hidden');
    document.getElementById('spellingGame').classList.remove('hidden');
    buildSpellingSlots();
    buildSpellingKeyboard();
    setTimeout(playTTS, 500);
}

// Render the fixed + letter slots into #spelling-input-display, then refresh the
// palette bubble disabled-state (used bubbles -> dimmed & non-interactive).
function buildSpellingSlots() {
    const gameEl = document.getElementById('spellingGame');
    const slots = JSON.parse(gameEl.dataset.slots);
    const placement = JSON.parse(gameEl.dataset.placement);
    const usedKeys = JSON.parse(gameEl.dataset.usedKeys);
    const targetWord = gameEl.dataset.targetWord;
    const isFeedback = gameEl.dataset.feedbackMode === "true";
    const isSuccess = !document.getElementById('spelling-result-action').classList.contains('hidden');
    const isFrozen = gameEl.dataset.feedbackMode === "true"; // frozen while revealing

    // Rebuild the letter-string view from placement[] (one entry per letter-position).
    const container = document.getElementById('spelling-input-display');
    container.innerHTML = '';
    let letterIdx = 0;
    let groupEl = null; // current run of consecutive letter slots
    const flushGroup = () => { if (groupEl && groupEl.children.length) container.appendChild(groupEl); groupEl = null; };
    slots.forEach((slot, fullIdx) => {
        if (slot.type === 'fixed') {
            flushGroup(); // separators break the letter-run
            const cell = document.createElement('div');
            cell.className = 'study-slot border-transparent bg-transparent select-none';
            cell.style.color = '#475569';
            cell.innerText = slot.char === ' ' ? ' ' : slot.char;
            container.appendChild(cell);
        } else {
            if (!groupEl) {
                groupEl = document.createElement('div');
                groupEl.className = 'word-group';
            }
            const placedKey = placement[letterIdx];
            const filledChar = (placedKey !== undefined && placedKey !== null) ? JSON.parse(gameEl.dataset.letters)[placedKey] : '';
            const correctChar = targetWord[slot.index];
            const cell = document.createElement('div');
            cell.className = 'study-slot';
            if (isSuccess) {
                cell.classList.add('bg-green-500');
            } else if (isFeedback && filledChar) {
                cell.classList.add(filledChar === correctChar ? 'bg-green-500' : 'bg-red-500');
            }
            cell.innerText = filledChar;
            // Click a filled slot to DELETE that letter (frozen during reveal).
            if (filledChar && !isFrozen) {
                cell.onclick = () => removeSpellingLetter(fullIdx);
            } else {
                cell.onclick = null;
            }
            groupEl.appendChild(cell);
            letterIdx++;
        }
    });
    flushGroup();

    fitAnswerArea(container);

    // Refresh palette bubble disabled-state.
    const bubbles = document.querySelectorAll('#spelling-keyboard .letter-bubble');
    bubbles.forEach(b => {
        const ki = Number(b.dataset.keyIndex);
        if (usedKeys[ki]) b.classList.add('used');
        else b.classList.remove('used');
    });
}

// Keep the answer area on-screen: if the laid-out row is wider than its
// container (e.g. a long no-separator word like "understandable" on a narrow
// phone), shrink BOTH --answer-font and --slot-size until it fits. A slot is a
// fixed-width box, so shrinking the font alone never relieves the row width —
// the box must shrink too. Adapts to any window/container size; called after
// every (re)build and on window resize.
function fitAnswerArea(container) {
    // Not laid out yet (overlay still display:none / detached)? Every width
    // reads 0, so "fitting" would be a no-op that also resets a previous good
    // fit. Bail; the visible (re)build will fit against real widths.
    if (!container || container.clientWidth === 0) return;
    const getVar = (name) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || 0;
    const minFont = 12; // px floor for the letter glyph
    const minSlot = 22; // px floor for the slot box — below this we stop and let it scroll
    // Reset to the responsive defaults first, then measure from there.
    document.documentElement.style.setProperty('--answer-font', '');
    document.documentElement.style.setProperty('--slot-size', '');
    let font = getVar('--answer-font');
    let slot = getVar('--slot-size');
    // In real browsers the un-overridden vars resolve to their clamp() TEXT, so
    // parseFloat gives 0 — measure the actual rendered slot box/glyph instead
    // (always px). Without this the shrink loop never ran on devices and long
    // words like "beautiful" spilled off narrow phone screens.
    if (!font || !slot) {
        const slotEl = container.querySelector('.study-slot');
        if (slotEl) {
            if (!slot) slot = slotEl.getBoundingClientRect().width;
            if (!font) font = parseFloat(getComputedStyle(slotEl).fontSize) || 0;
        }
    }
    if (!font && !slot) return; // nothing measurable — leave defaults
    // Suspend slot transitions during the measure loop: ".study-slot { transition:
    // all }" animates width, and this loop is synchronous — time never advances,
    // so scrollWidth would keep reporting the pre-shrink size forever.
    container.classList.add('fit-measuring');
    while ((font > minFont || slot > minSlot) && container.scrollWidth > container.clientWidth) {
        if (font > minFont) { font -= 1; document.documentElement.style.setProperty('--answer-font', font + 'px'); }
        if (slot > minSlot) { slot -= 1; document.documentElement.style.setProperty('--slot-size', slot + 'px'); }
    }
    container.classList.remove('fit-measuring');
}

// Re-fit the answer area whenever the viewport/container size changes (rotate,
// resize, split-screen, different device). Debounced; only acts while the
// spelling minigame is on screen.
let _fitAnswerRAF = null;
window.addEventListener('resize', () => {
    const gameEl = document.getElementById('spellingGame');
    if (!gameEl || gameEl.classList.contains('hidden')) return;
    const c = document.getElementById('spelling-input-display');
    if (!c) return;
    if (_fitAnswerRAF) cancelAnimationFrame(_fitAnswerRAF);
    _fitAnswerRAF = requestAnimationFrame(() => fitAnswerArea(c));
});

// Build the palette keyboard ONCE. It never depletes — clicking a bubble copies a
// letter into the earliest empty letter-slot. The bubble stays put.
function buildSpellingKeyboard() {
    const gameEl = document.getElementById('spellingGame');
    const letters = JSON.parse(gameEl.dataset.letters);
    const container = document.getElementById('spelling-keyboard');
    if (container.dataset.built === "true") return; // already built; never rebuild
    container.innerHTML = '';
    letters.forEach((char, i) => {
        const bubble = document.createElement('div');
        bubble.className = 'letter-bubble';
        bubble.innerText = char;
        bubble.dataset.keyIndex = i;
        bubble.dataset.char = char;
        bubble.onclick = () => handleSpellingInput(i);
        container.appendChild(bubble);
    });
    container.dataset.built = "true";
}

// Place the palette letter (keyIndex) into the earliest EMPTY letter-slot.
// The palette bubble is marked used so it can't be placed twice, but the palette
// never depletes (the bubble stays visible, just disabled). Each placed letter is
// tracked by letter-POSITION in placement[], so gaps survive deletes.
function handleSpellingInput(keyIndex) {
    const gameEl = document.getElementById('spellingGame');
    if (gameEl.dataset.feedbackMode === "true") return; // frozen during reveal
    const slots = JSON.parse(gameEl.dataset.slots);
    const placement = JSON.parse(gameEl.dataset.placement);
    const usedKeys = JSON.parse(gameEl.dataset.usedKeys);
    const letters = JSON.parse(gameEl.dataset.letters);

    // Already used? ignore (can't place the same palette bubble twice).
    if (usedKeys[keyIndex]) return;

    // Find the earliest empty letter-slot (by letter-POSITION index).
    let letterIdx = 0;
    let targetPos = -1;
    for (let i = 0; i < slots.length; i++) {
        if (slots[i].type !== 'letter') continue;
        if (placement[letterIdx] === undefined || placement[letterIdx] === null) { targetPos = letterIdx; break; }
        letterIdx++;
    }
    if (targetPos === -1) return; // all letter-slots filled

    placement[targetPos] = keyIndex;
    usedKeys[keyIndex] = true;
    gameEl.dataset.placement = JSON.stringify(placement);
    gameEl.dataset.usedKeys = JSON.stringify(usedKeys);
    buildSpellingSlots();
}

// Delete a placed letter (by slot position). It simply disappears — nothing goes
// back to the keyboard (the palette never depletes). The palette bubble that
// supplied it is freed again so it can be reused.
function removeSpellingLetter(slotFullIdx) {
    const gameEl = document.getElementById('spellingGame');
    if (gameEl.dataset.feedbackMode === "true") return; // frozen during reveal
    const slots = JSON.parse(gameEl.dataset.slots);
    const placement = JSON.parse(gameEl.dataset.placement);
    const usedKeys = JSON.parse(gameEl.dataset.usedKeys);

    let letterIdx = 0;
    for (let i = 0; i < slotFullIdx; i++) {
        if (slots[i].type === 'letter') letterIdx++;
    }
    const keyUsed = placement[letterIdx];
    if (keyUsed === undefined || keyUsed === null) return;
    usedKeys[keyUsed] = false;
    placement[letterIdx] = undefined;
    gameEl.dataset.placement = JSON.stringify(placement);
    gameEl.dataset.usedKeys = JSON.stringify(usedKeys);
    buildSpellingSlots();
}

function clearSpelling() {
    const gameEl = document.getElementById('spellingGame');
    // Block CLEAR only during the success transition (when the result action is
    // shown) — during a WRONG reveal, allow CLEAR to skip the 5s wait.
    const success = !document.getElementById('spelling-result-action').classList.contains('hidden');
    if (success) return;
    if (gameEl.dataset.feedbackMode === "true") {
        // Wrong reveal in progress: cancel the pending reset and finish clearing.
        if (gameEl._spellingResetTimer) { clearTimeout(gameEl._spellingResetTimer); gameEl._spellingResetTimer = null; }
        gameEl.dataset.feedbackMode = "false";
    }
    const n = JSON.parse(gameEl.dataset.letters).length;
    gameEl.dataset.placement = JSON.stringify(new Array(n).fill(undefined));
    gameEl.dataset.usedKeys = JSON.stringify(new Array(n).fill(false));
    buildSpellingSlots();
    const display = document.getElementById('spelling-input-display');
    display.classList.remove('shake');
}

function checkSpelling() {
    const gameEl = document.getElementById('spellingGame');
    if (gameEl.dataset.feedbackMode === "true") return; // already revealed

    const slots = JSON.parse(gameEl.dataset.slots);
    const placement = JSON.parse(gameEl.dataset.placement);
    const usedKeys = JSON.parse(gameEl.dataset.usedKeys);
    const letters = JSON.parse(gameEl.dataset.letters);
    const targetWord = gameEl.dataset.targetWord;
    const punct = [' ', "-", ".", "?", "!"];

    const targetLetters = targetWord.split('').filter(ch => !punct.includes(ch)).join('');
    // Rebuild the placed string from placement[] (letter-positions L-to-R; gaps => '').
    const placedArr = placement.map(p => (p === undefined || p === null) ? '' : letters[p]);
    const currentInput = placedArr.join('');

    let placedCount = 0;
    for (let i = 0; i < placement.length; i++) if (placement[i] !== undefined && placement[i] !== null) placedCount++;
    const allCorrect = (currentInput === targetLetters);

    if (allCorrect) {
        gameEl.dataset.feedbackMode = "true";
        buildSpellingSlots();
        handleMinigameSuccess('spelling');
    } else {
        // Not all slots filled? give a soft nudge but don't reveal.
        if (placedCount < targetLetters.length) { synthError(); return; }
        gameEl.dataset.feedbackMode = "true";
        buildSpellingSlots(); // shows green/red, freezes editing
        const display = document.getElementById('spelling-input-display');
        display.classList.add('shake');
        synthError();
        setTimeout(() => display.classList.remove('shake'), 500);

        // Record SR failure at the FIRST wrong check so the item is due next
        // session even if the game ends before the student succeeds (spec).
        const spellKey = itemKey(gameEl.dataset.targetWord);
        if (!srInSessionFailures.has(spellKey)) {
            srInSessionFailures.add(spellKey);
            srGameResults.push({ type: 'vocab', key: spellKey, firstAttempt: false });
        }

        isFirstAttempt = false;
        incrementExerciseAttempts();

        if (gameEl._spellingResetTimer) clearTimeout(gameEl._spellingResetTimer);
        gameEl._spellingResetTimer = setTimeout(() => {
            if (document.getElementById('spelling-result-action').classList.contains('hidden')) {
                const n = JSON.parse(gameEl.dataset.letters).length;
                gameEl.dataset.placement = JSON.stringify(new Array(n).fill(undefined));
                gameEl.dataset.usedKeys = JSON.stringify(new Array(n).fill(false));
                gameEl.dataset.feedbackMode = "false";
                buildSpellingSlots();
            }
        }, 5000);
    }
}

// --- WORD REC ---
let recTimer;
let recTimeLeft;

function startWordRecGame() {
    if (SIGHT_WORDS.length === 0) { handleMinigameSuccess('rec'); return; }

    // Weighted selection
    const { book, unit, page } = selectedClassContent;
    const target = getWeightedItemForGame(book, unit, page, 'vocab');

    currentTTSWord = target;
    showTranslation('rec-translation', target);
    showVocabImage('rec-image', target);

    // Always show 5 words - no level-based scaling
    let choiceCount = 5;

    let choices = [target];
    const pool = SIGHT_WORDS.flat().filter(w => w !== target);
    pool.sort(() => 0.5 - Math.random());

    let added = 0;
    for (let w of pool) {
        if (added >= choiceCount - 1) break;
        if (!choices.includes(w)) {
            choices.push(w);
            added++;
        }
    }
    choices.sort(() => 0.5 - Math.random());

    const container = document.getElementById('rec-options');
    container.innerHTML = '';
    container.classList.remove('hidden');

    choices.forEach(word => {
        const btn = document.createElement('button');
        btn.className = "game-btn text-lg sm:text-xl py-4 min-w-[120px] w-full sm:w-auto";
        btn.innerText = word;
        btn.onclick = () => checkWordRec(word, target, btn);
        container.appendChild(btn);
    });

    document.getElementById('rec-result-action').classList.add('hidden');
    document.getElementById('wordRecGame').classList.remove('hidden');

    recTimeLeft = 100;
    const bar = document.getElementById('rec-timer-bar');
    bar.style.width = '100%';
    if (recTimer) clearInterval(recTimer);
    recTimer = setInterval(() => {
        recTimeLeft -= 1;
        bar.style.width = recTimeLeft + '%';
        if (recTimeLeft <= 0) {
            clearInterval(recTimer);
            isFirstAttempt = false;
        }
    }, 50);
    setTimeout(playTTS, 500);
}

function checkWordRec(selected, target, btn) {
    clearInterval(recTimer);
    if (selected === target) {
        // Correct word clicked → win immediately. (Word-level speech was removed;
        // speech now happens on full sentences after a correct unscramble.)
        handleMinigameSuccess('rec');
    } else {
        synthError();
        btn.classList.add('bg-red-500', 'shake');
        setTimeout(() => {
            btn.classList.remove('bg-red-500', 'shake');
            startWordRecGame();
        }, 500);
    }
}

// --- GRAMMAR ---

function startGrammarGame() {
    if (GRAMMAR_SENTENCES.length === 0) { handleMinigameSuccess('grammar'); return; }
    startExerciseTracking();

    const { book, unit, page } = selectedClassContent;
    let rawEntry = getGameItemSR(book, unit, page, 'sentences', srInSessionFailures, srInSessionSuccesses, srLastServedKey.sentences);

    // SR lookup can return undefined or [] (empty spaced-repetition pool).
    // Normalize to a list of usable sentence strings, falling back to any
    // loaded sentence so we never crash (a crash here would freeze the game).
    let possibilities = Array.isArray(rawEntry)
        ? rawEntry.slice()
        : (rawEntry !== undefined && rawEntry !== null ? [rawEntry] : []);
    possibilities = possibilities.filter(p => typeof p === 'string' && p.trim().length > 0);
    if (possibilities.length === 0) {
        possibilities = GRAMMAR_SENTENCES.filter(p => typeof p === 'string' && p.trim().length > 0);
    }
    if (possibilities.length === 0) { handleMinigameSuccess('grammar'); return; }
    const primarySentence = possibilities[0];
    srLastServedKey.sentences = itemKey(primarySentence);

    // Store valid possibilities for validation
    const grammarGameEl = document.getElementById('grammarGame');
    grammarGameEl.dataset.validOptions = JSON.stringify(possibilities);
    grammarGameEl.dataset.targetSentence = primarySentence;
    showTranslation('grammar-translation', primarySentence);


    const sentContainer = document.getElementById('sentence-container');
    const dock = document.getElementById('word-dock');
    sentContainer.innerHTML = ''; dock.innerHTML = '';

    document.getElementById('grammar-result-action').classList.add('hidden');
    document.getElementById('grammar-actions').classList.remove('hidden');
    // Clear any speech-gate left over from a previous sentence-scramble round
    // so it doesn't linger into the next one.
    const prevGrammarGate = document.getElementById('grammar-speech-gate');
    if (prevGrammarGate) prevGrammarGate.remove();

    const rawChunks = primarySentence.split(' ');
    const tokens = rawChunks.map(chunk => {
        return { word: chunk, punct: '' };
    });

    const candidateIndices = tokens.map((_, i) => i);
    candidateIndices.sort(() => 0.5 - Math.random());

    // Always use ALL words - no level-based scaling
    let numBlanks = tokens.length;

    const blankIndices = candidateIndices.slice(0, numBlanks);
    const neededOptions = [];

    const sentenceDiv = document.createElement('div');
    sentenceDiv.className = 'sentence-row';

    tokens.forEach((token, index) => {
        if (blankIndices.includes(index)) {
            neededOptions.push(token.word);
            const dz = document.createElement('div');
            dz.className = 'drop-zone';
            dz.dataset.expected = token.word;
            sentenceDiv.appendChild(dz);
            if (token.punct) {
                const span = document.createElement('span');
                span.innerText = token.punct;
                span.className = "mr-2";
                sentenceDiv.appendChild(span);
            }
        } else {
            const span = document.createElement('span');
            span.className = "mx-1";
            span.innerText = token.word + token.punct;
            sentenceDiv.appendChild(span);
        }
    });
    sentContainer.appendChild(sentenceDiv);

    neededOptions.sort(() => 0.5 - Math.random());
    neededOptions.forEach(opt => {
        const wordDiv = document.createElement('div');
        wordDiv.className = 'draggable';
        wordDiv.innerText = opt;
        wordDiv.dataset.word = opt;
        // Placement is handled by the delegated #word-dock listener (placeFromDock),
        // which also depletes the tile. No per-tile onclick (avoids double-placement).
        dock.appendChild(wordDiv);
    });

    grammarGameEl.dataset.frozen = "false";
    document.getElementById('grammarGame').classList.remove('hidden');
}

// Place the dock tile `sourceEl` into the earliest empty drop-zone, then REMOVE
// it from the dock so it's clear which words are left. If no empty zone, ignore.
function placeGrammarWord(sourceEl) {
    if (grammarGameEl().dataset.frozen === "true") return;
    const emptyZone = Array.from(document.querySelectorAll('.drop-zone')).find(z => z.children.length === 0);
    if (!emptyZone) return;
    const word = sourceEl.dataset.word;
    const item = document.createElement('div');
    item.className = 'draggable placed';
    item.innerText = word;
    item.dataset.word = word;
    // Removal is handled by the delegated #sentence-container listener (consistent
    // with the dock). No per-item onclick (avoids double-removal / double-return).
    emptyZone.appendChild(item);
    emptyZone.classList.add('filled');
    if (sourceEl.parentElement) sourceEl.remove();
}

// Remove a placed word and RETURN its tile to the dock so it can be reused.
function deleteGrammarWord(item) {
    if (grammarGameEl().dataset.frozen === "true") return;
    item.classList.remove('wrong', 'correct');
    const word = item.dataset.word;
    if (item.parentElement) {
        item.parentElement.classList.remove('filled');
        item.remove();
    }
    // Return the tile to the dock.
    const dock = document.getElementById('word-dock');
    const tile = document.createElement('div');
    tile.className = 'draggable';
    tile.innerText = word;
    tile.dataset.word = word;
    dock.appendChild(tile);
}

function clearGrammar() {
    // CLEAR works even while frozen (e.g. during the post-check reveal): it
    // cancels the pending reset and returns every placed word to the dock so
    // the player can start over.
    if (grammarGameEl()._grammarResetTimer) {
        clearTimeout(grammarGameEl()._grammarResetTimer);
        grammarGameEl()._grammarResetTimer = null;
    }
    // Remove all placed words and RETURN every tile to the dock (this widget
    // depletes on placement, so "clear" must restore the full set).
    const dock = document.getElementById('word-dock');
    document.querySelectorAll('.drop-zone').forEach(zone => {
        zone.querySelectorAll('.draggable.placed').forEach(p => {
            const tile = document.createElement('div');
            tile.className = 'draggable';
            tile.innerText = p.dataset.word;
            tile.dataset.word = p.dataset.word;
            dock.appendChild(tile);
            p.remove();
        });
        zone.classList.remove('filled');
    });
    // Re-enable editing (clearing returns to a fresh, editable state).
    grammarGameEl().dataset.frozen = "false";
}

function grammarGameEl() {
    return document.getElementById('grammarGame');
}

function checkGrammar() {
    const zones = document.querySelectorAll('.drop-zone');
    const gameEl = document.getElementById('grammarGame');
    const validOptions = JSON.parse(gameEl.dataset.validOptions || "[]");

    // 1. Collect user's words
    let userWords = [];
    let anyFilled = false;
    let allFilled = true;

    zones.forEach(zone => {
        if (zone.children.length > 0) {
            anyFilled = true;
            userWords.push(zone.children[0].innerText);
        } else {
            allFilled = false;
            userWords.push(null); // Gap
        }
    });

    // 2. Check complete match against ANY valid option
    let exactMatchFound = false;

    if (allFilled) {
        for (let option of validOptions) {
            // Tokenize option to get words only
            const optChunks = option.split(' ');
            const optWords = optChunks;

            // Compare arrays
            if (optWords.length === userWords.length) {
                const isMatch = optWords.every((w, i) => w === userWords[i]);
                if (isMatch) {
                    exactMatchFound = true;
                    break;
                }
            }
        }
    }

    // 3. Update UI
    let allCorrect = true;
    zones.forEach((zone, i) => {
        if (zone.children.length > 0) {
            const item = zone.children[0];
            const word = item.innerText;

            if (exactMatchFound) {
                // If the whole sentence is a valid variation, everything is correct
                item.classList.add('correct');
                item.classList.remove('wrong');
            } else {
                // Fallback: Grade against the *primary* expected word (from the slot definition)
                // This gives feedback based on the original structure if the user is off
                if (word === zone.dataset.expected) {
                    item.classList.add('correct');
                    item.classList.remove('wrong');
                } else {
                    item.classList.add('wrong');
                    item.classList.remove('correct');
                    allCorrect = false;
                }
            }
        } else {
            allCorrect = false;
        }
    });

    if (exactMatchFound) allCorrect = true;

    if (anyFilled && !allCorrect) {
        synthError();
        // Record SR failure at the first wrong check (see spelling note above).
        const gramKey = itemKey(document.getElementById('grammarGame').dataset.targetSentence);
        if (!srInSessionFailures.has(gramKey)) {
            srInSessionFailures.add(gramKey);
            srGameResults.push({ type: 'sentences', key: gramKey, firstAttempt: false });
        }
        isFirstAttempt = false;
        incrementExerciseAttempts();
    }

    if (allCorrect) {
        grammarGameEl().dataset.frozen = "true";
        // SR + analytics are recorded NOW, at the successful CHECK. The speech
        // gate that follows is pronunciation practice only and must NEVER
        // affect SR state (spec): pass, skip, or quitting the app at the gate
        // all leave the unscramble result exactly as earned here. (Previously
        // this lived in handleMinigameSuccess, which only runs after the gate
        // closes — a student who quit at the gate lost their earned success.)
        {
            const tgt = document.getElementById('grammarGame').dataset.targetSentence;
            const gramKey = itemKey(tgt);
            if (exerciseAttempts === 1) {
                // First-attempt success → record success (doubles interval).
                srGameResults.push({ type: 'sentences', key: gramKey, firstAttempt: true });
                srInSessionSuccesses.add(gramKey);
            } else {
                // Fail-then-success: never re-prompt again this session (spec A).
                srInSessionFailures.delete(gramKey);
                srInSessionSuccesses.add(gramKey);
            }
            queueExerciseEvent('sentenceScramble', 'game', tgt);
        }
        // Speech step: now that the sentence is built correctly, ask the student
        // to say it aloud (Whisper). Skipped silently if the model isn't ready
        // yet, so it never blocks the reward or shows a spinner.
        const targetSentence = document.getElementById('grammarGame').dataset.targetSentence || '';
        if (window.SpeechStatus && window.SpeechStatus.isReady() && window.SpeechUI && window.SpeechUI.makeSentenceGate) {
            const actions = document.getElementById('grammar-actions');
            if (actions) actions.classList.add('hidden');
            // Place the speech gate INTO the now-empty word-dock so the user doesn't scroll.
            const dock = document.getElementById('word-dock');
            const gate = window.SpeechUI.makeSentenceGate({
                target: targetSentence,
                level: 2,
                mode: 'game', // tags speech telemetry events with the game context
                onDone: function () {
                    const g = document.getElementById('grammar-speech-gate');
                    if (g) g.remove();
                    handleMinigameSuccess('grammar');
                }
            });
            gate.id = 'grammar-speech-gate';
            if (dock) {
                dock.innerHTML = '';  // clear any residual tiles
                dock.classList.remove('bg-gray-100');
                dock.classList.add('bg-transparent');
                dock.appendChild(gate);
            } else {
                const container = grammarGameEl().querySelector('.minigame-container') || grammarGameEl();
                container.appendChild(gate);
            }
        } else {
            handleMinigameSuccess('grammar');
        }
    } else {
        // Wrong: reveal for ~5s (frozen), then return all placed words to the
        // dock so the player can retry. (This widget depletes on placement, so
        // the reset must RESTORE tiles — merely removing them would lose words.)
        grammarGameEl().dataset.frozen = "true";
        if (grammarGameEl()._grammarResetTimer) clearTimeout(grammarGameEl()._grammarResetTimer);
        grammarGameEl()._grammarResetTimer = setTimeout(() => {
            const dock = document.getElementById('word-dock');
            document.querySelectorAll('.drop-zone').forEach(zone => {
                zone.querySelectorAll('.draggable.placed').forEach(p => {
                    const tile = document.createElement('div');
                    tile.className = 'draggable';
                    tile.innerText = p.dataset.word;
                    tile.dataset.word = p.dataset.word;
                    dock.appendChild(tile);
                    p.remove();
                });
                zone.classList.remove('filled');
            });
            grammarGameEl().dataset.frozen = "false";
            grammarGameEl()._grammarResetTimer = null;
        }, 5000);
    }
}


// --- SENTENCE MATCH MINIGAME ---
let gameModeSelectedBTile = null;

function startSentenceMatchGame() {
    startExerciseTracking();
    const { book, unit, page } = selectedClassContent;

    let pairs = [];
    const result = getGameSentencePairsSR(book, unit, page, srInSessionFailures, srInSessionSuccesses);
    
    if (result && result.pairs && result.pairs.length > 0) {
        pairs = result.pairs;
    }

    // Fallback if selection returns nothing
    if (pairs.length === 0) {
        pairs = [
            { a: "What's your name?", b: "My name is Sarah." },
            { a: "How old are you?", b: "I'm seven years old." },
            { a: "What colour is the apple?", b: "The apple is red." }
        ];
    }

    const shuffledPairs = pairs; // Already picked and unique from one page

    // Store in game element for later reference
    const gameEl = document.getElementById('sentenceMatchGame');
    gameEl.dataset.pairs = JSON.stringify(shuffledPairs);
    gameEl.dataset.pairAttempts = JSON.stringify(shuffledPairs.map(() => 1));
    gameEl.dataset.pairQueued = JSON.stringify(shuffledPairs.map(() => false));

    // Create shuffled B sentences
    const bSentences = shuffledPairs.map((p, i) => ({ text: p.b, correctIndex: i }));
    bSentences.sort(() => 0.5 - Math.random());

    // Build pairs UI
    const pairsContainer = document.getElementById('sentencematch-pairs');
    pairsContainer.innerHTML = shuffledPairs.map((pair, index) => `
        <div class="match-pair-row flex flex-col sm:flex-row gap-2 items-stretch">
            <div class="sentence-a flex-1 bg-indigo-600 p-3 rounded-lg text-white font-medium text-sm sm:text-base" data-index="${index}">
                ${pair.a}
            </div>
            <div class="gm-sentence-b-slot flex-1 bg-gray-200 p-3 rounded-lg min-h-[48px] border-2 border-dashed border-gray-400 flex items-center justify-center cursor-pointer text-gray-700" 
                 data-target-index="${index}" 
                 onclick="handleGameModeSlotClick(${index})">
                <span class="text-gray-400 text-sm">Tap to place</span>
            </div>
        </div>
    `).join('');

    // Build dock UI
    const dock = document.getElementById('sentencematch-dock');
    dock.innerHTML = bSentences.map(item => `
        <button class="gm-sentence-b-tile bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded-lg text-sm font-medium transition-all cursor-pointer min-h-[44px]"
                data-correct-index="${item.correctIndex}"
                onclick="selectGameModeBTile(this)">
            ${item.text}
        </button>
    `).join('');

    gameModeSelectedBTile = null;

    document.getElementById('sentencematch-actions').classList.remove('hidden');
    document.getElementById('sentencematch-result-action').classList.add('hidden');
    document.getElementById('sentenceMatchGame').classList.remove('hidden');
}

function selectGameModeBTile(tile) {
    document.querySelectorAll('.gm-sentence-b-tile').forEach(t => t.classList.remove('ring-4', 'ring-yellow-400'));
    gameModeSelectedBTile = tile;
    tile.classList.add('ring-4', 'ring-yellow-400');
}

function handleGameModeSlotClick(slotIndex) {
    const slot = document.querySelector(`.gm-sentence-b-slot[data-target-index="${slotIndex}"]`);

    const existingTile = slot.querySelector('.gm-sentence-b-tile');
    if (existingTile) {
        returnGameModeTileToDock(existingTile);
        slot.innerHTML = '<span class="text-gray-400 text-sm">Tap to place</span>';
        return;
    }

    if (gameModeSelectedBTile) {
        slot.innerHTML = '';
        slot.appendChild(gameModeSelectedBTile);
        gameModeSelectedBTile.classList.remove('ring-4', 'ring-yellow-400');
        gameModeSelectedBTile = null;
    }
}

function returnGameModeTileToDock(tile) {
    const dock = document.getElementById('sentencematch-dock');
    tile.classList.remove('ring-4', 'ring-yellow-400');
    tile.style.backgroundColor = '';
    dock.appendChild(tile);
}

function checkSentenceMatch() {
    const slots = document.querySelectorAll('.gm-sentence-b-slot');
    const gameEl = document.getElementById('sentenceMatchGame');
    const pairsData = JSON.parse(gameEl.dataset.pairs);

    let allCorrect = true;
    let anyPlaced = false;

    slots.forEach((slot) => {
        const tile = slot.querySelector('.gm-sentence-b-tile');

        if (tile) {
            anyPlaced = true;
            const targetIndex = parseInt(slot.dataset.targetIndex);

            // CHECK HARDENING (2026-09-08, "Doris stuck CHECK"): same
            // whitespace-collapse as study checkRoundF — a visually-correct
            // placement must never fail on invisible characters.
            const placedText = normMatchText(tile.innerText);
            const expectedText = normMatchText(pairsData[targetIndex].b);

            if (placedText === expectedText) {
                tile.style.backgroundColor = '#10b981'; // green
                
                // Track pair individually
                let pairQueued = JSON.parse(gameEl.dataset.pairQueued);
                if (!pairQueued[targetIndex]) {
                    let pairAttempts = JSON.parse(gameEl.dataset.pairAttempts);
                    const itemDetails = `A: ${pairsData[targetIndex].a} | B: ${pairsData[targetIndex].b}`;
                    // Record SR result for sentence pair
                    const pairItem = JSON.parse(document.getElementById('sentenceMatchGame').dataset.pairs)[targetIndex];
                    const pairKey = itemKey(pairItem);
                    const isFirstAttempt = pairAttempts[targetIndex] === 1;
                    if (isFirstAttempt) {
                        // First-attempt success → record success (doubles interval).
                        srGameResults.push({ type: 'sentencePairs', key: pairKey, firstAttempt: true });
                        srInSessionSuccesses.add(pairKey);
                    } else {
                        // Fail-then-success: never re-prompt again this session (spec A).
                        // Must ALSO join the success set — deleting from the failure
                        // set alone drops the pair back to its persisted (still-due)
                        // group and it would be re-selected immediately.
                        srInSessionFailures.delete(pairKey);
                        srInSessionSuccesses.add(pairKey);
                    }

                    queueExerciseEvent('sentenceMatch', 'game', itemDetails, pairAttempts[targetIndex]);
                    pairQueued[targetIndex] = true;
                    gameEl.dataset.pairQueued = JSON.stringify(pairQueued);
                }
            } else {
                tile.style.backgroundColor = '#ef4444'; // red
                allCorrect = false;
            }
        } else {
            allCorrect = false;
        }
    });

    if (!anyPlaced) return;

    if (allCorrect) {
        handleMinigameSuccess('sentencematch');
    } else {
        synthError();
        isFirstAttempt = false;
        incrementExerciseAttempts();
        
        let pairAttempts = JSON.parse(gameEl.dataset.pairAttempts);
        let pairQueued = JSON.parse(gameEl.dataset.pairQueued);
        
        // Mark as failed for SR (record once per pair at first wrong check)
        pairsData.forEach((pair, idx) => {
            if (!pairQueued[idx]) {
                const pkey = itemKey(pair);
                if (!srInSessionFailures.has(pkey)) {
                    srInSessionFailures.add(pkey);
                    srGameResults.push({ type: 'sentencePairs', key: pkey, firstAttempt: false });
                }
            }
        });

        for (let i = 0; i < pairsData.length; i++) {
            if (!pairQueued[i]) pairAttempts[i]++;
        }
        gameEl.dataset.pairAttempts = JSON.stringify(pairAttempts);

        // Reset after 2 seconds
        setTimeout(() => {
            const tiles = document.querySelectorAll('.gm-sentence-b-tile');
            tiles.forEach(tile => {
                returnGameModeTileToDock(tile);
            });
            const slots = document.querySelectorAll('.gm-sentence-b-slot');
            slots.forEach(slot => {
                slot.innerHTML = '<span class="text-gray-400 text-sm">Tap to place</span>';
            });
        }, 2000);
    }
}


function handleMinigameSuccess(gameType) {
    let actionsId, resultId, itemDetails = null;
    if (gameType === 'spelling') { 
        actionsId = 'spelling-actions'; 
        resultId = 'spelling-result-action'; 
        itemDetails = document.getElementById('spellingGame').dataset.targetWord;
    }
    else if (gameType === 'rec') { actionsId = 'rec-options'; resultId = 'rec-result-action'; }
    else if (gameType === 'sentencematch') { actionsId = 'sentencematch-actions'; resultId = 'sentencematch-result-action'; }
    else { 
        actionsId = 'grammar-actions'; 
        resultId = 'grammar-result-action'; 
        itemDetails = document.getElementById('grammarGame').dataset.targetSentence;
    }

    // Track exercise analytics (skip word rec)
    if (gameType !== 'rec') {
        const exerciseTypeMap = { 'spelling': 'spelling', 'grammar': 'sentenceScramble', 'sentencematch': 'sentenceMatch' };
        
        // SR result tracking for spelling (vocab) only. A failure is already
        // recorded at the first wrong check (in the check handlers); grammar
        // records BOTH its SR result and its analytics event at the successful
        // CHECK (see checkGrammar) because the speech gate sits between
        // check and this function — and the gate must never affect SR state.
        if (gameType === 'spelling') {
            const srType = 'vocab';
            const key = itemKey(itemDetails);
            if (exerciseAttempts === 1) {
                // First-attempt success → record success (doubles interval).
                srGameResults.push({ type: srType, key: key, firstAttempt: true });
                srInSessionSuccesses.add(key);
            } else {
                // Fail-then-success: never re-prompt again this session (spec A).
                // Must ALSO join the success set — deleting from the failure set
                // alone drops the key back to its persisted (still-due) group and
                // it would be re-selected immediately.
                srInSessionFailures.delete(key);
                srInSessionSuccesses.add(key);
            }
        }

        // Only queue globally for spelling. Sentence Match handles its own item
        // queuing; grammar queues at check time (see above).
        if (gameType !== 'sentencematch' && gameType !== 'grammar') {
            queueExerciseEvent(exerciseTypeMap[gameType] || gameType, 'game', itemDetails);
        }
    }

    if (actionsId) document.getElementById(actionsId).classList.add('hidden');
    const resultDiv = document.getElementById(resultId);
    resultDiv.classList.remove('hidden');

    // Always give reward on eventual success.
    const isGomokuOrUno = (activeGameMode === 'Gomoku' || rewardContext === 'gomoku' || activeGameMode === 'Uno' || rewardContext === 'uno');
    const btnText = isGomokuOrUno ? "CONTINUE!" : "GET POWER UP!";
    resultDiv.innerHTML = `<button onclick="claimReward(true)" class="game-btn bg-green-500 text-2xl py-4 px-8 animate-bounce">${btnText}</button>`;
}



// Init
game = null;
initMenus();
loadContent();

// DOM Listeners for Grammar (kept for safety, but placement is handled via
// placeGrammarWord/deleteGrammarWord; these are no-ops while frozen).
document.getElementById('word-dock').addEventListener('click', (e) => {
    if (e.target.classList.contains('draggable')) {
        placeGrammarWord(e.target);
    }
});
document.getElementById('sentence-container').addEventListener('click', (e) => {
    if (e.target.classList.contains('draggable') && e.target.classList.contains('placed')) {
        deleteGrammarWord(e.target);
    }
});

// Initialize menus on load
window.addEventListener('DOMContentLoaded', initMenus);

// --- KEYBOARD SUPPORT FOR MINIGAMES ---
window.addEventListener('keydown', (e) => {
    // Check if Study Mode is active - if so, let it handle the keyboard
    if (typeof STUDY_STATE !== 'undefined' && STUDY_STATE.active) return;

    // Check if Spelling Minigame is active
    const spellingGameEl = document.getElementById('spellingGame');
    if (spellingGameEl && !spellingGameEl.classList.contains('hidden')) {
        // Prevent default browser behavior for Enter/Backspace only when spelling game is active
        // This stops focused buttons (like CLEAR) from being triggered again by the Enter key
        if (e.key === 'Enter' || e.key === 'Backspace') {
            e.preventDefault();
        }
        handleGameSpellingKeyDown(e.key);
    }
});

function handleGameSpellingKeyDown(key) {
    const gameEl = document.getElementById('spellingGame');
    const frozen = gameEl.dataset.feedbackMode === "true";
    if (key === 'Enter') {
        if (!frozen) checkSpelling();
    } else if (key === 'Backspace') {
        // Remove the last placed letter (L-to-R), freeing its palette bubble. Not a full clear.
        if (!gameEl.classList.contains('hidden') && !frozen) {
            const placement = JSON.parse(gameEl.dataset.placement);
            const usedKeys = JSON.parse(gameEl.dataset.usedKeys);
            for (let i = placement.length - 1; i >= 0; i--) {
                if (placement[i] !== undefined && placement[i] !== null) {
                    usedKeys[placement[i]] = false;
                    placement[i] = undefined;
                    break;
                }
            }
            gameEl.dataset.placement = JSON.stringify(placement);
            gameEl.dataset.usedKeys = JSON.stringify(usedKeys);
            buildSpellingSlots();
        }
    } else if (key.length === 1 && key.match(/[a-z0-9]/i)) {
        if (frozen) return;
        const gameEl = document.getElementById('spellingGame');
        const usedKeys = JSON.parse(gameEl.dataset.usedKeys);
        const bubbles = document.querySelectorAll('#spelling-keyboard .letter-bubble');
        // Pick the FIRST matching bubble that is NOT already used (so repeated
        // letters like the two 'p's in "opposite" each get their own bubble).
        for (let bubble of bubbles) {
            if (bubble.innerText.toLowerCase() === key.toLowerCase() && bubble.isConnected) {
                if (!usedKeys[Number(bubble.dataset.keyIndex)]) {
                    handleSpellingInput(Number(bubble.dataset.keyIndex));
                    break;
                }
            }
        }
    }
}

// --- THEME SYSTEM (KID FRIENDLY / DARK THEME) ---
function toggleTheme() {
    const isKidFriendly = document.body.classList.toggle('kid-friendly');
    localStorage.setItem('theme-kid-friendly', isKidFriendly ? 'true' : 'false');
    updateThemeUI(isKidFriendly);
}

function updateThemeUI(isKidFriendly) {
    const themeToggleIcon = document.getElementById('themeToggleIcon');
    if (themeToggleIcon) {
        themeToggleIcon.textContent = isKidFriendly ? '🧸' : '☀️';
    }
}

function initTheme() {
    const savedTheme = localStorage.getItem('theme-kid-friendly');
    const isKidFriendly = savedTheme === 'true';
    if (isKidFriendly) {
        document.body.classList.add('kid-friendly');
    } else {
        document.body.classList.remove('kid-friendly');
    }
    updateThemeUI(isKidFriendly);
}

// Auto-run theme initialization
initTheme();

function goBackFromGameSelection() {
    document.getElementById('gameSelectionOverlay').classList.add('hidden');
    document.getElementById('startScreen').classList.remove('hidden');
    // Ensure step-greeting is visible and others are hidden
    const stepContainers = document.querySelectorAll('.step-container');
    stepContainers.forEach(container => container.classList.add('hidden'));
    document.getElementById('step-greeting').classList.remove('hidden');
}


