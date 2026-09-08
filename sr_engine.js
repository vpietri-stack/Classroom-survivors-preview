// ============================================================
// SR ENGINE — Spaced Repetition Logic
// Pure utility module: no DOM or Phaser dependencies.
// Loaded before teaching_content.js and all game scripts.
// ============================================================

/**
 * Returns a normalised string key for any content item.
 *  - Strings (vocab, sentences): lowercased + trimmed
 *  - Sentence pairs {a, b}:      lowercased + trimmed question side (a)
 */
function itemKey(item) {
    if (!item) return '';
    if (typeof item === 'string') return item.trim().toLowerCase();
    if (item.a && item.b) return (item.a.trim() + " | " + item.b.trim()).toLowerCase();
    if (item.a) return item.a.trim().toLowerCase();
    return JSON.stringify(item).toLowerCase();
}

/**
 * Normalised comparison for sentence-match CHECK handlers (2026-09-08,
 * "Doris stuck CHECK"). Tile text is interpolated into HTML templates with
 * surrounding whitespace/newlines, so a visually-correct placement can carry
 * invisible characters (indentation, double spaces, &nbsp;) and fail strict
 * equality FOREVER with no error shown. Collapse ALL whitespace runs
 * (incl. non-breaking spaces) to single spaces + trim + lowercase — display
 * text only, never used as a storage key (itemKey stays the canonical key).
 */
function normMatchText(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[\s\u00a0]+/g, ' ').trim().toLowerCase();
}

// 1 in 5 selected items should introduce NEW (never-seen) material, so review
// backlogs can never fully starve forward progress through the book.
const SR_NEW_CONTENT_RATIO = 0.2;
// After this many lifetime lapses an item is treated as a "leech": pure
// repetition isn't working, so it comes back every 2 sessions instead of every
// session (burnout guard). The lapse count is kept in the item state so the
// teacher dashboard can surface these items later.
const SR_LEECH_LAPSES = 4;

/**
 * Priority groups (lower = higher priority):
 *   0  failed during THIS game session (in-memory inSessionFailures set)
 *   1  failed last session (lastResult='failure', due this session or overdue)
 *   2  succeeded before, now due/overdue (lastResult='success', dueAfterSession <= currentSession)
 *   3  never seen (no SR state)
 *   4  in cooldown — EXCLUDED from selection (dueAfterSession > currentSession)
 *   5  succeeded THIS session — sorts LAST, served only when nothing else remains
 *      (absolute fallback so game-mode pickers never return an empty result)
 *
 * @param {string} key            normalised item key
 * @param {Object} srTypeState    the per-type sub-object (e.g. srState.vocab)
 * @param {number} currentSession current session index
 * @param {Set}   [inSessionFailures] keys failed earlier in this game session
 * @param {Set}   [inSessionSuccesses] keys succeeded earlier in this game session
 * @returns {{ group: number, dueAfterSession: number|null }}
 */
function getSRPriority(key, srTypeState, currentSession, inSessionFailures, inSessionSuccesses) {
    if (inSessionFailures && inSessionFailures.has(key)) {
        return { group: 0, dueAfterSession: null };
    }

    if (inSessionSuccesses && inSessionSuccesses.has(key)) {
        return { group: 5, dueAfterSession: null };
    }

    const entry = srTypeState && srTypeState[key];
    if (!entry) {
        return { group: 3, dueAfterSession: null };
    }

    const { dueAfterSession, lastResult } = entry;

    if (dueAfterSession > currentSession) {
        return { group: 4, dueAfterSession };        // in cooldown
    }

    return {
        group: lastResult === 'failure' ? 1 : 2,
        dueAfterSession
    };
}

/** Fisher-Yates shuffle (in-place, returns array). */
function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

