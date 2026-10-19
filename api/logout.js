// POST /api/logout: ends the session. POST only and same-site only, so another website cannot sign the owner out.
import { clearCookie, sameOrigin, audit } from '../lib/security.js';

export const config = { runtime: 'edge' };

export default function handler(request) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
  if (!sameOrigin(request)) { audit('logout.rejected_cross_site', request); return new Response('Forbidden', { status: 403 }); }
  audit('logout', request);
  return new Response(null, { status: 303, headers: { Location: '/login.html?e=4', 'Set-Cookie': clearCookie(), 'Cache-Control': 'no-store', 'Clear-Site-Data': '"cache", "storage"' } });
}
