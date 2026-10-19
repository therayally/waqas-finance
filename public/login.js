// Sign-in page. The name and password are checked on the server (api/login.js); nothing secret lives in this file.
(function () {
  const MSG = { 1: 'That name and password don\u2019t match. Try again.', 2: 'Too many tries. Wait 15 minutes, then try again.', 3: 'Sign-in is not set up yet.', 4: 'You were signed out.' };
  const e = new URLSearchParams(location.search).get('e'); if (e && MSG[e]) document.getElementById('err').textContent = MSG[e];
  document.getElementById('u').focus();
})();
