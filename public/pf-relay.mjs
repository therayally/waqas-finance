#!/usr/bin/env node
// Waqas' Personal Finance — local relay.
//
// Runs on your own computer. It never opens a port and has no inbound connection: it only makes outgoing HTTPS
// requests (like a browser), asking the app every few seconds whether there's a new chat message, running Claude
// Code on it when there is, and posting the answer back. The AI is your own Claude Code — whatever account it's
// logged into on this machine — not a separate API key billed by this app.
//
// Setup:
//   curl -fsSLO https://waqas-finance.vercel.app/pf-relay.mjs
//   PF_API_KEY=<the relay key> node pf-relay.mjs
//
// Requires Node 18+ and the `claude` CLI (Claude Code) already installed and signed in on this machine.
// Optional env: PF_URL (default https://waqas-finance.vercel.app), POLL_SECONDS (default 5), CLAUDE_BIN (default
// `claude` on PATH).
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const BASE = (process.env.PF_URL || 'https://waqas-finance.vercel.app').replace(/\/$/, '');
const KEY = process.env.PF_API_KEY;
const POLL_MS = Math.max(2, Number(process.env.POLL_SECONDS) || 5) * 1000;
const CLAUDE_BIN = process.env.CLAUDE_BIN || 'claude';
const TIMEOUT_MS = 3 * 60 * 1000;

if (!KEY) { console.error('Set PF_API_KEY to the relay key (ask the dashboard for it — Admin / Assistant setup).'); process.exit(1); }

const log = (...a) => console.log(`[${new Date().toLocaleTimeString()}]`, ...a);

async function api(method, route, body) {
  const res = await fetch(BASE + route, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${route} -> ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

// The one tool Claude Code is allowed to run: a small wrapper so the real app URL and key never appear in the
// agent's command line or its transcript — it only ever says "GET /api/pf" or "POST /api/pf body.json".
const TOOL_DIR = path.join(os.homedir(), '.pf-relay');
if (!existsSync(TOOL_DIR)) mkdirSync(TOOL_DIR, { recursive: true });
const API_TOOL = path.join(TOOL_DIR, 'pf-api');
writeFileSync(API_TOOL, `#!/usr/bin/env bash
set -euo pipefail
M="\${1:-}"; P="\${2:-}"; F="\${3:-}"
case "$M" in GET|POST) ;; *) echo "Use GET or POST." >&2; exit 2;; esac
case "$P" in /api/pf) ;; *) echo "Only /api/pf is allowed." >&2; exit 2;; esac
args=(-sS -X "$M" -H "Authorization: Bearer $PF_API_KEY" -H "Content-Type: application/json" "$PF_URL$P")
if [ -n "$F" ]; then
  case "$F" in "$HOME"/.pf-relay/*) ;; *) echo "The body file must be in ~/.pf-relay." >&2; exit 2;; esac
  [ -f "$F" ] || { echo "No such file." >&2; exit 2; }
  args+=(--data-binary "@$F")
fi
exec curl "\${args[@]}"
`, { mode: 0o700 });

const API_GUIDE = `GET /api/pf returns {cash, income, expenses, liabilities}, each a list of rows: {id, k, v} for cash/income; {id, k, v, cat, note?} for expenses (cat is one of Housing, Personal, Taxes, Giving, Business, Debt, Utilities, Other); {id, k, balance, payment} for liabilities (balance can be null when not known).
POST /api/pf with a JSON body adds or removes one row:
  add:    {"action":"add","list":"expenses","item":{"k":"Gym membership","v":80,"cat":"Personal"}}
  remove: {"action":"remove","list":"expenses","id":"<the row's id>"}
"list" is one of cash, income, expenses, liabilities. To change a row's amount, remove the old one and add the new one with the same k.`;

function buildPrompt(messageBody, history) {
  return [
    'You are the chat assistant for Waqas\' Personal Finance dashboard (a simple tracker: income, expenses, cash on hand, liabilities). Talk like a helpful, plain-spoken colleague: short sentences, no jargon, no mention of APIs, JSON, tools or files.',
    `You read the dashboard and change it by calling its API through this one command: ${API_TOOL} GET /api/pf   or   ${API_TOOL} POST /api/pf <path-to-a-json-file-in-${TOOL_DIR}>. Write the JSON you want to send into a file in ${TOOL_DIR} first, then give that file's path. Never run any other command.`,
    API_GUIDE,
    `When the message describes money — a receipt, a bill, a bank statement line, "add $80 for the gym", "my mortgage balance is now $410k", "remove the Comcast bill" — read it, call GET /api/pf first if you need to find an existing row's id, then add/remove with POST, and reply in one or two short sentences saying what you did. If it is ambiguous (which row, which list), ask one short question instead of guessing. If it is just a question about the numbers, answer it from GET /api/pf, in plain language with the actual figures.`,
    history ? `Recent conversation (for context):\n${history}` : '',
    `Waqas just said: ${messageBody}`,
  ].filter(Boolean).join('\n\n');
}

function runClaude(prompt) {
  return new Promise((resolve, reject) => {
    const args = ['-p', '--output-format', 'text', '--allowedTools', 'Read', 'Write', `Bash(${API_TOOL}:*)`, '--disallowedTools', 'Edit', 'WebFetch', 'WebSearch', 'Task', 'NotebookEdit'];
    const child = spawn(CLAUDE_BIN, args, { env: { ...process.env, PF_URL: BASE, PF_API_KEY: KEY } });
    let out = ''; let err = ''; let done = false;
    const timer = setTimeout(() => { if (!done) { done = true; try { child.kill('SIGKILL'); } catch { /* gone */ } reject(new Error('timed out')); } }, TIMEOUT_MS);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.stdin.write(prompt); child.stdin.end();
    child.on('error', (e) => { if (!done) { done = true; clearTimeout(timer); reject(e); } });
    child.on('close', (code) => {
      if (done) return; done = true; clearTimeout(timer);
      if (code === 0 && out.trim()) resolve(out.trim());
      else reject(new Error(err.trim().slice(-300) || `claude exited ${code}`));
    });
  });
}

async function tick() {
  const inbox = await api('GET', '/api/agent/inbox');
  if (!inbox.message) return;
  log('Working on:', inbox.message.body.slice(0, 90));
  try {
    const reply = await runClaude(buildPrompt(inbox.message.body, inbox.history));
    await api('POST', '/api/agent/reply', { id: inbox.message.id, body: reply });
    log('Replied.');
  } catch (e) {
    const msg = /ENOENT/i.test(String(e.message)) ? "I can't reach Claude Code on this computer. Make sure it's installed and on the PATH, then send that again." : `Sorry, I couldn't finish that one (${String(e.message).slice(0, 120)}). Try again in a moment.`;
    try { await api('POST', '/api/agent/reply', { id: inbox.message.id, body: msg }); } catch { /* the message just stays unanswered until the next successful tick */ }
    log('Failed:', e.message);
  }
}

log(`Watching ${BASE} for new chat messages, every ${POLL_MS / 1000}s. Ctrl-C to stop.`);
(async function loop() {
  try { await tick(); } catch (e) { log('Poll error:', e.message); }
  setTimeout(loop, POLL_MS);
})();
