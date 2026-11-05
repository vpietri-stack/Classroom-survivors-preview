const TEACHING_CONTENT = {};
const AVAILABLE_CONTENT = {};


/**
 * Spaced Repetition Logic Helpers
 */

const BOOK_SERIES = {
    "PU1": ["PU1"],
    "PU2": ["PU2"],
    "PU3": ["PU3"],
    "Think0": ["Think0"],
    "Think1": ["Think1"],
    "Think2": ["Think2"],
    "test": ["test"]
};

// --- SHARED WIZARD STATE ---
var selectedDay = null;
var selectedTime = null;
var selectedStudent = null;
var selectedBook = null;
var selectedUnit = null;
var selectedClassContent = null;

// --- AUTH & ANALYTICS STATE ---
var authActiveUser = null;
// NOTE: analyticsQueue is intentionally NOT reset to [] on script load. It is
// hydrated from localStorage (see loadPersistedAnalyticsQueue) so events that
// could not be delivered before the app was killed/closed are retried on the
// next launch instead of being lost.
var analyticsQueue = loadPersistedAnalyticsQueue();
var analyticsFlushTimer = null;

// --- PERSISTENT ANALYTICS QUEUE (survives killed app / closed tab) ---
// The unsent queue is mirrored to localStorage after every enqueue and every
// failed flush, so a crash, tab-close, or dead battery mid-session doesn't drop
// student data. It is cleared only after the server confirms a successful write.
// (2026-09-16, "Val PC cross-account": the key is per-student — a global key
// let one account inherit + flush another account's leftovers. Queued events
// also carry ownerId so a flush under the wrong login is dropped, not sent.)
const PERSISTED_QUEUE_KEY = 'csAnalyticsQueue'; // legacy global key (migrated)
function persistedQueueKey() {
    try {
        const id = (typeof authActiveUser !== 'undefined' && authActiveUser && authActiveUser.id) || null;
        if (id) return 'csAnalyticsQueue_' + id;
    } catch { /* fall through to legacy */ }
    return PERSISTED_QUEUE_KEY;
}

function loadPersistedAnalyticsQueue() {
    try {
        const raw = localStorage.getItem(persistedQueueKey());
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
    } catch {
        return [];
    }
}

/**
 * Scope-guard (2026-09-16): after any login/logout switch, reload the queue
 * from the newly-active account's key so the previous account's leftovers
 * can neither render nor flush under the new identity. Call after
 * authActiveUser is (re)assigned and before the first enqueue of the session.
 */
function reloadAnalyticsQueueForActiveUser() {
    try {
        analyticsQueue = loadPersistedAnalyticsQueue();
    } catch { analyticsQueue = []; }
}

/**
 * In-memory session reset (2026-09-16, cross-account): clears the volatile
 * leftovers of the previous login (SR pending triple, debounce timer,
 * page-session breadcrumb) BEFORE hydrating the new account's persisted
 * state. Idempotent; safe to call when nothing is set.
 */
function resetInMemorySessionState() {
    try {
        srPendingState = null;
        srIncrementSession = false;
        srPendingSeq = 0;
        if (typeof analyticsFlushTimer !== 'undefined' && analyticsFlushTimer) {
            clearTimeout(analyticsFlushTimer);
            analyticsFlushTimer = null;
        }
    } catch { /* non-fatal */ }
    try {
        if (typeof csNewPageSession === 'function') csNewPageSession();
    } catch { /* cs breadcrumb lives in frontend_auth — may be undefined here */ }
}

function persistAnalyticsQueue() {
    try {
        // Only persist when there is genuinely unsent work.
        if (!analyticsQueue || analyticsQueue.length === 0) {
            localStorage.removeItem(persistedQueueKey());
        } else {
            localStorage.setItem(persistedQueueKey(), JSON.stringify(analyticsQueue));
        }
    } catch { /* storage full / unavailable — non-fatal */ }
}

