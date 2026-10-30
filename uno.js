// ============================================================
// UNO CARD GAME - Classroom Survivors ESL Edition (PHASER 3)
// 4 players: 1 human (index 0) + 3 AI (indices 1-3)
// ============================================================

const UNO_COLORS = ['red', 'yellow', 'green', 'blue'];
const UNO_AI_DELAY = 1200;
const UNO_ESL_TIME_LIMIT = 20000;

// Expose these for external UI interactions (ESL, menus)
let unoGameActive = false;
let unoStartTime = 0;
let unoAccumulatedTime = 0;
let unoWinner = null;
let unoESLContext = null;
let unoESLTimerStart = 0;
let unoESLTimedOut = false;
let unoESLTimerInterval = null;

class UnoScene extends Phaser.Scene {
    constructor() {
        super({ key: 'UnoScene' });
    }

    create() {
        this.generateCardTextures();
        
        // Reset camera angle in case a previous game left it tilted
        this.cameras.main.setAngle(0);
                // HiDPI: backing buffer = container x DPR, so render at DPR camera zoom and
                // treat the layout in CSS space (this.scale.width/height are backing px).
                this.cameras.main.setZoom(vsDpr());
                        this.cameras.main.centerOn(this.scale.width / vsDpr() / 2, this.scale.height / vsDpr() / 2);

        const cw = this.scale.width / vsDpr();
        const ch = this.scale.height / vsDpr();
        this.layout = {
            deck: { x: cw / 2 + 70, y: ch / 2 - 20 },
            discard: { x: cw / 2 - 70, y: ch / 2 - 20 },
            playerHandY: ch - 120,
            aiY: [80, 80, 80],
            aiX: [cw * 0.15, cw / 2, cw * 0.85]
        };

        if (!this.textures.exists('uno_particle')) {
            const pt = this.make.graphics({x:0,y:0,add:false});
            pt.fillStyle(0xffffff);
            pt.fillCircle(5, 5, 5);
            pt.generateTexture('uno_particle', 10, 10);
            pt.destroy();
        }

        this.input.on('gameobjectdown', this.onCardClicked, this);
        this.input.on('gameobjectover', this.onCardHover, this);
        this.input.on('gameobjectout', this.onCardOut, this);

        this.scale.on('resize', this.handleResize, this);
        this.events.once('shutdown', () => {
            this.cleanupScene();
        });

        this.initUnoGame();
    }

    handleResize(gameSize) {
        if (!unoGameActive) return;
        this.renderAll();
    }

    generateCardTextures() {
        const sf = 3;
        const w = 90 * sf;
        const h = 135 * sf;
        const r = 12 * sf;
        
        const colors = {
            red: 0xe53935, yellow: 0xfdd835, green: 0x43a047, blue: 0x1e88e5, black: 0x212121
        };

        const drawCard = (key, bgColor, symbol, textColor) => {
            if (this.textures.exists(key)) return;
            
            const rt = this.add.renderTexture(0, 0, w, h);

            // Base white card body
            const gBase = this.make.graphics({add: false});
            gBase.fillStyle(0xffffff, 1);
            gBase.fillRoundedRect(0, 0, w, h, r);
            
            // Soft inner gray border for 3D depth
            gBase.lineStyle(2 * sf, 0xcccccc, 1);
            gBase.strokeRoundedRect(sf, sf, w - 2*sf, h - 2*sf, r - sf);
            
            // Inner colored background
            gBase.fillStyle(bgColor, 1);
            gBase.fillRoundedRect(5 * sf, 5 * sf, w - 10 * sf, h - 10 * sf, r - 3 * sf);
            rt.draw(gBase, 0, 0);
            gBase.destroy();

            // Soft radial top highlight (simulating light source)
            const gHighlight = this.make.graphics({add: false});
            gHighlight.fillStyle(0xffffff, 0.15);
            gHighlight.fillCircle(w / 2, 0, w * 0.7);
            rt.draw(gHighlight);
            gHighlight.destroy();

            // Slanted inner oval (white)
            const gOvalWhite = this.make.graphics({add: false});
            gOvalWhite.fillStyle(0xffffff, 1);
            gOvalWhite.fillEllipse(0, 0, w * 0.85, h * 0.45);
            gOvalWhite.setPosition(w/2, h/2);
            gOvalWhite.setAngle(-25);
            rt.draw(gOvalWhite);
            gOvalWhite.destroy();

            // Slanted inner oval (color)
            const gOvalColor = this.make.graphics({add: false});
            gOvalColor.fillStyle(bgColor, 1);
            gOvalColor.fillEllipse(0, 0, w * 0.75, h * 0.35);
            gOvalColor.setPosition(w/2, h/2);
            gOvalColor.setAngle(-25);
            rt.draw(gOvalColor);
            gOvalColor.destroy();

            // Text / Symbols
            if (symbol) {
                // Main symbol
                const ts = this.add.text(w/2, h/2, symbol, {
                    fontSize: (48 * sf) + 'px', fontStyle: '900', color: textColor, fontFamily: 'Arial Black, Impact, sans-serif'
                }).setOrigin(0.5);
                ts.setStroke('#ffffff', 4 * sf);
                ts.setShadow(2 * sf, 2 * sf, '#000000', 2 * sf, true, false);
                
                // Top-left
                const tl = this.add.text(14 * sf, 18 * sf, symbol, {
                    fontSize: (18 * sf) + 'px', fontStyle: 'bold', color: '#ffffff', fontFamily: 'Arial'
                }).setOrigin(0.5);
                tl.setShadow(1 * sf, 1 * sf, '#000000', 1 * sf);

                // Bottom-right
                const br = this.add.text(w - 14 * sf, h - 18 * sf, symbol, {
                    fontSize: (18 * sf) + 'px', fontStyle: 'bold', color: '#ffffff', fontFamily: 'Arial'
                }).setOrigin(0.5).setAngle(180);
                br.setShadow(1 * sf, 1 * sf, '#000000', 1 * sf);

                rt.draw(ts, w/2, h/2);
                rt.draw(tl, 14 * sf, 18 * sf);
                rt.draw(br, w - 14 * sf, h - 18 * sf);
                
                ts.destroy(); tl.destroy(); br.destroy();
            }

            // Glossy diagonal sheens for plastic reflection
            const gSheen = this.make.graphics({add: false});
            gSheen.fillStyle(0xffffff, 0.07);
            gSheen.beginPath();
            gSheen.moveTo(w * 0.15, 0);
            gSheen.lineTo(w * 0.45, 0);
            gSheen.lineTo(0, h * 0.65);
            gSheen.lineTo(0, h * 0.35);
            gSheen.closePath();
            gSheen.fillPath();

            gSheen.fillStyle(0xffffff, 0.03);
            gSheen.beginPath();
            gSheen.moveTo(w * 0.52, 0);
            gSheen.lineTo(w * 0.60, 0);
            gSheen.lineTo(0, h * 0.85);
            gSheen.lineTo(0, h * 0.77);
            gSheen.closePath();
            gSheen.fillPath();
            rt.draw(gSheen);
            gSheen.destroy();

            rt.saveTexture(key);
            rt.texture = null;
            rt.destroy();
        };

        ['red', 'yellow', 'green', 'blue'].forEach(c => {
            const hex = colors[c];
            const tc = c === 'yellow' ? '#000000' : '#ffffff';
            for (let i=0; i<=9; i++) drawCard(`${c}_${i}`, hex, String(i), tc);
            drawCard(`${c}_skip`, hex, '⊘', tc);
            drawCard(`${c}_reverse`, hex, '⇄', tc);
            drawCard(`${c}_+2`, hex, '+2', tc);
        });

        drawCard('wild', colors.black, 'W', '#ffffff');
        drawCard('p4', colors.black, '+4', '#ffffff');
        
        // Card back texture with premium border & reflection
        if (!this.textures.exists('card_back')) {
            const g2 = this.make.graphics({add: false});
            g2.fillStyle(0xffffff, 1); 
            g2.fillRoundedRect(0, 0, w, h, r);
            g2.lineStyle(2 * sf, 0xcccccc, 1);
            g2.strokeRoundedRect(sf, sf, w - 2*sf, h - 2*sf, r - sf);
            
            g2.fillStyle(0x111111, 1); 
            g2.fillRoundedRect(5 * sf, 5 * sf, w - 10 * sf, h - 10 * sf, r - 3 * sf);
            
            const rt2 = this.add.renderTexture(0, 0, w, h);
            rt2.draw(g2, 0, 0);
            g2.destroy();

            const gHighlight2 = this.make.graphics({add: false});
            gHighlight2.fillStyle(0xffffff, 0.15);
            gHighlight2.fillCircle(w / 2, 0, w * 0.7);
            rt2.draw(gHighlight2);
            gHighlight2.destroy();

            const gOvalRed = this.make.graphics({add: false});
            gOvalRed.fillStyle(0xe53935, 1);
            gOvalRed.fillEllipse(0, 0, w * 0.8, h * 0.5);
            gOvalRed.setPosition(w/2, h/2);
            gOvalRed.setAngle(-25);
            rt2.draw(gOvalRed);
            gOvalRed.destroy();
            
            const textBack = this.add.text(w/2, h/2, 'UNO', { fontSize: (28 * sf) + 'px', fontStyle: '900', color: '#fdd835', fontFamily: 'Arial Black' }).setOrigin(0.5).setAngle(-25);
            textBack.setStroke('#000000', 3 * sf);
            rt2.draw(textBack, w/2, h/2);
            
            // Add sheen to back card too
            const gSheen2 = this.make.graphics({add: false});
            gSheen2.fillStyle(0xffffff, 0.07);
            gSheen2.beginPath();
            gSheen2.moveTo(w * 0.15, 0); gSheen2.lineTo(w * 0.45, 0); gSheen2.lineTo(0, h * 0.65); gSheen2.lineTo(0, h * 0.35); gSheen2.closePath(); gSheen2.fillPath();
            
            gSheen2.fillStyle(0xffffff, 0.03);
            gSheen2.beginPath();
            gSheen2.moveTo(w * 0.52, 0); gSheen2.lineTo(w * 0.60, 0); gSheen2.lineTo(0, h * 0.85); gSheen2.lineTo(0, h * 0.77); gSheen2.closePath(); gSheen2.fillPath();
            rt2.draw(gSheen2);
            gSheen2.destroy();

            rt2.saveTexture('card_back');
            rt2.texture = null;
            rt2.destroy();
            textBack.destroy();
        }
    }

