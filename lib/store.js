// Private JSON "documents" in Vercel Blob (access: 'private', so it needs BLOB_READ_WRITE_TOKEN to read, not just
// a guessable URL). One document per key: 'pf-data.json' (the dashboard numbers), 'chat-messages.json' (the
// assistant chat). Read and written only from api/*.js, which require a valid owner session or relay key.
import { put, get } from '@vercel/blob';

async function getJSON(key, seed) {
  try {
    const result = await get(key, { access: 'private' });
    if (!result) return seed;
    const text = await new Response(result.stream).text();
    const data = JSON.parse(text);
    return data !== undefined && data !== null ? data : seed;
  } catch (e) {
    return seed;
  }
}

async function setJSON(key, data) {
  await put(key, JSON.stringify(data, null, 2), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  return data;
}

export const getPF = (seed) => getJSON('pf-data.json', seed);
export const setPF = (data) => setJSON('pf-data.json', data);
export const getChat = (seed = []) => getJSON('chat-messages.json', seed);
export const setChat = (data) => setJSON('chat-messages.json', data);
