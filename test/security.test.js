// Security tests: these are the controls listed in SECURITY.md, checked on every change (CI) and before every deploy.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as sec from '../lib/security.js';
import login from '../api/login.js';
import logout from '../api/logout.js';

const SECRET = 'test-secret-that-is-long-enough-0123456789';
const ENV = { OWNER_USER: 'Waqas', OWNER_PASS: '2015', SESSION_SECRET: SECRET };
const post = (fields, headers = { origin: 'https://site.test' }, url = 'https://site.test/api/login') => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.set(k, v); return new Request(url, { method: 'POST', body: f, headers }); };
const quiet = () => { const logs = []; const orig = console.log; console.log = (l) => logs.push(String(l)); return { logs, done: () => { console.log = orig; } }; };
beforeEach(() => sec._resetLimiter());

test('sessions: genuine tokens pass; tampered, expired, idle, future-dated and wrong-secret tokens fail', async () => {
  const now = 2_000_000_000; const t = await sec.makeToken(SECRET, now);
  assert.equal((await sec.checkToken(SECRET, t, now + 60)).ok, true);
  const [v, i, s, sig] = t.split('.');
  assert.equal((await sec.checkToken(SECRET, `${v}.${i - 100}.${s}.${sig}`, now)).ok, false, 'changed issue time');
  assert.equal((await sec.checkToken(SECRET, `${v}.${i}.${s}.${sig.replace(/.$/, sig.endsWith('0') ? '1' : '0')}`, now)).ok, false, 'changed signature');
  assert.equal((await sec.checkToken('another-secret-that-is-also-long-enough-xx', t, now)).ok, false, 'other secret');
  assert.equal((await sec.checkToken(SECRET, t, now + sec.IDLE + 1)).ok, false, 'idle timeout');
  const slid = await sec.makeToken(SECRET, now + sec.MAX_AGE - 10, now);
  assert.equal((await sec.checkToken(SECRET, slid, now + sec.MAX_AGE - 5)).ok, true);
  assert.equal((await sec.checkToken(SECRET, slid, now + sec.MAX_AGE + 1)).ok, false, 'absolute lifetime cannot be extended');
  assert.equal((await sec.checkToken(SECRET, await sec.makeToken(SECRET, now + 3600, now + 3600), now)).ok, false, 'future dated');
  for (const bad of ['', 'x', 'v1.1.1', 'v2.1.1.' + '0'.repeat(64), 'v1.a.b.c', 'x'.repeat(500), null]) assert.equal((await sec.checkToken(SECRET, bad, now)).ok, false, String(bad));
  assert.equal((await sec.checkToken('short', t, now)).ok, false, 'a short secret is never trusted');
});

