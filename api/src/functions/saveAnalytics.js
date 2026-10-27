const { app } = require('@azure/functions');
const { validateApiKey } = require('./shared/validateApiKey');
const { getContainer } = require('./shared/db');
const auth = require('./shared/auth');
const previewNotes = require('./shared/previewNotesCore');

const ARCHIVE_TRIGGER_COUNT = 700;
const RETENTION_DAYS_MS = 90 * 24 * 60 * 60 * 1000; // 90 days
const RETENTION_MAX_RECENT_EVENTS = 500; // 500 recent events

/**
 * Splits an analytics array into retained events and events to archive.
 * Retains:
 *   1. All `type === 'session'` events from the last 90 days (for target calculations).
 *   2. The 500 most recent events (for recent activity, speech analysis, and diagnostics).
 *
 * @param {Array} analytics
 * @param {number} [now]
 * @returns {{ shouldArchive: boolean, retained: Array, toArchive: Array }}
 */
function splitAnalyticsForArchive(analytics, now = Date.now()) {
    if (!analytics || !Array.isArray(analytics) || analytics.length < ARCHIVE_TRIGGER_COUNT) {
        return { shouldArchive: false, retained: analytics || [], toArchive: [] };
    }

    const cutoffTs = now - RETENTION_DAYS_MS;

    // 1. All session events from the last 90 days
    const recentSessions = analytics.filter(e => {
        if (!e || e.type !== 'session') return false;
        if (!e.timestamp) return false;
        const t = new Date(e.timestamp).getTime();
        return !isNaN(t) && t >= cutoffTs;
    });

    // 2. The most recent 500 events
    const recentEvents = analytics.slice(-RETENTION_MAX_RECENT_EVENTS);

    // Merge and deduplicate retained events
    const retainedMap = new Map();
    recentSessions.forEach(e => retainedMap.set(e.eventId || JSON.stringify(e), e));
    recentEvents.forEach(e => retainedMap.set(e.eventId || JSON.stringify(e), e));

    const retainedList = Array.from(retainedMap.values()).sort((a, b) => {
        const ta = a && a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const tb = b && b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return ta - tb;
    });

    const retainedIds = new Set(retainedList.map(e => e.eventId || JSON.stringify(e)));
    const archiveList = analytics.filter(e => !retainedIds.has(e.eventId || JSON.stringify(e)));

    if (archiveList.length === 0) {
        return { shouldArchive: false, retained: analytics, toArchive: [] };
    }

    return { shouldArchive: true, retained: retainedList, toArchive: archiveList };
}

/**
 * Decides whether an incoming SR update should be applied, given the stored
 * sequence number. Monotonic: applies only if the incoming seq is newer.
 * Legacy clients (no seq) always apply — today's behavior (2026-09-10,
 * Doris stuck-flag fix). Exported pure so tests pin the contract.
 *
 * @param {number|undefined} storedSeq - user.srSeq on the doc (0/absent = never)
 * @param {number|undefined} incomingSeq - body.srSeq from the client
 * @returns {boolean}
 */
function shouldApplySr(storedSeq, incomingSeq) {
    if (incomingSeq === undefined || incomingSeq === null) return true;
    return (storedSeq || 0) < incomingSeq;
}

/**
 * Applies incoming events to an existing analytics array with idempotent
 * de-dup (stable eventId) and returns per-event acks. Exported pure so tests
 * can pin the contract the client relies on (2026-09-03a, "Doris silent-200").
 *
 * Events WITH an eventId are either added (acked in addedEventIds) or skipped
 * as already-seen (acked in duplicateEventIds). Events WITHOUT an eventId are
 * always added and carry no ack id — the client treats them as delivered on
 * any 2xx (no client code path enqueues an event without one today).
 *
 * @param {Array} existingAnalytics - the student's analytics array (mutated)
 * @param {Array} events - incoming events
 * @returns {{ addedCount: number, addedEventIds: string[], duplicateEventIds: string[] }}
 */
