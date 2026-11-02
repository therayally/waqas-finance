// GET: the relay key, so the dashboard's Assistant setup can show a one-command install with the key already
// filled in (like Chef Nerd's "Connect your AI" page). Owner session only; never cached. The key lets a program
// read and answer this chat and read/change the dashboard numbers, so it's shown only to a signed-in owner.
import { config as settingsFrom, checkToken, readCookie } from '../lib/security.js';

export const config = { runtime: 'edge' };

export default async function handler(request) {
  const s = settingsFrom();
  const session = s.ok ? await checkToken(s.secret, readCookie(request)) : { ok: false };
  if (!session.ok) return new Response('Unauthorized', { status: 401, headers: { 'Cache-Control': 'no-store' } });
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET', 'Cache-Control': 'no-store' } });
  const key = process.env.AGENT_RELAY_KEY || '';
  if (key.length < 20) return new Response('The relay key is not set up yet', { status: 503, headers: { 'Cache-Control': 'no-store' } });
  return Response.json({ key }, { headers: { 'Cache-Control': 'no-store' } });
}