// --- PERSISTENT SR STATE (survives app-kill between finalizeSession and flush) ---
// (2026-09-16: per-student keys — see queue note above. Legacy global keys are
// migrated on load: if a per-student key is absent but the global one exists,
// adopt it once, then remove the global.)
const PERSISTED_SR_KEY = 'csPendingSRState';
const PERSISTED_SR_INCR_KEY = 'csPendingSRIncrement';
const PERSISTED_SR_SEQ_KEY = 'csPendingSRSeq';       // seq of the pending update (2026-09-10)
const CONFIRMED_SR_SEQ_KEY = 'csConfirmedSrSeq';     // highest server-confirmed seq (2026-09-10)
function scopedKey(base) {
    try {
        const id = (typeof authActiveUser !== 'undefined' && authActiveUser && authActiveUser.id) || null;
        if (id) return base + '_' + id;
    } catch { /* fall through */ }
    return base;
}
function migrateScopedKey(base) {
    // One-time adoption: global -> per-student, then drop the global.
    try {
        const scoped = scopedKey(base);
        if (scoped === base) return base;
        if (localStorage.getItem(scoped) === null && localStorage.getItem(base) !== null) {
            localStorage.setItem(scoped, localStorage.getItem(base));
            localStorage.removeItem(base);
        }
        return scoped;
    } catch { return base; }
}

function persistPendingSR() {
    try {
        const K = migrateScopedKey(PERSISTED_SR_KEY);
        const KI = migrateScopedKey(PERSISTED_SR_INCR_KEY);
        const KS = migrateScopedKey(PERSISTED_SR_SEQ_KEY);
        if (srPendingState) {
            localStorage.setItem(K, JSON.stringify(srPendingState));
        } else {
            localStorage.removeItem(K);
        }
        if (srIncrementSession) {
            localStorage.setItem(KI, '1');
        } else {
            localStorage.removeItem(KI);
        }
        if (srPendingSeq) {
            localStorage.setItem(KS, String(srPendingSeq));
        } else {
            localStorage.removeItem(KS);
        }
    } catch { /* non-fatal */ }
}

function persistConfirmedSrSeq() {
    try {
        localStorage.setItem(migrateScopedKey(CONFIRMED_SR_SEQ_KEY), String(confirmedSrSeq || 0));
    } catch { /* non-fatal */ }
}

function loadPersistedSR() {
    try {
        const raw = localStorage.getItem(migrateScopedKey(PERSISTED_SR_KEY));
        if (raw) {
            const parsed = JSON.parse(raw);
            // Delta envelope (2026-09-16 quota guard): merge onto the cached
            // full profile state if present, else hold the delta alone — the
            // flush ships srPendingDelta either way.
            if (parsed && parsed.__srDelta && parsed.delta) {
                try {
                    const saved = JSON.parse(localStorage.getItem('savedUsers') || '[]');
                    const me = saved.find(u => authActiveUser && u.id === authActiveUser.id);
                    const base = (me && me.srState) || ((typeof authActiveUser !== 'undefined' && authActiveUser && authActiveUser.srState) || {});
                    srPendingState = (typeof mergeSRDelta === 'function') ? mergeSRDelta(base, parsed.delta) : parsed.delta;
                } catch { srPendingState = parsed.delta; }
            } else {
                srPendingState = parsed;
            }
        }
        if (localStorage.getItem(migrateScopedKey(PERSISTED_SR_INCR_KEY)) === '1') srIncrementSession = true;
        const seq = parseInt(localStorage.getItem(migrateScopedKey(PERSISTED_SR_SEQ_KEY)) || '0', 10);
        if (seq) srPendingSeq = seq;
        const conf = parseInt(localStorage.getItem(migrateScopedKey(CONFIRMED_SR_SEQ_KEY)) || '0', 10);
        if (conf) confirmedSrSeq = conf;
    } catch { /* non-fatal */ }
}

function clearPersistedSR() {
    try {
        localStorage.removeItem(scopedKey(PERSISTED_SR_KEY));
        localStorage.removeItem(scopedKey(PERSISTED_SR_INCR_KEY));
        localStorage.removeItem(scopedKey(PERSISTED_SR_SEQ_KEY));
    } catch { /* non-fatal */ }
    // NOTE: CONFIRMED_SR_SEQ_KEY is intentionally kept — confirmation is monotonic.
    srPendingSeq = 0;
}
var exerciseStartTime = 0;
var exerciseAttempts = 0;



