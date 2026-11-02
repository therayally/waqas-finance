// Waqas' Personal Finance tracker. Served only to a signed-in owner (middleware.js); the data below never reaches
// the sign-in page. Data lives server-side (api/pf.js + lib/store.js) — this file reads and writes it over fetch.
(function () {
const $ = (s) => document.querySelector(s);
const pct = (a, b) => (b ? a / b * 100 : 0), f1 = (v) => v.toFixed(1), money = (v) => '$' + Math.round(v).toLocaleString('en-US');
const ICO = { up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M9 7h8v8"/></svg>', alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>', ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>' };
const rm = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/></svg>';

let PF = null; // set once /api/pf resolves

async function api(action, extra) {
  const r = await fetch('/api/pf', action ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...extra }) } : {});
  if (r.status === 401) { location.href = '/login.html'; throw new Error('signed out'); }
  if (!r.ok) throw new Error(await r.text().catch(() => 'Request failed'));
  return r.json();
}
function msg(text, bad) { const el = $('#pfMsg'); el.textContent = text; el.style.color = bad ? 'var(--danger)' : 'var(--success)'; if (text) setTimeout(() => { if (el.textContent === text) el.textContent = ''; }, 3000); }

/* ---------- derived numbers (recomputed on every render, since PF can change) ---------- */
function totals() {
  return {
    income: PF.income.reduce((a, r) => a + r.v, 0),
    expense: PF.expenses.reduce((a, r) => a + r.v, 0),
    cash: PF.cash.reduce((a, r) => a + r.v, 0),
    liab: PF.liabilities.reduce((a, r) => a + (r.balance || 0), 0),
  };
}

