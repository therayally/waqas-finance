// Security helpers shared by the middleware and the sign-in routes. Edge runtime: Web Crypto only, no Node APIs.
// Controls are mapped in SECURITY.md (OWASP ASVS / Top 10, NIST SP 800-63B and 800-53, SOC 2 Trust Services Criteria).

export const COOKIE = '__Host-wfs'; // __Host-: Secure, Path=/, no Domain, so no subdomain can set or read it
export const MAX_AGE = 60 * 60 * 8; // absolute session lifetime: 8 hours (NIST 800-63B AAL1 reauthentication)
export const IDLE = 60 * 30; // idle timeout: 30 minutes without a page load signs you out
const VERSION = 'v1';
const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** The configuration the app needs. Missing or weak settings fail closed: nobody can sign in (OWASP A05, no default credentials). */
export function config(env = process.env) {
  const user = String(env.OWNER_USER || '').trim();
  const pass = String(env.OWNER_PASS || '');
  const secret = String(env.SESSION_SECRET || '');
  const problems = [];
  if (!user) problems.push('OWNER_USER is not set');
  if (!pass) problems.push('OWNER_PASS is not set');
  if (secret.length < 32) problems.push('SESSION_SECRET must be at least 32 characters');
  return { ok: problems.length === 0, user, pass, secret, problems };
}

async function hmac(secret, text) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(text)));
}
/** Compares two strings in constant time by comparing their SHA-256 digests (no early exit, no length leak). */
export async function safeEqual(a, b) {
  const [x, y] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(String(a))), crypto.subtle.digest('SHA-256', enc.encode(String(b)))]);
  const u = new Uint8Array(x); const v = new Uint8Array(y); let diff = 0;
  for (let i = 0; i < u.length; i++) diff |= u[i] ^ v[i];
  return diff === 0;
}

/** A session token: v1.<issued>.<lastSeen>.<sig>. The signature covers every field, so nothing in it can be changed without SESSION_SECRET. */
export async function makeToken(secret, now = Math.floor(Date.now() / 1000), issued = now) {
  const body = `${VERSION}.${issued}.${now}`;
  return `${body}.${await hmac(secret, body)}`;
}
/** Returns { ok, issued } when the token is genuine, inside its 8-hour life and not idle for 30 minutes. */
export async function checkToken(secret, token, now = Math.floor(Date.now() / 1000)) {
  if (!secret || secret.length < 32 || typeof token !== 'string' || token.length > 200) return { ok: false };
  const parts = token.split('.'); if (parts.length !== 4 || parts[0] !== VERSION) return { ok: false };
  const [v, issued, seen, sig] = parts;
  if (!/^\d{1,12}$/.test(issued) || !/^\d{1,12}$/.test(seen) || !/^[0-9a-f]{64}$/.test(sig)) return { ok: false };
  if (!(await safeEqual(sig, await hmac(secret, `${v}.${issued}.${seen}`)))) return { ok: false };
  const i = Number(issued); const s = Number(seen);
  if (s < i || s > now + 60 || now - i > MAX_AGE || now - s > IDLE) return { ok: false };
  return { ok: true, issued: i };
}
export const cookie = (token, maxAge = MAX_AGE) => `${COOKIE}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
export const clearCookie = () => `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;

export function readCookie(request, name = COOKIE) {
  const raw = request.headers.get('cookie') || '';
  for (const part of raw.split(';')) { const p = part.trim(); if (p.startsWith(`${name}=`)) return p.slice(name.length + 1); }
  return null;
}

/** Cross-site request forgery guard for POSTs: the request must come from this same site (OWASP CSRF cheat sheet, Origin check). */
export function sameOrigin(request) {
  const self = new URL(request.url).origin;
  const origin = request.headers.get('origin');
  if (origin && origin !== 'null') return origin === self; // a privacy setting can make the browser send "null": then use Sec-Fetch-Site
  const site = request.headers.get('sec-fetch-site');
  if (site) return site === 'same-origin';
  const ref = request.headers.get('referer');
  try { return !!ref && new URL(ref).origin === self; } catch { return false; }
}

export function clientIp(request) {
  return (request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for') || '').split(',')[0].trim().slice(0, 64) || 'unknown';
}

/** One structured line per security event, to the Vercel logs (SOC 2 CC7.2, NIST AU-2/AU-3). Never logs a code, cookie or secret. */
export function audit(event, request, extra = {}) {
  const line = { at: new Date().toISOString(), event, ip: clientIp(request), ua: String(request.headers.get('user-agent') || '').slice(0, 160), path: new URL(request.url).pathname, ...extra };
  console.log(JSON.stringify({ audit: line }));
}

/**
 * Failed sign-in limiter (NIST 800-63B 5.2.2): 5 failures from one address, or 20 overall, within 15 minutes locks sign-in for 15 minutes.
 * Kept in memory per server instance, so it is a second line: the Vercel Firewall rate-limit rule in SECURITY.md is the first.
 */
const WINDOW = 15 * 60 * 1000; const PER_IP = 5; const GLOBAL = 20;
const fails = new Map();
export function limiter(now = Date.now()) {
  const recent = (k) => (fails.get(k) || []).filter((t) => now - t < WINDOW);
  return {
    blocked(ip) { return recent(ip).length >= PER_IP || recent('*').length >= GLOBAL; },
    fail(ip) { for (const k of [ip, '*']) fails.set(k, [...recent(k), now]); if (fails.size > 5000) fails.clear(); },
    reset(ip) { fails.delete(ip); },
  };
}
export const _resetLimiter = () => fails.clear();
