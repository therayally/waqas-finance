// Signed owner session shared by the middleware and the login function.
// The cookie is "<expiry>.<hmac>"; nothing in it can be forged without SESSION_SECRET.

export const COOKIE = 'wfs_session';
export const MAX_AGE = 60 * 60 * 12; // 12 hours

function secret() {
  // Set SESSION_SECRET in Vercel. The fallback only keeps a fresh deploy usable.
  return process.env.SESSION_SECRET || `wfs:${process.env.OWNER_PASS || '2015'}:${process.env.VERCEL_PROJECT_ID || 'local'}`;
}

async function hmac(text) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function makeToken() {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  return `${exp}.${await hmac(`owner|${exp}`)}`;
}

export async function validToken(token) {
  if (!token || !token.includes('.')) return false;
  const [exp, sig] = token.split('.');
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now() / 1000) return false;
  const want = await hmac(`owner|${exp}`);
  if (want.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

export function readCookie(request, name) {
  const raw = request.headers.get('cookie') || '';
  const hit = raw.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${name}=`));
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : null;
}
