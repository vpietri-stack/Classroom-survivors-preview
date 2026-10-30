// --- GOMOKU GAME DATA ---
let gomokuBoard = [];
const BOARD_SIZE = 15;
let gomokuCanvas, gomokuCtx;
let gomokuGameActive = false;
let gomokuTurn = 'player'; // 'player' or 'ai'
let gomokuStartTime = 0;
let gomokuAccumulatedTime = 0;
let lastGomokuMove = null;
let gomokuMode = 'regular';
let gomokuSpeedInterval = null;
let currentGomokuSpeedIntervalTime = 10000;
let gomokuNextAiTime = 0;

let isGomokuDragging = false;
let gomokuDragCell = null;
let dragInitialized = false;
const TOUCH_Y_OFFSET = 40; // pixels above the finger for touch placement

let gomokuViewport = { minR: 3, maxR: 11, minC: 3, maxC: 11 };

// --- GOMOKU INITIALIZATION ---
let gomokuDifficulty = 'hard';

function showGomokuDifficultySelection() {
    document.getElementById('gomokuModeSelectionOverlay').classList.add('hidden');
    document.getElementById('gomokuDifficultySelectionOverlay').classList.remove('hidden');

    const easyBtn = document.getElementById('gomokuEasyBtn');
    const easyNote = document.getElementById('gomokuEasyNote');
    if (easyBtn) {
        let isPu1 = false;
        if (typeof authActiveUser !== 'undefined' && authActiveUser && authActiveUser.book) {
            if (authActiveUser.book === 'PU1') {
                isPu1 = true;
            }
        } else if (typeof selectedClassContent !== 'undefined' && selectedClassContent) {
            const book = selectedClassContent.book;
            if (book === 'PU1') {
                isPu1 = true;
            }
        }

        const hasActiveStudent = (typeof authActiveUser !== 'undefined' && authActiveUser) || (typeof selectedStudent !== 'undefined' && selectedStudent);

        if (!hasActiveStudent || isPu1) {
            easyBtn.disabled = false;
            easyBtn.className = "game-btn text-xl bg-blue-600 hover:bg-blue-500 w-full py-4 rounded-xl shadow-lg transform active:scale-95 transition-all";
            easyBtn.innerText = "Easy (Good for kids)";
            if (easyNote) {
                easyNote.classList.add('hidden');
            }
        } else {
            easyBtn.disabled = true;
            easyBtn.className = "game-btn text-xl bg-gray-500 w-full py-4 rounded-xl shadow-lg transform cursor-not-allowed opacity-50";
            easyBtn.innerText = "Easy (PU1 only)";
            if (easyNote) {
                easyNote.innerText = "简单模式仅限 PU1 学生。";
                easyNote.classList.remove('hidden');
            }
        }
    }
}

function startGameWithDifficulty(diff) {
    gomokuDifficulty = diff;
    triggerGomoku('regular');
}

function showGomokuModeSelection() {
    document.getElementById('gameSelectionOverlay').classList.add('hidden');
    document.getElementById('gomokuModeSelectionOverlay').classList.remove('hidden');
}

