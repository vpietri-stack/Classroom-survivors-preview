// Temporary, account-enabled remote recorder. Never reads/writes Students.
const { app } = require('@azure/functions');
const { CosmosClient } = require('@azure/cosmos');
const crypto = require('crypto');
const auth = require('./shared/auth');
const { validateApiKey } = require('./shared/validateApiKey');
let container;
function getDiagnosticsContainer() {
    if (!container) {
        const client = new CosmosClient({ endpoint: process.env.COSMOS_ENDPOINT, key: process.env.COSMOS_KEY,
            connectionPolicy: { requestTimeout: 4000, retryOptions: { maxRetryAttemptCount: 0, maxWaitTimeInSeconds: 0 } } });
        container = client.database(process.env.COSMOS_DIAGNOSTICS_DB_NAME || process.env.COSMOS_DB_NAME || 'Val-EslApp')
            .container(process.env.COSMOS_DIAGNOSTICS_CONTAINER || 'client_diagnostics');
    }
    return container;
}
const DAY = 86400000;
const TYPES = new Set(('boot activity heartbeat error promise_error console_error console_warn console_log resource_error network visibility pagehide pageshow freeze resume context_lost speech app_navigation long_task client_report logout practice').split(' '));
function redact(value, max = 1200) {
    return String(value == null ? '' : value)
        .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[token]')
        .replace(/((?:password|authToken|authorization|x-auth-token|x-app-key|appKey|APP_API_KEY|token)["']?\s*[:=]\s*["']?)[^\s,"'&}]+/gi, '$1[redacted]')
        .replace(/(https?:\/\/[^\s?#)]+)[?#][^\s)]*/g, '$1')
        .slice(0, max);
}
function safeId(s) { return typeof s === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(s); }
function isEnabled(config, now = Date.now()) { return !!(config && config.enabled && Date.parse(config.endsAt) > now); }
function publicConfig(config, now = Date.now()) {
    return { enabled: isEnabled(config, now), endsAt: config && config.endsAt || null, heartbeatMs: 15000, uploadMs: 30000 };
}
function sanitizeEvent(e, now = Date.now()) {
    if (!e || !safeId(e.boot) || !Number.isSafeInteger(e.seq) || e.seq < 1 || !TYPES.has(e.type)) return null;
    const date = Date.parse(e.ts);
    if (!Number.isFinite(date) || date < now - 14 * DAY || date > now + 5 * 60000) return null;
    const context = {};
    for (const key of ['mode', 'round', 'word', 'letter', 'exercise', 'checkpoint', 'version', 'practiceRunId']) {
        if (e.context && e.context[key] != null) context[key] = redact(e.context[key], 100);
    }
    if (e.context && typeof e.context.active === 'boolean') context.active = e.context.active;
    return { eventId: e.boot + ':' + e.seq, boot: e.boot, seq: e.seq, ts: new Date(date).toISOString(),
        type: e.type, context, detail: redact(e.detail), elapsedMs: Math.max(0, Math.min(Number(e.elapsedMs) || 0, 7 * DAY)) };
}
function sanitizeDevice(d) {
    const out = {};
    for (const k of ['ua', 'platform', 'screen', 'viewport', 'version', 'label']) if (d && d[k] != null) out[k] = redact(d[k], k === 'ua' ? 450 : 100);
    for (const k of ['dpr', 'touch', 'timezoneOffset', 'heapMB']) if (d && Number.isFinite(d[k])) out[k] = d[k];
    return out;
}
// Small immutable uploads retain early practice instead of rewriting/trimming a day.
const DAILY_BATCH_LIMIT = 600;
function batchId(browserId, events) {
    return 'chunk_' + crypto.createHash('sha256').update(browserId + '\n' + events.map(e => e.eventId).join('\n')).digest('hex').slice(0, 48);
}
function effectiveConfig(personal, global, now = Date.now()) {
    if (global && global.paused) return { ...publicConfig(global, now), enabled: false, schema: 2 };
    if (personal && personal.enabled === false) return publicConfig(personal, now);
    const active = [personal, global && global.scope === 'all_students' ? global : null].filter(c => isEnabled(c, now));
    const latest = active.sort((a,b) => Date.parse(b.endsAt) - Date.parse(a.endsAt))[0];
    return { ...publicConfig(latest || personal || global, now), scope: latest && latest.scope || 'account',
        schema: 2, dailyBatchLimit: DAILY_BATCH_LIMIT };
}
function makeHandler(getContainer = getDiagnosticsContainer) {
    const cache = new Map();
    async function read(c, id, pk, cost) {
        try { const r = await c.item(id, pk).read(); cost.readRU += r.requestCharge || 0; return r.resource || null; }
        catch (e) { cost.readRU += Number(e.requestCharge) || 0; if (e.code === 404) return null; throw e; }
    }
    async function config(c, pk, cost) {
        const cached = cache.get(pk);
        if (cached && cached.until > Date.now()) return cached.value;
        const value = await read(c, 'config', pk, cost);
        if (cache.size > 200) cache.clear();
        cache.set(pk, { value, until: Date.now() + 30000 }); return value;
    }
    async function reserve(c, pk, incoming, cost) {
        const day = new Date().toISOString().slice(0,10), id = 'usage_' + day;
        const previous = await read(c, id, pk, cost);
        if (!previous) {
            try {
                const r = await c.items.create({ id, studentId: pk, type: 'client_diagnostics_usage', day,
                    batches: 1, events: incoming.length, bytes: Buffer.byteLength(JSON.stringify(incoming)),
                    updatedAt: new Date().toISOString(), ttl: 14 * 86400 });
                cost.writeRU += r.requestCharge || 0; return 1;
            } catch (e) { if (e.code !== 409) throw e; }
        } else if (previous.batches >= DAILY_BATCH_LIMIT) return null;
        try {
            const r = await c.item(id,pk).patch([
                { op: 'incr', path: '/batches', value: 1 },
                { op: 'incr', path: '/events', value: incoming.length },
                { op: 'incr', path: '/bytes', value: Buffer.byteLength(JSON.stringify(incoming)) },
                { op: 'set', path: '/updatedAt', value: new Date().toISOString() }
            ], { filterPredicate: 'FROM c WHERE c.batches < ' + DAILY_BATCH_LIMIT });
            cost.writeRU += r.requestCharge || 0; return r.resource && r.resource.batches || 0;
        } catch (e) { if (e.code === 412) return null; throw e; }
    }
    return async function handler(request, context) {
        if (!validateApiKey(request)) return { status: 403, jsonBody: { error: 'Forbidden' } };
        const token = auth.verifyToken(request, auth.SESSION_SECRET());
        if (!token) return auth.unauthorized();
        const privileged = auth.isPrivileged(token), studentId = request.query.get('studentId') || token.sub;
        if (!safeId(studentId)) return { status: 400, jsonBody: { error: 'Invalid student' } };
        if (studentId !== token.sub && !privileged) return auth.forbidden();
        const headers = { 'Cache-Control': 'no-store' }, since = Date.now(), cost = { readRU: 0, writeRU: 0 };
        function metrics() { return { ...cost, serverMs: Date.now() - since }; }
        try {
            const c = getContainer();
            const personal = await config(c,studentId,cost), global = await config(c,'_global',cost);
            const policy = effectiveConfig(personal,global);
            if (request.method === 'GET') {
                if (request.query.get('view') !== 'events') return { status: 200, headers, jsonBody: policy };
                if (!privileged) return auth.forbidden();
                const cursor = request.query.get('cursor');
                if (cursor && cursor.length > 12000) return { status: 400, jsonBody: { error: 'Invalid cursor' } };
                const page = await c.items.query({
                    query: "SELECT c.browserId,c.device,c.events,c.updatedAt FROM c WHERE c.type = 'client_diagnostics_chunk' ORDER BY c.updatedAt DESC"
                }, { partitionKey: studentId, maxItemCount: 20, continuationToken: cursor || undefined }).fetchNext();
                let legacy = [];
                if (!cursor) legacy = (await c.items.query({
                    query: "SELECT TOP 12 c.browserId,c.device,ARRAY_SLICE(c.events,-200) AS events,c.updatedAt,c.dropped FROM c WHERE c.type = 'client_diagnostics_day' ORDER BY c.updatedAt DESC"
                }, { partitionKey: studentId }).fetchAll()).resources;
                const usage = (await c.items.query({ query: "SELECT c.day,c.batches,c.events,c.bytes FROM c WHERE c.type = 'client_diagnostics_usage'" }, { partitionKey: studentId }).fetchAll()).resources;
                return { status: 200, headers, jsonBody: { config: policy, global: publicConfig(global),
                    days: (page.resources || []).concat(legacy), cursor: page.continuationToken || null,
                    usage, serverTime: new Date().toISOString() } };
            }
            const raw = await request.text();
            if (Buffer.byteLength(raw,'utf8') > 24000) return { status: 413, jsonBody: { error: 'Batch too large' } };
            let body; try { body = JSON.parse(raw); } catch (_) { return { status: 400, jsonBody: { error: 'Invalid JSON' } }; }
            if (body.action === 'configure' || body.action === 'configureGlobal') {
                if (!privileged || (body.action === 'configureGlobal' && token.role !== 'admin')) return auth.forbidden();
                const pk = body.action === 'configureGlobal' ? '_global' : studentId;
                const days = Math.max(1,Math.min(Number(body.days) || 7,14));
                const next = { id: 'config', studentId: pk, type: 'client_diagnostics_config', enabled: body.enabled === true,
                    endsAt: new Date(Date.now() + days * DAY).toISOString(), updatedAt: new Date().toISOString(), ttl: -1 };
                if (pk === '_global') { next.scope = 'all_students'; next.paused = !next.enabled; }
                const r = await c.items.upsert(next); cost.writeRU += r.requestCharge || 0; cache.delete(pk);
                return { status: 200, headers, jsonBody: { ...publicConfig(next), metrics: metrics() } };
            }
            if (studentId !== token.sub || privileged || (token.role && token.role !== 'student')) return auth.forbidden();
            if (!policy.enabled) return { status: 200, headers, jsonBody: { enabled: false, ack: [] } };
            if (!safeId(body.browserId) || !Array.isArray(body.events) || body.events.length < 1 || body.events.length > 40)
                return { status: 400, jsonBody: { error: 'Invalid batch' } };
            const incoming = body.events.map(e => sanitizeEvent(e));
            if (incoming.some(e => !e)) return { status: 400, jsonBody: { error: 'Invalid event' } };
            const id = batchId(body.browserId,incoming);
            const duplicate = await read(c,id,studentId,cost);
            if (duplicate) return { status: 200, headers, jsonBody: { enabled: true, ack: incoming.map(e=>e.eventId), metrics: metrics(), duplicate: true } };
            const used = await reserve(c,studentId,incoming,cost);
            if (used === null) return { status: 429, headers, jsonBody: { error: 'Daily diagnostic budget reached', kind: 'daily_budget',
                retryAfterMs: DAY - Date.now() % DAY, metrics: metrics() } };
            const next = { id, studentId, browserId: body.browserId, type: 'client_diagnostics_chunk', schema: 2,
                device: sanitizeDevice(body.device), events: incoming, updatedAt: new Date().toISOString(), ttl: 14 * 86400 };
            try { const r = await c.items.create(next); cost.writeRU += r.requestCharge || 0; }
            catch (e) { if (e.code !== 409) throw e; }
            return { status: 200, headers, jsonBody: { enabled: true, ack: incoming.map(e=>e.eventId),
                receivedAt: next.updatedAt, metrics: metrics(), batchesToday: used } };
        } catch (e) {
            const throttled = Number(e.code) === 429;
            context.warn('Client diagnostics unavailable', e.code || e.name);
            return { status: throttled ? 429 : 503, headers, jsonBody: { error: 'Diagnostics temporarily unavailable',
                kind: throttled ? 'cosmos_throttle' : 'unavailable', retryAfterMs: Math.min(Number(e.retryAfterInMs) || 30000,300000), metrics: metrics() } };
        }
    };
}
const handler = makeHandler();
app.http('clientDiagnostics', { methods: ['GET', 'POST'], authLevel: 'anonymous', route: 'clientDiagnostics', handler });
module.exports = { handler, makeHandler, redact, sanitizeEvent, publicConfig, effectiveConfig, batchId, DAILY_BATCH_LIMIT };
