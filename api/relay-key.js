// GET: a setup code for the dashboard's "Get my setup command" button (like Chef Nerd's Connect your AI page).
// The code is good for 10 minutes and is traded for the relay key by api/agent/setup.js, so the key itself never
// appears on screen or in the command you paste. Owner session only; never cached. The code is a signed
// expiry time (HMAC with SESSION_SECRET), so nothing is stored.
import { config as settingsFrom, checkToken, readCookie } from '../lib/security.js';

export const config = { runtime: 'edge' };

const TTL_S = 10 * 60;
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function makeSetupCode(secret, now = Math.floor(Date.now() / 1000)) {
  const exp = (now + TTL_S).toString(36);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return `setup_${exp}.${hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`setup:${exp}`)))}`;
}

export default async function handler(request) {
  const s = settingsFrom();
  const session = s.ok ? await checkToken(s.secret, readCookie(request)) : { ok: false };
  if (!session.ok) return new Response('Unauthorized', { status: 401, headers: { 'Cache-Control': 'no-store' } });
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET', 'Cache-Control': 'no-store' } });
  if ((process.env.AGENT_RELAY_KEY || '').length < 20) return new Response('The relay key is not set up yet', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  return Response.json({ code: await makeSetupCode(s.secret), expires_in: TTL_S }, { headers: { 'Cache-Control': 'no-store' } });
}
