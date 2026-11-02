// POST { id, status: 'done'|'failed', report }: the relay's finished savings review. Relay-key auth, same as
// inbox.js (see there for why no CSRF check).
import { safeEqual, audit } from '../../lib/security.js';
import { getJobs, setJobs } from '../../lib/store.js';

export const config = { runtime: 'nodejs' };

const MAX_REPORT = 80000;

async function core(request) {
  const key = process.env.AGENT_RELAY_KEY;
  const given = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!key || key.length < 20 || !given || !(await safeEqual(given, key))) { audit('agent.report_unauthorized', request); return new Response('Unauthorized', { status: 401, headers: { 'Cache-Control': 'no-store' } }); }
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' } });
  const len = Number(request.headers.get('content-length') || 0); if (len > 200000) return new Response('Payload too large', { status: 413 });
  let p; try { p = await request.json(); } catch { return new Response('Bad JSON', { status: 400 }); }
  const status = p?.status === 'failed' ? 'failed' : 'done';
  const jobs = await getJobs(); const job = jobs.find((j) => j.id === String(p?.id || ''));
  if (!job) return new Response('Unknown job id', { status: 404 });
  job.status = status; job.finished_at = Date.now(); job.report = String(p?.report || '').slice(0, MAX_REPORT);
  try { await setJobs(jobs); } catch (e) { audit('agent.report_save_failed', request, { error: String(e.message || e) }); return new Response('Could not save \u2014 try again', { status: 502 }); }
  audit('agent.reported', request, { status });
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
