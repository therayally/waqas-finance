// Every page and file except the sign-in screen, its script, the stylesheet, the font and robots.txt needs a valid owner session.
// Each allowed request slides the 30-minute idle window forward; the 8-hour absolute limit never moves (NIST 800-63B 7.2).
import { next } from '@vercel/functions';
import { config as settingsFrom, checkToken, makeToken, readCookie, cookie, audit } from './lib/security.js';

export const config = { matcher: ['/((?!login\\.html|login\\.js|app\\.css|fonts/|robots\\.txt|api/login|api/logout).*)'] };

export default async function middleware(request) {
  const s = settingsFrom();
  const session = s.ok ? await checkToken(s.secret, readCookie(request)) : { ok: false };
  if (session.ok) {
    const now = Math.floor(Date.now() / 1000);
    return next({ headers: { 'Set-Cookie': cookie(await makeToken(s.secret, now, session.issued)), 'Cache-Control': 'private, no-store' } });
  }
  const path = new URL(request.url).pathname;
  if (readCookie(request)) audit('session.rejected', request); // an expired or tampered cookie, worth a line in the log
  if (path === '/' || path.endsWith('.html') || !path.includes('.')) return Response.redirect(new URL('/login.html', request.url), 302);
  return new Response('Unauthorized', { status: 401, headers: { 'Cache-Control': 'no-store' } });
}
