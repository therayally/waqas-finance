// The personal-finance data store: one JSON blob in a private Vercel Blob store (not public; reading its content
// needs BLOB_READ_WRITE_TOKEN, which only our server code holds), read and written only from api/pf.js, which
// requires a valid owner session. Nothing in /public talks to Blob directly.
import { put, list } from '@vercel/blob';

const KEY = 'pf-data.json';

export async function getPF(seed) {
  try {
    const { blobs } = await list({ prefix: KEY, limit: 1 });
    const match = blobs.find((b) => b.pathname === KEY);
    if (!match) return seed;
    const res = await fetch(match.url, { cache: 'no-store', headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` } });
    if (!res.ok) return seed;
    const data = await res.json();
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
