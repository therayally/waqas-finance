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
  if (typeof renderInsights === 'function') renderInsights();
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

/* ---------- assistant chat: a floating widget, present on every tab ----------
 * The reply doesn't come back from this request: it's answered by the local relay (public/pf-relay.mjs), which
 * polls /api/agent/inbox and posts to /api/agent/reply. This widget just shows /api/chat and polls it so the
 * answer (and anything it changed on the dashboard) shows up once the relay's done. */
let chatMessages = [];
let chatOpen = false;
let pendingAttachment = null; // {id, file_name, content_type, size} once uploaded, before the message is sent
function renderChat() {
  const log = $('#chatLog');
  const stayedAtBottom = log.scrollTop + log.clientHeight >= log.scrollHeight - 8;
  log.innerHTML = chatMessages.map((m) => {
    const atts = (m.attachments || []).map((a) => `<small class="att">📎 ${escapeHtml(a.file_name)}</small>`).join('');
    return `<div class="msg ${m.role}${m.role === 'user' && !m.answered ? ' pending' : ''}">${escapeHtml(m.body)}${atts}</div>`;
  }).join('');
  if (stayedAtBottom) log.scrollTop = log.scrollHeight;
}
function escapeHtml(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
async function loadChat() {
  const r = await fetch('/api/chat'); if (!r.ok) return;
  const d = await r.json(); const before = chatMessages.length;
  chatMessages = d.messages || []; renderChat();
  if (!chatOpen && chatMessages.length > before && chatMessages[chatMessages.length - 1]?.role === 'assistant') $('#chatFabDot').hidden = false;
}
// Polling follows presence: fast (and a heartbeat the relay reads) only while the chat is open on a visible tab;
// otherwise one slow check a minute, just for the unread dot. Closed means the relay can go almost quiet too.
let pollTimers = [];
async function beat() { try { await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ heartbeat: true }) }); } catch { /* presence is best-effort */ } }
function syncPolling() {
  pollTimers.forEach(clearInterval); pollTimers = [];
  if (chatOpen && !document.hidden) { beat(); loadChat(); pollTimers = [setInterval(loadChat, 4000), setInterval(beat, 20000)]; }
  else pollTimers = [setInterval(loadChat, 60000)];
}
function setChatOpen(open) {
  chatOpen = open;
  $('#chatFloat').hidden = !open; $('#chatFab').setAttribute('aria-expanded', String(open));
  if (open) { $('#chatFabDot').hidden = true; $('#chatInput').focus(); }
  syncPolling();
}
function renderAttachChip() {
  const chip = $('#chatAttachChip');
  if (!pendingAttachment) { chip.hidden = true; chip.innerHTML = ''; return; }
  chip.hidden = false;
  chip.innerHTML = `<span>📎 ${escapeHtml(pendingAttachment.file_name)} (${Math.round(pendingAttachment.size / 1024)} KB)</span><button type="button" id="chatAttachRemove" title="Remove">&times;</button>`;
  $('#chatAttachRemove').addEventListener('click', () => { pendingAttachment = null; renderAttachChip(); });
}
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(new Error('Could not read the file'));
    r.readAsDataURL(file);
  });
}
function wireChat() {
  $('#chatFab').addEventListener('click', () => setChatOpen(!chatOpen));
  $('#chatClose').addEventListener('click', () => setChatOpen(false));
  $('#chatSetupToggle').addEventListener('click', () => { const el = $('#chatSetup'); el.hidden = !el.hidden; });
  // "Get my setup command": a 10-minute setup code goes into the command; the installer trades it for the key,
  // so the key never appears here (same idea as Chef Nerd's Connect your AI page).
  $('#chatGetCmd').addEventListener('click', async () => {
    const btn = $('#chatGetCmd'); btn.disabled = true;
    try {
      const r = await fetch('/api/relay-key'); if (r.status === 401) { location.href = '/login.html'; return; }
      if (!r.ok) throw new Error(r.status === 503 ? 'The relay key is not set up yet.' : 'Could not get a setup code.');
      const { code } = await r.json(), o = location.origin;
      $('#chatCmdMac').textContent = `bash -c "$(curl -fsSL ${o}/install-relay.sh)" -- ${code}`;
      $('#chatCmdWin').textContent = `& ([scriptblock]::Create((irm "${o}/install-relay.ps1"))) -Code ${code} -Url ${o}`;
      $('#chatCmdBox').hidden = false; btn.textContent = 'Get a new command';
    } catch (e) { msg(String(e.message || e), true); }
    finally { btn.disabled = false; }
  });
  document.querySelectorAll('.chat-copy').forEach((b) => b.addEventListener('click', async () => {
    const el = document.getElementById(b.dataset.target);
    try { await navigator.clipboard.writeText(el.textContent); b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy'; }, 2000); }
    catch { const r = document.createRange(); r.selectNodeContents(el); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }
  }));
  $('#chatAttachBtn').addEventListener('click', () => $('#chatFile').click());
  $('#chatFile').addEventListener('change', async () => {
    const file = $('#chatFile').files[0]; $('#chatFile').value = ''; if (!file) return;
    if (file.size > 3.5 * 1024 * 1024) { msg('That file is over 3.5MB — try a smaller photo or a lower-res scan.', true); return; }
    $('#chatAttachBtn').disabled = true;
    try {
      const data_base64 = await fileToBase64(file);
      const r = await fetch('/api/chat/upload', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file_name: file.name, content_type: file.type, data_base64 }) });
      if (r.status === 401) { location.href = '/login.html'; return; }
      if (!r.ok) throw new Error(await r.text().catch(() => 'Could not upload'));
      pendingAttachment = await r.json(); renderAttachChip();
    } catch (err) { msg(String(err.message || err), true); }
    finally { $('#chatAttachBtn').disabled = false; }
  });
  $('#chatForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('#chatInput'), text = input.value.trim();
    if (!text && !pendingAttachment) return;
    const attachment = pendingAttachment; pendingAttachment = null; renderAttachChip();
    input.value = ''; input.disabled = true;
    try {
      const r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: text, attachments: attachment ? [attachment] : [] }) });
      if (r.status === 401) { location.href = '/login.html'; return; }
      if (!r.ok) throw new Error(await r.text().catch(() => 'Could not send'));
      const d = await r.json(); chatMessages = d.messages || []; renderChat();
      // after sending, a dashboard-affecting reply may land any moment, so refresh the numbers once it does
      pollChatForReply();
    } catch (err) { input.value = text; pendingAttachment = attachment; renderAttachChip(); msg(String(err.message || err), true); }
    finally { input.disabled = false; input.focus(); }
  });
  document.addEventListener('visibilitychange', syncPolling);
  loadChat(); syncPolling();
}
async function pollChatForReply() {
  // after a send, refresh the PF data too once the assistant has answered, since it may have changed something
  const before = chatMessages.length;
  for (let i = 0; i < 20; i++) { // up to ~40s
    await new Promise((r) => setTimeout(r, 2000));
    await loadChat();
    if (chatMessages.length > before) { try { PF = await api(); renderAll(); } catch { /* chat still shows the reply even if this refresh fails */ } return; }
  }
}

