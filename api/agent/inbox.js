// GET: the one pending message for the local relay (public/pf-relay.mjs) to answer, with recent history for
// context. Returns { message: null } when there's nothing to do. A message is "claimed" for 3 minutes once
// handed out, so a slow or crashed run doesn't lose it — after that it's handed out again.
//
// Authenticated by AGENT_RELAY_KEY (Authorization: Bearer ...), not the owner's browser session: this is a
// machine-to-machine endpoint the relay calls from the person's own computer, which has no session cookie.
// Bearer auth isn't cookie-based, so it isn't CSRF-able the way api/pf.js and api/chat.js are; no CSRF check here.
import { safeEqual, audit } from '../../lib/security.js';
import { getChat, setChat, getActive } from '../../lib/store.js';

export const config = { runtime: 'nodejs' };

const CLAIM_MS = 3 * 60 * 1000;
const HISTORY = 12;
const ACTIVE_MS = 60 * 1000; // the chat counts as in use for a minute after its last heartbeat or message

async function core(request) {
  const key = process.env.AGENT_RELAY_KEY;
  const given = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!key || key.length < 20 || !given || !(await safeEqual(given, key))) { audit('agent.inbox_unauthorized', request); return new Response('Unauthorized', { status: 401, headers: { 'Cache-Control': 'no-store' } }); }
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET', 'Cache-Control': 'no-store' } });

  const messages = await getChat([]);
  const now = Date.now();
  const active = now - ((await getActive()).at || 0) < ACTIVE_MS;
  const msg = messages.find((m) => m.role === 'user' && !m.answered && (!m.claimed_at || now - m.claimed_at > CLAIM_MS));
  if (!msg) return Response.json({ message: null, active }, { headers: { 'Cache-Control': 'no-store' } });
  msg.claimed_at = now;
  try { await setChat(messages); } catch { /* worst case the message is handed out twice; harmless, both replies land */ }

  const history = messages
    .filter((m) => m.at < msg.at)
    .slice(-HISTORY)
    .map((m) => `${m.role === 'user' ? 'Waqas' : 'You'}: ${m.body}`)
    .join('\n');

  return Response.json({ message: { id: msg.id, body: msg.body, attachments: msg.attachments || [] }, history, active }, { headers: { 'Cache-Control': 'no-store' } });
}

export default async function handler(req, res) {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) { if (v != null) headers.set(k, Array.isArray(v) ? v.join(', ') : String(v)); }
  const url = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}${req.url}`;
  const response = await core(new Request(url, { method: req.method, headers }));
  res.statusCode = response.status;
  response.headers.forEach((v, k) => { if (k.toLowerCase() !== 'content-length') res.setHeader(k, v); });
  res.end(await response.text());
}
