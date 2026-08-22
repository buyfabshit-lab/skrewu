/**
 * live — what a shop can put on screen while they're streaming.
 *
 * Feeds the overlay page: how the day is going, and the last few orders as
 * they land. Built for a browser source in OBS / TikTok LIVE Studio.
 *
 * Two things this deliberately does NOT do:
 *
 *  1. It needs the shop's access key, same as the locker. An overlay URL lives
 *     in streaming software, but URLs leak — pasted in a chat, caught on
 *     somebody's screen recording. Orders are not public, so this is guarded.
 *
 *  2. It returns the least it can. A first name and a city, never a surname,
 *     an email, a street or a phone number. This copy of an order is going on
 *     a public livestream; a buyer did not agree to that. If a field isn't on
 *     this list it does not leave the database.
 *
 * Netlify environment variables:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * GET  /api/live?shop=<slug>&k=<access key>&limit=8   what's on, plus the stage
 * POST /api/live?shop=<slug>&k=<access key>  { stage:{…} }   change what's on
 *
 * The stage is the swappable part — logo, headline, a picture or a clip. It
 * isn't secret (it goes on a public stream) but only the shop may change it,
 * so a write needs the same key a read does.
 */

const MAX_LIMIT = 20;

/* What a stage may contain. Anything else sent is dropped rather than stored —
   this ends up rendered on a stream, so the shape stays known. */
const STAGE_TEXT = ['logo', 'headline', 'sub'];
const PANELS = ['tally', 'feed', 'drop', 'media'];

function cleanStage(raw) {
  const inp = (raw && typeof raw === 'object') ? raw : {};
  const out = {};
  STAGE_TEXT.forEach(k => {
    const v = inp[k];
    if (typeof v === 'string' && v.trim()) out[k] = v.trim().slice(0, 200);
  });
  // Only http(s) — a javascript: or data: URL has no business on a page we render.
  ['logo'].forEach(k => {
    if (out[k] && !/^https?:\/\//i.test(out[k])) delete out[k];
  });
  if (inp.media && typeof inp.media === 'object') {
    const kind = inp.media.kind === 'video' ? 'video' : 'image';
    const url = String(inp.media.url || '');
    if (/^https?:\/\//i.test(url)) out.media = { kind, url: url.slice(0, 500) };
  }
  if (Array.isArray(inp.show)) {
    out.show = inp.show.filter(x => PANELS.includes(x));
  }
  return out;
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(body),
  };
}

function keyMatches(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sbWrite(path, opts) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: key, Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json', ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || `database error ${res.status}`);
  }
  return true;
}

async function sb(path) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: 'Bearer ' + key },
  });
  const data = await res.json();
  if (!res.ok) throw new Error((data && data.message) || 'database error');
  return data;
}

/* Everything below is chosen to be safe on a screen strangers are watching. */
function forTheStream(row) {
  const first = String(row.customer_name || '').trim().split(/\s+/)[0] || 'Someone';
  const place = String(row.customer_location || '').split(',').slice(0, 2).join(',').trim();
  const items = ((row.raw_platform_data || {}).line_items) || [];
  const title = items.length ? String(items[0].title || items[0].name || 'an order') : 'an order';
  return {
    who: first,
    where: place || null,
    what: title.slice(0, 60),
    more: Math.max(0, items.length - 1),
    units: Number(row.units) || 0,
    at: row.intake_at,
  };
}

exports.handler = async (event) => {
  const url = process.env.SUPABASE_URL;
  const svc = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !svc) return json(500, { ok: false, error: 'Server not configured.' });

  const q = event.queryStringParameters || {};
  const who = String(q.shop || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  const key = String(q.k || '');
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(q.limit) || 8));
  if (!who) return json(400, { ok: false, error: 'Which shop?' });

  let tenant;
  try {
    const rows = await sb(`tenants?slug=eq.${encodeURIComponent(who)}&select=slug,name,access_key,active,shop,stage`);
    tenant = rows && rows[0];
  } catch (e) {
    return json(502, { ok: false, error: String(e.message || e) });
  }
  if (!tenant || !tenant.active) return json(404, { ok: false, error: 'No such shop' });
  if (!keyMatches(key, tenant.access_key)) return json(401, { ok: false, error: 'Not your shop' });

  // Changing what's on screen.
  if (event.httpMethod === 'POST') {
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return json(400, { ok: false, error: 'Invalid request' }); }
    const stage = cleanStage(body.stage);
    try {
      await sbWrite(`tenants?slug=eq.${encodeURIComponent(tenant.slug)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ stage }),
      });
    } catch (e) {
      return json(502, { ok: false, error: String(e.message || e) });
    }
    return json(200, { ok: true, stage });
  }

  // Midnight where the shop is would be better; until a tenant carries a
  // timezone, "the last 24 hours" is honest and never wrong by a whole day.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  let rows;
  try {
    rows = await sb(
      // Scoped to the shop we just authenticated. Without this the overlay
      // would slide another shop's buyers across a live stream.
      `omniflow_orders?tenant_slug=eq.${encodeURIComponent(tenant.slug)}` +
      `&intake_at=gte.${encodeURIComponent(since)}` +
      `&select=customer_name,customer_location,units,total_value,intake_at,raw_platform_data` +
      `&order=intake_at.desc&limit=${limit}`
    );
  } catch (e) {
    return json(502, { ok: false, error: String(e.message || e) });
  }

  const list = (rows || []).map(forTheStream);
  return json(200, {
    ok: true,
    shop: { slug: tenant.slug, name: tenant.name, domain: (tenant.shop || {}).domain || null },
    stage: tenant.stage || {},
    today: {
      orders: list.length,
      units: list.reduce((n, o) => n + o.units, 0),
    },
    orders: list,
  });
};