/**
 * Returns a sorted array of all pages in a book series: [{book, unit, page, absIndex}, ...]
 * Based on the order in AVAILABLE_CONTENT and the series defined in BOOK_SERIES.
 */
function getSortedPagesForBook(book) {
    const series = BOOK_SERIES[book] || [book];
    const sorted = [];
    let absIndex = 0;

    series.forEach(b => {
        if (!AVAILABLE_CONTENT[b]) return;
        const units = Object.keys(AVAILABLE_CONTENT[b]).sort((a, b) => parseInt(a) - parseInt(b));
        units.forEach(unit => {
            const pages = AVAILABLE_CONTENT[b][unit].slice();
            // Keep older page-45 assignments and interrupted sessions usable.
            // Page 45 is no longer offered for new Think Starter assignments.
            const legacyPage = [authActiveUser, selectedClassContent].some(placement =>
                placement && placement.book === 'Think0'
                && String(placement.unit) === '4' && String(placement.page) === '45');
            if (b === 'Think0' && unit === '4' && legacyPage && !pages.some(page => String(page) === '45')) {
                pages.push(45);
            }
            pages.sort((a, b) => parseInt(a) - parseInt(b));
            pages.forEach(page => {
                sorted.push({ book: b, unit, page: page.toString(), absIndex: absIndex++ });
            });
        });
    });
    return sorted;
}

/**
 * Weighted random selection from an array of indices.
 * weights: array of numbers corresponding to items.
 */
function getWeightedRandomIndex(weights) {
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let random = Math.random() * totalWeight;
    for (let i = 0; i < weights.length; i++) {
        if (random < weights[i]) return i;
        random -= weights[i];
    }
    return weights.length - 1;
}

/**
 * Picks N unique items from a pool of pages.
 * if useWeights is true, it uses linear weighting based on proximity to activePageIndex.
 * pages: array of {unit, page, absIndex} objects
 */
function pickUniqueItems(pages, count, type, activePageIndex, useWeights = false, samePageOnly = false) {
    const allItems = [];
    const seenIdentifier = new Set(); // Track unique items by content to avoid showing the same question twice
    const pagesWithItems = [];

    // Process pages in reverse order (from current to oldest)
    // This ensures that the current page "claims" its items first in the seenIdentifier set.
    // Otherwise, common review items might be "stolen" by older pages, leaving the current page with a very small pool.
    const reversedPages = [...pages].reverse();

    reversedPages.forEach((p) => {
        const content = TEACHING_CONTENT[p.book] && TEACHING_CONTENT[p.book][p.unit] && TEACHING_CONTENT[p.book][p.unit][p.page];
        if (content && content[type] && content[type].length > 0) {
            const pageItems = [];
            const pageSeen = new Set(); // Internal deduplication for this page

            content[type].forEach(item => {
                // Generate identifier based on item content
                let identifier = "";
                if (typeof item === 'string') {
                    // Normalize vocab/sentence text
                    identifier = item.trim().toLowerCase();
                } else if (item && item.a && item.b) {
                    // For sentence pairs, deduplicate based on question (a)
                    identifier = "pair:" + item.a.trim().toLowerCase();
                } else {
                    identifier = JSON.stringify(item);
                }

                // 1. Internal page deduplication (always ensure page items are unique within the page)
                if (pageSeen.has(identifier)) return;
                pageSeen.add(identifier);

                // 2. Global deduplication (only if building a mixed pool)
                // If samePageOnly is true, we want the page to have its full content.
                if (!samePageOnly && seenIdentifier.has(identifier)) return;
                if (!samePageOnly) seenIdentifier.add(identifier);

                const itemEntry = { item, pageIndex: p.absIndex };
                pageItems.push(itemEntry);
                allItems.push(itemEntry);
            });
            if (pageItems.length > 0) {
                pagesWithItems.push({ pageIndex: p.absIndex, items: pageItems });
            }
        }
    });

    if (allItems.length === 0) return [];

    if (samePageOnly && pagesWithItems.length > 0) {
        // Pick ONE page first
        let selectedPage;
        if (useWeights) {
            // Weights based on distance to activePageIndex
            const weights = pagesWithItems.map(p => {
                const distance = Math.abs(p.pageIndex - activePageIndex);
                return 1 / Math.pow(distance + 1, 2);
            });
            const pageIdx = getWeightedRandomIndex(weights);
            selectedPage = pagesWithItems[pageIdx];
        } else {
            selectedPage = pagesWithItems[Math.floor(Math.random() * pagesWithItems.length)];
        }

        // Pick 'count' unique items from the selected page
        const pool = [...selectedPage.items];
        const selected = [];
        for (let i = 0; i < count && pool.length > 0; i++) {
            const idx = Math.floor(Math.random() * pool.length);
            selected.push(pool[idx].item);
            pool.splice(idx, 1);
        }
        return selected;
    }

    const selected = [];
    const pool = [...allItems];

    for (let i = 0; i < count && pool.length > 0; i++) {
        let index;
        if (useWeights) {
            // Weights based on distance to activePageIndex
            const weights = pool.map(entry => {
                const distance = Math.abs(entry.pageIndex - activePageIndex);
                return 1 / Math.pow(distance + 1, 2);
            });
            index = getWeightedRandomIndex(weights);
        } else {
            index = Math.floor(Math.random() * pool.length);
        }
        selected.push(pool[index].item);
        pool.splice(index, 1);
    }

    return selected;
}