function triggerGomoku(mode = gomokuMode) {
    if (window.PracticeTelemetry) PracticeTelemetry.start('game', 'gomoku');
    if (mode) gomokuMode = mode;
    activeGameMode = 'Gomoku';
    // Undo VS HiDPI if it was active (drops the HiDPI window-resize listener);
    // Gomoku uses its own 2D canvas but this keeps the shared Phaser canvas clean.
    if (typeof exitHiDpi === 'function') exitHiDpi();
    
    // Reset SR tracking for this game session
    if (typeof srGameResults !== 'undefined') srGameResults = [];
    if (typeof srInSessionFailures !== 'undefined') srInSessionFailures = new Set();
    if (typeof srInSessionSuccesses !== 'undefined') srInSessionSuccesses = new Set();
    if (typeof srLastServedKey !== 'undefined') srLastServedKey = { vocab: null, sentences: null };
    
    document.getElementById('startScreen').classList.add('hidden');
    document.getElementById('gameSelectionOverlay').classList.add('hidden');
    document.getElementById('gomokuModeSelectionOverlay').classList.add('hidden');
    const diffOverlay = document.getElementById('gomokuDifficultySelectionOverlay');
    if (diffOverlay) diffOverlay.classList.add('hidden');
    document.getElementById('gomokuGameOverScreen').classList.add('hidden');
    document.getElementById('gomokuScreen').classList.remove('hidden');

    initAudio();
    initGomokuBoard();

    if (gomokuSpeedInterval) clearInterval(gomokuSpeedInterval);

    gomokuCanvas = document.getElementById('gomokuCanvas');
    gomokuCtx = gomokuCanvas.getContext('2d');

    if (!dragInitialized) {
        initDragAndDrop();
        dragInitialized = true;
        // Rotation/resize adaptivity: the board redraws (and re-derives its
        // HiDPI backing from the new clientWidth) as soon as the window size
        // changes, instead of waiting for the next move.
        window.addEventListener('resize', () => { if (gomokuGameActive) drawGomokuBoard(); });
    }

    gomokuGameActive = true;
    gomokuTurn = 'player';
    gomokuAccumulatedTime = 0;
    totalMinigameTimeMs = 0;
    gomokuStartTime = Date.now();

    if (gomokuMode === 'speed') {
        currentGomokuSpeedIntervalTime = getGomokuSpeedInterval();
        const seconds = currentGomokuSpeedIntervalTime / 1000;
        updateGomokuStatus(`Speed Mode! AI plays every ${seconds}s`);
        gomokuNextAiTime = Date.now() + currentGomokuSpeedIntervalTime;
        gomokuSpeedInterval = setInterval(speedAiTurn, currentGomokuSpeedIntervalTime);
    } else {
        updateGomokuStatus("Your turn!");
    }

    drawGomokuBoard();

    if (window.gomokuTimerInterval) clearInterval(window.gomokuTimerInterval);
    window.gomokuTimerInterval = setInterval(updateGomokuTimer, 100);
}

function initGomokuBoard() {
    gomokuBoard = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(0));
    lastGomokuMove = null;
    gomokuViewport = { minR: 3, maxR: 11, minC: 3, maxC: 11 };
}

function expandGomokuViewport(r, c) {
    let changed = false;
    // Zoom out if piece is on the edge of current view
    if (r <= gomokuViewport.minR && gomokuViewport.minR > 0) { gomokuViewport.minR--; changed = true; }
    if (r >= gomokuViewport.maxR && gomokuViewport.maxR < BOARD_SIZE - 1) { gomokuViewport.maxR++; changed = true; }
    if (c <= gomokuViewport.minC && gomokuViewport.minC > 0) { gomokuViewport.minC--; changed = true; }
    if (c >= gomokuViewport.maxC && gomokuViewport.maxC < BOARD_SIZE - 1) { gomokuViewport.maxC++; changed = true; }
    if (changed) drawGomokuBoard();
}

function updateGomokuTimer() {
    if (!gomokuGameActive) return;
    const now = Date.now();
    let displayStr = "";

    if (gomokuMode === 'speed') {
        const timeLeftMs = Math.max(0, gomokuNextAiTime - now);
        const totalSec = Math.floor(timeLeftMs / 1000);
        const m = Math.floor(totalSec / 60);
        const s = totalSec % 60;
        const ms = Math.floor((timeLeftMs % 1000) / 10);
        displayStr = `AI Move: ${m < 10 ? '0' + m : m}:${s < 10 ? '0' + s : s}:${ms < 10 ? '0' + ms : ms}`;
    } else {
        if (gomokuTurn === 'minigame') {
            // While in minigame, just show the accumulated time
            const totalSec = Math.floor(gomokuAccumulatedTime / 1000);
            const m = Math.floor(totalSec / 60);
            const s = totalSec % 60;
            displayStr = `Game: ${m < 10 ? '0' + m : m}:${s < 10 ? '0' + s : s}`;
        } else {
            const totalSec = Math.floor((gomokuAccumulatedTime + (now - gomokuStartTime)) / 1000);
            const m = Math.floor(totalSec / 60);
            const s = totalSec % 60;
            displayStr = `Game: ${m < 10 ? '0' + m : m}:${s < 10 ? '0' + s : s}`;
        }
    }
    document.getElementById('gomoku-timer').innerText = displayStr;
}

