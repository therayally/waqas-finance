// POST { code }: trades a setup code from api/relay-key.js for the relay key. Called by public/install-relay.sh
// and install-relay.ps1 during install; no session (the installer runs in a terminal, not a browser). The
// code is a signed 10-minute expiry, so it can't be forged or used after it lapses.
import { config as settingsFrom, safeEqual, audit } from '../../lib/security.js';

export const config = { runtime: 'edge' };

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export default async function handler(request) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' } });
  const s = settingsFrom(); const relayKey = process.env.AGENT_RELAY_KEY || '';
  if (!s.ok || relayKey.length < 20) return new Response('Not set up', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  const len = Number(request.headers.get('content-length') || 0); if (len > 512) return new Response('Payload too large', { status: 413 });
  let body; try { body = await request.json(); } catch { return new Response('Bad JSON', { status: 400 }); }
  const m = /^setup_([0-9a-z]{1,10})\.([0-9a-f]{64})$/.exec(String(body?.code || ''));
  const bad = () => { audit('agent.setup_rejected', request); return new Response('That setup code is not valid or has expired. Get a new one from the dashboard.', { status: 401, headers: { 'Cache-Control': 'no-store' } }); };
  if (!m) return bad();
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(s.secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`setup:${m[1]}`)));
  if (!(await safeEqual(m[2], expected))) return bad();
  if (parseInt(m[1], 36) < Math.floor(Date.now() / 1000)) return bad();
  audit('agent.setup_ok', request);
  return Response.json({ key: relayKey }, { headers: { 'Cache-Control': 'no-store' } });
}