/**
 * Main function to get content based on Spaced Repetition logic.
 */
function getSpacedRepetitionContent(book, unit, page, type, isStudyMode, count = 5) {
    const sortedPages = getSortedPagesForBook(book);
    const activePageIndex = sortedPages.findIndex(p => p.book === book && p.unit === unit && p.page === page.toString());

    if (activePageIndex === -1) {
        // Fallback logic
        const content = TEACHING_CONTENT[book] && TEACHING_CONTENT[book][unit] && TEACHING_CONTENT[book][unit][page];
        return content ? (content[type] || []) : [];
    }

    if (isStudyMode) {
        // Study Mode: ~60% from Recent, ~40% from Review
        const countRecent = Math.ceil(count * 0.6);
        const countReview = count - countRecent;

        // Recent Pool: current page (activePageIndex) only.
        const recentPageIndices = [activePageIndex];

        const recentPages = recentPageIndices.map(idx => sortedPages[idx]);
        let recentItems = pickUniqueItems(recentPages, countRecent, type, activePageIndex, false);

        // Review Pool: all previous pages
        const reviewPageIndices = [];
        for (let i = 0; i < activePageIndex; i++) {
            reviewPageIndices.push(i);
        }

        if (reviewPageIndices.length === 0) {
            // Edge case: no review pages, pull more from recent if possible
            if (recentItems.length < count) {
                const moreRecent = pickUniqueItems(recentPages, count - recentItems.length, type, activePageIndex, false);
                // Filter duplicates
                moreRecent.forEach(item => {
                    if (!recentItems.includes(item)) recentItems.push(item);
                });
            }
            return recentItems.slice(0, count);
        }

        const reviewPages = reviewPageIndices.map(idx => sortedPages[idx]);
        // Weight review pages based on index (closer to current = higher weight)
        const reviewItems = pickUniqueItems(reviewPages, countReview, type, activePageIndex, true);

        // Combine and ensure no duplicates
        const finalSet = [...recentItems];
        reviewItems.forEach(item => {
            if (finalSet.length < count && !finalSet.includes(item)) {
                finalSet.push(item);
            }
        });

        // If still not enough, fill from recent again (avoiding dupes)
        if (finalSet.length < count) {
            const allRecent = pickUniqueItems(recentPages, count * 2, type, activePageIndex, false);
            allRecent.forEach(item => {
                if (finalSet.length < count && !finalSet.includes(item)) finalSet.push(item);
            });
        }

        return finalSet;
    } else {
        // Game Mode: Return all eligible pages
        const gamePages = [];
        for (let i = 0; i <= activePageIndex; i++) {
            gamePages.push(sortedPages[i]);
        }
        return gamePages;
    }
}

