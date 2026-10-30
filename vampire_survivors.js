// --- GAME DATA ---
const POWER_UPS = [
    { id: 'whip', name: "Jump Rope", icon: "🪢", type: "weapon", desc: "Wide front lash" },
    { id: 'ruler', name: "Ruler", icon: "📏", type: "weapon", desc: "Sword slash + electric arc" },
    { id: 'wand', name: "Paper Plane", icon: "✨", type: "weapon", desc: "Flies at nearest enemy" },
    { id: 'orb', name: "Eraser Orbit", icon: "🔮", type: "weapon", desc: "Spins around you" },
    { id: 'axe', name: "Magic Book", icon: "🪓", type: "weapon", desc: "Add one more book" },
    { id: 'cross', name: "Triangle Ruler", icon: "✝️", type: "weapon", desc: "Boomerang effect" },
    { id: 'water', name: "Water Balloon", icon: "💧", type: "weapon", desc: "Drops damaging puddle" },
    { id: 'knife', name: "Scissors", icon: "🔪", type: "weapon", desc: "Fires in facing direction" }
];

// School-item sprite for each weapon/power-up id (sliced from
// sprites/vs/item_sheet_raw.png by vs_slice_items.js). The emoji textures
// above stay as fallback if a PNG fails to load (offline/slow-CDN students).
const ITEM_SPRITES = {
    whip: 'jumprope',   // Skippy's jump-rope lash (was the old "ruler" icon)
    ruler: 'ruler',     // Class Monitor's ruler — sword slash + electric arc
    wand: 'plane',      // paper plane dart
    knife: 'scissors',  // spinning scissors
    orb: 'eraser',      // orbiting erasers
    water: 'balloon',   // water balloon -> puddle
    axe: 'book',        // tumbling book
    cross: 'triangle',  // set-square boomerang
    tornado: 'tornado', // paper tornado icon (in-game fire tornado stays)
    vortex: 'magnet',
    heart: 'milk'
};

// Per-weapon evolution milestones, mirrored in gameplay code (fire* +
// updateBullets + the bullet overlap handler). Shown on the level-up card
// so students can see WHAT the next level unlocks (whip has its own text).
const WEAPON_MILESTONES = {
    wand: { 2: 'Piercing Dart (Goes through 2!)', 3: 'Golden Dart', 5: 'Flaming Dart (Pierces 3!)', 8: 'Inferno Dart (Pierces 4!)' },
    knife: { 2: 'Splitting Scissors (Split on hit!)', 3: 'Whirling Blades', 4: 'Golden Shears', 5: 'Double Split!', 6: 'Red-Hot Blades', 8: 'Triple Split!' },
    axe: { 2: 'Knowledge Blast (Area hit!)', 3: 'Second Book', 4: 'Bigger Blast', 5: 'Third Book', 6: 'Bigger Blast', 7: 'Fourth Book', 8: 'Bigger Blast', 9: 'Bigger Books', 10: 'Bigger Blast', 11: 'Bigger Books', 12: 'Bigger Blast' },
    cross: { 2: 'Ricochet (Bounces to 3!)', 4: 'Glowing Edge', 5: 'Twin Boomerang (Both ways!)', 8: 'Super Ricochet (5 bounces!)' },
    water: { 2: 'Poison Splash (Lingers!)', 3: 'Bigger Balloons', 5: 'Double Splash (2 balloons!)', 8: 'Toxic Flood (Longer poison)' },
    orb: { 2: 'Frost Erasers (Slows enemies!)', 4: 'Rubber-Dust Sparkles', 6: 'Turbo Orbit', 8: 'Deep Freeze' },
    ruler: { 2: 'Electric Arc (Stuns enemies!)', 3: 'Wider Slash', 4: 'Longer Arc (+Stun)', 5: 'Faster Swings', 6: 'Bigger Slash', 7: 'Stronger Arc (+Stun)', 8: 'Faster Swings', 9: 'Bigger Slash', 10: 'Stronger Arc (+Stun)', 11: 'Faster Swings' }
};

// Playable heroes for the character-select screen. Each hero has a paper-doll
// puppet skin (part textures) and ONE exclusive starting weapon that only they
// can use / level up; the other 6 weapons are shared. weaponIcon is a static
// PNG under sprites/vs/ used by the HTML menu (not the in-game texture cache).
const VS_CHARACTERS = {
    monitor: {
        id: 'monitor', name: '班长 Class Monitor',
        parts: { body: 'p_body', arm: 'p_arm', footL: 'p_foot_l', footR: 'p_foot_r' },
        weapon: 'ruler', weaponName: 'Ruler', weaponIcon: 'item_ruler'
    },
    skippy: {
        id: 'skippy', name: 'Skippy',
        parts: { body: 'sk_body', arm: 'sk_arm', footL: 'sk_foot_l', footR: 'sk_foot_r' },
        weapon: 'whip', weaponName: 'Jump Rope', weaponIcon: 'item_jumprope'
    }
};