function applyEventsWithAck(existingAnalytics, events) {
    const addedEventIds = [];
    const duplicateEventIds = [];
    let addedCount = 0;
    (events || []).forEach(event => {
        if (event && event.eventId) {
            const seen = (existingAnalytics || []).some(a => a && a.eventId === event.eventId);
            if (seen) {
                duplicateEventIds.push(event.eventId);
                return;
            }
            addedEventIds.push(event.eventId);
        }
        existingAnalytics.push(event);
        addedCount++;
    });
    return { addedCount, addedEventIds, duplicateEventIds };
}

const GEO_SAMPLE_CAP = 30;

/**
 * Diverts `type:'geo'` events out of the analytics stream (v2, 2026-09-26):
 * geo events NEVER enter the analytics array. ALL geo eventIds (valid or not)
 * are returned for acking so clients clear their queues; raw events are
 * returned in arrival order for applyGeoSamples. Invalid fixes are dropped
 * there (defense in depth — client already rounds; we re-round here).
 *
 * @param {Array} events
 * @returns {{ geoEvents: Array, geoEventIds: string[], cleanEvents: Array }}
 */
function extractGeoUpdates(events) {
    const geoEvents = [];
    const geoEventIds = [];
    const cleanEvents = [];
    (events || []).forEach(event => {
        if (event && event.type === 'geo') {
            if (event.eventId) geoEventIds.push(event.eventId);
            geoEvents.push(event);
            return;
        }
        cleanEvents.push(event);
    });
    return { geoEvents, geoEventIds, cleanEvents };
}

/** Beijing-time calendar date (China has no DST — fixed +8 offset is exact). */
function _beijingDate(tsMs) {
    return new Date((Number.isFinite(tsMs) ? tsMs : 0) + 8 * 3600e3).toISOString().slice(0, 10);
}

function _validGeoFix(event) {
    const lat = Number(event && event.lat);
    const lng = Number(event && event.lng);
    if (event && (event.lat === '' || event.lat === null || event.lng === '' || event.lng === null)) return null;
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    // Timestamp is client-supplied, so it is re-parsed and clamped instead of
    // stored verbatim: garbage/absent/unparsable → now, future-dated → now, and
    // the stored string is always a real ISO stamp we generated (never an
    // unbounded-length client blob). Clamping to `now` (not rejecting) keeps
    // the offline queue replay this repo's iPads depend on: a fix captured
    // hours ago still lands with its own past time, only the impossible ones
    // collapse onto the server clock.
    const t = Date.parse(event && event.timestamp);
    return {
        lat: Math.round(lat * 100) / 100,
        lng: Math.round(lng * 100) / 100,
        capturedAt: new Date(Number.isFinite(t) ? Math.min(t, Date.now()) : Date.now()).toISOString()
    };
}

/**
 * Consensus home over samples: group by ~1km cell, count DISTINCT Beijing
 * calendar days per cell (burst of same-day logins = 1 vote), winner = most
 * days, tie = most recent fix. Returns the v1-compatible `geo` shape plus
 * additive days/samples confidence fields. Returns null for an empty (or
 * missing) sample list — callers must handle it.
 */
function _consensusGeo(samples) {
    if (!samples || !samples.length) return null;
    const byCell = new Map();
    samples.forEach(s => {
        const key = s.lat.toFixed(2) + ',' + s.lng.toFixed(2);
        let c = byCell.get(key);
        if (!c) { c = { lat: s.lat, lng: s.lng, days: new Set(), latest: 0 }; byCell.set(key, c); }
        c.days.add(_beijingDate(new Date(s.capturedAt).getTime()));
        const t = new Date(s.capturedAt).getTime() || 0;
        if (t > c.latest) c.latest = t;
    });
    let best = null;
    byCell.forEach(c => {
        if (!best || c.days.size > best.days.size ||
            (c.days.size === best.days.size && c.latest > best.latest)) best = c;
    });
    return {
        lat: best.lat, lng: best.lng,
        capturedAt: new Date(best.latest).toISOString(),
        source: 'browser', days: best.days.size, samples: samples.length
    };
}

