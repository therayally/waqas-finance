// The Connect a bank page: opens Plaid's bank sign-in (Plaid Link) and hands the result to /api/plaid.
// This is the only page that loads a script from another site (Plaid's own, which Plaid requires), which is why it is
// separate from the dashboard: the dashboard keeps a strict script-src 'self'. See vercel.json.
(function () {
const $ = (s) => document.querySelector(s);
const esc = (s) => { const d = document.createElement('div'); d.textContent = String(s ?? ''); return d.innerHTML; };
const money = (v) => (v == null ? '—' : '$' + Math.round(v).toLocaleString('en-US'));
const TOKEN_KEY = 'pf-plaid-link-token';

async function api(body) {
  const r = await fetch('/api/plaid', body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  if (r.status === 401) { const e = new Error('signed out'); e.signedOut = true; throw e; }
  if (!r.ok) throw new Error(await r.text().catch(() => 'Request failed'));
  return r.json();
}
function status(t, bad) { const el = $('#cbStatus'); el.textContent = t; el.style.color = bad ? 'var(--danger)' : ''; }

function renderBanks(items) {
  $('#cbBanks').innerHTML = items.map((i) => `<div class="panel" style="margin-bottom:0.6rem"><h3>${esc(i.institution?.name || 'Bank')}</h3>
    ${i.error ? `<p class="note" style="color:var(--danger)">${esc(i.error === 'PRODUCT_NOT_READY' ? 'The bank is still loading history. Press Sync now in a minute.' : i.error === 'ITEM_LOGIN_REQUIRED' ? 'The bank needs you to sign in again. Disconnect it and connect it again.' : 'Last sync problem: ' + i.error)}</p>` : ''}
    ${(i.accounts || []).map((a) => `<div style="display:flex;justify-content:space-between;font-size:0.875rem;padding:0.25rem 0"><span>${esc(a.name)}${a.mask ? ' ····' + esc(a.mask) : ''}</span><b>${money(a.current)}</b></div>`).join('') || '<p class="note">No accounts yet.</p>'}
    <button class="btn cb-disc" data-id="${esc(i.item_id)}" type="button" style="margin-top:0.5rem;padding:0.3rem 0.7rem">Disconnect</button></div>`).join('');
  $('#cbSync').hidden = !items.length;
}

function loadLink() {
  return new Promise((resolve, reject) => {
    if (window.Plaid) return resolve();
    const s = document.createElement('script'); s.src = 'https://cdn.plaid.com/link/v2/stable/link-initialize.js'; s.onload = resolve; s.onerror = () => reject(new Error('Could not load Plaid'));
    document.head.appendChild(s);
  });
}
async function open(token, receivedRedirectUri) {
  await loadLink();
  const handler = window.Plaid.create({
    token, ...(receivedRedirectUri ? { receivedRedirectUri } : {}),
    onSuccess: async (public_token, metadata) => {
      status('Connected. Pulling balances and transactions — this can take a moment…');
      try { const d = await api({ action: 'exchange', public_token, institution: metadata.institution }); localStorage.removeItem(TOKEN_KEY); renderBanks(d.items); status(`Connected. ${d.tx_count} transactions loaded so far.`); }
      catch (e) { status(String(e.message || e), true); }
    },
    onExit: (err) => { if (err) status('Plaid closed: ' + (err.display_message || err.error_message || err.error_code), true); },
  });
  handler.open();
}

async function init() {
  let d;
  try { d = await api(); } catch (e) { if (e.signedOut) { status('Sign in first, then come back to this page.'); $('#cbSignin').hidden = false; } else status(String(e.message || e), true); return; }
  renderBanks(d.items);
  if (!d.configured) { status(''); $('#cbSetup').hidden = false; return; }
  status(d.env === 'sandbox' ? 'Test mode: Plaid\'s fake banks only (use the username user_good and password pass_good). Real banks need Plaid\'s production access.' : `${d.items.length} bank${d.items.length === 1 ? '' : 's'} connected.`);
  $('#cbConnect').hidden = false;
  // Coming back from a bank's own sign-in page (a redirect): re-open Link with the stored token to finish.
  if (new URLSearchParams(location.search).has('oauth_state_id')) { const t = localStorage.getItem(TOKEN_KEY); if (t) open(t, location.href).catch((e) => status(String(e.message || e), true)); }
}

$('#cbConnect').addEventListener('click', async () => {
  $('#cbConnect').disabled = true;
  try { const { link_token } = await api({ action: 'link_token' }); localStorage.setItem(TOKEN_KEY, link_token); await open(link_token); }
  catch (e) { status(String(e.message || e), true); }
  finally { $('#cbConnect').disabled = false; }
});
$('#cbSync').addEventListener('click', async () => {
  $('#cbSync').disabled = true; status('Syncing…');
  try { const d = await api({ action: 'sync' }); renderBanks(d.items); status(`Synced. ${d.tx_count} transactions.`); } catch (e) { status(String(e.message || e), true); }
  finally { $('#cbSync').disabled = false; }
});
$('#cbBanks').addEventListener('click', async (e) => {
  const b = e.target.closest('.cb-disc'); if (!b || !confirm('Disconnect this bank and delete its stored data here?')) return;
  b.disabled = true;
  try { const d = await api({ action: 'disconnect', item_id: b.dataset.id }); renderBanks(d.items); status('Disconnected.'); } catch (err) { status(String(err.message || err), true); b.disabled = false; }
});
init();
})();
