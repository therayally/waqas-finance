// Every page except the login screen and its font needs a valid owner session.
import { next } from '@vercel/functions';
import { COOKIE, readCookie, validToken } from './session.js';

export const config = { matcher: ['/((?!login\\.html|api/login|api/logout|fonts/|favicon).*)'] };

export default async function middleware(request) {
  if (await validToken(readCookie(request, COOKIE))) return next();
  return Response.redirect(new URL('/login.html', request.url), 302);
}