// --- MAIN SCENE ---
class MainScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MainScene' });
    }

    preload() {
        // Resolve every sprite through the asset cache (asset_cache.js):
        // instant blob: URL when prefetched/IndexedDB-cached (fast in CN,
        // survives WeChat cache eviction), plain path as fallback.
        // NOTE: test_asset_manifest.js keeps AssetCache.VS_SPRITES in sync with
        // the files on disk — add new sprites there too ('_raw' sheets excluded).
        const u = (p) => (window.AssetCache ? window.AssetCache.url(p) : p);
        // Paper-doll puppet parts for the chibi student hero (sliced from the
        // Nano Banana parts sheet by vs_slice_parts.js)
        this.load.image('p_body', u('sprites/vs/player_body.png'));
        this.load.image('p_arm', u('sprites/vs/player_arm.png'));
        this.load.image('p_foot_l', u('sprites/vs/player_foot_l.png'));
        this.load.image('p_foot_r', u('sprites/vs/player_foot_r.png'));
        // Skippy skin parts (sliced by vs_slice_skippy.js) — jump-rope arm
        this.load.image('sk_body', u('sprites/vs/skippy_body.png'));
        this.load.image('sk_arm', u('sprites/vs/skippy_arm.png'));
        this.load.image('sk_foot_l', u('sprites/vs/skippy_foot_l.png'));
        this.load.image('sk_foot_r', u('sprites/vs/skippy_foot_r.png'));
        // School-themed weapon/power-up art (sliced by vs_slice_items.js)
        Object.values(ITEM_SPRITES).forEach(n =>
            this.load.image('item_' + n, u('sprites/vs/item_' + n + '.png')));
        this.load.image('item_star', u('sprites/vs/item_star.png')); // XP drops
        // Ruler slash VFX: baked 12-frame sprite sheet (vs_make_fx_slash.js),
        // 4x3 grid of 512px cells — crescent + tail-first receding dissolve
        this.load.spritesheet('fx_slash', u('sprites/vs/fx_slash_sheet.png'), { frameWidth: 512, frameHeight: 512 });
        // Rat/bat enemy frames (Nano Banana concept art, sliced by
        // vs_slice_enemies.js from the magenta-background sheets)
        ['rat_walk', 'rat_hit', 'bat_up', 'bat_down', 'bat_hit'].forEach(n =>
            this.load.image('enemy_' + n, u('sprites/vs/enemy_' + n + '.png')));
        // Dropout zombie + bucket-zombie boss (both 6-frame sheets, sliced by
        // vs_slice_zombie_boss.js)
        ['zombie_walk_a', 'zombie_walk_b', 'zombie_windup', 'zombie_lunge', 'zombie_hit', 'zombie_dead',
            'boss_walk_a', 'boss_walk_b', 'boss_windup', 'boss_lunge', 'boss_hit', 'boss_dead',
            'bp_walk_a', 'bp_walk_b', 'bp_windup', 'bp_lunge', 'bp_hit', 'bp_dead'].forEach(n =>
                this.load.image('enemy_' + n, u('sprites/vs/enemy_' + n + '.png')));
    }

    // --- School-item sprite helpers ---
    // Item texture for a weapon/power-up id; emoji texture as fallback
    itemTex(id, fallback) {
        const n = ITEM_SPRITES[id];
        return (n && this.textures.exists('item_' + n)) ? 'item_' + n : fallback;
    }

    // Scale an image so its longest side displays at px pixels (works for
    // both the hi-res item PNGs and the small emoji fallback textures)
    setPx(img, px) {
        const src = img.texture.getSourceImage();
        img.setScale(px / Math.max(src.width, src.height, 1));
        return img;
    }

    // Legacy scale values assume the old ~29px emoji textures (scale 1 ≈ 29px
    // on screen). Multiply them by this so every existing setScale/tween
    // number keeps its on-screen size with the higher-res item art.
    unitScale(key, base = 29) {
        const src = this.textures.get(key).getSourceImage();
        return base / Math.max(src.width, src.height, 1);
    }

    // Evolution milestone tier (only meaningful at level >= 2):
    // 0 = L2-4 (first evolution), 1 = L5-7, 2 = L8+. Powers step up per tier.
    evoTier(level) { return level < 5 ? 0 : level < 8 ? 1 : 2; }

    // Nearest active enemy to (x,y) not already in the exclude list (ricochet)
    nearestEnemyExcluding(x, y, exclude) {
        let best = null, bd = 1e9;
        this.enemies.getChildren().forEach(e => {
            if (!e.active || (exclude && exclude.includes(e))) return;
            const d = Phaser.Math.Distance.Between(x, y, e.x, e.y);
            if (d < bd) { bd = d; best = e; }
        });
        return best;
    }

    // Scissors "Splitting" evolution: a scissor that strikes an enemy is
    // replaced by two child scissors fanning outward from its heading. Each
    // child inherits splitsLeft-1 so higher tiers keep splitting (capped).
    spawnKnifeSplit(parent, hitEnemy) {
        if (this.bullets.getChildren().length > 200) return; // perf guard
        const key = this.itemTex('knife', 'knife');
        const u = this.unitScale(key);
        const baseAng = Math.atan2(parent.body.velocity.y, parent.body.velocity.x);
        const scale = (parent.childScale || 1) * 0.85;
        [-1, 1].forEach(side => {
            const ang = baseAng + side * 0.44; // ~25° fan
            const k = this.add.image(parent.x, parent.y, key).setOrigin(0.5).setScale(1.5 * u * scale);
            k.rotation = ang;
            if (parent.tintTopLeft !== 0xffffff) k.setTint(parent.tintTopLeft);
            this.bullets.add(k);
            this.physics.add.existing(k);
            k.body.setCircle(12 * scale);
            const sp = 500;
            k.body.setVelocity(Math.cos(ang) * sp, Math.sin(ang) * sp);
            k.dmg = parent.dmg * 0.85; k.type = 'knife'; k.wlevel = parent.wlevel;
            k.splitsLeft = (parent.splitsLeft || 0) - 1;
            k.childScale = scale;
            k.hitList = [hitEnemy]; // don't instantly re-hit the enemy we split on
        });
    }

    create() {
        this.startTime = Date.now();
        this.frameTime = 0;
        this.gameState = 'PLAYING';
        this.gameTime = 0;
        this.accumulatedTime = 0;
        this.spawnTimer = 0;
        this.killCount = 0;
        this.nextSwarmTime = Phaser.Math.Between(30 * 60, 90 * 60);

        this.playerStats = {
            hp: 100, maxHp: 100,
            level: 1, xp: 0, nextLevelXp: 30,
            might: 1, speed: 1, cooldown: 1,
            weapons: []
        };
        this.knockbackVelocity = { x: 0, y: 0 };
        this.invulnTimer = 0;

        // --- Game-feel ("juice") state ---
        this.combo = 0;                 // kill combo counter
        this.comboExpire = 0;
        this.particlePool = [];         // shared pooled particles (perf)
        this.popPool = [];              // pooled damage-pop texts (perf)
        this.physics.world.timeScale = 1; // reset after death slow-mo restarts

        // Hop leap is a render-only y offset; remove it BEFORE physics reads
        // the sprite each frame (build is sprite-authoritative) so the body
        // never drifts. Registered once — the scene instance is reused on
        // restart, and it reads the current this.enemies each tick.
        if (!this._hopUnhookAdded) {
            this.events.on(Phaser.Scenes.Events.PRE_UPDATE, () => {
                const list = this.enemies ? this.enemies.getChildren() : [];
                for (const e of list) { if (e._hop) { e.y += e._hop; e._hop = 0; } }
            });
            this._hopUnhookAdded = true;
        }

        // --- Walking word-puzzle state ---
        this.puzzle = null;            // active ground puzzle (null = none)
        this.puzzleDone = new Set();   // in-session dedup of completed items
        this.puzzleWantSentence = Math.random() < 0.5; // alternates word/sentence

        // --- Boss / victory progression state (reset every run) ---
        this.wonGame = false;            // true once the final boss is beaten
        this.finalBossTriggered = false; // final bucket boss spawns once at 10min
        this.regularBossCount = 0;       // post-win: alternate backpack/bucket
        const vm = document.getElementById('vsVictoryMenu');
        if (vm) vm.classList.add('hidden');

        // --- Anti-flee arena state ---
        // MUST reset here: Phaser reuses the scene instance on restart, so a
        // stale arenaCenter from the previous run kept updateAntiFlee from
        // re-drawing the fence (its graphics died on shutdown) — invisible
        // fence on the second playthrough.
        this.arenaCenter = null;
        this.fenceGfx = null;

        // Background music (gapless loop via bgm.js); stops on scene shutdown
        if (window.BGM) BGM.start();
        this.events.once('shutdown', () => {
            if (window.BGM) BGM.stop();
            this.teardownPuzzle(false);
            if (this._puzzleDom) { this._puzzleDom.remove(); this._puzzleDom = null; }
        });

        this.physics.world.setBounds(-4000, -4000, 8000, 8000);

        this.buildLawnTexture();
        this.buildChalkDecalTextures();
        this.buildFacilityTextures();

        this.bg = this.add.tileSprite(this.scale.width / 2, this.scale.height / 2, this.scale.width, this.scale.height, 'lawn2').setOrigin(0.5);
        this.bg.setScrollFactor(0);
        this.bg.setDepth(-10); // world decals (-5) render above the lawn

        // Blob shadows layer: created right after bg so it renders under all
        // characters (creation order), redrawn each frame in updateJuice()
        this.shadowGfx = this.add.graphics();

        this.game.canvas.style.touchAction = 'none';
        document.body.style.touchAction = 'none';
        document.body.style.userSelect = 'none';
        document.body.style.webkitUserSelect = 'none';
        document.body.style.overflow = 'hidden';

        const preventDefault = (e) => {
            if (e.target === this.game.canvas) {
                e.preventDefault();
            }
        };
        window.addEventListener('touchstart', preventDefault, { passive: false });
        window.addEventListener('touchmove', preventDefault, { passive: false });
        window.addEventListener('touchend', preventDefault, { passive: false });
        window.addEventListener('touchcancel', preventDefault, { passive: false });

        this.scale.on('resize', this.handleResize, this);
        this.events.once('shutdown', () => {
            this.scale.off('resize', this.handleResize, this);
        });
        this.handleResize(this.scale.gameSize);

        this.input.addPointer(2);

        // Pre-generate emoji textures to prevent massive FPS drops
        const makeEmoji = (key, char, size, padTop = 0) => {
            if (!this.textures.exists(key)) {
                const t = this.add.text(0, 0, char, { fontSize: size + 'px', padding: { top: padTop } });
                const wh = Math.max(t.width, t.height, 1) * 1.2; // Add 20% margin
                const rt = this.make.renderTexture({ width: wh, height: wh, add: false });
                rt.draw(t, wh * 0.1, wh * 0.1); // Center slightly
                rt.saveTexture(key);
                t.destroy();
                rt.texture = null;
                rt.destroy();
            }
        };

        makeEmoji('player', '🧙‍♂️', 50, 10);
        makeEmoji('boss', '👹', 80, 20);
        makeEmoji('bat', '🦇', 25, 5);
        makeEmoji('bat_swarm', '🦇', 20, 0);
        makeEmoji('zombie', '🧟', 25, 5);
        makeEmoji('alien', '👾', 25, 5);
        makeEmoji('orb', '🔮', 24, 0); // Match cross size (24px)
        makeEmoji('axe', '🪓', 24, 0);
        makeEmoji('cross', '✝️', 24, 0);
        makeEmoji('knife', '🔪', 24, 0);
        makeEmoji('bottle', '🧪', 30, 0);
        makeEmoji('fire_large', '🔥', 40, 0);
        makeEmoji('fire_small', '🔥', 20, 0);

        const allPowerUps = [...POWER_UPS,
        { id: 'heart', icon: '❤️' },
        { id: 'vortex', icon: '🌀' },
        { id: 'tornado', icon: '🌪️' }
        ];
        allPowerUps.forEach(p => makeEmoji('pu_' + p.id, p.icon || p.emoji, 40, 0));

        this.enemies = this.physics.add.group();
        this.bullets = this.physics.add.group();
        this.fireWakes = this.physics.add.group();
        this.gems = this.physics.add.group();
        this.powerUps = this.add.group(); // display group (pickup via distance check, no physics body)
        this.tornados = this.physics.add.group();

        // --- PLAYER: paper-doll puppet (chibi student) with emoji fallback ---
        // The selected hero (character-select screen) picks the part skin +
        // the exclusive starting weapon. Defaults to the Class Monitor.
        const ch = VS_CHARACTERS[window.vsSelectedCharacter] || VS_CHARACTERS.monitor;
        this.character = ch;
        const CP = ch.parts;
        if (this.textures.exists(CP.body)) {
            // Parts were pre-shrunk offline to ~2x display size (vs_shrink_parts.js
            // / vs_slice_skippy.js) so the GPU only minifies ~2:1 instead of ~11:1
            // — much sharper on phones where WebGL can't mipmap these NPOT textures.
            const PS = 0.45; // part scale (textures are 0.4x the originals)
            const footBaseY = 30;
            const footL = this.add.image(-9, footBaseY, CP.footL).setScale(PS);
            const footR = this.add.image(9, footBaseY, CP.footR).setScale(PS);
            // Weapon arm pivots at its shoulder cap — mounted at the body's
            // shoulder line (was -20: sprouted from the head)
            const arm = this.add.image(16, -1, CP.arm).setOrigin(0.12, 0.18).setScale(PS);
            const body = this.add.image(0, -10, CP.body).setScale(PS);
            this.playerParts = { body, arm, footL, footR, footBaseY, armBaseAngle: 15, armSwinging: false };
            arm.setAngle(this.playerParts.armBaseAngle);
            this.player = this.add.container(0, 0, [footL, footR, arm, body]);
            this.player.setSize(44, 44);
        } else {
            this.playerParts = null;
            this.player = this.add.image(0, 0, 'player').setOrigin(0.5);
            this.player.setScale(1.5);
        }
        this.physics.add.existing(this.player);
        // Tight hitbox (was effectively 45px radius incl. transparent margin —
        // a big cause of "hit out of nowhere")
        if (this.playerParts) {
            this.player.body.setCircle(22);
        } else {
            this.player.body.setCircle(16);
            this.player.body.setOffset(
                (this.player.width - 16 * 2) / 2,
                (this.player.height - 16 * 2) / 2
            );
        }
        this.player.body.setCollideWorldBounds(false);

        this.cameras.main.startFollow(this.player);

        // Chalk playground doodles scattered across the world (schoolyard feel)
        this.bgDecals = new Map();
        this.updateBgDecals();

        // Soft ambient vignette (constant, subtle depth; separate from the
        // red low-HP warning vignette)
        if (!this.textures.exists('vs_ambient')) {
            const c = this.textures.createCanvas('vs_ambient', 256, 256);
            const cx2 = c.getContext();
            const grd = cx2.createRadialGradient(128, 128, 60, 128, 128, 132);
            grd.addColorStop(0, 'rgba(8,22,16,0)');
            grd.addColorStop(1, 'rgba(8,22,16,0.34)');
            cx2.fillStyle = grd;
            cx2.fillRect(0, 0, 256, 256);
            c.refresh();
        }
        this.ambient = this.add.image(this.scale.width / 2, this.scale.height / 2, 'vs_ambient')
            .setDisplaySize(this.scale.width, this.scale.height)
            .setScrollFactor(0).setDepth(85);

        this.cursors = this.input.keyboard.createCursorKeys();
        this.wasd = this.input.keyboard.addKeys({ w: 'W', a: 'A', s: 'S', d: 'D' });

        this.joystick = { active: false, x: 0, y: 0, originX: 0, originY: 0, angle: 0, force: 0, pointerId: null };

        this.input.on('pointerdown', (pointer) => {
            if (!this.joystick.active && pointer.y > this.scale.height * 0.5) {
                this.joystick.active = true;
                this.joystick.pointerId = pointer.id;
                this.joystick.originX = pointer.x;
                this.joystick.originY = pointer.y;
                this.joystick.x = pointer.x;
                this.joystick.y = pointer.y;
            }
        });

        this.input.on('pointermove', (pointer) => {
            if (this.joystick.active && pointer.id === this.joystick.pointerId) {
                const maxDist = 50;
                const dx = pointer.x - this.joystick.originX;
                const dy = pointer.y - this.joystick.originY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const angle = Math.atan2(dy, dx);
                const clampDist = Math.min(dist, maxDist);
                this.joystick.x = this.joystick.originX + Math.cos(angle) * clampDist;
                this.joystick.y = this.joystick.originY + Math.sin(angle) * clampDist;
                this.joystick.angle = angle;
                this.joystick.force = clampDist / maxDist;
            }
        });

        this.input.on('pointerup', (pointer) => {
            if (this.joystick.active && pointer.id === this.joystick.pointerId) {
                this.joystick.active = false;
                this.joystick.force = 0;
                this.joystick.pointerId = null;
            }
        });

        // Belt-and-braces joystick release: DOM overlays above the canvas
        // (puzzle tracker, buttons) can eat the touch events Phaser needs,
        // leaving the stick latched ON and the player frozen. Native capture
        // listener = when the LAST finger leaves the glass, the stick cannot
        // possibly still be held. (A per-frame check in update() heals the
        // remaining cases.)
        const onGlobalTouchEnd = (e) => {
            if (this.joystick.active && e.touches && e.touches.length === 0) {
                this.joystick.active = false;
                this.joystick.force = 0;
                this.joystick.pointerId = null;
            }
        };
        window.addEventListener('touchend', onGlobalTouchEnd, true);
        window.addEventListener('touchcancel', onGlobalTouchEnd, true);
        this.events.once('shutdown', () => {
            window.removeEventListener('touchend', onGlobalTouchEnd, true);
            window.removeEventListener('touchcancel', onGlobalTouchEnd, true);
        });
        this.joyGraphics = this.add.graphics().setScrollFactor(0);

        // Shared particle layer (perf: one graphics for ALL burst particles)
        this.particleGfx = this.add.graphics().setDepth(50);

        // Kill combo counter (top-center, screen-space). hudY compensates for
        // the DPR-inflated camera zoom so it stays at the same on-screen spot.
        this.comboText = this.add.text(this.hudX(this.cw() / 2), this.hudY(110), '', {
            fontSize: '30px', fontFamily: 'Fredoka', color: '#ffdd33',
            stroke: '#000000', strokeThickness: 5, fontStyle: 'bold'
        }).setOrigin(0.5).setScrollFactor(0).setDepth(100).setVisible(false);

        // Low-HP danger vignette (radial gradient texture, edges only)
        if (!this.textures.exists('vs_vignette')) {
            const cv = this.textures.createCanvas('vs_vignette', 256, 256);
            const cx = cv.getContext();
            const grd = cx.createRadialGradient(128, 128, 70, 128, 128, 128);
            grd.addColorStop(0, 'rgba(255,0,0,0)');
            grd.addColorStop(1, 'rgba(255,0,0,0.55)');
            cx.fillStyle = grd;
            cx.fillRect(0, 0, 256, 256);
            cv.refresh();
        }
        this.vignette = this.add.image(this.scale.width / 2, this.scale.height / 2, 'vs_vignette')
            .setDisplaySize(this.scale.width, this.scale.height)
            .setScrollFactor(0).setDepth(90).setAlpha(0);

        this.physics.add.overlap(this.bullets, this.enemies, (b, e) => {
            if (b.type === 'axe' || b.type === 'cross') {
                if (b.hitList && b.hitList.includes(e)) return;
                if (!b.hitList) b.hitList = [];
                b.hitList.push(e);
                this.damageEnemy(e, b.dmg, 200);
                if (b.type === 'axe') synthSmash();       // book: heavy smash
                else synthRicochet();                     // triangle: metallic ping
                // Book evolution (L2+): Knowledge Blast — AoE burst on EVERY
                // enemy the book hits (hitList still prevents re-hitting the
                // same enemy). Bigger blast at every even level from L4.
                if (b.type === 'axe' && b.wlevel >= 2) {
                    const aoeBonus = b.wlevel >= 4 ? Math.floor((b.wlevel - 4) / 2) + 1 : 0;
                    const rad = 70 + aoeBonus * 22;
                    const frac = Math.min(0.85, 0.5 + aoeBonus * 0.08);
                    // Visible golden shockwave ring so the blast reads clearly
                    const ring = this.add.graphics().setDepth(46);
                    ring.fillStyle(0xffe08a, 0.22); ring.fillCircle(0, 0, rad);
                    ring.lineStyle(5, 0xffd166, 0.95); ring.strokeCircle(0, 0, rad);
                    ring.setPosition(b.x, b.y).setScale(0.3);
                    this.tweens.add({ targets: ring, scale: 1, alpha: 0, duration: 380, ease: 'Quad.out', onComplete: () => ring.destroy() });
                    this.spawnBurstParticles(b.x, b.y, 0xffe08a, 12 + aoeBonus * 4, 4);
                    this.enemies.getChildren().forEach(o => {
                        if (o !== e && o.active && Phaser.Math.Distance.Between(b.x, b.y, o.x, o.y) < rad) {
                            this.damageEnemy(o, b.dmg * frac, 80);
                        }
                    });
                }
                // Triangle evolution (L2+): Ricochet — redirect toward the next
                // nearest enemy, up to bounces times (3 / 4 / 5 by tier)
                if (b.type === 'cross' && b.bounces > 0) {
                    const next = this.nearestEnemyExcluding(b.x, b.y, b.hitList);
                    if (next) {
                        const ang = Phaser.Math.Angle.Between(b.x, b.y, next.x, next.y);
                        b.body.setVelocity(Math.cos(ang) * 340, Math.sin(ang) * 340);
                        b.bounces--;
                        this.spawnBurstParticles(b.x, b.y, 0x66e0ff, 5, 3);
                    }
                }
            } else if (b.type === 'rulerarc') {
                // Ruler electric arc: pierces every enemy it passes, chip damage
                // + a brief FREEZE (electricity). Bosses immune to the freeze
                // (like knockback). Does NOT get consumed on hit.
                if (b.hitList && b.hitList.includes(e)) return;
                if (!b.hitList) b.hitList = [];
                b.hitList.push(e);
                this.damageEnemy(e, b.dmg, 0);
                if (!e.isBoss && b.stunFrames) {
                    // Swarm bats fly on a fixed velocity set at spawn — save it
                    // so the freeze doesn't leave them hanging forever
                    if (e.isSwarm && e.body) { e._preStunVx = e.body.velocity.x; e._preStunVy = e.body.velocity.y; }
                    e.stunTimer = Math.max(e.stunTimer || 0, b.stunFrames);
                    if (e.body) e.body.setVelocity(0, 0);
                    e._zapUntil = this.time.now + (b.stunFrames / 60) * 1000;
                }
                this.spawnBurstParticles(e.x, e.y, 0xfff27a, 6, 3);
                if (!playSfxSample('sfx/electric_arc_hit.mp3', 0.5, undefined, 55)) synthZap();
            } else if (b.type === 'wand' && b.pierce > 0) {
                // Plane evolution (L2+): Piercing Dart punches through enemies
                if (b.hitList && b.hitList.includes(e)) return;
                if (!b.hitList) b.hitList = [];
                b.hitList.push(e);
                b.pierce--;
                this.damageEnemy(e, b.dmg, 100);
                if (!playSfxSample('sfx/paper_plane_hit.mp3', 0.5, undefined, 70)) synthPlaneHit();
            } else if (b.type === 'knife') {
                // Scissors evolution (L2+): split into two on hit
                if (b.hitList && b.hitList.includes(e)) return;
                this.damageEnemy(e, b.dmg, 100);
                synthStab();                              // blade-into-flesh
                if (b.splitsLeft > 0) this.spawnKnifeSplit(b, e);
                b.destroy();
            } else {
                this.damageEnemy(e, b.dmg, 100);
                if (b.type === 'wand' && !playSfxSample('sfx/paper_plane_hit.mp3', 0.5, undefined, 70)) synthPlaneHit();
                b.destroy();
            }
        });
        this.physics.add.overlap(this.fireWakes, this.enemies, (f, e) => {
            const now = this.time.now;
            if (!e.lastFireWakeTime || now - e.lastFireWakeTime > 200) {
                e.lastFireWakeTime = now;
                this.damageEnemy(e, f.dmg, f.knockback !== undefined ? f.knockback : 10);
                // Jump Rope L2+ burning-crescent fireball hitting an enemy
                playSfxSample('sfx/jump_rope_fireball_hit.mp3', 0.2, undefined, 120);
            }
        }, null, this);
        this.physics.add.overlap(this.player, this.gems, (p, g) => {
            if (g.type === 'chest') {
                this.triggerTreasureEvent();
            } else {
                this.addXp(g.val);
                synthGem();
            }
            g.destroy();
        });
        this.physics.add.collider(this.enemies, this.enemies, null, (e1, e2) => !e1.isBat && !e2.isBat, this);
        this.physics.add.overlap(this.player, this.enemies, this.handlePlayerHit, null, this);
        this.physics.add.overlap(this.tornados, this.enemies, (t, e) => this.damageEnemy(e, 999), null, this);

        // Electric-arc projectile texture (yellow crescent bow opening toward
        // +x, so rotation = travel angle). Baked once, reused by every arc.
        if (!this.textures.exists('fx_arc')) {
            const S = 72, g = this.add.graphics();
            const cx = S / 2 - 10, cy = S / 2, r = 26, a0 = -1.15, a1 = 1.15;
            g.lineStyle(20, 0xfff27a, 0.30); g.beginPath(); g.arc(cx, cy, r, a0, a1, false); g.strokePath();
            g.lineStyle(11, 0xffe23a, 0.9); g.beginPath(); g.arc(cx, cy, r, a0, a1, false); g.strokePath();
            g.lineStyle(4, 0xffffff, 1); g.beginPath(); g.arc(cx, cy, r, a0, a1, false); g.strokePath();
            g.generateTexture('fx_arc', S, S); g.destroy();
        }

        this.applyReward({ id: this.character.weapon, type: 'weapon' });
        // Decode all VS sound recordings up front so the first use of each
        // already plays the real sample (procedural synth covers any gaps)
        if (typeof loadSfxSample === 'function') {
            ['sword-slash', 'sword-hit', 'jump_rope_fireball_hit', 'electric_arc_hit',
                'paper_plane_travelling', 'paper_plane_hit', 'book_travelling',
                'scissors_travelling', 'tornado', 'zombie_death', 'bat_death']
                .forEach(n => loadSfxSample('sfx/' + n + '.mp3'));
        }
        updateDOMHUD(this.playerStats, 0, 0);

        for (let i = 0; i < 40; i++) {
            this.spawnEnemy(Phaser.Math.Between(300, 1000));
        }

        // Onboarding: drop one power-up right next to the player so the very
        // first thing they do is a walking puzzle — teaches "go grab the shiny
        // box" (engage) instead of just running from monsters. A short delay
        // lets the scene settle first; ~120px = adjacent but needs one step.
        this.time.delayedCall(500, () => {
            if (this.gameState !== 'PLAYING' || this.puzzle) return;
            const a = Math.random() * Math.PI * 2;
            this.spawnPowerUp(this.player.x + Math.cos(a) * 120, this.player.y + Math.sin(a) * 120);
        });
    }

    update(time, delta) {
        if (this.gameState === 'GAMEOVER') {
            this.player.body.setVelocity(0, 0);
            this.updateJuice(); // keep particles/shadows alive during death slow-mo
            return;
        }
        if (this.gameState !== 'PLAYING') return;

        // Joystick watchdog: if Phaser's own bookkeeping says the owning
        // pointer is no longer down (release event swallowed by a DOM
        // overlay tap), free the stick so movement can never get stuck
        if (this.joystick.active) {
            const owner = this.input.manager.pointers.find(p => p && p.id === this.joystick.pointerId);
            if (!owner || !owner.isDown) {
                this.joystick.active = false;
                this.joystick.force = 0;
                this.joystick.pointerId = null;
            }
        }

        let dx = 0, dy = 0;
        const speed = 160 * this.playerStats.speed; // Doubled base speed (from 80 to 160)
        if (this.cursors.left.isDown || this.wasd.a.isDown) dx = -1;
        else if (this.cursors.right.isDown || this.wasd.d.isDown) dx = 1;
        if (this.cursors.up.isDown || this.wasd.w.isDown) dy = -1;
        else if (this.cursors.down.isDown || this.wasd.s.isDown) dy = 1;

        if (this.joystick.active) {
            dx = Math.cos(this.joystick.angle) * this.joystick.force;
            dy = Math.sin(this.joystick.angle) * this.joystick.force;
        } else if (dx !== 0 || dy !== 0) {
            const len = Math.sqrt(dx * dx + dy * dy);
            dx /= len; dy /= len;
        }

        this.knockbackVelocity.x *= 0.9;
        this.knockbackVelocity.y *= 0.9;
        if (Math.abs(this.knockbackVelocity.x) < 10) this.knockbackVelocity.x = 0;
        if (Math.abs(this.knockbackVelocity.y) < 10) this.knockbackVelocity.y = 0;

        this.player.body.setVelocity((dx * speed) + this.knockbackVelocity.x, (dy * speed) + this.knockbackVelocity.y);

        this.updateAntiFlee(dx, dy);

        if (this.invulnTimer > 0) {
            this.invulnTimer--;
            const isFlashing = this.invulnTimer % 10 < 5;
            this.player.alpha = isFlashing ? 0.6 : 1;
            this.tintPlayer(isFlashing ? 0xff0000 : null);
        } else {
            this.player.alpha = 1;
            this.tintPlayer(null);
        }
        const wobble = Math.sin(this.gameTime * 0.25) * 0.08;
        const baseS = this.playerParts ? 1 : 1.5;
        const moving = (dx !== 0 || dy !== 0);
        if (moving) {
            const facingX = dx < 0 ? -baseS : (dx > 0 ? baseS : (this.player.scaleX > 0 ? baseS : -baseS));
            this.player.setScale(facingX * (1 + wobble), baseS * (1 - wobble));
        } else {
            const idleWobble = Math.sin(this.gameTime * 0.08) * 0.04;
            const facingX = this.player.scaleX > 0 ? baseS : -baseS;
            this.player.setScale(facingX * (1 + idleWobble), baseS * (1 - idleWobble));
        }
        // Puppet life: feet shuffle while moving, ruler-arm sways at rest
        if (this.playerParts) {
            const pp = this.playerParts;
            if (moving) {
                const step = Math.sin(this.gameTime * 0.4);
                pp.footL.y = pp.footBaseY - Math.max(0, step) * 7;
                pp.footR.y = pp.footBaseY - Math.max(0, -step) * 7;
            } else {
                pp.footL.y = pp.footBaseY;
                pp.footR.y = pp.footBaseY;
            }
            if (!pp.armSwinging) pp.arm.angle = pp.armBaseAngle + Math.sin(this.gameTime * 0.1) * 6;
        }

        this.bg.tilePositionX = this.cameras.main.scrollX;
        this.bg.tilePositionY = this.cameras.main.scrollY;

        this.joyGraphics.clear();
        if (this.joystick.active) {
            this.joyGraphics.lineStyle(2, 0xffffff, 0.5);
            this.joyGraphics.strokeCircle(this.joystick.originX, this.joystick.originY, 50);
            this.joyGraphics.fillStyle(0xffffff, 0.5);
            this.joyGraphics.fillCircle(this.joystick.x, this.joystick.y, 20);
        }

        this.spawnTimer++;
        const difficulty = this.getDifficulty();
        // Spawn delay: slightly fewer enemies than before (they hit harder now)
        const spawnDelay = Math.max(3, 19 / difficulty);
        if (this.spawnTimer > spawnDelay) {
            this.spawnEnemy();
            this.spawnTimer = 0;
        }

        this.updateWeapons();
        this.updateBullets();
        this.updateGems();
        this.updateJuice();
        if (this.puzzle) this.updatePuzzle();
        // Instant, generous power-up pickup (same box + radius as puzzle letters)
        this.powerUps.getChildren().forEach(icon => {
            if (icon.collected) return;
            const r = (icon.hitR || 40) + 18;
            if (Phaser.Math.Distance.Between(this.player.x, this.player.y, icon.x, icon.y) < r) {
                this.handlePowerUpPickup(this.player, icon);
            }
        });
        this.gameTime++;
        this.accumulatedTime += delta;
        updateDOMHUD(this.playerStats, Math.floor(this.accumulatedTime / 1000), this.killCount);

        // Refresh chalk decals as the camera roams (cheap, twice a second)
        if (this.gameTime % 30 === 0) this.updateBgDecals();

        this.nextSwarmTime--;
        if (this.nextSwarmTime <= 0) {
            this.spawnBatSwarm();
            this.nextSwarmTime = Phaser.Math.Between(3000, 4200);
        }

        // Final boss: at 10 minutes of PLAYED time (accumulatedTime excludes
        // minigame/puzzle overlays) the mega bucket boss appears, once.
        if (!this.finalBossTriggered && this.accumulatedTime >= 600000) {
            this.finalBossTriggered = true;
            this.spawnBoss('bucket', { final: true });
        }

        if (this.activeTornados) {
            this.activeTornados = this.activeTornados.filter(t => t.active);
            this.activeTornados.forEach(t => {
                t.theta += 0.08;
                const r = t.a + t.b * t.theta;
                t.x = t.spawnX + r * Math.cos(t.theta);
                t.y = t.spawnY + r * Math.sin(t.theta);

                if (t.spriteImg && t.spriteImg.active) {
                    // Paper tornado: fast whirl + breathing pulse
                    t.spriteImg.x = t.x; t.spriteImg.y = t.y;
                    t.spriteImg.rotation += 0.28;
                    t.spriteImg.setScale(t.spriteBaseScale * (1 + 0.12 * Math.sin(this.gameTime * 0.3)));
                    if (t.backdrop && t.backdrop.active) { t.backdrop.x = t.x; t.backdrop.y = t.y; }

                    // Sword-tip wind (Zelda spin attack): the funnel edge is the
                    // "sword tip"; TWO tips on opposite sides each stream a long
                    // crisp wind trail that is flung OUTWARD as it fades — twin
                    // spiral arms of released wind chasing the spin
                    if (t.swirl && t.swirl.active) {
                        const sw = t.swirl; sw.clear();
                        const rx = 92, ry = 34;               // tip orbit = funnel edge (flattened = ground)
                        const cyOff = 40;                      // ring around the funnel base
                        const spin = this.gameTime * 0.14;     // tip sweep speed
                        const span = Math.PI * 1.1;            // ~200° trail behind each tip
                        const SEG = 26;
                        for (let arm = 0; arm < 2; arm++) {
                            const tipA = spin + arm * Math.PI;
                            // 2 parallel strokes per arm = layered wind lines
                            for (let line = 0; line < 2; line++) {
                                const rOff = line * 9;
                                let px = null, py = null;
                                for (let i = 0; i <= SEG; i++) {
                                    const s = i / SEG;              // 0 = at the tip, 1 = oldest wind
                                    const ang = tipA - s * span;    // trail behind the spin
                                    const flare = 1 + s * 0.55;     // flung outward as it ages
                                    const x = t.x + Math.cos(ang) * (rx + rOff) * flare;
                                    const y = t.y + Math.sin(ang) * (ry + rOff * 0.4) * flare + cyOff;
                                    if (px !== null) {
                                        const alpha = (1 - s) * (line === 0 ? 0.95 : 0.55);
                                        sw.lineStyle(1 + (1 - s) * 4, s < 0.25 ? 0xffffff : 0xcfc9f5, alpha);
                                        sw.lineBetween(px, py, x, y);
                                    }
                                    px = x; py = y;
                                }
                            }
                        }
                    }

                    // Vortex suction: enemies inside 190px get dragged HARD
                    // toward the funnel (stronger when closer) and pulled into
                    // the kill core; radius unchanged, force much stronger
                    this.enemies.getChildren().forEach(e => {
                        if (!e.active || !e.body) return;
                        const d = Phaser.Math.Distance.Between(t.x, t.y, e.x, e.y);
                        if (d < 190 && d > 1) {
                            const pull = 640 * (1 - d / 190);
                            e.body.velocity.x += ((t.x - e.x) / d) * pull;
                            e.body.velocity.y += ((t.y - e.y) / d) * pull;
                        }
                    });
                }

                if (t.fireballs) {
                    t.fireballs.forEach(fb => {
                        if (!fb.active) return;
                        fb.orbitAngle += fb.orbitSpeed;
                        fb.x = t.x + Math.cos(fb.orbitAngle) * fb.orbitRadius;
                        fb.y = t.y + Math.sin(fb.orbitAngle) * fb.orbitRadius;
                        fb.rotation += 0.1;

                        if (this.gameTime % 2 === 0) {
                            const trail = this.add.image(fb.x, fb.y, 'fire_small').setOrigin(0.5).setAlpha(0.5);
                            this.time.delayedCall(250, () => trail.destroy());
                        }
                    });
                }
            });
        }
    }

    spawnEnemy(distance = null) {
        if (this.killCount >= 300) {
            // Regular boss = BACKPACK zombie. Post-win, bosses alternate
            // backpack -> bucket -> backpack ... (bucket here is a regular boss,
            // NOT the mega final boss).
            let kind = 'backpack';
            if (this.wonGame) {
                kind = (this.regularBossCount % 2 === 0) ? 'backpack' : 'bucket';
                this.regularBossCount++;
            }
            this.spawnBoss(kind);
            this.killCount = 0;
            return;
        }
        // Perf cap: don't exceed ~140 live enemies (WeChat/older iPads)
        if (this.enemies.getChildren().length >= 140) return;
        const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);

        let dist = distance;
        if (dist === null) {
            const cam = this.cameras.main;
            dist = Math.sqrt(Math.pow(cam.width, 2) + Math.pow(cam.height, 2)) / 2 + 100;
        }

        this.createEnemyAt(this.player.x + Math.cos(angle) * dist, this.player.y + Math.sin(angle) * dist);
    }

    // Shared enemy factory (used by ambient spawns AND the anti-flee wall).
    // forceType: 0=rat, 1=bat, 2=zombie; omitted = rotate by game time.
    createEnemyAt(ex, ey, forceType) {
        if (this.enemies.getChildren().length >= 160) return null; // hard cap
        // Type: an even random MIX per spawn (rat/bat/zombie) so all three
        // appear from the start — the old time-gated rotation meant 30s of
        // pure rats before any bat/zombie showed up.
        const type = (forceType === undefined) ? Math.floor(Math.random() * 3) : forceType;
        const isBat = type === 1;
        // Rat/bat/zombie sprite frames when loaded; emoji textures as fallback
        const hasRat = this.textures.exists('enemy_rat_walk');
        const hasBat = this.textures.exists('enemy_bat_up');
        const hasZom = this.textures.exists('enemy_zombie_walk_a');
        const textureKey = isBat
            ? (hasBat ? 'enemy_bat_down' : 'bat')
            : type === 2
                ? (hasZom ? 'enemy_zombie_walk_a' : 'zombie')
                : (hasRat ? 'enemy_rat_walk' : 'alien');

        const difficulty = this.getDifficulty();
        const hp = 12 * (1 + (difficulty - 1) * 0.13);
        const speed = 16 * difficulty + (Math.random() * 5);

        const enemy = this.add.image(ex, ey, textureKey).setOrigin(0.5);
        this.physics.add.existing(enemy);
        // Body sized to the DRAWN frame — the old fixed 10px circle centred in
        // the frame left most of the sprite outside the hitbox (the dropout's
        // whole head: bullets visibly passed through it). Cover ~75-85% of the
        // art per type; the zombie's circle is also nudged UP to include the
        // head (feet matter less than the visible torso/head).
        const fw = enemy.width, fh = enemy.height;
        let bodyR;
        if (type === 2) bodyR = Math.round(fh * 0.42);            // tall dropout
        else if (isBat) bodyR = Math.round(Math.max(fw, fh) * 0.38); // spread wings
        else bodyR = Math.round(Math.max(fw, fh) * 0.36);         // long low rat
        enemy.body.setCircle(bodyR);
        enemy.body.setOffset(
            (fw - bodyR * 2) / 2,
            (fh - bodyR * 2) / 2 - (type === 2 ? fh * 0.04 : 0)
        );
        enemy.hp = hp; enemy.maxHp = hp; enemy.speed = speed; enemy.isBoss = false;
        enemy.isBat = isBat;
        enemy.enemyType = type; // 0=rat 1=bat 2=zombie (for death SFX)
        enemy.stunTimer = 0;
        // Animation frames: bat flaps up/down, zombie shambles A/B with attack
        // + death poses (6-frame dropout sheet), rat holds a walk frame; all
        // swap to a drawn hit pose on damage
        if (isBat && hasBat) {
            enemy.animLoop = ['enemy_bat_up', 'enemy_bat_down'];
            enemy.animRate = 16; // big bats flap slower (swarm bats keep the fast default 9)
            enemy.animHit = 'enemy_bat_hit';
            enemy.animPhase = Math.floor(Math.random() * 16); // desync flaps
        } else if (type === 2 && hasZom) {
            enemy.animLoop = ['enemy_zombie_walk_a', 'enemy_zombie_walk_b'];
            enemy.animRate = 14; // slow shamble (bats flap at 9)
            enemy.animWindup = 'enemy_zombie_windup';
            enemy.animLunge = 'enemy_zombie_lunge';
            enemy.animHit = 'enemy_zombie_hit';
            enemy.animDead = 'enemy_zombie_dead';
            enemy.animPhase = Math.floor(Math.random() * 28);
        } else if (!isBat && hasRat) {
            enemy.animWalk = 'enemy_rat_walk';
            enemy.animHit = 'enemy_rat_hit';
            enemy.hop = true; // rats bounce along instead of wobbling
            enemy.animPhase = Math.floor(Math.random() * 20);
        }
        this.enemies.add(enemy);
        return enemy;
    }

    // ---------------------------------------------------------
    // ANTI-FLEE: young kids tend to just run one direction forever and never
    // engage. Two nudges teach "turn around and fight":
    //  1) A soft playground FENCE (elastic push-back) caps how far they roam.
    //  2) If they flee a consistent heading too long, a WALL of enemies rises
    //     just off-screen ahead of them, blocking the escape so they must turn.
    // ---------------------------------------------------------
    updateAntiFlee(dx, dy) {
        if (!this.arenaCenter) {
            this.arenaCenter = { x: this.player.x, y: this.player.y };
            this.arenaRadius = 1800;
            this.fleeHeading = { x: 0, y: 0 };
            this.fleeTimer = 0;
            this.wallCooldown = 0;
            this.drawFence();
        }

        // --- Elastic playground fence ---
        const ac = this.arenaCenter;
        const ddx = this.player.x - ac.x, ddy = this.player.y - ac.y;
        const dist = Math.hypot(ddx, ddy) || 1;
        if (dist > this.arenaRadius) {
            const over = dist - this.arenaRadius;
            const nx = ddx / dist, ny = ddy / dist;
            const spring = Math.min(over * 6, 480); // gentle, grows with overshoot
            this.player.body.velocity.x -= nx * spring;
            this.player.body.velocity.y -= ny * spring;
            // subtle glow pulse on the fence so kids notice the boundary
            if (this.fenceGfx) this.fenceGfx.setAlpha(0.9);
        } else if (this.fenceGfx) {
            this.fenceGfx.setAlpha(0.45 + 0.25 * Math.max(0, (dist / this.arenaRadius) - 0.6));
        }

        // --- Sustained-flee detection -> enemy wall ---
        if (this.wallCooldown > 0) this.wallCooldown--;
        const mv = Math.hypot(dx, dy);
        if (mv > 0.35) {
            const hx = dx / mv, hy = dy / mv;
            const dot = hx * this.fleeHeading.x + hy * this.fleeHeading.y;
            this.fleeHeading.x = this.fleeHeading.x * 0.9 + hx * 0.1;
            this.fleeHeading.y = this.fleeHeading.y * 0.9 + hy * 0.1;
            const hl = Math.hypot(this.fleeHeading.x, this.fleeHeading.y) || 1;
            this.fleeHeading.x /= hl; this.fleeHeading.y /= hl;
            if (dot > 0.7) this.fleeTimer++; else this.fleeTimer = Math.max(0, this.fleeTimer - 3);
        } else {
            this.fleeTimer = Math.max(0, this.fleeTimer - 2);
        }
        if (this.fleeTimer > 150 && this.wallCooldown === 0) { // ~2.5s of steady fleeing
            this.spawnEnemyWall(this.fleeHeading.x, this.fleeHeading.y);
            this.fleeTimer = 0;
            this.wallCooldown = 360; // 6s before another wall can form
        }
    }

    // A wall of enemies rises just off-screen in the flee direction, spanning
    // the view so a straight-line runner is forced to stop and turn around
    spawnEnemyWall(dx, dy) {
        if (!dx && !dy) return;
        const cam = this.cameras.main;
        const half = Math.max(cam.worldView.width, cam.worldView.height) / 2;
        const ahead = half + 90; // just past the screen edge = appears naturally
        const cx = this.player.x + dx * ahead;
        const cy = this.player.y + dy * ahead;
        const perpx = -dy, perpy = dx;
        const span = Math.max(cam.worldView.width, cam.worldView.height) * 1.15;
        const count = 16;
        for (let i = 0; i < count; i++) {
            const off = (i / (count - 1) - 0.5) * span;
            const back = (Math.random() - 0.5) * 50; // slight depth = a thick wall
            this.createEnemyAt(cx + perpx * off + dx * back, cy + perpy * off + dy * back);
        }
        this.cameras.main.shake(120, 0.004); // gentle "here they come" cue
    }

    // Chalk-style boundary ring (schoolyard theme), drawn once in world space
    drawFence() {
        if (this.fenceGfx) this.fenceGfx.destroy();
        const g = this.add.graphics().setDepth(-6);
        const cx = this.arenaCenter.x, cy = this.arenaCenter.y, R = this.arenaRadius;
        const dashes = 90;
        for (let i = 0; i < dashes; i++) {
            const a0 = (i / dashes) * Math.PI * 2;
            const a1 = a0 + (Math.PI * 2 / dashes) * 0.55; // dash with a gap
            g.lineStyle(10, 0xffffff, 0.85);
            g.beginPath();
            g.arc(cx, cy, R, a0, a1);
            g.strokePath();
        }
        g.setAlpha(0.45);
        this.fenceGfx = g;
        this.events.once('shutdown', () => { if (this.fenceGfx) { this.fenceGfx.destroy(); this.fenceGfx = null; } });
    }

    // kind: 'backpack' (regular 300-kill boss) or 'bucket'. opts.final = the
    // one-time 10-minute mega boss (bigger, x3 HP, x2 damage, winning the game).
    spawnBoss(kind = 'backpack', opts = {}) {
        const final = !!opts.final;
        // Pick the frame set; fall back to the other sheet then the emoji
        const pfx = (kind === 'backpack' && this.textures.exists('enemy_bp_walk_a')) ? 'enemy_bp_'
            : (this.textures.exists('enemy_boss_walk_a')) ? 'enemy_boss_' : null;
        const boss = this.add.image(this.player.x, this.player.y - 600, pfx ? pfx + 'walk_a' : 'boss').setOrigin(0.5);
        this.physics.add.existing(boss);
        const bodyR = final ? 50 : 35;
        boss.body.setCircle(bodyR);
        boss.body.setOffset(
            (boss.width - bodyR * 2) / 2,
            (boss.height - bodyR * 2) / 2
        );
        const difficulty = this.getDifficulty();
        // Regular boss: 25x enemy HP. Final boss: x3 that.
        boss.hp = boss.maxHp = 12 * 25 * (1 + (difficulty - 1) * 0.13) * (final ? 3 : 1);
        boss.speed = 20 * difficulty;
        boss.isBoss = true;
        boss.stunTimer = 0;
        boss.dmgMult = final ? 2 : 1;      // final boss hits twice as hard
        if (final) { boss.isFinal = true; boss.texScale = 1.4; } // even bigger
        if (pfx) {
            boss.animLoop = [pfx + 'walk_a', pfx + 'walk_b'];
            boss.animRate = 20; // heavy slow stomp
            boss.animWindup = pfx + 'windup';
            boss.animLunge = pfx + 'lunge';
            boss.animHit = pfx + 'hit';
            boss.animDead = pfx + 'dead';
        }
        this.enemies.add(boss);

        // Boss Spawn visual juice (bigger for the final boss)
        this.cameras.main.shake(final ? 800 : 500, final ? 0.02 : 0.015);
        this.cameras.main.flash(300, 255, 0, 0, 0.4);

        const warningText = this.add.text(this.hudX(this.cw() / 2), this.hudY(this.ch() / 3),
            final ? '☠️ 最终BOSS！☠️' : '⚠️ BOSS INCOMING! ⚠️', {
            fontSize: final ? '52px' : '40px',
            fontFamily: 'Fredoka',
            color: final ? '#ffd700' : '#ff0055',
            stroke: '#000000',
            strokeThickness: 6,
            fontStyle: 'bold'
        }).setOrigin(0.5).setScrollFactor(0).setDepth(120);

        this.tweens.add({
            targets: warningText,
            scale: 1.4,
            alpha: { from: 1, to: 0 },
            duration: 2000,
            ease: 'Sine.easeOut',
            onComplete: () => warningText.destroy()
        });
    }

    spawnEnemyCircle() {
        const count = 80;
        const radius = 600;
        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            const ex = this.player.x + Math.cos(angle) * radius;
            const ey = this.player.y + Math.sin(angle) * radius;
            // Force zombie type so the ring uses the dropout zombie art +
            // full animation (was hard-coded to the plain 'zombie' emoji)
            this.createEnemyAt(ex, ey, 2);
        }
    }

    // ---------------------------------------------------------
    // BACKGROUND: polished procedural schoolyard lawn + chalk doodles
    // ---------------------------------------------------------
    buildLawnTexture() {
        if (this.textures.exists('lawn2')) return;
        const S = 768, STRIPE = 96;
        const gr = this.make.graphics({ x: 0, y: 0, add: false });
        // base green + soft vertical mowing stripes (classic lawn look)
        gr.fillStyle(0x477d3c, 1); gr.fillRect(0, 0, S, S);
        gr.fillStyle(0x4f8743, 1);
        for (let x = 0; x < S; x += STRIPE * 2) gr.fillRect(x, 0, STRIPE, S);
        // fine speckle for organic texture (kept low-contrast for readability)
        for (let i = 0; i < 260; i++) {
            gr.fillStyle(i % 2 ? 0x578f4a : 0x3f6d35, 0.5);
            gr.fillRect(12 + Math.random() * (S - 24), 12 + Math.random() * (S - 24), 2, 2);
        }
        // short grass blades
        gr.fillStyle(0x549047, 0.55);
        for (let i = 0; i < 90; i++) {
            gr.fillRect(12 + Math.random() * (S - 24), 12 + Math.random() * (S - 24), 1.5, 5);
        }
        // clover patches
        for (let i = 0; i < 14; i++) {
            const px = 20 + Math.random() * (S - 40), py = 20 + Math.random() * (S - 40);
            gr.fillStyle(0x3a6a31, 0.6);
            gr.fillCircle(px, py, 2.4); gr.fillCircle(px + 4, py + 2, 2.2); gr.fillCircle(px - 3, py + 3, 2.0);
        }
        // tiny daisies (white + a couple pink) — cute without being busy
        for (let i = 0; i < 11; i++) {
            const px = 20 + Math.random() * (S - 40), py = 20 + Math.random() * (S - 40);
            const col = i % 4 === 0 ? 0xffc9de : 0xf5f5ef;
            gr.fillStyle(col, 0.85);
            for (let a = 0; a < 5; a++) {
                gr.fillCircle(px + Math.cos(a * 1.256) * 3.2, py + Math.sin(a * 1.256) * 3.2, 1.9);
            }
            gr.fillStyle(0xffd94a, 1); gr.fillCircle(px, py, 1.7);
        }
        gr.generateTexture('lawn2', S, S);
        gr.destroy();
    }

    buildChalkDecalTextures() {
        if (this.textures.exists('chalk_0')) return;
        const mk = (key, w, h, draw) => {
            const g = this.make.graphics({ x: 0, y: 0, add: false });
            g.lineStyle(5, 0xffffff, 0.9);
            draw(g);
            g.generateTexture(key, w, h);
            g.destroy();
        };
        // 0: hopscotch
        mk('chalk_0', 130, 300, g => {
            g.strokeRoundedRect(35, 240, 60, 58, 8);
            g.strokeRoundedRect(35, 180, 60, 58, 8);
            g.strokeRoundedRect(4, 120, 60, 58, 8);
            g.strokeRoundedRect(66, 120, 60, 58, 8);
            g.strokeRoundedRect(35, 60, 60, 58, 8);
            g.strokeRoundedRect(35, 2, 60, 56, 8);
        });
        // 1: four-square court
        mk('chalk_1', 170, 170, g => {
            g.strokeRoundedRect(4, 4, 162, 162, 6);
            g.lineBetween(85, 4, 85, 166);
            g.lineBetween(4, 85, 166, 85);
        });
        // 2: star
        mk('chalk_2', 160, 160, g => {
            const pts = [];
            for (let i = 0; i < 10; i++) {
                const r = i % 2 === 0 ? 74 : 30;
                const a = -Math.PI / 2 + i * Math.PI / 5;
                pts.push({ x: 80 + Math.cos(a) * r, y: 80 + Math.sin(a) * r });
            }
            g.beginPath(); g.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
            g.closePath(); g.strokePath();
        });
        // 3: spiral
        mk('chalk_3', 150, 150, g => {
            g.beginPath();
            for (let a = 0; a < Math.PI * 5; a += 0.15) {
                const r = 6 + a * 4.2;
                const x = 75 + Math.cos(a) * r, y = 75 + Math.sin(a) * r;
                if (a === 0) g.moveTo(x, y); else g.lineTo(x, y);
            }
            g.strokePath();
        });
        // 4: smiley
        mk('chalk_4', 130, 130, g => {
            g.strokeCircle(65, 65, 55);
            g.fillStyle(0xffffff, 0.9);
            g.fillCircle(45, 50, 7); g.fillCircle(85, 50, 7);
            g.beginPath(); g.arc(65, 68, 28, 0.3, Math.PI - 0.3); g.strokePath();
        });
        // 5: heart
        mk('chalk_5', 130, 120, g => {
            g.beginPath();
            g.arc(43, 42, 25, Math.PI, 0);
            g.arc(87, 42, 25, Math.PI, 0);
            g.lineTo(65, 105);
            g.closePath(); g.strokePath();
        });
        // 6: "ABC" chalk letters (rendered from a text object)
        const t = this.make.text({ x: 0, y: 0, text: 'A B C', style: { fontSize: '52px', fontFamily: 'Fredoka, sans-serif', color: '#ffffff', fontStyle: 'bold' }, add: false });
        const rt = this.make.renderTexture({ width: Math.ceil(t.width) + 8, height: Math.ceil(t.height) + 8, add: false });
        rt.draw(t, 4, 4);
        rt.saveTexture('chalk_6');
        t.destroy(); rt.destroy();
    }

    // Big painted-on-ground school facilities (walk-on friendly, top-down)
    buildFacilityTextures() {
        if (this.textures.exists('fac_tennis')) return;
        let g;
        // Tennis court
        g = this.make.graphics({ x: 0, y: 0, add: false });
        g.fillStyle(0x2f6f4a, 1); g.fillRoundedRect(0, 0, 260, 400, 14);
        g.fillStyle(0x2f6fa8, 1); g.fillRect(28, 28, 204, 344);
        g.lineStyle(4, 0xffffff, 0.95);
        g.strokeRect(28, 28, 204, 344);
        g.lineBetween(28, 200, 232, 200);
        g.strokeRect(60, 92, 140, 216);
        g.lineBetween(130, 92, 130, 308);
        g.generateTexture('fac_tennis', 260, 400); g.destroy();
        // Basketball court
        g = this.make.graphics({ x: 0, y: 0, add: false });
        g.fillStyle(0xb5793a, 1); g.fillRoundedRect(0, 0, 300, 360, 14);
        g.lineStyle(4, 0xffffff, 0.95);
        g.strokeRect(14, 14, 272, 332);
        g.strokeCircle(150, 180, 42);
        g.lineBetween(14, 180, 286, 180);
        g.strokeRect(112, 14, 76, 96);
        g.strokeRect(112, 250, 76, 96);
        g.beginPath(); g.arc(150, 110, 42, 0, Math.PI); g.strokePath();
        g.beginPath(); g.arc(150, 250, 42, Math.PI, 0); g.strokePath();
        g.generateTexture('fac_basket', 300, 360); g.destroy();
        // Running track (oval, red lanes + green infield)
        g = this.make.graphics({ x: 0, y: 0, add: false });
        g.fillStyle(0xb5443a, 1); g.fillEllipse(260, 190, 500, 340);
        g.fillStyle(0x4f8743, 1); g.fillEllipse(260, 190, 356, 214);
        g.lineStyle(3, 0xffffff, 0.7);
        for (let r = 0; r < 4; r++) g.strokeEllipse(260, 190, 500 - r * 36, 340 - r * 24);
        g.generateTexture('fac_track', 520, 380); g.destroy();
        // Garden / flower bed
        g = this.make.graphics({ x: 0, y: 0, add: false });
        g.fillStyle(0x5a3d24, 1); g.fillRoundedRect(0, 0, 220, 150, 18);
        g.fillStyle(0x6b4a2a, 1); g.fillRoundedRect(8, 8, 204, 134, 14);
        const cols = [0xff6b6b, 0xffd93b, 0xff8ad0, 0xffffff];
        for (let i = 0; i < 20; i++) {
            const fx = 22 + Math.random() * 176, fy = 20 + Math.random() * 110;
            g.fillStyle(cols[i % 4], 0.95);
            for (let a = 0; a < 5; a++) g.fillCircle(fx + Math.cos(a * 1.256) * 6, fy + Math.sin(a * 1.256) * 6, 3.6);
            g.fillStyle(0xffd94a, 1); g.fillCircle(fx, fy, 3);
        }
        g.generateTexture('fac_garden', 220, 150); g.destroy();
    }

    // Deterministic background decals around the camera, culled when far.
    // Two layers: big painted facilities (depth -8) + small chalk doodles (-5).
    updateBgDecals() {
        const cam = this.cameras.main.worldView;
        const hash = (cx, cy, salt) => {
            const v = Math.sin(cx * 127.1 + cy * 311.7 + salt * 74.7) * 43758.5453;
            return v - Math.floor(v);
        };
        const place = (prefix, CELL, margin, decide) => {
            const x0 = Math.floor((cam.left - margin) / CELL), x1 = Math.floor((cam.right + margin) / CELL);
            const y0 = Math.floor((cam.top - margin) / CELL), y1 = Math.floor((cam.bottom + margin) / CELL);
            for (let cy = y0; cy <= y1; cy++) {
                for (let cx = x0; cx <= x1; cx++) {
                    const key = prefix + cx + ',' + cy;
                    if (this.bgDecals.has(key)) continue;
                    const wx = cx * CELL + CELL / 2, wy = cy * CELL + CELL / 2;
                    this.bgDecals.set(key, { img: decide(cx, cy, wx, wy), wx, wy });
                }
            }
        };
        // Facilities: big, rarer
        place('F', 1500, 760, (cx, cy, wx, wy) => {
            if (hash(cx, cy, 11) < 0.35) return null;
            const facs = ['fac_tennis', 'fac_basket', 'fac_track', 'fac_garden'];
            const type = facs[Math.floor(hash(cx, cy, 12) * facs.length)];
            const ox = (hash(cx, cy, 13) - 0.5) * 1500 * 0.4, oy = (hash(cx, cy, 14) - 0.5) * 1500 * 0.4;
            const img = this.add.image(wx + ox, wy + oy, type).setDepth(-8).setAlpha(0.82);
            img.setRotation((hash(cx, cy, 15) - 0.5) * 0.3);
            return img;
        });
        // Chalk doodles: small, common
        place('C', 720, 340, (cx, cy, wx, wy) => {
            if (hash(cx, cy, 1) < 0.5) return null;
            const type = Math.floor(hash(cx, cy, 2) * 7);
            const ox = (hash(cx, cy, 3) - 0.5) * 720 * 0.6, oy = (hash(cx, cy, 4) - 0.5) * 720 * 0.6;
            const img = this.add.image(wx + ox, wy + oy, 'chalk_' + type).setDepth(-5).setAlpha(0.4);
            img.setRotation((hash(cx, cy, 5) - 0.5) * 0.5);
            return img;
        });
        // Cull far cells (uses stored world position, works for both grids)
        this.bgDecals.forEach((v, key) => {
            const dx = v.wx - this.player.x, dy = v.wy - this.player.y;
            if (dx * dx + dy * dy > 3200 * 3200) {
                if (v.img) v.img.destroy();
                this.bgDecals.delete(key);
            }
        });
    }

    spawnBatSwarm() {
        const side = Phaser.Math.Between(0, 3);
        const difficulty = this.getDifficulty();
        const count = 20 + Math.floor(difficulty * 5);
        const playerSpeed = 160 * this.playerStats.speed;
        const swarmSpeed = playerSpeed * 3;
        // Bat swarm HP: half of regular enemy HP
        const hp = 6 * (1 + (difficulty - 1) * 0.13);

        for (let i = 0; i < count; i++) {
            this.time.delayedCall(i * 40, () => {
                const cam = this.cameras.main;
                const margin = 40;
                let startX, startY;

                if (side === 0) {
                    startX = cam.worldView.left - margin;
                    startY = cam.worldView.top + Math.random() * cam.worldView.height;
                } else if (side === 1) {
                    startX = cam.worldView.right + margin;
                    startY = cam.worldView.top + Math.random() * cam.worldView.height;
                } else if (side === 2) {
                    startX = cam.worldView.left + Math.random() * cam.worldView.width;
                    startY = cam.worldView.top - margin;
                } else {
                    startX = cam.worldView.left + Math.random() * cam.worldView.width;
                    startY = cam.worldView.bottom + margin;
                }

                const ox = (Math.random() - 0.5) * 60;
                const oy = (Math.random() - 0.5) * 60;
                const hasBat = this.textures.exists('enemy_bat_up');
                const bat = this.add.image(startX + ox, startY + oy, hasBat ? 'enemy_bat_down' : 'bat_swarm').setOrigin(0.5);
                if (hasBat) {
                    // Sprite art is ~46px vs the old 20px emoji — scale down so
                    // a 20+ bat swarm doesn't fill the screen
                    bat.texScale = 0.62;
                    bat.animLoop = ['enemy_bat_up', 'enemy_bat_down'];
                    bat.animHit = 'enemy_bat_hit';
                    bat.animPhase = Math.floor(Math.random() * 16);
                }
                this.physics.add.existing(bat);
                bat.body.setCircle(8);
                bat.body.setOffset(
                    (bat.width - 8 * 2) / 2,
                    (bat.height - 8 * 2) / 2
                );
                bat.hp = hp; bat.maxHp = hp; bat.speed = swarmSpeed;
                bat.isSwarm = true;
                bat.isBat = true;
                this.enemies.add(bat);

                const angle = Phaser.Math.Angle.Between(bat.x, bat.y, this.player.x, this.player.y);
                const finalAngle = angle + (Math.random() - 0.5) * 0.15;

                bat.body.setVelocity(
                    Math.cos(finalAngle) * swarmSpeed,
                    Math.sin(finalAngle) * swarmSpeed
                );

                this.time.addEvent({
                    delay: 5000,
                    callback: () => { if (bat.active) bat.destroy(); }
                });
            });
        }
    }

    getDifficulty() {
        // Use accumulatedTime (survival/HUD time) so difficulty does NOT scale
        // while the student is answering questions in a minigame overlay.
        const secondsSinceStart = this.accumulatedTime / 1000;

        if (secondsSinceStart <= 300) {
            // First 5 minutes: gentle linear growth from 1.0 to 2.0
            return 1 + (secondsSinceStart / 300);
        }
        // After 5 minutes: exponential growth starting from 2.0
        // Doubles every 120 seconds — allows stats like damage and spawn rate to scale up fast
        return 2 * Math.pow(2, (secondsSinceStart - 300) / 120);
    }

    updateWeapons() {
        this.enemies.getChildren().forEach(e => {
            const nowMs = this.time.now;
            // Poison DoT (Water Balloon evolution): keeps ticking after the pool
            if (e.poisonUntil && e.poisonUntil > nowMs && e.active) {
                if (!e.poisonNextTick || nowMs >= e.poisonNextTick) {
                    e.poisonNextTick = nowMs + 500;
                    this.spawnBurstParticles(e.x, e.y, 0x77dd44, 3, 2.5);
                    this.damageEnemy(e, e.poisonDmg);
                }
            }
            // Electric crackle while frozen by the ruler arc (visual only)
            if (e._zapUntil && e._zapUntil > nowMs && e.active) {
                if (this.gameTime % 6 === 0) this.spawnBurstParticles(e.x, e.y - 6, 0xfff27a, 2, 2);
            }
            // Chill (Frost Erasers evolution): slows movement + lengthens attacks
            const chilled = e.chillUntil && e.chillUntil > nowMs;
            const moveMult = chilled ? (1 - e.chillPow) : 1;
            const durMult = chilled ? 1 / (1 - e.chillPow) : 1;
            if (e.stunTimer > 0) {
                e.stunTimer--;
                // Note: knockback no longer cancels attacks — only death does.
                // (windup/lunge timers keep running through the stun)
                // Frozen swarm bats resume their original flight when it ends
                if (e.stunTimer === 0 && e.isSwarm && (e._preStunVx || e._preStunVy)) {
                    if (e.body) e.body.setVelocity(e._preStunVx, e._preStunVy);
                    e._preStunVx = e._preStunVy = 0;
                }
            } else if (!e.isSwarm) {
                const nowT = this.time.now;
                if (!e.attackState) e.attackState = 'chase';

                if (e.attackState === 'windup') {
                    // Telegraph: frozen in place, crouching (pose in wobble block)
                    e.body.setVelocity(0, 0);
                    if (nowT >= e.windupUntil) {
                        // Lock lunge direction at the player's position NOW — dodgeable
                        const ang = Phaser.Math.Angle.Between(e.x, e.y, this.player.x, this.player.y);
                        // Boss lunge must actually COVER its attack range (200px):
                        // at 420ms a 300px/s lunge only travels ~126px, so the
                        // boss "pounced" but never reached the player (looked like
                        // it attacked without lunging). 540px/s * 0.42s ≈ 227px.
                        const lungeSpeed = e.isBoss ? 540 : 340;
                        e.body.setVelocity(Math.cos(ang) * lungeSpeed * moveMult, Math.sin(ang) * lungeSpeed * moveMult);
                        e.attackState = 'lunge';
                        e.lungeUntil = nowT + (e.isBoss ? 420 : 300) * durMult;
                        e.clearTint();
                    }
                } else if (e.attackState === 'lunge') {
                    if (nowT >= e.lungeUntil) {
                        e.attackState = 'recover';
                        e.recoverUntil = nowT + 650 * durMult;
                        e.body.setVelocity(e.body.velocity.x * 0.15, e.body.velocity.y * 0.15);
                    }
                } else if (e.attackState === 'recover') {
                    if (nowT >= e.recoverUntil) e.attackState = 'chase';
                } else {
                    // CHASE: seek player; if close enough, start the attack telegraph
                    const distToPlayer = Phaser.Math.Distance.Between(e.x, e.y, this.player.x, this.player.y);
                    const attackRange = e.isBoss ? 200 : 55;
                    if (distToPlayer < attackRange) {
                        const difficulty = this.getDifficulty();
                        // Near-instant strike: short flash of warning tint, then pounce
                        const telegraphMs = Phaser.Math.Clamp(200 - difficulty * 6, 110, 200);
                        e.attackState = 'windup';
                        e.windupUntil = nowT + (e.isBoss ? telegraphMs + 100 : telegraphMs) * durMult;
                        e.body.setVelocity(0, 0);
                        e.setTint(0xdd6666); // "about to pounce" warning color
                    } else {
                        // Calculate direct vector towards the player
                        let tx = this.player.x - e.x;
                        let ty = this.player.y - e.y;
                        let tDist = Math.hypot(tx, ty);
                        let vx = 0;
                        let vy = 0;
                        if (tDist > 0) {
                            vx = (tx / tDist) * e.speed;
                            vy = (ty / tDist) * e.speed;
                        }

                        // Add separation repulsion force from neighboring enemies
                        let sepX = 0;
                        let sepY = 0;
                        let neighborsCount = 0;
                        const separationRadius = 35; // optimal radius to match enemy graphic boundaries
                        const children = this.enemies.getChildren();
                        const count = children.length;

                        for (let j = 0; j < count; j++) {
                            const other = children[j];
                            if (other === e || !other.active || other.isSwarm) continue;

                            // Quick bounding box check for high performance
                            const dx = e.x - other.x;
                            if (Math.abs(dx) < separationRadius) {
                                const dy = e.y - other.y;
                                if (Math.abs(dy) < separationRadius) {
                                    const dist = Math.hypot(dx, dy);
                                    if (dist > 0 && dist < separationRadius) {
                                        // Stronger repulsion force the closer they are
                                        const force = (separationRadius - dist) / separationRadius;
                                        sepX += (dx / dist) * force;
                                        sepY += (dy / dist) * force;
                                        neighborsCount++;
                                    }
                                }
                            }
                        }

                        if (neighborsCount > 0) {
                            sepX /= neighborsCount;
                            sepY /= neighborsCount;

                            // Blend player attraction and neighbor separation vectors
                            vx += sepX * e.speed * 1.5;
                            vy += sepY * e.speed * 1.5;

                            // Smooth speed control
                            const currentSpeed = Math.hypot(vx, vy);
                            const maxAllowedSpeed = e.speed * 1.3;
                            if (currentSpeed > maxAllowedSpeed) {
                                vx = (vx / currentSpeed) * maxAllowedSpeed;
                                vy = (vy / currentSpeed) * maxAllowedSpeed;
                            }
                        }

                        if (e.body) {
                            e.body.setVelocity(vx * moveMult, vy * moveMult);
                        }
                    }
                }
            }

            // Squash and stretch wobble + attack poses
            if (e.active && e.body) {
                // Sprite frame driver: hit pose overrides, then attack poses
                // (zombie windup/lunge), then the 2-frame loop (bat flap /
                // zombie walk A-B), then a static walk frame (rat). Emoji
                // enemies have no anim* keys and skip all of this.
                if (e.animHit && e.hitUntil && e.hitUntil > this.time.now) {
                    if (e.texture.key !== e.animHit) e.setTexture(e.animHit);
                } else if (e.animWindup && e.attackState === 'windup') {
                    if (e.texture.key !== e.animWindup) e.setTexture(e.animWindup);
                } else if (e.animLunge && e.attackState === 'lunge') {
                    if (e.texture.key !== e.animLunge) e.setTexture(e.animLunge);
                } else if (e.animLoop) {
                    const f = e.animLoop[Math.floor((this.gameTime + (e.animPhase || 0)) / (e.animRate || 9)) % 2];
                    if (e.texture.key !== f) e.setTexture(f);
                } else if (e.animWalk && e.texture.key !== e.animWalk) {
                    e.setTexture(e.animWalk);
                }
                const baseScale = (e.texScale || 1) * (e.isBoss ? 1.0 : (e.isSwarm ? 0.8 : 1.0));

                // Enemies with DRAWN frames (rat/bat/zombie/boss) skip the
                // squash-and-stretch wobble entirely: the frames already convey
                // motion, and the per-frame scaleX oscillation made the art look
                // blurry (rat) / distracting (zombie). Just face + optional hop.
                if (e.animLoop || e.animWalk) {
                    const facingX = (e.body.velocity.x < 0 ||
                        (Math.abs(e.body.velocity.x) < 1 && this.player.x < e.x)) ? -baseScale : baseScale;
                    // Rats HOP: a real vertical LEAP (translation), not a scale
                    // twitch. e.y is offset for render only; a PRE_UPDATE handler
                    // removes it before physics reads it (this Phaser build is
                    // sprite-authoritative, so an un-removed offset drifts the
                    // body). Tiny stretch at the top of the arc sells the leap.
                    let sy = baseScale;
                    if (e.hop && (e.body.velocity.x !== 0 || e.body.velocity.y !== 0)) {
                        const ph = this.gameTime * 0.15 + (e.animPhase || 0);
                        const lift = Math.abs(Math.sin(ph)) * 13;
                        e.y -= lift;
                        e._hop = lift;
                        sy = baseScale * (1 + (lift / 13) * 0.12);
                    }
                    e.setScale(facingX, sy);
                } else if (e.attackState === 'windup') {
                    // Crouch pose: wide + low, quivering, facing the player
                    const facingX = this.player.x < e.x ? -baseScale : baseScale;
                    const quiver = Math.sin(this.gameTime * 0.9) * 0.03;
                    e.setScale(facingX * (1.15 + quiver), baseScale * (0.78 - quiver));
                } else if (e.attackState === 'lunge') {
                    // Stretch along the pounce
                    const facingX = e.body.velocity.x < 0 ? -baseScale : baseScale;
                    e.setScale(facingX * 0.85, baseScale * 1.18);
                } else {
                    const isMoving = e.body.velocity.x !== 0 || e.body.velocity.y !== 0;
                    const wobbleSpeed = e.isBoss ? 0.08 : 0.2;
                    const wobbleAmp = e.isBoss ? 0.04 : 0.08;
                    const seed = e.x + e.y; // unique phase offset per enemy
                    const wobbleVal = Math.sin(this.gameTime * wobbleSpeed + seed) * wobbleAmp;
                    const facingX = e.body.velocity.x < 0 ? -baseScale : baseScale;

                    if (isMoving) {
                        e.setScale(facingX * (1 + wobbleVal), baseScale * (1 - wobbleVal));
                    } else {
                        e.setScale(facingX, baseScale);
                    }
                }
                // Chill visual: icy-blue tint while frozen (skip windup so the
                // red pounce warning stays readable); cleared when it wears off
                if (chilled) {
                    if (e.attackState !== 'windup') e.setTint(0x9fd8ff);
                    e._chillTinted = true;
                } else if (e._chillTinted) {
                    e.clearTint(); e._chillTinted = false;
                }
                // Opacity self-heal: outside the brief hit flash an active enemy
                // is always fully opaque (belt-and-braces against any stray tween
                // leaving a boss translucent).
                if (!e._hitFlash && e.alpha < 1) e.alpha = 1;
            }
        });

        this.playerStats.weapons.forEach(w => {
            w.timer++;
            if (w.type === 'orb') {
                if (!w.sprites) w.sprites = [];
                if (!w.hitCooldowns) w.hitCooldowns = new Map();
                if (w.sprites.length !== w.level) {
                    w.sprites.forEach(s => s.destroy()); w.sprites = [];
                    const orbKey = this.itemTex('orb', 'orb');
                    // Erasers stay a fixed size — already big enough (user call);
                    // leveling adds MORE erasers + faster orbit instead
                    for (let i = 0; i < w.level; i++) {
                        const orb = this.setPx(this.add.image(0, 0, orbKey).setOrigin(0.5), 44);
                        this.physics.add.existing(orb); w.sprites.push(orb);
                    }
                }
                // Orbit speeds up as the weapon levels; Turbo Orbit at L6+
                w.angle = (w.angle || 0) + 0.05 + Math.min(w.level, 8) * 0.005 + (w.level >= 6 ? 0.03 : 0);
                // Decrement all cooldowns and clean up destroyed enemies
                w.hitCooldowns.forEach((val, key) => {
                    if (!key.active) { w.hitCooldowns.delete(key); return; }
                    if (val > 0) w.hitCooldowns.set(key, val - 1);
                });
                w.sprites.forEach((s, i) => {
                    const theta = w.angle + (i * (Math.PI * 2 / w.level));
                    s.x = this.player.x + Math.cos(theta) * w.range;
                    s.y = this.player.y + Math.sin(theta) * w.range;
                    s.rotation += 0.12; // tumbling erasers
                    // Doppler pass-by 'bumblebee' as an eraser sweeps over the
                    // top of its orbit (rising-edge, throttled inside the synth)
                    const above = Math.sin(theta) < -0.85;
                    if (above && !s._wasAbove) { s._wasAbove = true; synthEraserPass(); }
                    if (!above) s._wasAbove = false;
                    // Frost Erasers (L2+): faint icy tint + cold sparkle trail
                    if (w.level >= 2) {
                        s.setTint(0xbfe9ff);
                        if (Math.random() < 0.05) this.spawnBurstParticles(s.x, s.y, 0xafe6ff, 2, 2);
                    }
                    // High-level polish: pink rubber-dust sparkle trail
                    if (w.level >= 4 && Math.random() < 0.06) {
                        this.spawnBurstParticles(s.x, s.y, 0xff9ecb, 2, 2);
                    }
                    this.enemies.getChildren().forEach(e => {
                        if (Phaser.Math.Distance.Between(s.x, s.y, e.x, e.y) < 30 && (!w.hitCooldowns.has(e) || w.hitCooldowns.get(e) <= 0)) {
                            this.damageEnemy(e, w.dmg * this.playerStats.might, 200);
                            w.hitCooldowns.set(e, 20); // 20-frame cooldown per enemy
                            synthSmash();              // heavy eraser bonk
                            // Frost Erasers (L2+): chill slows movement + attack;
                            // strength & duration step up at L5 / L8
                            if (w.level >= 2) {
                                const t = this.evoTier(w.level);
                                e.chillPow = [0.5, 0.68, 0.85][t];   // L2 = 50% slower, up to 85%
                                e.chillUntil = this.time.now + [1600, 2100, 2600][t];
                            }
                        }
                    });
                });
            }

            if (w.timer >= w.cooldown / this.playerStats.cooldown) {
                w.timer = 0;
                if (w.type === 'wand') this.fireWand(w);
                if (w.type === 'whip') this.fireWhip(w);
                if (w.type === 'ruler') this.fireRuler(w);
                if (w.type === 'axe') this.fireAxe(w);
                if (w.type === 'cross') this.fireCross(w);
                if (w.type === 'knife') this.fireKnife(w);
                if (w.type === 'water') this.fireSantaWater(w);
            }
        });
    }

    fireWand(w) {
        let nearest = null, minDist = 9999;
        this.enemies.getChildren().forEach(e => {
            const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, e.x, e.y);
            if (d < minDist) { minDist = d; nearest = e; }
        });
        if (nearest) {
            if (!playSfxSample('sfx/paper_plane_travelling.mp3', 0.45, undefined, 120)) synthSwoosh('plane');
            const key = this.itemTex('wand', null);
            const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, nearest.x, nearest.y);
            let b;
            if (key) {
                // Paper plane dart: keeps its heading, grows + heats up with level
                b = this.setPx(this.add.image(this.player.x, this.player.y, key),
                    30 + Math.min(w.level, 6) * 2);
                b.rotation = angle; // art noses right -> flight angle is direct
                if (w.level >= 5) b.setTint(0xffb066);      // scorching gold-orange
                else if (w.level >= 3) b.setTint(0xffe9a3); // golden dart
            } else {
                b = this.add.circle(this.player.x, this.player.y, 10.5, 0x00ffff); // 7 * 1.5
                b.setScale(1.5);
            }
            this.bullets.add(b);
            this.physics.add.existing(b);
            b.body.setVelocity(Math.cos(angle) * 300, Math.sin(angle) * 300);
            b.dmg = 12 * (1 + w.level * 0.2) * this.playerStats.might; b.type = 'wand'; b.life = 60;
            b.wlevel = w.level;
            // Piercing Dart evolution (L2+): punches through 2 / 3 / 4 enemies
            b.pierce = w.level >= 2 ? [2, 3, 4][this.evoTier(w.level)] : 0;
        }
    }

    fireWhip(w) {
        const sequence = ['front'];

        // Damage upgrades are at level 2, 5, 8, etc.
        const dmgUpgrades = Math.floor((w.level + 1) / 3);
        const damage = (15 + dmgUpgrades * 15) * this.playerStats.might;

        const range = 330; 
        const strikeDuration = 150;

        sequence.forEach((dir, index) => {
            this.time.delayedCall(index * strikeDuration, () => {
                this.performWhipStrike(dir, damage, range, strikeDuration, w.level);
            });
        });
    }

    // --- RULER (Class Monitor exclusive): sword slash + electric arc ---
    // Ladder: L1 base slash • L2 unlock arc • then a repeating 3-cycle:
    // L3/6/9 slash bigger (wider + slightly longer), L4/7/10 arc bigger +
    // travels further + longer stun, L5/8/11 faster cooldown (in applyReward).
    fireRuler(w) {
        // Slash damage mirrors the Jump Rope's curve so the two exclusive
        // starting weapons stay balanced; the arc is low chip damage whose
        // real job is the stun (user-confirmed "slash main, arc utility").
        const dmgUpgrades = Math.floor((w.level + 1) / 3);
        const slashDmg = (15 + dmgUpgrades * 15) * this.playerStats.might;
        const slashTier = w.level >= 3 ? Math.floor(w.level / 3) : 0;
        const arcTier = w.level >= 4 ? Math.floor((w.level - 1) / 3) : 0;

        const facing = this.player.scaleX > 0 ? 1 : -1;
        const baseAngle = facing === 1 ? 0 : Math.PI;
        // Reach starts at HALF the Jump Rope's 330 reach (=165) and grows per
        // slash tier. Angular half-width is FIXED at ±117° (matches the VFX
        // sheet spanning ~65% of a circle), so the linear width scales up WITH
        // the reach and the hitbox is exactly the arc the crescent fills.
        const SLASH_HALF = 2.04; // ±117° — matches the VFX span (65% circle)
        const len = 165 * (1 + slashTier * 0.18);

        this.swingRulerArm(160);
        this.drawSlashCrescent(baseAngle, len, facing);

        // Cone hit-check, GENEROUS: the cone is wider than the drawn comma and
        // the reach carries a +12% margin (the fat end + glow extend past the
        // calibrated forward reach) so anything the VFX touches really gets hit
        let hitCount = 0;
        this.enemies.getChildren().forEach(e => {
            if (!e.active) return;
            const dx = e.x - this.player.x, dy = e.y - this.player.y;
            if (Math.hypot(dx, dy) > len * 1.12) return;
            const da = Phaser.Math.Angle.Wrap(Math.atan2(dy, dx) - baseAngle);
            if (Math.abs(da) <= SLASH_HALF) { this.damageEnemy(e, slashDmg, 140); hitCount++; }
        });

        // Real recordings (user-provided): whiff vs connect. The procedural
        // synth covers the first swings until the MP3 buffers are decoded.
        const sample = hitCount > 0 ? 'sfx/sword-hit.mp3' : 'sfx/sword-slash.mp3';
        if (typeof playSfxSample !== 'function' || !playSfxSample(sample, 0.55)) synthSwordSlash();

        // Electric arc unlocks at L2, launched from the slash's outer edge so
        // a bigger slash (L3/6/9) pushes the arc's start further out to match
        if (w.level >= 2) this.spawnRulerArc(baseAngle, len, arcTier, slashDmg);
    }

    // The visible slash: a baked 12-frame SPRITE SHEET (fx_slash_sheet.png) —
    // full bright crescent then a tail-first receding dissolve (matches the
    // user's CyclicSlash GIF). Two layers (NORMAL keeps it readable on grass,
    // ADD gives the glow) play the anim in sync. Single-instance: any playing
    // slash is scrubbed first so overlapping fires never stack.
    drawSlashCrescent(baseAngle, len, facing) {
        if (this.textures.exists('fx_slash')) {
            if (!this.anims.exists('slashfx')) {
                this.anims.create({
                    key: 'slashfx',
                    frames: this.anims.generateFrameNumbers('fx_slash', { start: 0, end: 11 }),
                    frameRate: 30, repeat: 0
                });
            }
            if (this._slashImgs) {
                this._slashImgs.forEach(im => { this.tweens.killTweensOf(im); im.destroy(); });
            }
            const sc = len / 187; // frame forward reach ≈187px at scale 1
            const mk = (blend, alpha) => {
                const im = this.add.sprite(this.player.x, this.player.y, 'fx_slash').setDepth(46);
                im.setBlendMode(blend);
                im.setScale(sc).setAlpha(alpha);
                im.setFlipX(facing < 0);      // belly follows facing
                im.rotation = -0.16 * facing; // wound up high; chop nudge below
                im.play('slashfx');
                return im;
            };
            const imgs = [mk(Phaser.BlendModes.NORMAL, 0.9), mk(Phaser.BlendModes.ADD, 0.85)];
            this._slashImgs = imgs;
            this.tweens.add({ targets: imgs, rotation: 0.12 * facing, scale: sc * 1.06, duration: 200, ease: 'Cubic.out' });
            imgs[0].once('animationcomplete', () => {
                imgs.forEach(im => im.destroy());
                if (this._slashImgs === imgs) this._slashImgs = null;
            });
            return;
        }
        const half = 2.04;
        const centerAngle = baseAngle;
        const g = this.add.graphics().setDepth(46);
        const R = len * 0.74;
        const startA = centerAngle - half * facing; // top of the chop
        const endA = centerAngle + half * facing;   // bottom (arm ends low)
        const acw = facing === -1;                  // mirrored when facing left
        const prog = { v: 0 };
        this.tweens.add({
            targets: prog, v: 1, duration: 140, ease: 'Quad.out',
            onUpdate: () => {
                if (!g.active) return;
                g.clear();
                const cx = this.player.x, cy = this.player.y;
                const a = startA + (endA - startA) * prog.v;
                const fade = 1 - prog.v * 0.35;
                g.lineStyle(Math.max(10, len * 0.16), 0xcfeaff, 0.75 * fade);
                g.beginPath(); g.arc(cx, cy, R, startA, a, acw); g.strokePath();
                g.lineStyle(6, 0xffffff, 0.95 * fade);
                g.beginPath(); g.arc(cx, cy, R, startA, a, acw); g.strokePath();
                // bright leading tip that rides the sweep
                g.fillStyle(0xffffff, fade);
                g.fillCircle(cx + Math.cos(a) * R, cy + Math.sin(a) * R, 7);
            },
            onComplete: () => {
                this.tweens.add({ targets: g, alpha: 0, duration: 110, onComplete: () => g.destroy() });
            }
        });
    }

    // Yellow electric energy arc: travels straight ahead (facing direction),
    // pierces every enemy, chip damage + brief freeze (handled in the bullet
    // overlap). Travel distance ≈ the jump rope's reach, further per arc tier.
    spawnRulerArc(baseAngle, startDist, arcTier, slashDmg) {
        const travel = 330 * (1 + arcTier * 0.22);
        const speed = 440;
        const sx = this.player.x + Math.cos(baseAngle) * startDist * 0.8;
        const sy = this.player.y + Math.sin(baseAngle) * startDist * 0.8;
        const b = this.add.image(sx, sy, 'fx_arc').setDepth(45);
        // WAY wider arc: starting visible width ≈ 0.6× the starting slash's
        // span (was a small 52px crescent), still growing per arc tier
        this.setPx(b, 190 + arcTier * 40);
        b.rotation = baseAngle;
        this.bullets.add(b);
        this.physics.add.existing(b);
        b.body.setVelocity(Math.cos(baseAngle) * speed, Math.sin(baseAngle) * speed);
        b.type = 'rulerarc';
        b.dmg = slashDmg * 0.35;          // chip — the stun is the point
        b.hitList = [];
        b.life = Math.round((travel / speed) * 60);
        b.stunFrames = 24 + arcTier * 9;  // ~0.4s base, +0.15s per arc tier
        // Live electricity: a graphics layer riding the arc, redrawn every
        // frame with fresh jagged bolts (see updateBullets) — the random
        // re-jitter is what makes it read as crackling lightning
        b.elecGfx = this.add.graphics().setDepth(46);
        b.elecGfx.setBlendMode(Phaser.BlendModes.ADD);
        b.once('destroy', () => { if (b.elecGfx) { b.elecGfx.destroy(); b.elecGfx = null; } });
        synthArcHum();
    }

    performWhipStrike(direction, damage, range, duration, whipLevel = 1) {
        synthShoot('whip');
        this.swingRulerArm(duration);
        const whip = this.add.graphics();
        const cpx = this.player.x;
        const cpy = this.player.y;

        const facing = this.player.scaleX > 0 ? 1 : -1;
        let strikeAngle = facing === 1 ? 0 : Math.PI;

        const hitEnemies = new Set();
        const progress = { value: 0 };
        
        let hasShakedCrack = false;
        let hasShakedHit = false;
        let finalPoints = [];

        this.tweens.add({
            targets: progress,
            value: 1,
            duration: duration,
            ease: 'Quad.easeOut',
            onUpdate: () => {
                if (!whip.active) return;
                whip.clear();

                const currentCpx = this.player.x;
                const currentCpy = this.player.y;
                
                // Segment points of the curving, arching whip using a pure cubic Bezier curve
                const numSegments = 16;
                const points = [];

                const angle = strikeAngle;
                const dx = Math.cos(angle);
                const dy = Math.sin(angle);
                const px_perp = -Math.sin(angle);
                const py_perp = Math.cos(angle);

                const currentRange = range * (0.25 + 0.75 * progress.value);
                
                // The arch is deep in the middle of the swing and straightens at full extension
                const archOffset = 65 * (1.1 - progress.value) * facing;

                const p0 = { x: currentCpx, y: currentCpy };
                const p3 = { x: currentCpx + dx * currentRange, y: currentCpy + dy * currentRange };

                // Control points placed to form a beautiful, single-direction convex crescent arch
                const p1 = {
                    x: p0.x + dx * currentRange * 0.33 + px_perp * archOffset * 0.7,
                    y: p0.y + dy * currentRange * 0.33 + py_perp * archOffset * 0.7
                };
                const p2 = {
                    x: p0.x + dx * currentRange * 0.66 + px_perp * archOffset * 1.1,
                    y: p0.y + dy * currentRange * 0.66 + py_perp * archOffset * 1.1
                };

                for (let i = 0; i <= numSegments; i++) {
                    const t = i / numSegments;
                    
                    // Cubic Bezier interpolation (mathematically perfect, single-arc curve with no zig-zags)
                    const mt = 1 - t;
                    const mt2 = mt * mt;
                    const mt3 = mt2 * mt;
                    const t2 = t * t;
                    const t3 = t2 * t;

                    const sx = mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x;
                    const sy = mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y;
                    
                    points.push({ x: sx, y: sy, t: t });
                }
                finalPoints = points;

                const isFire = whipLevel >= 2;
                const widthUpgrades = Math.floor((whipLevel - 1) / 3);
                const hitTolerance = 45 + widthUpgrades * 18;

                // 0. Powerful shockwave underlay for visual wind displacement pressure
                const underlayWidth = 24 + widthUpgrades * 12;
                const underlayColor = 0xddffff;
                const underlayAlpha = 0.28;
                whip.lineStyle(underlayWidth, underlayColor, underlayAlpha * (1 - progress.value));
                whip.beginPath();
                whip.moveTo(points[0].x, points[0].y);
                for (let i = 1; i < points.length; i++) {
                    whip.lineTo(points[i].x, points[i].y);
                }
                whip.strokePath();

                // 1. Draw leather shadow outline
                const shadowWidth = 10 + widthUpgrades * 4;
                const shadowColor = 0x221104;
                whip.lineStyle(shadowWidth, shadowColor, 0.55 * (1 - progress.value * 0.3));
                whip.beginPath();
                whip.moveTo(points[0].x, points[0].y);
                for (let i = 1; i < points.length; i++) {
                    whip.lineTo(points[i].x, points[i].y);
                }
                whip.strokePath();

                // 2. Draw whip body
                const bodyWidth = 4 + widthUpgrades * 2;
                const bodyColor = 0x6e350d;
                whip.lineStyle(bodyWidth, bodyColor, 0.95 * (1 - progress.value * 0.3));
                whip.beginPath();
                whip.moveTo(points[0].x, points[0].y);
                for (let i = 1; i < points.length; i++) {
                    whip.lineTo(points[i].x, points[i].y);
                }
                whip.strokePath();

                // 3. Draw whip segment beads (gives classic 2D pixel-art segmented look)
                points.forEach(p => {
                    const baseSize = 8.5 + widthUpgrades * 3;
                    const size = baseSize * (1 - p.t * 0.5); // tapers from handle to tip
                    const alpha = (p.t > 0.8) ? 1.0 : 0.85;
                    const color = (p.t > 0.85) ? 0xffffff : (p.t > 0.55 ? 0xd4a373 : 0x8b5a2b);
                    whip.fillStyle(color, alpha * (1 - progress.value * 0.35));
                    whip.fillCircle(p.x, p.y, size);
                });

                // 4. Draw retro "CRACK!" starburst at the tip when fully extended
                if (progress.value > 0.75) {
                    const tip = points[points.length - 1];
                    
                    if (!hasShakedCrack) {
                        this.cameras.main.shake(70, 0.005);
                        hasShakedCrack = true;
                    }

                    // Starburst backdrop glow
                    const starColor = 0xffeb3b;
                    whip.fillStyle(starColor, 0.85 * (1 - progress.value));
                    whip.fillCircle(tip.x, tip.y, 16);
                    whip.fillStyle(0xffffff, 1.0 * (1 - progress.value));
                    whip.fillCircle(tip.x, tip.y, 10);

                    // Crosshair crack lines radiating outwards
                    whip.lineStyle(3, 0xffffff, 0.95 * (1 - progress.value));
                    const spikeLen = 18;
                    whip.lineBetween(tip.x - spikeLen, tip.y, tip.x + spikeLen, tip.y);
                    whip.lineBetween(tip.x, tip.y - spikeLen, tip.x, tip.y + spikeLen);
                    
                    // Slanted spike accents
                    whip.lineStyle(2, starColor, 0.75 * (1 - progress.value));
                    whip.lineBetween(tip.x - spikeLen * 0.7, tip.y - spikeLen * 0.7, tip.x + spikeLen * 0.7, tip.y + spikeLen * 0.7);
                    whip.lineBetween(tip.x - spikeLen * 0.7, tip.y + spikeLen * 0.7, tip.x + spikeLen * 0.7, tip.y - spikeLen * 0.7);

                    // Chance to spawn crack particles on tip snap
                    if (Math.random() < 0.3) {
                        this.spawnBurstParticles(tip.x, tip.y, starColor, 4, 3);
                    }
                }

                // 5. Accurate segment-by-segment proximity hitbox detection
                this.enemies.getChildren().forEach(e => {
                    if (hitEnemies.has(e) || !e.active) return;

                    // Iterate over segment points to check for localized collision
                    for (let i = 1; i < points.length; i++) {
                        const p = points[i];
                        const dist = Phaser.Math.Distance.Between(e.x, e.y, p.x, p.y);
                        
                        // Generous hit tolerance to make it feel super satisfying and responsive
                        if (dist < hitTolerance) {
                            this.damageEnemy(e, damage, 300);
                            hitEnemies.add(e);

                            // Extra electric whip snap impact spark burst right at collision coordinate
                            const sparkColor = isFire ? 0xff5500 : 0xffeb3b;
                            this.spawnBurstParticles(p.x, p.y, sparkColor, 8, 3.5);
                            this.spawnBurstParticles(p.x, p.y, 0xffffff, 5, 2.0);

                            if (!hasShakedHit) {
                                this.cameras.main.shake(90, 0.006);
                                hasShakedHit = true;
                            }
                            break; // Stop checking segments for this enemy since they are hit
                        }
                    }
                });
            },
            onComplete: () => {
                const isFire = whipLevel >= 2;
                if (isFire) {
                    const widthUpgrades = Math.floor((whipLevel - 1) / 3);
                    const currentCpx = this.player.x;
                    const currentCpy = this.player.y;
                    
                    // Create a beautiful, sweeping asymmetric "comma" wave (curves down, hooks inward/backward at the head)
                    const numArcPoints = 32;
                    const arcPoints = [];
                    
                    // Starts slightly in front of the player, extends to the full whip range in the facing direction
                    const startX = currentCpx + 15 * facing;
                    const endX = currentCpx + range * facing;
                    
                    // In Phaser, Y is positive downwards. The whip always arches downwards (a smile curve under the player),
                    // so we make the fire path arch downward to perfectly trace and match the whip's sweep!
                    const verticalBulge = 45 + widthUpgrades * 10; 
                    
                    for (let i = 0; i <= numArcPoints; i++) {
                        const t = i / numArcPoints;
                        
                        // Sweeps forward to peak range at t ~ 0.91, then hooks slightly back/inward
                        const x_scale = (1.5 * t - 0.6 * t * t * t) / 0.914;
                        const ax = startX + (endX - startX) * x_scale;
                        
                        // Gentle smile curve initially, sweeping down into a sharp downward hook at the head
                        const y_scale = 0.35 * Math.sin(t * Math.PI) + 0.8 * Math.pow(t, 2.2);
                        const ay = currentCpy + verticalBulge * y_scale;
                        
                        arcPoints.push({ x: ax, y: ay, t: t });
                    }

                    // Helper function to draw a gorgeous, tapered crescent polygon in Phaser
                    const drawCrescent = (graphics, points, baseThickness, color, alpha) => {
                        if (points.length < 3) return;
                        graphics.fillStyle(color, alpha);
                        graphics.beginPath();
                        
                        const outerPoints = [];
                        const innerPoints = [];
                        
                        for (let i = 0; i < points.length; i++) {
                            const p = points[i];
                            const t = p.t;
                            
                            let dx, dy;
                            if (i === 0) {
                                dx = points[1].x - p.x;
                                dy = points[1].y - p.y;
                            } else if (i === points.length - 1) {
                                dx = p.x - points[i-1].x;
                                dy = p.y - points[i-1].y;
                            } else {
                                dx = points[i+1].x - points[i-1].x;
                                dy = points[i+1].y - points[i-1].y;
                            }
                            
                            const len = Math.sqrt(dx * dx + dy * dy);
                            const nx = len > 0 ? -dy / len : 0;
                            const ny = len > 0 ? dx / len : 0;
                            
                            // Beautiful asymmetrical comma-shaped thickness (thin tail near player, thick sweeping head at outer edge)
                            // Pushed power to 4.0 so the crescent has a long thin neck and massive fiery head before hooking back
                            const thickness = baseThickness * Math.sin(Math.pow(t, 4.0) * Math.PI);
                            
                            outerPoints.push({ x: p.x + nx * thickness, y: p.y + ny * thickness });
                            innerPoints.push({ x: p.x - nx * thickness, y: p.y - ny * thickness });
                        }
                        
                        // Draw outer boundary forward
                        graphics.moveTo(outerPoints[0].x, outerPoints[0].y);
                        for (let i = 1; i < outerPoints.length; i++) {
                            graphics.lineTo(outerPoints[i].x, outerPoints[i].y);
                        }
                        // Draw inner boundary backward to close the shape
                        for (let i = innerPoints.length - 1; i >= 0; i--) {
                            graphics.lineTo(innerPoints[i].x, innerPoints[i].y);
                        }
                        
                        graphics.closePath();
                        graphics.fillPath();
                    };

                    const burningPath = this.add.graphics();
                    const totalDuration = 1800;
                    
                    const flameColors = [0xff2200, 0xff5500, 0xff9c00, 0xffea00];
                    const sparkColors = [0xffea00, 0xffbb00, 0xffffff];
                    const smokeColors = [0x222222, 0x3d3d3d, 0x5a5a5a];

                    // Add lightweight, invisible physics triggers along this perfect arc to handle damage detection
                    // We instantiate them immediately so they can track the expanding shockwave front dynamically
                    const hitBodies = [];
                    const step = Math.max(1, Math.floor(numArcPoints / 7));
                    for (let i = 1; i < numArcPoints - 1; i += step) {
                        const p = arcPoints[i];
                        if (p) {
                            const triggerSize = 25 + widthUpgrades * 6; // generous size for explosive feel
                            const trigger = this.add.circle(p.x, p.y, triggerSize, 0x000000, 0); // fully invisible trigger
                            this.fireWakes.add(trigger);
                            this.physics.add.existing(trigger);
                            trigger.body.setCircle(triggerSize);
                            trigger.dmg = Math.ceil(damage * 0.10); // 10% of initial whip strike
                            trigger.knockback = 10; // small knockback effect so it affects enemies without launching them
                            hitBodies.push(trigger);
                        }
                    }

                    // --- INITIAL EXPLOSION / DENSE FIRE BURST ---
                    // Spawn highly visible, gorgeous burning particle effects along the entire arc to ignite it!
                    arcPoints.forEach((p, index) => {
                        // Skip the absolute tips a tiny bit for a nice tapered fire effect
                        if (index < 2 || index > numArcPoints - 2) return;
                        
                        // 1. Blazing rising flame circles
                        if (Math.random() < 0.85) {
                            const flameColor = flameColors[Phaser.Math.Between(0, flameColors.length - 1)];
                            const flameSize = Phaser.Math.Between(7, 13);
                            const flame = this.add.circle(p.x + Phaser.Math.Between(-4, 4), p.y + Phaser.Math.Between(-4, 4), flameSize, flameColor, 0.9);
                            
                            this.tweens.add({
                                targets: flame,
                                y: flame.y - Phaser.Math.Between(30, 60),
                                x: flame.x + Phaser.Math.Between(-12, 12),
                                scale: { from: 1.3, to: 0.1 },
                                alpha: { from: 0.9, to: 0 },
                                duration: Phaser.Math.Between(800, 1200),
                                ease: 'Quad.easeOut',
                                onComplete: () => flame.destroy()
                             });
                        }
                        
                        // 2. High-speed rising hot spark embers
                        if (Math.random() < 0.65) {
                            const sparkColor = sparkColors[Phaser.Math.Between(0, sparkColors.length - 1)];
                            const sparkSize = Phaser.Math.Between(2.2, 4.0);
                            const spark = this.add.circle(p.x, p.y, sparkSize, sparkColor, 1.0);
                            
                            this.tweens.add({
                                targets: spark,
                                x: spark.x + Phaser.Math.Between(-20, 20),
                                y: spark.y - Phaser.Math.Between(50, 85),
                                alpha: 0,
                                scale: 0.1,
                                duration: Phaser.Math.Between(700, 1200),
                                ease: 'Sine.easeOut',
                                onComplete: () => spark.destroy()
                            });
                        }

                        // 3. Puffy dark smoke clouds rising
                        if (Math.random() < 0.45) {
                            const smokeColor = smokeColors[Phaser.Math.Between(0, smokeColors.length - 1)];
                            const smokeSize = Phaser.Math.Between(9, 16);
                            const smoke = this.add.circle(p.x + Phaser.Math.Between(-8, 8), p.y + Phaser.Math.Between(-8, 8), smokeSize, smokeColor, 0.35);
                            
                            this.tweens.add({
                                targets: smoke,
                                y: smoke.y - Phaser.Math.Between(45, 75),
                                x: smoke.x + Phaser.Math.Between(-18, 18),
                                scale: { from: 1.0, to: 2.8 },
                                alpha: { from: 0.35, to: 0 },
                                duration: Phaser.Math.Between(1200, 1700),
                                ease: 'Cubic.easeOut',
                                onComplete: () => smoke.destroy()
                            });
                        }
                    });

                    // We run a dynamic simulation where the fire path expands and travels outwards like a real pressure wave!
                    this.tweens.add({
                        targets: { val: 1 },
                        val: 0,
                        duration: totalDuration,
                        ease: 'Quad.easeIn',
                        onUpdate: (tween, target) => {
                            if (!burningPath || !burningPath.active) return;
                            burningPath.clear();
                            
                            const alpha = target.val;
                            const t_elapsed = 1 - alpha;
                            const flicker = 0.80 + Math.random() * 0.20;

                            // Calculate dynamic expanding arc points
                            const rangeFactor = 1.0 + t_elapsed * 0.45; // grows 45% longer
                            const bulgeFactor = 1.0 + t_elapsed * 0.75; // grows 75% deeper
                            const shiftX = t_elapsed * 90 * facing; // travels forward
                            const shiftY = t_elapsed * 55; // travels downward in sweeping direction
                            
                            const d_startX = currentCpx + 15 * facing + shiftX;
                            const d_endX = currentCpx + range * facing * rangeFactor + shiftX;
                            const d_verticalBulge = verticalBulge * bulgeFactor;
                            
                            const dynamicPoints = [];
                            for (let i = 0; i <= numArcPoints; i++) {
                                const t = i / numArcPoints;
                                const x_scale = (1.5 * t - 0.6 * t * t * t) / 0.914;
                                const ax = d_startX + (d_endX - d_startX) * x_scale;
                                
                                const y_scale = 0.35 * Math.sin(t * Math.PI) + 0.8 * Math.pow(t, 2.2);
                                const ay = currentCpy + d_verticalBulge * y_scale + shiftY;
                                
                                dynamicPoints.push({ x: ax, y: ay, t: t });
                            }

                            // Update invisible physics trigger positions to follow the expanding shockwave front!
                            let triggerIdx = 0;
                            for (let i = 1; i < numArcPoints - 1; i += step) {
                                const p = dynamicPoints[i];
                                const trigger = hitBodies[triggerIdx];
                                if (trigger && trigger.active && p) {
                                    const currentSize = (25 + widthUpgrades * 6) * (1.0 + t_elapsed * 1.2); // expands up to 2.2x size
                                    trigger.setPosition(p.x, p.y);
                                    trigger.setRadius(currentSize);
                                    if (trigger.body) {
                                        trigger.body.setCircle(currentSize);
                                        trigger.body.updateFromGameObject();
                                    }
                                }
                                triggerIdx++;
                            }

                            // Shockwave inflates and broadens as it diffuses in the air
                            const thicknessScale = 1.0 + t_elapsed * 1.5;
                            
                            // 1. Draw a smoky, charred grass crack underlay (very thick)
                            drawCrescent(burningPath, dynamicPoints, (14.0 + widthUpgrades * 3.5) * thicknessScale, 0x110800, 0.75 * alpha);
                            
                            // 2. Draw a gorgeous outer crimson/red flame crescent
                            drawCrescent(burningPath, dynamicPoints, (9.0 + widthUpgrades * 2.5) * thicknessScale, 0xb30000, 0.9 * alpha * flicker);
                            
                            // 3. Draw a vibrant inner burning orange crescent
                            drawCrescent(burningPath, dynamicPoints, (5.0 + widthUpgrades * 1.5) * thicknessScale, 0xff5500, 1.0 * alpha * flicker);
                            
                            // 4. Draw a razor-thin golden-white core crescent
                            drawCrescent(burningPath, dynamicPoints, (1.6 + widthUpgrades * 0.5) * thicknessScale, 0xffea00, 1.0 * alpha * flicker);

                            // --- CONTINUOUS ACTIVE PARTICLE GENERATION ---
                            // Particles blast outward from the expanding shockwave front in the direction of the wave's expansion!
                            for (let k = 0; k < 2; k++) {
                                if (Math.random() < 0.45) {
                                    const p = dynamicPoints[Phaser.Math.Between(2, dynamicPoints.length - 3)];
                                    if (p) {
                                        const flameColor = flameColors[Phaser.Math.Between(0, flameColors.length - 1)];
                                        const flameSize = Phaser.Math.Between(5, 10) * alpha;
                                        const flame = this.add.circle(p.x, p.y, flameSize, flameColor, 0.8 * alpha);
                                        
                                        const blastX = (Phaser.Math.Between(40, 100) * facing) + Phaser.Math.Between(-15, 15);
                                        const blastY = Phaser.Math.Between(30, 90) + Phaser.Math.Between(-15, 15);
                                        
                                        this.tweens.add({
                                            targets: flame,
                                            x: flame.x + blastX * (1.2 - alpha),
                                            y: flame.y + blastY * (1.2 - alpha),
                                            scale: { from: 1.1, to: 0.1 },
                                            alpha: 0,
                                            duration: Phaser.Math.Between(500, 850),
                                            ease: 'Quad.easeOut',
                                            onComplete: () => flame.destroy()
                                        });
                                    }
                                }

                                if (Math.random() < 0.35) {
                                    const p = dynamicPoints[Phaser.Math.Between(2, dynamicPoints.length - 3)];
                                    if (p) {
                                        const sparkColor = sparkColors[Phaser.Math.Between(0, sparkColors.length - 1)];
                                        const sparkSize = Phaser.Math.Between(1.8, 3.2);
                                        const spark = this.add.circle(p.x, p.y, sparkSize, sparkColor, 0.95 * alpha);
                                        
                                        const blastX = (Phaser.Math.Between(50, 120) * facing) + Phaser.Math.Between(-20, 20);
                                        const blastY = Phaser.Math.Between(40, 110) + Phaser.Math.Between(-20, 20);
                                        
                                        this.tweens.add({
                                            targets: spark,
                                            x: spark.x + blastX * (1.2 - alpha),
                                            y: spark.y + blastY * (1.2 - alpha),
                                            alpha: 0,
                                            scale: 0.1,
                                            duration: Phaser.Math.Between(450, 800),
                                            ease: 'Sine.easeOut',
                                            onComplete: () => spark.destroy()
                                        });
                                    }
                                }
                            }
                        },
                        onComplete: () => {
                            if (burningPath) burningPath.destroy();
                        }
                    });

                    // Destroy triggers after totalDuration so they deal damage while the wave is active, expanding, and fading
                    this.time.delayedCall(totalDuration, () => {
                        hitBodies.forEach(b => {
                            if (b && b.active) b.destroy();
                        });
                    });
                }
                whip.destroy();
            }
        });
    }

    fireAxe(w) {
        if (!playSfxSample('sfx/book_travelling.mp3', 0.3, undefined, 140)) synthPageFlutter();
        // Book count: 1,1,2,2,3,3,4(cap) at L1,L2,L3,L4,L5,L6,L7+
        const count = Math.min(4, Math.floor((w.level + 1) / 2));
        const key = this.itemTex('axe', 'axe');
        // Legacy scale numbers below assume ~29px textures; u adapts them
        const u = this.unitScale(key);
        // Slight size increase only at odd levels from L9 (L9/L11/L13...)
        const sizeBonus = w.level >= 9 ? Math.floor((w.level - 9) / 2) + 1 : 0;
        const BOOK = 0.875 * 1.3 * (1 + 0.08 * sizeBonus); // 1.3x bigger base + late-game growth
        for (let i = 0; i < count; i++) {
            const spread = (i - (count - 1) / 2) * 70; // fan the landing spots
            const axe = this.add.image(this.player.x, this.player.y, key).setOrigin(0.5).setScale(0.5 * u * BOOK);
            if (w.level >= 2) axe.setTint(0xffe08a); // Golden Edition + trail (first evolution, L2)
            this.bullets.add(axe);
            this.physics.add.existing(axe);
            axe.body.setCircle(15 * BOOK); // hitbox halved, scales only with size bonus
            // "Up and forward" arc: launch high AND forward (same height as
            // before, travels forward more); gravity brings it back down
            axe.body.setVelocity(this.player.scaleX * 260 + spread, -640);
            axe.body.gravity.y = 900;
            axe.dmg = 26 * this.playerStats.might; axe.type = 'axe';
            axe.wlevel = w.level;

            // Squash & stretch heave throw
            this.tweens.add({
                targets: axe,
                scaleX: 1.8 * u * BOOK,
                scaleY: 1.3 * u * BOOK,
                duration: 200,
                ease: 'Back.easeOut',
                onComplete: () => {
                    if (axe.active) {
                        axe.setScale(1.5 * u * BOOK);
                    }
                }
            });
        }
    }

    fireCross(w) {
        synthSwoosh('cross');
        const key = this.itemTex('cross', 'cross');
        const u = this.unitScale(key);
        const grow = 1 + Math.min(w.level, 6) * 0.07; // wider boomerang sweep
        // Twin Boomerang evolution (L5+): one triangle each way
        const dirs = w.level >= 5 ? [1, -1] : [1];
        dirs.forEach(dir => {
            const cross = this.add.image(this.player.x, this.player.y, key).setOrigin(0.5).setScale(0.5 * u);
            if (w.level >= 4) cross.setTint(0xaaf5ff); // glowing edge
            this.bullets.add(cross);
            this.physics.add.existing(cross);
            cross.body.setCircle(15 * grow); // hitbox grows with the art
            cross.body.setVelocity(this.player.scaleX * 300 * dir, 0);
            cross.dmg = 6 * this.playerStats.might; cross.type = 'cross';
            cross.wlevel = w.level;
            // Ricochet evolution (L2+): bounces to 3 / 4 / 5 nearest enemies
            // instead of returning; L1 stays a classic boomerang
            cross.bounces = w.level >= 2 ? [3, 4, 5][this.evoTier(w.level)] : 0;
            cross.returnTimer = cross.bounces > 0 ? 99999 : 40;

            // Bouncy expanding pop-out
            this.tweens.add({
                targets: cross,
                scale: 1.5 * u * grow,
                duration: 250,
                ease: 'Bounce.easeOut'
            });
        });
    }

    fireKnife(w) {
        // Recording has a rubbish tail — only the first 2s is usable
        if (!playSfxSample('sfx/scissors_travelling.mp3', 0.18, 2, 60)) synthSwoosh('scissors');
        const count = w.level;
        const spreadAngle = 10 * (Math.PI / 180);
        const key = this.itemTex('knife', 'knife');
        const u = this.unitScale(key);
        const grow = 1 + Math.min(w.level, 6) * 0.06; // bigger shears

        for (let i = 0; i < count; i++) {
            const offset = (i - (count - 1) / 2) * spreadAngle;
            const knife = this.add.image(this.player.x, this.player.y, key).setOrigin(0.5).setScale(0.4 * u);
            if (w.level >= 6) knife.setTint(0xffb199);      // red-hot blades
            else if (w.level >= 4) knife.setTint(0xffe9a3); // golden shears
            this.bullets.add(knife);
            this.physics.add.existing(knife);
            knife.body.setCircle(12 * grow); // hitbox grows with the art

            const baseAngle = this.player.scaleX > 0 ? 0 : Math.PI;
            const finalAngle = baseAngle + offset;

            knife.rotation = finalAngle;
            const speed = 500;
            knife.body.setVelocity(Math.cos(finalAngle) * speed, Math.sin(finalAngle) * speed);
            knife.dmg = 8 * this.playerStats.might; knife.type = 'knife';
            knife.wlevel = w.level;
            // Splitting Scissors evolution (L2+): split depth 1 / 2 / 3 by tier
            knife.splitsLeft = w.level >= 2 ? [1, 2, 3][this.evoTier(w.level)] : 0;
            knife.childScale = 1;

            // Elastic thrust scaling
            this.tweens.add({
                targets: knife,
                scaleX: 2.3 * u,
                scaleY: 0.9 * u,
                duration: 120,
                ease: 'Quad.easeOut',
                yoyo: true,
                onComplete: () => {
                    if (knife.active) {
                        knife.setScale(1.5 * u * grow);
                    }
                }
            });
        }
    }

    fireSantaWater(w) {
        // Double Splash evolution (L5+): two balloons per volley
        const throwOne = () => {
        const angle = Math.random() * Math.PI * 2;
        const dist = Phaser.Math.Between(100, 300);
        const tx = this.player.x + Math.cos(angle) * dist;
        const ty = this.player.y + Math.sin(angle) * dist;

        const bottleKey = this.itemTex('water', 'bottle');
        const bottle = this.setPx(
            this.add.image(tx, ty - 500, bottleKey).setOrigin(0.5),
            34 + Math.min(w.level, 6) * 3); // bigger balloons at higher level
        synthBombFall(); // descending whistle as it drops from the sky

        this.tweens.add({
            targets: bottle,
            y: ty,
            rotation: 10,
            duration: 600,
            ease: 'Quad.easeIn',
            onComplete: () => {
                bottle.destroy();
                synthSplash(); // wet splat on impact
                // Balloon burst: water splash on impact, harder at higher level
                this.spawnBurstParticles(tx, ty, 0x66aaff, 8 + Math.min(w.level, 6) * 2, 4);

                const size = 90 * (1 + w.level * 0.2); // 60 * 1.5
                const dmg = ((8 + w.level * 3) / 3) * (1 + w.level * 0.2) * this.playerStats.might;
                const duration = 20000;

                const puddle = this.add.graphics();
                puddle.fillStyle(0x4488ff, 0.5);
                puddle.fillCircle(0, 0, size / 2);
                puddle.setPosition(tx, ty);

                this.tweens.add({ targets: puddle, alpha: 0.2, scaleX: 1.1, scaleY: 1.1, yoyo: true, repeat: -1, duration: 600 });

                // Splash droplets inside the boiling puddle
                const bubbleTimer = this.time.addEvent({
                    delay: 200,
                    loop: true,
                    callback: () => {
                        if (!puddle || !puddle.active) { 
                            bubbleTimer.remove(); 
                            return; 
                        }
                        const rad = (size / 2) * Math.random();
                        const ang = Math.random() * Math.PI * 2;
                        const bx = tx + Math.cos(ang) * rad;
                        const by = ty + Math.sin(ang) * rad;
                        const drop = this.add.circle(bx, by, Phaser.Math.Between(2, 5), 0xaaddff, 0.8);
                        this.tweens.add({
                            targets: drop,
                            y: by - Phaser.Math.Between(10, 20),
                            alpha: 0,
                            scale: 1.5,
                            duration: 400,
                            onComplete: () => drop.destroy()
                        });
                    }
                });

                const tick = this.time.addEvent({
                    delay: 250,
                    repeat: Math.floor(duration / 250),
                    callback: () => {
                        this.enemies.getChildren().forEach(e => {
                            if (Phaser.Math.Distance.Between(tx, ty, e.x, e.y) < size / 2) {
                                this.damageEnemy(e, dmg);
                                // Poison Splash evolution (L2+): mark enemies so
                                // they keep taking damage after leaving the pool;
                                // duration + potency step up at L5 / L8
                                if (w.level >= 2) {
                                    const t = this.evoTier(w.level);
                                    e.poisonUntil = this.time.now + [3000, 4500, 6000][t];
                                    e.poisonDmg = dmg * [0.3, 0.4, 0.5][t];
                                }
                            }
                        });
                    }
                });

                this.time.delayedCall(duration, () => {
                    bubbleTimer.remove();
                    tick.remove();
                    this.tweens.add({
                        targets: puddle, alpha: 0, duration: 500,
                        onComplete: () => puddle.destroy()
                    });
                });
            }
        });
        };
        throwOne();
        if (w.level >= 5) this.time.delayedCall(300, () => { if (this.gameState === 'PLAYING') throwOne(); });
    }

    updateBullets() {
        this.bullets.getChildren().forEach(b => {
            if (b.type === 'rulerarc') {
                // Electric arc: fixed heading, crackling flicker, dies at the
                // end of its travel distance (life counts frames)
                b.life--;
                b.setAlpha(0.72 + Math.random() * 0.28);
                // Jagged lightning bolts along the crescent band, re-rolled
                // every frame. Local band point -> world via b.rotation, then
                // each bolt zigzags radially in/outward with side jitter.
                if (b.elecGfx) {
                    const g = b.elecGfx;
                    g.clear();
                    const sc = b.displayWidth / 72;   // fx_arc texture is 72px
                    const cosR = Math.cos(b.rotation), sinR = Math.sin(b.rotation);
                    for (let i = 0; i < 3; i++) {
                        const a = -1.15 + Math.random() * 2.3;
                        const lx = (-10 + Math.cos(a) * 26) * sc, ly = Math.sin(a) * 26 * sc;
                        let x = b.x + lx * cosR - ly * sinR;
                        let y = b.y + lx * sinR + ly * cosR;
                        const dir = Math.random() < 0.3 ? -1 : 1; // mostly outward
                        const dax = Math.cos(a + b.rotation) * dir, day = Math.sin(a + b.rotation) * dir;
                        const pts = [[x, y]];
                        const segs = 3 + ((Math.random() * 2) | 0);
                        for (let s2 = 0; s2 < segs; s2++) {
                            x += dax * (4 + Math.random() * 7) - day * (Math.random() - 0.5) * 13;
                            y += day * (4 + Math.random() * 7) + dax * (Math.random() - 0.5) * 13;
                            pts.push([x, y]);
                        }
                        const stroke = (wd, col, alpha) => {
                            g.lineStyle(wd, col, alpha);
                            g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
                            for (let k = 1; k < pts.length; k++) g.lineTo(pts[k][0], pts[k][1]);
                            g.strokePath();
                        };
                        stroke(3.5, 0xffe23a, 0.55);  // yellow halo
                        stroke(1.6, 0xffffff, 0.95);  // white hot core
                        // bright tip node
                        g.fillStyle(0xffffff, 0.9);
                        g.fillCircle(pts[pts.length - 1][0], pts[pts.length - 1][1], 1.6);
                    }
                }
                if (this.gameTime % 2 === 0) {
                    const s = this.add.circle(b.x + (Math.random() - 0.5) * 14,
                        b.y + (Math.random() - 0.5) * 14, 3, 0xfff27a, 0.7);
                    this.tweens.add({ targets: s, alpha: 0, scale: 0.2, duration: 200, onComplete: () => s.destroy() });
                }
                if (b.life <= 0) b.destroy();
                return;
            }
            if (b.type === 'cross') {
                b.returnTimer--;
                if (b.returnTimer === 0) b.body.setVelocity(-b.body.velocity.x, 0);
            }
            // Spin per projectile: book tumbles, scissors/triangle whirl fast
            // (Whirling Blades from L3), the paper plane keeps its heading
            if (b.type === 'axe') b.rotation += 0.2;
            else if (b.type === 'knife') b.rotation += ((b.wlevel || 1) >= 3 ? 0.35 : 0.18);
            else if (b.type === 'cross') b.rotation += 0.25;
            else if (b.type !== 'wand') b.rotation += 0.1;

            // Spawn trailing particles — richer/warmer as the weapon levels up
            if (this.gameTime % 2 === 0) {
                const lvl = b.wlevel || 1;
                const lvlBonus = Math.min(lvl, 6) * 0.5;
                let trailColor = 0xffffff;
                let trailSize = 3;
                // Trail color upgrades at each weapon's FIRST evolution (L2);
                // purely cosmetic — a visual badge that the weapon has evolved
                if (b.type === 'wand') {
                    trailColor = lvl >= 2 ? 0xffd700 : 0x00ffff;
                    trailSize = 5 + lvlBonus;
                }
                else if (b.type === 'cross') {
                    trailColor = lvl >= 2 ? 0x66e0ff : 0xffeb3b;
                    trailSize = 4 + lvlBonus;
                }
                else if (b.type === 'axe') {
                    trailColor = lvl >= 2 ? 0xffd700 : 0xffffff; // fluttering pages
                    trailSize = 5 + lvlBonus;
                }
                else if (b.type === 'knife') {
                    trailColor = lvl >= 2 ? 0xffd700 : 0xe0e0e0;
                    trailSize = 3 + lvlBonus;
                }
                
                const trail = this.add.circle(b.x, b.y, trailSize, trailColor, 0.6);
                this.tweens.add({
                    targets: trail,
                    alpha: 0,
                    scale: 0.1,
                    duration: 300,
                    onComplete: () => trail.destroy()
                });
            }

            const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, b.x, b.y);
            if (dist > 1000) b.destroy();
        });
    }

    // Tint all puppet parts (Containers have no setTint); null clears
    tintPlayer(color) {
        const pp = this.playerParts;
        if (pp) {
            [pp.body, pp.arm, pp.footL, pp.footR].forEach(img => {
                if (color === null) img.clearTint(); else img.setTint(color);
            });
        } else if (this.player.setTint) {
            if (color === null) this.player.clearTint(); else this.player.setTint(color);
        }
    }

    // The hero's ruler arm snaps through a swing in rhythm with the whip attack
    swingRulerArm(strikeMs) {
        const pp = this.playerParts;
        if (!pp) return;
        pp.armSwinging = true;
        this.tweens.killTweensOf(pp.arm);
        pp.arm.angle = -60; // wind up high
        this.tweens.add({
            targets: pp.arm, angle: 80, duration: Math.max(100, (strikeMs || 150) * 0.9), ease: 'Quad.out',
            onComplete: () => {
                this.tweens.add({
                    targets: pp.arm, angle: pp.armBaseAngle, duration: 260, ease: 'Sine.out',
                    onComplete: () => { pp.armSwinging = false; }
                });
            }
        });
    }

    handlePlayerHit(player, enemy) {
        if (this.invulnTimer > 0) return;
        // Touch no longer hurts: only a connecting LUNGE deals damage.
        // Exception: swarm bats keep classic fly-through contact damage.
        if (!enemy.isSwarm && enemy.attackState !== 'lunge') return;

        // A successful bite ends the lunge immediately (no double-dipping)
        if (!enemy.isSwarm) {
            enemy.attackState = 'recover';
            enemy.recoverUntil = this.time.now + 650;
            if (enemy.body) enemy.body.setVelocity(0, 0);
        }

        const difficulty = this.getDifficulty();
        // Damage scales with difficulty: 1 at start, grows with difficulty, cap at 25.
        // Bosses carry a dmgMult (final boss = 2x) so their bite hurts more.
        const dmg = Math.min(25, Math.ceil(difficulty)) * (enemy.dmgMult || 1);

        this.playerStats.hp -= dmg;
        synthHurt();
        this.invulnTimer = 60;

        // Taking a hit breaks the kill combo
        this.combo = 0;
        this.comboText.setVisible(false);

        // "WHO hit me" feedback — deliberately NO player knockback (pinball problem)
        this.flashAttacker(enemy);

        // Visual Hit Juice
        this.cameras.main.shake(150, 0.012);
        this.cameras.main.flash(100, 255, 0, 0, 0.2); // slight red flash
        this.spawnBurstParticles(this.player.x, this.player.y, 0xff0000, 10, 4);

        if (this.playerStats.hp <= 0) this.gameOver();
        updateDOMHUD(this.playerStats, Math.floor(this.accumulatedTime / 1000), this.killCount);
    }

    // Make it unmistakable WHICH enemy landed the hit: white flash -> red
    // afterglow on the attacker, expanding ring, and a red impact streak
    // between attacker and player.
    flashAttacker(enemy) {
        enemy.setTintFill(0xffffff);
        this.time.delayedCall(90, () => { if (enemy.active) enemy.setTint(0xff4444); });
        this.time.delayedCall(600, () => { if (enemy.active) enemy.clearTint(); });

        const ring = this.add.graphics().setDepth(55);
        ring.lineStyle(4, 0xff3333, 1);
        ring.strokeCircle(0, 0, 18);
        ring.setPosition(enemy.x, enemy.y);
        this.tweens.add({ targets: ring, scaleX: 2.4, scaleY: 2.4, alpha: 0, duration: 350, ease: 'Quad.out', onComplete: () => ring.destroy() });

        const streak = this.add.graphics().setDepth(55);
        streak.lineStyle(5, 0xff3333, 0.9);
        streak.lineBetween(enemy.x, enemy.y, this.player.x, this.player.y);
        this.tweens.add({ targets: streak, alpha: 0, duration: 280, onComplete: () => streak.destroy() });
    }

    damageEnemy(enemy, amount, knockback = 0) {
        if (!enemy.active) return;
        enemy.hp -= amount;
        // Swap to the drawn "getting hit" frame briefly (frame driver reverts)
        if (enemy.animHit) enemy.hitUntil = this.time.now + 200;

        // Hit flash — guarded so a boss under constant fire can't stack dozens
        // of overlapping alpha tweens. The old yoyo tween, when re-triggered
        // mid-dip, captured the current 0.3 alpha as its return value, so opacity
        // ratcheted down and left the enemy permanently translucent. One flash
        // at a time; always restore full opacity on complete. (Scale is owned by
        // the per-frame frame driver, so it's not tweened here.)
        if (!enemy._hitFlash) {
            enemy._hitFlash = true;
            this.tweens.add({
                targets: enemy,
                alpha: 0.45,
                duration: 55,
                yoyo: true,
                onComplete: () => { enemy._hitFlash = false; if (enemy.active) enemy.alpha = 1; }
            });
        }

        // Knockback + stun: skip entirely for the boss. It's huge and takes a
        // constant stream of hits, so knockback shoved it around "from far away"
        // and the stun-lock (stunTimer refreshed every hit) meant its attack AI
        // never got to run — it could never actually attack. Bosses now plow
        // through hits unflinching (hit FRAME still plays for feedback).
        if (knockback > 0 && enemy.body && !enemy.isBoss) {
            const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, enemy.x, enemy.y);
            enemy.body.setVelocity(Math.cos(angle) * knockback, Math.sin(angle) * knockback);
            enemy.stunTimer = 15;
        }

        // Damage hit spark particles
        this.spawnBurstParticles(enemy.x, enemy.y, 0xff5555, 4, 3);

        // Damage Text (Juice) with Crit indicators
        const isCrit = amount > 15 || enemy.isBoss;
        this.spawnDamagePop(enemy.x, enemy.y, Math.round(amount), isCrit);

        if (enemy.hp <= 0) {
            enemy.active = false;
            if (enemy.isFinal) this.onFinalBossDefeated(); // beating it wins the game
            // Defeated pose for the fade-out (zombie has a drawn death frame)
            if (enemy.animDead) enemy.setTexture(enemy.animDead);
            enemy.body.checkCollision.none = true;
            enemy.body.setVelocity(enemy.body.velocity.x * 1.5, enemy.body.velocity.y * 1.5);
            enemy.body.setDrag(1000);
            // Death SFX by enemy kind: bats AND rats share the squeak (user
            // request), zombies get their own; boss keeps its own juice
            let deathPlayed = false;
            if (enemy.isBat || enemy.enemyType === 0) deathPlayed = playSfxSample('sfx/bat_death.mp3', 0.3, undefined, 60);
            else if (enemy.enemyType === 2) deathPlayed = playSfxSample('sfx/zombie_death.mp3', 0.5, undefined, 60);
            if (!deathPlayed) synthHit();

            // Kill juice: combo counter
            this.registerCombo();

            // Death Ring Explosion Particles
            const explosionColor = enemy.isBoss ? 0xff00ff : 0x00ff88;
            const particleCount = enemy.isBoss ? 35 : 15;
            const particleSize = enemy.isBoss ? 6 : 4;
            this.spawnBurstParticles(enemy.x, enemy.y, explosionColor, particleCount, particleSize);

            // Death animation: fade out and float up
            this.tweens.add({
                targets: enemy,
                alpha: 0,
                y: enemy.y - 15,
                scaleX: 0.8,
                scaleY: 0.8,
                duration: 500,
                onComplete: () => {
                    if (enemy.isBoss) {
                        if (Math.random() < 0.3) this.spawnPowerUp(enemy.x, enemy.y);
                        for (let i = 0; i < 5; i++) {
                            this.spawnXpGem(enemy.x + (Math.random() - 0.5) * 40, enemy.y + (Math.random() - 0.5) * 40, 15);
                        }
                    } else {
                        this.spawnXpGem(enemy.x, enemy.y, 5);

                        if (Math.random() < 0.01) {
                            this.spawnPowerUp(enemy.x, enemy.y);
                        }
                    }
                    this.killCount++;
                    updateDOMHUD(this.playerStats, Math.floor(this.accumulatedTime / 1000), this.killCount);
                    enemy.destroy();
                }
            });
        }
    }

    // XP drop: gold star from the item sheet (green circle if art missing).
    // Big + shiny so kids KNOW to grab them: pulse-throb and sparkles happen
    // per-frame in updateGems (no per-gem tweens — dozens can exist).
    spawnXpGem(x, y, val) {
        let g;
        if (this.textures.exists('item_star')) {
            g = this.setPx(this.add.image(x, y, 'item_star'), val >= 15 ? 46 : 34);
            g.baseScale = g.scale;
            g.pulseSeed = Math.random() * Math.PI * 2;
        } else {
            g = this.add.circle(x, y, 6, 0x00ff88);
        }
        this.physics.add.existing(g);
        g.val = val; g.type = 'xp'; this.gems.add(g);
        return g;
    }

    spawnPowerUp(x, y) {
        // One ESL puzzle at a time: no new bonuses drop while one is active
        if (this.puzzle) return;
        // Hero-exclusive weapons: a dropped box must never offer the OTHER
        // hero's special weapon either (same rule as the level-up menu) —
        // this is what let the Class Monitor grab a Jump Rope from a drop.
        const myWeapon = this.character ? this.character.weapon : 'ruler';
        const otherSpecials = Object.values(VS_CHARACTERS).map(c => c.weapon).filter(wid => wid !== myWeapon);
        const weapons = POWER_UPS.filter(p => p.type === 'weapon' && !otherSpecials.includes(p.id));
        const specials = [
            { id: 'heart', icon: '❤️', type: 'special' },
            { id: 'vortex', icon: '🌀', type: 'special' },
            { id: 'tornado', icon: '🌪️', type: 'special' }
        ];
        const choices = [...weapons, ...specials];
        const choice = Phaser.Math.RND.pick(choices);

        // Boxed like a puzzle letter (teal border = "bonus"), same walk-on radius
        const bw = 60, bh = 60;
        const g = this.add.graphics();
        g.fillStyle(0x0e2a1e, 0.92);
        g.fillRoundedRect(-bw / 2, -bh / 2, bw, bh, 12);
        g.lineStyle(3, 0x7cf5b0, 1);
        g.strokeRoundedRect(-bw / 2, -bh / 2, bw, bh, 12);
        const iconImg = this.setPx(this.add.image(0, 0, this.itemTex(choice.id, 'pu_' + choice.id)), 44);
        const box = this.add.container(x, y, [g, iconImg]);
        box.setDepth(44);
        box.reward = choice;
        box.collected = false;
        box.hitR = bw / 2 + 14; // identical generous radius to the letter boxes
        this.powerUps.add(box);

        // Gentle bonus pulse
        box.setScale(0);
        this.tweens.add({ targets: box, scale: 1, duration: 300, ease: 'Back.out' });
        this.tweens.add({ targets: iconImg, alpha: 0.55, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.inOut' });
        return box;
    }

    handlePowerUpPickup(player, powerup) {
        if (powerup.collected) return;
        if (this.puzzle) return; // one puzzle at a time — leave other bonuses on the ground
        powerup.collected = true;

        const reward = powerup.reward;
        const px = powerup.x, py = powerup.y;
        powerup.destroy();
        synthLootbox();

        // Walking on a bonus starts a ground word/sentence puzzle;
        // the reward is granted only when the puzzle is solved.
        this.startWalkingPuzzle(reward, px, py);
    }

    // Reward pickup celebration + activation (runs after a solved puzzle)
    grantPuzzleReward(reward) {
        synthGem();
        const flyingIcon = this.setPx(
            this.add.image(this.player.x, this.player.y - 40, this.itemTex(reward.id, 'pu_' + reward.id)),
            46).setOrigin(0.5).setDepth(56);
        const iconBaseScale = flyingIcon.scale; // setPx-normalized; shrink is relative

        let orbitAngle = 0;
        this.tweens.addCounter({
            from: 0,
            to: 1,
            duration: 800,
            onUpdate: (tween) => {
                const t = tween.getValue();
                orbitAngle += 0.25;
                const radius = 60 * (1 - t * 0.4);

                flyingIcon.x = this.player.x + Math.cos(orbitAngle) * radius;
                flyingIcon.y = this.player.y + Math.sin(orbitAngle) * radius;
                flyingIcon.rotation += 0.15;

                if (t > 0.6) {
                    const snapT = (t - 0.6) / 0.4;
                    flyingIcon.x = Phaser.Math.Linear(flyingIcon.x, this.player.x, snapT);
                    flyingIcon.y = Phaser.Math.Linear(flyingIcon.y, this.player.y, snapT);
                    flyingIcon.scale = iconBaseScale * 1.2 * (1 - snapT);
                }
            },
            onComplete: () => {
                flyingIcon.destroy();

                if (reward.type === 'weapon') {
                    this.applyReward(reward);
                } else {
                    if (reward.id === 'heart') {
                        this.playerStats.hp = Math.min(this.playerStats.maxHp, this.playerStats.hp + 30);
                    } else if (reward.id === 'vortex') {
                        this.gems.getChildren().forEach(gem => {
                            if (gem.type === 'xp') gem.vortexed = true;
                        });
                    } else if (reward.id === 'tornado') {
                        this.spawnTornado();
                    }
                }
                updateDOMHUD(this.playerStats, Math.floor(this.accumulatedTime / 1000), this.killCount);
                synthGem();
            }
        });
    }

    // ---------------------------------------------------------
    // WALKING WORD/SENTENCE PUZZLES (extra ESL on the battlefield)
    // Word mode  : boxes are LETTERS; spaces/punctuation pre-filled in tracker
    // Sentence   : boxes are WORDS with punctuation attached ("bananas?")
    // Duplicates : interchangeable — validation compares VALUES, not boxes
    // Check-on-complete: mistakes revealed only when everything is collected
    // ---------------------------------------------------------
    pickPuzzleContent() {
        const punct = [' ', '-', '.', '?', '!', ',', "'"];
        // Strict alternation — random 50/50 could serve long word-streaks and
        // students never saw a sentence puzzle
        this.puzzleWantSentence = !this.puzzleWantSentence;
        const wantSentence = this.puzzleWantSentence;

        const srPick = (kind) => {
            try {
                const { book, unit, page } = selectedClassContent;
                const raw = getGameItemSR(book, unit, page, kind, srInSessionFailures, srInSessionSuccesses, null);
                const list = (Array.isArray(raw) ? raw : [raw]).flat(2);
                return list.find(t => typeof t === 'string' && t.trim().length > 0) || null;
            } catch (e) { return null; }
        };
        const poolPick = (pool) => {
            const clean = pool.filter(t => typeof t === 'string' && t.trim().length > 0);
            const fresh = clean.filter(t => !this.puzzleDone.has(t));
            const from = fresh.length ? fresh : clean;
            return from.length ? from[Math.floor(Math.random() * from.length)] : null;
        };

        const kinds = wantSentence ? ['sentences', 'vocab'] : ['vocab', 'sentences'];
        for (const kind of kinds) {
            const pool = kind === 'vocab'
                ? (typeof SPELLING_WORDS !== 'undefined' ? SPELLING_WORDS : [])
                : (typeof GRAMMAR_SENTENCES !== 'undefined' ? GRAMMAR_SENTENCES : []);
            let text = srPick(kind);
            if (!text || this.puzzleDone.has(text)) text = poolPick(pool);
            if (!text) continue;

            if (kind === 'vocab') {
                const letters = text.split('').filter(ch => !punct.includes(ch));
                if (letters.length < 2 || letters.length > 14) {
                    // too long to walk — try a shorter pool word instead
                    const alt = poolPick(pool.filter(t => {
                        const ls = String(t).split('').filter(ch => !punct.includes(ch));
                        return ls.length >= 2 && ls.length <= 14;
                    }));
                    if (!alt) continue;
                    text = alt;
                }
                const toks = text.split('').filter(ch => !punct.includes(ch));
                return { text, mode: 'word', tokens: toks };
            } else {
                const words = text.split(' ').filter(w => w.length > 0);
                if (words.length < 2 || words.length > 12) continue;
                return { text, mode: 'sentence', tokens: words };
            }
        }
        return null;
    }

    startWalkingPuzzle(reward, cx, cy) {
        const item = this.pickPuzzleContent();
        if (!item) { this.grantPuzzleReward(reward); return; } // no content loaded -> just grant

        this.puzzle = { reward, item, attempt: [], boxes: [] };

        // Build ring positions, then SHUFFLE which token lands in each slot so
        // spatial order != spelling order (otherwise students just walk a
        // clockwise circle without reading). Fisher-Yates on the slots.
        const n = item.tokens.length;
        const angle0 = Math.random() * Math.PI * 2;
        const positions = [];
        for (let i = 0; i < n; i++) {
            const ang = angle0 + (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.35;
            // Wider spacing (was 150 + 78 + 40): bigger ring + larger inter-ring
            // gap so boxes sit further apart and are easier to grab cleanly
            const rad = 205 + (i % 2) * 100 + Math.random() * 45;
            positions.push({ x: cx + Math.cos(ang) * rad, y: cy + Math.sin(ang) * rad });
        }
        for (let i = positions.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const tmp = positions[i]; positions[i] = positions[j]; positions[j] = tmp;
        }
        item.tokens.forEach((tok, i) => {
            this.puzzle.boxes.push(this.createPuzzleBox(tok, positions[i].x, positions[i].y));
        });

        this.updatePuzzleTracker();
        this.playPuzzleAudio();
    }

    playPuzzleAudio() {
        if (!this.puzzle) return;
        if (typeof playTTS === 'function' && typeof currentTTSWord !== 'undefined') {
            currentTTSWord = this.puzzle.item.text;
            playTTS();
        }
        if (window.BGM) {
            BGM.duck('prompt');
            const holdMs = this.puzzle.item.mode === 'sentence' ? 4000 : 2500;
            setTimeout(() => { if (window.BGM) BGM.unduck('prompt'); }, holdMs);
        }
    }

    createPuzzleBox(tok, x, y) {
        // Big boxes: readability on small phone screens comes first
        const w = Math.max(62, tok.length * 19 + 32);
        const h = 62;
        const g = this.add.graphics();
        g.fillStyle(0x14213d, 0.92);
        g.fillRoundedRect(-w / 2, -h / 2, w, h, 12);
        g.lineStyle(4, 0xffd166, 1);
        g.strokeRoundedRect(-w / 2, -h / 2, w, h, 12);
        const t = this.add.text(0, 1, tok, {
            fontSize: '31px', fontFamily: 'Fredoka', color: '#ffffff', fontStyle: 'bold'
        }).setOrigin(0.5);
        const box = this.add.container(x, y, [g, t]);
        box.setDepth(45); // above the horde: letters must stay readable
        box.tokenValue = tok;
        box.used = false;
        box.homeX = x; box.homeY = y;
        box.hitR = w / 2 + 16; // generous walk-on radius = instant feedback
        box.setScale(0);
        this.tweens.add({ targets: box, scale: 1, duration: 320, ease: 'Back.out', delay: Math.random() * 250 });
        return box;
    }

    updatePuzzle() {
        const p = this.puzzle;
        if (!p || p.checking) return;
        // Subtle correct-letter magnet: the NEXT needed token's box(es) get a
        // slightly larger walk-on radius, wrong boxes a slightly smaller one, so
        // dodging an enemy through a cluster is less likely to grab a wrong box.
        // Duplicates that match the needed token share the same (bigger) radius.
        // Preference: if a correct box is in range this frame, take the nearest
        // correct; only take a wrong box when no correct box is reachable.
        const need = p.item.tokens[p.attempt.length];
        let bestCorrect = null, bestCorrectD = Infinity;
        let bestWrong = null, bestWrongD = Infinity;
        for (const box of p.boxes) {
            if (box.used) continue;
            const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, box.x, box.y);
            const isCorrect = box.tokenValue === need;
            const eff = (box.hitR + 18) * (isCorrect ? 1.15 : 0.85);
            if (d >= eff) continue;
            if (isCorrect) { if (d < bestCorrectD) { bestCorrectD = d; bestCorrect = box; } }
            else if (d < bestWrongD) { bestWrongD = d; bestWrong = box; }
        }
        const pick = bestCorrect || bestWrong;
        if (pick) this.collectPuzzleBox(pick);
    }

    collectPuzzleBox(box) {
        box.used = true;
        this.puzzle.attempt.push(box);
        synthGem();
        this.spawnBurstParticles(box.x, box.y, 0xffd166, 6, 3);
        this.tweens.add({
            targets: box, y: box.y - 44, alpha: 0, scale: 0.5, duration: 260, ease: 'Quad.in',
            onComplete: () => { box.setVisible(false); }
        });
        this.updatePuzzleTracker();
        if (this.puzzle.attempt.length === this.puzzle.item.tokens.length) {
            this.puzzle.checking = true; // lock the tracker button during feedback
            this.time.delayedCall(320, () => this.checkPuzzle());
        }
    }

    checkPuzzle() {
        const p = this.puzzle;
        if (!p) return;
        const got = p.attempt.map(b => b.tokenValue);
        const want = p.item.tokens;
        // Compare VALUES — duplicate letters/words are interchangeable
        const ok = got.length === want.length && got.every((v, i) => v === want[i]);
        if (ok) {
            this.puzzleDone.add(p.item.text);
            synthLevelUp();
            p.feedback = true; // ESL-style reveal: every slot colors green
            this.setTrackerState('success');
            this.updatePuzzleTracker();
            this.spawnBurstParticles(this.player.x, this.player.y, 0x00ff88, 20, 5);
            const reward = p.reward;
            this.time.delayedCall(750, () => {
                this.teardownPuzzle(true);
                this.grantPuzzleReward(reward);
            });
        } else {
            synthError();
            p.feedback = true; // ESL-style reveal: green = right slot, red = wrong
            this.setTrackerState('fail');
            this.updatePuzzleTracker();
            this.cameras.main.shake(120, 0.006);
            // Check-on-complete: hold the reveal so students can SEE which
            // slots were wrong (same principle as the spelling minigame),
            // then everything goes back to the ground and they start over
            this.time.delayedCall(1600, () => this.resetPuzzleBoxes());
        }
    }

    resetPuzzleBoxes() {
        const p = this.puzzle;
        if (!p) return;
        p.attempt = [];
        p.checking = false;
        p.feedback = false;
        p.boxes.forEach(b => {
            if (!b.used) return; // untouched boxes stay put (no blink)
            b.used = false;
            b.x = b.homeX; b.y = b.homeY;
            b.setVisible(true).setAlpha(0).setScale(0.4);
            this.tweens.add({ targets: b, alpha: 1, scale: 1, duration: 300, ease: 'Back.out' });
        });
        this.setTrackerState('normal');
        this.updatePuzzleTracker();
    }

    teardownPuzzle(success) {
        const p = this.puzzle;
        this.puzzle = null;
        if (p) p.boxes.forEach(b => { try { b.destroy(); } catch (e) { } });
        if (this._puzzleDom) this._puzzleDom.style.display = 'none';
    }

    ensurePuzzleDom() {
        if (this._puzzleDom) { this._puzzleDom.style.display = ''; return this._puzzleDom; }
        const div = document.createElement('div');
        div.id = 'vsPuzzleTracker';
        div.style.cssText = 'position:fixed;top:58px;left:50%;transform:translateX(-50%);z-index:40;' +
            'background:rgba(10,16,40,0.9);border:2px solid #ffd166;border-radius:14px;padding:7px 14px;' +
            'color:#fff;font-family:Fredoka,sans-serif;text-align:center;max-width:94vw;cursor:pointer;' +
            'pointer-events:auto;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;' +
            'touch-action:none;transition:border-color 0.25s, background 0.25s;';
        div.innerHTML =
            '<div id="vsPuzzleZh" style="font-size:12px;opacity:0.85;margin-bottom:3px;"></div>' +
            '<div id="vsPuzzleSlots" style="font-size:18px;font-weight:bold;letter-spacing:1px;line-height:1.4;"></div>' +
            '<div style="font-size:10px;opacity:0.6;margin-top:2px;">🔊 点击：重听 + 退回字母</div>';
        // Multi-touch fix: browsers do NOT synthesize 'click' for a second
        // finger tapped while another is held down (the joystick finger), so
        // onclick silently ate taps mid-movement. React to the raw pointerup
        // instead — touch implicit-capture guarantees it fires on the element
        // where the finger went DOWN, so joystick releases never leak here.
        // IMPORTANT: no preventDefault/stopPropagation — Phaser tracks this
        // finger via window-level listeners, and blocking the bubble leaked a
        // permanently-down pointer per tap until ALL input froze (stuck
        // joystick bug). A tap up here is harmless to the game: the joystick
        // only activates on the bottom half of the screen.
        if (window.PointerEvent) {
            div.addEventListener('pointerup', () => this.onTrackerTap());
        } else {
            div.onclick = () => this.onTrackerTap(); // ancient-browser fallback
        }
        document.body.appendChild(div);
        this._puzzleDom = div;
        return div;
    }

    // Tracker tap = UNDO the last collected letter/word (tap repeatedly to
    // remove more). Only replays the prompt audio when the dock is empty.
    onTrackerTap() {
        const p = this.puzzle;
        if (!p || p.checking) return;
        if (p.attempt.length > 0) {
            this.undoLastPuzzleBox();
        } else {
            this.playPuzzleAudio(); // empty dock -> re-hear the word/sentence
        }
    }

    // Return only the most-recently-collected box to its home spot (silent)
    undoLastPuzzleBox() {
        const p = this.puzzle;
        if (!p || !p.attempt.length) return;
        const box = p.attempt.pop();
        box.used = false;
        box.x = box.homeX; box.y = box.homeY;
        box.setVisible(true).setAlpha(0).setScale(0.4);
        this.tweens.add({ targets: box, alpha: 1, scale: 1, duration: 260, ease: 'Back.out' });
        this.updatePuzzleTracker();
    }

    setTrackerState(state) {
        if (!this._puzzleDom) return;
        if (state === 'success') {
            this._puzzleDom.style.borderColor = '#22c55e';
            this._puzzleDom.style.background = 'rgba(6,60,30,0.92)';
        } else if (state === 'fail') {
            this._puzzleDom.style.borderColor = '#ef4444';
            this._puzzleDom.style.background = 'rgba(70,10,10,0.92)';
        } else {
            this._puzzleDom.style.borderColor = '#ffd166';
            this._puzzleDom.style.background = 'rgba(10,16,40,0.9)';
        }
    }

    updatePuzzleTracker() {
        const p = this.puzzle;
        if (!p) return;
        const div = this.ensurePuzzleDom();
        const zhEl = div.querySelector('#vsPuzzleZh');
        const slotsEl = div.querySelector('#vsPuzzleSlots');

        const zh = (typeof getLocalTranslation === 'function') ? getLocalTranslation(p.item.text) : '';
        zhEl.textContent = zh || '✨ 拼出它！Walk the boxes in order!';

        const punct = [' ', '-', '.', '?', '!', ',', "'"];
        const filled = p.attempt.map(b => b.tokenValue);
        // ESL minigame reveal colors (Tailwind green-500 / red-500): during
        // the check, each filled slot shows green (right) or red (wrong)
        const slotColor = (i) => !p.feedback ? '#ffd166'
            : (filled[i] === p.item.tokens[i] ? '#22c55e' : '#ef4444');
        let html = '';
        if (p.item.mode === 'word') {
            slotsEl.style.fontSize = '18px';
            // Full template: punctuation pre-filled (dim), letters fill as walked
            let li = 0;
            for (const ch of p.item.text) {
                if (punct.includes(ch)) {
                    html += ch === ' '
                        ? '<span style="display:inline-block;width:0.6em;"></span>'
                        : '<span style="opacity:0.65;">' + ch + '</span>';
                } else {
                    if (li < filled.length) {
                        html += '<span style="color:' + slotColor(li) + ';">' + filled[li] + '</span>';
                    } else {
                        html += '<span style="opacity:0.4;">_</span>';
                    }
                    li++;
                }
            }
        } else {
            // One dash per missing word (per-letter dashes covered small
            // phone screens); collected words replace their dash
            if (filled.length === 0) {
                slotsEl.style.fontSize = '13px';
                html = '<span style="opacity:0.5;">' +
                    p.item.tokens.map(() => '\u2581').join(' ') +
                    '</span>';
            } else {
                slotsEl.style.fontSize = '16px';
                html = p.item.tokens.map((tok, i) =>
                    i < filled.length
                        ? '<span style="color:' + slotColor(i) + ';">' + filled[i] + '</span>'
                        : '<span style="opacity:0.4;">\u2581</span>'
                ).join(' ');
            }
        }
        slotsEl.innerHTML = html;
    }

    spawnBurstParticles(x, y, color = 0xffffff, count = 10, size = 4) {
        // Pooled: pushes into a shared array drawn by ONE graphics object in
        // updateJuice(). Replaces the old per-burst Graphics + 16ms timer
        // approach that caused GC pressure on low-end devices.
        if (this.particlePool.length > 400) return; // hard cap under heavy load
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Phaser.Math.FloatBetween(2, 6);
            this.particlePool.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: Phaser.Math.FloatBetween(size * 0.5, size * 1.5),
                color
            });
        }
    }

    // Per-frame pass: particles, blob shadows, combo expiry, low-HP vignette
    updateJuice() {
        // --- Pooled particles (single clear + redraw) ---
        const g = this.particleGfx;
        g.clear();
        let write = 0;
        for (let i = 0; i < this.particlePool.length; i++) {
            const p = this.particlePool[i];
            p.x += p.vx; p.y += p.vy;
            p.vx *= 0.95; p.vy *= 0.95;
            p.size *= 0.95;
            if (p.size > 0.5) {
                g.fillStyle(p.color, 0.8);
                g.fillCircle(p.x, p.y, p.size);
                this.particlePool[write++] = p;
            }
        }
        this.particlePool.length = write;

        // --- Blob shadows (grounds characters in the world) ---
        const s = this.shadowGfx;
        s.clear();
        s.fillStyle(0x000000, 0.22);
        s.fillEllipse(this.player.x, this.player.y + (this.playerParts ? 40 : 26), 36, 13);
        const list = this.enemies.getChildren();
        for (let i = 0; i < list.length; i++) {
            const e = list[i];
            if (!e.active) continue;
            // Shadow stays on the GROUND while a hopping rat is mid-leap (e.y is
            // offset up by e._hop) — this is what makes the hop read as a jump
            const gy = e.y + (e._hop || 0);
            if (e.isBoss) s.fillEllipse(e.x, gy + 42, 60, 20);
            else s.fillEllipse(e.x, gy + 14, 22, 8);
        }

        // --- Combo expiry ---
        if (this.combo > 0 && this.time.now > this.comboExpire) {
            this.combo = 0;
            this.tweens.add({ targets: this.comboText, alpha: 0, duration: 300, onComplete: () => this.comboText.setVisible(false) });
        }

        // --- Screen overlays: scrollFactor(0) images are still scaled by
        // camera zoom, so compensate or they shrink into a centered box ---
        const camZ = this.cameras.main.zoom || 1;
        const ovW = this.scale.width / camZ, ovH = this.scale.height / camZ;
        if (this.ambient) {
            this.ambient.setPosition(this.scale.width / 2, this.scale.height / 2);
            this.ambient.setDisplaySize(ovW, ovH);
        }

        // --- Low-HP danger vignette (pulsing) ---
        const hpPct = this.playerStats.hp / this.playerStats.maxHp;
        if (hpPct < 0.3) {
            this.vignette.setPosition(this.scale.width / 2, this.scale.height / 2);
            this.vignette.setDisplaySize(ovW, ovH);
            this.vignette.setAlpha(0.45 + Math.sin(this.time.now / 180) * 0.25);
        } else if (this.vignette.alpha > 0) {
            this.vignette.setAlpha(0);
        }
    }

    // Kill-combo bookkeeping: chained kills within 1.5s build the counter
    registerCombo() {
        const now = this.time.now;
        if (now > this.comboExpire) this.combo = 0;
        this.combo++;
        this.comboExpire = now + 1500;
        if (this.combo >= 5) {
            this.comboText.setText('x' + this.combo + ' COMBO!');
            this.comboText.setVisible(true).setAlpha(1);
            const baseScale = 1 + Math.min(this.combo, 40) * 0.012;
            // Kill the previous pop tween first — stacking tweens on the same
            // target makes the text (and frame time) flicker at high combos
            this.tweens.killTweensOf(this.comboText);
            this.tweens.add({ targets: this.comboText, scale: { from: baseScale * 1.35, to: baseScale }, duration: 130, ease: 'Back.out' });
        }
    }

    spawnDamagePop(x, y, amount, isCrit = false) {
        const color = isCrit ? '#ffcc00' : (amount > 15 ? '#ff4444' : '#ffffff');
        const size = isCrit ? '26px' : (amount > 15 ? '22px' : '16px');
        const driftX = (Math.random() - 0.5) * 60;

        // Pooled text objects (perf: avoids constant create/destroy churn)
        let txt = this.popPool.pop();
        if (!txt) {
            txt = this.add.text(0, 0, '', {
                fontSize: '16px', fontFamily: 'Fredoka', color: '#ffffff',
                stroke: '#000000', strokeThickness: 3, fontStyle: 'bold'
            }).setOrigin(0.5).setDepth(60);
        }
        txt.setText(String(amount));
        txt.setStyle({ fontSize: size, color: color, strokeThickness: isCrit ? 4 : 3 });
        txt.setPosition(x, y).setAlpha(1).setScale(1).setVisible(true);

        this.tweens.add({
            targets: txt,
            x: x + driftX,
            y: y - Phaser.Math.Between(60, 90),
            alpha: 0,
            scale: isCrit ? 1.8 : 1.4,
            duration: 800,
            ease: 'Cubic.easeOut',
            onComplete: () => {
                txt.setVisible(false);
                if (this.popPool.length < 40) this.popPool.push(txt);
                else txt.destroy();
            }
        });
    }

    spawnTornado() {
        playSfxSample('sfx/tornado.mp3', 0.5, undefined, 400);
        // Kill zone rides the wandering spiral; enemies are also sucked in
        const tornado = this.add.circle(this.player.x, this.player.y, 60, 0xffffff, 0);
        this.physics.add.existing(tornado);
        tornado.body.setCircle(60);
        this.tornados.add(tornado);

        tornado.theta = 0;
        tornado.spawnX = this.player.x;
        tornado.spawnY = this.player.y;
        tornado.a = 50;
        tornado.b = 8;

        if (this.textures.exists('item_tornado')) {
            // Faint dark backdrop just for a touch of grass contrast
            tornado.backdrop = this.add.circle(tornado.x, tornado.y, 96, 0x14202e, 0.2).setDepth(45);
            // Paper tornado art (re-sliced with the real vortex intact)
            tornado.spriteImg = this.setPx(
                this.add.image(tornado.x, tornado.y, 'item_tornado').setDepth(46), 180);
            tornado.spriteBaseScale = tornado.spriteImg.scale;
            // One Zelda-spin-style crescent swirl orbiting the funnel edge
            tornado.swirl = this.add.graphics().setDepth(47);
        } else {
            // Emoji fallback: the classic orbiting fireballs
            tornado.fireballs = [];
            for (let i = 0; i < 12; i++) {
                const fb = this.add.image(this.player.x, this.player.y, 'fire_large').setOrigin(0.5);
                this.physics.add.existing(fb);
                fb.body.setCircle(15);
                this.tornados.add(fb);

                fb.orbitRadius = Phaser.Math.Between(20, 70);
                fb.orbitSpeed = Phaser.Math.FloatBetween(0.1, 0.2);
                fb.orbitAngle = (i / 12) * Math.PI * 2;
                tornado.fireballs.push(fb);
            }
        }

        if (!this.activeTornados) this.activeTornados = [];
        this.activeTornados.push(tornado);

        this.time.delayedCall(5000, () => {
            if (tornado.fireballs) tornado.fireballs.forEach(f => { if (f.active) f.destroy(); });
            if (tornado.spriteImg) tornado.spriteImg.destroy();
            if (tornado.backdrop) tornado.backdrop.destroy();
            if (tornado.swirl) tornado.swirl.destroy();
            tornado.destroy();
        });
    }

    updateGems() {
        this.gems.getChildren().forEach(g => {
            g.rotation += 0.04; // slow star twinkle-spin (no-op on circles)
            // Shine: throb between 85%-115% + occasional golden glints
            if (g.baseScale) {
                g.setScale(g.baseScale * (1 + 0.15 * Math.sin(this.gameTime * 0.25 + g.pulseSeed)));
                if (Math.random() < 0.012) this.spawnBurstParticles(g.x, g.y, 0xffd966, 2, 2);
            }
            const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, g.x, g.y);
            // Wide magnet so stars stream in from far (incl. the trail dropped
            // behind a fleeing kid) — teaches "shiny = grab" and tugs attention back
            if (d < 360 || g.vortexed) this.physics.moveToObject(g, this.player, 720);
            if (d < 42) {
                synthGem();
                this.spawnBurstParticles(this.player.x, this.player.y, 0x00ffff, 5, 2.5);
                if (g.type === 'chest') this.triggerTreasureEvent();
                else this.addXp(g.val);
                g.destroy();
            }
        });
    }

    addXp(amount) {
        this.playerStats.xp += amount;
        if (this.playerStats.xp >= this.playerStats.nextLevelXp) {
            this.playerStats.xp -= this.playerStats.nextLevelXp;
            this.playerStats.level++;
            this.playerStats.nextLevelXp = Math.floor(this.playerStats.nextLevelXp * 1.5);
            synthLevelUp();
            
            // Level up juice!
            this.spawnBurstParticles(this.player.x, this.player.y, 0xffff00, 25, 5);
            this.cameras.main.flash(300, 255, 255, 255, 0.3);
            
            const lvlText = this.add.text(this.player.x, this.player.y - 60, '⭐ LEVEL UP! ⭐', {
                fontSize: '28px',
                fontFamily: 'Fredoka',
                color: '#ffff00',
                stroke: '#000000',
                strokeThickness: 5,
                fontStyle: 'bold'
            }).setOrigin(0.5);
            
            this.tweens.add({
                targets: lvlText,
                y: this.player.y - 120,
                alpha: 0,
                scale: 1.5,
                duration: 1200,
                onComplete: () => lvlText.destroy()
            });

            this.triggerLevelUp();

            if (this.playerStats.level % 5 === 0) {
                this.spawnEnemyCircle();
            }
        }
        updateDOMHUD(this.playerStats, Math.floor(this.accumulatedTime / 1000), this.killCount);
    }

    triggerLevelUp() {
        this.scene.pause();
        showPowerUpSelection('levelup');
    }

    triggerTreasureEvent() {
        this.scene.pause();
        const types = ['spelling', 'wordrec', 'scramble', 'sentencematch'];
        const type = types[Math.floor(Math.random() * types.length)];
        startMiniGame(type, 'chest');
    }

    gameOver() {
        if (this.gameState === 'GAMEOVER') return; // guard against re-entry
        this.gameState = 'GAMEOVER';
        if (window.BGM) BGM.stop();
        this.teardownPuzzle(false);

        // Death slow-mo: world crawls while the death animation plays
        this.physics.world.timeScale = 4;
        const camZoom = this.cameras.main.zoom;
        this.cameras.main.zoomTo(Math.min(camZoom * 1.4, 1.6), 1400, 'Sine.easeOut');

        this.player.body.setVelocity(0, 0);
        this.player.body.setImmovable(true);

        this.enemies.getChildren().forEach(e => {
            if (e.body) e.body.setVelocity(0, 0);
        });

        synthDeath();

        this.tweens.add({
            targets: this.player,
            scaleX: 1.5,
            scaleY: 1.5,
            duration: 1500,
            ease: 'Power2'
        });

        this.tweens.addCounter({
            from: 255,
            to: 0,
            duration: 2000,
            onUpdate: (tween) => {
                const value = Math.floor(tween.getValue());
                this.tintPlayer(Phaser.Display.Color.GetColor(255, value, value));
            },
            onComplete: () => {
                this.cameras.main.flash(500, 255, 255, 255);

                this.time.delayedCall(500, () => {
                    this.scene.pause();
                    this.populateGameOver();
                });
            }
        });
    }
    
    // Fills + shows the end screen for BOTH outcomes. this.wonGame decides the
    // title/message: win (final boss beaten, even if they later died) vs loss.
    async populateGameOver() {
        this.gameState = 'GAMEOVER';
        if (minigameCountdownInterval) {
            clearInterval(minigameCountdownInterval);
            minigameCountdownInterval = null;
        }
    
        const totalPlayedTimeSec = Math.floor((this.accumulatedTime + totalMinigameTimeMs) / 1000);
        const survivalTimeSec = Math.floor(this.accumulatedTime / 1000);
        const minigameTimeSec = Math.floor(totalMinigameTimeMs / 1000);
        const scoreSec = Math.max(0, survivalTimeSec);
    
        const formatTime = (seconds) => {
            const m = Math.floor(seconds / 60);
            const s = seconds % 60;
            return `${m < 10 ? '0' + m : m}:${s < 10 ? '0' + s : s}`;
        };
    
        document.getElementById('finalLevel').innerText = this.playerStats.level;
        document.getElementById('finalSurvivalTime').innerText = formatTime(totalPlayedTimeSec);
        document.getElementById('finalMinigameTime').innerText = '-' + formatTime(minigameTimeSec);
        document.getElementById('finalScore').innerText = formatTime(scoreSec);
    
        const studentName = typeof selectedStudent !== 'undefined' && selectedStudent ? selectedStudent : '';
        const classInfo = selectedDay && selectedTime ? `${selectedDay} ${selectedTime}` : 'N/A';
        const displayText = studentName ? `${studentName} (${classInfo})` : classInfo;
        document.getElementById('finalContentDisplay').innerText = displayText;
    
        // Win / loss framing (uno/gomoku style, with the student's name)
        const nm = studentName || '同学';
        const titleEl = document.getElementById('gameOverTitle');
        const msgEl = document.getElementById('vsResultMsg');
        if (titleEl) {
            if (this.wonGame) {
                titleEl.innerText = '🏆 挑战成功！';
                titleEl.className = 'text-4xl sm:text-6xl font-bold text-yellow-300 mb-4 text-center';
            } else {
                titleEl.innerText = 'GAME OVER';
                titleEl.className = 'text-4xl sm:text-6xl font-bold text-red-500 mb-4 text-center';
            }
        }
        if (msgEl) {
            msgEl.innerText = this.wonGame
                ? `恭喜 ${nm}！你击败了最终Boss，成为了真正的教室幸存者大师！`
                : `再接再厉，${nm}！下一次一定能击败最终Boss！`;
            msgEl.classList.remove('hidden');
        }
    
        // A win always counts. A loss counts only if the HUD survival time
        // (accumulatedTime — excludes minigame/question overlays, so kids can't
        // idle on a question to pass the 2min) is at least 2 minutes.
        const isSessionIgnored = !this.wonGame && survivalTimeSec < 120;
        if (typeof srGameResults !== 'undefined') {
            finalizeSession(srGameResults, !isSessionIgnored);
        }
        queueSessionEvent('vampireSurvivors', {
            level: this.playerStats.level,
            survivalTimeSec: survivalTimeSec,
            minigameTimeSec: minigameTimeSec,
            scoreSec: scoreSec,
            kills: this.killCount,
            won: this.wonGame,
            ignored: isSessionIgnored
        });
        // FIX (2026-08-25, "Doris refresh"): await delivery (deadline-capped)
        // before showing the end screen so an iOS WebKit page restart can't
        // drop the session record + SR state. See frontend_auth.js.
        if (typeof flushAnalyticsWithDeadline === 'function') await flushAnalyticsWithDeadline(4000);
        else flushAnalyticsOnGameOver();
    
        const targetText = typeof getActiveTargetText === 'function' ? getActiveTargetText() : null;
        const banner = document.getElementById('vs-target-banner');
        if (targetText && banner) {
            banner.innerText = targetText;
            banner.classList.remove('hidden');
        } else if (banner) {
            banner.classList.add('hidden');
        }
    
        const warning = document.getElementById('vsTargetWarning');
        if (warning) {
            if (isSessionIgnored) {
                warning.innerText = "用时不到２分钟且挑战失败，本次练习不计入每周目标。";
                warning.classList.remove('hidden');
            } else {
                warning.classList.add('hidden');
            }
        }
    
        document.getElementById('gameOverScreen').classList.remove('hidden');
    }
    
    // Final boss beaten -> win. Pause and show the victory menu (continue/end).
    onFinalBossDefeated() {
        if (this.wonGame) return;
        this.wonGame = true;
        synthLevelUp();
        this.cameras.main.flash(500, 255, 255, 180);
        this.gameState = 'VICTORY_MENU';
        this.time.delayedCall(600, () => {
            this.scene.pause();
            const vm = document.getElementById('vsVictoryMenu');
            if (vm) vm.classList.remove('hidden');
        });
    }
    
    // "Continue": keep the current build and play on until death (still a win).
    victoryContinue() {
        const vm = document.getElementById('vsVictoryMenu');
        if (vm) vm.classList.add('hidden');
        this.gameState = 'PLAYING';
        this.scene.resume();
    }
    
    // "End": stop here with the win congratulations on the game-over screen.
    victoryEnd() {
        const vm = document.getElementById('vsVictoryMenu');
        if (vm) vm.classList.add('hidden');
        if (window.BGM) BGM.stop();
        this.populateGameOver();
    }
    
    applyReward(reward) {
        if (!reward) return;
        const p = this.playerStats;
        if (reward.type === 'weapon') {
            const existing = p.weapons.find(w => w.type === reward.id);
            if (existing) {
                existing.level++;
                if (reward.id === 'whip') {
                    const speedUpgrades = Math.floor(existing.level / 3);
                    existing.cooldown = Math.max(40, 120 - speedUpgrades * 25);
                }
                if (reward.id === 'ruler') {
                    // Cooldown drops at L5 / L8 / L11 (the 3-cycle's 3rd step)
                    const cdTier = existing.level >= 5 ? Math.floor((existing.level - 2) / 3) : 0;
                    existing.cooldown = Math.max(40, 120 - cdTier * 25);
                }
                if (reward.id === 'wand') existing.cooldown = Math.max(5, existing.cooldown - 8);
                if (reward.id === 'cross') existing.cooldown = Math.max(20, existing.cooldown - 5);
                if (reward.id === 'knife') existing.cooldown = Math.max(5, existing.cooldown - 2);
                if (reward.id === 'orb') existing.range += 20;
            } else {
                if (reward.id === 'whip') p.weapons.push({ type: 'whip', level: 1, timer: 0, cooldown: 120 });
                if (reward.id === 'ruler') p.weapons.push({ type: 'ruler', level: 1, timer: 0, cooldown: 120 });
                if (reward.id === 'wand') p.weapons.push({ type: 'wand', level: 1, timer: 0, cooldown: 60 });
                if (reward.id === 'axe') p.weapons.push({ type: 'axe', level: 1, timer: 0, cooldown: 140 });
                if (reward.id === 'cross') p.weapons.push({ type: 'cross', level: 1, timer: 0, cooldown: 80 });
                if (reward.id === 'orb') p.weapons.push({ type: 'orb', level: 1, angle: 0, range: 100, dmg: 5, timer: 0 });
                if (reward.id === 'water') p.weapons.push({ type: 'water', level: 1, timer: 0, cooldown: 300 });
                if (reward.id === 'knife') p.weapons.push({ type: 'knife', level: 1, timer: 0, cooldown: 60 });
            }
        } else if (reward.type === 'stat') {
            if (reward.id === 'might') p.might += 0.1;
            if (reward.id === 'speed') p.speed += 0.1;
        } else if (reward.type === 'heal') p.hp = Math.min(p.maxHp, p.hp + 30);
        updateDOMHUD(p, Math.floor(this.accumulatedTime / 1000), this.killCount);
    }

    handleResize(gameSize) {
        // HiDPI: the backing buffer is CSS x DPR while VS is active, so the fit
        // zoom is computed from the CSS width and the camera zoom carries DPR
        // (visible world stays identical, just rendered on a bigger buffer).
        const dpr = vsDpr();
        const cssW = gameSize.width / dpr;
        const fit = Phaser.Math.Clamp(cssW / 800, 0.4, 1.0);
        const zoom = fit * dpr;
        this.cameras.main.setZoom(zoom);
        if (this.bg) {
            // scrollFactor(0) cover: size = backing / zoom (== CSS / fit)
            this.bg.setPosition(gameSize.width / 2, gameSize.height / 2);
            this.bg.setSize(gameSize.width / zoom + 100, gameSize.height / zoom + 100);
        }
    }

    // --- HiDPI screen-space helpers -----------------------------------------
    // cw()/ch(): screen size in CSS px (backing is CSS x DPR while VS active).
    // hudX()/hudY(): place a scrollFactor(0) element at a CSS screen coord,
    // compensating for the world camera's zoom pivot (screen centre). Size and
    // X-centering are auto-preserved (display divides out the DPR), so only the
    // vertical/horizontal offset-from-centre needs this correction.
    cw() { return this.scale.width / vsDpr(); }
    ch() { return this.scale.height / vsDpr(); }
    hudX(cssX) {
        const f = (this.cameras.main.zoom / vsDpr()) || 1;
        return this.scale.width / 2 + (cssX - this.cw() / 2) / f;
    }
    hudY(cssY) {
        const f = (this.cameras.main.zoom / vsDpr()) || 1;
        return this.scale.height / 2 + (cssY - this.ch() / 2) / f;
    }
}

