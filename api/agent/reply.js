// POST { id, body }: the relay's answer to one message from /api/agent/inbox. Appends it to the chat and marks
// the original answered. Same relay-key auth as inbox.js; see that file for why there's no CSRF check here.
import { safeEqual, audit } from '../../lib/security.js';
import { getChat, setChat } from '../../lib/store.js';

export const config = { runtime: 'nodejs' };

const uid = () => Math.random().toString(36).slice(2, 10);
const MAX_LEN = 8000;

async function core(request) {
  const key = process.env.AGENT_RELAY_KEY;
  const given = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!key || key.length < 20 || !given || !(await safeEqual(given, key))) { audit('agent.reply_unauthorized', request); return new Response('Unauthorized', { status: 401, headers: { 'Cache-Control': 'no-store' } }); }
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' } });

  const len = Number(request.headers.get('content-length') || 0); if (len > 16384) return new Response('Payload too large', { status: 413 });
  let payload; try { payload = await request.json(); } catch { return new Response('Bad JSON', { status: 400 }); }
  const id = String(payload?.id || ''); const text = String(payload?.body || '').trim().slice(0, MAX_LEN);
  if (!id || !text) return new Response('id and body are required', { status: 400 });

  const messages = await getChat([]);
  const original = messages.find((m) => m.id === id);
  if (!original) return new Response('Unknown message id', { status: 404 });
  original.answered = true;
  messages.push({ id: uid(), role: 'assistant', body: text, at: Date.now(), replyTo: id });
  try { await setChat(messages); } catch (e) { audit('agent.reply_save_failed', request, { error: String(e.message || e) }); return new Response('Could not save — try again', { status: 502 }); }
  audit('agent.replied', request);
  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
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
