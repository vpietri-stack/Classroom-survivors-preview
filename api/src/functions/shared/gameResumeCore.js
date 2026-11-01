// Shared validation and completion rules. No DOM, credentials or recordings.
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.GameResumeCore = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';
    const MAX_BYTES = 60000;
    const id = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
    const ownerId = value => typeof value === 'string' && /^[^/#?\\\u0000-\u001f]{1,200}$/u.test(value);
    function bytes(value) {
        const s = typeof value === 'string' ? value : JSON.stringify(value);
        return typeof Buffer !== 'undefined' ? Buffer.byteLength(s, 'utf8') : new TextEncoder().encode(s).length;
    }
    function validGame(game,state) {
        if(game==='gomoku')return Array.isArray(state.board)&&state.board.length===15&&state.board.every(row=>Array.isArray(row)&&row.length===15&&row.every(v=>[0,1,2].includes(v)))&&['regular','speed'].includes(state.mode)&&['player','ai','minigame'].includes(state.turn);
        const colors=['red','yellow','green','blue','black'],types=['number','skip','reverse','+2','wild','+4'];
        const card=c=>c&&typeof c==='object'&&colors.includes(c.color)&&types.includes(c.type)&&(c.type!=='number'||Number.isInteger(c.value)&&c.value>=0&&c.value<=9)&&(!c.chosenColor||colors.slice(0,4).includes(c.chosenColor));
        const tasks=['turn','next','esl','tension','win','deal','initialDiscard','effect','humanPlay','humanSnapCard','humanDrawPending','humanDeclareNoPlay','humanCatchBot','aiTurn','handleESLResult'];
        if(state.task&&(!tasks.includes(state.task.kind)||!Array.isArray(state.task.args)||state.task.args.length>3))return false;
        return Array.isArray(state.deck)&&Array.isArray(state.discard)&&Array.isArray(state.players)&&state.players.length===4&&state.players.every(p=>Array.isArray(p)&&p.every(card))&&state.deck.every(card)&&state.discard.every(card)&&Number.isInteger(state.currentPlayer)&&state.currentPlayer>=0&&state.currentPlayer<4&&[1,-1].includes(state.direction)&&state.deck.length+state.discard.length+state.players.reduce((n,p)=>n+p.length,0)<=108;
    }
    function validate(value, owner) {
        if (!value || value.schema !== 1 || value.owner !== owner || !ownerId(owner) || !id(value.runId)
            || !id(value.writerId) || !Number.isSafeInteger(value.seq) || value.seq < 1
            || !Number.isFinite(value.createdAt) || !value.state || !['gomoku','uno'].includes(value.game)
            || !validGame(value.game,value.state)
            || !value.ui || !value.exercise || !Number.isFinite(value.elapsedMs) || value.elapsedMs < 0
            || !Number.isSafeInteger(value.exercise.attempts) || value.exercise.attempts < 1
            || !Array.isArray(value.srResults) || value.srResults.length > 200
            || !Array.isArray(value.usedPairKeys) || value.usedPairKeys.length > 100
            || !Array.isArray(value.knownCompletions) || value.knownCompletions.length > 40
            || value.knownCompletions.some(x => !id(x)) || bytes(value) > MAX_BYTES) return null;
        const allowed = new Set(['game','schema','owner','runId','writerId','seq','createdAt','updatedAt','knownCompletions',
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
            if (e.type !== 'session' || !['gomoku','uno'].includes(e.sessionType) || !accepted.has(e.eventId) || !id(e.data && e.data.gameRunId || e.eventId)) continue;
            accepted.delete(e.eventId);
            const when = Date.parse(e.timestamp);
            if (!Number.isFinite(when)) continue;
            if (!user.gameRecoveryCompletion || when >= Date.parse(user.gameRecoveryCompletion.completedAt))
                user.gameRecoveryCompletion = { runId: e.data && e.data.gameRunId || e.eventId, completedAt: new Date(when).toISOString() };
        }
    }
    function creditRuns(events){return (events||[]).filter(e=>e.type==='session'&&e.data&&id(e.data.gameRunId)).map(e=>e.data.gameRunId);}
    function canCredit(events,acceptedIds,user={}){const runs=creditRuns(events);return !runs.length||runs.some(run=>!(user.gameRecoveryCredits||[]).includes(run));}
    function markCredit(user,events){const runs=creditRuns(events);if(runs.length)user.gameRecoveryCredits=Array.from(new Set((user.gameRecoveryCredits||[]).concat(runs))).slice(-40);}
    return { canCredit, markCredit, MAX_BYTES, id, ownerId, bytes, validate, pending, completion };
});
