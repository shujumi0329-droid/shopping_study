import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const BRIDGE_COOKIE = 'shopping_bridge';
export const BRIDGE_TTL_SECONDS = 6 * 60 * 60;
const ALLOWED_MODES = new Set(['production','internal','preview']);
const ALLOWED_SOURCES = new Set(['mturk','internal_test','mturk_preview']);
const text = (v, max=200) => String(v ?? '').trim().slice(0,max);

export function resolveBridgeSecret(secret = process.env.BRIDGE_SIGNING_SECRET) {
  const configured = text(secret, 500);
  if (configured) return configured;
  const projectId = text(process.env.VERCEL_PROJECT_ID, 200);
  const productionUrl = text(process.env.VERCEL_PROJECT_PRODUCTION_URL, 500);
  if (projectId && productionUrl) {
    return createHash('sha256').update(`shopping-bridge-v1|${projectId}|${productionUrl}`).digest('hex');
  }
  throw new Error('BRIDGE_SIGNING_SECRET is not configured and Vercel system identity is unavailable');
}

export function deriveInternalTestToken(secret) {
  return createHmac('sha256', resolveBridgeSecret(secret)).update('internal-test-v1').digest('hex').slice(0,24);
}

function hmac(data, secret) {
  return createHmac('sha256', resolveBridgeSecret(secret)).update(String(data)).digest();
}

export function deriveProductionJoinId(assignmentId, secret) {
  const assignment = text(assignmentId, 200);
  if (!assignment || assignment === 'ASSIGNMENT_ID_NOT_AVAILABLE') throw new Error('A real MTurk assignmentId is required');
  return `ST_${hmac(assignment, secret).toString('hex').slice(0,24).toUpperCase()}`;
}

export function createRandomJoinId(prefix) {
  const clean = String(prefix || '').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,12);
  if (!clean) throw new Error('Join ID prefix is required');
  return `${clean}_${randomBytes(12).toString('hex').toUpperCase()}`;
}

export function normalizeBridgeSession(session, nowMs = Date.now()) {
  const runMode = text(session?.run_mode, 20);
  const source = text(session?.recruitment_source, 40);
  if (!ALLOWED_MODES.has(runMode) || !ALLOWED_SOURCES.has(source)) throw new Error('Invalid bridge mode/source');
  const joinId = text(session?.join_id, 200);
  if (!joinId) throw new Error('join_id is required');
  return {
    join_id: joinId,
    run_mode: runMode,
    recruitment_source: source,
    assignment_id: text(session?.assignment_id,200),
    worker_id: text(session?.worker_id,200),
    hit_id: text(session?.hit_id,200),
    iat: Number(session?.iat || nowMs),
    exp: Number(session?.exp || (nowMs + BRIDGE_TTL_SECONDS * 1000))
  };
}

export function signBridgeSession(session, secret, nowMs = Date.now()) {
  const payload = normalizeBridgeSession(session, nowMs);
  payload.iat = nowMs;
  payload.exp = nowMs + BRIDGE_TTL_SECONDS * 1000;
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = hmac(encoded, secret).toString('base64url');
  return `${encoded}.${sig}`;
}

export function verifyBridgeSession(token, secret, nowMs = Date.now()) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
    const expected = hmac(parts[0], secret);
    const actual = Buffer.from(parts[1], 'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const raw = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    const session = normalizeBridgeSession(raw, nowMs);
    if (!Number.isFinite(session.iat) || !Number.isFinite(session.exp) || session.exp <= nowMs || session.iat > nowMs + 60_000) return null;
    return session;
  } catch {
    return null;
  }
}

export function parseCookieHeader(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const key = part.slice(0,idx).trim();
    if (!key) continue;
    out[key] = decodeURIComponent(part.slice(idx+1).trim());
  }
  return out;
}

export function serializeBridgeCookie(token, maxAgeSeconds = BRIDGE_TTL_SECONDS) {
  return `${BRIDGE_COOKIE}=${encodeURIComponent(String(token))}; Path=/; Max-Age=${Math.max(0,Math.floor(maxAgeSeconds))}; HttpOnly; Secure; SameSite=Lax`;
}

export function readBridgeSession(req, secret = process.env.BRIDGE_SIGNING_SECRET, nowMs = Date.now()) {
  const cookies = parseCookieHeader(req?.headers?.cookie || req?.headers?.Cookie || '');
  const token = cookies[BRIDGE_COOKIE];
  if (!token) return null;
  return verifyBridgeSession(token, secret, nowMs);
}