/* ---------- render ---------- */
function badge(st) { return `<div class="icon-badge ${st}">${st === 'good' ? ICO.ok : st === 'warn' ? ICO.up : ICO.alert}</div>`; }
function renderKpis() {
  const t = totals(), net = t.income - t.expense;
  const missing = PF.liabilities.filter((l) => l.balance == null).length;
  const k = [
    { k: 'Monthly income', v: money(t.income), st: 'good', sub: PF.income.length + ' source' + (PF.income.length === 1 ? '' : 's') },
    { k: 'Monthly expenses', v: money(t.expense), st: 'warn', sub: PF.expenses.length + ' recurring item' + (PF.expenses.length === 1 ? '' : 's') },
    { k: 'Net monthly cash flow', v: (net >= 0 ? '+' : '−') + money(Math.abs(net)), st: net >= 0 ? 'good' : 'bad', sub: net >= 0 ? 'surplus' : 'shortfall' },
    { k: 'Cash on hand', v: money(t.cash), st: 'good', sub: PF.cash.map((r) => r.k).join(' + ') || 'none yet' },
    { k: 'Known liabilities', v: money(t.liab), st: 'warn', sub: PF.liabilities.length ? missing + ' of ' + PF.liabilities.length + ' balances not given' : 'none yet' }];
  $('#pfKpis').innerHTML = k.map((x) => `<div class="stat-card">${badge(x.st)}<div class="label">${x.k}</div><div class="value">${x.v}</div><div class="sub">${x.sub}</div></div>`).join('');
}
function hbar(el, rows, total, opt) {
  if (!rows.length) { el.innerHTML = `<p class="note" style="margin:0">Nothing added yet.</p>`; return; }
  const W = 520, rh = 27, lw = 150, H = rows.length * rh + 6, max = opt.max; let g = '';
  rows.forEach((r, i) => { const p = pct(r[1], total), w = (W - lw - 56) * p / max, y = i * rh + 4;
    g += `<text x="${lw - 10}" y="${y + 14}" text-anchor="end" font-size="12.5" fill="var(--ink)">${r[0]}</text><rect x="${lw}" y="${y + 3}" width="${Math.max(w, 2)}" height="15" rx="2" fill="${opt.color}"><title>${r[0]}: ${money(r[1])} (${f1(p)}%)</title></rect><text x="${lw + w + 7}" y="${y + 14}" font-size="12.5" font-weight="600" fill="var(--strong)">${money(r[1])}</text>`; });
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${opt.aria}">${g}</svg>`;
}
function renderIncomeChart() { const t = totals(); hbar($('#pfIncome'), PF.income.map((r) => [r.k, r.v]), t.income, { max: 100, color: 'var(--success)', aria: 'Monthly income by source' }); }
function renderSpendChart() {
  const t = totals(); const byCat = {}; PF.expenses.forEach((r) => { byCat[r.cat] = (byCat[r.cat] || 0) + r.v; });
  const rows = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  hbar($('#pfSpendByCat'), rows, t.expense, { max: 40, color: 'var(--danger)', aria: 'Monthly expenses by category' });
}
function renderTrend() {
  const el = $('#pfTrend'), periods = PF.periods && PF.periods.length ? PF.periods : [{ label: 'Current', ...((t) => ({ income: t.income, expenses: t.expense }))(totals()) }];
  if (periods.length < 2) { el.innerHTML = '<p class="note" style="margin:0">Add another month\'s numbers to see income vs. expenses move over time.</p>'; return; }
  const W = 560, H = 220, l = 46, r = 10, t = 14, b = 190, n = periods.length, band = (W - l - r) / n, bw = band * 0.6;
  const max = Math.max(...periods.flatMap((p) => [p.income, p.expenses])) * 1.15, y = (v) => b - v / max * (b - t);
  let g = '';
  [0, 0.25, 0.5, 0.75, 1].forEach((fr) => { const v = max * fr; g += `<line x1="${l}" x2="${W - r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--border-soft)"/><text x="${l - 6}" y="${y(v) + 4}" text-anchor="end" font-size="10.5" fill="var(--muted)">${money(v)}</text>`; });
  periods.forEach((p, i) => { const x = l + i * band + (band - bw) / 2, hw = bw / 2 - 2;
    g += `<rect x="${x}" y="${y(p.income)}" width="${hw}" height="${b - y(p.income)}" fill="var(--success)" fill-opacity=".85"><title>${p.label} income: ${money(p.income)}</title></rect>`
      + `<rect x="${x + hw + 4}" y="${y(p.expenses)}" width="${hw}" height="${b - y(p.expenses)}" fill="var(--danger)" fill-opacity=".85"><title>${p.label} expenses: ${money(p.expenses)}</title></rect>`
      + `<text x="${x + bw / 2}" y="${b + 18}" text-anchor="middle" font-size="10.5" fill="var(--muted)">${p.label}</text>`; });
  g += `<line x1="${l}" x2="${W - r}" y1="${b}" y2="${b}" stroke="var(--border)"/>`;
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" style="min-width:360px" role="img" aria-label="Monthly income vs expenses">${g}</svg>`;
}
const delBtn = (list, id) => `<button type="button" class="btn pf-del" data-list="${list}" data-id="${id}" title="Remove" style="padding:0.3rem 0.5rem">${rm}</button>`;
function renderIncomeRows() {
  $('#pfIncomeRows').innerHTML = PF.income.length ? PF.income.map((x) => `<tr><td>${x.k}</td><td class="r">${money(x.v)}</td><td>${delBtn('income', x.id)}</td></tr>`).join('') : `<tr><td colspan="3" style="color:var(--muted)">Nothing added yet.</td></tr>`;
}
function renderExpenseRows() {
  const rows = [...PF.expenses].sort((a, b) => b.v - a.v);
  $('#pfExpenseRows').innerHTML = rows.length ? rows.map((x) => `<tr><td><span class="tag ok">${x.cat}</span></td><td class="what"><b>${x.k}</b>${x.note ? `<small>${x.note}</small>` : ''}</td><td class="r">${money(x.v)}</td><td>${delBtn('expenses', x.id)}</td></tr>`).join('') : `<tr><td colspan="4" style="color:var(--muted)">Nothing added yet.</td></tr>`;
}
function renderCashRows() {
  const t = totals();
  $('#pfCashRows').innerHTML = (PF.cash.length ? PF.cash.map((x) => `<tr><td>${x.k}</td><td class="r">${money(x.v)}</td><td>${delBtn('cash', x.id)}</td></tr>`).join('') : `<tr><td colspan="3" style="color:var(--muted)">Nothing added yet.</td></tr>`) + `<tr><td><b>Total liquid cash</b></td><td class="r"><b>${money(t.cash)}</b></td><td></td></tr>`;
}
function renderLiabRows() {
  $('#pfLiabRows').innerHTML = PF.liabilities.length ? PF.liabilities.map((x) => `<tr><td>${x.k}</td><td class="r">${x.balance != null ? money(x.balance) : '—'}</td><td class="r">${money(x.payment)}/mo</td><td>${delBtn('liabilities', x.id)}</td></tr>`).join('') : `<tr><td colspan="4" style="color:var(--muted)">Nothing added yet.</td></tr>`;
}
function renderAll() {
  renderKpis(); renderIncomeChart(); renderSpendChart(); renderTrend(); renderIncomeRows(); renderExpenseRows(); renderCashRows(); renderLiabRows();
}