function updateGomokuStatus(msg) {
    document.getElementById('gomoku-status').innerText = msg;
}

// --- RENDERING ---
function drawGomokuBoard() {
    // HiDPI + device-adaptive sizing. The DISPLAY size must be independent of
    // the backing attribute: the markup's `max-w-full h-auto` sizes the element
    // from its INTRINSIC (attribute) size, so inflating the backing for DPR
    // also grew the on-screen board on wide screens (iPad: board ballooned
    // past 600 -> "too zoomed in"). Pinning style width to 600px (capped at
    // 100% of the container) reproduces the ORIGINAL pre-HiDPI layout exactly
    // on every device/orientation — display = min(600, container) — while the
    // backing becomes display x DPR (capped 2) purely for crispness. No
    // feedback loop: layout no longer reads the width attribute at all.
    if (gomokuCanvas.style.width !== '600px') {
        gomokuCanvas.style.width = '600px';
        gomokuCanvas.style.maxWidth = '100%';
        gomokuCanvas.style.height = 'auto'; // square attrs keep the 1:1 aspect
    }
    const dpr = (typeof vsDpr === 'function') ? vsDpr() : Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const cssSize = gomokuCanvas.clientWidth || 600;
    const want = Math.round(cssSize * dpr);
    if (want > 0 && gomokuCanvas.width !== want) { gomokuCanvas.width = want; gomokuCanvas.height = want; }
    const size = gomokuCanvas.width;
    const padding = 30;

    const viewWidth = gomokuViewport.maxC - gomokuViewport.minC + 1;
    const viewHeight = gomokuViewport.maxR - gomokuViewport.minR + 1;
    const visibleCount = Math.max(viewWidth, viewHeight);
    const cellSize = (size - padding * 2) / (visibleCount - 1);

    gomokuCtx.clearRect(0, 0, size, size);

    // Grid
    gomokuCtx.strokeStyle = '#5d2b06';
    gomokuCtx.lineWidth = 1;

    for (let r = gomokuViewport.minR; r <= gomokuViewport.maxR; r++) {
        const y = padding + (r - gomokuViewport.minR) * cellSize;
        gomokuCtx.beginPath();
        gomokuCtx.moveTo(padding, y);
        gomokuCtx.lineTo(size - padding, y);
        gomokuCtx.stroke();
    }
    for (let c = gomokuViewport.minC; c <= gomokuViewport.maxC; c++) {
        const x = padding + (c - gomokuViewport.minC) * cellSize;
        gomokuCtx.beginPath();
        gomokuCtx.moveTo(x, padding);
        gomokuCtx.lineTo(x, size - padding);
        gomokuCtx.stroke();
    }

    // Star points
    const stars = [3, 7, 11];
    gomokuCtx.fillStyle = '#5d2b06';
    stars.forEach(r => {
        if (r < gomokuViewport.minR || r > gomokuViewport.maxR) return;
        stars.forEach(c => {
            if (c < gomokuViewport.minC || c > gomokuViewport.maxC) return;
            const x = padding + (c - gomokuViewport.minC) * cellSize;
            const y = padding + (r - gomokuViewport.minR) * cellSize;
            gomokuCtx.beginPath();
            gomokuCtx.arc(x, y, 4, 0, Math.PI * 2);
            gomokuCtx.fill();
        });
    });

    // Pieces
    for (let r = gomokuViewport.minR; r <= gomokuViewport.maxR; r++) {
        for (let c = gomokuViewport.minC; c <= gomokuViewport.maxC; c++) {
            if (gomokuBoard[r][c] !== 0) {
                drawPiece(r, c, gomokuBoard[r][c] === 1 ? 'black' : 'white');
            }
        }
    }

    // Drag Preview
    if (gomokuDragCell) {
        drawPiece(gomokuDragCell.r, gomokuDragCell.c, 'preview');
    }

    // Last move indicator
    if (lastGomokuMove) {
        if (lastGomokuMove.r >= gomokuViewport.minR && lastGomokuMove.r <= gomokuViewport.maxR &&
            lastGomokuMove.c >= gomokuViewport.minC && lastGomokuMove.c <= gomokuViewport.maxC) {
            const x = padding + (lastGomokuMove.c - gomokuViewport.minC) * cellSize;
            const y = padding + (lastGomokuMove.r - gomokuViewport.minR) * cellSize;
            gomokuCtx.strokeStyle = 'red';
            gomokuCtx.lineWidth = 2;
            gomokuCtx.beginPath();
            gomokuCtx.arc(x, y, cellSize * 0.4, 0, Math.PI * 2);
            gomokuCtx.stroke();
        }
    }
}

