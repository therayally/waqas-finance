import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { seal, open } from '../lib/vault.js';
import { monthlySummary, recurring, topMerchants, bankSummary } from '../lib/bank.js';

const tx = (date, amount, over = {}) => ({ date, amount, name: 'X', merchant: '', cat: 'GENERAL_MERCHANDISE', det: '', pending: false, ...over });

test('vault: a bank token round-trips, is not stored readable, differs each time, and a wrong key or tampering fails', async () => {
  process.env.SESSION_SECRET = 's'.repeat(40);
  const token = 'access-sandbox-12345678-abcd';
  const a = await seal(token), b = await seal(token);
  assert.notEqual(a, b); assert.ok(!a.includes('access-sandbox'));
  assert.equal(await open(a), token);
  await assert.rejects(open(a.slice(0, -3) + 'AAA'));
  process.env.SESSION_SECRET = 'z'.repeat(40);
  await assert.rejects(open(a), 'a different secret cannot read it');
  process.env.SESSION_SECRET = 's'.repeat(40);
});

test('bank: monthly in/out leaves out transfers, card payments and pending items, and counts refunds as money in', () => {
  const m = monthlySummary([
    tx('2026-09-02', -5000, { cat: 'INCOME' }), tx('2026-09-03', 1200, { cat: 'RENT_AND_UTILITIES' }), tx('2026-09-04', 300, { cat: 'FOOD_AND_DRINK' }),
    tx('2026-09-05', 4000, { cat: 'TRANSFER_OUT' }), tx('2026-09-06', -4000, { cat: 'TRANSFER_IN' }),
    tx('2026-09-07', 900, { cat: 'LOAN_PAYMENTS', det: 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT' }), tx('2026-09-08', 77, { pending: true }),
    tx('2026-09-09', -40, { cat: 'GENERAL_MERCHANDISE' }),
    tx('2026-10-01', 500),
  ]);
  assert.deepEqual(m.map((x) => x.month), ['2026-09', '2026-10']);
  assert.equal(m[0].income, 5040); assert.equal(m[0].expenses, 1500); assert.equal(m[0].net, 3540);
  assert.equal(m[0].top[0].cat, 'RENT_AND_UTILITIES'); assert.equal(m[1].expenses, 500);
});

test('bank: recurring finds merchants paid in 3+ months, and flags steady amounts', () => {
  const t = [];
  for (const mo of ['2026-07', '2026-08', '2026-09']) { t.push(tx(`${mo}-05`, 100, { merchant: 'Comcast' })); t.push(tx(`${mo}-15`, mo === '2026-07' ? 20 : 200, { merchant: 'Diner' })); }
  t.push(tx('2026-09-20', 50, { merchant: 'Once' }));
  const r = recurring(t);
  assert.deepEqual(r.map((x) => x.name).sort(), ['Comcast', 'Diner']);
  assert.equal(r.find((x) => x.name === 'Comcast').steady, true); assert.equal(r.find((x) => x.name === 'Diner').steady, false);
  assert.equal(topMerchants(t, '2026-01-01')[0].name, 'Diner');
});

test('bank: the summary for the AI has balances and actuals but no transaction ids or account numbers', () => {
  const s = bankSummary([{ institution: { name: 'BOA' }, accounts: [{ name: 'Checking', type: 'depository', subtype: 'checking', current: 4000, available: 3900, mask: '1234', id: 'acc_1' }] }], [tx('2026-09-02', 10)]);
  const text = JSON.stringify(s);
  assert.equal(s.balances[0].current, 4000); assert.ok(!text.includes('1234') && !text.includes('acc_1'));
  assert.equal(bankSummary([], []), null);
});

test('plaid: only the connect page may load Plaid; the dashboard keeps script-src self and never references Plaid', () => {
  const v = JSON.parse(fs.readFileSync('vercel.json', 'utf8')); const rule = (src) => v.headers.find((h) => h.source === src);
  const csp = (r) => r.headers.find((x) => x.key === 'Content-Security-Policy').value;
  assert.match(csp(v.headers[0]), /script-src 'self';/); assert.doesNotMatch(csp(v.headers[0]), /plaid/);
  assert.match(v.headers[0].source, /\?!connect-bank/, 'the strict rule excludes only the connect page');
  assert.match(csp(rule('/connect-bank.html')), /script-src 'self' https:\/\/cdn\.plaid\.com;/); assert.match(csp(rule('/connect-bank.html')), /frame-ancestors 'none'/);
  for (const f of ['public/index.html', 'public/app.js', 'public/login.html']) assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /cdn\.plaid\.com/, `${f} never loads Plaid`);
  assert.doesNotMatch(fs.readFileSync('public/connect-bank.html', 'utf8'), /<script(?![^>]*\bsrc=)[^>]*>/, 'no inline script on the connect page');
  const all = ['api/plaid.js', 'lib/plaid.js'].map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  assert.doesNotMatch(all, /console\.log\([^)]*(secret|token)/i, 'no token or secret is logged');
});
