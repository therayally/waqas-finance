// His bank connection through Plaid. Owner session only (never the relay key); every POST also needs a same-site
// request (CSRF guard). GET: status, linked accounts and monthly actuals. POST { action }:
//   link_token  -> a short-lived token the browser uses to open Plaid's bank sign-in
//   exchange    -> trade the public_token Plaid hands back for a long-lived access token, stored encrypted
//   sync        -> pull balances and new transactions for every linked bank
//   disconnect  -> remove one bank at Plaid and delete its stored data
// Access tokens, the Plaid secret and raw account numbers are never sent to the browser or written to a log.
import { config as settingsFrom, checkToken, readCookie, sameOrigin, audit } from '../lib/security.js';
import { getBanks, setBanks, getBankTx, setBankTx } from '../lib/store.js';
import { plaid, plaidConfig } from '../lib/plaid.js';
import { seal, open } from '../lib/vault.js';
import { monthlySummary } from '../lib/bank.js';
import { adapt } from '../lib/node-adapter.js';

export const config = { runtime: 'nodejs' };

const KEEP_DAYS = 730;
const json = (data, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const fail = (msg, status = 400) => new Response(msg, { status, headers: { 'Cache-Control': 'no-store' } });

const publicItem = (i) => ({ item_id: i.item_id, institution: i.institution, accounts: i.accounts || [], synced_at: i.synced_at || 0, error: i.error || '' });

async function syncItem(item, txStore) {
  const access_token = await open(item.token);
  try {
    const acc = await plaid('/accounts/get', { access_token });
    item.accounts = acc.accounts.map((a) => ({ id: a.account_id, name: a.name, mask: a.mask || '', type: a.type, subtype: a.subtype || '', current: a.balances?.current ?? null, available: a.balances?.available ?? null }));
    let cursor = item.cursor || ''; let more = true; let guard = 0;
    while (more && guard++ < 40) {
      const r = await plaid('/transactions/sync', { access_token, ...(cursor ? { cursor } : {}), count: 500, options: { include_personal_finance_category: true } });
      for (const t of [...r.added, ...r.modified]) {
        txStore[t.transaction_id] = { item: item.item_id, account: t.account_id, date: t.date, name: t.name, merchant: t.merchant_name || '', amount: t.amount, cat: t.personal_finance_category?.primary || '', det: t.personal_finance_category?.detailed || '', pending: !!t.pending };
      }
      for (const t of r.removed) delete txStore[t.transaction_id];
      cursor = r.next_cursor; more = r.has_more;
    }
    item.cursor = cursor; item.synced_at = Date.now(); item.error = '';
  } catch (e) {
    item.error = e.code || 'SYNC_FAILED'; // e.g. PRODUCT_NOT_READY (the bank is still loading history) or ITEM_LOGIN_REQUIRED
  }
}

async function core(request) {
  const s = settingsFrom();
  const session = s.ok ? await checkToken(s.secret, readCookie(request)) : { ok: false };
  if (!session.ok) return fail('Unauthorized', 401);
  const cfg = plaidConfig();

  if (request.method === 'GET') {
    const { items } = await getBanks(); const { tx } = await getBankTx();
    return json({ configured: cfg.ok, env: cfg.env, redirect_set: !!process.env.PLAID_REDIRECT_URI, items: items.map(publicItem), tx_count: Object.keys(tx).length, monthly: monthlySummary(Object.values(tx)) });
  }
  if (request.method !== 'POST') return fail('Method not allowed', 405);
  if (!sameOrigin(request)) { audit('plaid.rejected_cross_site', request); return fail('Forbidden', 403); }
  if (!cfg.ok) return fail('Plaid is not set up yet. Add PLAID_CLIENT_ID and PLAID_SECRET in Vercel.', 503);
  let body; try { body = await request.json(); } catch { return fail('Bad JSON'); }

  try {
    if (body.action === 'link_token') {
      const r = await plaid('/link/token/create', {
        user: { client_user_id: 'owner' }, client_name: 'Waqas Personal Finance', products: ['transactions'], country_codes: ['US'], language: 'en',
        transactions: { days_requested: KEEP_DAYS },
        ...(process.env.PLAID_REDIRECT_URI ? { redirect_uri: process.env.PLAID_REDIRECT_URI } : {}), // needed for banks that sign in through their own site (Bank of America, Chase...); must be registered in the Plaid dashboard
      });
      audit('plaid.link_token', request);
      return json({ link_token: r.link_token });
    }
    if (body.action === 'exchange') {
      const pub = String(body.public_token || ''); if (!/^public-[a-z]+-[\w-]+$/.test(pub)) return fail('Bad token');
      const r = await plaid('/item/public_token/exchange', { public_token: pub });
      const banks = await getBanks(); const txs = await getBankTx();
      banks.items = banks.items.filter((i) => i.item_id !== r.item_id);
      const item = { item_id: r.item_id, institution: { name: String(body.institution?.name || '').slice(0, 80), id: String(body.institution?.institution_id || '').slice(0, 40) }, token: await seal(r.access_token), cursor: '', accounts: [], synced_at: 0, error: '' };
      await syncItem(item, txs.tx); banks.items.push(item);
      await setBanks(banks); await setBankTx(txs);
      audit('plaid.linked', request);
      return json({ items: banks.items.map(publicItem), tx_count: Object.keys(txs.tx).length });
    }
    if (body.action === 'sync') {
      const banks = await getBanks(); const txs = await getBankTx();
      for (const item of banks.items) await syncItem(item, txs.tx);
      const cutoff = new Date(Date.now() - KEEP_DAYS * 864e5).toISOString().slice(0, 10);
      for (const [id, t] of Object.entries(txs.tx)) if (t.date < cutoff) delete txs.tx[id];
      await setBanks(banks); await setBankTx(txs);
      audit('plaid.synced', request, { banks: banks.items.length });
      return json({ items: banks.items.map(publicItem), tx_count: Object.keys(txs.tx).length, monthly: monthlySummary(Object.values(txs.tx)) });
    }
    if (body.action === 'disconnect') {
      const banks = await getBanks(); const item = banks.items.find((i) => i.item_id === body.item_id);
      if (!item) return fail('Not found', 404);
      try { await plaid('/item/remove', { access_token: await open(item.token) }); } catch { /* already gone at Plaid: still delete ours */ }
      const txs = await getBankTx();
      for (const [id, t] of Object.entries(txs.tx)) if (t.item === item.item_id) delete txs.tx[id];
      banks.items = banks.items.filter((i) => i.item_id !== item.item_id);
      await setBanks(banks); await setBankTx(txs);
      audit('plaid.disconnected', request);
      return json({ items: banks.items.map(publicItem), tx_count: Object.keys(txs.tx).length });
    }
    return fail('Unknown action');
  } catch (e) {
    audit('plaid.error', request, { action: body?.action, code: e.code || 'ERROR' }); // the code only: never the message, which can echo account details
    return fail(e.code === 'NOT_CONFIGURED' ? e.message : `Plaid couldn't do that (${e.code || 'error'}). Try again.`, 502);
  }
}

export default adapt(core);
