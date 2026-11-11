/* =========================================================================
 * asset_cache.js — mirror-aware fetch + IndexedDB cache for repo assets.
 * (Generalized from td_asset_cache.js, which covered only TD sprites.)
 *
 * Problem (field-tested 2026-07-27, no VPN): assets served same-origin from
 * GitHub Pages are GFW-throttled — TD's ~5MB of sprites took forever on first
 * load, and the hand-recorded audio_mp3 files loaded so slowly that the audio
 * chain fell through to the robotic Baidu TTS before they arrived. WeChat also
 * evicts the HTTP cache, so students keep re-downloading.
 *
 * Fix — the pattern that solved the 41MB Whisper download (speech_engine.js):
 *   • Every asset fetch goes through the CN-fast gh-proxy mirror first,
 *     same-origin fallback, and lands in IndexedDB permanently.
 *   • Prefetch in the background: TD sprites right after page load, and the
 *     current teaching page's vocab images + MP3s as soon as the class
 *     content is known (auto-derived from TEACHING_CONTENT — new vocab and
 *     new recordings are picked up with ZERO list maintenance).
 *   • Anything not prefetched is cached on first use via getBlobUrl(), so
 *     every asset ever touched becomes instant + WeChat-eviction-proof.
 *
 * API (window.AssetCache):
 *   url(path)        sync   blob: URL if already in memory, else plain path
 *   getCached(path)  async  blob: URL from memory/IndexedDB only (no network)
 *   getBlobUrl(path) async  memory → IndexedDB → mirror download; null if all fail
 *   prefetch(paths)  async  background warm-up of a path list
 *
 * Every failure path degrades to the original same-origin behavior; this
 * module can only make loads faster, never break them.
 * ========================================================================= */
