import { COOKIE } from '../session.js';

export const config = { runtime: 'edge' };

export default function handler() {
  return new Response(null, {
    status: 303,
    headers: { Location: '/login.html', 'Set-Cookie': `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict` },
  });
}