    createDeckData() {
        const d = [];
        UNO_COLORS.forEach(color => {
            d.push({ color, type: 'number', value: 0, tex: `${color}_0` });
            for (let n = 1; n <= 9; n++) {
                d.push({ color, type: 'number', value: n, tex: `${color}_${n}` });
                d.push({ color, type: 'number', value: n, tex: `${color}_${n}` });
            }
            ['skip', 'reverse', '+2'].forEach(t => {
                d.push({ color, type: t, value: null, tex: `${color}_${t}` });
                d.push({ color, type: t, value: null, tex: `${color}_${t}` });
            });
        });
        for (let i = 0; i < 4; i++) {
            d.push({ color: 'black', type: 'wild', value: null, tex: 'wild' });
            d.push({ color: 'black', type: '+4', value: null, tex: 'p4' });
        }
        return d;
    }

    shuffleArr(a) {
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    initUnoGame() {
        this.deck = this.shuffleArr(this.createDeckData());
        this.discard = [];
        this.players = [[], [], [], []];
        this.playerNames = ['You', 'Bot A', 'Bot B', 'Bot C'];
        this.currentPlayer = 0;
        this.direction = 1;
        this.pendingStack = 0;
        this.pendingStackType = null;
        unoWinner = null;
        this.snapEnabled = false;
        this.isProcessing = true; // Block interaction during dealing
        this.freePlay = false;
        this.vulnerable = [false, false, false, false];
        
        unoStartTime = Date.now();
        unoAccumulatedTime = 0;
        if (typeof totalMinigameTimeMs !== 'undefined') totalMinigameTimeMs = 0;
        unoGameActive = true;

        // Kill any lingering tweens and timers from a previous game
        this.clearAllTurnTimers();
        this.tweens.killAll();
        this.cameras.main.setAngle(0);
                // HiDPI: backing buffer = container x DPR, so render at DPR camera zoom and
                // treat the layout in CSS space (this.scale.width/height are backing px).
                this.cameras.main.setZoom(vsDpr());
                        this.cameras.main.centerOn(this.scale.width / vsDpr() / 2, this.scale.height / vsDpr() / 2);

        this.cardSprites = []; // track all active sprites
        this.aiTextSprites = [];

        // Clear existing sprites
        this.children.removeAll();

        this.deckSprite = this.add.image(0, 0, 'card_back').setScale(1 / 3);
        this.deckSprite.setInteractive({ useHandCursor: true }); // for drawing

        // Init AI text
        for(let i=1; i<=3; i++) {
            const txt = this.add.text(0, 0, this.playerNames[i], {
                fontSize: '18px', color: '#ffffff', fontStyle: 'bold'
            }).setOrigin(0.5);
            this.aiTextSprites[i] = txt;
        }

        // Set initial layout positions
        const cw = this.scale.width / vsDpr();
        const ch = this.scale.height / vsDpr();
        this.layout = {
            deck: { x: cw / 2 + 70, y: ch / 2 - 20 },
            discard: { x: cw / 2 - 70, y: ch / 2 - 20 },
            playerHandY: ch - 100,
            aiY: [80, 80, 80],
            aiX: [cw * 0.15, cw / 2, cw * 0.85]
        };
        this.deckSprite.setPosition(this.layout.deck.x, this.layout.deck.y);

        this.renderAll();
        
        if (window.unoTimerInterval) clearInterval(window.unoTimerInterval);
        window.unoTimerInterval = setInterval(() => {
            if (!unoGameActive) return;
            const s = Math.floor((unoAccumulatedTime + Date.now() - unoStartTime) / 1000);
            const el = document.getElementById('uno-timer');
            if (el) el.innerText = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
        }, 1000);

        // Start sequential dealing animation
        this.dealNext(0, () => {
            this.isProcessing = false;
            this.startTurn();
        });
    }

    dealNext(step, cb) {
        if (!unoGameActive) return;
        if (step >= 28) {
            // Dealing finished. Now deal the first discard card.
            let first = this.deck.pop();
            while (first.color === 'black') {
                this.deck.unshift(first);
                this.shuffleArr(this.deck);
                first = this.deck.pop();
            }
            // Animate card from deck to discard
            this.animatePlay(first.tex, this.layout.deck.x, this.layout.deck.y, () => {
                this.discard.push(first);
                
                // Check if first card has immediate effects
                if (first.type === 'skip') this.currentPlayer = 1;
                else if (first.type === 'reverse') { this.direction = -1; this.currentPlayer = 3; }
                else if (first.type === '+2') { this.pendingStack = 2; this.pendingStackType = '+2'; }

                this.renderAll();
                cb();
            });
            return;
        }

        const p = step % 4;
        const card = this.deck.pop();
        
        let destX, destY;
        if (p === 0) {
            const nextHandLen = this.players[0].length + 1;
            const spacing = Math.min(80, (this.scale.width / vsDpr() - 40) / Math.max(1, nextHandLen));
            const startX = this.scale.width / vsDpr() / 2 - ((nextHandLen - 1) * spacing) / 2;
            destX = startX + (nextHandLen - 1) * spacing;
            destY = this.layout.playerHandY;
        } else {
            const nextHandLen = this.players[p].length + 1;
            const ax = this.layout.aiX[p-1];
            const ay = this.layout.aiY[p-1];
            const aiSpace = 10;
            if (nextHandLen <= 10) {
                const aStartX = ax - ((nextHandLen - 1) * aiSpace) / 2;
                destX = aStartX + (nextHandLen - 1) * aiSpace;
            } else {
                destX = ax;
            }
            destY = ay;
        }

        // Create a temporary card_back sprite moving from deck to destination
        const s = this.add.image(this.layout.deck.x, this.layout.deck.y, 'card_back').setScale(p === 0 ? 0.8 / 3 : 0.5 / 3);
        s.setDepth(100 + step);

        if (typeof osc === 'function') {
            // Play a soft card deal sound
            osc('triangle', 350 - p * 30, 0.05, 0.05);
        }

        this.tweens.add({
            targets: s,
            x: destX,
            y: destY,
            angle: p === 0 ? 0 : 180,
            duration: 250,
            ease: 'Quad.easeOut',
            onComplete: () => {
                s.destroy();
                this.players[p].push(card);
                this.renderAll();
                
                // Deal next card after a small delay
                this.time.delayedCall(80, () => this.dealNext(step + 1, cb));
            }
        });
    }

    renderAll() {
        const cw = this.scale.width / vsDpr();
        const ch = this.scale.height / vsDpr();
        this.layout = {
            deck: { x: cw / 2 + 70, y: ch / 2 - 20 },
            discard: { x: cw / 2 - 70, y: ch / 2 - 20 },
            playerHandY: ch - 100,
            aiY: [80, 80, 80],
            aiX: [cw * 0.15, cw / 2, cw * 0.85]
        };

        if (this.deckSprite) {
            this.deckSprite.setPosition(this.layout.deck.x, this.layout.deck.y);
            this.deckSprite.setDepth(10);
            
            // Rebind interactive area safely
            this.deckSprite.disableInteractive();
            this.deckSprite.setInteractive({ useHandCursor: true });
            this.deckSprite.setScale(1 / 3);
        }

        this.cardSprites.forEach(s => s.destroy());
        this.cardSprites = [];

        // Discard pile
        if (this.discard.length > 0) {
            const top = this.discard[this.discard.length - 1];
            const ds = this.add.image(this.layout.discard.x, this.layout.discard.y, top.tex).setScale(1 / 3);
            ds.setDepth(15);
            this.cardSprites.push(ds);
            
            // show chosen color for black cards
            if (top.color === 'black' && top.chosenColor) {
                const colors = { red: 0xe53935, yellow: 0xfdd835, green: 0x43a047, blue: 0x1e88e5 };
                const cg = this.add.graphics();
                cg.fillStyle(colors[top.chosenColor]);
                cg.fillCircle(this.layout.discard.x + 30, this.layout.discard.y - 45, 15);
                cg.lineStyle(2, 0xffffff);
                cg.strokeCircle(this.layout.discard.x + 30, this.layout.discard.y - 45, 15);
                cg.setDepth(16);
                this.cardSprites.push(cg);
            }
        }

        // Human Hand
        const hand = this.players[0];
        const spacing = Math.min(80, (this.scale.width / vsDpr() - 40) / Math.max(1, hand.length));
        const startX = this.scale.width / vsDpr() / 2 - ((hand.length - 1) * spacing) / 2;
        
        const topCard = this.discard[this.discard.length - 1];
        const isMyTurn = this.currentPlayer === 0 && !this.isProcessing;

        hand.forEach((c, i) => {
            const x = startX + i * spacing;
            const s = this.add.image(x, this.layout.playerHandY, c.tex).setScale(1 / 3);
            s.setData('card', c);
            s.setData('index', i);
            s.setData('owner', 0);
            s.setDepth(20 + i);
            
            const ok = isMyTurn && this.canPlay(c, topCard, this.pendingStack, this.pendingStackType);
            const snap = this.currentPlayer !== 0 && this.snapEnabled && this.exactSame(c, topCard);

            if (ok || snap) {
                s.setInteractive({ useHandCursor: true });
                s.y -= 15; // pop up slightly
                // Add glow
                s.preFX.addGlow(ok ? 0xfdd835 : 0x00ffff, 4, 0, false, 0.1, 10);
            } else {
                s.setTint(0x888888); // dim unplayable
            }
            this.cardSprites.push(s);
        });

        // AI Hands
        for (let pi = 1; pi <= 3; pi++) {
            const n = this.players[pi].length;
            const ax = this.layout.aiX[pi-1];
            const ay = this.layout.aiY[pi-1];
            const isActive = this.currentPlayer === pi;
            
            const aiSpace = isActive ? 14 : 10;
            const cardScale = isActive ? (0.6 / 3) : (0.5 / 3);
            const aStartX = ax - ((Math.min(n, 10) - 1) * aiSpace) / 2;

            // Pulsing glow ring behind active bot's cards
            if (isActive) {
                const ring = this.add.graphics();
                ring.lineStyle(3, 0xfdd835, 0.7);
                const ringW = Math.max(80, (Math.min(n, 10) - 1) * aiSpace + 60);
                const ringH = 70;
                ring.strokeRoundedRect(ax - ringW / 2, ay - ringH / 2, ringW, ringH, 16);
                ring.setDepth(3);
                this.cardSprites.push(ring);

                // Animate the ring pulsing
                this.tweens.add({
                    targets: ring,
                    alpha: { from: 0.4, to: 1 },
                    duration: 600,
                    yoyo: true,
                    repeat: -1,
                    ease: 'Sine.easeInOut'
                });
            }
            
            for(let j=0; j<Math.min(n, 10); j++) {
                const bs = this.add.image(aStartX + j*aiSpace, ay, 'card_back').setScale(cardScale);
                bs.setDepth(5 + j);
                if (isActive) {
                    bs.preFX.addGlow(0xfdd835, 4, 0, false, 0.1, 10);
                }
                this.cardSprites.push(bs);
            }
            if (n > 10) {
                const txt = this.add.text(ax, ay + 45, `+${n-10}`, {fontSize:'16px', color:'#fff', fontStyle:'bold'}).setOrigin(0.5);
                this.cardSprites.push(txt);
            }

            if (this.aiTextSprites[pi]) {
                this.aiTextSprites[pi].setPosition(ax, ay - 70);
                if (this.vulnerable[pi]) {
                    this.aiTextSprites[pi].setText(this.playerNames[pi] + " ⚠️").setColor('#ff4444');
                    this.aiTextSprites[pi].setFontSize('18px');
                    this.aiTextSprites[pi].disableInteractive();

                    // Create a beautiful, pulsing red "NO UNO!" button below their cards
                    const catchBtn = this.add.text(ax, ay + 50, 'NO UNO! 🚨', {
                        fontSize: '11px',
                        fontStyle: 'bold',
                        color: '#ffffff',
                        backgroundColor: '#dc2626', // Tailwind red-600
                        padding: { x: 10, y: 5 },
                        fontFamily: 'Arial, sans-serif'
                    }).setOrigin(0.5);
                    catchBtn.setDepth(50);
                    catchBtn.setInteractive({ useHandCursor: true });

                    // Hover effects
                    catchBtn.on('pointerover', () => catchBtn.setBackgroundColor('#ef4444'));
                    catchBtn.on('pointerout', () => catchBtn.setBackgroundColor('#dc2626'));

                    // Handle catching bot
                    catchBtn.once('pointerdown', () => this.time.delayedCall(0, () => {
                        catchBtn.destroy();
                        this.humanCatchBot(pi);
                    }));

                    // Add to cardSprites array so it is automatically cleared during renderAll
                    this.cardSprites.push(catchBtn);

                    // Add a pulsing zoom animation to draw attention
                    this.tweens.add({
                        targets: catchBtn,
                        scaleX: 1.15,
                        scaleY: 1.15,
                        duration: 500,
                        yoyo: true,
                        repeat: -1,
                        ease: 'Sine.easeInOut'
                    });
                } else if (isActive) {
                    this.aiTextSprites[pi].setText('▶ ' + this.playerNames[pi] + ' ▶').setColor('#fdd835');
                    this.aiTextSprites[pi].setFontSize('20px');
                    this.aiTextSprites[pi].disableInteractive();
                } else {
                    this.aiTextSprites[pi].setText(this.playerNames[pi]).setColor('#ffffff');
                    this.aiTextSprites[pi].setFontSize('18px');
                    this.aiTextSprites[pi].disableInteractive();
                }
            }
        }

        this.updateDOMStatus();
    }

    updateDOMStatus() {
        const elDir = document.getElementById('uno-direction');
        if (elDir) elDir.innerText = this.direction === 1 ? '🔄 →' : '🔄 ←';
        const elStack = document.getElementById('uno-stack');
        if (elStack) {
            if (this.pendingStack > 0) { elStack.innerText = '⚡ +' + this.pendingStack; elStack.classList.remove('hidden'); } 
            else elStack.classList.add('hidden');
        }
        
        // Add Draw Button logic if human has no playable cards
        const hand = this.players[0];
        const topCard = this.discard[this.discard.length - 1];
        const isMyTurn = this.currentPlayer === 0 && !this.isProcessing;
        
        let existingBtn = document.getElementById('uno-draw-btn-overlay');
        if (existingBtn) existingBtn.remove();

        if (isMyTurn) {
            const playable = hand.some(c => this.canPlay(c, topCard, this.pendingStack, this.pendingStackType));
            if (!playable) {
                const btn = document.createElement('button');
                btn.id = 'uno-draw-btn-overlay';
                btn.className = 'fixed bottom-40 left-1/2 transform -translate-x-1/2 z-50 text-white font-bold py-3 px-8 rounded-full shadow-lg';
                if (this.pendingStack > 0) {
                    btn.classList.add('bg-red-600', 'hover:bg-red-500');
                    btn.innerText = `Draw ${this.pendingStack} 📥`;
                    btn.onclick = () => this.humanDrawPending();
                } else {
                    btn.classList.add('bg-orange-600', 'hover:bg-orange-500');
                    btn.innerText = `I can't play 🚫`;
                    btn.onclick = () => this.humanDeclareNoPlay();
                }
                document.getElementById('unoScreen').appendChild(btn);
            }
        }

        if (this.vulnerable[0]) {
            let sayBtn = document.getElementById('uno-say-btn-overlay');
            if (!sayBtn) {
                sayBtn = document.createElement('button');
                sayBtn.id = 'uno-say-btn-overlay';
                sayBtn.className = 'fixed bottom-52 left-1/2 transform -translate-x-1/2 z-50 bg-yellow-400 hover:bg-yellow-300 text-black font-black text-4xl px-12 py-6 rounded-full border-4 border-white animate-pulse shadow-[0_0_50px_rgba(250,204,21,1)]';
                sayBtn.innerText = 'SAY UNO! 📣';
                sayBtn.onclick = () => {
                    this.vulnerable[0] = false;
                    sayBtn.remove();
                    this.playUnoSaySound();
                    this.unoCallout(0);
                    this.renderAll();
                };
                document.getElementById('unoScreen').appendChild(sayBtn);
            }
        } else {
            const sayBtn = document.getElementById('uno-say-btn-overlay');
            if (sayBtn) sayBtn.remove();
        }
    }

    onCardHover(pointer, gameObject) {
        if (gameObject.getData('card') && gameObject.getData('owner') === 0) {
            this.tweens.add({ targets: gameObject, y: this.layout.playerHandY - 40, duration: 150, ease: 'Quad.easeOut' });
        }
    }

    onCardOut(pointer, gameObject) {
        if (gameObject.getData('card') && gameObject.getData('owner') === 0) {
            this.tweens.add({ targets: gameObject, y: this.layout.playerHandY - 15, duration: 150, ease: 'Quad.easeOut' });
        }
    }

    onCardClicked(pointer, gameObject) {
        if (gameObject === this.deckSprite) {
            // Deck clicked
            if (this.currentPlayer === 0 && !this.isProcessing && this.pendingStack === 0) {
                const hand = this.players[0];
                const topCard = this.discard[this.discard.length - 1];
                if (!hand.some(c => this.canPlay(c, topCard, 0, null))) {
                    this.time.delayedCall(0, () => this.humanDeclareNoPlay());
                }
            }
            return;
        }

        const idx = gameObject.getData('index');
        const owner = gameObject.getData('owner');
        if (owner === 0 && idx !== undefined) {
            const card = this.players[0][idx];
            const topCard = this.discard[this.discard.length - 1];
            
            if (this.currentPlayer === 0 && !this.isProcessing) {
                if (this.canPlay(card, topCard, this.pendingStack, this.pendingStackType)) {
                    this.time.delayedCall(0, () => this.humanPlay(idx));
                } else {
                    this.cameras.main.shake(200, 0.01);
                    if (typeof synthError === 'function') synthError();
                }
            } else if (this.currentPlayer !== 0 && !this.isProcessing && this.snapEnabled && this.exactSame(card, topCard)) {
                this.time.delayedCall(0, () => this.humanSnapCard(idx));
            }
        }
    }

    effColor(c) { return c.chosenColor || c.color; }

    cardMatchesTop(card, top) {
        if (card.color === 'black') return true;
        if (card.color === this.effColor(top)) return true;
        if (card.type === 'number' && top.type === 'number' && card.value === top.value) return true;
        if (card.type !== 'number' && card.type === top.type) return true;
        return false;
    }

    canPlay(card, top, stack, sType) {
        if (this.freePlay && stack <= 0) return true;
        if (stack > 0) {
            if (top.type === 'reverse') {
                if (card.type !== 'reverse') return false;
                if (sType === '+2') return card.color === this.effColor(top);
                if (sType === '+4') return true;
                return false;
            }
            if (sType === '+2') {
                if (card.type === '+2') return true;
                if (card.type === 'reverse' && card.color === this.effColor(top)) return true;
                return false;
            }
            if (sType === '+4') {
                if (card.type === '+4') return true;
                if (card.type === 'reverse') return true;
                return false;
            }
        }
        return this.cardMatchesTop(card, top);
    }

    exactSame(a, b) {
        return a.type === 'number' && b.type === 'number' && a.color === b.color && a.value === b.value;
    }

    clearAllTurnTimers() {
        if (this.turnTimers) {
            this.turnTimers.forEach(t => {
                if (t) t.destroy();
            });
        }
        this.turnTimers = [];
    }

    addTurnTimer(t) {
        if (!this.turnTimers) this.turnTimers = [];
        this.turnTimers.push(t);
        return t;
    }

    startTurn() {
        if (!unoGameActive || unoWinner !== null) return;
        this.clearAllTurnTimers();
        this.isProcessing = false;
        const p = this.currentPlayer;
        const hand = this.players[p];
        const top = this.discard[this.discard.length - 1];

        if (p === 0) {
            this.snapEnabled = false;
            if (this.pendingStack > 0) {
                if (!hand.some(c => this.canPlay(c, top, this.pendingStack, this.pendingStackType))) {
                    this.setStatus('Stack: +' + this.pendingStack + '! You must click Draw.');
                } else {
                    this.setStatus('Stack: +' + this.pendingStack + '! Play a card.');
                }
            } else {
                if (!hand.some(c => this.canPlay(c, top, 0, null))) {
                    this.setStatus('No playable card! Click "I can\'t play" or Deck.');
                } else {
                    this.setStatus('Your turn! Click a glowing card.');
                }
            }
            this.renderAll();
        } else {
            this.snapEnabled = true;
            this.setStatus(this.playerNames[p] + "'s turn...");
            this.renderAll();
            this.addTurnTimer(this.time.delayedCall(UNO_AI_DELAY, () => this.aiTurn(p)));
        }
    }

    setStatus(m) { 
        const el = document.getElementById('uno-status'); 
        if (el) el.innerText = m; 
    }

    animatePlay(cardTex, startX, startY, cb) {
        const sprite = this.add.image(startX, startY, cardTex).setScale(1 / 3);
        sprite.setDepth(100);
        this.tweens.add({
            targets: sprite,
            x: this.layout.discard.x,
            y: this.layout.discard.y,
            angle: Phaser.Math.Between(-25, 25),
            duration: 350,
            ease: 'Cubic.easeOut',
            onComplete: () => {
                sprite.destroy();
                if (cb) cb();
            }
        });
    }

    animateDraw(pi, amount, cb) {
        let count = 0;
        let destX = this.scale.width / 2;
        let destY = this.layout.playerHandY;
        if (pi > 0) {
            destX = this.layout.aiX[pi-1];
            destY = this.layout.aiY[pi-1];
        }

        for (let i = 0; i < amount; i++) {
            this.time.delayedCall(i * 120, () => {
                const s = this.add.image(this.layout.deck.x, this.layout.deck.y, 'card_back').setScale(0.8 / 3);
                s.setDepth(100 + i);
                
                // Play gunshot sound and shake camera per card
                this.playUnoDrawCardSound();
                this.cameras.main.shake(80, 0.004 + (amount > 3 ? 0.002 : 0));

                this.tweens.add({
                    targets: s, x: destX, y: destY, angle: 180, duration: 300, ease: 'Quad.easeInOut',
                    onComplete: () => {
                        s.destroy();
                        count++;
                        if (count === amount && cb) cb();
                    }
                });
            });
        }
        if (amount === 0 && cb) cb();
    }

    humanPlay(idx) {
        this.isProcessing = true;
        this.freePlay = false;
        this.resolveUnoVulnerabilities(() => {
            const card = this.players[0].splice(idx, 1)[0];
            const spacing = Math.min(80, (this.scale.width / vsDpr() - 40) / Math.max(1, this.players[0].length));
            const startX = this.scale.width / vsDpr() / 2 - ((this.players[0].length) * spacing) / 2 + idx * spacing;
            
            this.renderAll(); // refresh hand

            this.animatePlay(card.tex, startX, this.layout.playerHandY, () => {
                this.handleCardEffect(0, card);
            });
        });
    }

    handleCardEffect(pi, card) {
        if (this.pendingStack > 0 && card.type === 'reverse') {
            this.discard.push(card);
            this.playUnoReverseSound();
            this.animateReverseCamera();
            this.direction *= -1;
            this.setStatus((pi === 0 ? 'You' : this.playerNames[pi]) + ' reversed the +' + this.pendingStack + '!');
            if (this.checkEnd(pi)) return;
            this.renderAll(); 
            
            const nextPlayer = (this.currentPlayer + this.direction + 4) % 4;
            this.addTurnTimer(this.time.delayedCall(1000, () => {
                this.currentPlayer = nextPlayer;
                this.startTurn();
            }));
            return;
        }

        if (card.color === 'black') {
            if (card.type === '+4') { this.pendingStack += 4; this.pendingStackType = '+4'; }
            card.originalColor = 'black';
            this.discard.push(card);
            
            // Auto-assign random fallback color (so game won't lock if turn is skipped/failed)
            const cArr = ['red', 'yellow', 'green', 'blue'];
            card.chosenColor = cArr[Math.floor(Math.random() * cArr.length)];
            this.afterPlayEffect(pi, card);
            return;
        }

        this.discard.push(card);
        this.afterPlayEffect(pi, card);
    }

    afterPlayEffect(pi, card) {
        if (card.type === '+2') { this.pendingStack += 2; this.pendingStackType = '+2'; }
        
        let localDirection = this.direction;
        if (card.type === 'reverse') { 
            this.playUnoReverseSound();
            this.animateReverseCamera();
            this.direction *= -1; 
            localDirection = this.direction;
        }
        
        let steps = 1;
        if (card.type === 'skip') { 
            this.playUnoSkipSound();
            const skipped = (this.currentPlayer + localDirection + 4) % 4;
            this.animateSkipPlayer(skipped);
            steps = 2; 
        }
        
        if (this.checkEnd(pi)) return;
        this.renderAll();

        // ESL Check
        if ((card.color === 'black' || card.originalColor === 'black') && card.type !== '+4') {
            // Particle burst for wild
            this.burstParticles(this.layout.discard.x, this.layout.discard.y, 0xffffff);
            if (pi === 0) {
                this.tensionBlackCardESL(); 
            } else {
                this.tensionBlackCardESL(); 
            }
            return;
        }

        if (card.type === '+4') {
            this.burstParticles(this.layout.discard.x, this.layout.discard.y, 0xff0000);
        }

        // Calculate the next player, but don't set it to this.currentPlayer yet so the active player stays highlighted
        const nextPlayer = (this.currentPlayer + steps * localDirection + 4) % 4;
        
        let delay = (this.currentPlayer !== 0) ? 700 : 500;
        if (card.type === 'skip' || card.type === 'reverse' || card.type === '+2' || card.type === '+4') {
            delay += 500;
        }
        this.addTurnTimer(this.time.delayedCall(delay, () => {
            // Clear vulnerability if they missed the catch window
            if (pi > 0 && this.vulnerable[pi]) {
                this.vulnerable[pi] = false;
            }
            this.currentPlayer = nextPlayer;
            this.startTurn();
        }));
    }

    animateReverseCamera() {
        // Tween a dummy object to tilt camera angle and snap back
        const dummy = { angle: 0 };
        this.tweens.add({
            targets: dummy,
            angle: 3,
            duration: 200,
            ease: 'Quad.easeOut',
            onUpdate: () => {
                this.cameras.main.setAngle(dummy.angle);
            },
            onComplete: () => {
                dummy.angle = -6;
                this.tweens.add({
                    targets: dummy,
                    angle: 0,
                    duration: 350,
                    ease: 'Back.easeOut',
                    onUpdate: () => {
                        this.cameras.main.setAngle(dummy.angle);
                    },
                    onComplete: () => {
                        this.cameras.main.setAngle(0);
                                // HiDPI: backing buffer = container x DPR, so render at DPR camera zoom and
                                // treat the layout in CSS space (this.scale.width/height are backing px).
                                this.cameras.main.setZoom(vsDpr());
                                        this.cameras.main.centerOn(this.scale.width / vsDpr() / 2, this.scale.height / vsDpr() / 2);
                    }
                });
            }
        });
    }

    animateSkipPlayer(skippedPi) {
        // Find card sprites belonging to the skipped player and shake them
        const targets = this.cardSprites.filter(s => {
            if (skippedPi === 0) return s.y > this.layout.playerHandY - 50;
            const ax = this.layout.aiX[skippedPi - 1];
            return Math.abs(s.x - ax) < 120 && s.y < 150;
        });

        if (targets.length === 0) return;

        const origPositions = targets.map(s => ({ x: s.x, y: s.y }));
        let phase = 0;
        const shakeTimer = this.time.addEvent({
            delay: 30,
            repeat: 8,
            callback: () => {
                phase++;
                const offset = Math.sin(phase * Math.PI * 1.5) * 6;
                targets.forEach((s, i) => {
                    s.x = origPositions[i].x + offset;
                });
                if (phase >= 8) {
                    targets.forEach((s, i) => {
                        s.x = origPositions[i].x;
                    });
                }
            }
        });
        this.addTurnTimer(shakeTimer);
    }

    burstParticles(x, y, color) {
        const emitter = this.add.particles(0, 0, 'uno_particle', {
            x: x, y: y,
            speed: { min: 100, max: 400 },
            angle: { min: 0, max: 360 },
            scale: { start: 1, end: 0 },
            tint: color,
            lifespan: 800,
            quantity: 40,
            emitting: false
        });
        emitter.explode();
        this.time.delayedCall(1000, () => emitter.destroy());
    }

    humanSnapCard(idx) {
        // Cancel any pending AI actions/timers before executing snap
        this.clearAllTurnTimers();
        this.isProcessing = true;
        this.snapEnabled = false;
        this.resolveUnoVulnerabilities(() => {
            this.playUnoSnapSound();
            
            this.addTurnTimer(this.time.delayedCall(500, () => {
                const card = this.players[0].splice(idx, 1)[0];
                const spacing = Math.min(80, (this.scale.width / vsDpr() - 40) / Math.max(1, this.players[0].length));
                const startX = this.scale.width / vsDpr() / 2 - ((this.players[0].length) * spacing) / 2 + idx * spacing;
                
                this.renderAll();
                this.burstParticles(startX, this.layout.playerHandY, 0xfacc15);

                this.animatePlay(card.tex, startX, this.layout.playerHandY, () => {
                    this.discard.push(card);
                    this.playUnoSnapImpactSound();
                    
                    // Camera shake and explosion graphics
                    this.cameras.main.shake(250, 0.008);
                    
                    const ring1 = this.add.graphics();
                    ring1.lineStyle(4, 0xfacc15, 1);
                    ring1.strokeCircle(0, 0, 10);
                    ring1.setPosition(this.layout.discard.x, this.layout.discard.y);
                    ring1.setDepth(200);

                    this.tweens.add({
                        targets: ring1,
                        scaleX: 6, scaleY: 6,
                        alpha: 0,
                        duration: 500,
                        ease: 'Quad.easeOut',
                        onComplete: () => ring1.destroy()
                    });

                    const ring2 = this.add.graphics();
                    ring2.lineStyle(2, 0xffffff, 0.8);
                    ring2.strokeCircle(0, 0, 15);
                    ring2.setPosition(this.layout.discard.x, this.layout.discard.y);
                    ring2.setDepth(201);

                    this.tweens.add({
                        targets: ring2,
                        scaleX: 8, scaleY: 8,
                        alpha: 0,
                        delay: 80,
                        duration: 600,
                        ease: 'Quad.easeOut',
                        onComplete: () => ring2.destroy()
                    });

                    this.setStatus('SNAP! 🎯');
                    if (this.checkEnd(0)) return;
                    this.renderAll();
                    this.currentPlayer = 0; // Snap steals turn
                    const nextPlayer = (this.currentPlayer + this.direction + 4) % 4;
                    this.addTurnTimer(this.time.delayedCall(500, () => {
                        this.currentPlayer = nextPlayer;
                        this.startTurn();
                    }));
                });
            }));
        });
    }

    drawCards(pi, n, cb) {
        if (n > 0 && typeof osc === 'function') osc('triangle', 600, 0.1);
        for (let i = 0; i < n; i++) {
            if (this.deck.length === 0) {
                const t = this.discard.pop();
                this.deck = this.shuffleArr([...this.discard]);
                this.deck.forEach(c => { delete c.chosenColor; delete c.originalColor; });
                this.discard = [t];
            }
            if (this.deck.length > 0) this.players[pi].push(this.deck.pop());
        }
        if (cb) cb();
    }

    humanDrawPending() {
        this.isProcessing = true;
        this.resolveUnoVulnerabilities(() => {
            const a = this.pendingStack;
            
            this.addTurnTimer(this.time.delayedCall(500, () => {
                this.animateDraw(0, a, () => {
                    this.drawCards(0, a);
                    this.pendingStack = 0; 
                    this.pendingStackType = null;
                    this.setStatus('You drew ' + a + ' cards!');
                    this.renderAll();
                    
                    const nextPlayer = (this.currentPlayer + this.direction + 4) % 4;
                    this.addTurnTimer(this.time.delayedCall(1000, () => {
                        this.currentPlayer = nextPlayer;
                        this.startTurn();
                    }));
                });
            }));
        });
    }

    humanDeclareNoPlay() {
        this.isProcessing = true;
        this.resolveUnoVulnerabilities(() => {
            this.setStatus('Answering question...');
            this.triggerUnoESL('draw');
        });
    }

    aiTurn(pi) {
        if (!unoGameActive || unoWinner !== null) return;
        const hand = this.players[pi];
        const top = this.discard[this.discard.length - 1];

        this.resolveUnoVulnerabilities(() => {
            if (this.pendingStack > 0) {
                const opts = hand.map((c, i) => ({ c, i })).filter(({ c }) => this.canPlay(c, top, this.pendingStack, this.pendingStackType));
                if (opts.length > 0) {
                    const pk = opts[0]; const card = pk.c;
                    hand.splice(pk.i, 1);
                    this.renderAll();

                    this.animatePlay('card_back', this.layout.aiX[pi-1], this.layout.aiY[pi-1], () => {
                        this.handleCardEffect(pi, card);
                    });
                } else {
                    const wasPlus4 = this.pendingStackType === '+4';
                    this.setStatus(this.playerNames[pi] + ' drew ' + this.pendingStack + ' cards!');
                    
                    this.addTurnTimer(this.time.delayedCall(500, () => {
                        this.animateDraw(pi, this.pendingStack, () => {
                            this.drawCards(pi, this.pendingStack);
                            this.pendingStack = 0; this.pendingStackType = null;
                            this.renderAll();
                            if (wasPlus4) {
                                this.addTurnTimer(this.time.delayedCall(800, () => this.tensionBlackCardESL()));
                            } else {
                                const nextPlayer = (this.currentPlayer + this.direction + 4) % 4;
                                this.addTurnTimer(this.time.delayedCall(1000, () => {
                                    this.currentPlayer = nextPlayer;
                                    this.startTurn();
                                }));
                            }
                        });
                    }));
                }
                return;
            }

            const playable = hand.map((c, i) => ({ c, i })).filter(({ c }) => this.canPlay(c, top, 0, null));
            if (playable.length === 0) {
                this.setStatus(this.playerNames[pi] + ' drew a card.');
                
                this.addTurnTimer(this.time.delayedCall(200, () => {
                    this.animateDraw(pi, 1, () => {
                        this.drawCards(pi, 1);
                        this.renderAll();
                        const nextPlayer = (this.currentPlayer + this.direction + 4) % 4;
                        let delay = (this.currentPlayer !== 0) ? 700 : 500;
                        this.addTurnTimer(this.time.delayedCall(delay, () => {
                            this.currentPlayer = nextPlayer;
                            this.startTurn();
                        }));
                    });
                }));
                return;
            }

            const colM = playable.filter(({ c }) => c.color === this.effColor(top) && c.color !== 'black');
            const oth = playable.filter(({ c }) => c.color !== 'black' && c.color !== this.effColor(top));
            const wld = playable.filter(({ c }) => c.color === 'black');
            let pk;
            if (colM.length) pk = colM[Math.floor(Math.random() * colM.length)];
            else if (oth.length) pk = oth[Math.floor(Math.random() * oth.length)];
            else pk = wld[Math.floor(Math.random() * wld.length)];

            const card = pk.c;
            hand.splice(pk.i, 1);
            this.renderAll();

            this.animatePlay('card_back', this.layout.aiX[pi-1], this.layout.aiY[pi-1], () => {
                this.handleCardEffect(pi, card);
            });
        });
    }

    checkEnd(pi) {
        if (this.players[pi].length === 1) {
            this.vulnerable[pi] = true;
            this.renderAll();
        }
        if (this.players[pi].length === 0) {
            unoWinner = pi; 
            this.renderAll(); 
            this.time.delayedCall(800, () => this.endUno(pi)); 
            return true;
        }
        return false;
    }

    nextUP() { this.currentPlayer = (this.currentPlayer + this.direction + 4) % 4; }

    resolveUnoVulnerabilities(cb) {
        if (this.vulnerable[0]) {
            this.vulnerable[0] = false;
            this.playUnoCatchSound();
            this.setStatus('You forgot to say UNO! You drew 2 penalty cards!');
            
            this.addTurnTimer(this.time.delayedCall(500, () => {
                this.animateDraw(0, 2, () => {
                    this.drawCards(0, 2);
                    this.renderAll();
                    this.addTurnTimer(this.time.delayedCall(500, () => {
                        if (cb) cb();
                    }));
                });
            }));
            return;
        }
        for (let i = 1; i <= 3; i++) {
            if (this.vulnerable[i]) {
                this.vulnerable[i] = false;
            }
        }
        if (cb) cb();
    }

    humanCatchBot(pi) {
        if (!this.vulnerable[pi] || !unoGameActive) return;
        this.vulnerable[pi] = false;
        
        // Cancel any pending turn timers (AI delays, turn transitions) immediately!
        this.clearAllTurnTimers();
        
        this.playUnoCatchSound();
        this.setStatus('CAUGHT ' + this.playerNames[pi] + '! They drew 2 cards!');
        this.isProcessing = true;
        this.renderAll(); // Re-render to clear "NO UNO!" button instantly
        
        // Wait 1000ms (1 second pause) before starting drawing animation
        this.addTurnTimer(this.time.delayedCall(1000, () => {
            this.animateDraw(pi, 2, () => {
                this.drawCards(pi, 2);
                this.renderAll();
                
                // Wait another 500ms after drawing before letting the game continue
                this.addTurnTimer(this.time.delayedCall(500, () => {
                    this.isProcessing = false;
                    
                    // Now advance the turn to the next player
                    const nextPlayer = (this.currentPlayer + this.direction + 4) % 4;
                    this.currentPlayer = nextPlayer;
                    this.startTurn();
                }));
            });
        }));
    }

    unoCallout(pi) {
        const el = document.getElementById('uno-callout');
        if (!el) return;
        el.innerText = this.playerNames[pi] + ': UNO! 🎉';
        el.classList.remove('hidden');
        el.style.animation = 'none'; el.offsetHeight; el.style.animation = '';
        if (typeof osc === 'function') osc('sine', 880, 0.3, 0.15);
        
        let px = this.scale.width / 2;
        let py = this.layout.playerHandY;
        if (pi > 0) { px = this.layout.aiX[pi-1]; py = this.layout.aiY[pi-1]; }
        this.burstParticles(px, py, 0xfdd835);

        setTimeout(() => el.classList.add('hidden'), 2500);
    }

    // --- Audio Wrappers ---
    playUnoDrawCardSound() {
        if (typeof audioCtx !== 'undefined' && audioCtx) {
            // Gunshot synth
            // Noise burst (body)
            const bufferSize = audioCtx.sampleRate * 0.08; // 80ms
            const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }
            const noise = audioCtx.createBufferSource();
            noise.buffer = buffer;

            const noiseFilter = audioCtx.createBiquadFilter();
            noiseFilter.type = 'lowpass';
            noiseFilter.frequency.setValueAtTime(400, audioCtx.currentTime);

            const noiseGain = audioCtx.createGain();
            noiseGain.gain.setValueAtTime(0, audioCtx.currentTime);
            noiseGain.gain.linearRampToValueAtTime(0.6, audioCtx.currentTime + 0.002);
            noiseGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);

            noise.connect(noiseFilter);
            noiseFilter.connect(noiseGain);
            noiseGain.connect(sfxDest());

            // Click transient (crack)
            const oscNode = audioCtx.createOscillator();
            oscNode.type = 'sawtooth';
            oscNode.frequency.setValueAtTime(180, audioCtx.currentTime);

            const oscGain = audioCtx.createGain();
            oscGain.gain.setValueAtTime(0, audioCtx.currentTime);
            oscGain.gain.linearRampToValueAtTime(0.4, audioCtx.currentTime + 0.001);
            oscGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.025);

