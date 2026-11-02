// GET: the savings-review jobs (newest last). POST: queue a new review. Owner session, same gate as api/chat.js.
// The relay (public/pf-relay.mjs) picks the job up from api/agent/inbox.js, researches it on the owner's own
// computer with Claude Code and web search, and posts the finished report to api/agent/report.js.
// Node runtime + adapter: see api/pf.js for why.
import { config as settingsFrom, checkToken, readCookie, sameOrigin, audit } from '../lib/security.js';
import { getJobs, setJobs, setActive } from '../lib/store.js';

export const config = { runtime: 'nodejs' };

const uid = () => Math.random().toString(36).slice(2, 10);
const KEEP = 10;
const STALE_MS = 30 * 60 * 1000; // a job still "running" after this long is treated as dead, so a new one can start

async function core(request) {
  const s = settingsFrom();
  const session = s.ok ? await checkToken(s.secret, readCookie(request)) : { ok: false };
  if (!session.ok) return new Response('Unauthorized', { status: 401, headers: { 'Cache-Control': 'no-store' } });

  if (request.method === 'GET') return Response.json({ jobs: await getJobs() }, { headers: { 'Cache-Control': 'private, no-store' } });

  if (request.method === 'POST') {
    if (!sameOrigin(request)) { audit('savings.rejected_cross_site', request); return new Response('Forbidden', { status: 403 }); }
    const len = Number(request.headers.get('content-length') || 0); if (len > 4096) return new Response('Payload too large', { status: 413 });
    let body; try { body = await request.json(); } catch { return new Response('Bad JSON', { status: 400 }); }
    const jobs = await getJobs(); const now = Date.now();
    const open = jobs.find((j) => (j.status === 'queued' || j.status === 'running') && now - j.at < STALE_MS);
    if (open) return Response.json({ jobs, already: true }, { headers: { 'Cache-Control': 'no-store' } });
    jobs.push({ id: uid(), status: 'queued', at: now, focus: String(body?.focus || '').trim().slice(0, 600) });
    const kept = jobs.slice(-KEEP);
    try { await setJobs(kept); await setActive(now); } catch (e) { audit('savings.save_failed', request, { error: String(e.message || e) }); return new Response('Could not save \u2014 try again', { status: 502 }); }
    audit('savings.queued', request);
    return Response.json({ jobs: kept }, { headers: { 'Cache-Control': 'no-store' } });
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
