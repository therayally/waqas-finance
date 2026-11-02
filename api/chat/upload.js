// POST { file_name, content_type, data_base64 }: stores one attachment (a receipt, bank statement page or photo)
// for the chat to send with the next message. Owner session only (not the relay key — only Waqas uploads;
// the relay only ever downloads, via api/agent/attachment.js). Same CSRF guard as the rest of the owner-facing
// API. Node runtime: see api/pf.js for why (lib/store.js needs @vercel/blob's Node internals).
import { config as settingsFrom, checkToken, readCookie, sameOrigin, audit } from '../../lib/security.js';
import { putAttachment } from '../../lib/store.js';

export const config = { runtime: 'nodejs' };

const MAX_BYTES = 3.5 * 1024 * 1024; // 3.5MB decoded (~4.8MB as base64) — Vercel's Node functions cap request bodies around 4.5-5MB
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'application/pdf', 'text/csv', 'text/plain', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

async function core(request) {
  const s = settingsFrom();
  const session = s.ok ? await checkToken(s.secret, readCookie(request)) : { ok: false };
  if (!session.ok) return new Response('Unauthorized', { status: 401, headers: { 'Cache-Control': 'no-store' } });
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' } });
  if (!sameOrigin(request)) { audit('chat.upload_rejected_cross_site', request); return new Response('Forbidden', { status: 403 }); }

  const len = Number(request.headers.get('content-length') || 0);
  if (len > MAX_BYTES * 1.4) return new Response('File too large (3.5MB max)', { status: 413 });

  let body; try { body = await request.json(); } catch { return new Response('Bad JSON', { status: 400 }); }
  const fileName = String(body?.file_name || 'file').replace(/[^\w.\- ]+/g, '_').slice(0, 120);
  const contentType = String(body?.content_type || '');
  if (!ALLOWED.has(contentType)) return new Response('Images, PDFs, CSV and Excel (.xlsx) files are accepted', { status: 400 });

  let buffer;
  try { buffer = Buffer.from(String(body?.data_base64 || ''), 'base64'); } catch { return new Response('Bad file data', { status: 400 }); }
  if (!buffer.length) return new Response('Empty file', { status: 400 });
  if (buffer.length > MAX_BYTES) return new Response('File too large (3.5MB max)', { status: 413 });

  const id = uid();
  try { await putAttachment(id, buffer, contentType); } catch (e) { audit('chat.upload_failed', request, { error: String(e.message || e) }); return new Response('Could not save the file — try again', { status: 502 }); }
  audit('chat.uploaded', request, { bytes: buffer.length, contentType });
  return Response.json({ id, file_name: fileName, content_type: contentType, size: buffer.length }, { headers: { 'Cache-Control': 'no-store' } });
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
