/**
 * stripe-order — a paid Stripe checkout becomes an order in the console.
 *
 * Stripe calls this the moment a checkout session is completed — a tool, an
 * art pack, or the first charge of a monthly one. Same shape as the Shopify
 * intake next door: check the message really came from Stripe, translate it,
 * put it on the list. Tool sales are the platform's own orders, so they land
 * under the owner tenant and show up in the same console as everything else.
 *
 * Netlify environment variables:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   STRIPE_WEBHOOK_SECRET   the signing secret Stripe shows when you create
 *                           the webhook endpoint. Without it we refuse
 *                           everything — an unsigned order endpoint means
 *                           anyone can write sales into your list.
 *
 * Point a Stripe webhook at /api/stripe-order for the event
 * `checkout.session.completed`. Re-delivery is safe: each session maps to one
 * `uct`, which is unique, so retries update the same row.
 */

const crypto = require('crypto');
const CATALOG = require('./_catalog');
const C = require('./_credits');

/* Which tenant owns tool-store sales. The store page is the platform selling
   its own tools, so its orders belong to the owner — not to any client shop. */
const STORE_TENANT = 'skrewu';

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

/* Stripe signs `${timestamp}.${raw body}`; the header carries both. A stale
   timestamp is refused too, so a captured request can't be replayed later. */
function signatureOk(raw, header, secret) {
  if (!header) return false;
  const parts = {};
  header.split(',').forEach((kv) => {
    const i = kv.indexOf('=');
    if (i > 0) parts[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
  });
  if (!parts.t || !parts.v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false;
  const mine = crypto.createHmac('sha256', secret).update(`${parts.t}.${raw}`).digest('hex');
  const a = Buffer.from(mine), b = Buffer.from(parts.v1);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* The same catalog checkout.js sells from, so the order names the product the
   way the store does. */
const productById = CATALOG.byId;

async function sb(pathPart, opts = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${url}/rest/v1/${pathPart}`, {
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
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Method not allowed' });

  const gone = missingEnv(['STRIPE_WEBHOOK_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  if (gone.length) {
    // Fail closed and say which piece is missing — but never accept the order.
    return json(500, { ok: false, error: 'Not configured: missing ' + gone.join(' and ') + ' in Netlify.' });
  }

  const raw = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf8')
    : (event.body || '');
  const headers = event.headers || {};
  const sig = headers['stripe-signature'] || headers['Stripe-Signature'];
  if (!signatureOk(raw, sig, process.env.STRIPE_WEBHOOK_SECRET)) {
    return json(401, { ok: false, error: 'Bad signature' });
  }

  let evt;
  try { evt = JSON.parse(raw); } catch { return json(400, { ok: false, error: 'Invalid payload' }); }

  // Only completed checkouts become orders. Anything else Stripe sends here is
  // acknowledged and ignored, so extra subscribed events never turn into rows.
  if (evt.type !== 'checkout.session.completed') return json(200, { ok: true, ignored: evt.type });

  const s = (evt.data && evt.data.object) || {};
  if (s.payment_status && s.payment_status !== 'paid') {
    return json(200, { ok: true, ignored: 'not paid yet' });
  }

  /* A credit top-up isn't an order to pull and ship — it's money becoming
     credits. Add them and stop; the ledger is the record, not the console.
     The pack's size is read from the database, never from the session, so a
     tampered checkout can't mint credits. */
  const meta = s.metadata || {};
  if (meta.credit_pack && meta.tenant_slug) {
    try {
      const pack = await C.packById(meta.credit_pack);
      if (!pack) return json(400, { ok: false, error: 'Unknown credit pack ' + meta.credit_pack });
      const wallet = await C.walletFor(String(meta.tenant_slug));
      const balance = await C.grant(
        wallet.id, pack.credits, 'purchase',
        `${Number(pack.credits).toLocaleString('en-US')} credits`, s.id,
      );
      return json(200, { ok: true, credited: pack.credits, balance });
    } catch (e) {
      // Report the failure so Stripe retries — money taken and no credits
      // given is the one outcome that must never be allowed to stand.
      return json(502, { ok: false, error: String(e.message || e) });
    }
  }

  const p = productById(meta.product_id);
  const name = (p && p.name) || 'Tool store purchase';
  const who = s.customer_details || {};
  const monthly = s.mode === 'subscription';

  const row = {
    uct: 'UCT-ST-' + s.id,
    tenant_slug: STORE_TENANT,
    source: 'direct_api',
    platform_order_no: s.id.slice(-8).toUpperCase(),
    customer_name: who.name || null,
    customer_email: who.email || s.customer_email || null,
    customer_location: (who.address && [who.address.city, who.address.state, who.address.country]
      .filter(Boolean).join(', ')) || null,
    skus: 1,
    units: 1,
    total_value: (Number(s.amount_total) || 0) / 100,
    classification: 'DTC Standard',
    status: 'pending',
    tags: ['Tool sale', monthly ? 'Monthly' : 'One-time'],
    notes: [
      `1 × ${name}${monthly ? ' (monthly)' : ''}`,
      '',
      'Deliver: set them up in the console and send their link.',
    ].join('\n'),
    raw_platform_data: s,
  };

  try {
    await sb('omniflow_orders?on_conflict=uct', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(row),
    });
  } catch (e) {
    // Tell Stripe it failed so it retries, rather than losing the sale quietly.
    return json(502, { ok: false, error: String(e.message || e) });
  }

  return json(200, { ok: true, uct: row.uct });
};
