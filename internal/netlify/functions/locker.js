/**
 * locker — the only door into a tenant's art.
 *
 * The browser no longer talks to the database directly. Every read and write
 * comes through here, and here checks the caller's access key first. A tenant
 * can only ever see and change its own rows — there is no request shape that
 * returns somebody else's work.
 *
 * Netlify environment variables:
 *   SUPABASE_URL                 e.g. https://qmztuagvxopahowexrum.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY    server-side only — never shipped to a browser
 *
 * POST { action, who, key, ... }
 *   whoami                       -> tenant name, branding, tools (and clients, for a partner)
 *   list   { table }             -> that tenant's rows
 *   insert { table, row }        -> creates a row, tenant stamped by the server
 *   update { table, id, patch }  -> only if the row belongs to the tenant
 *   remove { table, id }         -> same
 */

const TABLES = {
  logos:      'locker_logos',
  shirts:     'locker_shirts',
  garments:   'locker_garments',
  gangsheets: 'locker_gang_sheets',
};

// Columns a caller is never allowed to set — the server owns these.
const PROTECTED = ['tenant_slug', 'owner_slug', 'id', 'created_at'];

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body),
  };
}

function env() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { url, key, ok: !!(url && key) };
}

async function sb(path, opts = {}) {
  const { url, key } = env();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const text = await res.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch { data = null; } }
  if (!res.ok) throw new Error((data && (data.message || data.hint)) || `database error ${res.status}`);
  return data;
}

/* Constant-time-ish compare so a wrong key can't be guessed by timing. */
function keyMatches(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/* Which of the required variables are missing, by name. A name is not a
   secret; the value never appears. Saying "one of these two" is what makes a
   missing key take an hour to find. */
function missingEnv(names) {
  return names.filter((n) => !process.env[n]);
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Method not allowed' });
  if (!env().ok) {
    return json(500, { ok: false, error: 'Server not configured: missing ' + missingEnv(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']).join(' and ') + ' in Netlify.' });
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { ok: false, error: 'Invalid request' }); }

  const who = String(body.who || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  const key = String(body.key || '');
  if (!who) return json(400, { ok: false, error: 'Missing locker' });

  // Who is this, and is the key right?
  let tenant;
  try {
    const rows = await sb(`tenants?slug=eq.${encodeURIComponent(who)}&select=*`);
    tenant = rows && rows[0];
  } catch (e) {
    return json(502, { ok: false, error: String(e.message || e) });
  }
  if (!tenant || !tenant.active) return json(404, { ok: false, error: 'No such locker' });
  if (!keyMatches(key, tenant.access_key)) return json(401, { ok: false, error: 'This link isn’t valid for that locker.' });

  const action = String(body.action || '');

  try {
    if (action === 'whoami') {
      const out = {
        slug: tenant.slug, name: tenant.name, kind: tenant.kind,
        branding: tenant.branding || {}, tools: tenant.tools || [],
      };
      // A partner also gets the list of their own clients — nobody else's.
      if (tenant.kind === 'partner' || tenant.kind === 'owner') {
        const kids = await sb(`tenants?parent_slug=eq.${encodeURIComponent(tenant.slug)}&select=slug,name,kind,active&order=name`);
        out.clients = kids || [];
      }
      return json(200, { ok: true, tenant: out });
    }

    const table = TABLES[body.table];
    if (!table) return json(400, { ok: false, error: 'Unknown collection' });

    if (action === 'list') {
      const rows = await sb(`${table}?tenant_slug=eq.${encodeURIComponent(tenant.slug)}&select=*&order=created_at.desc`);
      return json(200, { ok: true, rows: rows || [] });
    }

    if (action === 'insert') {
      const row = { ...(body.row || {}) };
      PROTECTED.forEach(k => delete row[k]);
      row.tenant_slug = tenant.slug;
      row.owner_slug = tenant.slug;          // kept in step for older reads
      const created = await sb(table, {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(row),
      });
      return json(200, { ok: true, row: created && created[0] });
    }

    if (action === 'update') {
      if (!body.id) return json(400, { ok: false, error: 'Missing id' });
      const patch = { ...(body.patch || {}) };
      PROTECTED.forEach(k => delete patch[k]);
      // the tenant filter is what stops one tenant editing another's row
      const updated = await sb(
        `${table}?id=eq.${encodeURIComponent(body.id)}&tenant_slug=eq.${encodeURIComponent(tenant.slug)}`,
        { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify(patch) }
      );
      if (!updated || !updated.length) return json(404, { ok: false, error: 'Not found in this locker' });
      return json(200, { ok: true, row: updated[0] });
    }

    if (action === 'remove') {
      if (!body.id) return json(400, { ok: false, error: 'Missing id' });
      const gone = await sb(
        `${table}?id=eq.${encodeURIComponent(body.id)}&tenant_slug=eq.${encodeURIComponent(tenant.slug)}`,
        { method: 'DELETE', headers: { Prefer: 'return=representation' } }
      );
      if (!gone || !gone.length) return json(404, { ok: false, error: 'Not found in this locker' });
      return json(200, { ok: true, row: gone[0] });
    }

    return json(400, { ok: false, error: 'Unknown action' });
  } catch (e) {
    return json(502, { ok: false, error: String(e.message || e) });
  }
};
