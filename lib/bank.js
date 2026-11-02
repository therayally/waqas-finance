// Turns linked-bank transactions into the numbers the dashboard and the AI use. Pure functions, no I/O.
// Plaid's sign: a positive amount is money OUT of the account, negative is money IN.
// Approximations to know about: transfers between his own accounts and credit-card payments are left out so they
// aren't counted twice; refunds count as income; pending transactions are ignored until they post.
const SKIP = (t) => t.pending || t.cat === 'TRANSFER_IN' || t.cat === 'TRANSFER_OUT' || t.det === 'LOAN_PAYMENTS_CREDIT_CARD_PAYMENT';
const month = (d) => String(d).slice(0, 7);
const round = (n) => Math.round(n * 100) / 100;

export function monthlySummary(txs, last = 24) {
  const by = {};
  for (const t of txs) {
    if (SKIP(t)) continue;
    const m = (by[month(t.date)] ||= { month: month(t.date), income: 0, expenses: 0, count: 0, cats: {} });
    m.count++;
    if (t.amount < 0) m.income += -t.amount; else { m.expenses += t.amount; const c = t.cat || 'OTHER'; m.cats[c] = (m.cats[c] || 0) + t.amount; }
  }
  return Object.values(by).sort((a, b) => a.month.localeCompare(b.month)).slice(-last).map((m) => ({
    month: m.month, income: round(m.income), expenses: round(m.expenses), net: round(m.income - m.expenses), count: m.count,
    top: Object.entries(m.cats).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([cat, total]) => ({ cat, total: round(total) })),
  }));
}

// Merchants he pays in at least 3 different months for a similar amount: subscriptions, bills, standing costs.
export function recurring(txs) {
  const by = {};
  for (const t of txs) { if (SKIP(t) || t.amount <= 0) continue; const k = (t.merchant || t.name || '').toLowerCase().slice(0, 40); if (!k) continue; (by[k] ||= { name: t.merchant || t.name, months: new Set(), amounts: [] }); by[k].months.add(month(t.date)); by[k].amounts.push(t.amount); }
  return Object.values(by).filter((x) => x.months.size >= 3).map((x) => {
    const avg = x.amounts.reduce((a, b) => a + b, 0) / x.amounts.length; const spread = Math.max(...x.amounts) - Math.min(...x.amounts);
    return { name: x.name, months: x.months.size, avg: round(avg), steady: spread <= avg * 0.25 };
  }).sort((a, b) => b.avg * b.months - a.avg * a.months).slice(0, 15);
}

export function topMerchants(txs, since) {
  const by = {};
  for (const t of txs) { if (SKIP(t) || t.amount <= 0 || t.date < since) continue; const k = t.merchant || t.name || 'Unknown'; by[k] = (by[k] || 0) + t.amount; }
  return Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([name, total]) => ({ name, total: round(total) }));
}

// What the relay's AI jobs get: balances plus compact actuals, never raw account numbers or full transaction lists.
export function bankSummary(items, txs) {
  if (!items.length) return null;
  const since = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
  return {
    balances: items.flatMap((i) => (i.accounts || []).map((a) => ({ institution: i.institution?.name || '', name: a.name, type: a.subtype || a.type, current: a.current, available: a.available }))),
    monthly: monthlySummary(txs, 12), top_merchants_12mo: topMerchants(txs, since), recurring: recurring(txs),
    note: 'From his linked bank accounts via Plaid. Transfers between own accounts and credit-card payments are excluded; refunds count as income; pending transactions ignored.',
  };
}