/**
 * Annotates a pool of { item, key, pageAbsIndex } entries with priority,
 * filters out cooldown items (group 4), and returns a sorted copy.
 *
 * Within group 2: sorted by dueAfterSession DESC ("closeness" = most recently due
 *                 first), with random tie-breaking so equally-due items rotate
 *                 between sessions instead of the same subset always winning.
 * Within group 3: sorted by ascending page distance from activePageIndex.
 * Groups 0 and 1: randomly shuffled within the group.
 *
 * Items already succeeded THIS session (inSessionSuccesses, group 5) sort LAST:
 * a first-attempt success is never re-prompted while any other material exists,
 * but remains available as an absolute fallback (empty pools crash minigames).
 */
function sortPoolBySR(pool, srTypeState, currentSession, activePageIndex, inSessionFailures, inSessionSuccesses) {
    const annotated = pool.map(entry => ({
        ...entry,
        priority: getSRPriority(entry.key, srTypeState, currentSession, inSessionFailures, inSessionSuccesses)
    }));
    // Cooldown items (group 4) are dropped from the pickable order BUT kept on
    // sorted._cooldown so pickWithNewQuota can serve the least-overdue ones as
    // a floor when everything else is exhausted (2026-09-08 "Doris
    // all-cooldown": without this, a long-term successful student gets NULL
    // pools and dead sessions). Never mutate the caller's array.
    const cooldown = annotated.filter(e => e.priority.group === 4);
    const pickable = annotated.filter(e => e.priority.group !== 4);

    const g0 = pickable.filter(e => e.priority.group === 0);
    const g1 = pickable.filter(e => e.priority.group === 1);
    const g2 = pickable.filter(e => e.priority.group === 2);
    const g3 = pickable.filter(e => e.priority.group === 3);
    const g5 = pickable.filter(e => e.priority.group === 5);

    shuffleArray(g0);
    shuffleArray(g1);
    shuffleArray(g5);
    g2.forEach(e => { e._tieBreak = Math.random(); });
    g2.sort((a, b) =>
        ((b.priority.dueAfterSession || 0) - (a.priority.dueAfterSession || 0)) ||
        (b._tieBreak - a._tieBreak)
    );
    
    // Group 3: Weighted random based on page distance
    g3.forEach(e => {
        const distance = Math.abs(e.pageAbsIndex - activePageIndex);
        // w = 0.2^distance -> ~90% chance for distance 0 to beat distance 1
        const weight = Math.pow(0.2, distance);
        e._randomScore = Math.random() * weight;
    });
    g3.sort((a, b) => b._randomScore - a._randomScore);

    const ordered = [...g0, ...g1, ...g2, ...g3, ...g5];
    ordered._cooldown = cooldown; // floor for pickWithNewQuota (see above)
    return ordered;
}

/**
 * Picks `count` entries from a sortPoolBySR() result while reserving ~1 in 5
 * slots (SR_NEW_CONTENT_RATIO) for NEW items (group 3), so heavy review
 * backlogs can't fully starve new content.
 *
 *   - Group 0 (failed this session) always claims its slots first.
 *   - Remaining slots split review (groups 1-2) vs new (group 3); a fractional
 *     new-slot becomes a probability (a single game-mode pick is new 20% of
 *     the time when both pools are non-empty).
 *   - Either side backfills the other when short; group 5 is the last resort.
 *
 * @param {Array}  sorted  annotated entries from sortPoolBySR()
 * @param {number} count
 * @returns {Array} picked entries (still annotated)
 */
