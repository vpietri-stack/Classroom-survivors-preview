const { pruneRetiredVocab } = require('./retiredVocab');
const crypto = require('crypto');

// ============================================================================
// Session-token auth helper (c) design.
//
// A session token is a signed (HMAC-SHA256) JWT-shaped string minted by the
// server on successful login. The browser sends it as:
//     X-Auth-Token: ***
// NOTE: Azure Static Web Apps' managed-functions proxy RESERVES the
// `Authorization` header (it overwrites it with the host's own internal
// token), so our client token MUST travel in X-Auth-Token or it can never be
// verified. We still fall back to `Authorization: Bearer *** for local dev.
// The server NEVER trusts a client-supplied student/creator id for scoping —
// it derives the acting identity from the verified token instead.
//
// SESSION_SECRET lives ONLY in function app settings (same place APP_API_KEY
// lives) and DIFFERS per environment (live vs test harness). A browser-shipped
// value could never forge a valid token.
// ============================================================================

const DEFAULT_TTL = 30 * 24 * 3600; // 30 days (seconds)

function b64url(buf) {
    return Buffer.from(buf)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

function b64urlJson(obj) {
    return b64url(JSON.stringify(obj));
}

function fromB64url(str) {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    return Buffer.from(str, 'base64');
}

function signToken(payload, secret, ttlSeconds = DEFAULT_TTL) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const body = { ...payload, iat: now, exp: now + ttlSeconds };
    const data = `${b64urlJson(header)}.${b64urlJson(body)}`;
    const sig = crypto.createHmac('sha256', secret).update(data).digest();
    return `${data}.${b64url(sig)}`;
}

function verifyTokenString(token, secret) {
    if (!token || !secret) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [h, p, s] = parts;
    const expected = b64url(
        crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest()
    );
    const a = Buffer.from(expected);
    const b = Buffer.from(s);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    let payload;
    try {
        payload = JSON.parse(fromB64url(p).toString('utf8'));
    } catch {
        return null;
    }
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload; // { sub, login, role, name, iat, exp }
}

function getBearer(request) {
    // Prefer X-Auth-Token: *** only header Azure SWA's managed-functions proxy
    // does NOT overwrite. `Authorization` is reserved by the host (it injects
    // its own internal token), so any client value sent there is lost.
    const headers = request.headers || {};
    const get = (name) =>
        headers.get ? headers.get(name) : headers[name] || '';
    const xAuth = get('X-Auth-Token');
    if (xAuth) return xAuth;
    const auth = get('Authorization');
    if (auth) {
        const m = auth.match(/^Bearer\s+(.+)$/i);
        if (m) return m[1];
    }
    // Fallback for sendBeacon / fetch(keepalive) paths that cannot set custom
    // headers (sendBeacon only sends Content-Type). The client ships the token
    // in the `authToken` query param for these unload-time flushes.
    try {
        const q = request.query && request.query.get ? request.query.get('authToken') : null;
        if (q) return q;
    } catch { /* noop */ }
    return null;
}

function verifyToken(request, secret) {
    return verifyTokenString(getBearer(request), secret);
}

const SESSION_SECRET = () => process.env.SESSION_SECRET || '';

// Auth enforcement is feature-flagged so the API can be deployed BEFORE the new
// client without breaking the current live client (which sends no token and
// scopes itself via a client-supplied id). Flip REQUIRE_AUTH=true once the new
// client is live everywhere. While false: a missing/invalid token yields `null`
// (callers fall back to the client id) instead of 401.
function enforceAuth() {
    return process.env.REQUIRE_AUTH === 'true';
}

// The password-less `login?testMode=true` teacher/BM bypass is gated behind an
// explicit env flag so it stays OFF in production. When the flag is not 'true',
// the bypass is skipped and the request falls through to normal login.
function testModeEnabled() {
    // Returns false unless TEST_MODE=true is explicitly set in app settings.
    return process.env.TEST_MODE === 'true';
}

// Unified gate. Returns the verified token on success.
//  - enforceAuth() ON : returns { token } or { error: <401 response> }.
//  - enforceAuth() OFF: returns { token: <verified|null> } (legacy compat).
// `overrideToken` lets a caller supply the token directly (e.g. when it was
// shipped inside a JSON body because sendBeacon/keepalive cannot set headers).
function requireAuth(request, overrideToken) {
    const raw = overrideToken || getBearer(request);
    const token = verifyTokenString(raw, SESSION_SECRET());
    if (token) return { token };
    if (enforceAuth()) return { error: unauthorized() };
    return { token: null };
}

function unauthorized() {
    return { status: 401, jsonBody: { error: 'Unauthorized' } };
}
function forbidden() {
    return { status: 403, jsonBody: { error: 'Forbidden' } };
}

// True if the verified token acts on its own record (sub === targetId)
// or holds one of the privileged roles.
function requireSelfOrRole(token, targetId, roles = []) {
    if (!token) return false;
    if (token.sub === targetId) return true;
    if (roles.length && roles.includes(token.role)) return true;
    return false;
}

function isPrivileged(token, roles = ['teacher', 'BM', 'admin']) {
    return !!(token && roles.includes(token.role));
}

// ---------------------------------------------------------------------------
// Password hashing (SHA-256 via scrypt, per-user salt). Legacy plaintext
// passwords are still verified and flagged for transparent upgrade.
// ---------------------------------------------------------------------------
function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(String(password), salt, 32).toString('hex');
    return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
    if (!stored) return false;
    if (stored.startsWith('scrypt$')) {
        const [, salt, hash] = stored.split('$');
        const calc = crypto.scryptSync(String(password), salt, 32).toString('hex');
        const a = Buffer.from(hash);
        const b = Buffer.from(calc);
        return a.length === b.length && crypto.timingSafeEqual(a, b);
    }
    // Legacy plaintext (pre-migration). Valid, but caller should upgrade.
    return String(password) === stored;
}

function needsHashUpgrade(stored) {
    return !!stored && !stored.startsWith('scrypt$');
}

// A student's stored password needs recovery to plaintext when it's currently
// a hash (old scheme) or missing. If already plaintext, leave it. Used at login
// to transparently restore dashboard visibility for students who logged in
// before plaintext storage was re-enabled.
function needsPlaintextRecovery(stored) {
    return !stored || stored.startsWith('scrypt$');
}

// Remove credential/PII fields before returning a user object to the client.
// Also drops Cosmos metadata (_rid/_self/_etag/_attachments/_ts) which must
// never leak to the browser.
function publicUser(user) {
    if (!user) return user;
    const { password, _rid, _self, _etag, _attachments, _ts, ...rest } = user;
    if (rest.srState) rest.srState = pruneRetiredVocab(rest.srState);
    return rest;
}

module.exports = {
    signToken,
    verifyToken,
    verifyTokenString,
    getBearer,
    SESSION_SECRET,
    testModeEnabled,
    unauthorized,
    forbidden,
    requireSelfOrRole,
    isPrivileged,
    enforceAuth,
    requireAuth,
    hashPassword,
    verifyPassword,
    needsHashUpgrade,
    needsPlaintextRecovery,
    publicUser,
    DEFAULT_TTL,
};