function drawPiece(r, c, color) {
    const size = gomokuCanvas.width;
    const padding = 30;
    const viewWidth = gomokuViewport.maxC - gomokuViewport.minC + 1;
    const viewHeight = gomokuViewport.maxR - gomokuViewport.minR + 1;
    const visibleCount = Math.max(viewWidth, viewHeight);
    const cellSize = (size - padding * 2) / (visibleCount - 1);

    const x = padding + (c - gomokuViewport.minC) * cellSize;
    const y = padding + (r - gomokuViewport.minR) * cellSize;

    gomokuCtx.shadowBlur = 4;
    gomokuCtx.shadowColor = 'rgba(0,0,0,0.5)';
    gomokuCtx.shadowOffsetY = 2;

    const grad = gomokuCtx.createRadialGradient(x - cellSize * 0.1, y - cellSize * 0.1, cellSize * 0.05, x, y, cellSize * 0.4);
    if (color === 'black') {
        grad.addColorStop(0, '#666');
        grad.addColorStop(1, '#000');
    } else if (color === 'preview') {
        gomokuCtx.globalAlpha = 0.6;
        grad.addColorStop(0, '#999');
        grad.addColorStop(1, '#333');
        // Add a highlight ring for preview
        gomokuCtx.strokeStyle = '#fff';
        gomokuCtx.lineWidth = 2;
        gomokuCtx.beginPath();
        gomokuCtx.arc(x, y, cellSize * 0.45, 0, Math.PI * 2);
        gomokuCtx.stroke();
    } else {
        grad.addColorStop(0, '#fff');
        grad.addColorStop(1, '#ccc');
    }

    gomokuCtx.fillStyle = grad;
    gomokuCtx.beginPath();
    gomokuCtx.arc(x, y, cellSize * 0.4, 0, Math.PI * 2);
    gomokuCtx.fill();

    gomokuCtx.shadowBlur = 0;
    gomokuCtx.shadowOffsetY = 0;
    gomokuCtx.globalAlpha = 1.0;
}