test('settings fail closed: no default user, code or secret anywhere in the code', async () => {
  assert.equal(sec.config({}).ok, false); assert.equal(sec.config({ ...ENV, SESSION_SECRET: 'short' }).ok, false); assert.equal(sec.config(ENV).ok, true);
  const q = quiet(); const r = await login(post({ username: 'Waqas', password: '2015' }), {}); q.done();
  assert.equal(r.status, 303); assert.match(r.headers.get('location'), /e=3/); assert.equal(r.headers.get('set-cookie'), null);
  for (const f of ['lib/security.js', 'api/login.js', 'middleware.js', 'public/login.js', 'public/app.js']) assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /['"]2015['"]|(OWNER_USER|OWNER_PASS|SESSION_SECRET) \|\| (?!'')/, f);
});

test('sign-in: right name and code get a hardened cookie; wrong ones do not; the code never reaches the log', async () => {
  const q = quiet();
  const ok = await login(post({ username: ' waqas ', password: '2015' }), ENV);
  const c = ok.headers.get('set-cookie');
  assert.equal(ok.status, 303); assert.equal(ok.headers.get('location'), '/');
  assert.match(c, /^__Host-wfs=v1\./); for (const flag of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/']) assert.ok(c.includes(flag), flag); assert.doesNotMatch(c, /Domain=/);
  const bad = await login(post({ username: 'Waqas', password: '2016' }), ENV);
  q.done();
  assert.match(bad.headers.get('location'), /e=1/); assert.equal(bad.headers.get('set-cookie'), null);
  assert.ok(q.logs.some((l) => l.includes('login.succeeded'))); assert.ok(q.logs.some((l) => l.includes('login.failed')));
  assert.ok(q.logs.every((l) => !l.includes('2015') && !l.includes('2016') && !l.includes(SECRET)), 'no code or secret in the log');
});

test('brute force: five wrong codes lock that address out, and the right code is refused while locked', async () => {
  const q = quiet(); const h = { origin: 'https://site.test', 'x-real-ip': '203.0.113.9' };
  for (let i = 0; i < 5; i++) await login(post({ username: 'Waqas', password: String(1000 + i) }, h), ENV);
  const locked = await login(post({ username: 'Waqas', password: '2015' }, h), ENV); q.done();
  assert.match(locked.headers.get('location'), /e=2/); assert.equal(locked.headers.get('set-cookie'), null);
  assert.ok(q.logs.some((l) => l.includes('login.locked_out')));
});

test('cross-site requests are refused (CSRF), and sign-in and sign-out only accept POST', async () => {
  const q = quiet();
  assert.equal((await login(post({ username: 'Waqas', password: '2015' }, { origin: 'https://evil.test' }), ENV)).status, 403);
  assert.equal((await login(new Request('https://site.test/api/login'), ENV)).status, 405);
  assert.equal(logout(new Request('https://site.test/api/logout')).status, 405);
  assert.equal(logout(new Request('https://site.test/api/logout', { method: 'POST', headers: { origin: 'https://evil.test' } })).status, 403);
  const out = logout(new Request('https://site.test/api/logout', { method: 'POST', headers: { origin: 'https://site.test' } })); q.done();
  assert.equal(out.status, 303); assert.match(out.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal(sec.sameOrigin(new Request('https://site.test/x', { method: 'POST' })), false, 'no origin information at all is refused');
  assert.equal(sec.sameOrigin(new Request('https://site.test/x', { method: 'POST', headers: { origin: 'null', 'sec-fetch-site': 'same-origin' } })), true, 'a privacy-hidden origin from this site is allowed');
  assert.equal(sec.sameOrigin(new Request('https://site.test/x', { method: 'POST', headers: { origin: 'null', 'sec-fetch-site': 'cross-site' } })), false);
  assert.equal(sec.sameOrigin(new Request('https://site.test/x', { method: 'POST', headers: { origin: 'null' } })), false);
});

test('headers and files: strict CSP with no inline scripts, HSTS, no framing, no caching; secrets stay out of git', () => {
  const v = JSON.parse(fs.readFileSync('vercel.json', 'utf8')); const h = Object.fromEntries(v.headers[0].headers.map((x) => [x.key, x.value]));
  assert.match(h['Content-Security-Policy'], /script-src 'self';/); assert.match(h['Content-Security-Policy'], /frame-ancestors 'none'/); assert.match(h['Content-Security-Policy'], /default-src 'none'/);
  assert.match(h['Strict-Transport-Security'], /max-age=63072000/); assert.equal(h['X-Frame-Options'], 'DENY'); assert.match(h['Cache-Control'], /no-store/);
  for (const f of ['public/index.html', 'public/login.html']) { const s = fs.readFileSync(f, 'utf8'); assert.doesNotMatch(s, /<script>(?!<\/script>)|<script(?![^>]*\bsrc=)[^>]*>/, `${f} has no inline script`); assert.doesNotMatch(s, /fonts\.googleapis|https?:\/\/(?!www\.w3)/, `${f} loads nothing from other sites`); }
  assert.doesNotMatch(fs.readFileSync('public/login.html', 'utf8'), /Net profit|Washington Lamb|\$147,584/, 'no financial data on the public sign-in page');
  const mw = fs.readFileSync('middleware.js', 'utf8'); assert.doesNotMatch(mw, /app\\\\\.js|index\\\\\.html/, 'the dashboard and its data are never excluded from the session check');
  assert.match(fs.readFileSync('.gitignore', 'utf8'), /\.env/);
  assert.equal(JSON.parse(fs.readFileSync('package.json', 'utf8')).dependencies['@vercel/functions'].match(/^\d/) !== null, true, 'dependencies are pinned to exact versions');
});

test('the gatekeeper: no session means the sign-in page (or 401 for files); a valid session passes and its idle window slides', async () => {
  Object.assign(process.env, ENV); const { default: mw } = await import('../middleware.js'); const q = quiet();
  const home = await mw(new Request('https://site.test/')); assert.equal(home.status, 302); assert.match(home.headers.get('location'), /\/login\.html$/);
  const data = await mw(new Request('https://site.test/app.js')); assert.equal(data.status, 401);
  const forged = await mw(new Request('https://site.test/app.js', { headers: { cookie: `__Host-wfs=v1.1.1.${'0'.repeat(64)}` } })); assert.equal(forged.status, 401);
  const tok = await sec.makeToken(SECRET); const ok = await mw(new Request('https://site.test/app.js', { headers: { cookie: `__Host-wfs=${tok}` } })); q.done();
  assert.equal(ok.headers.get('x-middleware-next'), '1'); assert.match(ok.headers.get('set-cookie'), /^__Host-wfs=v1\./); assert.match(ok.headers.get('cache-control'), /no-store/);
  assert.ok(q.logs.some((l) => l.includes('session.rejected')));
});