/**
 * Picks a single item for Game Mode based on weighted probability.
 */
function getWeightedItemForGame(book, unit, page, type) {
    const sortedPages = getSortedPagesForBook(book);
    const activePageIndex = sortedPages.findIndex(p => p.book === book && p.unit === unit && p.page === page.toString());

    if (activePageIndex === -1) {
        const content = TEACHING_CONTENT[book] && TEACHING_CONTENT[book][unit] && TEACHING_CONTENT[book][unit][page];
        const items = content ? (content[type] || []) : [];
        return items[Math.floor(Math.random() * items.length)];
    }

    const gamePageIndices = [];
    for (let i = 0; i <= activePageIndex; i++) {
        gamePageIndices.push(i);
    }
    const gamePages = gamePageIndices.map(idx => sortedPages[idx]);

    // Use pickUniqueItems with count=1 and useWeights=true
    const items = pickUniqueItems(gamePages, 1, type, activePageIndex, true);
    return items[0];
}

// ============================================================
// SR-AWARE CONTENT SELECTION (uses sr_engine.js)
// ============================================================

/**
 * Builds a deduplicated flat pool of { item, key, pageAbsIndex }
 * and a pagesWithItems structure from a set of sorted page objects.
 * Pages are processed newest-first so the current page "claims" shared items.
 */
function buildItemPool(pages, type) {
    const seen = new Set();
    const flatPool = [];
    const pagesWithItems = [];

    const reversed = [...pages].reverse();
    reversed.forEach(p => {
        const content = TEACHING_CONTENT[p.book] &&
                        TEACHING_CONTENT[p.book][p.unit] &&
                        TEACHING_CONTENT[p.book][p.unit][p.page];
        if (!content || !content[type] || content[type].length === 0) return;

        const pageItems = [];
        content[type].forEach(item => {
            const k = itemKey(item);
            if (seen.has(k)) return;
            seen.add(k);
            const entry = { item, key: k, pageAbsIndex: p.absIndex };
            flatPool.push(entry);
            pageItems.push(entry);
        });
        if (pageItems.length > 0) {
            pagesWithItems.push({ pageAbsIndex: p.absIndex, items: pageItems });
        }
    });

    return { flatPool, pagesWithItems };
}

/**
 * Study mode: selects `count` vocab or sentence items using SR priority.
 * Falls back to legacy algorithm if no SR data is available.
 */
function getStudyContentSR(book, unit, page, type, count) {
    if (!authActiveUser || !authActiveUser.srState) {
        // No SR state — use legacy function
        return getSpacedRepetitionContent(book, unit, page, type, true, count);
    }

    const sortedPages = getSortedPagesForBook(book);
    const activePageIndex = sortedPages.findIndex(
        p => p.book === book && p.unit === unit && p.page === page.toString()
    );
    if (activePageIndex === -1) {
        return getSpacedRepetitionContent(book, unit, page, type, true, count);
    }

    // All pages up to and including current page
    const candidatePages = sortedPages.slice(0, activePageIndex + 1);
    const { flatPool } = buildItemPool(candidatePages, type);
    const srTypeState = authActiveUser.srState[type === 'vocab' ? 'vocab' : 'sentences'] || {};

    return selectItemsSR(flatPool, count, srTypeState, getCurrentSession(), activePageIndex);
}

