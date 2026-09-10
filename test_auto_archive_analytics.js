const assert = require('assert');
const {
    splitAnalyticsForArchive,
    maybeArchiveAnalytics,
    applyEventsWithAck,
    shouldApplySr,
    ARCHIVE_TRIGGER_COUNT,
    RETENTION_DAYS_MS,
    RETENTION_MAX_RECENT_EVENTS
} = require('./api/src/functions/saveAnalytics.js');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log('PASS: ' + name);
        passed++;
    } catch (e) {
        console.error('FAIL: ' + name);
        console.error(e);
        failed++;
    }
}

async function testAsync(name, fn) {
    try {
        await fn();
        console.log('PASS: ' + name);
        passed++;
    } catch (e) {
        console.error('FAIL: ' + name);
        console.error(e);
        failed++;
    }
}

async function main() {
    console.log('=== TEST SUITE: Auto-Archive Analytics ===\n');

    test('Threshold: does not archive when events < 700', () => {
        const events = Array.from({ length: 699 }, (_, i) => ({
            type: 'exercise',
            eventId: 'ex_' + i,
            timestamp: new Date(Date.now() - i * 1000).toISOString()
        }));
        const res = splitAnalyticsForArchive(events);
        assert.strictEqual(res.shouldArchive, false);
        assert.strictEqual(res.retained.length, 699);
        assert.strictEqual(res.toArchive.length, 0);
    });

    test('Threshold: triggers archival when events >= 700', () => {
        const events = Array.from({ length: 750 }, (_, i) => ({
            type: 'exercise',
            eventId: 'ex_' + i,
            timestamp: new Date(Date.now() - (750 - i) * 1000).toISOString()
        }));
        const res = splitAnalyticsForArchive(events);
        assert.strictEqual(res.shouldArchive, true);
        assert.strictEqual(res.retained.length, 500);
        assert.strictEqual(res.toArchive.length, 250);
        assert.strictEqual(res.retained.length + res.toArchive.length, 750);
    });

    test('90-Day Retention: keeps all sessions from last 90 days even if outside last 500 events', () => {
        const now = Date.now();
        const events = [];

        // 50 old sessions (120 days ago)
        for (let i = 0; i < 50; i++) {
            events.push({
                type: 'session',
                sessionType: 'study',
                eventId: 'old_sess_' + i,
                timestamp: new Date(now - (120 * 24 * 3600 * 1000) + i * 1000).toISOString()
            });
        }

        // 30 recent sessions (45 days ago)
        for (let i = 0; i < 30; i++) {
            events.push({
                type: 'session',
                sessionType: 'study',
                eventId: 'recent_sess_' + i,
                timestamp: new Date(now - (45 * 24 * 3600 * 1000) + i * 1000).toISOString()
            });
        }

        // 700 recent exercises (within last 10 days)
        for (let i = 0; i < 700; i++) {
            events.push({
                type: 'exercise',
                eventId: 'ex_' + i,
                timestamp: new Date(now - (10 * 24 * 3600 * 1000) + i * 1000).toISOString()
            });
        }

        assert.strictEqual(events.length, 780);
        const res = splitAnalyticsForArchive(events, now);

        assert.strictEqual(res.shouldArchive, true);
        
        // Check that all 30 recent sessions are in retained
        for (let i = 0; i < 30; i++) {
            assert.ok(res.retained.some(e => e.eventId === 'recent_sess_' + i), 'Recent session ' + i + ' must be retained');
        }

        // Check that the 50 old sessions are in toArchive
        for (let i = 0; i < 50; i++) {
            assert.ok(res.toArchive.some(e => e.eventId === 'old_sess_' + i), 'Old session ' + i + ' must be archived');
        }

        // Check that the last 500 events are retained
        const last500 = events.slice(-500);
        for (const e of last500) {
            assert.ok(res.retained.some(r => r.eventId === e.eventId), 'Last 500 event ' + e.eventId + ' must be retained');
        }

        // Total events match exactly
        assert.strictEqual(res.retained.length + res.toArchive.length, events.length);
    });

    await testAsync('maybeArchiveAnalytics: successfully creates archive document and trims active array', async () => {
        let createdDoc = null;
        const mockContainer = {
            items: {
                create: async (doc) => {
                    createdDoc = doc;
                    return { statusCode: 201 };
                }
            }
        };

        const now = Date.now();
        const user = {
            id: 'student_test1',
            login: 'test1',
            fullName: 'Test Student',
            sessionCount: 42,
            srState: { vocab: { apple: { interval: 8 } } },
            analytics: Array.from({ length: 800 }, (_, i) => ({
                type: 'exercise',
                eventId: 'ex_' + i,
                timestamp: new Date(now - (800 - i) * 1000).toISOString()
            }))
        };

        await maybeArchiveAnalytics(mockContainer, user, { log: () => {}, warn: () => {} });

        assert.ok(createdDoc !== null, 'Archive document must be created');
        assert.strictEqual(createdDoc.studentId, 'student_test1');
        assert.strictEqual(createdDoc.totalArchivedEvents, 300);
        assert.strictEqual(createdDoc.events.length, 300);
        assert.strictEqual(createdDoc.sessionCountAtArchive, 42);
        assert.strictEqual(user.analytics.length, 500);
        assert.strictEqual(user.sessionCount, 42, 'sessionCount must not be altered');
        assert.strictEqual(user.srState.vocab.apple.interval, 8, 'srState must not be altered');
    });

    await testAsync('maybeArchiveAnalytics: fail-safe prevents trimming if archive creation throws', async () => {
        const mockContainer = {
            items: {
                create: async () => {
                    throw new Error('Cosmos DB connection timeout');
                }
            }
        };

        const now = Date.now();
        const user = {
            id: 'student_test2',
            login: 'test2',
            fullName: 'Test Student 2',
            sessionCount: 10,
            srState: { vocab: {} },
            analytics: Array.from({ length: 800 }, (_, i) => ({
                type: 'exercise',
                eventId: 'ex_' + i,
                timestamp: new Date(now - (800 - i) * 1000).toISOString()
            }))
        };

        let warningLogged = false;
        await maybeArchiveAnalytics(mockContainer, user, {
            log: () => {},
            warn: () => { warningLogged = true; }
        });

        assert.ok(warningLogged, 'Warning should be logged on error');
        assert.strictEqual(user.analytics.length, 800, 'Active analytics array must NOT be trimmed on error');
    });

    // ---- applyEventsWithAck (2026-09-03a, "Doris silent-200" server contract) ----
    // The client only drains its persisted queue when the response accounts for
    // every shipped eventId, so the ack arrays MUST be exactly right.
    test('Ack: all-new events -> every id in addedEventIds, no duplicates', () => {
        const existing = [{ eventId: 'old_1' }];
        const { addedCount, addedEventIds, duplicateEventIds } = applyEventsWithAck(existing, [
            { eventId: 'new_1' }, { eventId: 'new_2' }
        ]);
        assert.strictEqual(addedCount, 2);
        assert.deepStrictEqual(addedEventIds.sort(), ['new_1', 'new_2']);
        assert.deepStrictEqual(duplicateEventIds, []);
        assert.strictEqual(existing.length, 3);
    });

    test('Ack: already-seen events -> duplicateEventIds, array not re-added', () => {
        const existing = [{ eventId: 'ex_1' }, { eventId: 'ex_2' }];
        const { addedCount, addedEventIds, duplicateEventIds } = applyEventsWithAck(existing, [
            { eventId: 'ex_1' }, { eventId: 'ex_3' }
        ]);
        assert.strictEqual(addedCount, 1);
        assert.deepStrictEqual(addedEventIds, ['ex_3']);
        assert.deepStrictEqual(duplicateEventIds, ['ex_1']);
        assert.strictEqual(existing.length, 3, 'duplicate must not be appended');
    });

    test('Ack: event without eventId is added but carries no ack id', () => {
        const existing = [];
        const { addedCount, addedEventIds } = applyEventsWithAck(existing, [{ type: 'exercise' }]);
        assert.strictEqual(addedCount, 1);
        assert.deepStrictEqual(addedEventIds, []);
        assert.strictEqual(existing.length, 1);
    });

    test('Ack: null/empty events -> zero counts, empty arrays', () => {
        const { addedCount, addedEventIds, duplicateEventIds } = applyEventsWithAck([], null);
        assert.strictEqual(addedCount, 0);
        assert.deepStrictEqual(addedEventIds, []);
        assert.deepStrictEqual(duplicateEventIds, []);
    });

    // ---- shouldApplySr (2026-09-10, Doris stuck-flag fix) ----
    // Each client SR update carries a monotonic srSeq; the server applies at
    // most once. Legacy clients (no seq) keep apply-always behavior.
    test('SR seq: legacy (no incoming seq) always applies', () => {
        assert.strictEqual(shouldApplySr(undefined, undefined), true);
        assert.strictEqual(shouldApplySr(0, undefined), true);
        assert.strictEqual(shouldApplySr(999, null), true);
    });
    test('SR seq: first write applies (stored absent/0, incoming set)', () => {
        assert.strictEqual(shouldApplySr(undefined, 123), true);
        assert.strictEqual(shouldApplySr(0, 123), true);
    });
    test('SR seq: newer incoming applies', () => {
        assert.strictEqual(shouldApplySr(100, 123), true);
    });
    test('SR seq: replay of same seq is ignored (no double increment)', () => {
        assert.strictEqual(shouldApplySr(123, 123), false);
    });
    test('SR seq: stale resend is ignored', () => {
        assert.strictEqual(shouldApplySr(200, 123), false);
    });

    console.log('\n--- AUTO-ARCHIVE ANALYTICS TEST RESULTS ---');
    console.log(passed + ' passed, ' + failed + ' failed');
    if (failed > 0) process.exit(1);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