// --- GAME LOGIC ---
function initDragAndDrop() {
    const stash = document.getElementById('gomoku-piece-stash');
    const ghost = document.getElementById('gomoku-ghost-piece');

    const startDrag = (e) => {
        if (!gomokuGameActive || (gomokuMode === 'regular' && gomokuTurn !== 'player')) return;
        if (gomokuTurn === 'minigame') return;

        isGomokuDragging = true;
        ghost.classList.remove('hidden');
        moveGhost(e);

        if (e.type === 'touchstart') e.preventDefault();
    };

    const moveGhost = (e) => {
        if (!isGomokuDragging) return;

        const isTouch = e.type === 'touchmove' || e.type === 'touchstart';
        const clientX = e.clientX || (e.touches && e.touches[0] && e.touches[0].clientX);
        const rawClientY = e.clientY || (e.touches && e.touches[0] && e.touches[0].clientY);

        if (clientX === undefined || rawClientY === undefined) return;

        // Apply offset for touch so the piece appears above the finger
        const clientY = isTouch ? rawClientY - TOUCH_Y_OFFSET : rawClientY;

        ghost.style.left = (clientX - 20) + 'px';
        ghost.style.top = (clientY - 20) + 'px';

        const rect = gomokuCanvas.getBoundingClientRect();
        if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
            const scaleX = gomokuCanvas.width / rect.width;
            const scaleY = gomokuCanvas.height / rect.height;
            const x = (clientX - rect.left) * scaleX;
            const y = (clientY - rect.top) * scaleY;

            const padding = 30;
            const viewWidth = gomokuViewport.maxC - gomokuViewport.minC + 1;
            const viewHeight = gomokuViewport.maxR - gomokuViewport.minR + 1;
            const visibleCount = Math.max(viewWidth, viewHeight);
            const cellSize = (gomokuCanvas.width - padding * 2) / (visibleCount - 1);

            const c = Math.round((x - padding) / cellSize) + gomokuViewport.minC;
            const r = Math.round((y - padding) / cellSize) + gomokuViewport.minR;

            if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && gomokuBoard[r][c] === 0) {
                if (!gomokuDragCell || gomokuDragCell.r !== r || gomokuDragCell.c !== c) {
                    gomokuDragCell = { r, c };
                    drawGomokuBoard();
                }
            } else if (gomokuDragCell) {
                gomokuDragCell = null;
                drawGomokuBoard();
            }
        } else if (gomokuDragCell) {
            gomokuDragCell = null;
            drawGomokuBoard();
        }

        if (e.type === 'touchmove') e.preventDefault();
    };

    const endDrag = (e) => {
        if (!isGomokuDragging) return;
        isGomokuDragging = false;
        ghost.classList.add('hidden');

        if (gomokuDragCell) {
            const { r, c } = gomokuDragCell;
            handleMoveSelection(r, c);
            gomokuDragCell = null;
        }
        drawGomokuBoard();
    };

    stash.addEventListener('mousedown', startDrag);
    stash.addEventListener('touchstart', startDrag, { passive: false });
    window.addEventListener('mousemove', moveGhost);
    window.addEventListener('touchmove', moveGhost, { passive: false });
    window.addEventListener('mouseup', endDrag);
    window.addEventListener('touchend', endDrag);
}

function handleGomokuClick(e) {
    if (!gomokuGameActive) return;
    if (gomokuMode === 'regular' && gomokuTurn !== 'player') return;
    if (gomokuMode === 'speed' && gomokuTurn === 'minigame') return;

    const isTouch = e.type === 'touchstart' || e.type === 'touchend';
    if (isTouch) e.preventDefault();

    const rect = gomokuCanvas.getBoundingClientRect();
    const clientX = e.clientX || (e.touches && e.touches[0] && e.touches[0].clientX);
    const rawClientY = e.clientY || (e.touches && e.touches[0] && e.touches[0].clientY);

    if (clientX === undefined || rawClientY === undefined) return;

    // Apply offset for touch so placement is above the finger
    const clientY = isTouch ? rawClientY - TOUCH_Y_OFFSET : rawClientY;

    const scaleX = gomokuCanvas.width / rect.width;
    const scaleY = gomokuCanvas.height / rect.height;
    const x = (clientX - rect.left) * scaleX;
    const y = (clientY - rect.top) * scaleY;

    const padding = 30;
    const viewWidth = gomokuViewport.maxC - gomokuViewport.minC + 1;
    const viewHeight = gomokuViewport.maxR - gomokuViewport.minR + 1;
    const visibleCount = Math.max(viewWidth, viewHeight);
    const cellSize = (gomokuCanvas.width - padding * 2) / (visibleCount - 1);
    const c = Math.round((x - padding) / cellSize) + gomokuViewport.minC;
    const r = Math.round((y - padding) / cellSize) + gomokuViewport.minR;

    handleMoveSelection(r, c);
}