registerScene(MainScene);

// --- VS WRAPPER FUNCTIONS ---
// Character select: shown FIRST when the VS game is picked. The chosen hero is
// stored on window.vsSelectedCharacter and read by MainScene.create().
function showVsCharSelect() {
    document.getElementById('startScreen').classList.add('hidden');
    document.getElementById('gameSelectionOverlay').classList.add('hidden');
    document.getElementById('gameIntroOverlay').classList.add('hidden');
    document.getElementById('vsCharSelect').classList.remove('hidden');
    // Swap the static portrait <img>s to cached blob URLs when available
    // (index.html ships plain paths; AssetCache prefetches the portraits).
    if (window.AssetCache) {
        const mon = document.querySelector('#vsCharMonitor img');
        const sk = document.querySelector('#vsCharSkippy img');
        if (mon) mon.src = AssetCache.url('sprites/vs/portrait_monitor.png');
        if (sk) sk.src = AssetCache.url('sprites/vs/portrait_skippy.png');
    }
    selectVsCharacter(window.vsSelectedCharacter || 'monitor');
}

function selectVsCharacter(id) {
    if (!VS_CHARACTERS[id]) id = 'monitor';
    window.vsSelectedCharacter = id;
    const ch = VS_CHARACTERS[id];
    const mon = document.getElementById('vsCharMonitor');
    const sk = document.getElementById('vsCharSkippy');
    if (mon) mon.classList.toggle('vs-char-selected', id === 'monitor');
    if (sk) sk.classList.toggle('vs-char-selected', id === 'skippy');
    const nameEl = document.getElementById('vsCharName');
    const wEl = document.getElementById('vsCharWeapon');
    const iconEl = document.getElementById('vsCharWeaponIcon');
    if (nameEl) nameEl.textContent = ch.name;
    if (wEl) wEl.textContent = '专属武器 Weapon: ' + ch.weaponName;
    if (iconEl) iconEl.src = (window.AssetCache ? window.AssetCache.url('sprites/vs/' + ch.weaponIcon + '.png') : 'sprites/vs/' + ch.weaponIcon + '.png');
}

