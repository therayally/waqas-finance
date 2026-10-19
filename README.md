# Waqas' Finance Growth Strategy

A private dashboard for &Shawarma's Aug–Oct 2026 P&Ls in the Chef Nerd AI style: September at a glance, money leaks, meat prices, a plate-cost calculator, playbooks, a 90-day plan, company structure and a catering calendar. Sign-in is a keypad, checked on the server.

## Deploy

1. Vercel → Add New → Project → import `therayally/waqas-finance` → Deploy (Framework: Other; no build command; `vercel.json` serves `public/`).
2. Add `OWNER_USER`, `OWNER_PASS` and `SESSION_SECRET` under Settings → Environment Variables, then Redeploy. Sign-in stays closed until all three are set.
3. Add the Firewall rate-limit rule in [SECURITY.md](SECURITY.md).

## Layout

| Path | What it is |
| --- | --- |
| `middleware.js` | Lets nothing but the sign-in screen through without a valid session; slides the idle timer |
| `api/login.js`, `api/logout.js` | Sign-in and sign-out (Edge functions) |
| `lib/security.js` | Sessions, constant-time checks, CSRF guard, lock-out, audit log |
| `public/login.html`, `public/login.js` | The keypad sign-in screen (public, no data) |
| `public/index.html`, `public/app.js` | The dashboard (signed-in only) |
| `public/app.css`, `public/fonts/` | Styles and the self-hosted Geist font |
| `test/security.test.js` | Security tests, run in CI |

## Develop

```sh
npm ci
npm test
npm audit
```

Security controls and how they map to SOC 2, OWASP and NIST: [SECURITY.md](SECURITY.md).