function handleMoveSelection(r, c) {
    if (r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE && gomokuBoard[r][c] === 0) {
        pendingGomokuMove = { r, c };
        expandGomokuViewport(r, c);

        if (gomokuMode === 'speed') {
            gomokuBoard[r][c] = 1;
            lastGomokuMove = { r, c };
            drawGomokuBoard();
            osc('sine', 400, 0.1, 0.1);

            if (checkWin(r, c, 1)) {
                endGomokuGame('win');
                return;
            }
        }
        showGomokuMiniGame();
    }
}

let pendingGomokuMove = null;

function showGomokuMiniGame() {
    gomokuTurn = 'minigame';
    gomokuAccumulatedTime += (Date.now() - gomokuStartTime);

    const types = ['spelling', 'wordrec', 'scramble', 'sentencematch'];
    const type = types[Math.floor(Math.random() * types.length)];
    startMiniGame(type, 'gomoku');
}

function completeGomokuMove(success) {
    if (!success) {
        gomokuTurn = 'player';
        gomokuStartTime = Date.now();
        updateGomokuStatus("Wrong! Try again.");
        return;
    }

    const { r, c } = pendingGomokuMove;

    if (gomokuMode !== 'speed') {
        // Only place here for regular mode
        gomokuBoard[r][c] = 1; // Player is Black
        lastGomokuMove = { r, c };
        drawGomokuBoard();
        osc('sine', 400, 0.1, 0.1);

        if (checkWin(r, c, 1)) {
            endGomokuGame('win');
            return;
        }
    }

    if (gomokuMode === 'speed') {
        gomokuTurn = 'player';
        updateGomokuStatus("Go! Go! Go!");
        gomokuStartTime = Date.now();
    } else {
        gomokuTurn = 'ai';
        updateGomokuStatus("Computer thinking...");
        setTimeout(gomokuAiTurn, 600);
    }
}

function speedAiTurn() {
    if (!gomokuGameActive) return;

    // Reset timer for next move
    gomokuNextAiTime = Date.now() + currentGomokuSpeedIntervalTime;

    const move = findBestMove(true);
    if (move) {
        gomokuBoard[move.r][move.c] = 2; // AI is White
        lastGomokuMove = move;
        expandGomokuViewport(move.r, move.c);
        drawGomokuBoard();
        osc('sine', 300, 0.1, 0.1);

        if (checkWin(move.r, move.c, 2)) {
            endGomokuGame('loss');
        }
    }
}

function gomokuAiTurn() {
    if (!gomokuGameActive) return;

    const move = findBestMove();
    if (move) {
        gomokuBoard[move.r][move.c] = 2; // AI is White
        lastGomokuMove = move;
        expandGomokuViewport(move.r, move.c);
        drawGomokuBoard();
        osc('sine', 300, 0.1, 0.1);

        if (checkWin(move.r, move.c, 2)) {
            endGomokuGame('loss');
            return;
        }
    }

    gomokuTurn = 'player';
    updateGomokuStatus("Your turn!");
    gomokuStartTime = Date.now();
}

function checkWin(r, c, p) {
    const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
    for (let [dr, dc] of dirs) {
        let count = 1;
        // Check forward
        let i = 1;
        while (r + dr * i >= 0 && r + dr * i < BOARD_SIZE && c + dc * i >= 0 && c + dc * i < BOARD_SIZE && gomokuBoard[r + dr * i][c + dc * i] === p) {
            count++; i++;
        }
        // Check backward
        i = 1;
        while (r - dr * i >= 0 && r - dr * i < BOARD_SIZE && c - dc * i >= 0 && c - dc * i < BOARD_SIZE && gomokuBoard[r - dr * i][c - dc * i] === p) {
            count++; i++;
        }
        if (count >= 5) return true;
    }
    return false;
}