function startVsFromCharSelect() {
    document.getElementById('vsCharSelect').classList.add('hidden');
    showGameIntro();
}

function showGameIntro() {
    document.getElementById('startScreen').classList.add('hidden');
    document.getElementById('gameSelectionOverlay').classList.add('hidden');
    document.getElementById('gameIntroOverlay').classList.remove('hidden');
}

function startGameFromIntro() {
    document.getElementById('gameIntroOverlay').classList.add('hidden');
    triggerVampireSurvivors();
}

function triggerVampireSurvivors() {
    if (window.PracticeTelemetry) PracticeTelemetry.start('game', 'vampireSurvivors');
    activeGameMode = 'VS';
    
    // Reset SR tracking for this game session
    if (typeof srGameResults !== 'undefined') srGameResults = [];
    if (typeof srInSessionFailures !== 'undefined') srInSessionFailures = new Set();
    if (typeof srInSessionSuccesses !== 'undefined') srInSessionSuccesses = new Set();
    if (typeof srLastServedKey !== 'undefined') srLastServedKey = { vocab: null, sentences: null };
    
    document.getElementById('startScreen').classList.add('hidden');
    document.getElementById('gameIntroOverlay').classList.add('hidden');
    document.getElementById('gameSelectionOverlay').classList.add('hidden');
    document.getElementById('gameOverScreen').classList.add('hidden');
    // Show VS exit button + music mute toggle
    const vsExitBtn = document.getElementById('vsExitBtn');
    if (vsExitBtn) vsExitBtn.classList.remove('hidden');
    const vsMuteBtn = document.getElementById('vsMuteBtn');
    if (vsMuteBtn) vsMuteBtn.classList.remove('hidden');
    const vsMusicBtn = document.getElementById('vsMusicBtn');
    if (vsMusicBtn) vsMusicBtn.classList.remove('hidden');
    initAudio();
    totalMinigameTimeMs = 0;
    // Ensure canvas is visible (may have been hidden by exitVampireSurvivors)
    if (game && game.canvas) {
        game.canvas.style.display = '';
    }
    if (!game) {
        config.parent = document.body;
        game = new Phaser.Game(config);
        game.events.once('ready', () => {
            setTimeout(() => {
                if (game && game.scale) {
                    game.scale.parent = document.body;
                    enterHiDpi(); // backing = CSS x DPR (crisp on phones)
                }
            }, 50);
        });
    } else {
        // Cancel any pending stop from endUno() — prevents stale stop() killing the new scene
        if (typeof window.unoStopTimeout !== 'undefined' && window.unoStopTimeout) {
            clearTimeout(window.unoStopTimeout);
            window.unoStopTimeout = null;
        }

        // Stop all active scenes immediately
        if (game.scene.isActive('UnoScene')) game.scene.stop('UnoScene');
        if (game.scene.isActive('MainScene')) game.scene.stop('MainScene');

        // Move canvas to body
        if (game.scale && typeof game.scale.setParent === 'function') {
            game.scale.setParent(document.body);
        } else {
            document.body.appendChild(game.canvas);
        }

        // Defer BOTH scale.refresh() and scene start into the same setTimeout so that
        // the browser has time to update layout/dimensions before create() reads them.
        setTimeout(() => {
            if (game && game.scale) {
                game.scale.parent = document.body;
                enterHiDpi(); // backing = CSS x DPR (crisp on phones)
            }
            // Always do a fresh start so create() runs and entities spawn correctly
            game.scene.start('MainScene');
        }, 100);
    }
}

