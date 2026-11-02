// GET returns the chat history; POST adds one message from Waqas, waiting for the relay (see public/pf-relay.mjs)
// to pick it up from /api/agent/inbox and answer it via /api/agent/reply. Needs a valid owner session, same gate
// as the rest of the app, and POST needs a same-site request (CSRF guard).
//
// Node runtime (see api/pf.js for why): the adapter below turns Node's (req, res) into a Web Request/Response so
// the Fetch-API security helpers (lib/security.js) are reused unchanged.
import { config as settingsFrom, checkToken, readCookie, sameOrigin, audit } from '../lib/security.js';
import { getChat, setChat } from '../lib/store.js';

export const config = { runtime: 'nodejs' };

const uid = () => Math.random().toString(36).slice(2, 10);
const MAX_LEN = 4000;
const KEEP = 200; // messages kept; old ones trimmed so the blob and the prompt sent to the relay stay small

async function core(request) {
  const s = settingsFrom();
  const session = s.ok ? await checkToken(s.secret, readCookie(request)) : { ok: false };
  if (!session.ok) return new Response('Unauthorized', { status: 401, headers: { 'Cache-Control': 'no-store' } });

  if (request.method === 'GET') {
    const messages = await getChat([]);
    return Response.json({ messages }, { headers: { 'Cache-Control': 'private, no-store' } });
  }

  if (request.method === 'POST') {
    if (!sameOrigin(request)) { audit('chat.rejected_cross_site', request); return new Response('Forbidden', { status: 403 }); }
    const len = Number(request.headers.get('content-length') || 0); if (len > 8192) return new Response('Payload too large', { status: 413 });
    let body; try { body = await request.json(); } catch { return new Response('Bad JSON', { status: 400 }); }
    const text = String(body?.body || '').trim().slice(0, MAX_LEN);
    if (!text) return new Response('Empty message', { status: 400 });
    const messages = await getChat([]);
    messages.push({ id: uid(), role: 'user', body: text, at: Date.now(), answered: false });
    const trimmed = messages.slice(-KEEP);
    try { await setChat(trimmed); } catch (e) { audit('chat.save_failed', request, { error: String(e.message || e) }); return new Response('Could not save — try again', { status: 502 }); }
    audit('chat.sent', request);
    return Response.json({ messages: trimmed }, { headers: { 'Cache-Control': 'no-store' } });
  }

  return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, POST', 'Cache-Control': 'no-store' } });
}

export default async function handler(req, res) {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) { if (v != null) headers.set(k, Array.isArray(v) ? v.join(', ') : String(v)); }
  const url = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}${req.url}`;
  const init = { method: req.method, headers };
  if (req.method === 'POST') init.body = JSON.stringify(req.body ?? {});
  const response = await core(new Request(url, init));
  res.statusCode = response.status;
  response.headers.forEach((v, k) => { if (k.toLowerCase() !== 'content-length') res.setHeader(k, v); });
  res.end(await response.text());
}
