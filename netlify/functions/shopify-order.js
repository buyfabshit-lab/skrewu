/**
 * shopify-order — a Shopify order becomes an OmniFlow order the moment it's paid.
 *
 * Shopify calls this on `orders/create`. We check the call really came from
 * Shopify, translate the order into the shape OmniFlow already speaks, and put
 * it on the list. Anything a customer designed themselves — a sticker sheet, a
 * gang sheet — arrives with its print file already attached, so whoever pulls
 * the order never has to go looking for artwork.
 *
 * Netlify environment variables:
 *   SUPABASE_URL                 e.g. https://qmztuagvxopahowexrum.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY    server-side only
 *   SHOPIFY_WEBHOOK_SECRET       the signing secret Shopify shows when you
 *                                create the webhook. Without it we refuse
 *                                everything — an unsigned endpoint would let
 *                                anyone write orders into your shop's list.
 *
 * Re-delivery is safe: every order maps to one `uct`, which is unique, so
 * Shopify can retry as often as it likes without doubling anything up.
 */

const crypto = require('crypto');

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

/* The signature is over the exact bytes Shopify sent — decode before hashing. */
function rawBody(event) {
  return event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64')
    : Buffer.from(event.body || '', 'utf8');
}

function signatureOk(raw, header, secret) {
  if (!header) return false;
  const mine = crypto.createHmac('sha256', secret).update(raw).digest();
  let theirs;
  try { theirs = Buffer.from(header, 'base64'); } catch { return false; }
  if (theirs.length !== mine.length) return false;
  return crypto.timingSafeEqual(mine, theirs);
}

async function sb(path, opts = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
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

/* Which shop this order belongs to.
 *
 * Shopify names the store it came from on every webhook, and each tenant
 * records its own storefront domain, so the two match up without us having to
 * be told. An order we can't place is refused rather than filed under whoever
 * happens to be first — putting one shop's customer on another shop's list is
 * worse than making Shopify retry.
 */
async function tenantForShop(domain) {
  const d = String(domain || '').toLowerCase().trim();
  if (!d) return null;
  const rows = await sb(
    `tenants?shop->>domain=eq.${encodeURIComponent(d)}&active=is.true&select=slug`
  );
  return (rows && rows[0] && rows[0].slug) || null;
}

/* Line-item properties are where a customer's own work rides along —
   the sticker builder attaches "Print file" to the line it adds to the cart. */
const FILE_KEYS = /^(print file|design|artwork|art file|proof)$/i;

function artworkFrom(order) {
  const found = [];
  (order.line_items || []).forEach(li => {
    (li.properties || []).forEach(p => {
      if (p && FILE_KEYS.test(String(p.name || '')) && /^https?:\/\//.test(String(p.value || ''))) {
        found.push({ item: li.title || li.name || 'item', url: String(p.value) });
      }
    });
  });
  return found;
}

function detailsFrom(order) {
  const lines = [];
  (order.line_items || []).forEach(li => {
    const bits = (li.properties || [])
      .filter(p => p && p.name && !FILE_KEYS.test(String(p.name)))
      .map(p => `${p.name}: ${p.value}`);
    lines.push(`${li.quantity} × ${li.title || li.name}${bits.length ? ' (' + bits.join(', ') + ')' : ''}`);
  });
  return lines;
}

/* OmniFlow only accepts these four, so decide honestly and send anything
   doubtful to review rather than guessing it into the wrong bucket. */
function classify(order, units) {
  const addr = order.shipping_address || order.billing_address;
  if (!addr || !(order.email || order.contact_email)) return 'Requires Review';
  if (units >= 12) return 'B2B Wholesale';
  const shipping = (order.shipping_lines || []).map(s => s.title || '').join(' ');
  if (/express|expedit|rush|overnight|next.?day/i.test(shipping)) return 'Expedited';
  return 'DTC Standard';
}

function addressText(a) {
  if (!a) return null;
  return [
    [a.first_name, a.last_name].filter(Boolean).join(' '),
    a.company, a.address1, a.address2,
    [a.city, a.province_code || a.province, a.zip].filter(Boolean).join(' '),
    a.country_code || a.country,
    a.phone,
  ].filter(Boolean).join('\n');
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Method not allowed' });

  const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
  if (!secret || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    // Fail closed and say which piece is missing — but never accept the order.
    return json(500, { ok: false, error: 'Not configured: needs SHOPIFY_WEBHOOK_SECRET, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.' });
  }

  const raw = rawBody(event);
  const headers = event.headers || {};
  const sig = headers['x-shopify-hmac-sha256'] || headers['X-Shopify-Hmac-Sha256'];
  if (!signatureOk(raw, sig, secret)) return json(401, { ok: false, error: 'Bad signature' });

  let order;
  try { order = JSON.parse(raw.toString('utf8')); } catch { return json(400, { ok: false, error: 'Invalid payload' }); }
  if (!order || !order.id) return json(400, { ok: false, error: 'Not an order' });

  const shopDomain = headers['x-shopify-shop-domain'] || headers['X-Shopify-Shop-Domain'];
  let tenantSlug;
  try {
    tenantSlug = await tenantForShop(shopDomain);
  } catch (e) {
    return json(502, { ok: false, error: String(e.message || e) });
  }
  if (!tenantSlug) {
    // 404, not 200: Shopify keeps retrying, which is what we want while the
    // storefront's domain is being filled in on its tenant record.
    return json(404, { ok: false, error: 'No shop on this platform matches ' + (shopDomain || 'that store') });
  }

  const items = order.line_items || [];
  const units = items.reduce((n, li) => n + (Number(li.quantity) || 0), 0);
  const art = artworkFrom(order);
  const classification = classify(order, units);

  const shipTo = order.shipping_address || order.billing_address;
  const notes = [
    ...detailsFrom(order),
    ...(art.length ? ['', 'Print files:', ...art.map(a => `• ${a.item} — ${a.url}`)] : []),
    ...(order.note ? ['', 'Customer note: ' + order.note] : []),
  ].join('\n');

  const tags = [classification];
  if (art.length) tags.push('Has print file');
  if (items.some(li => /sticker/i.test(li.title || ''))) tags.push('UV Stickers');

  const row = {
    // Deterministic, and `uct` is unique — so a redelivered webhook updates the
    // same row instead of creating a second order.
    uct: 'UCT-SH-' + order.id,
    tenant_slug: tenantSlug,
    source: 'shopify',
    platform_order_no: order.name || ('#' + order.order_number),
    customer_name: order.customer
      ? [order.customer.first_name, order.customer.last_name].filter(Boolean).join(' ')
      : (shipTo ? [shipTo.first_name, shipTo.last_name].filter(Boolean).join(' ') : null),
    customer_email: order.email || order.contact_email || null,
    customer_location: shipTo ? [shipTo.city, shipTo.province_code || shipTo.province, shipTo.country_code].filter(Boolean).join(', ') : null,
    ship_address: addressText(shipTo),
    skus: items.length,
    units,
    total_value: Number(order.total_price) || 0,
    classification,
    status: 'pending',
    tags,
    notes,
    raw_platform_data: order,
  };

  try {
    await sb('omniflow_orders?on_conflict=uct', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(row),
    });
  } catch (e) {
    // Tell Shopify it failed so it retries, rather than losing the order quietly.
    return json(502, { ok: false, error: String(e.message || e) });
  }

  return json(200, { ok: true, uct: row.uct, classification, artwork: art.length });
};
