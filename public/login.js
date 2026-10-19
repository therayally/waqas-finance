// Sign-in keypad. The code is checked on the server (api/login.js); nothing secret lives in this file.
(function () {
  const $ = (s) => document.querySelector(s); const MAX = 32;
  const MSG = { 1: 'That name and code don\u2019t match. Clear and try again.', 2: 'Too many tries. Wait 15 minutes, then try again.', 3: 'Sign-in is not set up yet. Add OWNER_USER, OWNER_PASS and SESSION_SECRET in Vercel.', 4: 'You were signed out.' };
  const e = new URLSearchParams(location.search).get('e'); if (e && MSG[e]) $('#err').textContent = MSG[e];
  function paint() {
    const v = $('#p').value.replace(/\D/g, '').slice(0, MAX); $('#p').value = v;
    const n = Math.max(4, v.length); $('#dots').innerHTML = '';
    for (let i = 0; i < n; i++) { const d = document.createElement('span'); if (i < v.length) d.className = 'on'; $('#dots').appendChild(d); }
  }
  $('#pad').addEventListener('click', (ev) => { const b = ev.target.closest('button[data-k]'); if (!b) return; const k = b.dataset.k;
    if (k === 'C') { $('#p').value = ''; $('#err').textContent = ''; } else if ($('#p').value.length < MAX) $('#p').value += k; paint(); });
  $('#p').addEventListener('input', paint);
  $('#u').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); $('#p').focus(); } });
  $('#dots').addEventListener('click', () => $('#p').focus());
  $('#loginForm').addEventListener('submit', (ev) => { if (!$('#u').value.trim() || !$('#p').value) { ev.preventDefault(); $('#err').textContent = 'Enter your name and code, then press Open.'; } });
  $('#u').focus(); paint();
})();
