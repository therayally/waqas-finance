// Encrypts the bank access tokens before they are stored (AES-256-GCM). A Plaid access token can read his bank
// data, so it never sits in storage in the clear. The key is derived from PLAID_VAULT_KEY if set, else SESSION_SECRET.
const enc = new TextEncoder(); const dec = new TextDecoder();
const b64 = (u8) => Buffer.from(u8).toString('base64');
const unb64 = (s) => new Uint8Array(Buffer.from(s, 'base64'));

async function key() {
  const secret = process.env.PLAID_VAULT_KEY || process.env.SESSION_SECRET || '';
  if (secret.length < 32) throw new Error('No secret available to protect bank tokens');
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(`pf-vault:${secret}`));
  return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function seal(text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(), enc.encode(text)));
  return `${b64(iv)}.${b64(ct)}`;
}
export async function open(sealed) {
  const [iv, ct] = String(sealed).split('.');
  if (!iv || !ct) throw new Error('Bad sealed value');
  return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await key(), unb64(ct)));
}
