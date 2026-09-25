// ============================================================================
// geo_export.js — student location export tooling (2026-09-25 campus survey).
// Loaded by teacher_dashboard.html AFTER teacher_dashboard.js (reads its
// top-level `allStudents`). Pure builders (conversion/CSV/HTML) are exported
// for Node tests via the guard at the bottom; DOM wiring no-ops in Node.
// Coordinates: browser geolocation yields WGS-84; Baidu maps use BD-09.
// Conversion is the standard eviltransform/coordtransform algorithm (MIT).
// ============================================================================

var GEO_PI = Math.PI;
var GEO_A = 6378245.0;                    // Krasovsky 1940 semi-major axis
var GEO_EE = 0.00669342162296594323;      // Krasovsky 1940 eccentricity^2
var GEO_X_PI = GEO_PI * 3000.0 / 180.0;

function outOfChina(lat, lng) {
    return !(lng > 73.66 && lng < 135.05 && lat > 3.86 && lat < 53.55);
}

function _geoTransformLat(x, y) {
    var ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * GEO_PI) + 20.0 * Math.sin(2.0 * x * GEO_PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(y * GEO_PI) + 40.0 * Math.sin(y / 3.0 * GEO_PI)) * 2.0 / 3.0;
    ret += (160.0 * Math.sin(y / 12.0 * GEO_PI) + 320 * Math.sin(y * GEO_PI / 30.0)) * 2.0 / 3.0;
    return ret;
}

function _geoTransformLng(x, y) {
    var ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
    ret += (20.0 * Math.sin(6.0 * x * GEO_PI) + 20.0 * Math.sin(2.0 * x * GEO_PI)) * 2.0 / 3.0;
    ret += (20.0 * Math.sin(x * GEO_PI) + 40.0 * Math.sin(x / 3.0 * GEO_PI)) * 2.0 / 3.0;
    ret += (150.0 * Math.sin(x / 12.0 * GEO_PI) + 300.0 * Math.sin(x / 30.0 * GEO_PI)) * 2.0 / 3.0;
    return ret;
}

function wgs84ToGcj02(lat, lng) {
    if (outOfChina(lat, lng)) return [lat, lng];
    var dLat = _geoTransformLat(lng - 105.0, lat - 35.0);
    var dLng = _geoTransformLng(lng - 105.0, lat - 35.0);
    var radLat = lat / 180.0 * GEO_PI;
    var magic = Math.sin(radLat);
    magic = 1 - GEO_EE * magic * magic;
    var sqrtMagic = Math.sqrt(magic);
    dLat = (dLat * 180.0) / ((GEO_A * (1 - GEO_EE)) / (magic * sqrtMagic) * GEO_PI);
    dLng = (dLng * 180.0) / (GEO_A / sqrtMagic * Math.cos(radLat) * GEO_PI);
    return [lat + dLat, lng + dLng];
}

function gcj02ToBd09(lat, lng) {
    var z = Math.sqrt(lng * lng + lat * lat) + 0.00002 * Math.sin(lat * GEO_X_PI);
    var theta = Math.atan2(lat, lng) + 0.00003 * Math.cos(lng * GEO_X_PI);
    return [z * Math.sin(theta) + 0.006, z * Math.cos(theta) + 0.0065];
}

function wgs84ToBd09(lat, lng) {
    if (outOfChina(lat, lng)) return [lat, lng]; // BD-09 datum only applies inside China
    var g = wgs84ToGcj02(lat, lng);
    return gcj02ToBd09(g[0], g[1]);
}