// --- AI (PATTERN GRADER) ---
function findBestMove(perfect = false) {
    let allMoves = [];

    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (gomokuBoard[r][c] === 0) {
                if (hasNeighbor(r, c)) {
                    const score = evaluatePosition(r, c);
                    allMoves.push({ r, c, score });
                }
            }
        }
    }

    if (allMoves.length === 0) {
        // If board is empty, play center
        if (gomokuBoard[7][7] === 0) return { r: 7, c: 7 };
        for (let r = 0; r < BOARD_SIZE; r++) for (let c = 0; c < BOARD_SIZE; c++) if (gomokuBoard[r][c] === 0) return { r, c };
    }

    // Sort moves from highest score to lowest
    allMoves.sort((a, b) => b.score - a.score);

    if (perfect) {
        return allMoves[0];
    }

    let difficultyToUse = (gomokuMode === 'speed') ? 'hardest' : gomokuDifficulty;
    const hasCriticalMove = allMoves[0].score >= 2000;
    const rand = Math.random();

    if (difficultyToUse === 'hardest') {
        if (hasCriticalMove) return allMoves[0];
        if (rand < 0.9) return allMoves[0];
        return allMoves[Math.floor(Math.random() * Math.min(3, allMoves.length))];
    } else if (difficultyToUse === 'hard') {
        // Current level
        if (hasCriticalMove) return allMoves[0];
        if (rand < 0.5) return allMoves[0];
        else if (rand < 0.8) return allMoves[Math.floor(Math.random() * Math.min(3, allMoves.length))];
        else return allMoves[Math.floor(Math.random() * Math.min(8, allMoves.length))];
    } else if (difficultyToUse === 'easy') {
        // Slightly dumber
        if (hasCriticalMove && rand < 0.6) return allMoves[0]; // 40% chance to miss a critical move
        if (rand < 0.3) return allMoves[0];
        else if (rand < 0.6) return allMoves[Math.floor(Math.random() * Math.min(3, allMoves.length))];
        else return allMoves[Math.floor(Math.random() * Math.min(10, allMoves.length))];
    }

    return allMoves[0];
}

function getGomokuSpeedInterval() {
    let book = 'PU3'; // Default
    if (typeof authActiveUser !== 'undefined' && authActiveUser && authActiveUser.book) {
        book = authActiveUser.book;
    } else if (typeof selectedClassContent !== 'undefined' && selectedClassContent) {
        book = selectedClassContent.book;
    }

    switch (book) {
        case 'PU1': return 20000;
        case 'PU2': return 15000;
        case 'PU3':
        case 'Think0': return 10000;
        case 'Think1': return 10000;
        default: return 10000;
    }
}

function hasNeighbor(r, c) {
    for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = r + dr, nc = c + dc;
            if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE && gomokuBoard[nr][nc] !== 0) return true;
        }
    }
    return false;
}

function evaluatePosition(r, c) {
    // Scores for different patterns
    const attackScore = getScoreForPlayer(r, c, 2); // AI
    const defenseScore = getScoreForPlayer(r, c, 1); // Player

    // Base score: Prioritize winning over blocking, but blocking 4 over attacking 3
    let score = attackScore + defenseScore * 1.1; // Slightly favor defense

    return score;
}

function getScoreForPlayer(r, c, p) {
    const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
    let totalScore = 0;

    for (let [dr, dc] of dirs) {
        let line = [];
        for (let i = -4; i <= 4; i++) {
            const nr = r + dr * i, nc = c + dc * i;
            if (nr >= 0 && nr < BOARD_SIZE && nc >= 0 && nc < BOARD_SIZE) {
                if (i === 0) line.push(p);
                else line.push(gomokuBoard[nr][nc]);
            } else {
                line.push(-1); // Wall
            }
        }
        totalScore += scoreLine(line, p);
    }
    return totalScore;
}

function scoreLine(line, p) {
    const s = line.map(v => v === p ? 'X' : (v === 0 ? 'O' : '#')).join('');

    let score = 0;
    if (s.includes('XXXXX')) score += 100000;
    if (s.includes('OXXXXO')) score += 10000;
    if (s.includes('#XXXXO') || s.includes('OXXXX#')) score += 2000;
    if (s.includes('OXXXO')) score += 1000;
    if (s.includes('OXXOXO') || s.includes('OXOXXO')) score += 800;
    if (s.includes('#XXXO') || s.includes('OXXX#')) score += 200;
    if (s.includes('OOXXOO')) score += 100;

    return score;
}