/**
 * Round E sub-round: selects up to 3 sentence pairs, excluding pairs already
 * shown in earlier sub-rounds this session (so sub-rounds never repeat a pair).
 *
 * Selection priority:
 *   1. SR due-status ALWAYS wins first: any page holding a due/failed pair
 *      (groups 0-2, most-due first) is chosen regardless of sub-round or page.
 *   2. For NEW items only (nothing due anywhere, group 3):
 *        - E1 (preferPrevious=false): favors the CURRENT page.
 *        - E2/E3 (preferPrevious=true): AVOID the current page and review a
 *          PREVIOUS page instead, weighted by proximity (closer = higher chance,
 *          not guaranteed). Falls back to the current page only when no previous
 *          page has unseen pairs (e.g. a first-page student).
 *
 * @param {string} book
 * @param {string} unit
 * @param {string} page
 * @param {Set<string>} usedPairKeys   keys of pairs already shown earlier this session
 * @param {boolean} [preferPrevious]   true for E2/E3 (review earlier pages for new items)
 * @returns {{ pageAbsIndex: number, pairs: Array }|null}  null when no unseen pairs remain
 */
function getStudySentencePairsSubRoundSR(book, unit, page, usedPairKeys, preferPrevious) {
    const sortedPages = getSortedPagesForBook(book);
    const activePageIndex = sortedPages.findIndex(
        p => p.book === book && p.unit === unit && p.page === page.toString()
    );
    if (activePageIndex === -1) return null;

    const candidatePages = sortedPages.slice(0, activePageIndex + 1);
    const { pagesWithItems } = buildItemPool(candidatePages, 'sentencePairs');

    if (pagesWithItems.length === 0) return null;

    const srTypeState = (authActiveUser && authActiveUser.srState && authActiveUser.srState.sentencePairs) || {};

    // Score every page that still has unseen pairs. We exclude only the individual
    // pairs already shown this session (never lock out a whole page), so a rich
    // page can keep supplying fresh pairs.
    const scored = pagesWithItems
        .map(p => {
            const unseen = p.items.filter(it => !usedPairKeys || !usedPairKeys.has(itemKey(it.item)));
            const sorted = sortPoolBySR(unseen, srTypeState, getCurrentSession(), activePageIndex, null, null);
            // bestGroup over PICKABLE items only; but an all-cooldown page still
            // has material (the floor) — report group 4, not 6 ("empty"), so it
            // can win the page race and serve its least-overdue pairs.
            const bestGroup = sorted.length > 0 ? sorted[0].priority.group
                : (sorted._cooldown && sorted._cooldown.length > 0 ? 4 : 6);
            const bestGroupCount = sorted.filter(e => e.priority.group === bestGroup).length;
            const proximity = 1 / (Math.abs(p.pageAbsIndex - activePageIndex) + 1);
            let randomScore = 0;
            if (bestGroup === 3) {
                const distance = Math.abs(p.pageAbsIndex - activePageIndex);
                randomScore = Math.random() * Math.pow(0.2, distance);
            }
            return { page: p, unseen, sorted, bestGroup, bestGroupCount, proximity, randomScore };
        })
        .filter(p => p.unseen.length > 0);

    if (scored.length === 0) return null;

    // If the best available material everywhere is NEW (group 3 = nothing due),
    // E2/E3 should review a PREVIOUS page rather than the current one. Restrict
    // the pool to previous pages when any exist; otherwise keep the current page.
    let pool = scored;
    const minGroup = Math.min(...scored.map(s => s.bestGroup));
    if (minGroup === 3 && preferPrevious) {
        const previous = scored.filter(s => s.page.pageAbsIndex < activePageIndex);
        if (previous.length > 0) pool = previous;
    }

    pool.sort((a, b) => {
        if (a.bestGroup !== b.bestGroup) return a.bestGroup - b.bestGroup;
        if (a.bestGroup === 3) return b.randomScore - a.randomScore;
        if (a.bestGroupCount !== b.bestGroupCount) return b.bestGroupCount - a.bestGroupCount;
        return b.proximity - a.proximity;
    });

    const winner = pool[0];
    const picked = pickWithNewQuota(winner.sorted, 3).map(e => e.item);
    // COOLDOWN FLOOR top-up (2026-09-08): winner.sorted may hold fewer than 3
    // pickable items while its _cooldown holds the rest. pickWithNewQuota
    // already floors from _cooldown when IT receives the full sorted array —
    // but bestGroupCount slicing above can narrow the race; top up here from
    // the winner's own cooldown, least-overdue first.
    if (picked.length < 3 && winner.sorted._cooldown && winner.sorted._cooldown.length > 0) {
        const seen = new Set(picked.map(p => itemKey(p)));
        const rest = winner.sorted._cooldown.slice().sort((a, b) =>
            (a.priority.dueAfterSession || 0) - (b.priority.dueAfterSession || 0));
        for (const e of rest) {
            if (picked.length >= 3) break;
            if (!seen.has(e.key)) { picked.push(e.item); seen.add(e.key); }
        }
    }
    return {
        pageAbsIndex: winner.page.pageAbsIndex,
        pairs: picked
    };
}