            oscNode.connect(oscGain);
            oscGain.connect(sfxDest());

            noise.start();
            oscNode.start();
            noise.stop(audioCtx.currentTime + 0.08);
            oscNode.stop(audioCtx.currentTime + 0.03);
        } else if (typeof osc === 'function') {
            osc('triangle', 200, 0.3, 0.08);
        }
    }
    playUnoSkipSound() {
        if (typeof audioCtx !== 'undefined' && audioCtx) {
            // Heavy metal prison door clang
            // Layer 1: Clang impact
            const osc1 = audioCtx.createOscillator();
            osc1.type = 'square';
            osc1.frequency.setValueAtTime(120, audioCtx.currentTime);
            osc1.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.08);

            const filter1 = audioCtx.createBiquadFilter();
            filter1.type = 'bandpass';
            filter1.frequency.setValueAtTime(150, audioCtx.currentTime);
            filter1.Q.setValueAtTime(5, audioCtx.currentTime);

            const gain1 = audioCtx.createGain();
            gain1.gain.setValueAtTime(0.7, audioCtx.currentTime);
            gain1.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);

            osc1.connect(filter1);
            filter1.connect(gain1);
            gain1.connect(sfxDest());

            // Layer 2: Metallic high ring
            const osc2 = audioCtx.createOscillator();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(900, audioCtx.currentTime);

            const gain2 = audioCtx.createGain();
            gain2.gain.setValueAtTime(0.3, audioCtx.currentTime);
            gain2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.6);

            osc2.connect(gain2);
            gain2.connect(sfxDest());

            // Layer 3: Lock bolt click at 80ms
            const bufferSize = audioCtx.sampleRate * 0.02; // 20ms
            const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }
            const noise = audioCtx.createBufferSource();
            noise.buffer = buffer;

            const noiseGain = audioCtx.createGain();
            noiseGain.gain.setValueAtTime(0, audioCtx.currentTime);
            noiseGain.gain.setValueAtTime(0.5, audioCtx.currentTime + 0.08);
            noiseGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);

            noise.connect(noiseGain);
            noiseGain.connect(sfxDest());

            osc1.start();
            osc2.start();
            noise.start();

            osc1.stop(audioCtx.currentTime + 0.4);
            osc2.stop(audioCtx.currentTime + 0.6);
            noise.stop(audioCtx.currentTime + 0.11);
        } else if (typeof osc === 'function') {
            osc('sawtooth', 150, 0.3, 0.1); setTimeout(() => osc('sawtooth', 100, 0.3, 0.2), 100);
        }
    }
    playUnoReverseSound() {
        if (typeof audioCtx !== 'undefined' && audioCtx) {
            // Layer 1: whoosh directional sweep (600ms total)
            const osc1 = audioCtx.createOscillator();
            osc1.type = 'sawtooth';
            osc1.frequency.setValueAtTime(80, audioCtx.currentTime);
            osc1.frequency.linearRampToValueAtTime(400, audioCtx.currentTime + 0.2);
            osc1.frequency.linearRampToValueAtTime(60, audioCtx.currentTime + 0.4);
            osc1.frequency.linearRampToValueAtTime(350, audioCtx.currentTime + 0.6);

            const filter1 = audioCtx.createBiquadFilter();
            filter1.type = 'bandpass';
            filter1.frequency.setValueAtTime(300, audioCtx.currentTime);
            filter1.Q.setValueAtTime(2, audioCtx.currentTime);

            const gain1 = audioCtx.createGain();
            gain1.gain.setValueAtTime(0, audioCtx.currentTime);
            gain1.gain.linearRampToValueAtTime(0.25, audioCtx.currentTime + 0.3);
            gain1.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.6);

            osc1.connect(filter1);
            filter1.connect(gain1);
            gain1.connect(sfxDest());

            // Layer 2: impact thud at 300ms
            const bufferSize = audioCtx.sampleRate * 0.06; // 60ms
            const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }
            const noise = audioCtx.createBufferSource();
            noise.buffer = buffer;

            const noiseFilter = audioCtx.createBiquadFilter();
            noiseFilter.type = 'lowpass';
            noiseFilter.frequency.setValueAtTime(200, audioCtx.currentTime);

            const noiseGain = audioCtx.createGain();
            noiseGain.gain.setValueAtTime(0, audioCtx.currentTime);
            noiseGain.gain.setValueAtTime(0.5, audioCtx.currentTime + 0.3);
            noiseGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.36);

            noise.connect(noiseFilter);
            noiseFilter.connect(noiseGain);
            noiseGain.connect(sfxDest());

            // Layer 3: rubber band spring tone at 300ms
            const osc3 = audioCtx.createOscillator();
            osc3.type = 'sine';
            osc3.frequency.setValueAtTime(220, audioCtx.currentTime + 0.3);
            osc3.frequency.exponentialRampToValueAtTime(80, audioCtx.currentTime + 0.45);

            const gain3 = audioCtx.createGain();
            gain3.gain.setValueAtTime(0, audioCtx.currentTime);
            gain3.gain.setValueAtTime(0.3, audioCtx.currentTime + 0.3);
            gain3.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);

            osc3.connect(gain3);
            gain3.connect(sfxDest());

            osc1.start();
            osc3.start();
            noise.start();

            osc1.stop(audioCtx.currentTime + 0.6);
            osc3.stop(audioCtx.currentTime + 0.5);
            noise.stop(audioCtx.currentTime + 0.37);
        } else if (typeof osc === 'function') {
            osc('sine', 300, 0.3, 0.3);
        }
    }
    playUnoCatchSound() {
        const audio = new Audio('audio_mp3/Haha Nelson.mp3');
        audio.volume = 0.5;
        audio.play().catch(e => console.error("Haha Nelson play failed: ", e));
    }
    playUnoSnapSound() {
        const audio = new Audio('audio_mp3/Oh yeah.mp3');
        audio.volume = 0.4; // Slightly reduced volume so synth layers nicely
        audio.play().catch(e => console.error("Oh yeah play failed: ", e));
    }
    playUnoSnapImpactSound() {
        if (typeof audioCtx !== 'undefined' && audioCtx) {
            // Layer 1: explosion crack
            const bufferSize = audioCtx.sampleRate * 0.4;
            const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }
            
            // Low boom
            const oscLow = audioCtx.createOscillator();
            oscLow.type = 'sine';
            oscLow.frequency.setValueAtTime(60, audioCtx.currentTime);
            
            const lowGain = audioCtx.createGain();
            lowGain.gain.setValueAtTime(0.6, audioCtx.currentTime);
            lowGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
            
            oscLow.connect(lowGain);
            lowGain.connect(sfxDest());
            
            // High sizzle tail
            const sizzleSource = audioCtx.createBufferSource();
            sizzleSource.buffer = buffer;
            
            const sizzleFilter = audioCtx.createBiquadFilter();
            sizzleFilter.type = 'highpass';
            sizzleFilter.frequency.setValueAtTime(3000, audioCtx.currentTime);
            
            const sizzleGain = audioCtx.createGain();
            sizzleGain.gain.setValueAtTime(0.3, audioCtx.currentTime);
            sizzleGain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
            
            sizzleSource.connect(sizzleFilter);
            sizzleFilter.connect(sizzleGain);
            sizzleGain.connect(sfxDest());
            
            oscLow.start();
            sizzleSource.start();
            oscLow.stop(audioCtx.currentTime + 0.3);
            sizzleSource.stop(audioCtx.currentTime + 0.4);
        }
    }
    playUnoSaySound() { if (typeof osc === 'function') { osc('sine', 600, 0.2, 0.1); setTimeout(() => osc('sine', 800, 0.2, 0.2), 100); } }

    // --- ESL ---
    tensionBlackCardESL() {
        this.isProcessing = true;
        this.snapEnabled = false;
        document.getElementById('unoTensionOverlay').classList.remove('hidden');
        let count = 3;
        document.getElementById('unoTensionCountdown').innerText = count;
        if (typeof osc === 'function') { osc('triangle', 300, 0.4, 0.3); setTimeout(() => osc('square', 250, 0.4, 0.4), 100); }

        const iv = setInterval(() => {
            count--;
            if (count > 0) {
                document.getElementById('unoTensionCountdown').innerText = count;
                if (typeof osc === 'function') osc('triangle', 300 + (3 - count) * 50, 0.4, 0.2);
            } else {
                clearInterval(iv);
                document.getElementById('unoTensionOverlay').classList.add('hidden');
                if (typeof osc === 'function') osc('square', 600, 0.3, 0.4);
                this.triggerUnoESL('black');
            }
        }, 1000);
    }

    triggerUnoESL(ctx) {
        unoESLContext = ctx; unoESLTimedOut = false;
        unoESLTimerStart = Date.now();
        unoAccumulatedTime += (Date.now() - unoStartTime);
        this.snapEnabled = false;
        document.getElementById('unoESLOverlay').classList.remove('hidden');
        this.updateUnoESLDisplay();
        if (unoESLTimerInterval) clearInterval(unoESLTimerInterval);
        unoESLTimerInterval = setInterval(() => this.updateUnoESLDisplay(), 100);
        const types = ['spelling', 'wordrec', 'scramble', 'sentencematch'];
        if (typeof startMiniGame === 'function') {
            startMiniGame(types[Math.floor(Math.random() * types.length)], 'uno');
        }
    }

    updateUnoESLDisplay() {
        const rem = Math.max(0, UNO_ESL_TIME_LIMIT - (Date.now() - unoESLTimerStart));
        const s = Math.ceil(rem / 1000);
        const el = document.getElementById('uno-esl-timer');
        if (el) { el.innerText = '⏱ ' + s + 's'; el.style.color = s <= 5 ? '#ef4444' : '#fdd835'; }
        if (rem <= 0 && !unoESLTimedOut) unoESLTimedOut = true;
    }

    handleESLResult(success) {
        if (unoESLTimerInterval) { clearInterval(unoESLTimerInterval); unoESLTimerInterval = null; }
        document.getElementById('unoESLOverlay').classList.add('hidden');
        const timedOut = (Date.now() - unoESLTimerStart) > UNO_ESL_TIME_LIMIT;
        unoStartTime = Date.now();

        if (unoESLContext === 'draw') {
            if (!timedOut) { 
                this.setStatus('Correct in time! Drew 1 card.');
                this.animateDraw(0, 1, () => {
                    this.drawCards(0, 1);
                    const nextPlayer = (this.currentPlayer + this.direction + 4) % 4;
                    this.renderAll();
                    this.addTurnTimer(this.time.delayedCall(500, () => {
                        this.currentPlayer = nextPlayer;
                        this.startTurn();
                    }));
                });
            } else { 
                this.setStatus('Too slow! Drew 2 cards.');
                this.animateDraw(0, 2, () => {
                    this.drawCards(0, 2);
                    const nextPlayer = (this.currentPlayer + this.direction + 4) % 4;
                    this.renderAll();
                    this.addTurnTimer(this.time.delayedCall(500, () => {
                        this.currentPlayer = nextPlayer;
                        this.startTurn();
                    }));
                });
            }
        } else {
            if (!timedOut) {
                this.freePlay = true; 
                this.setStatus('Correct! Play any card!');
                this.currentPlayer = 0; this.renderAll(); this.addTurnTimer(this.time.delayedCall(500, () => this.startTurn()));
            } else {
                this.setStatus('Too slow! Drew 1 card.');
                this.freePlay = true; 
                this.animateDraw(0, 1, () => {
                    this.drawCards(0, 1);
                    this.currentPlayer = 0;
                    const nextPlayer = (this.currentPlayer + this.direction + 4) % 4;
                    this.renderAll();
                    this.addTurnTimer(this.time.delayedCall(500, () => {
                        this.currentPlayer = nextPlayer;
                        this.startTurn();
                    }));
                });
            }
        }
    }

    async endUno(winner) {
        unoGameActive = false;
        if (window.unoTimerInterval) clearInterval(window.unoTimerInterval);
        unoAccumulatedTime += (Date.now() - unoStartTime);

        const t = document.getElementById('unoResultTitle'), m = document.getElementById('unoResultMsg');
        const nm = (typeof selectedStudent !== 'undefined' && selectedStudent) ? selectedStudent : 'Player';
        if (winner === 0) {
            t.innerText = 'You Won! 🎉'; t.className = 'text-4xl font-bold mb-4 text-green-400';
            m.innerText = 'Congratulations, ' + nm + '! You are an UNO Master!'; 
            if (typeof synthLevelUp === 'function') synthLevelUp();
        } else {
            t.innerText = 'Game Over'; t.className = 'text-4xl font-bold mb-4 text-red-500';
            m.innerText = this.playerNames[winner] + ' won. Better luck next time, ' + nm + '!'; 
            if (typeof synthDeath === 'function') synthDeath();
        }
        const f = s => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
        const gs = Math.floor(unoAccumulatedTime / 1000);
        let qs = 0;
        if (typeof totalMinigameTimeMs !== 'undefined') qs = Math.floor(totalMinigameTimeMs / 1000);
        
        document.getElementById('unoGameTime').innerText = f(gs);
        document.getElementById('unoQuestTime').innerText = f(qs);
        document.getElementById('unoTotalTime').innerText = f(gs + qs);

        const isSessionIgnored = (winner !== 0 && (gs + qs) < 120);
        if (typeof srGameResults !== 'undefined' && typeof finalizeSession === 'function') {
            finalizeSession(srGameResults, !isSessionIgnored);
        }
        if (typeof queueSessionEvent === 'function') {
            queueSessionEvent('uno', {
                winner: winner,
                winnerName: winner === 0 ? nm : this.playerNames[winner],
                gameTimeSec: gs,
                questTimeSec: qs,
                totalTimeSec: gs + qs,
                ignored: isSessionIgnored
            });
        }
        // FIX (2026-08-25, "Doris refresh"): await delivery (deadline-capped)
        // before showing the game-over screen so an iOS WebKit page restart
        // can't drop the session record. See frontend_auth.js for details.
        if (typeof flushAnalyticsWithDeadline === 'function') await flushAnalyticsWithDeadline(4000);
        else if (typeof flushAnalyticsOnGameOver === 'function') flushAnalyticsOnGameOver(); else if (typeof flushAnalytics === 'function') flushAnalytics();

        const targetText = typeof getActiveTargetText === 'function' ? getActiveTargetText() : null;
        const targetBanner = document.getElementById('uno-target-banner');
        if (targetText && targetBanner) {
            targetBanner.innerText = targetText;
            targetBanner.classList.remove('hidden');
        } else if (targetBanner) {
            targetBanner.classList.add('hidden');
        }

        const warning = document.getElementById('unoTargetWarning');
        if (warning) {
            if (isSessionIgnored) {
                warning.innerText = "用时不到2分钟且挑战失败，本次练习不计入每周目标。";
                warning.classList.remove('hidden');
            } else {
                warning.classList.add('hidden');
            }
        }

        document.getElementById('unoScreen').classList.add('hidden');
        document.getElementById('unoGameOverScreen').classList.remove('hidden');

        // Store the stop timeout handle so triggerUno/triggerVS can cancel it if user clicks replay quickly.
        // This prevents a stale stop() from killing a freshly restarted scene.
        if (window.unoStopTimeout) clearTimeout(window.unoStopTimeout);
        window.unoStopTimeout = setTimeout(() => {
            window.unoStopTimeout = null;
            if (game && game.scene && game.scene.isActive('UnoScene')) {
                game.scene.stop('UnoScene');
            }
        }, 200);
    }

    cleanupScene() {
        // Clear all pending turn timers
        this.clearAllTurnTimers();
        // Kill all active tweens (camera tilt, card animations, etc.)
        if (this.tweens) {
            this.tweens.killAll();
        }
        // Reset camera angle to zero (animateReverseCamera may have left it tilted)
        if (this.cameras && this.cameras.main) {
            this.cameras.main.setAngle(0);
                    // HiDPI: backing buffer = container x DPR, so render at DPR camera zoom and
                    // treat the layout in CSS space (this.scale.width/height are backing px).
                    this.cameras.main.setZoom(vsDpr());
                            this.cameras.main.centerOn(this.scale.width / vsDpr() / 2, this.scale.height / vsDpr() / 2);
        }
        // Remove resize listener
        if (this.scale) {
            this.scale.off('resize', this.handleResize, this);
        }
    }
}

