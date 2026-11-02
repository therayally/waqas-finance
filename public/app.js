// Waqas' Personal Finance tracker. Served only to a signed-in owner (middleware.js); the data below never reaches the sign-in page.
(function () {
const $ = (s) => document.querySelector(s);
const pct = (a, b) => a / b * 100, f1 = (v) => v.toFixed(1), money = (v) => '$' + Math.round(v).toLocaleString('en-US');
const ICO = { up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M9 7h8v8"/></svg>', alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>', ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>' };

/* ---------- personal finance data ---------- */
// Waqas' own money. These are monthly averages given directly, not yet pulled from statements.
// To extend this as more comes in:
//  - New recurring item: add a row to PF.expenses (or PF.income / PF.cash / PF.liabilities).
//  - A month closes with real numbers: replace the averages below with that month's actuals, and push
//    { label, income, expenses } onto PF.periods so the trend chart on Overview grows a bar per month.
//  - A new account or card: add it to PF.cash or PF.liabilities the same way.
const PF = {
  cash: [
    { k: 'Cash on hand', v: 10000 },
    { k: 'BOA checking', v: 4000 },
    { k: 'Trust account', v: 44000 }],
  income: [
    { k: 'Distribution Business', v: 15000 },
    { k: 'Unified Restaurants', v: 20000 }],
  expenses: [
    { k: 'Mortgage', cat: 'Housing', v: 4407 },
    { k: 'HELOC payment', cat: 'Housing', v: 1164 },
    { k: 'Personal & family spending', cat: 'Personal', v: 7000, note: 'Includes the Apple Card; paid off in full every month' },
    { k: 'Taxes', cat: 'Taxes', v: 3400 },
    { k: 'Donations', cat: 'Giving', v: 4000 },
    { k: 'SBA loan — Distribution Business', cat: 'Business', v: 2000 },
    { k: 'BOA loan payment', cat: 'Debt', v: 500 },
    { k: 'Phone', cat: 'Utilities', v: 500 },
    { k: 'Electric', cat: 'Utilities', v: 400 },
    { k: 'Water', cat: 'Utilities', v: 125 },
    { k: 'Comcast', cat: 'Utilities', v: 100 }],
  liabilities: [
    { k: 'BOA loan', balance: 17000, payment: 500 },
    { k: 'Mortgage', balance: null, payment: 4407 },
    { k: 'HELOC', balance: null, payment: 1164 },
    { k: 'SBA loan — Distribution Business', balance: null, payment: 2000 }]
};
const pfIncomeTotal = PF.income.reduce((a, r) => a + r.v, 0);
const pfExpenseTotal = PF.expenses.reduce((a, r) => a + r.v, 0);
const pfCashTotal = PF.cash.reduce((a, r) => a + r.v, 0);
const pfLiabKnown = PF.liabilities.reduce((a, r) => a + (r.balance || 0), 0);
PF.periods = [{ label: 'Current (monthly avg)', income: pfIncomeTotal, expenses: pfExpenseTotal }];

/* ---------- render ---------- */
function badge(st) { return `<div class="icon-badge ${st}">${st === 'good' ? ICO.ok : st === 'warn' ? ICO.up : ICO.alert}</div>`; }
function renderPFKpis() {
  const net = pfIncomeTotal - pfExpenseTotal;
  const missing = PF.liabilities.filter((l) => l.balance == null).length;
  const k = [
    { k: 'Monthly income', v: money(pfIncomeTotal), st: 'good', sub: PF.income.length + ' sources' },
    { k: 'Monthly expenses', v: money(pfExpenseTotal), st: 'warn', sub: PF.expenses.length + ' recurring items' },
    { k: 'Net monthly cash flow', v: (net >= 0 ? '+' : '−') + money(Math.abs(net)), st: net >= 0 ? 'good' : 'bad', sub: net >= 0 ? 'surplus' : 'shortfall' },
    { k: 'Cash on hand', v: money(pfCashTotal), st: 'good', sub: 'Cash + BOA + Trust' },
    { k: 'Known liabilities', v: money(pfLiabKnown), st: 'warn', sub: missing + ' of ' + PF.liabilities.length + ' balances not given' }];
  $('#pfKpis').innerHTML = k.map((x) => `<div class="stat-card">${badge(x.st)}<div class="label">${x.k}</div><div class="value">${x.v}</div><div class="sub">${x.sub}</div></div>`).join('');
}
function hbar(el, rows, total, opt) {
  const W = 520, rh = 27, lw = 150, H = rows.length * rh + 6, max = opt.max; let g = '';
  rows.forEach((r, i) => { const p = pct(r[1], total), w = (W - lw - 56) * p / max, y = i * rh + 4;
    g += `<text x="${lw - 10}" y="${y + 14}" text-anchor="end" font-size="12.5" fill="var(--ink)">${r[0]}</text><rect x="${lw}" y="${y + 3}" width="${Math.max(w, 2)}" height="15" rx="2" fill="${opt.color}"><title>${r[0]}: ${money(r[1])} (${f1(p)}%)</title></rect><text x="${lw + w + 7}" y="${y + 14}" font-size="12.5" font-weight="600" fill="var(--strong)">${money(r[1])}</text>`; });
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${opt.aria}">${g}</svg>`;
}
function renderPFIncome() { hbar($('#pfIncome'), PF.income.map((r) => [r.k, r.v]), pfIncomeTotal, { max: 100, color: 'var(--success)', aria: 'Monthly income by source' }); }
function renderPFSpendByCat() {
  const byCat = {}; PF.expenses.forEach((r) => { byCat[r.cat] = (byCat[r.cat] || 0) + r.v; });
  const rows = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  hbar($('#pfSpendByCat'), rows, pfExpenseTotal, { max: 40, color: 'var(--danger)', aria: 'Monthly expenses by category' });
}
function renderPFTrend() {
  const el = $('#pfTrend');
  if (PF.periods.length < 2) { el.innerHTML = '<p class="note" style="margin:0">Add another month to PF.periods in app.js to see income vs. expenses move over time.</p>'; return; }
  const W = 560, H = 220, l = 46, r = 10, t = 14, b = 190, n = PF.periods.length, band = (W - l - r) / n, bw = band * 0.6;
  const max = Math.max(...PF.periods.flatMap((p) => [p.income, p.expenses])) * 1.15, y = (v) => b - v / max * (b - t);
  let g = '';
  [0, 0.25, 0.5, 0.75, 1].forEach((fr) => { const v = max * fr; g += `<line x1="${l}" x2="${W - r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--border-soft)"/><text x="${l - 6}" y="${y(v) + 4}" text-anchor="end" font-size="10.5" fill="var(--muted)">${money(v)}</text>`; });
  PF.periods.forEach((p, i) => { const x = l + i * band + (band - bw) / 2, hw = bw / 2 - 2;
    g += `<rect x="${x}" y="${y(p.income)}" width="${hw}" height="${b - y(p.income)}" fill="var(--success)" fill-opacity=".85"><title>${p.label} income: ${money(p.income)}</title></rect>`
      + `<rect x="${x + hw + 4}" y="${y(p.expenses)}" width="${hw}" height="${b - y(p.expenses)}" fill="var(--danger)" fill-opacity=".85"><title>${p.label} expenses: ${money(p.expenses)}</title></rect>`
      + `<text x="${x + bw / 2}" y="${b + 18}" text-anchor="middle" font-size="10.5" fill="var(--muted)">${p.label}</text>`; });
  g += `<line x1="${l}" x2="${W - r}" y1="${b}" y2="${b}" stroke="var(--border)"/>`;
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="min-width:360px" role="img" aria-label="Monthly income vs expenses">${g}</svg>`;
}
function renderPFExpenses() {
  const rows = [...PF.expenses].sort((a, b) => b.v - a.v);
  $('#pfExpenseRows').innerHTML = rows.map((x) => `<tr><td><span class="tag ok">${x.cat}</span></td><td class="what"><b>${x.k}</b>${x.note ? `<small>${x.note}</small>` : ''}</td><td class="r">${money(x.v)}</td></tr>`).join('');
}
function renderPFCash() {
  $('#pfCashRows').innerHTML = PF.cash.map((x) => `<tr><td>${x.k}</td><td class="r">${money(x.v)}</td></tr>`).join('') + `<tr><td><b>Total liquid cash</b></td><td class="r"><b>${money(pfCashTotal)}</b></td></tr>`;
}
function renderPFLiab() {
  $('#pfLiabRows').innerHTML = PF.liabilities.map((x) => `<tr><td>${x.k}</td><td class="r">${x.balance != null ? money(x.balance) : '—'}</td><td class="r">${money(x.payment)}/mo</td></tr>`).join('');
}
// sidebar: highlight the section in view
function spy() { const links = [...document.querySelectorAll('#nav a')]; const obs = new IntersectionObserver((es) => { es.forEach((e) => { if (e.isIntersecting) links.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id)); }); }, { rootMargin: '-30% 0px -60% 0px' }); document.querySelectorAll('.content section').forEach((s) => obs.observe(s)); }
let done = false;
function renderAll() {
  if (done) return; done = true;
  renderPFKpis(); renderPFIncome(); renderPFSpendByCat(); renderPFTrend(); renderPFExpenses(); renderPFCash(); renderPFLiab();
  try { spy(); } catch (e) {}
}
renderAll();
})();
