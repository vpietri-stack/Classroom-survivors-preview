// ============================================================
// CENTRAL PHASER BOOT CONFIG
// Loaded FIRST (before vampire_survivors.js / uno.js / game.js) in index.html.
// Owns the global Phaser config, the running game instance, and the active-mode
// flag so every game registers its scene via registerScene() instead of poking
// globals scattered across game files.
// ============================================================

// --- PHASER CONFIG ---
const config = {
    width: window.innerWidth,
    height: window.innerHeight,
    parent: null, // dynamically assigned by the game's trigger function
    transparent: true,
    backgroundColor: '#2d5016',
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 },
            debug: false
        }
    },
    scene: [], // scenes register themselves via registerScene()
    scale: {},
    input: {
        activePointers: 3
    }
};

// --- PHASER STATE ---
// The running Phaser.Game instance (assigned lazily by the first trigger*() call).
let game;

// Which game mode is active: 'VS' | 'Uno' | 'Gomoku' | null (teaching content only)
let activeGameMode = null; // 'VampireSurvivors' or 'Gomoku' or 'Uno'

// --- SCENE REGISTRATION ---
// Uniform way for each game to register its Phaser scene class. Safe to call at
// script-load time (config is guaranteed to exist because boot.js loads first).
function registerScene(sceneClass) {
    if (typeof config === 'undefined') return;
    if (!Array.isArray(config.scene)) config.scene = [];
    config.scene.push(sceneClass);
}

// --- HiDPI (retina) RENDERING (Vampire Survivors only, for now) ---------------
// The shared Phaser canvas defaults to Scale.RESIZE, which sizes the backing
// buffer in CSS pixels and lets the browser upscale it -> blur on high-DPR
// phones. While VS is active we render at HiDPI via Scale.NONE with:
//   gameSize (backing buffer) = CSS x DPR   (capped at 2 for horde perf)
//   ScaleManager zoom         = 1 / DPR     (canvas DISPLAYS at CSS window size)
// Letting the ScaleManager own the display size (via its zoom) is critical:
// it keeps displayScale = DPR so POINTER INPUT maps correctly. An earlier
// version set canvas.style manually, which left displayScale stale at 1 and
// broke the joystick + corrupted the scale state the other games inherit.
// VS also multiplies its CAMERA zoom by DPR so the visible world is unchanged.
// enterHiDpi()/exitHiDpi() are called by the VS trigger/exit so every other
// game (Uno/TD on this same canvas) keeps the exact CSS-px RESIZE behavior.
function vsDpr() {
    return Math.min(2, Math.max(1, window.devicePixelRatio || 1));
}
let _hiDpiResizeHandler = null;
let _hiDpiEl = null; // sizing target: null = full window (VS), else an element (UNO container)
function _applyHiDpiSize() {
    if (!game || !game.scale) return;
    const dpr = vsDpr();
    const w = _hiDpiEl ? _hiDpiEl.clientWidth : window.innerWidth;
    const h = _hiDpiEl ? _hiDpiEl.clientHeight : window.innerHeight;
    if (w <= 0 || h <= 0) return;
    game.scale.setZoom(1 / dpr);            // display = backing / DPR = CSS px
    game.scale.resize(w * dpr, h * dpr);    // backing = CSS x DPR
    // DPR-1 PITFALL: setZoom(1) and resize(sameDims) are NO-OPS in Phaser, so
    // refresh() alone never rewrites the canvas inline style — a stale style
    // from the previous mode survives (seen on PC: UNO stretched to the VS
    // window size / VS invisible at 0px). Write the intended display size
    // explicitly — it equals what the ScaleManager computes (backing x zoom)
    // so displayScale stays consistent — then refresh() to sync canvasBounds.
    if (game.canvas) {
        game.canvas.style.width = w + 'px';
        game.canvas.style.height = h + 'px';
    }
    game.scale.refresh();                   // recompute displaySize + displayScale (input)
}
// enterHiDpi(el?) : HiDPI-render into `el` (or the full window when omitted).
// The single shared game canvas is used by VS (window) and UNO (its container).
function enterHiDpi(targetEl) {
    if (!game || !game.scale) return;
    _hiDpiEl = targetEl || null;
    // Scale.NONE: we drive the size; RESIZE would auto-shrink the backing back
    // to CSS px on every window/orientation change, undoing the HiDPI buffer.
    game.scale.scaleMode = Phaser.Scale.NONE;
    game.scale.parentIsWindow = false;
    if (_hiDpiEl) game.scale.parent = _hiDpiEl;
    _applyHiDpiSize();
    if (!_hiDpiResizeHandler) {
        _hiDpiResizeHandler = () => _applyHiDpiSize();
        window.addEventListener('resize', _hiDpiResizeHandler);
    }
}
function exitHiDpi() {
    if (_hiDpiResizeHandler) {
        window.removeEventListener('resize', _hiDpiResizeHandler);
        _hiDpiResizeHandler = null;
    }
    _hiDpiEl = null;
    if (!game || !game.scale) return;
    // Restore today's exact behavior for the other games sharing the canvas.
    // Clearing the inline width/height/margin is REQUIRED: the NONE+zoom mode
    // leaves an inline px style (e.g. 414x896) that RESIZE does NOT reset, so
    // without this the canvas keeps the VS window display size while its backing
    // shrinks to the next game's container -> stretched/offset canvas and
    // off-screen content (observed: invisible UNO cards after VS).
    game.scale.setZoom(1);
    game.scale.scaleMode = Phaser.Scale.RESIZE;
    game.scale.parentIsWindow = true;
    if (game.canvas) { game.canvas.style.width = ''; game.canvas.style.height = ''; game.canvas.style.margin = ''; }
    game.scale.resize(window.innerWidth, window.innerHeight);
    game.scale.refresh();
}

// Fetch the shared engine first, then register the scenes in their original order.
let phaserLoad;
let phaserScriptsLoaded = 0;
function ensurePhaserGames() {
    if (phaserLoad) return phaserLoad;
    phaserLoad = (async () => {
        const sources = document.getElementById('phaser-scripts').content.querySelectorAll('script');
        while (phaserScriptsLoaded < sources.length) {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = sources[phaserScriptsLoaded].getAttribute('src');
                script.onload = resolve;
                script.onerror = () => {
                    script.remove();
                    reject(new Error('Game script unavailable'));
                };
                document.head.appendChild(script);
            });
            if (phaserScriptsLoaded++ === 0) {
                config.type = Phaser.AUTO;
                config.scale.mode = Phaser.Scale.RESIZE;
                config.scale.autoCenter = Phaser.Scale.CENTER_BOTH;
            }
        }
        window.GameRuntime?.attachUno();
    })().catch(error => {
        phaserLoad = null;
        throw error;
    });
    return phaserLoad;
}

async function openPhaserGame(button, action) {
    const label = button.textContent;
    button.disabled = true;
    button.textContent = '正在加载游戏…';
    try {
        await ensurePhaserGames();
        if (button.getClientRects().length) window[action]();
        button.textContent = button.dataset.gameLabel || label;
    } catch (error) {
        console.warn(error);
        button.dataset.gameLabel ||= label;
        button.textContent = '游戏加载失败，点击重试';
    } finally {
        button.disabled = false;
    }
}

// Preserve the callable entry points for test mode and other direct callers.
for (const action of ['triggerUno', 'triggerVampireSurvivors', 'triggerTowerDefense']) {
    window[action] = (...args) => ensurePhaserGames().then(() => window[action](...args));
}
