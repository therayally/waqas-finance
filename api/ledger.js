// Transactions read from documents: bank and card statement rows, and one-time receipts. Either the owner's session
// or the relay's key (Claude Code, which has no cookie) may use it, same rule as api/pf.js; a cookie-authenticated POST
// also needs a same-site request. GET lists imports and which banks are already linked directly. POST { action }:
//   add_rows      { account_label, source_file, rows: [{ date, description, amount }] }  (money OUT is positive, money IN negative)
//   remove_import { import_id }   takes a whole import back out (the undo)
// Rows are stored exactly as given (never categorised here) and de-duplicated by account, date, amount and description.
import { createHash } from 'node:crypto';
import { config as settingsFrom, checkToken, readCookie, sameOrigin, safeEqual, audit } from '../lib/security.js';
import { getLedger, setLedger, getBanks } from '../lib/store.js';
import { monthlySummary } from '../lib/bank.js';
import { adapt } from '../lib/node-adapter.js';

export const config = { runtime: 'nodejs' };

const MAX_ROWS = 1500;
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const json = (d, status = 200) => Response.json(d, { status, headers: { 'Cache-Control': 'no-store' } });
const fail = (m, status = 400) => new Response(m, { status, headers: { 'Cache-Control': 'no-store' } });

async function viaRelayKey(request) {
  const key = process.env.AGENT_RELAY_KEY; const given = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  return !!(key && key.length >= 20 && given && (await safeEqual(given, key)));
}

async function core(request) {
  const relay = await viaRelayKey(request); let cookieAuthed = false;
  if (!relay) {
    const s = settingsFrom(); const session = s.ok ? await checkToken(s.secret, readCookie(request)) : { ok: false };
    if (!session.ok) return fail('Unauthorized', 401);
    cookieAuthed = true;
  }
  const ledger = await getLedger();

  if (request.method === 'GET') {
    const banks = await getBanks();
    const imports = Object.values(ledger.imports).sort((a, b) => a.at - b.at).slice(-40);
    return json({ imports, row_count: Object.keys(ledger.rows).length, linked_banks: banks.items.map((i) => ({ institution: i.institution?.name || '', accounts: (i.accounts || []).map((a) => `${a.name}${a.mask ? ' ····' + a.mask : ''}`) })), monthly: monthlySummary(Object.values(ledger.rows), 12) });
  }
  if (request.method !== 'POST') return fail('Method not allowed', 405);
  if (cookieAuthed && !sameOrigin(request)) { audit('ledger.rejected_cross_site', request); return fail('Forbidden', 403); }
  const len = Number(request.headers.get('content-length') || 0); if (len > 400000) return fail('Too much at once: send the file in parts', 413);
  let body; try { body = await request.json(); } catch { return fail('Bad JSON'); }

  if (body.action === 'add_rows') {
    const acct = String(body.account_label || '').trim().slice(0, 60); const src = String(body.source_file || '').trim().slice(0, 120);
    if (!acct) return fail('account_label is required');
    if (!Array.isArray(body.rows) || !body.rows.length) return fail('rows is empty');
    if (body.rows.length > MAX_ROWS) return fail(`Send at most ${MAX_ROWS} rows at a time`);
    const importId = uid(); const seen = {}; const fresh = []; let skipped = 0;
    for (const r of body.rows) {
      const date = String(r?.date || ''); const amount = Number(r?.amount); const desc = String(r?.description || '').trim().slice(0, 200);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(amount) || !desc) return fail(`Each row needs a date as YYYY-MM-DD, a description and a number amount (problem near "${desc.slice(0, 40)}")`);
      const base = `${norm(acct)}|${date}|${amount.toFixed(2)}|${norm(desc)}`; seen[base] = (seen[base] || 0) + 1; // a real repeat on the same day is a second row, not a duplicate
      const id = createHash('sha1').update(`${base}#${seen[base]}`).digest('hex').slice(0, 20);
      if (ledger.rows[id]) { skipped++; continue; }
      fresh.push([id, { import: importId, account: acct, date, name: desc, merchant: '', amount: Math.round(amount * 100) / 100, cat: '', det: '', pending: false }]);
    }
    for (const [id, row] of fresh) ledger.rows[id] = row;
    if (fresh.length) { const dates = fresh.map(([, r]) => r.date).sort(); ledger.imports[importId] = { id: importId, account: acct, source: src, at: Date.now(), count: fresh.length, first: dates[0], last: dates[dates.length - 1] }; }
    try { await setLedger(ledger); } catch (e) { audit('ledger.save_failed', request, { error: String(e.message || e) }); return fail('Could not save, try again', 502); }
    audit('ledger.added', request, { added: fresh.length, skipped });
    return json({ import_id: fresh.length ? importId : null, added: fresh.length, skipped, total_rows: Object.keys(ledger.rows).length });
  }
  if (body.action === 'remove_import') {
    const imp = ledger.imports[String(body.import_id || '')]; if (!imp) return fail('No such import', 404);
    let removed = 0; for (const [id, r] of Object.entries(ledger.rows)) if (r.import === imp.id) { delete ledger.rows[id]; removed++; }
    delete ledger.imports[imp.id];
    try { await setLedger(ledger); } catch { return fail('Could not save, try again', 502); }
    audit('ledger.import_removed', request, { removed });
    return json({ removed, total_rows: Object.keys(ledger.rows).length });
  }
  return fail('Unknown action');
}

export default adapt(core);