/**
 * Appends validated fixes to user.geoSamples (dedup: same cell + same Beijing
 * day keeps only the first; cap GEO_SAMPLE_CAP trims oldest) and recomputes
 * user.geo as the unique-day consensus. Seeds from a legacy v1 user.geo when
 * no sample list exists yet, so old captures count as one day-vote instead of
 * vanishing. Mutates user; returns true when anything changed.
 *
 * @param {Object} user - the student doc (mutated)
 * @param {Array} geoEvents - raw type:'geo' events from extractGeoUpdates
 * @returns {boolean}
 */
function applyGeoSamples(user, geoEvents) {
    if (!user || !geoEvents || !geoEvents.length) return false;
    if (!Array.isArray(user.geoSamples)) {
        user.geoSamples = [];
        const g = user.geo;
        if (g && Number.isFinite(Number(g.lat)) && Number.isFinite(Number(g.lng))) {
            user.geoSamples.push({
                lat: Number(g.lat), lng: Number(g.lng),
                capturedAt: g.capturedAt || new Date(0).toISOString()
            });
        }
    }
    let changed = false;
    geoEvents.forEach(ev => {
        const fix = _validGeoFix(ev);
        if (!fix) return;
        const day = _beijingDate(new Date(fix.capturedAt).getTime());
        const dup = user.geoSamples.some(s =>
            s.lat === fix.lat && s.lng === fix.lng &&
            _beijingDate(new Date(s.capturedAt).getTime()) === day);
        if (dup) return;
        user.geoSamples.push(fix);
        if (user.geoSamples.length > GEO_SAMPLE_CAP) {
            user.geoSamples = user.geoSamples.slice(-GEO_SAMPLE_CAP);
        }
        changed = true;
    });
    if (changed && user.geoSamples.length) user.geo = _consensusGeo(user.geoSamples);
    return changed;
}

/**
 * Checks if the student document's analytics array has grown too large (>=700 events).
 * If so, creates a permanent archive document in Cosmos DB before trimming the active
 * document's analytics array. Fail-safe: if archive creation fails, active document
 * is NOT trimmed.
 *
 * @param {Object} container Cosmos DB container
 * @param {Object} user Student document
 * @param {Object} [context] Azure Functions context
 */
async function maybeArchiveAnalytics(container, user, context) {
    if (!container || !user || !user.analytics) return;

    const { shouldArchive, retained, toArchive } = splitAnalyticsForArchive(user.analytics);
    if (!shouldArchive || toArchive.length === 0) return;

    const archiveDoc = {
        id: `archive_${user.id}_${Date.now()}`,
        type: 'student_analytics_archive',
        studentId: user.id,
        login: user.login,
        fullName: user.fullName,
        archivedAt: new Date().toISOString(),
        totalArchivedEvents: toArchive.length,
        sessionCountAtArchive: user.sessionCount,
        events: toArchive
    };

    try {
        await container.items.create(archiveDoc);
        // Only trim active document if archive creation succeeded in Cosmos DB
        user.analytics = retained;
        if (context && typeof context.log === 'function') {
            context.log(`Archived ${toArchive.length} events for ${user.id} to ${archiveDoc.id}. Retained ${retained.length} events.`);
        }
    } catch (archiveErr) {
        if (context && typeof context.warn === 'function') {
            context.warn(`Failed to create analytics archive for ${user.id}:`, archiveErr);
        }
        // Do not trim user.analytics if archive fails — ensures zero data loss
    }
}