function pickWithNewQuota(sorted, count) {
    if (sorted.length <= count) return sorted.slice(0, count);

    const g0 = [], review = [], fresh = [], fallback = [];
    sorted.forEach(e => {
        const g = e.priority.group;
        if (g === 0) g0.push(e);
        else if (g === 1 || g === 2) review.push(e);
        else if (g === 3) fresh.push(e);
        else fallback.push(e);   // group 5
    });
    const picked = g0.slice(0, count);
    const remaining = count - picked.length;
    if (remaining <= 0) return picked;

    const exactNew = remaining * SR_NEW_CONTENT_RATIO;
    let newSlots = Math.floor(exactNew);
    if (Math.random() < exactNew - newSlots) newSlots++;
    newSlots = Math.min(newSlots, fresh.length);

    const reviewSlots = remaining - newSlots;
    picked.push(...review.slice(0, reviewSlots));
    picked.push(...fresh.slice(0, newSlots));

    // Backfill when either pool ran short (then group-5 absolute fallback).
    const backfill = [...review.slice(reviewSlots), ...fresh.slice(newSlots), ...fallback];
    for (const e of backfill) {
        if (picked.length >= count) break;
        picked.push(e);
    }
    // COOLDOWN FLOOR (2026-09-08, "Doris all-cooldown"): a long-term successful
    // student can have EVERYTHING on cooldown (group 4, dropped by sortPoolBySR
    // before pickWithNewQuota ever sees it — see below). Practice beats a dead
    // session: serve the least-overdue cooldown items rather than starving the
    // round. Callers pass the dropped entries via sorted._cooldown.
    if (picked.length < count && sorted._cooldown && sorted._cooldown.length > 0) {
        const rest = sorted._cooldown.slice().sort((a, b) =>
            (a.priority.dueAfterSession || 0) - (b.priority.dueAfterSession || 0));
        for (const e of rest) {
            if (picked.length >= count) break;
            picked.push(e);
        }
    }
    return picked.slice(0, count);
}

/**
 * Selects `count` items from a flat candidate pool using SR priority.
 *
 * @param {Array}  pool            [{ item, key, pageAbsIndex }, ...]
 * @param {number} count           how many items to return
 * @param {Object} srTypeState     e.g. authActiveUser.srState.vocab
 * @param {number} currentSession
 * @param {number} activePageIndex for page-proximity tie-breaking among unseen items
 * @param {Set}   [inSessionFailures]
 * @param {Set}   [inSessionSuccesses]
 * @param {string} [avoidKey]       last-served key — skipped for this pick when an
 *                                  alternative exists (1-selection repeat delay)
 * @returns {Array} raw item values (strings or pair objects)
 */
function selectItemsSR(pool, count, srTypeState, currentSession, activePageIndex, inSessionFailures, inSessionSuccesses, avoidKey) {
    if (!pool || pool.length === 0) return [];
    let sorted = sortPoolBySR(pool, srTypeState, currentSession, activePageIndex, inSessionFailures, inSessionSuccesses);
    if (avoidKey && sorted.length > 1) {
        const filtered = sorted.filter(e => e.key !== avoidKey);
        if (filtered.length > 0) sorted = filtered;
    }
    return pickWithNewQuota(sorted, count).map(e => e.item);
}

/**
 * Selects `count` sentence pairs from the highest-priority page.
 * Used for Round E sub-rounds and the game-mode sentence match minigame.
 *
 * Page priority = lowest priority group among that page's available items.
 * Tie-break: most items in the winning group → page proximity.
 *
 * @param {Array}  pagesWithItems  [{ pageAbsIndex, items: [{ item, key, pageAbsIndex }] }, ...]
 * @param {number} count           pairs to select (typically 3)
 * @param {Object} srTypeState     e.g. authActiveUser.srState.sentencePairs
 * @param {number} currentSession
 * @param {number} activePageIndex
 * @param {Set}   [excludePageIndices]  pages already used (E1/E2/E3 uniqueness)
 * @param {Set}   [inSessionFailures]
 * @param {Set}   [inSessionSuccesses]
 * @returns {{ pageAbsIndex: number, items: Array }|null}
 */
