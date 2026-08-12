/**
 * orders — a shop's own orders, and nobody else's.
 *
 * The orders console used to read this table straight from the browser with a
 * publishable key. That key ships inside the page, so it is public by
 * definition, and the table's rules allowed anyone holding it to read every
 * order in the system — names, emails, street addresses. It also meant a
 * second shop's orders would appear in the first shop's console, because
 * nothing separated them.
 *
 * So orders come through here now, the same way a locker does: prove which
 * shop you are, get that shop's rows back and no others. The filter is applied
 * on the server against the tenant we just authenticated, never against
 * anything the caller asked for.
 *
 * Netlify environment variables:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * GET  /api/orders?shop=<slug>&k=<access key>          this shop's orders
 * POST /api/orders?shop=<slug>&k=<access key>
 *        { id, patch: { status?, classification?, notes?, tags? } }
 */

/* What the console is allowed to change on an order. Anything else in a patch
   is dropped — this is a status board, not a way to rewrite an order's money
   or its customer. */
const PATCHABLE = ['status', 'classification', 'notes', 'tags'];

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body),
  };
}

function missingEnv(names) {
  return names.filter((n) => !process.env[n]);
}

/* Compare in constant time so a wrong key can't be found one character at a
   time by watching how long the answer takes. */
function keyMatches(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sb(path, opts = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: key, Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json', ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = null; } }
  if (!res.ok) throw new Error((data && (data.message || data.hint)) || `database error ${res.status}`);
  return data;
}

exports.handler = async (event) => {
  const gone = missingEnv(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  if (gone.length) {
    return json(500, { ok: false, error: 'Server not configured: missing ' + gone.join(' and ') + ' in Netlify.' });
  }

  const q = event.queryStringParameters || {};
  const who = String(q.shop || q.who || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  const key = String(q.k || '');
  if (!who) return json(400, { ok: false, error: 'Which shop?' });

  let tenant;
  try {
    const rows = await sb(`tenants?slug=eq.${encodeURIComponent(who)}&select=slug,name,access_key,active`);
    tenant = rows && rows[0];
  } catch (e) {
    return json(502, { ok: false, error: String(e.message || e) });
  }
  if (!tenant || !tenant.active) return json(404, { ok: false, error: 'No such shop' });
  if (!keyMatches(key, tenant.access_key)) return json(401, { ok: false, error: 'Not your shop' });

  /* Built from the authenticated tenant, so it cannot be widened by the
     caller no matter what they send. */
  const mine = `tenant_slug=eq.${encodeURIComponent(tenant.slug)}`;

  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { ok: false, error: 'Invalid request' }); }

    const id = body.id;
    if (!id) return json(400, { ok: false, error: 'Which order?' });

    const patch = {};
    PATCHABLE.forEach((k) => { if (body.patch && body.patch[k] !== undefined) patch[k] = body.patch[k]; });
    if (!Object.keys(patch).length) return json(400, { ok: false, error: 'Nothing to change' });
    patch.updated_at = new Date().toISOString();

    let updated;
    try {
      // The tenant filter rides along on the update itself, so asking to change
      // another shop's order matches nothing rather than changing it.
      updated = await sb(`omniflow_orders?id=eq.${encodeURIComponent(id)}&${mine}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(patch),
      });
    } catch (e) {
      return json(502, { ok: false, error: String(e.message || e) });
    }
    if (!updated || !updated.length) return json(404, { ok: false, error: 'No such order' });
    return json(200, { ok: true, order: updated[0] });
  }

  let rows;
  try {
    rows = await sb(`omniflow_orders?${mine}&select=*&order=intake_at.desc`);
  } catch (e) {
    return json(502, { ok: false, error: String(e.message || e) });
  }

  return json(200, {
    ok: true,
    shop: { slug: tenant.slug, name: tenant.name },
    orders: rows || [],
  });
};
