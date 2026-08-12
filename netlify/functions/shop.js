/**
 * shop — which storefront a customer-facing tool sells into.
 *
 * This platform is not a shop. Every shop on it is a tenant, and DEATH CORPS is
 * one of them, not the house. A tool like the sticker builder asks here which
 * storefront it's working for instead of having one baked into it.
 *
 * Deliberately separate from the locker function. The locker guards a tenant's
 * artwork and demands their access key for every call. What's here is the
 * opposite kind of thing — a shop domain and the variant ids of products
 * already listed publicly on that storefront — so it needs no key. Keeping the
 * two apart means the locker's rule stays absolute: no key, no data.
 *
 * Nothing secret is ever read from the tenant row. The select names its
 * columns, so a key or anything added later cannot leak through here.
 *
 * Netlify environment variables:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * GET/POST  ?shop=<slug>   ->  { ok, shop: { slug, name, accent, domain, sheets } }
 */

const PUBLIC_COLUMNS = 'slug,name,branding,shop,active';

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      // Public, non-secret config — let a browser and the CDN hold onto it.
      'Cache-Control': 'public, max-age=300',
    },
    body: JSON.stringify(body),
  };
}

exports.handler = async (event) => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return json(500, { ok: false, error: 'Server not configured: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Netlify.' });
  }

  let who = (event.queryStringParameters && event.queryStringParameters.shop) || '';
  if (!who && event.body) {
    try { who = JSON.parse(event.body).shop || ''; } catch { /* querystring is fine */ }
  }
  who = String(who).toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!who) return json(400, { ok: false, error: 'Which shop?' });

  let tenant;
  try {
    const res = await fetch(
      `${url}/rest/v1/tenants?slug=eq.${encodeURIComponent(who)}&select=${PUBLIC_COLUMNS}`,
      { headers: { apikey: key, Authorization: 'Bearer ' + key } }
    );
    const rows = await res.json();
    if (!res.ok) throw new Error((rows && rows.message) || 'database error');
    tenant = rows && rows[0];
  } catch (e) {
    return json(502, { ok: false, error: String(e.message || e) });
  }

  if (!tenant || !tenant.active) return json(404, { ok: false, error: 'No such shop' });

  const shop = tenant.shop || {};
  return json(200, {
    ok: true,
    shop: {
      slug: tenant.slug,
      name: tenant.name,
      accent: (tenant.branding || {}).accent || null,
      domain: shop.domain || null,
      sheets: shop.sheets || {},
    },
  });
};