function selectSamePageSR(pagesWithItems, count, srTypeState, currentSession, activePageIndex, excludePageIndices, inSessionFailures, inSessionSuccesses) {
    const eligible = pagesWithItems.filter(
        p => !excludePageIndices || !excludePageIndices.has(p.pageAbsIndex)
    );
    if (eligible.length === 0) return null;

    const scored = eligible.map(p => {
        const sorted = sortPoolBySR(p.items, srTypeState, currentSession, activePageIndex, inSessionFailures, inSessionSuccesses);
        const bestGroup = sorted.length > 0 ? sorted[0].priority.group : 6;
        const bestGroupCount = sorted.filter(e => e.priority.group === bestGroup).length;
        const proximity = 1 / (Math.abs(p.pageAbsIndex - activePageIndex) + 1);
        
        let randomScore = 0;
        if (bestGroup === 3) {
            const distance = Math.abs(p.pageAbsIndex - activePageIndex);
            const weight = Math.pow(0.2, distance);
            randomScore = Math.random() * weight;
        }
        
        return { page: p, sorted, bestGroup, bestGroupCount, proximity, randomScore };
    });

    scored.sort((a, b) => {
        if (a.bestGroup !== b.bestGroup) return a.bestGroup - b.bestGroup;
        if (a.bestGroup === 3) return b.randomScore - a.randomScore;
        if (a.bestGroupCount !== b.bestGroupCount) return b.bestGroupCount - a.bestGroupCount;
        return b.proximity - a.proximity;
    });

    const winner = scored[0];
    return {
        pageAbsIndex: winner.page.pageAbsIndex,
        items: pickWithNewQuota(winner.sorted, count).map(e => e.item)
    };
}

/**
 * Computes the updated srState after a session ends.
 *
 * Rules:
 *   first attempt success → consecutive success doubles the interval; recovering
 *                           from a failure resumes at max(2, priorInterval / 2)
 *                           (soft reset — one lapse doesn't erase months of
 *                           history); otherwise interval = 2.
 *   failure               → interval = 1 (due next session); the pre-failure
 *                           interval is preserved as priorInterval and the
 *                           lifetime lapse counter increments. Items with
 *                           SR_LEECH_LAPSES+ lapses get interval 2 instead
 *                           (leech guard — see constant above).
 *
 * @param {Object} srState        full SR state { vocab:{}, sentences:{}, sentencePairs:{} }
 * @param {Array}  sessionResults [{ type:'vocab'|'sentences'|'sentencePairs', key, firstAttempt:bool }, ...]
 * @param {number} currentSession session index that just completed
 * @returns {Object} new srState (does not mutate input)
 */
function updateSRStateForSession(srState, sessionResults, currentSession) {
    const newState = {
        vocab: Object.assign({}, (srState || {}).vocab || {}),
        sentences: Object.assign({}, (srState || {}).sentences || {}),
        sentencePairs: Object.assign({}, (srState || {}).sentencePairs || {})
    };

    (sessionResults || []).forEach(({ type, key, firstAttempt }) => {
        if (!type || !key || !newState[type]) return;

        const existing = newState[type][key];

        if (firstAttempt) {
            const prevResult = existing && existing.lastResult;
            const prevInterval = existing && existing.interval || 0;
            let newInterval;
            if (prevResult === 'success' && prevInterval >= 2) {
                // Consecutive successes double the interval
                newInterval = prevInterval * 2;
            } else if (prevResult === 'failure' && existing && existing.priorInterval) {
                // Soft reset: recovering from a lapse resumes at half the
                // pre-failure interval instead of restarting from scratch.
                newInterval = Math.max(2, Math.floor(existing.priorInterval / 2));
            } else {
                newInterval = 2;
            }
            newState[type][key] = {
                interval: newInterval,
                dueAfterSession: currentSession + newInterval,
                lastSession: currentSession,
                lastResult: 'success',
                lapses: (existing && existing.lapses) || 0
            };
        } else {
            const lapses = ((existing && existing.lapses) || 0) + 1;
            // Remember the best interval held before this failure chain so a
            // later success can resume at half of it (soft reset).
            const priorInterval = Math.max(
                (existing && existing.lastResult === 'success' && existing.interval) || 0,
                (existing && existing.priorInterval) || 0
            );
            // Failure: due next session — except leeches (see SR_LEECH_LAPSES),
            // which come back every 2 sessions to avoid burnout.
            const interval = lapses >= SR_LEECH_LAPSES ? 2 : 1;
            newState[type][key] = {
                interval: interval,
                dueAfterSession: currentSession + interval,
                lastSession: currentSession,
                lastResult: 'failure',
                lapses: lapses,
                priorInterval: priorInterval
            };
        }
    });

    return newState;
}
