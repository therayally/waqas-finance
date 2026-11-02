// The personal-finance data store: one JSON blob in a private Vercel Blob store (access: 'private', so it needs
// BLOB_READ_WRITE_TOKEN to read, not just a guessable URL), read and written only from api/pf.js, which
// requires a valid owner session. Nothing in /public talks to Blob directly.
import { put, get } from '@vercel/blob';

const KEY = 'pf-data.json';

export async function getPF(seed) {
  try {
    const result = await get(KEY, { access: 'private' });
    if (!result) return seed;
    const text = await new Response(result.stream).text();
    const data = JSON.parse(text);
    return data && typeof data === 'object' ? data : seed;
  } catch (e) {
    return seed;
  }
}

export async function setPF(data) {
  await put(KEY, JSON.stringify(data, null, 2), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return data;
}