function showPowerUpSelection(context) {
    document.getElementById('levelUpMenu').classList.remove('hidden');
    rewardContext = context;
    const container = document.getElementById('powerup-cards-container');
    container.innerHTML = '';

    const scene = game.scene.getScene('MainScene');
    const existingWeapons = scene ? scene.playerStats.weapons : [];

    // Exclusive hero weapons: never offer the OTHER hero's special weapon
    // (Class Monitor never sees the Jump Rope, Skippy never sees the Ruler)
    const myWeapon = (scene && scene.character) ? scene.character.weapon : 'ruler';
    const otherSpecials = Object.values(VS_CHARACTERS).map(c => c.weapon).filter(wid => wid !== myWeapon);
    const pool = POWER_UPS.filter(pu => !otherSpecials.includes(pu.id));

    const shuffled = [...pool].sort(() => 0.5 - Math.random()).slice(0, 3);
    const allGameTypes = ['spelling', 'wordrec', 'scramble', 'sentencematch'];
    const pairings = shuffled.map(reward => {
        const randomGameType = allGameTypes[Math.floor(Math.random() * allGameTypes.length)];
        return { reward, gameType: randomGameType };
    });

    pairings.forEach(({ reward, gameType }) => {
        let description = reward.desc;
        if (reward.id === 'whip') {
            // Jump Rope (Skippy): damage bumps at L2/5/8…, speed at L3/6/9…
            const weapon = existingWeapons.find(w => w.type === 'whip');
            if (weapon) {
                const nextLevel = weapon.level + 1;
                if (nextLevel % 3 === 2) description = "Harder Swing (+Damage)";
                else if (nextLevel % 3 === 0) description = "Faster Skipping (Swing More Often)";
                else description = "Extra Practice (+Power)";
            }
        } else {
            // Other weapons: show the NEXT level's evolution milestone (or the
            // per-level default) so students see what upgrading unlocks
            const weapon = existingWeapons.find(w => w.type === reward.id);
            if (weapon) {
                const nextLevel = weapon.level + 1;
                const ms = (typeof WEAPON_MILESTONES !== 'undefined') &&
                    WEAPON_MILESTONES[reward.id] && WEAPON_MILESTONES[reward.id][nextLevel];
                const defaults = {
                    wand: '+Damage & Bigger Dart',
                    orb: '+1 Eraser & Faster Spin',
                    axe: '+1 Book & Bigger',
                    cross: 'Bigger Boomerang',
                    water: 'Bigger Splash Zone',
                    knife: '+1 Scissors & Bigger',
                    ruler: 'Sharper Ruler (+Damage)'
                };
                description = ms || defaults[reward.id] || reward.desc;
            }
        }

        const card = document.createElement('div');
        card.className = 'card';
        card.onclick = () => {
            pendingReward = reward;
            document.getElementById('levelUpMenu').classList.add('hidden');
            startMiniGame(gameType, context);
        };
        // School-item art on the card; emoji fallback if the PNG is missing.
        // Resolved through AssetCache → instant cached blob in CN, plain path otherwise.
        const itemName = (typeof ITEM_SPRITES !== 'undefined') ? ITEM_SPRITES[reward.id] : null;
        const itemSrc = itemName
            ? (window.AssetCache ? window.AssetCache.url(`sprites/vs/item_${itemName}.png`) : `sprites/vs/item_${itemName}.png`)
            : null;
        const iconHtml = itemName
            ? `<img src="${itemSrc}" alt="" style="height:64px;margin:0 auto 16px;display:block;" onerror="this.outerHTML='<div class=&quot;text-6xl mb-4&quot;>${reward.icon}</div>'">`
            : `<div class="text-6xl mb-4">${reward.icon}</div>`;
        card.innerHTML = `${iconHtml}
                           <h3 class="text-xl font-bold mb-2 text-purple-700">${reward.name}</h3>
                           <p class="text-sm text-gray-500">${description}</p>`;
        container.appendChild(card);
    });
}