/* ---------- insights: instant ratios + AI cards ---------- */
function insightMetrics() {
  if (!PF) return [];
  const t = totals(), inc = t.income || 0, byCat = (c) => PF.expenses.filter((e) => e.cat === c).reduce((a, e) => a + e.v, 0);
  const pay = PF.liabilities.reduce((a, l) => a + (l.payment || 0), 0), pct0 = (n) => (inc ? Math.round(n / inc * 100) + '%' : '—');
  const top = [...PF.income].sort((a, b) => b.v - a.v)[0], sba = PF.liabilities.find((l) => /sba/i.test(l.k)), dist = PF.income.find((i) => /distribution/i.test(i.k));
  const m = [
    { k: 'Kept after expenses', v: pct0(inc - t.expense), sub: money(inc - t.expense) + ' a month' },
    { k: 'Cash runway', v: t.expense ? (t.cash / t.expense).toFixed(1) + ' mo' : '—', sub: money(t.cash) + ' vs ' + money(t.expense) + ' a month out' },
    { k: 'Debt payments', v: pct0(pay), sub: money(pay) + ' a month, of all income' },
    { k: 'Tax set aside', v: pct0(byCat('Taxes')), sub: money(byCat('Taxes')) + ' a month' },
    { k: 'Giving', v: pct0(byCat('Giving')), sub: money(byCat('Giving')) + ' a month' }];
  if (top) m.push({ k: 'Biggest income source', v: pct0(top.v), sub: top.k });
  if (sba && dist && dist.v) m.push({ k: 'SBA loan vs its business', v: Math.round(sba.payment / dist.v * 100) + '%', sub: money(sba.payment) + ' of ' + money(dist.v) + ' a month' });
  return m;
}
function renderInsights() {
  if (!PF) return;
  $('#insMetrics').innerHTML = insightMetrics().map((x) => `<div class="stat-card"><div class="label">${escapeHtml(x.k)}</div><div class="value">${escapeHtml(x.v)}</div><div class="sub">${escapeHtml(x.sub)}</div></div>`).join('');
  const last = lastOf('insights'), st = $('#insStatus'), run = $('#insRun');
  const busy = last && (last.status === 'queued' || last.status === 'running') && Date.now() - last.at < 30 * 60 * 1000;
  run.disabled = !!busy; run.textContent = last && last.status === 'done' ? 'Refresh insights' : 'Get insights';
  if (!last) { st.textContent = 'Not generated yet.'; $('#insCards').innerHTML = ''; return; }
  const when = new Date(last.finished_at || last.at).toLocaleString();
  const stale = last.status === 'done' && last.pf_sig && pfSigNow && last.pf_sig !== pfSigNow;
  st.textContent = busy ? (last.status === 'queued' ? 'Waiting for the assistant on your computer…' : 'Writing insights — about a minute…') : last.status === 'failed' ? (last.report || 'Failed — try again.') : `Generated ${when}.` + (stale ? ' Your numbers have changed since — refresh.' : '');
  let cards = []; if (last.status === 'done') { try { cards = JSON.parse(last.report); } catch { cards = []; } }
  $('#insCards').innerHTML = cards.map((c) => `<div class="ins-card"><div class="ins-top"><span class="tag ${c.priority === 'high' ? 'bad' : c.priority === 'medium' ? 'warn' : 'ok'}">${escapeHtml(c.priority)}</span><span class="tag ok">${escapeHtml(c.area)}</span><b>${escapeHtml(c.title)}</b>${c.impact ? `<span class="imp">${escapeHtml(c.impact)}</span>` : ''}</div><p class="why">${escapeHtml(c.why)}</p>${c.next ? `<p class="next">→ ${escapeHtml(c.next)}</p>` : ''}</div>`).join('');
}
function wireInsights() {
  $('#insRun').addEventListener('click', async () => {
    $('#insRun').disabled = true;
    try {
      const r = await fetch('/api/savings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'insights' }) });
      if (r.status === 401) { location.href = '/login.html'; return; }
      if (!r.ok) throw new Error(await r.text().catch(() => 'Could not start'));
      const d = await r.json(); savJobs = d.jobs || []; pfSigNow = d.pf_sig || pfSigNow;
      if (d.already) msg('The assistant is already working on something — insights will follow.', false);
      renderSavings(); renderInsights();
    } catch (e) { msg(String(e.message || e), true); $('#insRun').disabled = false; }
  });
}

/* ---------- savings review ---------- */
function md(text) {
  // Tiny markdown: headings, bullets, **bold**, `code`, [text](http link). Everything is escaped first, so nothing in the report can inject HTML.
  const inline = (t) => escapeHtml(t).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>').replace(/(^|[\s(])(https?:\/\/[^\s<)]+?)([.,;:]?)(?=$|[\s<)])/g, '$1<a href="$2" target="_blank" rel="noopener noreferrer">$2</a>$3');
  let out = '', list = false;
  for (const raw of String(text).split('\n')) {
    const line = raw.trimEnd(); const li = /^\s*[-*]\s+(.*)$/.exec(line);
    if (li) { if (!list) { out += '<ul>'; list = true; } out += `<li>${inline(li[1])}</li>`; continue; }
    if (list) { out += '</ul>'; list = false; }
    const h = /^(#{1,3})\s+(.*)$/.exec(line);
    if (h) out += `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`; else if (line.trim()) out += `<p>${inline(line)}</p>`;
  }
  return out + (list ? '</ul>' : '');
}
let savJobs = [], pfSigNow = '';
const lastOf = (kind) => [...savJobs].reverse().find((j) => (j.kind || 'savings') === kind);
function renderSavings() {
  const last = lastOf('savings'), st = $('#savStatus'), run = $('#savRun');
  const busy = last && (last.status === 'queued' || last.status === 'running') && Date.now() - last.at < 30 * 60 * 1000;
  run.disabled = !!busy;
  if (!last) { st.textContent = 'No review yet.'; $('#savReport').innerHTML = ''; return; }
  const when = new Date(last.finished_at || last.at).toLocaleString();
  st.textContent = last.status === 'queued' ? 'Waiting for the assistant relay to pick it up…' : last.status === 'running' ? 'Researching now — this takes several minutes. You can leave this page; the report will be here.' : last.status === 'failed' ? `Failed (${when}).` : `Finished ${when}.`;
  $('#savReport').innerHTML = last.report ? md(last.report) : '';
}
async function loadSavings() { try { const r = await fetch('/api/savings'); if (r.ok) { const d = await r.json(); savJobs = d.jobs || []; pfSigNow = d.pf_sig || ''; renderSavings(); renderInsights(); } } catch { /* shown on the next poll */ } }
function wireSavings() {
  $('#savRun').addEventListener('click', async () => {
    $('#savRun').disabled = true;
    try {
      const r = await fetch('/api/savings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'savings', focus: $('#savFocus').value }) });
      if (r.status === 401) { location.href = '/login.html'; return; }
      if (!r.ok) throw new Error(await r.text().catch(() => 'Could not start the review'));
      { const d = await r.json(); savJobs = d.jobs || []; pfSigNow = d.pf_sig || pfSigNow; } renderSavings(); renderInsights();
    } catch (e) { msg(String(e.message || e), true); $('#savRun').disabled = false; }
  });
  loadSavings(); setInterval(() => { const l = savJobs[savJobs.length - 1]; if (!document.hidden && l && (l.status === 'queued' || l.status === 'running') && Date.now() - l.at < 30 * 60 * 1000) loadSavings(); }, 15000);
}

(async function init() {
  wireForms();
  wireChat();
  wireSavings();
  wireInsights();
  try { PF = await api(); renderAll(); try { spy(); } catch (e) {} }
  catch (e) { $('#pfMsg').textContent = 'Could not load your data: ' + (e.message || e); $('#pfMsg').style.color = 'var(--danger)'; }
})();
})();