// --- CSV ---------------------------------------------------------------------
function _csvCell(v) {
    var s = String(v === null || v === undefined ? '' : v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function _studentName(s) {
    return (s && (s.fullName || s.name || s.login)) || '';
}

function buildLocationCsv(students) {
    var rows = [['studentId', 'name', 'hasLocation', 'capturedAt', 'wgs84_lat', 'wgs84_lng', 'bd09_lat', 'bd09_lng']];
    (students || []).forEach(function (s) {
        var g = s && s.geo;
        if (g && Number.isFinite(Number(g.lat)) && Number.isFinite(Number(g.lng))) {
            var b = wgs84ToBd09(Number(g.lat), Number(g.lng));
            rows.push([s.id, _studentName(s), 1, g.capturedAt || '', g.lat, g.lng, b[0].toFixed(6), b[1].toFixed(6)]);
        } else {
            rows.push([s.id, _studentName(s), 0, '', '', '', '', '']);
        }
    });
    return '\uFEFF' + rows.map(function (r) { return r.map(_csvCell).join(','); }).join('\r\n') + '\r\n';
}

// --- Baidu map HTML ------------------------------------------------------------
function _geoStudentsToPoints(students) {
    return (students || [])
        .filter(function (s) { return s && s.geo && Number.isFinite(Number(s.geo.lat)) && Number.isFinite(Number(s.geo.lng)); })
        .map(function (s) {
            var b = wgs84ToBd09(Number(s.geo.lat), Number(s.geo.lng));
            return { id: s.id, name: _studentName(s), lat: b[0], lng: b[1], capturedAt: s.geo.capturedAt || '' };
        });
}

function buildBaiduMapHtml(students, ak) {
    var points = _geoStudentsToPoints(students);
    // \u003c escaping keeps a malicious/odd name from closing the script tag.
    var data = JSON.stringify(points).replace(/</g, '\\u003c');
    var akSafe = String(ak || '').replace(/[^A-Za-z0-9_]/g, '');
    var generated = new Date().toISOString().slice(0, 10);
    return BAH_TEMPLATE
        .replace('__AK__', akSafe)
        .replace('__GENERATED__', generated)
        .replace('"__STUDENTS__"', function () { return data; })
        .replace('__NOSTUDENTS__', String((students || []).length - points.length));
}

var BAH_TEMPLATE = [
'<!DOCTYPE html>',
'<html lang="zh-CN"><head><meta charset="utf-8">',
'<meta name="viewport" content="width=device-width, initial-scale=1">',
'<title>学生位置分布 (__GENERATED__)</title>',
'<style>',
'html,body{margin:0;height:100%;font-family:system-ui,"Microsoft YaHei",sans-serif}',
'#map{position:absolute;top:0;bottom:0;left:0;right:360px}',
'#panel{position:absolute;top:0;bottom:0;right:0;width:360px;box-sizing:border-box;padding:12px;overflow:auto;background:#f7f7f8;border-left:1px solid #ddd}',
'button{padding:8px 12px;margin:4px 4px 4px 0;border:1px solid #bbb;border-radius:6px;background:#fff;cursor:pointer}',
'button.primary{background:#2563eb;color:#fff;border-color:#2563eb}',
'table{border-collapse:collapse;width:100%;font-size:12px;background:#fff}',
'td,th{border:1px solid #ddd;padding:4px 6px;text-align:left}',
'.hint{font-size:12px;color:#666;margin:6px 0}',
'</style></head><body>',
'<div id="map"></div>',
'<div id="panel">',
'<h3>学生位置分布</h3>',
'<p class="hint">__NOSTUDENTS__ 名学生暂无位置数据(未在导出中)。蓝点=学生,红点=候选校区。</p>',
'<button id="addCampusBtn">① 点击地图添加候选校区</button>',
'<button id="clearCampusBtn">清空校区</button>',
'<button id="driveBtn" class="primary">② 计算驾车时间</button>',
'<button id="copyBtn">复制结果CSV</button>',
'<div id="status" class="hint"></div>',
'<div id="campusList"></div>',
'<table id="results" style="display:none"></table>',
'<div id="summary"></div>',
'</div>',
'<script>',
'const STUDENTS = "__STUDENTS__";',
'const CAMPUSES_KEY = "csCampusPins";',
'let map, addingCampus = false, lastResults = [];',
'function loadCampuses(){ try { return JSON.parse(localStorage.getItem(CAMPUSES_KEY) || "[]"); } catch(e){ return []; } }',
'function saveCampuses(c){ localStorage.setItem(CAMPUSES_KEY, JSON.stringify(c)); renderCampusList(); }',
'function renderCampusList(){',
'  const c = loadCampuses();',
'  document.getElementById("campusList").innerHTML = c.length ? "<h4>候选校区</h4><ul>" + c.map((x,i)=>"<li>"+x.name+" <a href=\\"javascript:void(0)\\" onclick=\\"removeCampus("+i+")\\">删除</a></li>").join("") + "</ul>" : "";',
'}',
'function removeCampus(i){ const c = loadCampuses(); c.splice(i,1); saveCampuses(c); drawCampuses(); }',
'function drawCampuses(){',
'  (window.__campusMarkers||[]).forEach(m=>map.removeOverLay(m)); window.__campusMarkers=[];',
'  loadCampuses().forEach(c=>{',
'    const m = new BMapGL.Marker(new BMapGL.Point(c.lng, c.lat), {icon: new BMapGL.Icon("https://api.map.baidu.com/img/anchor.png", new BMapGL.Size(20,20))});',
'    m.setLabel(new BMapGL.Label(c.name, {offset: new BMapGL.Size(15,-5)}));',
'    window.__campusMarkers.push(m); map.addOverlay(m);',
'  });',
'}',
'function init(){',
'  map = new BMapGL.Map("map");',
'  const pts = STUDENTS.map(s=>new BMapGL.Point(s.lng, s.lat));',
'  STUDENTS.forEach(s=>{',
'    const m = new BMapGL.Marker(new BMapGL.Point(s.lng, s.lat));',
'    m.setLabel(new BMapGL.Label(s.name, {offset: new BMapGL.Size(15,-5)}));',
'    m.addEventListener("click", ()=>{ map.openInfoWindow(new BMapGL.InfoWindow("<b>"+s.name+"</b><br>采集: "+(s.capturedAt||"?").slice(0,10), {width:200}), m.getPosition()); });',
'    map.addOverlay(m);',
'  });',
'  if (pts.length) { map.setViewport(pts); } else { map.centerAndZoom(new BMapGL.Point(102.712, 25.040), 11); }',
'  drawCampuses(); renderCampusList();',
'  document.getElementById("addCampusBtn").onclick = ()=>{',
'    addingCampus = !addingCampus;',
'    document.getElementById("status").textContent = addingCampus ? "在地图上点击候选校区位置…" : "";',
'    map.setDefaultCursor(addingCampus ? "crosshair" : "default");',
'  };',
'  map.addEventListener("click", e=>{',
'    if (!addingCampus) return;',
'    const name = prompt("校区名称:", "候选" + (loadCampuses().length+1));',
'    if (name){ const c = loadCampuses(); c.push({name, lat: e.latlng.lat, lng: e.latlng.lng}); saveCampuses(c); drawCampuses(); }',
'    addingCampus = false; document.getElementById("status").textContent = ""; map.setDefaultCursor("default");',
'  });',
'  document.getElementById("clearCampusBtn").onclick = ()=>{ saveCampuses([]); drawCampuses(); };',
'  document.getElementById("driveBtn").onclick = computeDrivingTimes;',
'  document.getElementById("copyBtn").onclick = copyResultsCsv;',
'}',
'function extractDistDur(route){',
'  if (!route) return {km:null, min:null};',
'  const pick = v => (typeof v === "number") ? v : (v && typeof v.value === "number") ? v.value : null;',
'  let m = pick(route.distance), s = pick(route.duration);',
'  if (m === null && route.distance && route.distance.text){ const n = parseFloat(route.distance.text); if (!isNaN(n)) m = /公里|km/.test(route.distance.text) ? n*1000 : n; }',
'  if (s === null && route.duration && route.duration.text){ const n = parseFloat(route.duration.text); if (!isNaN(n)) s = /小时/.test(route.duration.text) ? n*3600 : n*60; }',
'  return { km: m===null?null:m/1000, min: s===null?null:s/60 };',
'}',
'function computeDrivingTimes(){',
'  const campuses = loadCampuses();',
'  if (!campuses.length){ alert("请先点击『添加候选校区』在地图上标注校区位置"); return; }',
'  const pairs = []; campuses.forEach(c=>STUDENTS.forEach(s=>pairs.push({c, s})));',
'  lastResults = []; let i = 0;',
'  const status = document.getElementById("status");',
'  const dr = new BMapGL.DrivingRoute(map, { policy: BMAP_DRIVING_POLICY_LEAST_TIME, onSearchComplete: onDone });',
'  let watchdog = null;',
'  function onDone(r){',
'    if (watchdog){ clearTimeout(watchdog); watchdog = null; }',
'    let km = null, min = null;',
'    try { const plan = r.getPlan(0); const dd = extractDistDur(plan && plan.getRoute(0)); km = dd.km; min = dd.min; if (km===null && plan && plan.getDistance){ const pd = plan.getDistance(false); if (typeof pd === "number") km = pd/1000; } } catch(e){}',
'    lastResults.push({ campus: pairs[i-1].c.name, student: pairs[i-1].s.name, km, min });',
'    status.textContent = "驾车路线 " + i + "/" + pairs.length;',
'    next();',
'  }',
'  function next(){',
'    if (i >= pairs.length){ status.textContent = "完成:" + pairs.length + " 条路线"; render(); return; }',
'    const p = pairs[i++];',
'    watchdog = setTimeout(()=>{ lastResults.push({campus:p.c.name, student:p.s.name, km:null, min:null}); status.textContent="超时跳过 " + i + "/" + pairs.length; next(); }, 8000);',
'    dr.search(new BMapGL.Point(p.c.lng, p.c.lat), new BMapGL.Point(p.s.lng, p.s.lat));',
'    setTimeout(()=>{}, 150);',
'  }',
'  next();',
'}',
'function render(){',
'  const t = document.getElementById("results"); t.style.display = "table";',
'  let html = "<tr><th>校区</th><th>学生</th><th>km</th><th>分钟</th></tr>";',
'  lastResults.forEach(r=>{ html += "<tr><td>"+r.campus+"</td><td>"+r.student+"</td><td>"+(r.km===null?"-":r.km.toFixed(1))+"</td><td>"+(r.min===null?"-":Math.round(r.min))+"</td></tr>"; });',
'  t.innerHTML = html;',
'  const byCampus = {};',
'  lastResults.forEach(r=>{ (byCampus[r.campus] = byCampus[r.campus]||[]).push(r); });',
'  let sum = "<h4>各校区汇总</h4><table><tr><th>校区</th><th>平均分钟</th><th>中位分钟</th><th>≤30分钟人数</th></tr>";',
'  Object.keys(byCampus).forEach(name=>{',
'    const mins = byCampus[name].map(r=>r.min).filter(x=>x!==null).sort((a,b)=>a-b);',
'    if (!mins.length) return;',
'    const avg = mins.reduce((a,b)=>a+b,0)/mins.length;',
'    const med = mins.length%2 ? mins[(mins.length-1)/2] : (mins[mins.length/2-1]+mins[mins.length/2])/2;',
'    const within = byCampus[name].filter(r=>r.min!==null && r.min<=30).length;',
'    sum += "<tr><td>"+name+"</td><td>"+Math.round(avg)+"</td><td>"+Math.round(med)+"</td><td>"+within+"/"+byCampus[name].length+"</td></tr>";',
'  });',
'  document.getElementById("summary").innerHTML = sum + "</table>";',
'}',
'function copyResultsCsv(){',
'  const rows = [["campus","student","km","minutes"]].concat(lastResults.map(r=>[r.campus, r.student, r.km===null?"":r.km.toFixed(2), r.min===null?"":Math.round(r.min)]));',
'  const csv = "\\uFEFF" + rows.map(r=>r.map(v=>/[",]/.test(String(v)) ? "\\"" + String(v).replace(/"/g,"\\"\\"") + "\\"" : v).join(",")).join("\\r\\n");',
'  if (navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(csv).then(()=>alert("CSV 已复制到剪贴板")); }',
'  else { const ta = document.createElement("textarea"); ta.value = csv; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove(); alert("CSV 已复制到剪贴板"); }',
'}',
'</' + 'script>',
'<script src="https://api.map.baidu.com/api?type=webgl&v=1.0&ak=__AK__&callback=init"></' + 'script>',
'</body></html>',
''
].join('\n');

// --- DOM wiring (teacher dashboard) ---------------------------------------------
function geoDownload(filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
}

function geoGetAk() { try { return localStorage.getItem('csBaiduAk') || ''; } catch (e) { return ''; } }
function geoSaveAk(v) { try { localStorage.setItem('csBaiduAk', String(v || '').trim()); } catch (e) { /* non-fatal */ } }

function _todayStamp() { return new Date().toISOString().slice(0, 10); }

function renderGeoCoverage() {
    var el = typeof document !== 'undefined' && document.getElementById('geoCoverage');
    if (!el || typeof allStudents === 'undefined') return;
    var n = (allStudents || []).filter(function (s) { return s && s.geo && Number.isFinite(Number(s.geo.lat)) && Number.isFinite(Number(s.geo.lng)); }).length;
    el.textContent = n + '/' + (allStudents || []).length + ' students have location data';
}

function exportLocationsCsv() {
    var students = (typeof allStudents !== 'undefined' && allStudents) || [];
    geoDownload('student_locations_' + _todayStamp() + '.csv', buildLocationCsv(students), 'text/csv;charset=utf-8');
}

function exportBaiduMapHtml() {
    var ak = geoGetAk();
    if (!ak) {
        alert('请先填写百度地图 AK(浏览器端密钥)。\n获取:lbsyun.baidu.com → 应用管理 → 创建应用 → 浏览器端 → 域名白名单留空。');
        return;
    }
    var students = (typeof allStudents !== 'undefined' && allStudents) || [];
    geoDownload('student_map_' + _todayStamp() + '.html', buildBaiduMapHtml(students, ak), 'text/html;charset=utf-8');
}

if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('DOMContentLoaded', function () {
        var akEl = document.getElementById('geoBaiduAk');
        if (akEl) akEl.value = geoGetAk();
        renderGeoCoverage();
    });
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        outOfChina, wgs84ToGcj02, gcj02ToBd09, wgs84ToBd09,
        buildLocationCsv, buildBaiduMapHtml, geoDownload,
        geoGetAk, geoSaveAk, renderGeoCoverage, exportLocationsCsv, exportBaiduMapHtml
    };
}