// --- VS EXIT & REPLAY FUNCTIONS ---
function exitVampireSurvivors() {
    if (window.PracticeTelemetry) PracticeTelemetry.interrupt('game_exit', false);
    // Stop the VS game and return to game selection
    if (minigameCountdownInterval) {
        clearInterval(minigameCountdownInterval);
        minigameCountdownInterval = null;
    }
    if (game && game.scene && game.scene.isActive('MainScene')) {
        game.scene.stop('MainScene');
    }
    if (typeof exitHiDpi === 'function') exitHiDpi(); // restore CSS-px RESIZE for other games
    // Hide game over screen and HUD if visible
    document.getElementById('gameOverScreen').classList.add('hidden');
    document.getElementById('levelUpMenu').classList.add('hidden');
    // Hide any active mini-game overlays
    ['spellingGame', 'wordRecGame', 'sentenceMatchGame'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    // Hide the Phaser canvas (move off-screen or hide)
    if (game && game.canvas) {
        game.canvas.style.display = 'none';
    }
    // Hide VS exit button + mute toggle
    const vsExitBtn = document.getElementById('vsExitBtn');
    if (vsExitBtn) vsExitBtn.classList.add('hidden');
    const vsMuteBtn = document.getElementById('vsMuteBtn');
    if (vsMuteBtn) vsMuteBtn.classList.add('hidden');
    const vsMusicBtn = document.getElementById('vsMusicBtn');
    if (vsMusicBtn) vsMusicBtn.classList.add('hidden');
    const vsVictory = document.getElementById('vsVictoryMenu');
    if (vsVictory) vsVictory.classList.add('hidden');
    activeGameMode = null;
    document.getElementById('gameSelectionOverlay').classList.remove('hidden');
    if (typeof applyVsPromo === 'function') applyVsPromo();
}

// Victory menu buttons (final boss beaten) route into the running scene
function vsVictoryContinue() {
    const s = (game && game.scene) ? game.scene.getScene('MainScene') : null;
    if (s) s.victoryContinue();
}
function vsVictoryEnd() {
    const s = (game && game.scene) ? game.scene.getScene('MainScene') : null;
    if (s) s.victoryEnd();
}

function replayVampireSurvivors() {
    // Hide game over screen, restart the game
    document.getElementById('gameOverScreen').classList.add('hidden');
    triggerVampireSurvivors();
}
