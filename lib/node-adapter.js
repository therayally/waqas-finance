// Turns a Web-style `core(request) -> Response` into a Node (req, res) handler, so the Fetch-API security helpers in
// lib/security.js are reused unchanged on the Node runtime (see api/pf.js for why the Node runtime is needed).
export function adapt(core) {
  return async function handler(req, res) {
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) { if (v != null) headers.set(k, Array.isArray(v) ? v.join(', ') : String(v)); }
    const url = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers.host}${req.url}`;
    const init = { method: req.method, headers };
    if (req.method === 'POST') init.body = JSON.stringify(req.body ?? {});
    const response = await core(new Request(url, init));
    res.statusCode = response.status;
    response.headers.forEach((v, k) => { if (k.toLowerCase() !== 'content-length') res.setHeader(k, v); });
    res.end(await response.text());
  };
}
