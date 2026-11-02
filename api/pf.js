// GET returns the current personal-finance data (seeding it on first run); POST applies one add/edit/remove
// action and returns the updated data. Both need a valid owner session (same gate as the rest of the app) and
// POST also needs a same-site request (CSRF guard), same pattern as api/login.js.
import { config as settingsFrom, checkToken, readCookie, sameOrigin, audit } from '../lib/security.js';
import { getPF, setPF } from '../lib/store.js';

export const config = { runtime: 'nodejs' };

// What the dashboard shows before anyone has added or changed anything.
const SEED = {
  cash: [
    { id: 'cash', k: 'Cash on hand', v: 10000 },
    { id: 'boa', k: 'BOA checking', v: 4000 },
    { id: 'trust', k: 'Trust account', v: 44000 }],
  income: [
    { id: 'dist', k: 'Distribution Business', v: 15000 },
    { id: 'unified', k: 'Unified Restaurants', v: 20000 }],
  expenses: [
    { id: 'mortgage', k: 'Mortgage', cat: 'Housing', v: 4407 },
    { id: 'heloc', k: 'HELOC payment', cat: 'Housing', v: 1164 },
    { id: 'personal', k: 'Personal & family spending', cat: 'Personal', v: 7000, note: 'Includes the Apple Card; paid off in full every month' },
    { id: 'taxes', k: 'Taxes', cat: 'Taxes', v: 3400 },
    { id: 'donations', k: 'Donations', cat: 'Giving', v: 4000 },
    { id: 'sba', k: 'SBA loan — Distribution Business', cat: 'Business', v: 2000 },
    { id: 'boaloan', k: 'BOA loan payment', cat: 'Debt', v: 500 },
    { id: 'phone', k: 'Phone', cat: 'Utilities', v: 500 },
    { id: 'electric', k: 'Electric', cat: 'Utilities', v: 400 },
    { id: 'water', k: 'Water', cat: 'Utilities', v: 125 },
    { id: 'comcast', k: 'Comcast', cat: 'Utilities', v: 100 }],
  liabilities: [
    { id: 'boaloanbal', k: 'BOA loan', balance: 17000, payment: 500 },
    { id: 'mortgagebal', k: 'Mortgage', balance: null, payment: 4407 },
    { id: 'helocbal', k: 'HELOC', balance: null, payment: 1164 },
    { id: 'sbabal', k: 'SBA loan — Distribution Business', balance: null, payment: 2000 }],
  periods: [],
};

const uid = () => Math.random().toString(36).slice(2, 10);
const LISTS = new Set(['cash', 'income', 'expenses', 'liabilities']);

function applyAction(data, body) {
  const { action, list: listName, item, id } = body;
  if (!LISTS.has(listName)) throw new Error('Unknown list');
  const arr = data[listName];
  if (action === 'add') {
    const row = { id: uid(), ...item };
    row.v = Number(row.v) || 0;
    if (listName === 'liabilities') { row.balance = row.balance === '' || row.balance == null ? null : Number(row.balance); row.payment = Number(row.payment) || 0; }
    arr.push(row);
  } else if (action === 'remove') {
    const i = arr.findIndex((r) => r.id === id);
    if (i === -1) throw new Error('Not found');
    arr.splice(i, 1);
  } else {
    throw new Error('Unknown action');
  }
  return data;
}

export default async function handler(request) {
  const s = settingsFrom();
  const session = s.ok ? await checkToken(s.secret, readCookie(request)) : { ok: false };
  if (!session.ok) return new Response('Unauthorized', { status: 401, headers: { 'Cache-Control': 'no-store' } });

  if (request.method === 'GET') {
    const data = await getPF(SEED);
    return Response.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
  }

  if (request.method === 'POST') {
    if (!sameOrigin(request)) { audit('pf.rejected_cross_site', request); return new Response('Forbidden', { status: 403 }); }
    const len = Number(request.headers.get('content-length') || 0); if (len > 8192) return new Response('Payload too large', { status: 413 });
    let body; try { body = await request.json(); } catch { return new Response('Bad JSON', { status: 400 }); }
    const data = await getPF(SEED);
    try { applyAction(data, body); } catch (e) { return new Response(e.message, { status: 400 }); }
    try { await setPF(data); } catch (e) { audit('pf.save_failed', request, { error: String(e.message || e) }); return new Response('Could not save — try again', { status: 502 }); }
    audit('pf.updated', request, { action: body.action, list: body.list });
    return Response.json(data, { headers: { 'Cache-Control': 'no-store' } });
  }

  return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, POST', 'Cache-Control': 'no-store' } });
}
