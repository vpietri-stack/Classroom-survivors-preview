// Shared validation and completion rules. No DOM, credentials or recordings.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.StudyResumeCore = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';
    const MAX_BYTES = 60000;
    const id = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
    const ownerId = value => typeof value === 'string' && /^[^/#?\\\u0000-\u001f]{1,200}$/u.test(value);
    function bytes(value) {
        const s = typeof value === 'string' ? value : JSON.stringify(value);
        return typeof Buffer !== 'undefined' ? Buffer.byteLength(s, 'utf8') : new TextEncoder().encode(s).length;
    }
    function validate(value, owner) {
        if (!value || value.schema !== 1 || value.owner !== owner || !ownerId(owner) || !id(value.runId)
            || !id(value.writerId) || !Number.isSafeInteger(value.seq) || value.seq < 1
            || !Number.isFinite(value.createdAt) || !value.state || !['A','C','D','E','F'].includes(value.state.round)
            || !Array.isArray(value.state.words) || value.state.words.length < 1 || value.state.words.length > 5
            || !value.ui || !value.exercise || !Number.isFinite(value.elapsedMs) || value.elapsedMs < 0
            || !Number.isSafeInteger(value.exercise.attempts) || value.exercise.attempts < 1
            || !Array.isArray(value.srResults) || value.srResults.length > 200
            || !Array.isArray(value.usedPairKeys) || value.usedPairKeys.length > 100
            || !Array.isArray(value.knownCompletions) || value.knownCompletions.length > 40
            || value.knownCompletions.some(x => !id(x)) || bytes(value) > MAX_BYTES) return null;
        const allowed = new Set(['schema','owner','runId','writerId','seq','createdAt','updatedAt','knownCompletions',
            'state','content','elapsedMs','exercise','ui','handwriting','speech','srResults','srApplied','usedPairKeys','practice','receipts','pending']);
        let nodes = 0;
        function copy(v, depth) {
            if (++nodes > 16000 || depth > 14) throw Error('Too much state');
            if (v === null || typeof v === 'boolean') return v;
            if (typeof v === 'number') { if (!Number.isFinite(v)) throw Error('Invalid number'); return v; }
            if (typeof v === 'string') {
                if (v.length > 4000 || /<\s*\/?[a-z!][^>]*>|javascript:/i.test(v)) throw Error('Unsafe text');
                return v;
            }
            if (Array.isArray(v)) { if (v.length > 2500) throw Error('Large array'); return v.map(x => copy(x, depth + 1)); }
            if (!v || typeof v !== 'object') throw Error('Invalid state');
            const out = {};
            for (const k of Object.keys(v)) {
                if (['__proto__','prototype','constructor'].includes(k) || /password|authtoken|authorization|appkey/i.test(k)) throw Error('Unsafe key');
                out[k] = copy(v[k], depth + 1);
            }
            return out;
        }
        try {
            const out = {};
            for (const k of Object.keys(value)) { if (!allowed.has(k)) return null; out[k] = copy(value[k], 0); }
            return out;
        } catch (_) { return null; }
    }
    function pending(snapshot, completion) {
        if (!snapshot) return false;
        if (!completion || !completion.runId) return true;
        return snapshot.runId !== completion.runId && snapshot.knownCompletions.includes(completion.runId);
    }
    function completion(user, events, acceptedIds) {
        const accepted = new Set(acceptedIds || []);
        for (const e of events || []) {
            if (e.type !== 'session' || e.sessionType !== 'study' || !accepted.has(e.eventId) || !id(e.data && e.data.studyRunId || e.eventId)) continue;
            accepted.delete(e.eventId);
            const when = Date.parse(e.timestamp);
            if (!Number.isFinite(when)) continue;
            if (!user.studyRecoveryCompletion || when >= Date.parse(user.studyRecoveryCompletion.completedAt))
                user.studyRecoveryCompletion = { runId: e.data && e.data.studyRunId || e.eventId, completedAt: new Date(when).toISOString() };
        }
    }
    return { MAX_BYTES, id, ownerId, bytes, validate, pending, completion };
});
