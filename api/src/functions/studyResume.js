const { app } = require('@azure/functions');
const { CosmosClient } = require('@azure/cosmos');
const { getContainer } = require('./shared/db');
const auth = require('./shared/auth');
const { validateApiKey } = require('./shared/validateApiKey');
const core = require('./shared/studyResumeCore');
let savedContainer;
function container() {
    if(!process.env.COSMOS_STUDY_RESUME_CONTAINER)throw Error('Study storage is not configured');
    if (!savedContainer) savedContainer = new CosmosClient({ endpoint: process.env.COSMOS_ENDPOINT, key: process.env.COSMOS_KEY,
        connectionPolicy: { requestTimeout: 4000, retryOptions: { maxRetryAttemptCount: 0, maxWaitTimeInSeconds: 0 } } })
        .database(process.env.COSMOS_DB_NAME || 'Val-EslApp')
        .container(process.env.COSMOS_STUDY_RESUME_CONTAINER);
    return savedContainer;
}
async function student(id) {
    const { resources } = await getContainer().items.query({ query: 'SELECT TOP 1 c.studyRecoveryCompletion FROM c WHERE c.id=@id AND NOT IS_DEFINED(c.type)', parameters: [{ name: '@id', value: id }] }).fetchAll();
    return resources[0] || {};
}
function makeHandler(getStore = container, getStudent = student, enabled = () => process.env.STUDY_RESUME_ENABLED === 'true' && !!process.env.COSMOS_STUDY_RESUME_CONTAINER) {
    return async function (request, context) {
        const headers = { 'Cache-Control': 'no-store' };
        if (!validateApiKey(request)) return { status: 403 };
        const token = auth.verifyToken(request, auth.SESSION_SECRET());
        if (!token) return auth.unauthorized();
        if (!enabled()) return { status: 200, headers, jsonBody: { enabled: false } };
        const owner = request.query.get('studentId') || token.sub;
        if (!core.ownerId(owner)) return { status: 400 };
        if (owner !== token.sub && !auth.isPrivileged(token)) return auth.forbidden();
        try {
            const c = getStore();
            async function read() { try { return (await c.item('study', owner).read()).resource || null; } catch (e) { if (e.code === 404) return null; throw e; } }
            if (request.method === 'GET') {
                const [doc, profile] = await Promise.all([read(), getStudent(owner)]);
                let completed = profile.studyRecoveryCompletion || null;
                if (doc && doc.status === 'completed' && (!completed || Date.parse(doc.updatedAt) >= Date.parse(completed.completedAt)))
                    completed = { runId: doc.runId, completedAt: doc.updatedAt };
                return { status: 200, headers, jsonBody: { enabled: true, version: doc && doc.version || 0, runId:doc&&doc.runId||null, closedRunId:doc&&doc.status==='completed'?doc.runId:null, completed,
                    snapshot: doc && doc.status === 'active' && core.pending(doc.snapshot, completed) ? doc.snapshot : null } };
            }
            if (owner !== token.sub || auth.isPrivileged(token) || (token.role && token.role !== 'student')) return auth.forbidden();
            const raw = await request.text();
            if (Buffer.byteLength(raw, 'utf8') > 65000) return { status: 413 };
            let body; try { body = JSON.parse(raw); } catch (_) { return { status: 400 }; }
            if (!['begin','claim','checkpoint','complete'].includes(body.action) || !core.id(body.runId)) return { status: 400 };
            const snapshot = body.action === 'complete' ? null : core.validate(body.snapshot, owner);
            if (body.action !== 'complete' && (!snapshot || snapshot.runId !== body.runId)) return { status: 400 };
            const profile = ['begin','claim'].includes(body.action) ? await getStudent(owner) : null;
            if (profile && !core.pending(snapshot, profile.studyRecoveryCompletion)) return { status: 410, jsonBody: { completed: profile.studyRecoveryCompletion || null } };
            for (let attempt = 0; attempt < 3; attempt++) {
                const doc = await read(), version = doc && doc.version || 0;
                const same = doc && doc.runId === body.runId;
                if (body.action === 'complete') {
                    if (doc && !same && doc.runId !== body.supersedesRunId) return { status: 409 };
                    if (same && doc.status === 'completed') return { status: 200, headers, jsonBody: { version, completed: true } };
                } else {
                    if (same && doc.status === 'completed') return { status: 410 };
                    if (same && doc.snapshot.writerId === snapshot.writerId && snapshot.seq <= doc.snapshot.seq)
                        return { status: 200, headers, jsonBody: { version, seq: doc.snapshot.seq } };
                    const own = same && doc.snapshot.writerId === snapshot.writerId;
                    const begin = body.action === 'begin' && (!doc || version === body.baseVersion || doc.runId === body.supersedesRunId || snapshot.knownCompletions.includes(doc.runId));
                    const claim = body.action === 'claim' && same && version === body.baseVersion;
                    if (!(own || begin || claim)) return { status: 409, headers, jsonBody: { conflict: true, version } };
                }
                const next = { id: 'study', studentId: owner, type: 'study_resume', runId: body.runId, version: version + 1,
                    status: body.action === 'complete' ? 'completed' : 'active', snapshot, updatedAt: new Date().toISOString(), ttl: -1 };
                try {
                    if (doc) await c.item('study', owner).replace(next, { accessCondition: { type: 'IfMatch', condition: doc._etag } });
                    else await c.items.create(next);
                    return { status: 200, headers, jsonBody: { version: next.version, seq: snapshot && snapshot.seq, completed: next.status === 'completed' } };
                } catch (e) { if ((e.code === 409 || e.code === 412) && attempt < 2) continue; throw e; }
            }
        } catch (e) {
            context.warn('Study checkpoint unavailable', e.code || e.name);
            return { status: 503, headers, jsonBody: { error: 'Checkpoint temporarily unavailable' } };
        }
    };
}
const handler = makeHandler();
app.http('studyResume', { methods: ['GET','POST'], authLevel: 'anonymous', route: 'studyResume', handler });
module.exports = { makeHandler, handler };
