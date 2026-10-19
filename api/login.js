// POST /api/login: checks the owner's name and code on the server and starts a signed, HttpOnly session.
// Fails closed when the settings are missing; slows and then locks repeated failures; logs every attempt without the code.
import { config as settingsFrom, safeEqual, makeToken, cookie, sameOrigin, clientIp, audit, limiter } from '../lib/security.js';

export const config = { runtime: 'edge' };

const back = (request, code) => new Response(null, { status: 303, headers: { Location: `/login.html?e=${code}`, 'Cache-Control': 'no-store' } });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Vercel calls the default export as (request, context): the second argument is never the settings.
export default function handler(request) { return signIn(request); }

export async function signIn(request, env) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
  if (!sameOrigin(request)) { audit('login.rejected_cross_site', request); return new Response('Forbidden', { status: 403 }); }
  const settings = env ? settingsFrom(env) : settingsFrom();
  if (!settings.ok) { audit('login.not_configured', request, { problems: settings.problems }); return back(request, 3); }
  const ip = clientIp(request); const limit = limiter();
  if (limit.blocked(ip)) { audit('login.locked_out', request); return back(request, 2); }
  const len = Number(request.headers.get('content-length') || 0); if (len > 2048) return new Response('Payload too large', { status: 413 });
  const form = await request.formData().catch(() => null);
  const user = String(form?.get('username') || '').trim().slice(0, 64);
  const pass = String(form?.get('password') || '').slice(0, 64);
  const okUser = await safeEqual(user.toLowerCase(), settings.user.toLowerCase());
  const okPass = await safeEqual(pass, settings.pass);
  if (!(okUser && okPass)) {
    limit.fail(ip); audit('login.failed', request);
    await wait(1000 + Math.floor(Math.random() * 500)); // slows guessing and evens out timing
    return back(request, limit.blocked(ip) ? 2 : 1);
  }
  limit.reset(ip); audit('login.succeeded', request);
  return new Response(null, { status: 303, headers: { Location: '/', 'Set-Cookie': cookie(await makeToken(settings.secret)), 'Cache-Control': 'no-store' } });
}