registerScene(UnoScene);

// Global hooks
function completeUnoESLQuestion(success) {
    if (game && game.scene.isActive('UnoScene')) {
        const scene = game.scene.getScene('UnoScene');
        scene.handleESLResult(success);
    }
}

function triggerUno() {
    if (window.PracticeTelemetry) PracticeTelemetry.start('game', 'uno');
    activeGameMode = 'Uno';
    // Re-show the shared Phaser canvas: showGameSelection()/exitVampireSurvivors()
    // set display:none to hide it on the menu, and triggerUno never restored it,
    // so a VS -> menu -> UNO path rendered UNO onto a hidden canvas (invisible cards).
    if (typeof game !== 'undefined' && game && game.canvas) game.canvas.style.display = '';
    if (typeof srGameResults !== 'undefined') srGameResults = [];
    if (typeof srInSessionFailures !== 'undefined') srInSessionFailures = new Set();
    if (typeof srInSessionSuccesses !== 'undefined') srInSessionSuccesses = new Set();
    if (typeof srLastServedKey !== 'undefined') srLastServedKey = { vocab: null, sentences: null };
    
    ['startScreen', 'gameSelectionOverlay', 'gomokuScreen', 'gomokuGameOverScreen',
        'gomokuModeSelectionOverlay', 'gomokuDifficultySelectionOverlay',
        'gameOverScreen', 'gameIntroOverlay', 'studyModeOverlay', 'unoGameOverScreen'
    ].forEach(id => { const e = document.getElementById(id); if (e) e.classList.add('hidden'); });
    
    document.getElementById('unoScreen').classList.remove('hidden');
    document.getElementById('unoTensionOverlay').classList.add('hidden');
    if (typeof initAudio === 'function') initAudio();

    if (!game) {
        config.parent = 'uno-phaser-container';
        game = new Phaser.Game(config);
        game.events.once('ready', () => {
            game.scene.stop('MainScene');
            setTimeout(() => {
                if (game && game.scale) {
                    const parentEl = document.getElementById('uno-phaser-container');
                    // HiDPI: render UNO crisp into its container (backing = container x DPR)
                    if (typeof enterHiDpi === 'function') { enterHiDpi(parentEl); }
                    else { game.scale.parent = parentEl; game.scale.parentIsWindow = false; if (parentEl) game.scale.resize(parentEl.clientWidth, parentEl.clientHeight); game.scale.refresh(); }
                }
                game.scene.start('UnoScene');
            }, 50);
        });
    } else {
        // Cancel any pending stop from endUno()
        if (window.unoStopTimeout) { clearTimeout(window.unoStopTimeout); window.unoStopTimeout = null; }

        // Stop scenes
        if (game.scene.isActive('MainScene')) game.scene.stop('MainScene');
        if (game.scene.isActive('UnoScene')) game.scene.stop('UnoScene');

        // Move canvas to container
        const parentEl = document.getElementById('uno-phaser-container');
        if (game.scale && typeof game.scale.setParent === 'function') {
            game.scale.setParent(parentEl);
        } else {
            parentEl.appendChild(game.canvas);
        }

        // Defer refresh and start
        setTimeout(() => {
            // HiDPI: render UNO crisp into its container (backing = container x DPR)
            if (typeof enterHiDpi === 'function') { enterHiDpi(parentEl); }
            else if (game && game.scale) { game.scale.parent = parentEl; game.scale.parentIsWindow = false; if (parentEl) game.scale.resize(parentEl.clientWidth, parentEl.clientHeight); game.scale.refresh(); }
            game.scene.start('UnoScene');
        }, 50);
    }
}

function exitUnoGame() {
    if (window.PracticeTelemetry) PracticeTelemetry.interrupt('game_exit', false);
    console.log('[DEBUG] exitUnoGame called, game:', !!game, 'isActive:', (game && game.scene) ? game.scene.isActive('UnoScene') : false);
    unoGameActive = false;
    if (window.unoTimerInterval) clearInterval(window.unoTimerInterval);
    // Cancel any pending stop from endUno()
    if (window.unoStopTimeout) { clearTimeout(window.unoStopTimeout); window.unoStopTimeout = null; }
    if (game && game.scene && game.scene.isActive('UnoScene')) {
        console.log('[DEBUG] stopping UnoScene...');
        game.scene.stop('UnoScene');
    }
    document.getElementById('unoScreen').classList.add('hidden');
    document.getElementById('gameSelectionOverlay').classList.remove('hidden');
    if (typeof applyVsPromo === 'function') applyVsPromo();
}
