// Private JSON "documents" in Vercel Blob (access: 'private', so it needs BLOB_READ_WRITE_TOKEN to read, not just
// a guessable URL). One document per key: 'pf-data.json' (the dashboard numbers), 'chat-messages.json' (the
// assistant chat). Read and written only from api/*.js, which require a valid owner session or relay key.
import { put, get } from '@vercel/blob';

async function getJSON(key, seed) {
  try {
    const result = await get(key, { access: 'private', useCache: false }); // read-modify-write across functions: a cached read would silently undo a recent write
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
// Presence: when the dashboard's chat was last open and in use. The relay reads it (via api/agent/inbox.js) to
// poll fast while someone is chatting and almost not at all when nobody is.
// Savings reviews: long research jobs queued from the dashboard, run by the relay with web search, report saved here.
export const getJobs = () => getJSON('savings-jobs.json', []);
export const setJobs = (data) => setJSON('savings-jobs.json', data);
export const getActive = () => getJSON('chat-active.json', { at: 0 });
export const setActive = (at) => setJSON('chat-active.json', { at });

// Chat attachments (receipts, statements, photos): raw bytes, not JSON, one blob per attachment id.
// Uploaded by api/chat/upload.js (owner session), read back by api/agent/attachment.js (relay key).
export async function putAttachment(id, buffer, contentType) {
  await put(`chat-files/${id}`, buffer, { access: 'private', contentType, addRandomSuffix: false, allowOverwrite: true });
}
export async function getAttachment(id) {
  const result = await get(`chat-files/${id}`, { access: 'private' });
  if (!result) return null;
  return { stream: result.stream, contentType: result.contentType };
}