app.http('saveAnalytics', {
    route: 'saveAnalytics',
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        const saveStartedAt = Date.now();
        let progressWriteRu = null;
        try {
            if (!validateApiKey(request)) return { status: 403, body: 'Forbidden.' };

            // Parse first so we can read a token the unload beacon ships in the
            // body (sendBeacon/keepalive can't set headers; SWA drops POST query
            // params). Identity still comes from the verified token — never
            // trusted from the body's studentId — and legacy (no-token) mode
            // falls back to the client-supplied id.
            const body = await request.json();
            const authGate = auth.requireAuth(request, body.authToken);
            if (authGate.error) return authGate.error;
            const token = authGate.token;

            const studentId = token ? token.sub : body.studentId; // scope to self only
            const { events, srState, incrementSession, srSeq, srDelta } = body;

            if (!events || !Array.isArray(events) || events.length === 0) {
                return { status: 400, body: 'Missing events array.' };
            }

            // Geo diversion (v2, 2026-09-26): geo events never enter the analytics
            // array — valid fixes accumulate in user.geoSamples and the top-level
            // user.geo is recomputed as the unique-day consensus (applyGeoSamples).
            const { geoEvents, geoEventIds, cleanEvents } = extractGeoUpdates(events);

            // LOST-UPDATE GUARD (2026-09-04, "Doris silent-200" root cause):
            // saveAnalytics is a read-modify-write of the WHOLE student doc.
            // Two concurrent flushes (crash-reload login beacon racing the
            // killed page's in-flight debounced flush) both read the same
            // doc, both upsert — last writer wins and the loser's JUST-ACKED
            // events are silently erased. Proven live 2026-09-04: 15 rounds
            // of 2 concurrent writes → 50 of 150 acked events missing (33%).
            // Doris's iPad reloads constantly (WebContent kills) → constant
            // overlap; the healthy fleet never overlaps → never loses.
            // Fix: optimistic concurrency — replace with IfMatch(_etag); on
            // a 412/precondition failure re-read, re-apply (dedup drops what
            // the winner already wrote), retry. Bounded, then 409.
            const container = getContainer();
            let added = 0, addedEventIds = [], duplicateEventIds = [];
            let sessionCount = null, srApplied = false;
            const MAX_ATTEMPTS = 4;
            for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
                let user, etag;
                if (attempt === 1) {
                    const { resources: items } = await container.items
                        .query({ query: 'SELECT * FROM c WHERE c.id = @id', parameters: [{ name: '@id', value: studentId }] })
                        .fetchAll();
                    if (items.length === 0) return { status: 404, body: 'Student not found.' };
                    user = items[0];
                } else {
                    // Re-read AFTER losing the race so we merge onto the winner.
                    try {
                        const { resource } = await container.item(studentId, studentId).read();
                        user = resource;
                    } catch (readErr) {
                        if (readErr && readErr.code === 404) return { status: 404, body: 'Student not found.' };
                        throw readErr;
                    }
                }
                etag = user._etag;
                // PK-safe point-write: some legacy docs (93 in prod, incl.
                // doris) predate the /studentId partition-key field and live
                // with a null PK value — guessing PK=id 404s them. Use the
                // doc's own studentId when present, else a null-PK write
                // (partition key omitted = targets the null-PK partition).
                const pkValue = user.studentId !== undefined ? user.studentId : undefined;
                if (!user.analytics) user.analytics = [];
                // Idempotent de-dup with per-event acks: the client stamps each
                // event with a stable eventId, and (2026-09-03a, "Doris silent-200")
                // the response lists EXACTLY which eventIds were added vs
                // skipped-as-duplicate so the client only clears its persisted
                // queue when the server accounts for every shipped event. On a
                // concurrency retry the dedup also drops events the race winner
                // already persisted — exactly the merge semantics we need.
                if (geoEvents.length) applyGeoSamples(user, geoEvents); // v2 consensus (idempotent on retry)
                ({ addedCount: added, addedEventIds, duplicateEventIds } = applyEventsWithAck(user.analytics, cleanEvents));
                previewNotes.apply(user, cleanEvents);
                // SR newer-wins (2026-09-10, Doris stuck-flag fix): each client
                // SR update carries a monotonic srSeq. Stale replays (lost
                // response retried, beacon+fetch duplicates) must not re-apply
                // old state or double-increment the session counter. Legacy
                // clients without srSeq keep today's apply-always behavior.
                // (srApplied is declared outside the loop so the response can
                // report it; only the winning attempt's value escapes.)
                if (srState && typeof srState === 'object' && shouldApplySr(user.srSeq, srSeq)) {
                    // DELTA SYNC (2026-09-16): srDelta=true means the payload
                    // holds only this session's touched entries — merge onto
                    // stored state. Absent flag = legacy full replace.
                    // mergeSRDelta lives client-side in sr_engine.js; the
                    // server inlines the same key-overwrite merge here.
                    if (srDelta) {
                        const merged = {
                            vocab: Object.assign({}, (user.srState || {}).vocab || {}),
                            sentences: Object.assign({}, (user.srState || {}).sentences || {}),
                            sentencePairs: Object.assign({}, (user.srState || {}).sentencePairs || {})
                        };
                        for (const type of ['vocab', 'sentences', 'sentencePairs']) {
                            Object.assign(merged[type], (srState[type] || {}));
                        }
                        user.srState = merged;
                    } else {
                        user.srState = srState;
                    }
                    if (srSeq !== undefined && srSeq !== null) user.srSeq = srSeq;
                    if (incrementSession) user.sessionCount = (user.sessionCount || 0) + 1;
                    srApplied = true;
                } else if (incrementSession && (srSeq === undefined || srSeq === null)) {
                    user.sessionCount = (user.sessionCount || 0) + 1;
                    srApplied = true;
                }
                sessionCount = user.sessionCount || 0;

                // Automatic rolling archival: if user.analytics gets too large (>=700 events),
                // safely archive older events (keeping 90-day sessions + 500 recent events)
                // before saving the active record.
                await maybeArchiveAnalytics(container, user, context);

                try {
                    const progressWrite = await (pkValue !== undefined
                        ? container.item(studentId, pkValue).replace(user, { accessCondition: { type: 'IfMatch', condition: etag } })
                        : container.item(studentId).replace(user, { accessCondition: { type: 'IfMatch', condition: etag } }));
                    progressWriteRu = Number(progressWrite && progressWrite.requestCharge) || null;
                    break; // won the race — done
                } catch (replaceErr) {
                    const status = replaceErr && (replaceErr.code || replaceErr.statusCode);
                    const preconditionFailed = status === 412 ||
                        /precondition|etag/i.test(String(replaceErr && replaceErr.message));
                    if (preconditionFailed && attempt < MAX_ATTEMPTS) continue; // lost race — merge onto winner
                    throw replaceErr;
                }
            }

            // Delivery diagnostics (2026-09-03a): one tiny record per accepted
            // saveAnalytics request, in a separate telemetry doc. Purpose: the
            // 2026-08-28→09-03 Doris iPad blackout proved a client can receive
            // ok-looking responses while nothing persists server-side — with no
            // App Insights on the SWA, this doc is the only server-side trace.
            // Best-effort: diagnostics failures must NEVER fail the save.
            try {
                const ua = request.headers.get('user-agent') || '';
                await getContainer().items.upsert({
                    id: 'delivery_diag_saveAnalytics',
                    type: 'delivery_diagnostics',
                    updatedAt: new Date().toISOString(),
                    // Single-slot ring: last accepted request only. If Doris's
                    // fetch flushes go missing again, absence of her UA here
                    // while her device events keep arriving proves the
                    // requests never reach the function (edge/network loss).
                    recent: [{
                        ts: new Date().toISOString(),
                        serverSaveMs: Date.now() - saveStartedAt,
                        progressWriteRu,
                        studentId, added, total: events.length,
                        ua: ua.slice(0, 120),
                        transport: request.headers.get('x-auth-token') ? 'header' : 'body'
                    }]
                });
            } catch (diagErr) {
                context.warn('delivery diagnostics write failed (non-fatal):', diagErr);
            }

            return {
                status: 200,
                jsonBody: {
                    success: true,
                    message: `${added} event(s) saved (${events.length - added} duplicate(s) skipped).`,
                    addedEventIds: geoEventIds.concat(addedEventIds),
                    duplicateEventIds,
                    sessionCount: sessionCount !== null ? sessionCount : undefined,
                    srApplied,
                    srSeq: srSeq !== undefined && srSeq !== null ? srSeq : undefined
                }
            };
        } catch (error) {
            context.error('saveAnalytics failed:', error);
            return { status: 500, body: 'Server error saving analytics.' };
        }
    }
});

module.exports = {
    splitAnalyticsForArchive,
    maybeArchiveAnalytics,
    applyEventsWithAck,
    shouldApplySr,
    extractGeoUpdates, applyGeoSamples, _consensusGeo, GEO_SAMPLE_CAP,
    ARCHIVE_TRIGGER_COUNT,
    RETENTION_DAYS_MS,
    RETENTION_MAX_RECENT_EVENTS
};