(function (global) {
  'use strict';

  var DB_NAME = 'asset-cache';
  var DB_VERSION = 1;
  var FETCH_TIMEOUT_MS = 45000; // per file, per mirror — background work, be patient

  // Version token per path prefix — bump ONE group when its files change and
  // only that group re-downloads. Unmatched paths fall into the 'misc' group.
  var GROUP_VERSIONS = [
    { prefix: 'sprites/td/',   token: 'td-sprites-v1' },
    { prefix: 'sprites/vs/',   token: 'vs-sprites-v3' },
    { prefix: 'images/vocab/', token: 'vocab-v1' },
    { prefix: 'think_parks_assets/', token: 'think-parks-v1' },
    { prefix: 'pu2_race_assets/', token: 'pu2-race-v1' },
    { prefix: 'pu3_circus_assets/', token: 'pu3-circus-v1' },
    { prefix: 'pu3_u9_p114_story_assets/', token: 'pu3-u9-p114-v1' },
    { prefix: 'pu1_u7_p87_assets/', token: 'pu1-u7-p87-v1' },
    { prefix: 'pu3_u3_p35_assets/', token: 'pu3-u3-p35-v2' },
    { prefix: 'pu2_u5_p60_assets/', token: 'pu2-u5-p60-v1' },
    { prefix: 'audio_mp3/',    token: 'audio-v1' },
    { prefix: 'music/',        token: 'music-v1' },
    { prefix: 'sfx/',          token: 'sfx-v1' }
  ];
  var MISC_TOKEN = 'misc-v1';
  function keyFor(path) {
    for (var i = 0; i < GROUP_VERSIONS.length; i++) {
      if (path.indexOf(GROUP_VERSIONS[i].prefix) === 0) return GROUP_VERSIONS[i].token + '/' + path;
    }
    return MISC_TOKEN + '/' + path;
  }

  // Every image tower_defense.js preload() requests. test_asset_manifest.js
  // asserts this list covers every .png under sprites/td/ on disk, so a new
  // game sprite CANNOT be added without being prefetched here.
  var TD_SPRITES = [
    'sprites/td/enemies.png',
    'sprites/td/towers.png',
    'sprites/td/anim/dropout.png',
    'sprites/td/anim/backpack.png',
    'sprites/td/anim/nerd.png',
    'sprites/td/anim/pencil.png',
    'sprites/td/anim/parts/dropout/head.png',
    'sprites/td/anim/parts/dropout/torso.png',
    'sprites/td/anim/parts/dropout/arm.png',
    'sprites/td/anim/parts/dropout/leg.png',
    'sprites/td/anim/parts/dropout/head_attack.png',
    'sprites/td/anim/parts/dropout/head_hit.png',
    'sprites/td/anim/dropout_walk.png',
    'sprites/td/anim/dropout_action.png'
  ];

  // Every image vampire_survivors.js preload() requests (player puppet parts +
  // school-item art). Same manifest-test guarantee as TD_SPRITES. Files with
  // '_raw' in the name (uncut Nano Banana sheets, tooling input only) are
  // deliberately excluded — they are never loaded at runtime.
  var VS_SPRITES = [
    'sprites/vs/player_body.png',
    'sprites/vs/player_arm.png',
    'sprites/vs/player_foot_l.png',
    'sprites/vs/player_foot_r.png',
    'sprites/vs/skippy_body.png',
    'sprites/vs/skippy_arm.png',
    'sprites/vs/skippy_foot_l.png',
    'sprites/vs/skippy_foot_r.png',
    'sprites/vs/portrait_monitor.png',
    'sprites/vs/portrait_skippy.png',
    'sprites/vs/fx_slash_sheet.png',
    'sprites/vs/item_jumprope.png',
    'sprites/vs/item_balloon.png',
    'sprites/vs/item_book.png',
    'sprites/vs/item_chest.png',
    'sprites/vs/item_eraser.png',
    'sprites/vs/item_magnet.png',
    'sprites/vs/item_milk.png',
    'sprites/vs/item_plane.png',
    'sprites/vs/item_ruler.png',
    'sprites/vs/item_scissors.png',
    'sprites/vs/item_star.png',
    'sprites/vs/item_tornado.png',
    'sprites/vs/item_triangle.png',
    'sprites/vs/enemy_rat_walk.png',
    'sprites/vs/enemy_rat_hit.png',
    'sprites/vs/enemy_bat_up.png',
    'sprites/vs/enemy_bat_down.png',
    'sprites/vs/enemy_bat_hit.png',
    'sprites/vs/enemy_zombie_walk_a.png',
    'sprites/vs/enemy_zombie_walk_b.png',
    'sprites/vs/enemy_zombie_windup.png',
    'sprites/vs/enemy_zombie_lunge.png',
    'sprites/vs/enemy_zombie_hit.png',
    'sprites/vs/enemy_zombie_dead.png',
    'sprites/vs/enemy_boss_walk_a.png',
    'sprites/vs/enemy_boss_walk_b.png',
    'sprites/vs/enemy_boss_windup.png',
    'sprites/vs/enemy_boss_lunge.png',
    'sprites/vs/enemy_boss_hit.png',
    'sprites/vs/enemy_boss_dead.png',
    'sprites/vs/enemy_bp_walk_a.png',
    'sprites/vs/enemy_bp_walk_b.png',
    'sprites/vs/enemy_bp_windup.png',
    'sprites/vs/enemy_bp_lunge.png',
    'sprites/vs/enemy_bp_hit.png',
    'sprites/vs/enemy_bp_dead.png'
  ];

  // Background music (bgm.js): 2MB — exactly the kind of file that stalls on
  // GitHub Pages without a VPN, so it's prefetched + cached like the sprites.
  var MUSIC = [
    'music/study_hall_shuffle.mp3'
  ];

  // Sampled SFX recordings (game.js loadSfxSample/playSfxSample). Without the
  // cache these streamed from GitHub Pages, so first plays fell back to the
  // procedural synths mid-game. Manifest-checked like the sprite lists.
  var SFX = [
    'sfx/bat_death.mp3',
    'sfx/book_travelling.mp3',
    'sfx/electric_arc_hit.mp3',
    'sfx/jump_rope_fireball_hit.mp3',
    'sfx/paper_plane_hit.mp3',
    'sfx/paper_plane_travelling.mp3',
    'sfx/scissors_travelling.mp3',
    'sfx/sword-hit.mp3',
    'sfx/sword-slash.mp3',
    'sfx/tornado.mp3',
    'sfx/zombie_death.mp3'
  ];

  var urlMap = {};   // path -> blob: URL (memory; read synchronously by url())
  var missing = {};  // path -> true when every source failed this session (no refetch storms)
  var inflight = {}; // path -> Promise, dedupes concurrent getBlobUrl calls

  // --- IndexedDB ------------------------------------------------------------
  function openDB() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains('files')) {
          db.createObjectStore('files', { keyPath: 'name' });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function cacheGet(path) {
    return openDB().then(function (db) {
      return new Promise(function (resolve) {
        var tx = db.transaction('files', 'readonly');
        var req = tx.objectStore('files').get(keyFor(path));
        req.onsuccess = function () { resolve(req.result ? req.result.data : null); };
        req.onerror = function () { resolve(null); };
      });
    }).catch(function () { return null; });
  }

  function cachePut(path, blob) {
    return openDB().then(function (db) {
      return new Promise(function (resolve) {
        var tx = db.transaction('files', 'readwrite');
        tx.objectStore('files').put({ name: keyFor(path), data: blob });
        tx.oncomplete = resolve;
        tx.onerror = resolve;
      });
    }).catch(function () {});
  }

  // --- Mirrors (same host logic as speech_engine's rawRepoBase) --------------
  // On *.github.io: gh-proxy (CN-fast, CORS:*) first, same-origin fallback.
  // Anywhere else (localhost / file:// / future hosts): same-origin only.
  function sources() {
    var h = (location.hostname || '').toLowerCase();
    var out = [];
    if (h.endsWith('.github.io')) {
      var owner = h.slice(0, -'.github.io'.length);
      var repo = (location.pathname || '').split('/').filter(Boolean)[0];
      if (owner && repo) {
        out.push('https://gh-proxy.com/https://raw.githubusercontent.com/' + owner + '/' + repo + '/main/');
      }
    }
    out.push(new URL('./', location.href).href); // same-origin
    return out;
  }

  // Paths are stored raw ("audio_mp3/Yes, he does.mp3"); encode per segment
  // for the actual request URL (spaces/commas in the hand-recorded filenames).
  function encodePath(path) {
    return path.split('/').map(encodeURIComponent).join('/');
  }

  function fetchWithTimeout(url) {
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, FETCH_TIMEOUT_MS);
    return fetch(url, { signal: ctrl.signal }).finally(function () { clearTimeout(timer); });
  }

  function log(msg) { if (global.__speechLog) global.__speechLog('Assets: ' + msg); }

  function fetchAndCache(path, srcs, options) {
    // Interactive assets can race the mirror and origin after a cache miss.
    if (options && options.race && srcs.length > 1) {
      return new Promise(function (resolve, reject) {
        var controllers = [], timers = [], remaining = srcs.length, settled = false;
        srcs.forEach(function (source) {
          var controller = new AbortController(); controllers.push(controller);
          var timer = setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT_MS); timers.push(timer);
          fetch(source + encodePath(path), { signal: controller.signal }).then(function (response) {
            if (!response.ok) throw new Error('HTTP ' + response.status);
            return response.blob();
          }).then(function (blob) {
            if (settled) return;
            settled = true; timers.forEach(clearTimeout);
            controllers.forEach(function (other) { if (other !== controller) other.abort(); });
            urlMap[path] = URL.createObjectURL(blob); cachePut(path, blob); resolve(urlMap[path]);
          }).catch(function () {
            clearTimeout(timer);
            if (--remaining === 0 && !settled) reject(new Error('all sources failed'));
          });
        });
      });
    }
    var attempt = function (i) {
      if (i >= srcs.length) return Promise.reject(new Error('all sources failed'));
      return fetchWithTimeout(srcs[i] + encodePath(path)).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.blob();
      }).then(function (blob) {
        urlMap[path] = URL.createObjectURL(blob);
        cachePut(path, blob); // fire-and-forget
        return urlMap[path];
      }).catch(function () { return attempt(i + 1); });
    };
    return attempt(0);
  }

  // memory → IndexedDB; never touches the network.
  function getCached(path) {
    if (urlMap[path]) return Promise.resolve(urlMap[path]);
    return cacheGet(path).then(function (blob) {
      if (!blob) return null;
      urlMap[path] = URL.createObjectURL(blob);
      return urlMap[path];
    });
  }

  // memory → IndexedDB → mirror download. Resolves null when every source
  // fails (e.g. the file simply doesn't exist) — callers fall back to the
  // plain path / next audio source, exactly like before this module existed.
  function getBlobUrl(path, options) {
    if (urlMap[path]) return Promise.resolve(urlMap[path]);
    if (missing[path]) return Promise.resolve(null);
    if (inflight[path]) return inflight[path];
    inflight[path] = getCached(path).then(function (u) {
      if (u) return u;
      return fetchAndCache(path, sources(), options).catch(function () {
        missing[path] = true;
        return null;
      });
    }).finally(function () { delete inflight[path]; });
    return inflight[path];
  }

  function prefetch(paths, label) {
    var t0 = Date.now();
    var hits = 0, downloads = 0, fails = 0;
    return Promise.all(paths.map(function (path) {
      return getCached(path).then(function (u) {
        if (u) { hits++; return; }
        return getBlobUrl(path).then(function (got) { got ? downloads++ : fails++; });
      });
    })).then(function () {
      log((label || 'prefetch') + ': ' + paths.length + ' files in ' +
        ((Date.now() - t0) / 1000).toFixed(1) + 's (cache ' + hits +
        ', downloaded ' + downloads + ', fallback ' + fails + ')');
    });
  }

  // --- Vocab/audio path derivation (mirrors game.js conventions) -------------
  function vocabImagePath(word) {
    return 'images/vocab/' + word.trim().toLowerCase().replace(/ /g, '-') + '.png';
  }
  function audioPath(text) {
    // Strip characters that cannot appear in Windows filenames (the recordings
    // live in the repo): \ / : * ? " < > |  — e.g. "Does he want?" → "Does he want.mp3"
    return 'audio_mp3/' + text.replace(/[\\/:*?"<>|]/g, '').trim() + '.mp3';
  }

  // Prefetch the CURRENT teaching page's vocab images + recordings as soon as
  // the class content is known (login / class pick sets selectedClassContent).
  // Derived from TEACHING_CONTENT at runtime → new pages, new vocab and new
  // recordings are covered automatically, no list to maintain. Items from
  // earlier pages (SR review) are cached on first use via getBlobUrl instead.
  var prefetchedPages = {};
  function prefetchCurrentPage() {
    try {
      var scc = global.selectedClassContent;
      var tc = global.TEACHING_CONTENT;
      if (!scc || !tc) return;
      var pageKey = scc.book + '/' + scc.unit + '/' + scc.page;
      if (prefetchedPages[pageKey]) return;
      var pageData = tc[scc.book] && tc[scc.book][scc.unit] && tc[scc.book][scc.unit][scc.page];
      if (!pageData) return;
      prefetchedPages[pageKey] = true;
      var paths = [];
      (pageData.vocab || []).forEach(function (w) {
        var word = (typeof w === 'string') ? w : (w && w.word) || '';
        if (!word) return;
        paths.push(vocabImagePath(word));
        paths.push(audioPath(word));
      });
      (pageData.sentences || []).forEach(function (s) {
        if (typeof s === 'string' && s) paths.push(audioPath(s));
      });
      (pageData.sentencePairs || []).forEach(function (p) {
        if (p && p.a) paths.push(audioPath(p.a));
        if (p && p.b) paths.push(audioPath(p.b));
      });
      if (paths.length) prefetch(paths, 'page ' + pageKey);
    } catch (_) { /* prefetch is best-effort */ }
  }

  global.AssetCache = {
    url: function (path) { return urlMap[path] || path; },
    getCached: getCached,
    getBlobUrl: getBlobUrl,
    prefetch: prefetch,
    vocabImagePath: vocabImagePath,
    audioPath: audioPath,
    TD_SPRITES: TD_SPRITES,
    VS_SPRITES: VS_SPRITES,
    MUSIC: MUSIC,
    SFX: SFX,
    warmGames: warmGames
  };

  let gamesWarmed = false;
  function warmGames() {
    if (gamesWarmed) return;
    gamesWarmed = true;
    prefetch(TD_SPRITES, 'td-sprites');
    prefetch(VS_SPRITES, 'vs-sprites');
    prefetch(MUSIC, 'music');
    prefetch(SFX, 'sfx');
  }
  function start() {
    setInterval(prefetchCurrentPage, 2000);
  }
  if (document.readyState === 'complete') start();
  else global.addEventListener('load', start, { once: true });
})(window);
