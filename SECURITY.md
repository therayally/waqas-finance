# Security

Waqas' Finance Growth Strategy is a private, single-owner dashboard of &Shawarma's financial data (P&L, payroll findings, owner draws). It is small, so the controls are small, but each one maps to a recognised standard: **OWASP Top 10 (2021) and ASVS 4.0 Level 2**, **NIST SP 800-63B** (sign-in) and **SP 800-53 rev 5** (control families), and the **SOC 2 Trust Services Criteria** (Security, Confidentiality, Availability). Every control marked "test" is checked by `npm test` (`test/security.test.js`) in CI on every push.

## Reporting a problem

Email the owner directly. Do not open a public issue. Include what you saw and how to reproduce it. We aim to confirm within 2 business days.

## What is protected and how

| Control | How it works here | Where | Standards |
| --- | --- | --- | --- |
| No data before sign-in | Every page and file except the sign-in screen, its script, the stylesheet, the font and robots.txt goes through `middleware.js`. The dashboard data (`public/app.js`) is served only with a valid session. (test) | `middleware.js` | OWASP A01; ASVS V4.1; NIST AC-3; SOC 2 CC6.1 |
| Server-side sign-in | The name and code are checked on the server in constant time; nothing secret is in the browser code. (test) | `api/login.js` | OWASP A07; ASVS V2.1, V2.4; NIST IA-2, 800-63B 5.1.1 |
| No default credentials, fail closed | There is no built-in name, code or key. If `OWNER_USER`, `OWNER_PASS` or a 32+ character `SESSION_SECRET` is missing, nobody can sign in. (test) | `lib/security.js` | OWASP A05, A07; ASVS V2.1.1; NIST IA-5; CIS 4.7 |
| Brute-force limits | 1 to 1.5 s delay on every failure; 5 failures from one address (or 20 overall) in 15 minutes locks sign-in for 15 minutes; plus the Vercel Firewall rule below. (test) | `lib/security.js`, Vercel Firewall | NIST 800-63B 5.2.2, AC-7; ASVS V2.2.1; SOC 2 CC6.1 |
| Signed, tamper-proof sessions | HMAC-SHA-256 token over version, issue time and last activity. Cookie `__Host-wfs`: HttpOnly, Secure, SameSite=Strict, Path=/, no Domain. (test) | `lib/security.js` | OWASP A02, A07; ASVS V3.2–V3.4; NIST SC-23, SC-13 |
| Session timeouts | 30 minutes idle and 8 hours absolute; the absolute limit cannot be extended. (test) | `lib/security.js`, `middleware.js` | NIST 800-63B 7.2 (AAL1), AC-12; ASVS V3.3 |
| Sign-out | POST only, same-site only; clears the cookie and the browser's cache and storage for the site. (test) | `api/logout.js` | ASVS V3.3.1; NIST AC-12 |
| Cross-site request forgery | Sign-in and sign-out refuse requests that do not come from this site (Origin / Sec-Fetch-Site / Referer), on top of SameSite=Strict. (test) | `lib/security.js` | OWASP A01; ASVS V4.2.2, V13.2.3 |
| Content Security Policy and headers | `default-src 'none'`, scripts only from this site (no inline scripts), no framing, no plug-ins, forms only to this site; HSTS 2 years with preload; nosniff; referrer only within the site; locked permissions; cross-origin isolation; noindex. (test) | `vercel.json` | OWASP A03, A05; ASVS V14.4; NIST SC-8, SI-10 |
| No caching of private pages | `Cache-Control: private, no-store` on every response. (test) | `vercel.json`, `middleware.js` | ASVS V8.2.1; SOC 2 C1.1 |
| No third parties | The font is self-hosted; the pages load nothing from other sites. (test) | `public/` | OWASP A08; SOC 2 C1.1, CC9.2 |
| Encryption in transit | HTTPS only on Vercel, with HSTS. | Vercel, `vercel.json` | NIST SC-8, SC-13; SOC 2 CC6.7 |
| Secrets management | Secrets live only in Vercel environment variables (encrypted at rest), never in git. `.env*` is git-ignored and CI scans every push for committed secrets (gitleaks). | Vercel, `.gitignore`, `ci.yml` | OWASP A02; NIST IA-5(7), SC-12; SOC 2 CC6.1 |
| Audit logging | One JSON line per sign-in success, failure, lock-out, rejected session, cross-site attempt and sign-out, with time, address and browser. Never the code, cookie or secret. (test) | `lib/security.js` (Vercel logs) | OWASP A09; NIST AU-2, AU-3; SOC 2 CC7.2 |
| Vulnerable components (CVE) | One dependency, pinned to an exact version at least two weeks old, with a lockfile. `npm audit` and `npm audit signatures` on every push and every Monday; Dependabot pull requests for npm and GitHub Actions. | `package.json`, `.npmrc`, `.github/` | OWASP A06; NIST SI-2, RA-5, SR-3; SOC 2 CC7.1, CC8.1 |
| Install-time scripts off | `ignore-scripts=true`: no package can run code during install. | `.npmrc`, CI | OWASP A08; NIST SR-11 |
| Least-privilege CI | Workflows get a read-only token and do not keep the checkout credentials. | `.github/workflows/` | NIST AC-6; SOC 2 CC6.3 |
| Change control | Changes reach production only through git and Vercel's build of `main`; CI runs the security tests on every change. | GitHub, Vercel | NIST CM-3; SOC 2 CC8.1 |

## Set-up (required before first use)

In Vercel, **Project → Settings → Environment Variables** (Production), add:

| Name | Value |
| --- | --- |
| `OWNER_USER` | `Waqas` |
| `OWNER_PASS` | The sign-in code. **NIST recommends 8 or more digits** for a code that is the only factor; a 4-digit code is only as safe as the lock-out and firewall rule make it. |
| `SESSION_SECRET` | At least 32 random characters, e.g. the output of `openssl rand -base64 48`. |

Then **Redeploy**. Without all three, sign-in stays closed (the page says so).

**Vercel Firewall rate limit (strongly recommended):** Project → Firewall → Configure → New Rule: *If* Request Path *equals* `/api/login` → *Rate limit*, fixed window, 60 seconds, 5 requests, key IP address, action Deny. This is the main brute-force guard; the in-app limit is a second line because each server instance keeps its own count.

**Vercel Deployment Protection (optional, adds a second gate):** Project → Settings → Deployment Protection → Vercel Authentication for Production, so only your Vercel account can open the site at all.

## Operating it

- **Rotate the secret** every 90 days, or at once if it may have leaked: change `SESSION_SECRET` and redeploy. Every session ends immediately.
- **Change the code**: change `OWNER_PASS` and redeploy.
- **Review the logs** monthly: Vercel → Logs, filter `audit`. Look for `login.failed` bursts, `login.locked_out` or `rejected_cross_site`.
- **Access review** quarterly: who can sign in to Vercel and GitHub for this project; remove anyone who no longer needs it; keep two-factor sign-in on for both.
- **Dependencies**: merge Dependabot security pull requests within 7 days (critical/high) or 30 days (moderate), after CI passes.
- **If something goes wrong**: rotate `SESSION_SECRET`, change `OWNER_PASS`, check the audit lines for the time window, write down what happened and what was changed.

## Known limits

- Single owner, single factor. For a second factor, turn on Vercel Deployment Protection above.
- The in-app lock-out is per server instance; the Vercel Firewall rule is what makes it global.
- The dashboard holds a fixed snapshot of the Aug–Oct 2026 P&Ls inside `public/app.js`; it is not connected to live systems, so there is nothing to change or delete from the page.
