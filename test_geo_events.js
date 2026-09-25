const assert = require('assert');
const { extractGeoUpdates } = require('./api/src/functions/saveAnalytics.js');

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log('PASS: ' + name); passed++; }
    catch (e) { console.error('FAIL: ' + name); console.error(e); failed++; }
}

console.log('=== TEST SUITE: Geo Event Extraction ===\n');

test('non-geo events pass through untouched', () => {
    const events = [{ type: 'exercise', eventId: 'ex_1' }, { type: 'session', eventId: 'se_1' }];
    const r = extractGeoUpdates(events);
    assert.strictEqual(r.geo, null);
    assert.deepStrictEqual(r.geoEventIds, []);
    assert.strictEqual(r.cleanEvents.length, 2);
});

test('valid geo event is extracted, removed from cleanEvents, and acked', () => {
    const events = [
        { type: 'exercise', eventId: 'ex_1' },
        { type: 'geo', lat: 25.05, lng: 102.71, timestamp: '2026-09-25T10:00:00.000Z', eventId: 'geo_1' }
    ];
    const r = extractGeoUpdates(events);
    assert.strictEqual(r.cleanEvents.length, 1);
    assert.deepStrictEqual(r.geoEventIds, ['geo_1']);
    assert.strictEqual(r.geo.lat, 25.05);
    assert.strictEqual(r.geo.lng, 102.71);
    assert.strictEqual(r.geo.capturedAt, '2026-09-25T10:00:00.000Z');
    assert.strictEqual(r.geo.source, 'browser');
});

test('server re-rounds to 2 decimals (defense in depth)', () => {
    const r = extractGeoUpdates([{ type: 'geo', lat: 25.045678, lng: 102.712345, eventId: 'geo_1' }]);
    assert.strictEqual(r.geo.lat, 25.05);
    assert.strictEqual(r.geo.lng, 102.71);
});

test('invalid coords: event acked (client clears queue) but no geo written', () => {
    const bad = [
        { type: 'geo', lat: 'abc', lng: 102.7, eventId: 'geo_bad1' },
        { type: 'geo', lat: 95, lng: 102.7, eventId: 'geo_bad2' },
        { type: 'geo', lat: 25, lng: NaN, eventId: 'geo_bad3' },
        { type: 'geo', eventId: 'geo_bad4' }
    ];
    const r = extractGeoUpdates(bad);
    assert.strictEqual(r.geo, null);
    assert.deepStrictEqual(r.geoEventIds, ['geo_bad1', 'geo_bad2', 'geo_bad3', 'geo_bad4']);
    assert.strictEqual(r.cleanEvents.length, 0);
});

test('multiple geo events: latest timestamp wins', () => {
    const r = extractGeoUpdates([
        { type: 'geo', lat: 25.10, lng: 102.10, timestamp: '2026-09-20T10:00:00.000Z', eventId: 'geo_old' },
        { type: 'geo', lat: 25.20, lng: 102.20, timestamp: '2026-09-24T10:00:00.000Z', eventId: 'geo_new' }
    ]);
    assert.strictEqual(r.geo.lat, 25.2);
    assert.strictEqual(r.geo.capturedAt, '2026-09-24T10:00:00.000Z');
    assert.deepStrictEqual(r.geoEventIds, ['geo_old', 'geo_new']);
});

test('null/empty input is safe', () => {
    assert.deepStrictEqual(extractGeoUpdates(null), { geo: null, geoEventIds: [], cleanEvents: [] });
    assert.deepStrictEqual(extractGeoUpdates([]), { geo: null, geoEventIds: [], cleanEvents: [] });
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
