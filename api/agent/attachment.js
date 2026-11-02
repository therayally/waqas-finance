// GET ?id=<attachment id>: streams one uploaded file's raw bytes back to the relay. Same relay-key auth as
// inbox.js and reply.js — see inbox.js for why there's no CSRF check here. The id itself is only ever handed
// out by inbox.js (inside a message's attachments list), so this never needs to enumerate anything.
import { safeEqual, audit } from '../../lib/security.js';
import { getAttachment } from '../../lib/store.js';

export const config = { runtime: 'nodejs' };

async function core(request) {
  const key = process.env.AGENT_RELAY_KEY;
  const given = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!key || key.length < 20 || !given || !(await safeEqual(given, key))) { audit('agent.attachment_unauthorized', request); return new Response('Unauthorized', { status: 401, headers: { 'Cache-Control': 'no-store' } }); }
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET', 'Cache-Control': 'no-store' } });

  const id = new URL(request.url).searchParams.get('id') || '';
  if (!/^[a-z0-9]{6,40}$/i.test(id)) return new Response('Bad id', { status: 400 });

  const file = await getAttachment(id);
  if (!file) return new Response('Not found', { status: 404 });
  return new Response(file.stream, { headers: { 'Content-Type': file.contentType || 'application/octet-stream', 'Cache-Control': 'no-store' } });
}

export default async function handler(req, res) {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) { if (v != null) headers.set(k, Array.isArray(v) ? v.join(', ') : String(v)); }
  const url = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}${req.url}`;
  const response = await core(new Request(url, { method: req.method, headers }));
  res.statusCode = response.status;
  response.headers.forEach((v, k) => { if (k.toLowerCase() !== 'content-length') res.setHeader(k, v); });
  if (response.body) {
    const reader = response.body.getReader();
    while (true) { const { done, value } = await reader.read(); if (done) break; res.write(value); }
  }
  res.end();
}
