// A thin Plaid API client (server only). PLAID_CLIENT_ID and PLAID_SECRET come from the Plaid dashboard;
// PLAID_ENV is "sandbox" (fake banks, free, for testing) or "production" (his real bank, needs Plaid's approval).
const HOSTS = { sandbox: 'https://sandbox.plaid.com', production: 'https://production.plaid.com' };

export function plaidConfig() {
  const id = process.env.PLAID_CLIENT_ID || ''; const secret = process.env.PLAID_SECRET || '';
  const env = String(process.env.PLAID_ENV || 'sandbox').toLowerCase();
  return { ok: !!(id && secret && HOSTS[env]), id, secret, env };
}

export async function plaid(path, body) {
  const c = plaidConfig();
  if (!c.ok) throw Object.assign(new Error('Plaid is not set up yet'), { code: 'NOT_CONFIGURED' });
  const res = await fetch(HOSTS[c.env] + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: c.id, secret: c.secret, ...body }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error_message || 'Plaid returned an error'), { code: data.error_code || 'PLAID_ERROR', type: data.error_type || '' });
  return data;
}
