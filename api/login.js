// Checks the owner name and code on the server and sets a signed, HttpOnly session cookie.
import { COOKIE, MAX_AGE, makeToken } from '../session.js';

export const config = { runtime: 'edge' };

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export default async function handler(request) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const form = await request.formData().catch(() => null);
  const user = String(form?.get('username') || '').trim();
  const pass = String(form?.get('password') || '');
  const wantUser = process.env.OWNER_USER || 'Waqas';
  const wantPass = process.env.OWNER_PASS || '2015';
  if (user.toLowerCase() !== wantUser.toLowerCase() || pass !== wantPass) {
    await wait(900); // slows guessing
    return Response.redirect(new URL('/login.html?e=1', request.url), 303);
  }
  const token = await makeToken();
  return new Response(null, {
    status: 303,
    headers: {
      Location: '/',
      'Set-Cookie': `${COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Strict`,
    },
  });
}