/**
 * Game mode: selects one item using SR priority (with in-session failure boost).
 *
 * @param {string} book
 * @param {string} unit
 * @param {string} page
 * @param {'vocab'|'sentences'} type
 * @param {Set<string>} inSessionFailures  keys failed earlier this game session
 * @param {Set<string>} inSessionSuccesses keys succeeded earlier this game session
 * @param {string} [avoidKey]  last-served key, delayed one pick (no back-to-back repeats)
 * @returns {*} a single item value (string)
 */
function getGameItemSR(book, unit, page, type, inSessionFailures, inSessionSuccesses, avoidKey) {
    if (!authActiveUser || !authActiveUser.srState) {
        return getWeightedItemForGame(book, unit, page, type);
    }

    const sortedPages = getSortedPagesForBook(book);
    const activePageIndex = sortedPages.findIndex(
        p => p.book === book && p.unit === unit && p.page === page.toString()
    );
    if (activePageIndex === -1) return getWeightedItemForGame(book, unit, page, type);

    const candidatePages = sortedPages.slice(0, activePageIndex + 1);
    const { flatPool } = buildItemPool(candidatePages, type);
    const srKey = type === 'vocab' ? 'vocab' : 'sentences';
    const srTypeState = authActiveUser.srState[srKey] || {};

    const selected = selectItemsSR(
        flatPool, 1, srTypeState, getCurrentSession(), activePageIndex, inSessionFailures, inSessionSuccesses, avoidKey
    );
    return selected[0];
}

/**
 * Game mode sentence match: selects 3 pairs from the best-priority page,
 * with in-session failure boost.
 *
 * @param {string} book
 * @param {string} unit
 * @param {string} page
 * @param {Set<string>} inSessionFailures
 * @param {Set<string>} inSessionSuccesses
 * @returns {{ pageAbsIndex: number, pairs: Array }|null}
 */
function getGameSentencePairsSR(book, unit, page, inSessionFailures, inSessionSuccesses) {
    const sortedPages = getSortedPagesForBook(book);
    const activePageIndex = sortedPages.findIndex(
        p => p.book === book && p.unit === unit && p.page === page.toString()
    );
    if (activePageIndex === -1) return null;

    const candidatePages = sortedPages.slice(0, activePageIndex + 1);
    const { pagesWithItems } = buildItemPool(candidatePages, 'sentencePairs');
    if (pagesWithItems.length === 0) return null;

    const srTypeState = (authActiveUser && authActiveUser.srState && authActiveUser.srState.sentencePairs) || {};
    const result = selectSamePageSR(
        pagesWithItems, 3, srTypeState, getCurrentSession(),
        activePageIndex, null, inSessionFailures, inSessionSuccesses
    );
    return result ? { pageAbsIndex: result.pageAbsIndex, pairs: result.items } : null;
}



// Reject old regular checkpoints that contain vocabulary retired from the article pages.
const retiredArticleVocab = new Set([
    'get there', 'real name', 'rose garden', 'glass palace', 'call it',
    'feel sad', 'winning', 'fall / falls', 'call', 'call / calls to someone',
    'help her to stand', 'pyramid', 'point north', 'metal needle', 'rub',
    'the sun rises', 'the sun sets'
]);

function hasRetiredArticleVocab(words, content) {
    const racePage = content?.book === 'PU2' && String(content.page) === '14';
    return words.some(word => {
        const key = typeof word === 'string' ? itemKey(word) : '';
        return retiredArticleVocab.has(key) || (racePage && (key === 'fall' || key === 'help'));
    });
}