// --- GAME OVER ---
async function endGomokuGame(result) {
    gomokuGameActive = false;
    clearInterval(window.gomokuTimerInterval);
    if (gomokuSpeedInterval) clearInterval(gomokuSpeedInterval);

    if (gomokuTurn !== 'minigame') {
        gomokuAccumulatedTime += (Date.now() - gomokuStartTime);
    }

    const title = document.getElementById('gomokuResultTitle');
    const msg = document.getElementById('gomokuResultMsg');

    const studentName = typeof selectedStudent !== 'undefined' && selectedStudent ? selectedStudent : 'Player';

    if (result === 'win') {
        title.innerText = "You Won!";
        title.className = "text-4xl font-bold mb-4 text-green-400";
        msg.innerText = `Congratulations, ${studentName}! You are a 5 in a row Master.`;
        synthLevelUp();
    } else {
        title.innerText = "Game Over";
        title.className = "text-4xl font-bold mb-4 text-red-500";
        msg.innerText = `Better luck next time, ${studentName}! The computer won this round.`;
        synthDeath();
    }

    const gameTimeSec = Math.floor(gomokuAccumulatedTime / 1000);
    const questTimeSec = Math.floor(totalMinigameTimeMs / 1000);
    const totalTimeSec = gameTimeSec + questTimeSec;

    const format = (s) => `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

    document.getElementById('gomokuGameTime').innerText = format(gameTimeSec);
    document.getElementById('gomokuQuestTime').innerText = format(questTimeSec);
    document.getElementById('gomokuTotalTime').innerText = format(totalTimeSec);

    // Track session analytics and finalize SR
    const isSessionIgnored = (result !== 'win' && totalTimeSec < 120);
    if (typeof srGameResults !== 'undefined') {
        finalizeSession(srGameResults, !isSessionIgnored);
    }
    queueSessionEvent('gomoku', {
        result: result,
        mode: gomokuMode,
        difficulty: gomokuDifficulty,
        gameTimeSec: gameTimeSec,
        questTimeSec: questTimeSec,
        totalTimeSec: totalTimeSec,
        ignored: isSessionIgnored
    });
    // FIX (2026-08-25, "Doris refresh"): await delivery (deadline-capped)
    // before showing the game-over screen so an iOS WebKit page restart can't
    // drop the session record. See frontend_auth.js for details.
    if (typeof flushAnalyticsWithDeadline === 'function') await flushAnalyticsWithDeadline(4000);
    else if (typeof flushAnalyticsOnGameOver === 'function') flushAnalyticsOnGameOver(); else flushAnalytics();

    const targetText = typeof getActiveTargetText === 'function' ? getActiveTargetText() : null;
    const banner = document.getElementById('gomoku-target-banner');
    if (targetText && banner) {
        banner.innerText = targetText;
        banner.classList.remove('hidden');
    } else if (banner) {
        banner.classList.add('hidden');
    }

    const warning = document.getElementById('gomokuTargetWarning');
    if (warning) {
        if (isSessionIgnored) {
            warning.innerText = "用时不到2分钟且挑战失败，本次练习不计入每周目标。";
            warning.classList.remove('hidden');
        } else {
            warning.classList.add('hidden');
        }
    }

    document.getElementById('gomokuGameOverScreen').classList.remove('hidden');
}

function exitGomokuGame() {
    if (window.PracticeTelemetry) PracticeTelemetry.interrupt('game_exit', false);
    gomokuGameActive = false;
    clearInterval(window.gomokuTimerInterval);
    if (gomokuSpeedInterval) clearInterval(gomokuSpeedInterval);
    document.getElementById('gomokuScreen').classList.add('hidden');
    document.getElementById('gameSelectionOverlay').classList.remove('hidden');
    if (typeof applyVsPromo === 'function') applyVsPromo();
}