/* ---------- forms & deletes ---------- */
function formVals(form) { const f = new FormData(form); return Object.fromEntries(f.entries()); }
function wireForms() {
  $('#addIncome').addEventListener('submit', async (e) => { e.preventDefault(); const f = e.target, v = formVals(f);
    try { PF = await api('add', { list: 'income', item: { k: v.k, v: v.v } }); f.reset(); renderAll(); msg('Income added.'); } catch (err) { msg(String(err.message || err), true); } });
  $('#addExpense').addEventListener('submit', async (e) => { e.preventDefault(); const f = e.target, v = formVals(f);
    try { PF = await api('add', { list: 'expenses', item: { k: v.k, v: v.v, cat: v.cat, note: v.note || undefined } }); f.reset(); renderAll(); msg('Expense added.'); } catch (err) { msg(String(err.message || err), true); } });
  $('#addCash').addEventListener('submit', async (e) => { e.preventDefault(); const f = e.target, v = formVals(f);
    try { PF = await api('add', { list: 'cash', item: { k: v.k, v: v.v } }); f.reset(); renderAll(); msg('Account added.'); } catch (err) { msg(String(err.message || err), true); } });
  $('#addLiab').addEventListener('submit', async (e) => { e.preventDefault(); const f = e.target, v = formVals(f);
    try { PF = await api('add', { list: 'liabilities', item: { k: v.k, balance: v.balance === '' ? null : v.balance, payment: v.payment } }); f.reset(); renderAll(); msg('Liability added.'); } catch (err) { msg(String(err.message || err), true); } });
  document.querySelector('.content').addEventListener('click', async (e) => {
    const b = e.target.closest('.pf-del'); if (!b) return; b.disabled = true;
    try { PF = await api('remove', { list: b.dataset.list, id: b.dataset.id }); renderAll(); msg('Removed.'); } catch (err) { msg(String(err.message || err), true); b.disabled = false; }
  });
}
// sidebar: highlight the section in view
function spy() { const links = [...document.querySelectorAll('#nav a')]; const obs = new IntersectionObserver((es) => { es.forEach((e) => { if (e.isIntersecting) links.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === '#' + e.target.id)); }); }, { rootMargin: '-30% 0px -60% 0px' }); document.querySelectorAll('.content section').forEach((s) => obs.observe(s)); }

(async function init() {
  wireForms();
  try { PF = await api(); renderAll(); try { spy(); } catch (e) {} }
  catch (e) { $('#pfMsg').textContent = 'Could not load your data: ' + (e.message || e); $('#pfMsg').style.color = 'var(--danger)'; }
})();
})();
