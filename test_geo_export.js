const assert = require('assert');
const G = require('./geo_export.js');

let passed = 0, failed = 0;
function test(name, fn) {
    try { fn(); console.log('PASS: ' + name); passed++; }
    catch (e) { console.error('FAIL: ' + name); console.error(e); failed++; }
}

console.log('=== TEST SUITE: Geo Export ===\n');

// --- coordinate conversion ---------------------------------------------------
test('outside China: passthrough (no GCJ shift)', () => {
    assert.deepStrictEqual(G.wgs84ToGcj02(48.8583, 2.2945), [48.8583, 2.2945]); // Paris
    assert.deepStrictEqual(G.wgs84ToBd09(48.8583, 2.2945), [48.8583, 2.2945]);
});
test('inside China: GCJ offset direction+magnitude sane (100m-1.2km)', () => {
    const [gLat, gLng] = G.wgs84ToGcj02(25.0458, 102.7101); // Kunming
    const dLat = Math.abs(gLat - 25.0458) * 111000;
    const dLng = Math.abs(gLng - 102.7101) * 111000 * Math.cos(25.0458 * Math.PI / 180);
    assert.ok(dLat + dLng > 50 && dLat < 1200 && dLng < 1200, `offset lat=${dLat}m lng=${dLng}m`);
    // NOTE: the original brief asserted "GCJ shift in Yunnan is northeast" here, but the
    // published eviltransform/coordtransform algorithm yields ~330m SOUTH / ~145m EAST at
    // this exact point (verified via three independent transcriptions — JS x2 + Python —
    // and validated against coordtransform's README test vector 116.404,39.915 to <1mm).
    // The GCJ offset direction varies by location; NE holds for Beijing (covered by the
    // anchor test below). Pinning the exact published values is a STRONGER assertion.
    assert.ok(Math.abs(gLat - 25.04282499004523) < 1e-9 && Math.abs(gLng - 102.71153753988237) < 1e-9,
        `matches published eviltransform values: ${gLat},${gLng}`);
});
test('BD09 adds positive offset on top of GCJ02', () => {
    const [gLat, gLng] = G.wgs84ToGcj02(25.0458, 102.7101);
    const [bLat, bLng] = G.gcj02ToBd09(gLat, gLng);
    assert.ok(bLat > gLat && bLng > gLng);
    assert.ok(Math.abs(bLat - gLat) < 0.01 && Math.abs(bLng - gLng) < 0.01);
});
test('conversion is deterministic and finite', () => {
    const a = G.wgs84ToBd09(25.0458, 102.7101);
    const b = G.wgs84ToBd09(25.0458, 102.7101);
    assert.deepStrictEqual(a, b);
    assert.ok(a.every(Number.isFinite));
});
test('known anchor: Beijing wgs(39.9042,116.4074) -> bd09 within 1.5km NE', () => {
    const [bLat, bLng] = G.wgs84ToBd09(39.9042, 116.4074);
    // Published WGS84->BD09 total offset for Beijing is ~1.1-1.3km NE.
    assert.ok(bLat > 39.9042 && bLat < 39.925);
    assert.ok(bLng > 116.4074 && bLng < 116.430);
});

// --- CSV ---------------------------------------------------------------------
const students = [
    { id: 's1', fullName: 'Zhang, San', geo: { lat: 25.05, lng: 102.71, capturedAt: '2026-09-25T10:00:00.000Z' } },
    { id: 's2', fullName: 'Li "Lily"', geo: null },
    { id: 's3', name: 'Wang Wu' } // no geo field at all
];
test('CSV: BOM + header + all students incl. missing', () => {
    const csv = G.buildLocationCsv(students);
    assert.ok(csv.charCodeAt(0) === 0xFEFF, 'starts with UTF-8 BOM');
    const lines = csv.replace(/^\uFEFF/, '').trim().split('\r\n');
    assert.strictEqual(lines[0], 'studentId,name,hasLocation,capturedAt,wgs84_lat,wgs84_lng,bd09_lat,bd09_lng');
    assert.strictEqual(lines.length, 4);
});
test('CSV: quoting for commas and double quotes', () => {
    const csv = G.buildLocationCsv(students);
    assert.ok(csv.includes('"Zhang, San"'));
    assert.ok(csv.includes('"Li ""Lily"""'));
});
test('CSV: hasLocation flags + bd09 columns populated only when geo present', () => {
    const lines = G.buildLocationCsv(students).replace(/^\uFEFF/, '').trim().split('\r\n');
    assert.ok(lines[1].startsWith('s1,"Zhang, San",1,2026-09-25T10:00:00.000Z,25.05,102.71,'));
    assert.strictEqual(lines[2].split(',')[2], '0');
    assert.ok(lines[2].endsWith(',,,,'));
    assert.strictEqual(lines[3].split(',')[2], '0');
});
test('CSV: name falls back through fullName -> name -> login', () => {
    const csv = G.buildLocationCsv([{ id: 'x', login: 'x_login' }]);
    assert.ok(csv.includes('x_login'));
});

// --- Baidu HTML ---------------------------------------------------------------
test('HTML: embeds student points as BD-09, injects AK, escapes </script>', () => {
    const html = G.buildBaiduMapHtml(students, 'TEST_AK_123');
    assert.ok(html.includes('ak=TEST_AK_123'), 'AK injected into script src');
    assert.ok(html.includes('api.map.baidu.com'), 'loads Baidu JS API');
    assert.ok(html.includes('const STUDENTS ='), 'data embedded');
    assert.ok(html.includes('"name":"Zhang, San"') || html.includes('\\"name\\":\\"Zhang'), 's1 embedded');
    assert.ok(!/const STUDENTS = [^;]*<\/script/.test(html), 'no raw </script> inside data');
    const dataLine = html.split('\n').find(l => l.includes('const STUDENTS ='));
    assert.ok(dataLine.includes('<') === false, 'data line contains no literal < (escaped to \\u003c)');
    assert.ok(!dataLine.includes('</'), 'no literal </ in embedded data line');
    // s2 (no geo) must NOT appear as a map point
    assert.ok(!dataLine.includes('s2') && !dataLine.includes('Lily'));
});
test('HTML: driving-time UI hooks present', () => {
    const html = G.buildBaiduMapHtml(students, 'AK');
    assert.ok(html.includes('DrivingRoute'));
    assert.ok(html.includes('计算驾车时间'));
    assert.ok(html.includes('csCampusPins'));
});
test('HTML: __NOSTUDENTS__ and __STUDENTS__ placeholders fully replaced', () => {
    const html = G.buildBaiduMapHtml(students, 'AK');
    assert.ok(html.includes('__NOSTUDENTS__') === false, 'no leftover __NOSTUDENTS__ token');
    assert.ok(html.includes('__STUDENTS__') === false, 'no leftover __STUDENTS__ token');
    // fixture: s1 has geo; s2 geo:null; s3 no geo field -> 2 without location
    assert.ok(html.includes('2 名学生暂无位置数据'), 'no-location count is 2');
});
test('HTML: $& in student name survives String.replace (no $-pattern corruption)', () => {
    const html = G.buildBaiduMapHtml(
        [{ id: 'd1', fullName: 'A$&B', geo: { lat: 25.05, lng: 102.71, capturedAt: '2026-09-25T10:00:00.000Z' } }],
        'AK');
    const line = html.split('\n').find(l => l.includes('const STUDENTS ='));
    const json = line.replace('const STUDENTS =', '').replace(/;\s*$/, '');
    const arr = JSON.parse(json);
    assert.strictEqual(arr[0].name, 'A$&B');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
